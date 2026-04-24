import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
//import { useNavigate, useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { RotateCcw, X, Loader2, Play, Pause, Volume2 } from "lucide-react";
import { useToast } from "../../components/Toast";
import { PlaybackInfo, LearningMaterial } from "../../types";
import { useStudyPersistence } from "./hooks/useStudyPersistence";
import { useTranscript } from "./hooks/useTranscript";
import { useAudioEngine } from "./hooks/useAudioEngine";
import TranscriptView from "./components/Transcript";
import { formatTime, generateId } from "./utils";
import { resolveAndArchiveAudio, decodeSafe } from "../../utils/audioLoader";
import "./StudyWorkspace.css";

/**
 * Waveform Placeholder from original Golden layout
 */
const WaveformBars = ({ isPlaying }: { isPlaying: boolean }) => (
    <div className={`waveform-visualizer ${isPlaying ? 'playing' : ''}`} style={{ display: 'flex', gap: '4px', alignItems: 'center', height: '60px' }}>
        {[...Array(40)].map((_, i) => (
            <div key={i} className="v-bar" style={{
                width: '3px',
                height: `${Math.random() * 100}%`,
                background: 'var(--accent-primary)',
                opacity: 0.6,
                borderRadius: '1.5px',
                animation: isPlaying ? `waveform-bounce ${0.5 + Math.random()}s infinite ease-in-out` : 'none'
            }} />
        ))}
    </div>
);

export default function StudyWorkspaceMain() {
    const { t } = useTranslation();
    const { success: toastSuccess, error: toastError } = useToast();
    const navigate = useNavigate();
    // const location = useLocation();

    // Core States
    const [playback, setPlayback] = useState<PlaybackInfo | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [position, setPosition] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1.0);
    const [speed, setSpeed] = useState(1.0);
    const [activeTab, setActiveTab] = useState<'segments' | 'transcript' | 'dictation'>('segments');
    const [resumeData, setResumeData] = useState<any>(null);
    const [currentMaterial, setCurrentMaterial] = useState<LearningMaterial | null>(null);
    const [tempA, setTempA] = useState<number | null>(null);
    const isSeekingRef = useRef<number>(0); // Build 107.v3: Seek Lock
    const targetPositionRef = useRef<number | null>(null); // Build 107.v3: Target Anchor

    const pollState = useCallback(async () => {
        try {
            const state = await invoke<PlaybackInfo>("get_playback_state");
            if (state && state.file_path !== "") {
                const now = Date.now();
                const isSeeking = (now - isSeekingRef.current < 3000); // 3s lock

                if (isSeeking) {
                    // Logic Guard: During lock, UI stays pinned.
                    // console.log("[PollState] Locked! Manual seek in progress.");
                    if (targetPositionRef.current !== null) {
                        setPosition(targetPositionRef.current);
                        setPlayback(prev => prev ? { ...prev, position_secs: targetPositionRef.current! } : prev);
                    }
                    return;
                }

                targetPositionRef.current = null;
                setPlayback(state);
                setPosition(state.position_secs);
                setDuration(state.duration_secs);
                setIsPlaying(state.is_playing);
            } else {
                setPlayback(null);
            }
        } catch (e) {
            console.error("Polling error:", e);
        }
    }, [isSeekingRef, targetPositionRef]);

    // Modular Hooks
    const persistence = useStudyPersistence({
        playback, setPlayback, setPosition, setVolume, setSpeed, setIsPlaying, setResumeData, pollState
    });

    const transcript = useTranscript(playback);
    const audioEngine = useAudioEngine({
        playback, isPlaying, setIsPlaying, position, setPosition, duration, setVolume, setSpeed,
        isSeekingRef, targetPositionRef
    });

    // Detect platform
    const isMobile = useMemo(() => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent), []);

    // Bug fix: playback.file_name may be the internal archive path (e.g. "1775158885924_msf_10002394_…")
    // Priority: currentMaterial.title (if it looks like a real title) → extract from source_url → extract from file_path → file_name
    // For old incorrectly imported files: title might be just the prefix (all Chinese stripped out), so fall back to extraction
    const displayName = useMemo(() => {
        // If we have a currentMaterial title but it matches the prefix pattern (looks like 123_msf_456, 123_msf:456, or just msf:456),
        // it's probably an old incorrectly imported file - fall back to extraction from source_url
        const titleIsInvalid = currentMaterial?.title && /^(\d+_)?msf[_:]\d+$/.test(currentMaterial.title);

        if (currentMaterial?.title && !titleIsInvalid) {
            return decodeSafe(currentMaterial.title);
        }

        // Try extract from currentMaterial.source_url first (this always has the full actual path)
        let raw = currentMaterial?.source_url || playback?.file_path || playback?.file_name || "";
        const basename = raw.split(/[/\\]/).pop() || raw;

        // Strip internal archive timestamp prefix: digits_
        // e.g. "1775158885924_绝望主妇-S01E07.mp3" → "绝望主妇-S01E07.mp3"
        const cleaned = basename.replace(/^\d+_/, "");

        return decodeSafe(cleaned) || "Unknown";
    }, [currentMaterial?.title, currentMaterial?.source_url, playback?.file_path, playback?.file_name]);

    useEffect(() => {
        if (playback?.material_id) {
            invoke<LearningMaterial>("get_material", { id: playback.material_id })
                .then(mat => setCurrentMaterial(mat))
                .catch(() => setCurrentMaterial(null));
        }
    }, [playback?.material_id]);

    // On iOS, re-activate audio session when entering study workspace
    // Only re-activate session (non-blocking), do NOT call reinit_audio_output
    // because OutputStream::try_default() can block CoreAudio if session is unstable
    useEffect(() => {
        if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
            invoke("configure_play_and_record").catch(() => {});
        }
    }, []);

    // Build 107.v8: Stable polling loop at 250ms
    useEffect(() => {
        const interval = setInterval(pollState, 250);
        return () => clearInterval(interval);
    }, [pollState]);

    const handleOpenFile = async () => {
        const selected = await open({
            multiple: false,
            filters: [{ name: "Audio Files", extensions: ["mp3", "wav", "flac", "ogg", "m4a", "aac"] }],
        });
        if (selected) {
            const selectedPath = typeof selected === 'string' ? selected : selected[0];
            const rawFileName = selectedPath.split('/').pop() || selectedPath.split('\\').pop() || 'audio.mp3';
            const fileName = decodeSafe(rawFileName);
            try {
                const { destPath: finalPath, finalName } = await resolveAndArchiveAudio(selectedPath, fileName);
                const usedFileName = finalName || fileName;
                const info = await invoke<PlaybackInfo>("load_audio", { path: finalPath });
                const materialId: number = await invoke("add_or_update_material", {
                    title: usedFileName, // Use the final name (may be updated by Android with real filename)
                    source_url: finalPath,
                    duration_ms: info.duration_secs * 1000
                });

                setPlayback({
                    ...info,
                    material_id: materialId,
                    segments: [],
                    active_segment_id: null,
                    loop_remaining: null
                });
                setDuration(info.duration_secs);
                setPosition(0);
                persistence.checkAndLoadProgress(materialId, true);
            } catch (e) {
                toastError("Failed to load audio");
            }
        }
    };

    const handleMarkA = () => {
        setTempA(position);
        toastSuccess("Point A marked");
    };

    const handleMarkB = async () => {
        if (tempA === null || !playback) return;
        const a = Math.min(tempA, position);
        const b = Math.max(tempA, position);
        if (b - a < 0.1) return;

        try {
            const seg = { id: generateId(), start_secs: a, end_secs: b, loop_count: 0 };
            await invoke("add_segment", { segment: seg });
            setPlayback((prev: PlaybackInfo | null) => prev ? { ...prev, segments: [...prev.segments, seg] } : prev);
            setTempA(null);
            persistence.isDirtyRef.current = true;
            toastSuccess(t("workspace_v2.loop_added"));
        } catch (e) {
            toastError("Failed to add segment");
        }
    };

    const handleDeleteSegment = async (id: string) => {
        try {
            await invoke("remove_segment", { id });
            setPlayback((prev: PlaybackInfo | null) => prev ? { ...prev, segments: prev.segments.filter((s: any) => s.id !== id) } : prev);
            persistence.isDirtyRef.current = true;
        } catch (e) {
            toastError("Failed to delete");
        }
    };

    const handleAdjustSegmentTime = async (seg: any, field: 'start' | 'end', delta: number) => {
        let newStart = seg.start_secs;
        let newEnd = seg.end_secs;
        if (field === 'start') {
            newStart = Math.max(0, seg.start_secs + delta);
            if (newStart >= newEnd) return;
        } else {
            newEnd = Math.max(0, seg.end_secs + delta);
            if (newEnd <= newStart) return;
        }
        const updated = { ...seg, start_secs: newStart, end_secs: newEnd };
        try {
            await invoke("update_segment", { segment: updated });
            pollState();
            persistence.isDirtyRef.current = true;
        } catch (err) {
            console.error("[Segment] update failed:", err);
        }
    };

    // --- Loading Spinner ---
    if (persistence.isBooting && !playback) {
        return (
            <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)" }}>
                <Loader2 className="spinner" size={48} color="var(--accent-primary)" />
                <p style={{ marginTop: "20px", color: "var(--text-muted)" }}>Restoring session...</p>
            </div>
        );
    }

    return (
        <div className="study-workspace-main" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", position: "relative" }}>
            <div className="app-content" style={{ marginTop: "4px", flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {!playback ? (
                    <div className="welcome-container fade-in" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                        <div style={{ fontSize: "64px", marginBottom: "20px" }}>🎧</div>
                        <h2>{t("workspace_v2.study_mode")}</h2>
                        <p style={{ color: "var(--text-secondary)", maxWidth: "400px", margin: "0 auto 32px" }}>{t("workspace_v2.welcome_desc")}</p>
                        <button className="btn btn-primary" onClick={handleOpenFile} style={{ padding: "12px 24px", borderRadius: "12px" }}>
                            📂 {t("workspace_v2.open_file")}
                        </button>
                    </div>
                ) : (
                    <div className="main-workspace fade-in" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr 0.8fr", height: "100%", overflow: "hidden" }}>
                        {/* Left side: Main Player (Golden Style) */}
                        <div className="player-column" style={{ display: "flex", flexDirection: "column", borderRight: isMobile ? "none" : "1px solid var(--border-primary)", padding: "24px" }}>
                            <div className="player-info" style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "32px" }}>
                                <div style={{ fontSize: "32px" }}>🎵</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: "18px" }}>{displayName}</div>
                                    <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>{formatTime(duration)} · {speed}x</div>
                                </div>
                                <div style={{ display: "flex", gap: "8px" }}>
                                    <button className="btn btn-ghost" onClick={handleOpenFile}>📂</button>
                                    <button className="btn btn-ghost" onClick={() => navigate('/')}><X /></button>
                                </div>
                            </div>

                            <div className="waveform-area" style={{ flex: 1, background: "rgba(128,128,128,0.05)", borderRadius: "20px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "32px", minHeight: "120px" }}>
                                <WaveformBars isPlaying={isPlaying} />
                            </div>

                            <div className="player-controls">
                                <div className="progress-container" style={{ marginBottom: "24px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "12px", color: "var(--text-muted)" }}>
                                        <span>{formatTime(position)}</span>
                                        <span>{formatTime(duration)}</span>
                                    </div>
                                    <div className="progress-bar-wrapper" style={{ height: "6px", background: "var(--bg-tertiary)", borderRadius: "3px", position: "relative", cursor: "pointer" }}
                                        onClick={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const pct = (e.clientX - rect.left) / rect.width;
                                            audioEngine.handleSeek(pct * duration);
                                        }}>
                                        <div style={{ width: `${(position / (duration || 1)) * 100}%`, height: "100%", background: "var(--accent-primary)", borderRadius: "3px" }} />
                                        {tempA !== null && (
                                            <div style={{ position: "absolute", left: `${(tempA / duration) * 100}%`, top: "-6px", background: "var(--accent-primary)", color: "white", padding: "0 4px", fontSize: "10px", borderRadius: "4px" }}>A</div>
                                        )}
                                        {(playback.segments || []).map(seg => (
                                            <div key={seg.id} style={{
                                                position: "absolute",
                                                left: `${(seg.start_secs / duration) * 100}%`,
                                                width: `${((seg.end_secs - seg.start_secs) / duration) * 100}%`,
                                                height: "100%",
                                                background: seg.id === playback.active_segment_id ? "var(--accent-primary)" : "rgba(162, 155, 254, 0.3)",
                                                opacity: 0.5,
                                                borderRadius: "3px"
                                            }} />
                                        ))}
                                    </div>
                                </div>

                                <div style={{ display: "flex", justifyContent: "center", gap: "24px", alignItems: "center", marginBottom: "24px" }}>
                                    <button className="btn-ghost" style={{ fontSize: "20px" }} onClick={() => audioEngine.handleSkip(-5)}>⏪</button>
                                    <button className="btn-primary" style={{ width: "64px", height: "64px", borderRadius: "32px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" }}
                                        onClick={audioEngine.handlePlayPause}>
                                        {isPlaying ? <Pause /> : <Play fill="currentColor" />}
                                    </button>
                                    <button className="btn-ghost" style={{ fontSize: "20px" }} onClick={() => audioEngine.handleSkip(5)}>⏩</button>
                                </div>

                                <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                                    <button className="btn btn-secondary" onClick={handleMarkA} style={{ flex: 1, padding: "12px" }}>Mark A</button>
                                    <button className="btn btn-primary" onClick={handleMarkB} disabled={tempA === null} style={{ flex: 1, padding: "12px" }}>Mark B</button>
                                </div>

                                <div className="volume-speed" style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)" }}>
                                        <Volume2 size={16} />
                                        <input type="range" min="0" max="1" step="0.1" value={volume} onChange={(e) => audioEngine.handleVolumeChange(parseFloat(e.target.value))} />
                                    </div>
                                    <div style={{ display: "flex", gap: "8px" }}>
                                        {[0.8, 1, 1.25].map(s => (
                                            <button key={s} onClick={() => audioEngine.handleSpeedChange(s)} style={{
                                                padding: "4px 8px", borderRadius: "4px", fontSize: "12px",
                                                background: speed === s ? "var(--accent-primary)" : "var(--bg-tertiary)",
                                                color: speed === s ? "white" : "var(--text-secondary)"
                                            }}>{s}x</button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Sidebar: Tabs */}
                        <div className="sidebar-column" style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-secondary)" }}>
                            <div className="tab-header" style={{ display: "flex", borderBottom: "1px solid var(--border-primary)" }}>
                                <button className={`tab-btn ${activeTab === 'segments' ? 'active' : ''}`} onClick={() => setActiveTab('segments')} style={{ flex: 1, padding: "16px", borderBottom: activeTab === 'segments' ? "2px solid var(--accent-primary)" : "none" }}>Lists</button>
                                <button className={`tab-btn ${activeTab === 'transcript' ? 'active' : ''}`} onClick={() => setActiveTab('transcript')} style={{ flex: 1, padding: "16px", borderBottom: activeTab === 'transcript' ? "2px solid var(--accent-primary)" : "none" }}>Trans</button>
                            </div>

                            <div className="tab-content custom-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
                                {activeTab === 'segments' && (
                                    <div className="segments-list">
                                        {(playback.segments || []).length === 0 ? (
                                            <div style={{ textAlign: "center", color: "var(--text-muted)", marginTop: "40px" }}>No Segments</div>
                                        ) : (
                                            (playback.segments || []).map((seg, idx) => (
                                                <div key={seg.id} className="segment-card" style={{ background: "var(--bg-primary)", padding: "16px", borderRadius: "12px", marginBottom: "12px", border: seg.id === playback.active_segment_id ? "1px solid var(--accent-primary)" : "none" }}>
                                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                                                        <strong onClick={() => invoke("set_active_segment", { id: seg.id })} style={{ cursor: "pointer" }}>Segment {idx + 1}</strong>
                                                        <button onClick={() => handleDeleteSegment(seg.id)} style={{ color: "var(--accent-danger)", background: "none", border: "none" }}>🗑️</button>
                                                    </div>
                                                    <div style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "14px", color: "var(--text-muted)" }}>
                                                        <button onClick={() => handleAdjustSegmentTime(seg, 'start', -0.5)} style={{ padding: "2px 6px" }}>-</button>
                                                        <span>{formatTime(seg.start_secs)} - {formatTime(seg.end_secs)}</span>
                                                        <button onClick={() => handleAdjustSegmentTime(seg, 'end', 0.5)} style={{ padding: "2px 6px" }}>+</button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}

                                {activeTab === 'transcript' && (
                                    <div style={{ height: "100%", position: "relative" }}>
                                        {transcript.isTranscribing && (
                                            <div style={{ position: "absolute", top: 0, width: "100%", padding: "4px", background: "var(--accent-primary)", color: "white", fontSize: "12px", textAlign: "center" }}>
                                                {t("workspace_v2.processing")}: {transcript.transcribeProgress}%
                                            </div>
                                        )}
                                        <TranscriptView
                                            lines={transcript.transcriptLines}
                                            position={position}
                                            isPlaying={isPlaying}
                                            activeTab={activeTab}
                                            onWordClick={audioEngine.handleSeek} // Build 107.v4: Use correct lock-aware seek
                                            isMobile={isMobile}
                                            materialId={playback.material_id}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Resume Overlay */}
            {resumeData && (
                <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1001 }}>
                    <div className="modal-content" style={{ background: "var(--bg-primary)", padding: "32px", borderRadius: "24px", textAlign: "center", width: "90%", maxWidth: "400px" }}>
                        <RotateCcw size={48} color="var(--accent-primary)" style={{ marginBottom: "16px" }} />
                        <h3>{t("workspace_v2.resume_learning")}?</h3>
                        <p style={{ color: "var(--text-muted)", marginBottom: "24px" }}>Found progress at {formatTime(resumeData?.position_secs || 0)}</p>
                        <div style={{ display: "flex", gap: "12px" }}>
                            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setResumeData(null)}>No</button>
                            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => persistence.applyProgress(resumeData)}>Yes</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
