import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { useToast } from "../components/Toast";
import { PlaybackMode, ABSegment, WordTimestamp, PlaybackInfo, LearningMaterial } from "../types";
import levenshtein from "fast-levenshtein";
import { resolveAndArchiveAudio } from "../utils/audioLoader";

/* Build 108.v1: Transcript components moved to categorized modules */
import TranscriptView from "./StudyWorkspace/components/TranscriptView";
import SelectionPopup from "./StudyWorkspace/components/SelectionPopup";
import { useTranscriptSelection } from "./StudyWorkspace/hooks/useTranscriptSelection";
import "./StudyWorkspace/StudyWorkspace.css";

function formatTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function generateId(): string {
    return Math.random().toString(36).substring(2, 9);
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
    const { t } = useTranslation();
    const { success: toastSuccess, error: toastError } = useToast();
    const [playback, setPlayback] = useState<PlaybackInfo | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [position, setPosition] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1.0);
    const [speed, setSpeed] = useState(1.0);
    const [currentMaterial, setCurrentMaterial] = useState<LearningMaterial | null>(null);
    const [tempA, setTempA] = useState<number | null>(null);

    // Platform detection for UI adjustments
    const isIOS = useMemo(() => /iPad|iPhone|iPod/.test(navigator.userAgent), []);



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
    const lastSavedRef = useRef<{ materialId: number | null, position: number, time: number }>({
        materialId: null,
        position: 0,
        time: Date.now()
    });
    const isDirtyRef = useRef<boolean>(false); // Build 93.8: Dirty Flag for saving
    const playbackRef = useRef<PlaybackInfo | null>(null); // Use ref for stable save function
    const hasCheckedAutoLoad = useRef(false);
    const isRestoringRef = useRef(false);
    const expectedSegmentCountRef = useRef(-1); // Build 93: -1 means "Loading from DB..."
    const isBootingRef = useRef(true); // Build 89: Initial load safety lock
    const hasSyncProgressRef = useRef<Record<number, boolean>>({}); // Build 97: Sync Tracker
    const [isInitialCheck, setIsInitialCheck] = useState(true);
    const [debugUserId, setDebugUserId] = useState<number | null>(null); // Build 93 Debug Trace


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
    const pollState = useCallback(async (): Promise<PlaybackInfo | null> => {
        try {
            const state = await invoke<PlaybackInfo>("get_playback_state");
            if (state && state.file_path !== "") {
                // Determine if we should accept this state's segments as canonical
                const isInitializing = expectedSegmentCountRef.current === -1;

                // Build 85: Segment Anchor Logic.
                if (!isRestoringRef.current) {
                    setPlayback(prev => {
                        // Build 93.5: INSTANT WORKBENCH RENDER
                        // If backend has a file (state.file_path is not empty),
                        // we MUST initialize the workbench even if segments are 0.
                        // This prevents the "Welcome Screen" headphones icon from showing.
                        if (!prev) return state;

                        // Startup Guard: If we are still initializing and backend has 0 segments,
                        // do NOT overwrite existing UI segments with 0.
                        if (isInitializing && state.segments.length === 0) {
                            return { ...state, segments: prev.segments };
                        }

                        // If backend hasn't caught up to our segment additions yet, keep current UI segments
                        if (state.segments.length < expectedSegmentCountRef.current) {
                            return { ...state, segments: prev.segments };
                        }
                        // Update our expectation if the backend has MORE or EXACLTY what we expect
                        expectedSegmentCountRef.current = state.segments.length;
                        return state;
                    });
                } else {
                    // When restoring, keep our already restored position/volume/speed
                    // Backend hasn't had time to update yet so it still gives old values (position 0)
                    setPlayback(prev => {
                        if (!prev) return state;

                        // Keep existing position/volume/speed that we just restored from DB
                        // Only update segments if backend has more
                        if (state.segments.length < expectedSegmentCountRef.current) {
                            return {
                                ...state,
                                position_secs: prev.position_secs,
                                volume: prev.volume,
                                speed: prev.speed,
                                segments: prev.segments
                            };
                        }
                        expectedSegmentCountRef.current = state.segments.length;
                        return {
                            ...state,
                            position_secs: prev.position_secs,
                            volume: prev.volume,
                            speed: prev.speed
                        };
                    });
                }

                // Always update auxiliary state if we HAVE a workbench loaded
                if (playbackRef.current) {
                    // Build 93.8: Mark dirty if position has moved significantly (> 3s)
                    if (Math.abs(state.position_secs - lastSavedRef.current.position) > 3) {
                        isDirtyRef.current = true;
                    }

                    // Don't overwrite position while restoring - we just set it correctly from DB
                    if (!isRestoringRef.current) {
                        setPosition(state.position_secs);
                    }
                    setDuration(state.duration_secs);
                    setIsPlaying(state.is_playing);
                    setSpeed(prev => prev !== state.speed ? state.speed : prev);
                    setVolume(prev => prev !== state.volume ? state.volume : prev);
                }
                setIsInitialCheck(false);
                return state;
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
                            const info = await invoke<PlaybackInfo>("load_audio", { path: latest.source_url });
                            await invoke("set_material_id", { id: latest.id });
                            setPlayback({ ...info, material_id: latest.id });
                            setDuration(info.duration_secs);
                            setPosition(0);

                            hasSyncProgressRef.current[latest.id] = true;
                            await checkAndLoadProgress(latest.id, false);
                            return { ...info, material_id: latest.id };
                        }
                    } catch (e) {
                        console.warn("[Auto-load] Failed to auto-load latest material:", e);
                    } finally {
                        setIsInitialCheck(false);
                    }
                } else {
                    setIsInitialCheck(false);
                }
                return null;
            }
        } catch {
            setIsInitialCheck(false);
            return null;
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

        // Build 93.5: Immediate check (No 150ms delay) to prevent UI flicker
        checkAndLoadProgress(materialId, false, true); // forceShow=true
        return () => { };
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


    async function checkAndLoadProgress(material_id: number, autoResume: boolean = false, forceShow: boolean = false) {
        console.log(`[Progress] Checking progress for material: ${material_id}, autoResume=${autoResume}, forceShow=${forceShow}`);

        try {
            const user = await invoke<any>("get_current_user");
            if (user) setDebugUserId(user.id);
        } catch (e) { }

        try {
            console.log("[Progress] COMMAND: Starting DB Retrieval for material:", material_id);
            const progress = await invoke<any>("get_material_progress", { materialId: material_id });

            console.group("[Progress] DB Retrieval Audit");
            console.log("Material ID:", material_id);
            console.log("Returned Data:", progress);
            console.log("Has Segments:", !!(progress && progress.segments && progress.segments.length > 0));
            console.groupEnd();

            const hasPosition = progress && progress.position_secs > 5;
            const hasSegments = progress && progress.segments && progress.segments.length > 0;

            if (hasPosition || hasSegments) {
                if (autoResume) {
                    console.log("[Progress] Auto-resuming from DB...");
                    applyProgress(progress);
                } else if (forceShow) {
                    setResumeData(progress);
                } else {
                    const currentPos = playbackRef.current?.position_secs || 0;
                    const diff = Math.abs(currentPos - progress.position_secs);

                    if (diff < 10) {
                        console.log("[Progress] Near saved position, auto-applying DB segments.");
                        if (hasSegments) applyProgress(progress);
                        setResumeData(null);
                    } else {
                        setResumeData(progress);
                    }
                }
            } else {
                console.log("[Progress] No saved progress or segments found in DB for material:", material_id);
                expectedSegmentCountRef.current = 0;
                if (!forceShow) setResumeData(null);
            }
        } catch (e) {
            console.error("[Progress] Fatal check error:", e);
        } finally {
            // Build 94.1: Extend boot lock to ensure React refs have synchronized
            setTimeout(() => { isBootingRef.current = false; }, 1500);
        }
    }

    async function applyProgress(data: any) {
        if (!data) return;
        console.log("[Progress] Applying stored data:", data.position_secs, "segments:", data.segments?.length);

        isRestoringRef.current = true;
        setResumeData(null);

        try {
            // Build 93.8: Mark "Clean" after loading from DB
            isDirtyRef.current = false;

            if (data.position_secs > 0) {
                setPosition(data.position_secs);
                setPlayback(prev => prev ? { ...prev, position_secs: data.position_secs } : prev);
                // Bug fix: must use camelCase positionSecs to match Tauri command parameter
                await invoke("seek", { positionSecs: data.position_secs }).catch(e => console.warn("seek failed:", e));
            }
            if (data.volume !== undefined) {
                setVolume(data.volume);
                setPlayback(prev => prev ? { ...prev, volume: data.volume } : prev);
                await invoke("set_volume", { volume: data.volume }).catch(() => { });
            }
            if (data.speed !== undefined) {
                setSpeed(data.speed);
                setPlayback(prev => prev ? { ...prev, speed: data.speed } : prev);
                await invoke("set_speed", { speed: data.speed }).catch(() => { });
            }
            if (data.mode) {
                await invoke("set_mode", { mode: data.mode }).catch(() => { });
            }

            // Restore segments and update local state
            const segs = data.segments || [];
            expectedSegmentCountRef.current = segs.length;

            // Update UI Instantly
            // Build 94.1: DO NOT set isDirtyRef to true here. 
            // Loading from DB means the UI is CLEAN (synced).
            isDirtyRef.current = false;

            setPlayback(prev => {
                if (prev) return {
                    ...prev,
                    segments: segs,
                    material_id: data.material_id,
                    ...(data.position_secs !== undefined && { position_secs: data.position_secs }),
                    ...(data.volume !== undefined && { volume: data.volume }),
                    ...(data.speed !== undefined && { speed: data.speed })
                };
                return {
                    file_path: data.material_id?.toString() || "",
                    file_name: "",
                    material_id: data.material_id,
                    duration_secs: 0,
                    position_secs: data.position_secs ?? 0,
                    is_playing: false,
                    volume: data.volume ?? 1.0,
                    speed: data.speed ?? 1.0,
                    mode: "Global" as any,
                    active_segment_id: null,
                    loop_remaining: null,
                    segments: segs,
                };
            });

            // Seed Backend
            for (const seg of segs) {
                await invoke("add_segment", { segment: seg }).catch(() => { });
            }

            if (data.active_segment_id) {
                await invoke("set_active_segment", { id: data.active_segment_id }).catch(() => { });
            }

            // Critical: Allow pollState to take over, but keep isRestoringRef = true
            // until the backend has confirmed the seek position.
            // Bug fix: previously isRestoringRef was released at the same instant pollState
            // was called, leaving an open window for the 150ms polling interval to read
            // position=0 from the backend and immediately overwrite our restored position.
            // Now we await pollState() first, then release the lock after backend confirms seek.
            const targetPosition = data.position_secs as number;
            const releaseRestoringLock = async () => {
                // Poll until backend position is within 2s of the target (seek has taken effect)
                // or bail out after 2 seconds to avoid infinite lock
                const deadline = Date.now() + 2000;
                while (Date.now() < deadline) {
                    const state = await pollState();
                    if (state && Math.abs(state.position_secs - targetPosition) < 2) {
                        break; // Backend has caught up
                    }
                    await new Promise(r => setTimeout(r, 150));
                }
                isRestoringRef.current = false;
                console.log("[Progress] Restoring lock released, position confirmed.");
            };
            releaseRestoringLock();
        } catch (e) {
            console.error("[Progress] Apply failed:", e);
            isRestoringRef.current = false;
        }
    }

    const handleResumeProgress = async () => {
        if (!resumeData) return;
        await applyProgress(resumeData);
    };

    // Build 86: Session-level segment insurance
    const lastSessionSegmentsRef = useRef<number>(0);

    const saveProgress = useCallback(async (manualData?: PlaybackInfo, retryCount = 0) => {
        const pb = manualData || playbackRef.current;
        if (!pb?.material_id) return;

        // Build 93.8: Dirty Flag check (Only auto-save if dirty)
        if (!manualData && !isDirtyRef.current) {
            return;
        }

        const currentSegs = (pb.segments || []).length;
        if (isBootingRef.current) {
            // Build 93.6/93.7/93.8 Absolute Guard
            if (currentSegs === 0) {
                console.log("[Progress] Save Blocked: Blocked auto-save of empty segments during boot.");
                lastSavedRef.current.time = Date.now();
                return;
            }
        }

        // Build 86: High-water mark safety
        if (currentSegs === 0 && lastSessionSegmentsRef.current > 0 && !manualData) {
            console.warn("[Progress] BLOCKED save override: Frontend has 0 but Source had " + lastSessionSegmentsRef.current);
            return;
        }

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

            console.log("[Progress] Saving to DB:", { id: pb.material_id, segments: currentSegs });

            if (currentSegs > 0) {
                lastSessionSegmentsRef.current = currentSegs;
            }

            await invoke("save_material_progress", { progress: data });

            // Build 93.8: Mark "Clean" after successful save
            isDirtyRef.current = false;

            if (!manualData) {
                lastSavedRef.current = { materialId: pb.material_id, position: pb.position_secs, time: Date.now() };
            }
        } catch (e) {
            console.error("[Progress] Save failed:", e);
            if (retryCount < 3 && manualData) {
                setTimeout(() => saveProgress(manualData, retryCount + 1), 800);
            }
        }
    }, [playbackRef]);

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
            // Build 93.6/94.1: Only force save if we actually have data to save, 
            // and definitely NOT during the boot sequence or if the state is clean.
            if (!isBootingRef.current && isDirtyRef.current && (playback?.segments?.length || 0) > 0) {
                saveProgress(undefined, 1);
            }
        };
    }, [saveProgress]);

    useEffect(() => {
        // Build 95: Deadlock Break.
        // We MUST start polling immediately even if playback is null, 
        // because pollState handles the auto-load logic for idle backends.
        pollRef.current = window.setInterval(pollState, 150);

        return () => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
            }
        };
    }, [pollState]);

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

    // Unified Source of Truth: memoWords filters out hallucinations once for both UI and Selection
    const memoWords = useMemo(() => {
        if (!words || words.length === 0) return [];

        let filteredWords: WordTimestamp[] = [];
        let duplicateCount = 0;
        for (let i = 0; i < words.length; i++) {
            const currentWText = words[i].word.trim().toLowerCase().replace(/[.,!?。！？]/g, '');
            if (i > 0) {
                const prevWText = words[i - 1].word.trim().toLowerCase().replace(/[.,!?。！？]/g, '');
                if (currentWText === prevWText) duplicateCount++;
                else duplicateCount = 0;
            } else duplicateCount = 0;
            if (duplicateCount < 2) filteredWords.push(words[i]);
        }

        const cleanWords: WordTimestamp[] = [];
        const maxSeqLen = 20;
        for (let i = 0; i < filteredWords.length; i++) {
            let isSeqDuplicate = false;
            for (let len = 4; len <= maxSeqLen; len++) {
                if (i >= len && i + len <= filteredWords.length) {
                    const gap = filteredWords[i].start_ms - filteredWords[i - 1].end_ms;
                    if (gap < 5000) {
                        let match = true;
                        for (let k = 0; k < len; k++) {
                            const wordA = filteredWords[i - len + k].word.trim().toLowerCase().replace(/[.,!?。！？]/g, '');
                            const wordB = filteredWords[i + k].word.trim().toLowerCase().replace(/[.,!?。！？]/g, '');
                            if (wordA !== wordB) { match = false; break; }
                        }
                        if (match) { isSeqDuplicate = true; i += (len - 1); break; }
                    }
                }
            }
            if (!isSeqDuplicate) cleanWords.push(filteredWords[i]);
        }
        return cleanWords;
    }, [words]);

    // Group clean words into lines for efficient rendering
    const transcriptLines = useMemo(() => {
        const lines: { text: string; start: number; end: number; words: WordTimestamp[] }[] = [];
        let currentLine: WordTimestamp[] = [];
        for (let i = 0; i < memoWords.length; i++) {
            currentLine.push(memoWords[i]);
            const w = memoWords[i].word.trim().toLowerCase();
            const isAbbrev = ["mr.", "mrs.", "ms.", "dr.", "prof.", "st.", "vs.", "etc."].includes(w);
            const isEnd = /[.!?。！？]$/.test(memoWords[i].word.trim()) && !isAbbrev;
            const gap = (i < memoWords.length - 1) ? (memoWords[i + 1].start_ms - memoWords[i].end_ms) : 0;
            if ((isEnd && (gap > 250 || currentLine.length > 20)) || gap > 800 || i === memoWords.length - 1) {
                if (currentLine.length > 0) {
                    lines.push({
                        text: currentLine.map(x => x.word).join(" "),
                        start: currentLine[0].start_ms,
                        end: currentLine[currentLine.length - 1].end_ms,
                        words: [...currentLine]
                    });
                }
                currentLine = [];
            }
        }
        return lines;
    }, [memoWords]);

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
            const selectedPath: string = typeof selected === 'string' ? selected : selected[0];
            const fileName = (selectedPath.split('/').pop() || selectedPath.split('\\').pop() || 'unknown.wav').split('?')[0];

            try {
                const { destPath: finalPath, finalName } = await resolveAndArchiveAudio(selectedPath, fileName);
                const usedFileName = finalName || fileName;
                const info = await invoke<PlaybackInfo>("load_audio", {
                    path: finalPath,
                });

                // Build 90: Reverted to original sourceUrl logic as per user request.
                // Keeping only the isBootingRef safety at the command gate level.
                try {
                    const materialId: number = await invoke("add_or_update_material", {
                        title: usedFileName,
                        sourceUrl: finalPath,
                        durationMs: info.duration_secs * 1000
                    });

                    setPlayback({ ...info, material_id: materialId });
                    console.log("[Progress] Material registered with ID:", materialId, "for path:", finalPath);

                    await checkAndLoadProgress(materialId, true);
                } catch (e) {
                    console.error("[Progress] Failed to register material:", e);
                    setPlayback(info); // Fallback to basic playback without ID
                }
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
                setPlayback(prev => prev ? { ...prev, is_playing: false } : prev);
            } else {
                // If we are at the end, start over
                if (position >= duration - 0.2) {
                    await invoke("seek", { positionSecs: 0 });
                    setPosition(0);
                    setPlayback(prev => prev ? { ...prev, position_secs: 0, is_playing: true } : prev);
                    await invoke("play");
                } else if (position === 0) {
                    await invoke("play");
                    setPlayback(prev => prev ? { ...prev, is_playing: true } : prev);
                } else {
                    await invoke("resume");
                    setPlayback(prev => prev ? { ...prev, is_playing: true } : prev);
                }
                setIsPlaying(true);
            }
        } catch (e) {
            try {
                await invoke("play");
                setIsPlaying(true);
                setPlayback(prev => prev ? { ...prev, is_playing: true } : prev);
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
            // Sync to playback object for saving
            setPlayback(prev => prev ? { ...prev, is_playing: false, position_secs: 0 } : prev);
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
        // Sync position to playback object for saving
        setPlayback(prev => prev ? { ...prev, position_secs: newPos } : prev);
        invoke("seek", { positionSecs: newPos }).catch(console.error);
    };

    // Volume change
    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const vol = parseFloat(e.target.value);
        setVolume(vol);
        // Sync volume to playback object for saving
        setPlayback(prev => prev ? { ...prev, volume: vol } : prev);
        invoke("set_volume", { volume: vol }).catch(console.error);
    };

    // Speed change
    const handleSpeedChange = async (newSpeed: number) => {
        setSpeed(newSpeed);
        // Sync speed to playback object for saving
        setPlayback(prev => prev ? { ...prev, speed: newSpeed } : prev);
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
        // Sync position to playback object for saving
        setPlayback(prev => prev ? { ...prev, position_secs: newPos } : prev);
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
            const seg = { id: generateId(), start_secs: a, end_secs: b, loop_count: 0 };

            // Build 76: Correct Optimistic Pattern (Side effect AFTER state calc)
            isDirtyRef.current = true; // Build 93.8: Marked Dirty
            setPlayback(prev => {
                if (!prev) return prev;
                const newSegments = [...prev.segments, seg];
                const updated = { ...prev, segments: newSegments };
                expectedSegmentCountRef.current = updated.segments.length;
                saveProgress(updated);
                return updated;
            });

            await invoke("add_segment", { segment: seg });
            setTempA(null);
            setTimeout(pollState, 100);
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
            // Build 76: Correct Optimistic Pattern
            if (playback) {
                isDirtyRef.current = true; // Build 93.8: Marked Dirty
                const updated = {
                    ...playback,
                    segments: playback.segments.filter(s => s.id !== id),
                    active_segment_id: playback.active_segment_id === id ? null : playback.active_segment_id
                };
                setPlayback(updated);
                saveProgress(updated);
            }

            await invoke("remove_segment", { id });
            setTimeout(pollState, 100);
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
            const newState = await pollState();
            saveProgress(newState || undefined);
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

    const handleSeekTo = useCallback((pos: number) => {
        setPosition(pos);
        // Sync position to playback object for saving
        setPlayback(prev => prev ? { ...prev, position_secs: pos } : prev);
        invoke("seek", { positionSecs: pos });
    }, []);

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
            const newState = await pollState();
            saveProgress(newState || undefined);
        } catch (err) {
            console.error("[Segment] update failed:", err);
        }
    };

    // Build 108.v1: Transcript Selection System Hook
    const {
        selectionPopup,
        isSelecting,
        handleCopySelection,
        handleShadowSelection,
        handleAddSelectionAsSegment,
        handleTranslateSelection,
        handleBlankClick
    } = useTranscriptSelection({
        playback,
        setPlayback,
        memoWords,
        saveProgress,
        setActiveTab,
        pollState,
        generateId
    });

    const progressPercent = duration > 0 ? (position / duration) * 100 : 0;
    const tempAPercent = duration > 0 && tempA !== null ? (tempA / duration) * 100 : 0;
    const volumeIcon = volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊";
    const adjBtnStyle: React.CSSProperties = {
        border: "none", background: "transparent", color: "var(--text-secondary)",
        cursor: "pointer", padding: "0 3px", fontSize: "11px", lineHeight: 1,
    };

    return (
        <div
            onClick={handleBlankClick}
            onContextMenu={(e) => {
                // iPhone Strategy (Build 69): Leave native menu alone.
                const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                if (isiOS) return;

                const target = e.target as HTMLElement;
                if (target.closest('.no-native-callout')) {
                    e.preventDefault();
                }
            }}
            style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", position: "relative" }}
        >
            {selectionPopup && (
                <SelectionPopup
                    selectionPopup={selectionPopup as any}
                    isSelecting={isSelecting}
                    handleCopySelection={handleCopySelection}
                    handleShadowSelection={handleShadowSelection}
                    handleAddSelectionAsSegment={handleAddSelectionAsSegment}
                    handleTranslateSelection={handleTranslateSelection}
                />
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
                                        {/* Build 93: Persistence slot trace */}
                                        {playback.material_id && (
                                            <span style={{ marginLeft: "8px", opacity: 0.6, fontSize: "10px" }}>
                                                [U:{debugUserId} M:{playback.material_id}]
                                            </span>
                                        )}
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
                                    <div className="ab-sidebar-content" style={{ padding: "16px 20px", paddingBottom: isIOS ? "calc(env(safe-area-inset-bottom, 24px) + 80px)" : "calc(env(safe-area-inset-bottom, 24px) + 16px)" }}>
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
                                    className="ab-sidebar-content no-native-callout"
                                    ref={transcriptContainerRef}
                                    style={{
                                        padding: "16px",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: (!modelExists || isTranscribing || words.length === 0) ? "center" : "stretch",
                                        justifyContent: (!modelExists || isTranscribing || words.length === 0) ? "center" : "flex-start",
                                        height: "100%",
                                        position: "relative",
                                        paddingBottom: /iPad|iPhone|iPod/.test(navigator.userAgent) ? "calc(env(safe-area-inset-bottom, 24px) + 80px)" : "24px"
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
                                                <TranscriptView
                                                    lines={transcriptLines}
                                                    position={position}
                                                    isPlaying={isPlaying}
                                                    activeTab={activeTab}
                                                    onWordClick={handleSeekTo}
                                                    materialId={playback.material_id}
                                                />
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
