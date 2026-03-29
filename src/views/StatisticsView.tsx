import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { Clock, Target, Calendar, Layout } from "lucide-react";

interface DailyStat {
    date: string;
    minutes: number;
    avg_score: number;
}

interface MaterialDistribution {
    mastered: number;
    learning: number;
    new: number;
}

interface PronunciationLog {
    id: number;
    reference_text: string;
    score: number;
    created_at: string;
}

export function StatisticsView() {
    const { t } = useTranslation();
    const [stats, setStats] = useState<DailyStat[]>([]);
    const [distribution, setDistribution] = useState<MaterialDistribution | null>(null);
    const [pronunciationLogs, setPronunciationLogs] = useState<PronunciationLog[]>([]);
    const [days, setDays] = useState(7);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            try {
                const s = await invoke<DailyStat[]>("get_daily_study_stats", { days });
                setStats(s);
                const d = await invoke<MaterialDistribution>("get_material_distribution");
                setDistribution(d);
                const p = await invoke<PronunciationLog[]>("get_pronunciation_history", { limit: 50 });
                setPronunciationLogs(p.reverse()); // Put newest on the right
            } catch (err) {
                console.error("Failed to fetch stats:", err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [days]);

    const totalMinutes = stats.reduce((acc, curr) => acc + curr.minutes, 0);
    const avgAccuracy = stats.filter(s => s.avg_score > 0).length > 0
        ? stats.filter(s => s.avg_score > 0).reduce((acc, curr) => acc + curr.avg_score, 0) / stats.filter(s => s.avg_score > 0).length
        : 0;

    const streak = 0; // Placeholder for future implementation

    const distributionData = distribution ? [
        { name: t("stats.mastered"), value: distribution.mastered, color: "#4caf50" },
        { name: t("stats.learning"), value: distribution.learning, color: "#6c63ff" },
        { name: t("stats.new"), value: distribution.new, color: "#5f6577" },
    ] : [];

    if (loading && stats.length === 0) return <div className="view-container"><div className="spinner" /></div>;

    return (
        <div className="view-container fade-in">
            <header className="view-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div>
                    <h2 style={{ fontSize: "20px", margin: 0 }}>{t("stats.title")}</h2>
                </div>
                <div style={{ display: "flex", gap: "6px", background: "var(--bg-secondary)", padding: "3px", borderRadius: "10px" }}>
                    <button
                        className={`btn btn-sm ${days === 7 ? "btn-primary" : "btn-ghost"}`}
                        onClick={() => setDays(7)}
                        style={{ padding: "6px 16px" }}
                    >
                        7D
                    </button>
                    <button
                        className={`btn btn-sm ${days === 30 ? "btn-primary" : "btn-ghost"}`}
                        onClick={() => setDays(30)}
                        style={{ padding: "6px 16px" }}
                    >
                        30D
                    </button>
                </div>
            </header>

            <div className="view-content" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Summary Cards */}
                <div className="dashboard-stats" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: "0px", gap: "12px" }}>
                    <div className="stat-card" style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)", marginBottom: "4px" }}>
                            <Clock size={14} />
                            <span style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{t("stats.totalTime")}</span>
                        </div>
                        <div className="stat-value" style={{ fontSize: "22px" }}>{totalMinutes.toFixed(1)} <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)" }}>{t("stats.minutes")}</span></div>
                    </div>
                    <div className="stat-card" style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)", marginBottom: "4px" }}>
                            <Target size={14} />
                            <span style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{t("stats.accuracy")}</span>
                        </div>
                        <div className="stat-value" style={{ fontSize: "22px" }}>{avgAccuracy.toFixed(1)}%</div>
                    </div>
                    <div className="stat-card" style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)", marginBottom: "4px" }}>
                            <Calendar size={14} />
                            <span style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{t("stats.streak")}</span>
                        </div>
                        <div className="stat-value" style={{ fontSize: "22px" }}>{streak} <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)" }}>{t("stats.days")}</span></div>
                    </div>
                    <div className="stat-card" style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)", marginBottom: "4px" }}>
                            <Layout size={14} />
                            <span style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{t("stats.mastered")}</span>
                        </div>
                        <div className="stat-value" style={{ fontSize: "22px" }}>{distribution?.mastered || 0}</div>
                    </div>
                </div>

                {/* Main Charts Row */}
                <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.2fr", gap: "16px" }}>
                    <div className="card" style={{ padding: "16px", background: "var(--bg-secondary)", borderRadius: "16px" }}>
                        <h3 style={{ marginBottom: "16px", fontSize: "14px", fontWeight: 600 }}>{t("stats.dailyTime")}</h3>
                        <div style={{ height: "180px", width: "100%" }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                                    <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} tickFormatter={(val) => val.split("-").slice(1).join("/")} />
                                    <YAxis stroke="var(--text-muted)" fontSize={12} />
                                    <Tooltip
                                        contentStyle={{ background: "var(--bg-secondary)", border: "1px solid var(--border-medium)", borderRadius: "8px" }}
                                        labelStyle={{ color: "var(--text-primary)", fontWeight: 600 }}
                                    />
                                    <Bar dataKey="minutes" fill="var(--accent-primary)" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="card" style={{ padding: "16px", background: "var(--bg-secondary)", borderRadius: "16px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <h3 style={{ alignSelf: "flex-start", marginBottom: "8px", fontSize: "14px", fontWeight: 600 }}>{t("stats.learning")}</h3>
                        <div style={{ height: "140px", width: "100%" }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={distributionData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={40}
                                        outerRadius={55}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {distributionData.map((_entry, index) => (
                                            <Cell key={`cell-${index}`} fill={distributionData[index].color} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", width: "100%", marginTop: "8px" }}>
                            {distributionData.map((d, i) => (
                                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: d.color }} />
                                        <span style={{ color: "var(--text-secondary)" }}>{d.name}</span>
                                    </div>
                                    <span style={{ fontWeight: 600 }}>{d.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Accuracy Row */}
                {/* Accuracy Row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <div className="card" style={{ padding: "16px", background: "var(--bg-secondary)", borderRadius: "16px" }}>
                        <h3 style={{ marginBottom: "8px", fontSize: "14px", fontWeight: 600 }}>{t("stats.accuracyTrend")}</h3>
                        <div style={{ height: "140px", width: "100%" }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={stats}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                                    <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} tickFormatter={(val) => val.split("-").slice(1).join("/")} />
                                    <YAxis stroke="var(--text-muted)" fontSize={12} domain={[0, 100]} />
                                    <Tooltip contentStyle={{ background: "var(--bg-secondary)", border: "1px solid var(--border-medium)", borderRadius: "8px" }} />
                                    <Line type="monotone" dataKey="avg_score" stroke="#4caf50" strokeWidth={3} dot={{ r: 4, fill: "#4caf50" }} activeDot={{ r: 6 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="card" style={{ padding: "16px", background: "var(--bg-secondary)", borderRadius: "16px" }}>
                        <h3 style={{ marginBottom: "8px", fontSize: "14px", fontWeight: 600 }}>{t("stats.pronunciationTracking")}</h3>
                        <div style={{ height: "140px", width: "100%" }}>
                            {pronunciationLogs.length === 0 ? (
                                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "12px" }}>
                                    {t("stats.noPronunciationData")}
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={pronunciationLogs}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                                        <XAxis dataKey="created_at" stroke="var(--text-muted)" fontSize={12} tickFormatter={(val) => val.split(" ")[0].slice(5)} />
                                        <YAxis stroke="var(--text-muted)" fontSize={12} domain={[0, 100]} />
                                        <Tooltip
                                            contentStyle={{ background: "var(--bg-secondary)", border: "1px solid var(--border-medium)", borderRadius: "8px" }}
                                            labelFormatter={(l) => `Record: ${l}`}
                                        />
                                        <Line type="monotone" dataKey="score" stroke="#9c27b0" strokeWidth={3} dot={{ r: 4, fill: "#9c27b0" }} activeDot={{ r: 6 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                </div>

                {/* Heatmap Row */}
                <div className="card" style={{ padding: "16px", background: "var(--bg-secondary)", borderRadius: "16px" }}>
                    <h3 style={{ marginBottom: "12px", fontSize: "14px", fontWeight: 600 }}>{t("stats.activeStudyHeatmap")}</h3>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {stats.map((s, idx) => {
                            let strength = 0;
                            if (s.minutes > 0) strength = 1;
                            if (s.minutes > 15) strength = 2;
                            if (s.minutes > 30) strength = 3;
                            if (s.minutes > 60) strength = 4;

                            const bg = strength === 0 ? "var(--border-subtle)" :
                                strength === 1 ? "#c8e6c9" :
                                    strength === 2 ? "#81c784" :
                                        strength === 3 ? "#4caf50" : "#2e7d32";

                            return (
                                <div
                                    key={idx}
                                    title={`${s.date}: ${s.minutes.toFixed(1)} mins`}
                                    style={{
                                        width: "16px", height: "16px", borderRadius: "4px",
                                        background: bg
                                    }}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
