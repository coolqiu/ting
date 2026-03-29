import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { User as UserIcon, Calendar, Flame, Clock, Edit2, Check, X, Target } from "lucide-react";

interface UserInfo {
    id: number;
    username: string;
    created_at: string;
    avatar?: string | null;
}

interface DailyStat {
    date: string;
    minutes: number;
    avg_score: number;
}

export function ProfileView() {
    const { t } = useTranslation();
    const [user, setUser] = useState<UserInfo | null>(null);
    const [stats, setStats] = useState<DailyStat[]>([]);
    const [loading, setLoading] = useState(true);

    const [isEditingName, setIsEditingName] = useState(false);
    const [newName, setNewName] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [dailyGoal, setDailyGoal] = useState<number>(() => parseInt(localStorage.getItem("daily_goal") || "0"));

    useEffect(() => {
        async function fetchProfileData() {
            try {
                const u = await invoke<UserInfo | null>("get_current_user");
                if (u) {
                    setUser(u);
                    // Fetch past 30 days of stats
                    const s = await invoke<DailyStat[]>("get_daily_study_stats", { days: 30 });
                    setStats(s);
                }
            } catch (e) {
                console.error("Failed to load profile:", e);
            } finally {
                setLoading(false);
            }
        }
        fetchProfileData();
    }, []);

    // Calculate Streak
    let streak = 0;
    if (stats.length > 0) {
        let currentStreak = 0;
        // Iterate from today backwards
        const sortedStats = [...stats].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Simple streak counter: count consecutive days with > 0 minutes
        const today = new Date().toISOString().split("T")[0];
        let expectedDate = new Date(today);

        for (const d of sortedStats) {
            if (d.date > today) continue; // Future dates?

            const statDate = new Date(d.date);
            // Check if this stat matches expected date
            if (statDate.toISOString().split("T")[0] === expectedDate.toISOString().split("T")[0]) {
                if (d.minutes > 0) {
                    currentStreak++;
                    expectedDate.setDate(expectedDate.getDate() - 1); // Expect previous day for next loop
                } else {
                    // If we are looking at today and today has 0, streak might just be broken for today but continuing from yesterday?
                    // For simplicity, any 0 breaks the streak.
                    break;
                }
            } else {
                // Gap found
                break;
            }
        }
        streak = currentStreak;
    }

    const totalMinutes = stats.reduce((sum, s) => sum + s.minutes, 0);

    const handleSaveName = async () => {
        if (!newName.trim() || newName.trim() === user?.username) {
            setIsEditingName(false);
            return;
        }
        try {
            const updatedUser = await invoke<UserInfo>("update_username", { newUsername: newName.trim() });
            setUser(updatedUser);
            setIsEditingName(false);
        } catch (e) {
            console.error("Failed to update username:", e);
        }
    };

    const handleGoalChange = (val: number) => {
        setDailyGoal(val);
        localStorage.setItem("daily_goal", val.toString());
    };

    const handleAvatarClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Check file size (limit to 2MB)
        if (file.size > 2 * 1024 * 1024) {
            alert(t("profile.avatarTooLarge") || "Image is too large (max 2MB).");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64String = reader.result as string;
            try {
                const updatedUser = await invoke<UserInfo>("update_avatar", { newAvatar: base64String });
                setUser(updatedUser);
            } catch (err) {
                console.error("Failed to update avatar:", err);
            }
        };
        reader.readAsDataURL(file);
    };

    if (loading) return <div className="spinner" style={{ margin: "40px auto" }} />;
    if (!user) return <div className="empty-state">{t("profile.notLoggedIn")}</div>;

    const joinDate = new Date(user.created_at).toLocaleDateString();

    return (
        <div className="view-container">
            <div className="header-container">
                <h2>{t("nav.profile") || t("profile.title")}</h2>
            </div>

            <div className="card" style={{ marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                    <div
                        onClick={handleAvatarClick}
                        title={t("profile.changeAvatar") || "Change Avatar"}
                        style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--accent-primary)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden", flexShrink: 0, border: "2px solid transparent", transition: "border 0.2s" }}
                        onMouseEnter={(e) => e.currentTarget.style.border = "2px solid var(--primary-color)"}
                        onMouseLeave={(e) => e.currentTarget.style.border = "2px solid transparent"}
                    >
                        {user.avatar ? (
                            <img src={user.avatar} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                            <UserIcon size={40} />
                        )}
                    </div>
                    <input
                        type="file"
                        accept="image/png, image/jpeg, image/webp"
                        ref={fileInputRef}
                        style={{ display: "none" }}
                        onChange={handleFileChange}
                    />
                    <div style={{ flex: 1 }}>
                        {isEditingName ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                                <input
                                    autoFocus
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setIsEditingName(false); }}
                                    style={{
                                        padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--accent-primary)",
                                        background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "20px", width: "200px", outline: "none"
                                    }}
                                />
                                <button className="btn btn-primary btn-sm" onClick={handleSaveName} style={{ padding: "6px" }}><Check size={16} /></button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setIsEditingName(false)} style={{ padding: "6px" }}><X size={16} /></button>
                            </div>
                        ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                                <h1 style={{ margin: 0, fontSize: "28px" }}>{user.username}</h1>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => { setNewName(user.username); setIsEditingName(true); }}
                                    style={{ padding: "6px", color: "var(--text-muted)" }}
                                    title={t("profile.editUsername")}
                                >
                                    <Edit2 size={16} />
                                </button>
                            </div>
                        )}
                        <p style={{ margin: 0, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
                            <Calendar size={14} /> {t("profile.joined")} {joinDate}
                        </p>
                    </div>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                <div className="card" style={{ textAlign: "center" }}>
                    <Flame size={32} color="var(--primary-color)" style={{ margin: "0 auto 12px auto" }} />
                    <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "8px" }}>{t("profile.currentStreak")}</div>
                    <div style={{ fontSize: "32px", fontWeight: "bold" }}>{streak} <span style={{ fontSize: "16px", fontWeight: "normal", color: "var(--text-secondary)" }}>{t("profile.days")}</span></div>
                </div>

                <div className="card" style={{ textAlign: "center" }}>
                    <Clock size={32} color="var(--text-primary)" style={{ margin: "0 auto 12px auto" }} />
                    <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "8px" }}>{t("profile.totalStudyTime")}</div>
                    <div style={{ fontSize: "32px", fontWeight: "bold" }}>{Math.round(totalMinutes)} <span style={{ fontSize: "16px", fontWeight: "normal", color: "var(--text-secondary)" }}>{t("profile.minutes")}</span></div>
                </div>

                <div className="card" style={{ textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    <div>
                        <Target size={32} color="#10b981" style={{ margin: "0 auto 12px auto" }} />
                        <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "8px" }}>{t("profile.dailyGoal")}</div>
                        <div style={{ fontSize: "32px", fontWeight: "bold" }}>
                            {dailyGoal > 0 ? dailyGoal : "--"} <span style={{ fontSize: "16px", fontWeight: "normal", color: "var(--text-secondary)" }}>{dailyGoal > 0 ? t("profile.minutes") : t("profile.goalUnset")}</span>
                        </div>
                    </div>
                    <div style={{ marginTop: "16px", display: "flex", justifyContent: "center", gap: "6px" }}>
                        {[15, 30, 60].map(val => (
                            <button
                                key={val}
                                onClick={() => handleGoalChange(val)}
                                className={`btn btn-sm ${dailyGoal === val ? 'btn-primary' : 'btn-ghost'}`}
                                style={{ padding: "4px 8px", fontSize: "12px" }}
                            >
                                {t(`profile.goal${val}`)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

        </div>
    );
}
