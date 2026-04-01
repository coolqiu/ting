import { useState, useEffect, useRef, useCallback, Fragment, useMemo, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useToast } from "../components/Toast";
import { PlaybackMode, ABSegment, WordTimestamp, PlaybackInfo, LearningMaterial } from "../types";
import levenshtein from "fast-levenshtein";
import { resolveAndArchiveAudio } from "../utils/audioLoader";

const TranscriptLine = memo(({
    line,
    isActive,
    onWordClick,
}: {
    line: { text: string; start: number; end: number; words: WordTimestamp[] };
    isActive: boolean;
    onWordClick: (pos: number) => void;
}) => {
    return (
        <p
            id={isActive ? "active-transcript-line" : undefined}
            className={`transcript-line ${isActive ? 'active-line' : ''}`}
            style={{
                fontWeight: isActive ? 700 : 400,
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                marginBottom: '16px',
                lineHeight: '1.6',
                transition: 'color 0.2s, font-weight 0.2s',
            }}
        >
            <span
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2px 8px',
                    marginRight: '8px',
                    marginTop: '2px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: isActive ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: isActive ? 'white' : 'var(--text-muted)',
                    transition: 'all 0.2s',
                    cursor: 'pointer',
                    userSelect: 'none' /* Don't select the timestamp */
                }}
                onClick={() => onWordClick(line.start / 1000)}
                title="Click to seek"
            >
                {formatTime(line.start / 1000)}
            </span>
            <span style={{ userSelect: 'text' }}>
                {line.words.map((w, i) => {
                    return (
                        <Fragment key={i}>
                            <span
                                className="transcript-word"
                                data-start={w.start_ms}
                                data-end={w.end_ms}
                                onClick={() => {
                                    // Make sure they aren't trying to select text while clicking
                                    const sel = window.getSelection();
                                    if (!sel || sel.isCollapsed) {
                                        onWordClick(w.start_ms / 1000);
                                    }
                                }}
                                style={{
                                    display: "inline", /* Acts like text */
                                    cursor: "pointer",
                                    padding: "2px 0px",
                                    borderRadius: "4px",
                                    WebkitTouchCallout: "default", /* Explicitly allow for selection handles */
                                    userSelect: "text"
                                }}
                            >
                                {w.word}
                            </span>
                            {" "}
                        </Fragment>
                    );
                })}
            </span>
        </p>
    );
});

function formatTime(secs: number): string {

    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function generateId(): string {
    return Math.random().toString(36).substring(2, 9);
}

interface SelectionPopup {
    x: number;
    y: number;
    text: string;
    start: number;
    end: number;
    translatedText?: string;
    isTranslating?: boolean;
}

const SPEED_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

function WaveformBars({ isPlaying }: { isPlaying: boolean }) {
    const barCount = 40;
    const bars = Array.from({ length: barCount }, (_, i) => {
        const height = 20 + Math.random() * 80;
        const delay = (i * 0.05).toFixed(2);
        return (
            <div
                key={i}
                className={`waveform-bar ${isPlaying ? "active" : ""}`}
                style={{
                    height: isPlaying ? `${height}%` : "20%",
                    animationDelay: `${delay}s`,
                    transition: `height ${isPlaying ? "0.3s" : "0.6s"} ease`,
                }}
            />
        );
    });
    return <div className="waveform-bars">{bars}</div>;
}

export default function StudyWorkspace() {
    const { t, i18n } = useTranslation();
    const { success: toastSuccess, error: toastError } = useToast();
    const navigate = useNavigate();
    const [playback, setPlayback] = useState<PlaybackInfo | null>(null);
    const [selectionPopup, setSelectionPopup] = useState<SelectionPopup | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [position, setPosition] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1.0);
    const [speed, setSpeed] = useState(1.0);
    const [currentMaterial, setCurrentMaterial] = useState<LearningMaterial | null>(null);
    const [tempA, setTempA] = useState<number | null>(null);

    // Right sidebar tab state
    const [activeTab, setActiveTab] = useState<'segments' | 'transcript' | 'dictation'>(() => {
        const saved = sessionStorage.getItem('study_activeTab');
        console.log("[Persistence] Initializing activeTab from sessionStorage:", saved);
        return (saved as any) || 'segments';
    });

    useEffect(() => {
        console.log("[Persistence] Saving activeTab to sessionStorage:", activeTab);
        sessionStorage.setItem('study_activeTab', activeTab);
    }, [activeTab]);

    // Dictation state
    const [dictationInput, setDictationInput] = useState("");
    const [dictationFeedback, setDictationFeedback] = useState<{ score: number, diff: string } | null>(null);
    const [dictationStartTime, setDictationStartTime] = useState<number>(0);

    // AI Model State
    const [modelExists, setModelExists] = useState<boolean>(true);
    const [isDownloading, setIsDownloading] = useState<boolean>(false);
    const [downloadProgress, setDownloadProgress] = useState<{ downloaded: number; total: number } | null>(null);

    // Transcript state
    const [words, setWords] = useState<WordTimestamp[]>([]);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [transcribeProgress, setTranscribeProgress] = useState(0);
    const [currentFileTranscribing, setCurrentFileTranscribing] = useState<string | null>(null);

    const progressRef = useRef<HTMLDivElement>(null);
    const transcriptContainerRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<number | null>(null);

    // Progress restoration state
    const [resumeData, setResumeData] = useState<any | null>(null);
    const lastSavedRef = useRef<{ materialId: number, position: number, time: number }>({ materialId: 0, position: 0, time: 0 });
    const playbackRef = useRef<PlaybackInfo | null>(null); // Use ref for stable save function
    const hasCheckedAutoLoad = useRef(false);
    const [isInitialCheck, setIsInitialCheck] = useState(true);


    // Sync ref
    useEffect(() => { playbackRef.current = playback; }, [playback]);

    // Fetch full material when playback material_id changes to sync UI properties like title
    useEffect(() => {
        if (playback?.material_id) {
            invoke<LearningMaterial>("get_material", { id: playback.material_id })
                .then(mat => setCurrentMaterial(mat))
                .catch(err => {
                    console.error("Failed to fetch current material:", err);
                    setCurrentMaterial(null);
                });
        } else {
            setCurrentMaterial(null);
        }
    }, [playback?.material_id]);

    // Poll playback state
    const pollState = useCallback(async () => {
        try {
            const state = await invoke<PlaybackInfo>("get_playback_state");
            if (state && state.file_path !== "") {
                setPlayback(state);
                setPosition(state.position_secs);
                setDuration(state.duration_secs);
                setIsPlaying(state.is_playing);
                setSpeed(prev => prev !== state.speed ? state.speed : prev);
                setVolume(prev => prev !== state.volume ? state.volume : prev);
                setIsInitialCheck(false);
            } else {
                setPlayback(null);
                // Auto-load logic if backend is idle
                if (!hasCheckedAutoLoad.current) {
                    hasCheckedAutoLoad.current = true;
                    console.log("[Auto-load] Backend idle, checking library...");
                    try {
                        const materials = await invoke<LearningMaterial[]>("get_recent_materials");
                        if (materials && materials.length > 0) {
                            const latest = materials[0];
                            console.log("[Auto-load] Found recent material, loading:", latest.title);
                            const info = await invoke<PlaybackInfo>("load_audio", { path: latest.source_url });
                            await invoke("set_material_id", { id: latest.id });
                            setPlayback({ ...info, material_id: latest.id });
                            setDuration(info.duration_secs);
                            setPosition(0);
                            // Also check for saved progress (segments, position, etc.)
                            await checkAndLoadProgress(latest.id, true);
                        }
                    } catch (e) {
                        console.warn("[Auto-load] Failed to auto-load latest material:", e);
                    } finally {
                        setIsInitialCheck(false);
                    }
                } else {
                    setIsInitialCheck(false);
                }
            }
        } catch {
            setIsInitialCheck(false);
        }
    }, []);

    // Initial load check
    useEffect(() => {
        pollState();
    }, [pollState]);

    // When coming from LibraryView "继续学习", show the progress dialog
    useEffect(() => {
        // Read from sessionStorage to avoid location.state race conditions and navigation loops
        const pending = sessionStorage.getItem('pending_resume_material');
        if (!pending) return;

        const materialId = parseInt(pending);
        console.log("[Progress] Found pending resume from session:", materialId);

        // CLEAR IMMEDIATELY in session, which doesn't trigger a re-render
        sessionStorage.removeItem('pending_resume_material');

        const t = setTimeout(() => {
            checkAndLoadProgress(materialId, false, true); // forceShow=true
        }, 600);
        return () => clearTimeout(t);
    }, []); // Run ONLY on mount

    // Restore transcript scroll position
    useEffect(() => {
        if (activeTab === 'transcript' && words.length > 0 && transcriptContainerRef.current && playback?.material_id) {
            const savedScroll = sessionStorage.getItem(`transcript_scroll_${playback.material_id}`);
            if (savedScroll) {
                console.log(`[Persistence] Restoring transcript scroll for ${playback.material_id}:`, savedScroll);
                transcriptContainerRef.current.scrollTop = parseInt(savedScroll);
            }
        }
    }, [activeTab, words.length, playback?.material_id]);

    // Save scroll on unmount or tab change
    useEffect(() => {
        return () => {
            if (transcriptContainerRef.current && playbackRef.current?.material_id) {
                sessionStorage.setItem(
                    `transcript_scroll_${playbackRef.current.material_id}`,
                    transcriptContainerRef.current.scrollTop.toString()
                );
            }
        };
    }, []);


    async function checkAndLoadProgress(materialId: number, autoResume: boolean = false, forceShow: boolean = false) {
        console.log(`[Progress] Checking progress for material: ${materialId}, autoResume=${autoResume}, forceShow=${forceShow}`);
        try {
            const progress = await invoke<any>("get_material_progress", { materialId: materialId });
            console.log("[Progress] Fetched result:", progress);

            if (progress && progress.position_secs > 5) {
                if (autoResume) {
                    console.log("[Progress] Auto-resuming for auto-load...");
                    applyProgress(progress);
                } else if (forceShow) {
                    // Always show when explicitly requested (e.g. from LibraryView)
                    console.log("[Progress] Force showing resume dialog at", progress.position_secs);
                    setResumeData(progress);
                } else {
                    // Suppression: If we are already near this position, don't prompt
                    const currentPos = playbackRef.current?.position_secs || 0;
                    const diff = Math.abs(currentPos - progress.position_secs);
                    if (diff < 10) {
                        console.log("[Progress] Not prompting: near saved position (diff:", diff, ")");
                        // Only clear if dialog is NOT already showing
                        setResumeData((prev: any) => prev ? prev : null);
                    } else {
                        setResumeData(progress);
                        console.log("[Progress] Prompting to resume from", progress.position_secs);
                    }
                }
            } else if (progress && progress.segments && progress.segments.length > 0) {
                if (autoResume) {
                    console.log("[Progress] Auto-loading segments only...");
                    applyProgress(progress);
                } else {
                    setResumeData((prev: any) => prev ?? progress); // Don't overwrite if already showing
                }
            } else {
                console.log("[Progress] No saved progress found or position <= 5s");
                // Only clear if dialog is NOT already showing (don't dismiss user-facing dialog)
                if (!forceShow) {
                    setResumeData((prev: any) => prev ? prev : null);
                }
            }
            lastSavedRef.current = { materialId, position: 0, time: Date.now() };
        } catch (e) {
            console.error("[Progress] Failed to check progress:", e);
        }
    }


    const applyProgress = async (data: any) => {
        console.log("[Progress] Applying stored data:", data.position_secs, "segments:", data.segments?.length);
        // Close dialog first so user sees immediate feedback
        setResumeData(null);
        try {
            if (data.position_secs > 0) {
                await invoke("seek", { positionSecs: data.position_secs }).catch(e => console.warn("seek failed:", e));
            }
            await invoke("set_volume", { volume: data.volume }).catch(() => { });
            await invoke("set_speed", { speed: data.speed }).catch(() => { });
            await invoke("set_mode", { mode: data.mode }).catch(() => { });
            setVolume(data.volume);
            setSpeed(data.speed);

            // Restore segments if any
            if (data.segments && data.segments.length > 0) {
                for (const seg of data.segments) {
                    await invoke("add_segment", { segment: seg }).catch(() => { });
                }
            }

            if (data.active_segment_id) {
                await invoke("set_active_segment", { id: data.active_segment_id }).catch(() => { });
            }
        } catch (e) {
            console.error("[Progress] Apply failed:", e);
        }
    };

    const handleResumeProgress = async () => {
        if (!resumeData) return;
        await applyProgress(resumeData);
    };

    const saveProgress = useCallback(async () => {
        const pb = playbackRef.current;
        if (!pb?.material_id || resumeData) return; // DON'T save if we haven't decided to resume yet!

        try {
            const data = {
                material_id: pb.material_id,
                position_secs: pb.position_secs,
                volume: pb.volume,
                speed: pb.speed,
                mode: pb.mode,
                segments: pb.segments.map(s => ({
                    id: s.id,
                    start_secs: s.start_secs,
                    end_secs: s.end_secs,
                    loop_count: s.loop_count
                })),
                active_segment_id: pb.active_segment_id,
                updated_at: null
            };
            await invoke("save_material_progress", { progress: data });
            lastSavedRef.current = {
                materialId: pb.material_id,
                position: pb.position_secs,
                time: Date.now()
            };
        } catch (e) {
            toastError("Failed to save progress");
            console.error(e);
        }
    }, [resumeData]); // Only depends on resumeData state now

    // Auto-save progress every 10 seconds + Save on unmount
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            if (now - lastSavedRef.current.time > 10000) {
                saveProgress();
            }
        }, 5000);

        return () => {
            clearInterval(interval);
            // Save one last time on cleanup
            saveProgress();
        };
    }, [saveProgress]);

    useEffect(() => {
        if (playback) {
            pollRef.current = window.setInterval(pollState, 150);
        }
        return () => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
            }
        };
    }, [playback, pollState]);

    // Check model and listen to download progress
    useEffect(() => {
        async function checkModel() {
            try {
                const exists = await invoke<boolean>("check_model_exists");
                setModelExists(exists);
            } catch (e) {
                toastError("Failed to check model");
                console.error(e);
            }
        }
        checkModel();

        const unlistenModel = listen<{ downloaded: number; total: number }>("model-download-progress", (event) => {
            setDownloadProgress(event.payload);
            if (event.payload.downloaded >= event.payload.total && event.payload.total > 0) {
                setIsDownloading(false);
                setModelExists(true);
                toastSuccess(t("common.success"));
            }
        });

        const unlistenProgress = listen<number>("transcribe-progress", (event) => {
            setTranscribeProgress(event.payload);
        });

        return () => {
            unlistenModel.then((fn) => fn());
            unlistenProgress.then((fn) => fn());
        };
    }, []);

    const handleDownloadModel = async () => {
        setIsDownloading(true);
        setDownloadProgress({ downloaded: 0, total: 100 }); // placeholder until first event
        try {
            await invoke("download_default_model");
            setModelExists(true);
        } catch (e) {
            console.error("Failed to download model:", e);
            alert(t("common.error") + ": " + e);
        } finally {
            setIsDownloading(false);
        }
    };

    // Auto-scroll transcript
    useEffect(() => {
        if (activeTab === 'transcript' && isPlaying) {
            const activeLine = document.getElementById("active-transcript-line");
            if (activeLine) {
                // Rely on native browser smooth scrolling to center the active line
                activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [playback?.position_secs, activeTab, isPlaying]);

    // Transcription trigger
    const startTranscription = useCallback((force = false) => {
        if (!playback?.file_path) return;

        // If not forcing, don't re-run if we are already transcribing this file
        if (!force && currentFileTranscribing === playback.file_path) return;

        setCurrentFileTranscribing(playback.file_path);
        setIsTranscribing(true);
        setTranscribeProgress(0);
        setWords([]);

        invoke<WordTimestamp[]>("transcribe_audio", { path: playback.file_path, forceRefresh: force })
            .then((result) => {
                setWords(result);
            })
            .catch((e) => {
                console.error("Transcription failed", e);
                toastError(t("common.error"));
            })
            .finally(() => {
                setIsTranscribing(false);
            });
    }, [playback?.file_path, currentFileTranscribing, t]);

    useEffect(() => {
        if (modelExists && playback?.file_path && currentFileTranscribing !== playback.file_path) {
            startTranscription();
        }
    }, [modelExists, playback?.file_path, currentFileTranscribing, startTranscription]);

    // Track Dictation Start Time
    useEffect(() => {
        if (activeTab === 'dictation' && playback?.active_segment_id) {
            setDictationStartTime(Date.now());
            setDictationInput("");
            setDictationFeedback(null);
        }
    }, [activeTab, playback?.active_segment_id]);

    // Group words into lines for efficient rendering
    const transcriptLines = useMemo(() => {
        // Step 1: Filter out repetitive hallucinations (single words and sequences)
        let filteredWords: WordTimestamp[] = [];
        let duplicateCount = 0;

        for (let i = 0; i < words.length; i++) {
            const currentWText = words[i].word.trim().toLowerCase().replace(/[.,!?。！？]/g, '');
            if (i > 0) {
                const prevWText = words[i - 1].word.trim().toLowerCase().replace(/[.,!?。！？]/g, '');
                if (currentWText === prevWText) {
                    duplicateCount++;
                } else {
                    duplicateCount = 0;
                }
            } else {
                duplicateCount = 0;
            }
            if (duplicateCount < 2) {
                filteredWords.push(words[i]);
            }
        }

        // Sequence deduplication (N-gram detector)
        // This stops massive repeating phrases like "The Queen's house..."
        const cleanWords: WordTimestamp[] = [];
        const maxSeqLen = 20; // Maximum sequence length to check
        let filteredCount = 0;

        for (let i = 0; i < filteredWords.length; i++) {
            let isSeqDuplicate = false;

            // Check for repeating sequences of length len starting at i
            // We only collapse if the gap between sequences is < 5000ms (5 seconds)
            // Increased min seq length to 4 for more safety
            for (let len = 4; len <= maxSeqLen; len++) {
                if (i >= len && i + len <= filteredWords.length) {
                    const prevSeqEndMs = filteredWords[i - 1].end_ms;
                    const currentSeqStartMs = filteredWords[i].start_ms;
                    const gapBetweenSeqs = currentSeqStartMs - prevSeqEndMs;

                    if (gapBetweenSeqs < 5000) {
                        let match = true;
                        for (let k = 0; k < len; k++) {
                            const wordA = filteredWords[i - len + k].word.trim().toLowerCase().replace(/[.,!?。！？]/g, '');
                            const wordB = filteredWords[i + k].word.trim().toLowerCase().replace(/[.,!?。！？]/g, '');
                            if (wordA !== wordB) {
                                match = false;
                                break;
                            }
                        }
                        if (match) {
                            isSeqDuplicate = true;
                            filteredCount += len;
                            // Skip the entire sequence length
                            i += (len - 1);
                            break;
                        }
                    }
                }
            }

            if (!isSeqDuplicate) {
                cleanWords.push(filteredWords[i]);
            }
        }

        if (filteredCount > 0) {
            console.log(`[Transcript] Safely filtered ${filteredCount} hallucinated repeating words.`);
        }

        // Step 2: Group clean words into lines
        const lines: { text: string; start: number; end: number; words: WordTimestamp[] }[] = [];
        let currentLine: WordTimestamp[] = [];

        for (let i = 0; i < cleanWords.length; i++) {
            currentLine.push(cleanWords[i]);
            const w = cleanWords[i].word.trim();
            const wLower = w.toLowerCase();
            const isAbbreviation = ["mr.", "mrs.", "ms.", "dr.", "prof.", "st.", "vs.", "etc."].includes(wLower);
            const isEndPunctuation = /[.!?。！？]$/.test(w) && !isAbbreviation;

            let gapToNext = 0;
            if (i < cleanWords.length - 1) {
                gapToNext = cleanWords[i + 1].start_ms - cleanWords[i].end_ms;
            }

            const isBigGap = gapToNext > 800;
            const isLineTooLong = currentLine.length > 20;

            const shouldBreak = (isEndPunctuation && (gapToNext > 250 || isLineTooLong)) || isBigGap || i === cleanWords.length - 1;

            if (shouldBreak) {
                if (currentLine.length > 0) {
                    lines.push({
                        text: currentLine.map(x => x.word).join(" "),
                        start: currentLine[0].start_ms,
                        end: currentLine[currentLine.length - 1].end_ms,
                        words: currentLine
                    });
                }
                currentLine = [];
            }
        }
        return lines;
    }, [words]);

    // Submit Dictation
    const handleSubmitDictation = async () => {
        if (!playback || !playback.active_segment_id) return;

        const activeSegment = playback.segments.find(s => s.id === playback.active_segment_id);
        if (!activeSegment) return;

        const timeSpentMs = Date.now() - dictationStartTime;

        // Find transcript words in this segment
        const segmentWords = words.filter(w =>
            w.start_ms / 1000 >= activeSegment.start_secs &&
            w.end_ms / 1000 <= activeSegment.end_secs
        ).map(w => w.word).join(" ");

        const originalText = segmentWords.trim() || "";

        if (dictationInput.trim().length === 0) return;

        // Clean up punctuation and convert to lowercase for softer comparison
        const normalize = (str: string) => str.toLowerCase().replace(/[.,!?;:'"()]/g, "").trim().replace(/\s+/g, " ");

        const normInput = normalize(dictationInput);
        const normOrig = normalize(originalText);

        let finalScore = 0;

        if (normOrig.length === 0) {
            // Nothing to transcribe?
            finalScore = 100;
        } else {
            const distance = levenshtein.get(normOrig, normInput);
            const maxLength = Math.max(normOrig.length, normInput.length);

            // Score from 0 to 100
            finalScore = Math.max(0, Math.round((1 - distance / maxLength) * 100));
        }

        setDictationFeedback({
            score: finalScore,
            diff: `Original: ${originalText || t("workspace_v2.dictation_no_transcript")}`
        });

        // Submit to backend
        if (playback.material_id) {
            try {
                await invoke("submit_dictation_score", {
                    materialId: playback.material_id,
                    startMs: Math.round(activeSegment.start_secs * 1000),
                    endMs: Math.round(activeSegment.end_secs * 1000),
                    originalText: originalText,
                    userInput: dictationInput,
                    score: finalScore,
                    timeSpentMs: timeSpentMs
                });
            } catch (e) {
                console.error("Failed to submit score:", e);
            }
        }
    };

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!playback) return;
            // Don't intercept space for playback when typing in dictation
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                // Allow submitting via Ctrl+Enter
                if ((e.ctrlKey || e.metaKey) && e.code === "Enter") {
                    e.preventDefault();
                    if (activeTab === 'dictation') {
                        handleSubmitDictation();
                    }
                }
                return;
            }

            switch (e.code) {
                case "Space":
                    e.preventDefault();
                    handlePlayPause();
                    break;
                case "ArrowLeft":
                    e.preventDefault();
                    handleSkip(-5);
                    break;
                case "ArrowRight":
                    e.preventDefault();
                    handleSkip(5);
                    break;
                case "KeyA":
                    if (!e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        handleMarkA();
                    }
                    break;
                case "KeyB":
                    if (!e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        handleMarkB();
                    }
                    break;
                case "Escape":
                    e.preventDefault();
                    setTempA(null);
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    });

    // Open file dialog
    const handleOpenFile = async () => {
        const selected = await open({
            multiple: false,
            filters: [
                {
                    name: "Audio Files",
                    extensions: ["mp3", "wav", "flac", "ogg", "m4a", "aac", "wma"],
                },
            ],
        });
        if (selected) {
            const selectedPath = typeof selected === 'string' ? selected : selected[0];
            const fileName = (selectedPath.split('/').pop() || selectedPath.split('\\').pop() || 'unknown.wav').split('?')[0];

            try {
                const finalPath = await resolveAndArchiveAudio(selectedPath, fileName);
                const info = await invoke<PlaybackInfo>("load_audio", {
                    path: finalPath,
                });
                
                const file = new File([new Blob()], fileName);

                const materialId: number = await invoke("add_or_update_material", {
                    title: file.name,
                    sourceUrl: finalPath,
                    durationMs: info.duration_secs * 1000
                });
                setPlayback({ ...info, material_id: materialId });
                setDuration(info.duration_secs);
                setPosition(0);
                setIsPlaying(false);
                setSpeed(1.0);
                setTempA(null);
            } catch (e) {
                console.error("Failed to load audio:", e);
            }
        }
    };

    // Playback controls
    const handlePlayPause = async () => {
        if (!playback) return;
        try {
            if (isPlaying) {
                await invoke("pause");
                setIsPlaying(false);
            } else {
                // If we are at the end, start over
                if (position >= duration - 0.2) {
                    await invoke("seek", { positionSecs: 0 });
                    await invoke("play");
                } else if (position === 0) {
                    await invoke("play");
                } else {
                    await invoke("resume");
                }
                setIsPlaying(true);
            }
        } catch (e) {
            try {
                await invoke("play");
                setIsPlaying(true);
            } catch {
                console.error("Playback error:", e);
            }
        }
    };

    const handleStop = async () => {
        try {
            await invoke("stop");
            setIsPlaying(false);
            setPosition(0);
        } catch (e) {
            console.error("Stop error:", e);
        }
    };

    // Seek on progress bar click
    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!progressRef.current || duration <= 0) return;
        const rect = progressRef.current.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const newPos = ratio * duration;
        setPosition(newPos);
        invoke("seek", { positionSecs: newPos }).catch(console.error);
    };

    // Volume change
    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const vol = parseFloat(e.target.value);
        setVolume(vol);
        invoke("set_volume", { volume: vol }).catch(console.error);
    };

    // Speed change
    const handleSpeedChange = async (newSpeed: number) => {
        setSpeed(newSpeed);
        try {
            await invoke("set_speed", { speed: newSpeed });
        } catch (e) {
            console.error("Speed error:", e);
        }
    };

    // Rewind/Forward 5s
    const handleSkip = async (deltaSecs: number) => {
        const newPos = Math.max(0, Math.min(duration, position + deltaSecs));
        setPosition(newPos);
        try {
            await invoke("seek", { positionSecs: newPos });
        } catch (e) {
            console.error("Seek error:", e);
        }
    };

    // Multi-AB Loop creation
    const handleMarkA = () => {
        setTempA(position);
    };

    const handleMarkB = async () => {
        if (tempA === null) return;
        const a = Math.min(tempA, position);
        const b = Math.max(tempA, position);

        // Prevent zero-length loop
        if (b - a < 0.1) return;

        try {
            await invoke("add_segment", {
                segment: {
                    id: generateId(),
                    start_secs: a,
                    end_secs: b,
                    loop_count: 0 // Default Infinite
                }
            });
            setTempA(null);
            // Sync and save immediately
            await pollState();
            saveProgress();
        } catch (e) {
            console.error("Failed to add segment:", e);
        }
    };

    // Multi-AB Management
    const handleSetMode = async (mode: PlaybackMode) => {
        try {
            await invoke("set_mode", { mode });
        } catch (e) {
            console.error("Set mode error:", e);
        }
    };

    const handleRemoveSegment = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await invoke("remove_segment", { id });
            // Sync and save immediately
            await pollState();
            saveProgress();
        } catch (err) {
            console.error("Remove segment error:", err);
        }
    };

    const handleUpdateSegmentLoops = async (segment: ABSegment, delta: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const newCount = Math.max(0, segment.loop_count + delta);
        try {
            await invoke("update_segment", {
                segment: { ...segment, loop_count: newCount }
            });
            // Sync and save immediately
            await pollState();
            saveProgress();
        } catch (err) {
            console.error("Update segment error:", err);
        }
    };

    const handleSelectSegment = async (id: string) => {
        try {
            await invoke("set_active_segment", { id });

            // Auto-switch to single loop if in global mode to hear it immediately
            if (playback?.mode === PlaybackMode.Global) {
                await invoke("set_mode", { mode: PlaybackMode.SingleLoop });
            }
        } catch (err) {
            console.error("Select segment error:", err);
        }
    };

    const activeLineIdx = useMemo(() => {
        return transcriptLines.findIndex(line => position >= line.start / 1000 && position <= (line.end / 1000) + 0.5);
    }, [transcriptLines, position]);

    const handleSeekTo = useCallback((pos: number) => {
        setPosition(pos);
        invoke("seek", { positionSecs: pos });
    }, []);

    // Global selection listener for capturing native text selection (both desktop and mobile!)
    useEffect(() => {
        let timeout: any = null;
        
        const handleSelectionChange = () => {
            if (timeout) clearTimeout(timeout);
            
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
                // If selection is cleared, immediately hide the popup
                setSelectionPopup(null);
                return;
            }

            // Debounce the popup display until they stop dragging handles
            timeout = setTimeout(() => {
                // Check if the selection was cleared since the timeout started
                const currentSel = window.getSelection();
                if (!currentSel || currentSel.isCollapsed || currentSel.rangeCount === 0) return;

                const range = currentSel.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                
                // Ensure rect is valid (sometimes getBoundingClientRect returns 0,0 for whitespace across lines)
                if (rect.width === 0 || rect.height === 0) return;

                // Find the word nodes
                const startNode = range.startContainer;
                const endNode = range.endContainer;
                
                const startEl = startNode.nodeType === 3 ? startNode.parentElement : startNode as HTMLElement;
                const endEl = endNode.nodeType === 3 ? endNode.parentElement : endNode as HTMLElement;

                const closestStart = startEl?.closest('.transcript-word') as HTMLElement;
                const closestEnd = endEl?.closest('.transcript-word') as HTMLElement;

                if (closestStart && closestEnd) {
                    const sMs = parseInt(closestStart.dataset.start || "0", 10);
                    const eMs = parseInt(closestEnd.dataset.end || "0", 10);
                    const realStart = Math.min(sMs, eMs);
                    const realEnd = Math.max(sMs, eMs);
                    const text = currentSel.toString().trim();

                    if (text) {
                        setSelectionPopup({
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                            height: rect.height, // Captured for bottom positioning
                            text: text,
                            start: realStart,
                            end: realEnd
                        });
                        // Visual highlighting is already handled by native browser selection!
                        // No need to set selectedWordRange anymore!
                    }
                }
            }, 150); // Fast 150ms delay for native-like feedback
        };

        document.addEventListener('selectionchange', handleSelectionChange);
        return () => {
            document.removeEventListener('selectionchange', handleSelectionChange);
            if (timeout) clearTimeout(timeout);
        };
    }, []);

    const handleCopySelection = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectionPopup || !selectionPopup.text) return;
        try {
            await navigator.clipboard.writeText(selectionPopup.text);
            // Quick visual feedback
            setSelectionPopup(null);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    const handleShadowSelection = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectionPopup) return;
        if (!playback?.file_path) return;

        try {
            const data = {
                text: selectionPopup.text,
                audioPath: playback.file_path,
                startMs: selectionPopup.start,
                endMs: selectionPopup.end
            };
            await invoke("set_shadowing_override", data);
            setSelectionPopup(null);
            navigate("/speaking");
        } catch (err) {
            console.error("[Shadowing] Failed:", err);
        }
    };

    // Add the current transcript selection directly as an AB segment
    const handleAddSelectionAsSegment = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectionPopup) return;
        const seg: ABSegment = {
            id: generateId(),
            start_secs: selectionPopup.start / 1000,
            end_secs: selectionPopup.end / 1000,
            loop_count: 3,
        };
        try {
            await invoke("add_segment", { segment: seg });
            setSelectionPopup(null);
            setActiveTab('segments');
            await pollState();
            saveProgress();
        } catch (err) {
            console.error("[Segment] Failed:", err);
        }
    };

    const handleTranslateSelection = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectionPopup || !selectionPopup.text) return;

        setSelectionPopup({ ...selectionPopup, isTranslating: true, translatedText: undefined });

        try {
            const targetLang = i18n.language || "zh-CN";
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(selectionPopup.text)}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error("Translation failed");
            const data = await response.json();
            if (data && data[0]) {
                const translated = data[0].map((item: any) => item[0]).join("");
                setSelectionPopup(prev => prev ? { ...prev, translatedText: translated, isTranslating: false } : null);
            }
        } catch (err) {
            console.error("[Translate] Failed:", err);
            setSelectionPopup(prev => prev ? { ...prev, translatedText: "Error", isTranslating: false } : null);
        }
    };

    // Adjust a segment's start or end time by delta seconds
    const handleAdjustSegmentTime = async (seg: ABSegment, field: 'start' | 'end', delta: number, e: React.MouseEvent) => {
        e.stopPropagation();
        let newStart = seg.start_secs;
        let newEnd = seg.end_secs;
        if (field === 'start') {
            newStart = Math.max(0, seg.start_secs + delta);
            if (newStart >= newEnd) return;
        } else {
            newEnd = Math.max(0, seg.end_secs + delta);
            if (newEnd <= newStart) return;
        }
        const updated: ABSegment = { ...seg, start_secs: newStart, end_secs: newEnd };
        try {
            await invoke("update_segment", { segment: updated });
            await pollState();
            saveProgress();
        } catch (err) {
            console.error("[Segment] update failed:", err);
        }
    };

    const handleTranscriptScroll = () => {
        if (transcriptContainerRef.current && playbackRef.current?.material_id) {
            sessionStorage.setItem(
                `transcript_scroll_${playbackRef.current.material_id}`,
                transcriptContainerRef.current.scrollTop.toString()
            );
        }
    };

    const progressPercent = duration > 0 ? (position / duration) * 100 : 0;
    const tempAPercent = duration > 0 && tempA !== null ? (tempA / duration) * 100 : 0;
    const volumeIcon = volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊";
    const adjBtnStyle: React.CSSProperties = {
        border: "none", background: "transparent", color: "var(--text-secondary)",
        cursor: "pointer", padding: "0 3px", fontSize: "11px", lineHeight: 1,
    };

    return (
        <div 
            onClick={() => {
                // iPhone Guard: If there is an active selection range, do NOT close the popup.
                // This prevents the 'click' event that often follows a selection end on iOS from clearing the UI.
                const sel = window.getSelection();
                if (sel && !sel.isCollapsed) return;
                setSelectionPopup(null);
            }}
            /* Suppress native context menu while allowing selection handles (water drops) to appear */
            onContextMenu={(e) => e.preventDefault()}
            style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", position: "relative" }}
        >
            {/* Selection Popup - Build 63 Premium Horizontal Version */}
            {selectionPopup && (
                <div
                    className="selection-popup fade-in"
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                        position: "fixed",
                        left: selectionPopup.x,
                        top: selectionPopup.y + (selectionPopup.height || 40) + 12,
                        transform: "translateX(-50%)", // No translateY(-100%) anymore
                        zIndex: 10000,
                    }}
                >
                    <div style={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: "2px",
                        padding: "2px",
                        flexWrap: "nowrap",
                        overflowX: "auto",
                        maxWidth: "97vw",
                        scrollbarWidth: "none"
                    }}>
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={handleCopySelection}
                            title={String(t("common.copy"))}
                            style={{ padding: "8px 12px", minWidth: "44px", borderRadius: "12px", color: "#fff" }}
                        >
                            📋 <span style={{ marginLeft: "4px", fontSize: "12px", color: "#fff" }}>{window.innerWidth > 400 ? String(t("common.copy")) : "复制" }</span>
                        </button>
                        <div style={{ width: "1px", height: "20px", background: "rgba(255,255,255,0.2)", margin: "0 2px" }} />
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={handleShadowSelection}
                            style={{ padding: "8px 12px", borderRadius: "12px", color: "#fff", whiteSpace: "nowrap" }}
                        >
                            <span style={{ color: "#a29bfe" }}>🎧</span> <span style={{ marginLeft: "4px", fontSize: "12px", fontWeight: 500 }}>{window.innerWidth > 400 ? t("workspace_v2.shadow_selection") : "跟读" }</span>
                        </button>
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={handleAddSelectionAsSegment}
                            style={{ padding: "8px 12px", borderRadius: "12px", color: "#fff", whiteSpace: "nowrap" }}
                        >
                            <span style={{ color: "#fab1a0" }}>📌</span> <span style={{ marginLeft: "4px", fontSize: "12px", fontWeight: 500 }}>{window.innerWidth > 400 ? t("workspace_v2.add_selection_as_segment") : "复读" }</span>
                        </button>
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={handleTranslateSelection}
                            disabled={selectionPopup.isTranslating}
                            style={{ padding: "8px 12px", borderRadius: "12px", color: "#fff", whiteSpace: "nowrap" }}
                        >
                            <span style={{ color: "#81ecec" }}>🌍</span> <span style={{ marginLeft: "4px", fontSize: "12px", fontWeight: 500 }}>{selectionPopup.isTranslating ? "..." : (window.innerWidth > 400 ? t("workspace_v2.translate_selection") : "翻译") }</span>
                        </button>
                    </div>

                    {selectionPopup.translatedText && (
                        <div style={{
                            position: "absolute",
                            top: "calc(100% + 12px)",
                            left: "50%",
                            transform: "translateX(-50%)",
                            background: "rgba(45, 45, 60, 0.95)",
                            color: "var(--text-primary)",
                            padding: "16px 20px",
                            borderRadius: "16px",
                            fontSize: "15px",
                            boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
                            border: "1px solid rgba(255, 255, 255, 0.15)",
                            width: "max-content",
                            maxWidth: "85vw",
                            zIndex: 2001
                        }}>
                            {selectionPopup.translatedText}
                        </div>
                    )}
                </div>
            )}
            {/* Main content */}
            <div className="app-content" style={{ marginTop: "4px", flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {isInitialCheck ? (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div className="spinner" />
                    </div>
                ) : !playback ? (
                    /* Welcome screen */
                    <div className="welcome-container fade-in">
                        <div className="welcome-icon">🎧</div>
                        <div className="welcome-text">
                            <h2>{t("workspace_v2.study_mode")}</h2>
                            <p>{t("workspace_v2.welcome_desc")}</p>
                        </div>
                        <button className="btn btn-primary" onClick={handleOpenFile}>
                            📂 {t("workspace_v2.open_file")}
                        </button>
                        <div className="shortcuts-hint">
                            <p>{t("workspace_v2.shortcuts_hint")}</p>
                        </div>
                    </div>
                ) : (
                    /* Player */
                    <div className="main-workspace fade-in">
                        {/* Left side: Main Player */}
                        <div className="player-column">
                            {/* File info */}
                            <div className="player-info">
                                <div className="file-icon">🎵</div>
                                <div className="file-details">
                                    <div className="file-name" title={decodeURIComponent(currentMaterial?.title || playback.file_name)}>{decodeURIComponent(currentMaterial?.title || playback.file_name)}</div>
                                    <div className="file-meta">
                                        {duration > 0
                                            ? `${t("library.duration")} ${formatTime(duration)}`
                                            : t("common.loading")}
                                        {speed !== 1.0 && ` · ${speed}x`}
                                    </div>
                                </div>
                                <button className="btn btn-ghost" onClick={handleOpenFile}>
                                    📂 {t("workspace_v2.change_file")}
                                </button>
                            </div>

                            {/* Waveform visualization area */}
                            <div className="waveform-area">
                                <div className="waveform-placeholder">
                                    <WaveformBars isPlaying={isPlaying} />
                                    {!isPlaying && (
                                        <span style={{ fontSize: "12px", marginTop: "-4px" }}>
                                            {position > 0 ? t("workspace_v2.paused") : t("workspace_v2.ready_to_play")}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Controls */}
                            <div className="player-controls">
                                {/* Progress bar */}
                                <div className="progress-container">
                                    <span className="time-label">{formatTime(position)}</span>
                                    <div
                                        className="progress-bar-wrapper"
                                        ref={progressRef}
                                        onClick={handleProgressClick}
                                    >
                                        {/* Temp A marker */}
                                        {tempA !== null && (
                                            <div
                                                className="ab-marker ab-marker-a"
                                                style={{ left: `${tempAPercent}%` }}
                                            >
                                                A
                                            </div>
                                        )}

                                        {/* Render all saved segments */}
                                        {playback.segments.map((seg, idx) => {
                                            const startPct = (seg.start_secs / duration) * 100;
                                            const widthPct = ((seg.end_secs - seg.start_secs) / duration) * 100;
                                            const isActive = seg.id === playback.active_segment_id;

                                            return (
                                                <div key={seg.id}>
                                                    {/* Region highlight */}
                                                    <div
                                                        className={`ab-region ${isActive ? 'ab-region-active' : ''}`}
                                                        style={{
                                                            left: `${startPct}%`,
                                                            width: `${widthPct}%`,
                                                            background: isActive ? 'rgba(76, 175, 80, 0.4)' : 'rgba(255, 193, 7, 0.25)',
                                                        }}
                                                    />
                                                    {/* A marker */}
                                                    <div className="ab-marker ab-marker-a" style={{ left: `${startPct}%`, opacity: isActive ? 1 : 0.6 }}>
                                                        {idx + 1}A
                                                    </div>
                                                    {/* B marker */}
                                                    <div className="ab-marker ab-marker-b" style={{ left: `${startPct + widthPct}%`, opacity: isActive ? 1 : 0.6 }}>
                                                        {idx + 1}B
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        <div
                                            className="progress-bar-fill"
                                            style={{ width: `${progressPercent}%` }}
                                        />
                                    </div>
                                    <span className="time-label">{formatTime(duration)}</span>
                                </div>

                                {/* Bottom Controls Row flex layout */}
                                <div className="controls-bottom-row" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "24px" }}>

                                    {/* Left Panel: Transport and Speed */}
                                    <div className="transport-center" style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "12px", minWidth: "260px" }}>
                                        <div className="transport-main" style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                                            <div className="volume-control-inline" style={{ display: "flex", alignItems: "center", gap: "8px", marginRight: "4px" }}>
                                                <span style={{ fontSize: "16px", cursor: "pointer" }}>
                                                    {volumeIcon}
                                                </span>
                                                <input
                                                    type="range"
                                                    className="volume-slider"
                                                    min="0"
                                                    max="1"
                                                    step="0.01"
                                                    value={volume}
                                                    onChange={handleVolumeChange}
                                                    style={{ width: "60px" }}
                                                />
                                            </div>

                                            <button
                                                className="btn btn-icon btn-ghost tooltip"
                                                onClick={() => handleSkip(-5)}
                                                data-tooltip={`-5s (${t("help.shortcut_left")})`}
                                            >
                                                ⏪
                                            </button>

                                            <button
                                                className="btn-play"
                                                onClick={handlePlayPause}
                                                style={{ width: "48px", height: "48px" }}
                                            >
                                                {isPlaying ? "⏸" : "▶"}
                                            </button>

                                            <button
                                                className="btn btn-icon btn-ghost tooltip"
                                                onClick={() => handleSkip(5)}
                                                data-tooltip={`+5s (${t("help.shortcut_right")})`}
                                            >
                                                ⏩
                                            </button>

                                            <button
                                                className="btn btn-icon-sm btn-ghost tooltip"
                                                onClick={handleStop}
                                                data-tooltip={t("workspace_v2.stop_playback")}
                                            >
                                                ⏹
                                            </button>
                                        </div>

                                        <div className="speed-controls" style={{ marginTop: "0" }}>
                                            <div className="speed-buttons" style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                                                <span className="speed-label" style={{ marginRight: "8px", alignSelf: "center", fontSize: "12px", color: "var(--text-secondary)" }}>{t("workspace_v2.speed")}</span>
                                                {SPEED_PRESETS.map((s) => (
                                                    <button
                                                        key={s}
                                                        className={`btn btn-speed ${speed === s ? "btn-speed-active" : ""}`}
                                                        onClick={() => handleSpeedChange(s)}
                                                        style={{ padding: "4px 8px", fontSize: "12px" }}
                                                    >
                                                        {s}x
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right panel: Mode and AB markers */}
                                    <div className="ab-actions-right" style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-end", minWidth: "300px" }}>
                                        <div className="ab-mode-toggles" style={{ display: "flex", flexWrap: "wrap", gap: "4px", background: "var(--bg-tertiary)", borderRadius: "var(--radius-md)", padding: "4px", width: "100%" }}>
                                            <button
                                                className={`btn btn-sm ${playback.mode === PlaybackMode.Global ? "btn-primary" : "btn-ghost"}`}
                                                onClick={() => handleSetMode(PlaybackMode.Global)}
                                                style={{ flex: 1, border: "none", boxShadow: "none", fontSize: "13px", padding: "6px 8px", whiteSpace: "nowrap" }}
                                            >
                                                ▶ {t("workspace_v2.mode_global")}
                                            </button>
                                            <button
                                                className={`btn btn-sm ${playback.mode === PlaybackMode.SingleLoop ? "btn-primary" : "btn-ghost"}`}
                                                onClick={() => handleSetMode(PlaybackMode.SingleLoop)}
                                                disabled={playback.segments.length === 0}
                                                style={{ flex: 1, border: "none", boxShadow: "none", fontSize: "13px", padding: "6px 8px", whiteSpace: "nowrap" }}
                                            >
                                                🔁 {t("workspace_v2.mode_single")}
                                            </button>
                                            <button
                                                className={`btn btn-sm ${playback.mode === PlaybackMode.ListLoop ? "btn-primary" : "btn-ghost"}`}
                                                onClick={() => handleSetMode(PlaybackMode.ListLoop)}
                                                disabled={playback.segments.length < 2}
                                                style={{ flex: 1, border: "none", boxShadow: "none", fontSize: "13px", padding: "6px 8px", whiteSpace: "nowrap" }}
                                            >
                                                📋 {t("workspace_v2.mode_list")}
                                            </button>
                                        </div>

                                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", width: "100%" }}>
                                            <button
                                                className={`btn btn-sm ${tempA !== null ? "btn-ab-active" : "btn-ghost"}`}
                                                onClick={handleMarkA}
                                                title={t("workspace_v2.mark_a_hint")}
                                                style={{ flex: 1, whiteSpace: "nowrap" }}
                                            >
                                                {t("workspace_v2.point_a")} {tempA !== null ? formatTime(tempA) : ""}
                                            </button>
                                            <button
                                                className={`btn btn-sm btn-ghost`}
                                                onClick={handleMarkB}
                                                disabled={tempA === null}
                                                title={t("workspace_v2.mark_b_hint")}
                                                style={{ flex: 2, whiteSpace: "nowrap" }}
                                            >
                                                {t("workspace_v2.mark_b")}
                                            </button>
                                            {tempA !== null && (
                                                <button className="btn btn-sm btn-ghost" onClick={() => setTempA(null)} style={{ padding: "0 12px" }}>✕</button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right side: AB Segments Sidebar */}
                        <div className="ab-sidebar">
                            <div className="ab-sidebar-tabs" style={{ display: "flex", borderBottom: "1px solid var(--border-subtle)", marginBottom: "8px" }}>
                                <button
                                    onClick={() => setActiveTab('segments')}
                                    style={{ flex: 1, padding: "12px 0", background: "none", border: "none", borderBottom: activeTab === 'segments' ? "2px solid var(--accent-primary)" : "2px solid transparent", color: activeTab === 'segments' ? "var(--accent-primary)" : "var(--text-muted)", fontWeight: activeTab === 'segments' ? 600 : 400, cursor: "pointer", transition: "all 0.2s" }}
                                >
                                    {t("workspace_v2.tabs.segments")}
                                </button>
                                <button
                                    onClick={() => setActiveTab('dictation')}
                                    style={{ flex: 1, padding: "12px 0", background: "none", border: "none", borderBottom: activeTab === 'dictation' ? "2px solid var(--accent-primary)" : "2px solid transparent", color: activeTab === 'dictation' ? "var(--accent-primary)" : "var(--text-muted)", fontWeight: activeTab === 'dictation' ? 600 : 400, cursor: "pointer", transition: "all 0.2s" }}
                                >
                                    {t("workspace_v2.tabs.dictation")}
                                </button>
                                <button
                                    onClick={() => setActiveTab('transcript')}
                                    style={{ flex: 1, padding: "12px 0", background: "none", border: "none", borderBottom: activeTab === 'transcript' ? "2px solid var(--accent-primary)" : "2px solid transparent", color: activeTab === 'transcript' ? "var(--accent-primary)" : "var(--text-muted)", fontWeight: activeTab === 'transcript' ? 600 : 400, cursor: "pointer", transition: "all 0.2s" }}
                                >
                                    {t("workspace_v2.tabs.transcript")}
                                </button>
                            </div>

                            {activeTab === 'segments' && (
                                <>
                                    <div className="ab-sidebar-header" style={{ padding: "8px 16px", borderBottom: "none" }}>
                                        <span style={{ fontSize: "12px", fontWeight: "normal", color: "var(--text-muted)" }}>
                                            {t("workspace_v2.segment_count", { count: playback.segments.length })}
                                        </span>
                                    </div>
                                    <div className="ab-sidebar-content" style={{ padding: "16px 20px", paddingBottom: "calc(env(safe-area-inset-bottom, 24px) + 80px)" }}>
                                        {playback.segments.map((seg, idx) => {
                                            const isActive = seg.id === playback.active_segment_id;
                                            return (
                                                <div
                                                    key={seg.id}
                                                    onClick={() => handleSelectSegment(seg.id)}
                                                    style={{
                                                        display: "flex", flexDirection: "column", gap: "8px",
                                                        padding: "10px 12px", borderRadius: "8px", cursor: "pointer",
                                                        background: isActive ? "var(--bg-active)" : "var(--bg-tertiary)",
                                                        borderLeft: isActive ? "4px solid var(--accent-primary)" : "4px solid transparent",
                                                        fontSize: "13px",
                                                        transition: "all var(--transition-fast)",
                                                    }}
                                                >
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                        <span style={{ fontWeight: 600 }}>{t("workspace_v2.segment_label", { idx: idx + 1 })}</span>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                            {isActive && playback.mode !== PlaybackMode.Global && (
                                                                <span style={{ color: "var(--accent-primary)", fontSize: "12px", fontWeight: 600 }}>
                                                                    {seg.loop_count === 0
                                                                        ? t("workspace_v2.loop_infinite")
                                                                        : t("workspace_v2.loop_remaining", { count: playback.loop_remaining ?? seg.loop_count })}
                                                                </span>
                                                            )}
                                                            <button
                                                                onClick={(e) => handleRemoveSegment(seg.id, e)}
                                                                style={{ border: "none", background: "none", color: "var(--error)", cursor: "pointer", fontSize: "14px", padding: "0 4px" }}
                                                                title={t("workspace_v2.delete_segment")}
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div style={{ color: "var(--text-secondary)", display: "flex", flexDirection: "row", alignItems: "center", gap: "8px", fontSize: "12px", flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                                                        {/* Start time adjustment */}
                                                        <button style={adjBtnStyle} onClick={(e) => handleAdjustSegmentTime(seg, 'start', -1, e)} title={t("workspace_v2.adj_start_minus")}>◀</button>
                                                        <span style={{ fontFamily: "monospace", minWidth: "36px", textAlign: "center" }}>{formatTime(seg.start_secs)}</span>
                                                        <button style={adjBtnStyle} onClick={(e) => handleAdjustSegmentTime(seg, 'start', 1, e)} title={t("workspace_v2.adj_start_plus")}>▶</button>
                                                        <span style={{ color: "var(--text-muted)", margin: "0 2px" }}>—</span>
                                                        {/* End time adjustment */}
                                                        <button style={adjBtnStyle} onClick={(e) => handleAdjustSegmentTime(seg, 'end', -1, e)} title={t("workspace_v2.adj_end_minus")}>◀</button>
                                                        <span style={{ fontFamily: "monospace", minWidth: "36px", textAlign: "center" }}>{formatTime(seg.end_secs)}</span>
                                                        <button style={adjBtnStyle} onClick={(e) => handleAdjustSegmentTime(seg, 'end', 1, e)} title={t("workspace_v2.adj_end_plus")}>▶</button>
                                                    </div>

                                                    {/* Loop counter control */}
                                                    <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--bg-primary)", padding: "2px 8px", borderRadius: "12px" }} onClick={e => e.stopPropagation()}>
                                                        <button className="btn-icon-sm" style={{ width: "20px", height: "20px", lineHeight: "1px", fontSize: "14px", border: "none", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }} onClick={(e) => handleUpdateSegmentLoops(seg, -1, e)}>-</button>
                                                        <span style={{ width: "28px", textAlign: "center", fontFamily: "monospace", fontWeight: 500 }}>
                                                            {seg.loop_count === 0 ? "∞" : seg.loop_count}
                                                        </span>
                                                        <button className="btn-icon-sm" style={{ width: "20px", height: "20px", lineHeight: "1px", fontSize: "14px", border: "none", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }} onClick={(e) => handleUpdateSegmentLoops(seg, 1, e)}>+</button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {playback.segments.length === 0 && (
                                            <div style={{ textAlign: "center", padding: "24px 16px", color: "var(--text-muted)", fontSize: "13px" }}>
                                                <div style={{ fontSize: "24px", marginBottom: "12px", opacity: 0.5 }}>📝</div>
                                                {t("workspace_v2.segments_empty")}<br /><br />
                                                1. {t("workspace_v2.segments_tip_a")}<br />
                                                2. {t("workspace_v2.segments_tip_b")}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}

                            {activeTab === 'dictation' && (
                                <div className="ab-sidebar-content" style={{ padding: "16px", paddingBottom: "calc(env(safe-area-inset-bottom, 24px) + 80px)", display: "flex", flexDirection: "column", height: "100%", gap: "16px" }}>
                                    {!playback.active_segment_id ? (
                                        <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "14px", marginTop: "40px" }}>
                                            <div style={{ fontSize: "28px", opacity: 0.5, marginBottom: "12px" }}>✍️</div>
                                            {t("workspace_v2.dictation_select_tip")}
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "12px", borderBottom: "1px solid var(--border-subtle)" }}>
                                                <div style={{ fontWeight: 600 }}>
                                                    {t("workspace_v2.dictation_active", { idx: playback.segments.findIndex(s => s.id === playback.active_segment_id) + 1 })}
                                                </div>
                                                <div style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "monospace" }}>
                                                    {formatTime(playback.segments.find(s => s.id === playback.active_segment_id)?.start_secs || 0)} - {formatTime(playback.segments.find(s => s.id === playback.active_segment_id)?.end_secs || 0)}
                                                </div>
                                            </div>

                                            {!dictationFeedback ? (
                                                <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: "12px" }}>
                                                    <textarea
                                                        className="dictation-input"
                                                        placeholder={t("workspace_v2.dictation_placeholder")}
                                                        value={dictationInput}
                                                        onChange={(e) => setDictationInput(e.target.value)}
                                                        style={{
                                                            flex: 1,
                                                            resize: "none",
                                                            padding: "12px",
                                                            borderRadius: "8px",
                                                            border: "1px solid var(--border-subtle)",
                                                            background: "var(--bg-primary)",
                                                            color: "var(--text-primary)",
                                                            fontSize: "14px",
                                                            fontFamily: "inherit",
                                                            outline: "none"
                                                        }}
                                                    />
                                                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                                                        <span style={{ fontSize: "12px", color: "var(--text-muted)", marginRight: "12px" }}>{t("workspace_v2.dictation_quick_submit")}</span>
                                                        <button
                                                            className="btn btn-primary"
                                                            onClick={handleSubmitDictation}
                                                            disabled={dictationInput.trim().length === 0}
                                                        >
                                                            {t("workspace_v2.dictation_submit_btn")}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="dictation-feedback fade-in" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                                    <div style={{
                                                        textAlign: "center",
                                                        padding: "24px",
                                                        borderRadius: "12px",
                                                        background: dictationFeedback.score >= 90 ? "rgba(76, 175, 80, 0.1)" : dictationFeedback.score >= 60 ? "rgba(255, 152, 0, 0.1)" : "rgba(244, 67, 54, 0.1)",
                                                        color: dictationFeedback.score >= 90 ? "#4caf50" : dictationFeedback.score >= 60 ? "#ff9800" : "#f44336"
                                                    }}>
                                                        <div style={{ fontSize: "36px", fontWeight: 700 }}>{dictationFeedback.score}</div>
                                                        <div style={{ fontSize: "14px", opacity: 0.8 }}>{t("workspace_v2.dictation_score_label")}</div>
                                                    </div>

                                                    <div style={{ background: "var(--bg-tertiary)", padding: "16px", borderRadius: "8px" }}>
                                                        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>{t("workspace_v2.dictation_your_answer")}</div>
                                                        <div style={{ fontSize: "14px" }}>{dictationInput}</div>
                                                    </div>

                                                    <div style={{ background: "var(--bg-tertiary)", padding: "16px", borderRadius: "8px" }}>
                                                        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>{t("workspace_v2.dictation_original_text")}</div>
                                                        <div style={{ fontSize: "14px" }}>{dictationFeedback.diff.replace("Original: ", "")}</div>
                                                    </div>

                                                    <div style={{ marginTop: "auto", display: "flex", justifyContent: "center" }}>
                                                        <button
                                                            className="btn btn-primary"
                                                            onClick={() => {
                                                                setDictationFeedback(null);
                                                                setDictationInput("");
                                                                setDictationStartTime(Date.now());
                                                            }}
                                                        >
                                                            {t("speaking.tryAgain")}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {activeTab === 'transcript' && (
                                <div
                                    className="ab-sidebar-content"
                                    ref={transcriptContainerRef}
                                    onScroll={handleTranscriptScroll}
                                    style={{
                                        padding: "16px",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: (!modelExists || isTranscribing || words.length === 0) ? "center" : "stretch",
                                        justifyContent: (!modelExists || isTranscribing || words.length === 0) ? "center" : "flex-start",
                                        height: "100%",
                                        position: "relative",
                                        paddingBottom: "calc(env(safe-area-inset-bottom, 24px) + 80px)"
                                    }}
                                >
                                    {!modelExists ? (
                                        <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "14px", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", background: "var(--bg-tertiary)", padding: "24px", borderRadius: "12px" }}>
                                            <div style={{ fontSize: "32px", opacity: 0.8 }}>📦</div>
                                            <div>
                                                <h3 style={{ margin: "0 0 8px 0", color: "var(--text-primary)" }}>{t("workspace_v2.model_missing")}</h3>
                                                <p style={{ margin: 0, fontSize: "12px" }}>{t("workspace_v2.model_desc")}</p>
                                            </div>

                                            {isDownloading ? (
                                                <div style={{ width: "100%", marginTop: "8px" }}>
                                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                                                        <span>{t("workspace_v2.downloading_model")}</span>
                                                        {downloadProgress && downloadProgress.total > 0 ? (
                                                            <span>{Math.round(downloadProgress.downloaded / 1024 / 1024)} / {Math.round(downloadProgress.total / 1024 / 1024)} MB</span>
                                                        ) : (
                                                            <span>{t("common.loading")}</span>
                                                        )}
                                                    </div>
                                                    <div style={{ width: "100%", height: "6px", background: "var(--bg-primary)", borderRadius: "3px", overflow: "hidden" }}>
                                                        <div style={{
                                                            height: "100%",
                                                            background: "var(--accent-primary)",
                                                            width: downloadProgress && downloadProgress.total > 0 ? `${(downloadProgress.downloaded / downloadProgress.total) * 100}%` : "0%",
                                                            transition: "width 0.2s"
                                                        }} />
                                                    </div>
                                                </div>
                                            ) : (
                                                <button className="btn btn-primary" onClick={handleDownloadModel} style={{ marginTop: "8px", padding: "8px 24px" }}>
                                                    {t("workspace_v2.download_model")}
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
                                            {isTranscribing ? (
                                                <div style={{ margin: "auto", textAlign: "center", color: "var(--accent-primary)", width: "80%" }}>
                                                    <div className="spinner" style={{ marginBottom: "16px", margin: "0 auto" }}></div>
                                                    <div style={{ fontWeight: 600, marginBottom: "8px" }}>{t("workspace_v2.generating_transcript_interactive")}</div>
                                                    <div style={{ width: "100%", height: "4px", background: "var(--bg-tertiary)", borderRadius: "2px", overflow: "hidden", marginBottom: "8px" }}>
                                                        <div style={{ height: "100%", background: "var(--accent-primary)", width: `${transcribeProgress}%`, transition: "width 0.2s" }} />
                                                    </div>
                                                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                                                        ({t("workspace_v2.model_inference")}: {transcribeProgress}%)
                                                    </div>
                                                </div>
                                            ) : words.length > 0 ? (
                                                <div className="transcript-container">
                                                    <div style={{ padding: "0 0 16px 0", display: "flex", justifyContent: "flex-end", borderBottom: "1px solid var(--border-subtle)", marginBottom: "16px" }}>
                                                        <button
                                                            className="btn btn-ghost btn-sm"
                                                            onClick={() => startTranscription(true)}
                                                            style={{
                                                                fontSize: "11px",
                                                                padding: "4px 12px",
                                                                opacity: 0.8
                                                            }}
                                                        >
                                                            🔄 {t("workspace_v2.generate_transcript")}
                                                        </button>
                                                    </div>
                                                    <div className="transcript-text" style={{ padding: "0" }}>
                                                        {transcriptLines.map((line, idx) => {
                                                            return (
                                                                <TranscriptLine
                                                                    key={idx}
                                                                    line={line}
                                                                    isActive={activeLineIdx === idx}
                                                                    onWordClick={handleSeekTo}
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                            ) : (
                                                <div style={{ margin: "auto", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
                                                    <div style={{ fontSize: "28px", opacity: 0.5, marginBottom: "12px" }}>🤖</div>
                                                    {t("workspace_v2.empty_material")}<br />
                                                    <button
                                                        className="btn btn-primary"
                                                        onClick={() => {
                                                            if (playback?.file_path) {
                                                                setIsTranscribing(true);
                                                                setCurrentFileTranscribing(playback.file_path);
                                                                setTranscribeProgress(0);
                                                                invoke<WordTimestamp[]>("transcribe_audio", { path: playback.file_path })
                                                                    .then((result) => setWords(result))
                                                                    .catch((e) => {
                                                                        console.error(e);
                                                                        toastError(String(e));
                                                                    })
                                                                    .finally(() => setIsTranscribing(false));
                                                            }
                                                        }}
                                                        style={{ marginTop: "16px", padding: "8px 24px" }}
                                                    >
                                                        {t("workspace_v2.transcribing")}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Resume Progress Modal */}
            {resumeData && (
                <div style={{
                    position: "fixed", bottom: "100px", right: "20px", zIndex: 9999,
                    background: "var(--bg-secondary)", border: "1px solid var(--border-medium)",
                    padding: "16px", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                    display: "flex", flexDirection: "column", gap: "12px", width: "calc(100% - 40px)",
                    maxWidth: "280px",
                    animation: "slideUp 0.3s ease-out"
                }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>{t("workspace_v2.resume_title")}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {t("workspace_v2.resume_desc", { time: formatTime(resumeData.position_secs) })}
                    </div>
                    <div style={{ display: "flex", gap: "12px" }}>
                        <button className="btn btn-ghost" style={{ flex: 1, height: "40px", fontSize: "12px" }} onClick={() => setResumeData(null)}>{t("workspace_v2.resume_no")}</button>
                        <button className="btn btn-primary" style={{ flex: 2, height: "40px", fontSize: "13px", fontWeight: 600 }} onClick={handleResumeProgress}>{t("workspace_v2.resume_yes")}</button>
                    </div>
                </div>
            )}
        </div>
    );
}
