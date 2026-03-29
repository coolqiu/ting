import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useToast } from "../components/Toast";
import { ChevronLeft, Play, Pause, RefreshCcw, SkipForward } from "lucide-react";

interface DueExercise {
    id: number;
    material_id: number;
    start_ms: number;
    end_ms: number;
    original_text: string;
    source_url: string;
    title: string;
}

export function ReviewSessionView() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { success, error: toastError } = useToast();

    const [exercises, setExercises] = useState<DueExercise[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [userInput, setUserInput] = useState("");
    const [showResult, setShowResult] = useState(false);
    const [score, setScore] = useState<number | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [startTime, setStartTime] = useState<number>(Date.now());
    const playTimeoutRef = useRef<any>(null);

    const currentExercise = exercises[currentIndex];

    // Get mode from URL
    const searchParams = new URLSearchParams(window.location.search);
    const mode = searchParams.get("mode") || "due";

    useEffect(() => {
        async function loadExercises() {
            try {
                const command = mode === "all" ? "get_all_exercises" : "get_due_exercises";
                const res = await invoke<DueExercise[]>(command);
                setExercises(res);
                if (res.length > 0) {
                    await prepareExercise(res[0]);
                }
            } catch (err) {
                console.error(err);
                toastError(String(err));
            } finally {
                setLoading(false);
            }
        }
        loadExercises();

        return () => {
            if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
            invoke("stop").catch(() => { });
        };
    }, []);

    const prepareExercise = async (ex: DueExercise) => {
        try {
            await invoke("load_audio", { path: ex.source_url });
            await invoke("seek", { positionSecs: ex.start_ms / 1000 });
            // In our backend, seek might auto-play if no sink exists.
            // Explicitly pause so we don't auto-play on switch unless we want to.
            await invoke("pause");
            setIsPlaying(false);

            setStartTime(Date.now());
            setUserInput("");
            setShowResult(false);
            setScore(null);
        } catch (err) {
            console.error(err);
        }
    };

    const handlePlay = async () => {
        if (!currentExercise) return;

        if (isPlaying) {
            try {
                await invoke("pause");
                setIsPlaying(false);
                if (playTimeoutRef.current) {
                    clearTimeout(playTimeoutRef.current);
                    playTimeoutRef.current = null;
                }
            } catch (err) {
                console.error(err);
            }
            return;
        }

        try {
            await invoke("seek", { positionSecs: currentExercise.start_ms / 1000 });
            await invoke("play");
            setIsPlaying(true);

            if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);

            // Auto stop at end_ms
            const duration = currentExercise.end_ms - currentExercise.start_ms;
            playTimeoutRef.current = setTimeout(async () => {
                await invoke("pause");
                setIsPlaying(false);
                playTimeoutRef.current = null;
            }, duration + 100);
        } catch (err) {
            console.error(err);
        }
    };

    const handleSubmit = async () => {
        if (!currentExercise || showResult) return;

        const timeSpent = Date.now() - startTime;
        try {
            // Simple scoring for now (similar to StudyWorkspace)
            // In a real app, logic would be in Rust or a shared util
            const s = calculateScore(userInput, currentExercise.original_text);
            setScore(s);
            setShowResult(true);

            await invoke("submit_dictation_score", {
                materialId: currentExercise.material_id,
                startMs: currentExercise.start_ms,
                endMs: currentExercise.end_ms,
                originalText: currentExercise.original_text,
                userInput: userInput,
                score: s,
                timeSpentMs: timeSpent
            });

            success(t("common.success"));
        } catch (err) {
            toastError(String(err));
        }
    };

    const calculateScore = (input: string, original: string) => {
        const clean = (s: string) => s.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").trim();
        const inputWords = clean(input).split(/\s+/);
        const originalWords = clean(original).split(/\s+/);

        let matches = 0;
        originalWords.forEach(w => {
            if (inputWords.includes(w)) matches++;
        });

        return Math.round((matches / originalWords.length) * 100);
    };

    const nextExercise = async () => {
        if (currentIndex < exercises.length - 1) {
            const nextIdx = currentIndex + 1;
            setCurrentIndex(nextIdx);
            await prepareExercise(exercises[nextIdx]);
        } else {
            navigate("/review");
        }
    };

    if (loading) return <div className="view-container"><div className="spinner" /></div>;

    if (exercises.length === 0) {
        return (
            <div className="view-container fade-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "64px", marginBottom: "24px" }}>🎉</div>
                    <h2>{t("review.allDone")}</h2>
                    <button className="btn btn-primary" onClick={() => navigate("/review")} style={{ marginTop: "24px" }}>
                        {t("common.back")}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="view-container fade-in">
            <header className="view-header">
                <button className="btn btn-ghost btn-sm" onClick={() => navigate("/review")} style={{ marginRight: "12px" }}>
                    <ChevronLeft size={20} />
                </button>
                <div>
                    <h1>{t("review.title")}</h1>
                    <p className="subtitle">{currentIndex + 1} / {exercises.length} - {currentExercise.title}</p>
                </div>
            </header>

            <div className="view-content" style={{ maxWidth: "800px", margin: "0 auto", padding: "20px" }}>
                <div className="card" style={{ padding: "32px", background: "var(--bg-secondary)", borderRadius: "24px", boxShadow: "0 12px 48px rgba(0,0,0,0.2)" }}>
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: "32px" }}>
                        <button
                            className={`btn ${isPlaying ? 'btn-ghost' : 'btn-primary'}`}
                            onClick={handlePlay}
                            style={{ width: "80px", height: "80px", borderRadius: "50%", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                            {isPlaying ? <Pause size={32} /> : <Play size={32} style={{ marginLeft: "4px" }} />}
                        </button>
                    </div>

                    <div style={{ marginBottom: "24px" }}>
                        <textarea
                            className="textarea-input"
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            placeholder={t("workspace_v2.dictation_placeholder")}
                            disabled={showResult}
                            onKeyDown={(e) => {
                                if (e.ctrlKey && e.key === "Enter") handleSubmit();
                            }}
                        />
                    </div>

                    {!showResult ? (
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <button className="btn btn-primary" onClick={handleSubmit} disabled={!userInput.trim()}>
                                {t("workspace_v2.dictation_submit_btn")}
                            </button>
                        </div>
                    ) : (
                        <div className="fade-in" style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "24px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                                <div style={{ fontSize: "24px", fontWeight: 700, color: score! >= 80 ? "var(--success)" : "var(--accent-primary)" }}>
                                    {t("workspace_v2.dictation_score_label")}: {score}%
                                </div>
                                <div style={{ display: "flex", gap: "12px" }}>
                                    <button className="btn btn-ghost" onClick={() => prepareExercise(currentExercise)}>
                                        <RefreshCcw size={18} style={{ marginRight: "8px" }} />
                                        {t("review.retry")}
                                    </button>
                                    <button className="btn btn-primary" onClick={nextExercise}>
                                        {currentIndex < exercises.length - 1 ? t("review.nextItem") : t("review.finishReview")}
                                        <SkipForward size={18} style={{ marginLeft: "8px" }} />
                                    </button>
                                </div>
                            </div>

                            <div style={{ background: "var(--bg-primary)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-subtle)" }}>
                                <div style={{ color: "var(--text-muted)", fontSize: "12px", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "1px" }}>
                                    {t("workspace_v2.dictation_original_text")}
                                </div>
                                <div style={{ fontSize: "16px", lineHeight: "1.6", fontWeight: 500 }}>
                                    {currentExercise.original_text}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
