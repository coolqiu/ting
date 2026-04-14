import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useToast } from "../components/Toast";
import { diffWords } from "diff";
import { AudioRecorder } from "../utils/audioRecorder";
import { WordTimestamp } from "../types";

// ---- Types -----
interface DiffToken {
    value: string;
    added?: boolean;
    removed?: boolean;
}

interface ReferenceMeta {
    material_id: number | null;
    audio_path: string | null;
    start_ms: number | null;
    end_ms: number | null;
}


// ---- Sub-components ----

function WaveformBars({ isActive }: { isActive: boolean }) {
    const heights = [30, 55, 70, 45, 85, 60, 40, 75, 50, 65, 35, 80, 55, 45, 70];
    return (
        <div style={{ display: "flex", alignItems: "center", gap: "3px", height: "60px" }}>
            {heights.map((h, i) => (
                <div
                    key={i}
                    style={{
                        width: "4px",
                        height: isActive ? `${h}%` : "20%",
                        borderRadius: "2px",
                        background: "var(--accent-primary)",
                        opacity: isActive ? 1 : 0.3,
                        animation: isActive ? `barPulse ${0.6 + (i % 5) * 0.12}s ease-in-out infinite alternate` : "none",
                        transition: "height 0.3s ease",
                    }}
                />
            ))}
        </div>
    );
}

// ---- Main View ----

export function SpeakingView() {
    const { t } = useTranslation();
    const { error: toastError, success: toastSuccess } = useToast();
    const [step, setStep] = useState<"idle" | "recording" | "evaluating" | "result">("idle");
    const [referenceText, setReferenceText] = useState("");
    const [refMeta, setRefMeta] = useState<ReferenceMeta>({ material_id: null, audio_path: null, start_ms: null, end_ms: null });
    const [isPlayingRef, setIsPlayingRef] = useState(false);
    const [editingRef, setEditingRef] = useState(false);
    const [diffTokens, setDiffTokens] = useState<DiffToken[]>([]);
    const [score, setScore] = useState<number | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [wavBytes, setWavBytes] = useState<number[] | null>(null);
    const [transcribedText, setTranscribedText] = useState<string>("");
    const recorderRef = useRef<AudioRecorder | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [recordingSecs, setRecordingSecs] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
            if (timerRef.current) clearInterval(timerRef.current);
            if (recorderRef.current) {
                recorderRef.current.stop();
                recorderRef.current = null;
            }
            // Non-blocking cleanup: Unload audio to free resources
            invoke("unload_audio").catch(() => {});
        };
    }, []);


    const playReferenceAudio = async () => {
        if (!refMeta.audio_path) return;
        setIsPlayingRef(true);
        try {
            await invoke("load_audio", { path: refMeta.audio_path });
            if (refMeta.start_ms !== null) {
                await invoke("seek", { positionSecs: refMeta.start_ms / 1000 });
            } else {
                await invoke("play");
            }

            return new Promise<void>((resolve) => {
                const duration = (refMeta.end_ms !== null && refMeta.start_ms !== null)
                    ? (refMeta.end_ms - refMeta.start_ms)
                    : 3000;

                setTimeout(async () => {
                    await invoke("pause").catch(() => { });
                    setIsPlayingRef(false);
                    resolve();
                }, duration + 300);
            });
        } catch (e) {
            console.error("Failed to play reference:", e);
            setIsPlayingRef(false);
        }
    };

    const startShadowing = async () => {
        await playReferenceAudio();
        setTimeout(() => {
            startRecording();
        }, 400);
    };

    useEffect(() => {
        const fetchInitial = async () => {
            try {
                const res = await invoke<any>("get_reference_text");
                if (res && res.text && isMounted.current) {
                    setReferenceText(res.text.trim());
                    setRefMeta({
                        material_id: res.material_id,
                        audio_path: res.audio_path,
                        start_ms: res.start_ms,
                        end_ms: res.end_ms
                    });
                }
            } catch (e) {
                console.warn("get_reference_text failed:", e);
            }
        };
        fetchInitial();
        invoke("pause").catch(() => { });
    }, []);

    const startRecording = useCallback(async () => {
        try {
            const recorder = new AudioRecorder();
            recorderRef.current = recorder;
            await recorder.start();
            setStep("recording");
            setRecordingSecs(0);
            timerRef.current = setInterval(() => setRecordingSecs(s => s + 1), 1000);
        } catch (e) {
            toastError(t("speaking.micError", { error: String(e) }));
        }
    }, [t, toastError]);

    const stopRecording = useCallback(async () => {
        if (!recorderRef.current) return;
        if (timerRef.current) clearInterval(timerRef.current);

        const blob = recorderRef.current.stop();
        recorderRef.current = null;

        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setStep("evaluating");

        try {
            const arrayBuffer = await blob.arrayBuffer();
            const bytes = Array.from(new Uint8Array(arrayBuffer));
            setWavBytes(bytes);
            const tempPath = await invoke<string>("save_temp_audio", { bytes });

            const words = await invoke<WordTimestamp[]>("transcribe_audio", { path: tempPath });
            if (!isMounted.current) return;

            const transcribed = words.length > 0 ? words.map(w => w.word).join(" ") : "";
            setTranscribedText(transcribed);

            const finalScore = computeBasicScore(referenceText, transcribed);
            setStep("result");

            // --- Persistence Logic (Build 77) ---
            let archivedPath: string | null = null;
            if (finalScore >= 80) {
                try {
                    archivedPath = await invoke<string>("archive_recording", { tempPath });
                } catch (err) {
                    console.warn("Failed to archive recording:", err);
                }
            }

            // Always save the score to history, even if score < 80 (archivedPath will be null)
            await invoke("save_pronunciation_score", {
                materialId: refMeta.material_id || 0,
                referenceText: referenceText,
                durationMs: recordingSecs * 1000,
                score: finalScore,
                audioPath: archivedPath
            });

        } catch (e) {
            if (isMounted.current) {
                toastError(t("speaking.evalFail", { error: String(e) }));
                setStep("idle");
            }
        }
    }, [referenceText, t, toastError, recordingSecs, refMeta.material_id]);

    const computeBasicScore = (ref: string, trans: string): number => {
        const diff = diffWords(ref, trans) as DiffToken[];
        setDiffTokens(diff);
        const correctChars = diff
            .filter(d => !d.added && !d.removed)
            .reduce((acc, d) => acc + d.value.length, 0);
        const refChars = ref.replace(/\s+/g, " ").length || 1;
        const s = Math.max(0, Math.min(100, Math.round((correctChars / refChars) * 100)));
        setScore(s);
        return s;
    };

    const reset = useCallback(() => {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setStep("idle");
        setDiffTokens([]);
        setScore(null);
        setAudioUrl(null);
        setWavBytes(null);
        setTranscribedText("");
        setRecordingSecs(0);
    }, [audioUrl]);

    const handleSaveRecording = useCallback(async () => {
        if (!wavBytes) return;
        try {
            await invoke("save_recording_as", { bytes: wavBytes });
            toastSuccess(t("common.success"));
        } catch (e) {
            toastError(String(e));
        }
    }, [wavBytes, t, toastError, toastSuccess]);

    const handleAdjustRefTime = async (field: 'start' | 'end', deltaSecs: number) => {
        if (refMeta.audio_path === null || refMeta.start_ms === null || refMeta.end_ms === null) return;
        let newStartMs = refMeta.start_ms;
        let newEndMs = refMeta.end_ms;
        if (field === 'start') {
            newStartMs = Math.max(0, refMeta.start_ms + deltaSecs * 1000);
            if (newStartMs >= newEndMs) return;
        } else {
            newEndMs = Math.max(0, refMeta.end_ms + deltaSecs * 1000);
            if (newEndMs <= newStartMs) return;
        }
        const updated = { ...refMeta, start_ms: newStartMs, end_ms: newEndMs };
        setRefMeta(updated);
        await invoke("set_shadowing_override", {
            text: referenceText,
            audioPath: refMeta.audio_path,
            startMs: newStartMs,
            endMs: newEndMs,
        }).catch(e => console.error("set_shadowing_override failed:", e));
    };

    const formatSecs = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

    const scoreColor = score === null ? "#fff"
        : score >= 80 ? "#4caf50"
            : score >= 50 ? "#ff9800"
                : "#f44336";

    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "auto", padding: "32px 48px", maxWidth: "960px", margin: "0 auto", width: "100%", gap: "24px" }}>

                {/* Header */}
                <div>
                    <h2 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "6px" }}>{t("speaking.title")}</h2>
                    <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>{t("speaking.subtitle")}</p>
                </div>

                {/* Reference Sentence Card */}
                <div style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-lg)",
                    padding: "24px",
                }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            {t("speaking.referenceLabel")}
                        </span>
                        {!editingRef && step === "idle" && (
                            <div style={{ display: "flex", gap: "6px" }}>
                                {refMeta.audio_path && (
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={playReferenceAudio}
                                        disabled={isPlayingRef}
                                        style={{ fontSize: "12px", padding: "4px 10px", color: "var(--accent-primary)" }}
                                    >
                                        {isPlayingRef ? t("speaking.playing") : t("speaking.playRef")}
                                    </button>
                                )}
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => setEditingRef(true)}
                                    style={{ fontSize: "12px", padding: "4px 10px" }}
                                >
                                    {t("speaking.edit")}
                                </button>
                            </div>
                        )}
                    </div>

                    {editingRef ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <textarea
                                value={referenceText}
                                onChange={e => setReferenceText(e.target.value)}
                                rows={4}
                                style={{
                                    width: "100%", resize: "none", padding: "12px",
                                    borderRadius: "8px", border: "1px solid var(--border-medium)",
                                    background: "var(--bg-primary)", color: "var(--text-primary)",
                                    fontSize: "15px", fontFamily: "inherit", outline: "none",
                                }}
                            />
                            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                <button className="btn btn-primary btn-sm" onClick={() => setEditingRef(false)}>
                                    {t("common.confirm")}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <p style={{ 
                            fontSize: "17px", 
                            lineHeight: 1.8, 
                            color: "var(--text-primary)", 
                            fontWeight: 500,
                            wordBreak: "break-word",
                            overflowWrap: "break-word",
                            textAlign: "center"
                        }}>
                            {referenceText}
                        </p>
                    )}

                    {/* Clip timestamp adjustment */}
                    {refMeta.start_ms !== null && refMeta.end_ms !== null && step === "idle" && (
                        <div style={{
                            marginTop: "12px", paddingTop: "12px",
                            borderTop: "1px solid var(--border-subtle)",
                            display: "flex", gap: "24px", flexWrap: "wrap",
                            fontSize: "12px", color: "var(--text-secondary)",
                        }}>
                            {(['start', 'end'] as const).map(field => (
                                <div key={field} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span style={{ color: "var(--text-muted)", minWidth: "24px" }}>
                                        {field === 'start' ? t("speaking.start") : t("speaking.end")}
                                    </span>
                                    <button
                                        onClick={() => handleAdjustRefTime(field, -1)}
                                        style={{ border: "none", background: "var(--bg-tertiary)", color: "var(--text-secondary)", cursor: "pointer", padding: "2px 7px", borderRadius: "4px", fontSize: "12px" }}
                                    >◀ -1s</button>
                                    <span style={{ fontFamily: "monospace", minWidth: "40px", textAlign: "center" }}>
                                        {formatSecs(Math.round((field === 'start' ? refMeta.start_ms! : refMeta.end_ms!) / 1000))}
                                    </span>
                                    <button
                                        onClick={() => handleAdjustRefTime(field, 1)}
                                        style={{ border: "none", background: "var(--bg-tertiary)", color: "var(--text-secondary)", cursor: "pointer", padding: "2px 7px", borderRadius: "4px", fontSize: "12px" }}
                                    >+1s ▶</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Control Card */}
                <div style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-lg)",
                    padding: "32px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "24px",
                }}>
                    {/* State: idle */}
                    {step === "idle" && (
                        <>
                            <div style={{ fontSize: "56px" }}>🎤</div>
                            <p style={{ color: "var(--text-secondary)", textAlign: "center", fontSize: "14px" }}>
                                {t("speaking.readyPrompt")}
                            </p>
                            <div style={{ display: "flex", gap: "16px" }}>
                                <button
                                    className="btn btn-primary"
                                    onClick={startRecording}
                                    style={{ padding: "14px 32px", fontSize: "15px", borderRadius: "32px" }}
                                >
                                    {t("speaking.startRecord")}
                                </button>
                                {refMeta.audio_path && (
                                    <button
                                        className="btn"
                                        onClick={startShadowing}
                                        disabled={isPlayingRef}
                                        style={{
                                            padding: "14px 32px", fontSize: "15px", borderRadius: "32px",
                                            background: "var(--bg-tertiary)", color: "var(--accent-primary)",
                                            border: "1px solid var(--accent-subtle)"
                                        }}
                                    >
                                        {t("speaking.shadowRead")}
                                    </button>
                                )}
                            </div>
                        </>
                    )}

                    {/* State: recording */}
                    {step === "recording" && (
                        <>
                            <div style={{ color: "var(--error)", fontSize: "14px", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "var(--error)", display: "inline-block", animation: "pulse 1s infinite" }} />
                                {t("speaking.recording")} {formatSecs(recordingSecs)}
                            </div>
                            <WaveformBars isActive={true} />
                            <button
                                className="btn"
                                onClick={stopRecording}
                                style={{
                                    padding: "14px 48px", fontSize: "16px", borderRadius: "32px",
                                    background: "var(--error)", color: "#fff",
                                }}
                            >
                                {t("speaking.stopRecord")}
                            </button>
                        </>
                    )}

                    {/* State: evaluating */}
                    {step === "evaluating" && (
                        <>
                            <div className="spinner" style={{ margin: "0 auto" }} />
                            <p style={{ color: "var(--accent-primary)", fontWeight: 600 }}>{t("speaking.evaluating")}</p>
                        </>
                    )}

                    {/* State: result */}
                    {step === "result" && (
                        <>
                            {/* Score Ring */}
                            <div style={{
                                width: "100px", height: "100px", borderRadius: "50%",
                                border: `6px solid ${scoreColor}`,
                                display: "flex", flexDirection: "column",
                                alignItems: "center", justifyContent: "center",
                                boxShadow: `0 0 24px ${scoreColor}55`,
                            }}>
                                <span style={{ fontSize: "28px", fontWeight: 700, color: scoreColor }}>{score}</span>
                                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{t("speaking.score")}</span>
                            </div>

                            {/* Playback */}
                            {audioUrl && (
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", width: "100%" }}>
                                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{t("speaking.playback")}</span>
                                    <audio ref={audioRef} src={audioUrl} controls style={{ width: "100%", maxWidth: "400px" }} />
                                </div>
                            )}

                            {/* Recognized Speech */}
                            {transcribedText && (
                                <div style={{ background: "var(--bg-primary)", borderRadius: "var(--radius-md)", padding: "14px 18px", width: "100%", fontSize: "14px" }}>
                                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                        {t("speaking.recognized")}
                                    </div>
                                    <p style={{ color: "var(--text-secondary)", lineHeight: 1.7 }}>{transcribedText}</p>
                                </div>
                            )}


                            {/* Word-level Diff */}
                            {diffTokens.length > 0 && (
                                <div style={{
                                    background: "var(--bg-primary)",
                                    borderRadius: "var(--radius-md)",
                                    padding: "20px",
                                    width: "100%",
                                    lineHeight: 2.2,
                                    fontSize: "15px",
                                }}>
                                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                        {t("speaking.wordDiff")}
                                    </div>
                                    <div>
                                        {diffTokens.map((token, i) => {
                                            if (token.removed) {
                                                return (
                                                    <span key={i} style={{
                                                        background: "rgba(244,67,54,0.15)",
                                                        color: "#f44336",
                                                        borderRadius: "4px",
                                                        padding: "2px 4px",
                                                        marginRight: "2px",
                                                        textDecoration: "line-through",
                                                        fontSize: "13px",
                                                    }}>
                                                        {token.value}
                                                    </span>
                                                );
                                            }
                                            if (token.added) {
                                                return (
                                                    <span key={i} style={{
                                                        background: "rgba(255,152,0,0.15)",
                                                        color: "#ff9800",
                                                        borderRadius: "4px",
                                                        padding: "2px 4px",
                                                        marginRight: "2px",
                                                        fontSize: "13px",
                                                    }}>
                                                        {token.value}
                                                    </span>
                                                );
                                            }
                                            return (
                                                <span key={i} style={{
                                                    color: "#4caf50",
                                                    fontWeight: 600,
                                                    marginRight: "2px",
                                                }}>
                                                    {token.value}
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <div style={{ display: "flex", gap: "20px", marginTop: "16px", fontSize: "12px" }}>
                                        <span style={{ color: "#4caf50" }}>{t("speaking.correct")}</span>
                                        <span style={{ color: "#f44336" }}>{t("speaking.missed")}</span>
                                        <span style={{ color: "#ff9800" }}>{t("speaking.extra")}</span>
                                    </div>
                                </div>
                            )}

                            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
                                <button className="btn btn-primary" onClick={reset} style={{ padding: "12px 40px", borderRadius: "32px" }}>
                                    {t("speaking.tryAgain")}
                                </button>
                                {wavBytes && (
                                    <button className="btn btn-ghost" onClick={handleSaveRecording} style={{ padding: "12px 28px", borderRadius: "32px" }}>
                                        {t("speaking.saveRecording")}
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Tips */}
                {step === "idle" && (
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", textAlign: "center" }}>
                        {t("speaking.tip")}
                    </div>
                )}
            </div>
        </div>
    );
}

