import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Headphones, SkipForward, Play, Pause, Volume2, RotateCcw, Trash2, List, Subtitles, X, Loader2 } from "lucide-react";
import { useToast } from "../../components/Toast";
import { PlaybackInfo, LearningMaterial } from "../../types";
import { useStudyPersistence } from "./hooks/useStudyPersistence";
import { useTranscript } from "./hooks/useTranscript";
import { useAudioEngine } from "./hooks/useAudioEngine";
import TranscriptView from "./components/Transcript";
import { formatTime, generateId } from "./utils";
import { resolveAndArchiveAudio, decodeSafe } from "../../utils/audioLoader";
import "./StudyWorkspace.css";

export default function StudyWorkspaceDesktop() {
    const { t } = useTranslation();
    const { success: toastSuccess, error: toastError } = useToast();
    const navigate = useNavigate();

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

    const pollState = useCallback(async () => {
        try {
            const state = await invoke<PlaybackInfo>("get_playback_state");
            if (state && state.file_path !== "") {
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
    }, []);

    const persistence = useStudyPersistence({
        playback, setPlayback, setPosition, setVolume, setSpeed, setIsPlaying, setResumeData, pollState
    });

    const isSeekingRef = useRef(0);
    const targetPositionRef = useRef<number | null>(null);
    const transcript = useTranscript(playback);
    const audioEngine = useAudioEngine({
        playback, isPlaying, setIsPlaying, position, setPosition, duration, setVolume, setSpeed,
        isSeekingRef, targetPositionRef
    });

    useEffect(() => {
        if (playback?.material_id) {
            invoke<LearningMaterial>("get_material", { id: playback.material_id })
                .then(mat => setCurrentMaterial(mat))
                .catch(() => setCurrentMaterial(null));
        }
    }, [playback?.material_id]);

    const handleOpenFile = async () => {
        const selected = await open({
            multiple: false,
            filters: [{ name: "Audio Files", extensions: ["mp3", "wav", "flac", "ogg", "m4a", "aac"] }],
        });
        if (selected) {
            const selectedPath = typeof selected === 'string' ? selected : selected[0];
            const fileName = decodeSafe(selectedPath.split(/[/\\]/).pop() || 'audio.mp3');
            try {
                const finalPath = await resolveAndArchiveAudio(selectedPath, fileName);
                const info = await invoke<PlaybackInfo>("load_audio", { path: finalPath });
                const materialId: number = await invoke("add_or_update_material", {
                    title: info.file_name ? decodeSafe(info.file_name) : fileName,
                    sourceUrl: finalPath,
                    durationMs: info.duration_secs * 1000
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
            await invoke("delete_segment", { id });
            setPlayback((prev: PlaybackInfo | null) => prev ? { ...prev, segments: prev.segments.filter((s: any) => s.id !== id) } : prev);
            persistence.isDirtyRef.current = true;
        } catch (e) {
            toastError("Failed to delete");
        }
    };

    if (persistence.isBooting && !playback) {
        return (
            <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)" }}>
                <Loader2 className="spinner" size={48} color="var(--accent-primary)" />
                <p style={{ marginTop: "20px", color: "var(--text-muted)" }}>Restoring session...</p>
            </div>
        );
    }

    return (
        <div className="study-workspace-desktop">
            <header className="workspace-header">
                <div className="file-info">
                    < Headphones className="icon" />
                    <div>
                        <h3>{currentMaterial?.title || playback?.file_name || "New Study"}</h3>
                        <p className="dimmed">{formatTime(position)} / {formatTime(duration)}</p>
                    </div>
                </div>
                <div className="header-actions">
                    <button className="btn-secondary" onClick={handleOpenFile}>Open File</button>
                    <button className="btn-icon" onClick={() => navigate('/')}><X /></button>
                </div>
            </header>

            {playback ? (
                <main className="workspace-content">
                    <div className="player-panel">
                        <div className="waveform-display">
                            <div className="progress-track" style={{ height: '4px', background: 'var(--bg-tertiary)', borderRadius: '2px', position: 'relative' }}>
                                <div className="progress-fill" style={{ width: `${(position / (duration || 1)) * 100}%`, height: '100%', background: 'var(--accent-primary)', borderRadius: '2px' }}></div>
                            </div>
                        </div>

                        <div className="controls-row">
                            <button className="btn-control" onClick={() => audioEngine.handleSkip(-5)}><RotateCcw /></button>
                            <button className="btn-playpause" onClick={audioEngine.handlePlayPause}>
                                {isPlaying ? <Pause size={32} /> : <Play size={32} />}
                            </button>
                            <button className="btn-control" onClick={() => audioEngine.handleSkip(5)}><SkipForward /></button>
                        </div>

                        <div className="tools-row" style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            <button className="btn-action" onClick={handleMarkA} style={{ border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)' }}>Mark A</button>
                            <button className="btn-action" onClick={handleMarkB} disabled={tempA === null} style={{ background: 'var(--accent-primary)', color: 'white', opacity: tempA === null ? 0.5 : 1 }}>Mark B</button>
                        </div>

                        <div className="volume-speed">
                            <div className="volume-slider">
                                <Volume2 size={16} />
                                <input type="range" min="0" max="1" step="0.1" value={volume} onChange={(e) => audioEngine.handleVolumeChange(parseFloat(e.target.value))} />
                            </div>
                            <div className="speed-selector">
                                {[0.5, 0.75, 1, 1.25, 1.5, 2].map(s => (
                                    <button key={s} className={speed === s ? "active" : ""} onClick={() => audioEngine.handleSpeedChange(s)}>{s}x</button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <aside className="sidebar-tabs">
                        <nav className="tab-navigation">
                            <button className={activeTab === 'segments' ? "active" : ""} onClick={() => setActiveTab('segments')}><List /> Segments</button>
                            <button className={activeTab === 'transcript' ? "active" : ""} onClick={() => setActiveTab('transcript')}><Subtitles /> Transcript</button>
                        </nav>

                        <div className="tab-viewport custom-scrollbar">
                            {activeTab === 'segments' && (
                                <div className="segments-list" style={{ padding: '20px' }}>
                                    {playback.segments.length === 0 ? (
                                        <p className="dimmed">No segments. Use A/B to mark.</p>
                                    ) : (
                                        playback.segments.map((seg: any, idx: number) => (
                                            <div key={seg.id} className="segment-card" style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '12px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <strong>Segment {idx + 1}</strong>
                                                    <p className="dimmed">{formatTime(seg.start_secs)} - {formatTime(seg.end_secs)}</p>
                                                </div>
                                                <button className="icon-btn-danger" onClick={() => handleDeleteSegment(seg.id)}><Trash2 size={16} /></button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {activeTab === 'transcript' && (
                                <div style={{ height: '100%', position: 'relative' }}>
                                    {transcript.isTranscribing && (
                                        <div style={{ position: 'absolute', top: 10, right: 10, background: 'var(--bg-primary)', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', color: 'var(--accent-primary)', zIndex: 10 }}>
                                            Transcribing: {transcript.transcribeProgress}%
                                        </div>
                                    )}
                                    <TranscriptView
                                        lines={transcript.transcriptLines}
                                        position={position}
                                        isPlaying={isPlaying}
                                        activeTab={activeTab}
                                        onWordClick={(p: number) => invoke("seek", { positionSecs: p })}
                                        isMobile={false}
                                        materialId={playback.material_id}
                                    />
                                </div>
                            )}
                        </div>
                    </aside>
                </main>
            ) : (
                <div className="empty-workspace">
                    < Headphones size={64} className="icon-pulse" />
                    <h2>Mastery Ready</h2>
                    <p className="dimmed">Load an audio file to begin specialized training.</p>
                    <button className="btn-primary" onClick={handleOpenFile}>Open Audio Source</button>
                </div>
            )}

            {resumeData && (
                <div className="modal-overlay">
                    <div className="resume-modal">
                        <RotateCcw size={48} color="var(--accent-primary)" style={{ margin: '0 auto 20px', display: 'block' }} />
                        <h3>Resume Learning?</h3>
                        <p style={{ textAlign: "center", color: "var(--text-muted)", marginBottom: "32px", lineHeight: "1.6" }}>
                            Found saved progress from {formatTime(resumeData.position_secs || 0)}.
                        </p>
                        <div className="modal-actions" style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                            <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setResumeData(null)}>Start Over</button>
                            <button className="btn-primary" style={{ flex: 1 }} onClick={() => persistence.applyProgress(resumeData)}>Restore</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
