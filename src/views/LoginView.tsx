import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";

interface UserInfo {
    id: number;
    username: string;
    created_at: string;
}

interface LoginViewProps {
    onLogin: (user: UserInfo) => void;
}

export function LoginView({ onLogin }: LoginViewProps) {
    const [users, setUsers] = useState<UserInfo[]>([]);
    const [mode, setMode] = useState<"pick" | "login" | "register">("pick");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPw, setConfirmPw] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const { t } = useTranslation();

    useEffect(() => {
        invoke<UserInfo[]>("list_users").then(setUsers).catch(() => setUsers([]));
    }, []);

    const handleLogin = async () => {
        setError(null);
        setLoading(true);
        try {
            const user = await invoke<UserInfo>("login_user", { username, password });
            onLogin(user);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async () => {
        setError(null);
        if (password !== confirmPw) { setError(t("auth.password_mismatch")); return; }
        setLoading(true);
        try {
            const user = await invoke<UserInfo>("register_user", { username, password });
            onLogin(user);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    };

    const quickLogin = async (u: UserInfo) => {
        setUsername(u.username);
        setPassword("");
        setMode("login");
    };

    return (
        <div style={{
            minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
            background: "var(--bg-primary)",
        }}>
            <div style={{
                width: "420px", background: "var(--bg-secondary)",
                borderRadius: "var(--radius-xl)", padding: "40px",
                border: "1px solid var(--border-subtle)",
                boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
            }}>
                {/* Logo */}
                <div style={{ textAlign: "center", marginBottom: "32px" }}>
                    <div style={{ fontSize: "48px", marginBottom: "8px" }}>🎧</div>
                    <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)" }}>{t("auth.view_title")}</h1>
                    <p style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "4px" }}>{t("auth.view_subtitle")}</p>
                </div>

                {/* User Picker */}
                {mode === "pick" && (
                    <>
                        {users.length > 0 && (
                            <div style={{ marginBottom: "20px" }}>
                                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("auth.select_user")}</p>
                                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                    {users.map(u => (
                                        <button
                                            key={u.id}
                                            className="btn btn-ghost"
                                            onClick={() => quickLogin(u)}
                                            style={{ justifyContent: "flex-start", gap: "12px", padding: "12px 16px", textAlign: "left" }}
                                        >
                                            <span style={{ fontSize: "24px" }}>👤</span>
                                            <span>
                                                <div style={{ fontWeight: 600 }}>{u.username}</div>
                                                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{t("auth.registered_on", { date: u.created_at.slice(0, 10) })}</div>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <button
                            className="btn btn-primary"
                            style={{ width: "100%", padding: "12px" }}
                            onClick={() => setMode("register")}
                        >
                            {t("auth.register_new")}
                        </button>
                    </>
                )}

                {/* Login Form */}
                {mode === "login" && (
                    <>
                        <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "20px" }}>
                            {t("auth.login_as", { username })}
                        </p>
                        <input
                            type="password"
                            placeholder={t("auth.password")}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleLogin()}
                            autoFocus
                            style={inputStyle}
                        />
                        {error && <p style={errorStyle}>{error}</p>}
                        <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setMode("pick"); setError(null); }}>{t("auth.back")}</button>
                            <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleLogin} disabled={loading}>
                                {loading ? t("auth.logging_in") : t("auth.login")}
                            </button>
                        </div>
                    </>
                )}

                {/* Register Form */}
                {mode === "register" && (
                    <>
                        <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "20px" }}>{t("auth.create_local_account")}</p>
                        <input type="text" placeholder={t("auth.username")} value={username} onChange={e => setUsername(e.target.value)} style={{ ...inputStyle, marginBottom: "10px" }} />
                        <input type="password" placeholder={t("auth.password_min")} value={password} onChange={e => setPassword(e.target.value)} style={{ ...inputStyle, marginBottom: "10px" }} />
                        <input
                            type="password" placeholder={t("auth.confirm_password")} value={confirmPw}
                            onChange={e => setConfirmPw(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleRegister()}
                            style={inputStyle}
                        />
                        {error && <p style={errorStyle}>{error}</p>}
                        <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                            {users.length > 0 && <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setMode("pick"); setError(null); }}>{t("auth.back")}</button>}
                            <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleRegister} disabled={loading}>
                                {loading ? t("auth.registering") : t("auth.register_login")}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    width: "100%", padding: "12px 14px", borderRadius: "8px",
    border: "1px solid var(--border-medium)", background: "var(--bg-primary)",
    color: "var(--text-primary)", fontSize: "14px", outline: "none",
    boxSizing: "border-box",
};

const errorStyle: React.CSSProperties = {
    color: "var(--error, #f44336)", fontSize: "13px", marginTop: "8px",
};
