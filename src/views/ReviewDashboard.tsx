import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function ReviewDashboard() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [dueReviews, setDueReviews] = useState<number>(0);
    const [accuracy, setAccuracy] = useState<number>(0);

    useEffect(() => {
        async function fetchStats() {
            try {
                const dueCount = await invoke<number>("get_due_reviews_count");
                setDueReviews(dueCount);

                const recentAcc = await invoke<number>("get_recent_accuracy", { limit: 20 });
                setAccuracy(recentAcc);
            } catch (err) {
                console.error("Failed to load review stats:", err);
            }
        }
        fetchStats();
    }, []);

    return (
        <div className="view-container fade-in">
            <div className="view-header">
                <h2>{t("nav.review")}</h2>
                <p>{t("review.reviewAllDesc")}</p>
            </div>

            <div className="view-content">
                <div className="dashboard-stats">
                    <div className="stat-card">
                        <div className="stat-value">{dueReviews}</div>
                        <div className="stat-label">{t("review.dueToday")}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{accuracy.toFixed(1)}%</div>
                        <div className="stat-label">{t("review.recentAccuracy")}</div>
                    </div>
                </div>

                <div className="review-actions" style={{ marginTop: '24px', display: 'flex', gap: '16px', justifyContent: 'center' }}>
                    <button
                        className="btn btn-primary"
                        disabled={dueReviews === 0}
                        style={{ padding: '12px 32px', fontSize: '16px' }}
                        onClick={() => navigate("/review/session?mode=due")}
                    >
                        {dueReviews > 0 ? t("review.startReview") : t("review.allDone")}
                    </button>
                    <button
                        className="btn btn-ghost"
                        style={{ padding: '12px 32px', fontSize: '16px', border: '1px solid var(--border-medium)' }}
                        onClick={() => navigate("/review/session?mode=all")}
                    >
                        {t("review.reviewAll")}
                    </button>
                </div>
            </div>
        </div>
    );
}
