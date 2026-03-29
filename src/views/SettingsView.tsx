import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { useTranslation } from "react-i18next";
import { useToast } from "../components/Toast";

export function SettingsView() {
    const { t, i18n } = useTranslation();
    const { success, error } = useToast();
    const [uiLang, setUiLang] = useState(() => localStorage.getItem("uiLang") || "system");
    const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "system");
    const [learningLanguage, setLearningLanguage] = useState(() => localStorage.getItem("learningLanguage") || "en");
    const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
    const [selectedMic, setSelectedMic] = useState(() => localStorage.getItem("selectedMic") || "default");

    // Fetch audio input devices, requesting permission first to see labels
    useEffect(() => {
        const getDevices = async () => {
            try {
                // Try to request explicit permission to get full mic labels, but ignore if denied
                await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => { });
                const devices = await navigator.mediaDevices.enumerateDevices();
                const mics = devices.filter(d => d.kind === "audioinput");
                setMicrophones(mics);
            } catch (e) {
                console.error("Failed to enumerate devices", e);
            }
        };
        getDevices();
    }, []);

    const changeLanguage = (lng: string) => {
        setUiLang(lng);
        if (lng === "system") {
            localStorage.removeItem("uiLang");
            i18n.changeLanguage(navigator.language).then(() => {
                localStorage.removeItem("i18nextLng"); // Prevent caching the hardcoded language so next boot re-detects
            });
        } else {
            localStorage.setItem("uiLang", lng);
            i18n.changeLanguage(lng);
        }
        success(t("common.success"));
    };

    const handleTestNotification = async () => {
        try {
            let permissionGranted = await isPermissionGranted();
            if (!permissionGranted) {
                const permission = await requestPermission();
                permissionGranted = permission === 'granted';
            }
            if (permissionGranted) {
                sendNotification({ title: t("common.appName"), body: t("settings.testNotificationSuccess") || `This is a test notification from ${t("common.appName")}.` });
                success(t("common.success"));
            } else {
                error(t("settings.notificationDenied") || 'Notification permission denied.');
            }
        } catch (e: any) {
            console.error(e);
            error(e.toString());
        }
    };

    const changeLearningLanguage = (lng: string) => {
        setLearningLanguage(lng);
        localStorage.setItem("learningLanguage", lng);
        success(t("common.success"));
    };

    const changeTheme = (newTheme: string) => {
        setTheme(newTheme);
        localStorage.setItem("theme", newTheme);

        if (newTheme === "system") {
            const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
            document.documentElement.classList.toggle("dark", isDark);
            localStorage.removeItem("theme"); // clear to follow system
        } else {
            document.documentElement.classList.toggle("dark", newTheme === "dark");
        }

        success(t("common.success"));
    };

    return (
        <div className="view-container fade-in">
            <header className="view-header">
                <div>
                    <h1>{t("settings.title")}</h1>
                    <p className="subtitle">{t("settings.subtitle")}</p>
                </div>
            </header>

            <div className="view-content">
                <div className="settings-group" style={{ background: "var(--bg-secondary)", borderRadius: "16px", padding: "8px", border: "1px solid var(--border-subtle)" }}>
                    <div className="settings-item" style={{ padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-subtle)" }}>
                        <div className="settings-item-info">
                            <h4 style={{ margin: "0 0 4px 0", fontSize: "15px" }}>{t("settings.language")}</h4>
                            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>{t("settings.languageDesc")}</p>
                        </div>
                        <select
                            value={uiLang}
                            onChange={(e) => changeLanguage(e.target.value)}
                            className="select-input"
                            style={{ padding: "6px 12px", borderRadius: "8px", background: "var(--bg-primary)", border: "1px solid var(--border-medium)", color: "var(--text-primary)" }}
                        >
                            <option value="system">{t("settings.languageSystem") || "System Default"}</option>
                            <option value="zh-CN">简体中文</option>
                            <option value="zh-TW">繁體中文</option>
                            <option value="en">English</option>
                            <option value="ru">Русский</option>
                            <option value="ja">日本語</option>
                            <option value="ko">한국어</option>
                            <option value="fr">Français</option>
                            <option value="de">Deutsch</option>
                            <option value="es">Español</option>
                            <option value="pt">Português</option>
                            <option value="he">עברית</option>
                            <option value="ar">العربية</option>
                        </select>
                    </div>

                    <div className="settings-item" style={{ padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-subtle)" }}>
                        <div className="settings-item-info">
                            <h4 style={{ margin: "0 0 4px 0", fontSize: "15px" }}>{t("settings.learningLanguage")}</h4>
                            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>{t("settings.learningLanguageDesc")}</p>
                        </div>
                        <select
                            value={learningLanguage}
                            onChange={(e) => changeLearningLanguage(e.target.value)}
                            className="select-input"
                            style={{ padding: "6px 12px", borderRadius: "8px", background: "var(--bg-primary)", border: "1px solid var(--border-medium)", color: "var(--text-primary)" }}
                        >
                            <option value="zh-CN">简体中文</option>
                            <option value="zh-TW">繁體中文</option>
                            <option value="en">English</option>
                            <option value="ru">Русский</option>
                            <option value="ja">日本語</option>
                            <option value="ko">한국어</option>
                            <option value="fr">Français</option>
                            <option value="de">Deutsch</option>
                            <option value="es">Español</option>
                            <option value="pt">Português</option>
                            <option value="he">עברית</option>
                            <option value="ar">العربية</option>
                        </select>
                    </div>

                    <div className="settings-item" style={{ padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div className="settings-item-info">
                            <h4 style={{ margin: "0 0 4px 0", fontSize: "15px" }}>{t("settings.theme")}</h4>
                            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>{t("settings.themeDesc")}</p>
                        </div>
                        <select
                            value={theme}
                            onChange={(e) => changeTheme(e.target.value)}
                            className="select-input"
                            style={{ padding: "6px 12px", borderRadius: "8px", background: "var(--bg-primary)", border: "1px solid var(--border-medium)", color: "var(--text-primary)" }}
                        >
                            <option value="dark">{t("settings.themeDark")}</option>
                            <option value="light">{t("settings.themeLight")}</option>
                            <option value="system">{t("settings.themeSystem")}</option>
                        </select>
                    </div>
                </div>

                {/* --- AUDIO --- */}
                <div className="settings-group" style={{ background: "var(--bg-secondary)", borderRadius: "16px", padding: "8px", border: "1px solid var(--border-subtle)", marginTop: "24px" }}>
                    <div className="settings-item" style={{ padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div className="settings-item-info">
                            <h4 style={{ margin: "0 0 4px 0", fontSize: "15px" }}>{t("settings.microphone")}</h4>
                            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>{t("settings.microphoneDesc")}</p>
                        </div>
                        <select
                            value={selectedMic}
                            onChange={(e) => {
                                setSelectedMic(e.target.value);
                                localStorage.setItem("selectedMic", e.target.value);
                                success(t("common.success"));
                            }}
                            className="select-input"
                            style={{ padding: "6px 12px", borderRadius: "8px", background: "var(--bg-primary)", border: "1px solid var(--border-medium)", color: "var(--text-primary)", maxWidth: "200px" }}
                        >
                            <option value="default">{t("settings.defaultDevice")}</option>
                            {microphones.map(mic => (
                                <option key={mic.deviceId} value={mic.deviceId}>{mic.label || `Microphone ${mic.deviceId.slice(0, 5)}...`}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* --- NOTIFICATIONS & DATA --- */}
                <div className="settings-group" style={{ background: "var(--bg-secondary)", borderRadius: "16px", padding: "8px", border: "1px solid var(--border-subtle)", marginTop: "24px" }}>
                    <div className="settings-item" style={{ padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-subtle)" }}>
                        <div className="settings-item-info">
                            <h4 style={{ margin: "0 0 4px 0", fontSize: "15px" }}>{t("settings.notifications")}</h4>
                            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>{t("settings.notificationsDesc") || "Test desktop push notifications"}</p>
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={handleTestNotification}>
                            {t("settings.testNotification") || "Test Notification"}
                        </button>
                    </div>

                    <div className="settings-item" style={{ padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-subtle)" }}>
                        <div className="settings-item-info">
                            <h4 style={{ margin: "0 0 4px 0", fontSize: "15px" }}>{t("settings.data")}</h4>
                            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>{t("settings.dataDesc")}</p>
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={async () => {
                            try {
                                const path = await invoke<string>("open_app_data_dir");
                                success(path);
                            } catch (e: any) {
                                error(e.toString());
                            }
                        }}>
                            {t("settings.openDataDir")}
                        </button>
                    </div>

                    <div className="settings-item" style={{ padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-subtle)" }}>
                        <div className="settings-item-info">
                            <h4 style={{ margin: "0 0 4px 0", fontSize: "15px" }}>{t("settings.exportData")}</h4>
                            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>{t("settings.exportDataDesc")}</p>
                        </div>
                        <button className="btn btn-primary btn-sm" style={{ minWidth: "100px", whiteSpace: "nowrap" }} onClick={async () => {
                            try {
                                const exportPath = await invoke<string>("export_user_data");
                                success(`${t("common.success")}: ${exportPath}`);
                            } catch (e: any) {
                                error(e.toString());
                            }
                        }}>
                            {t("common.export")}
                        </button>
                    </div>

                    <div className="settings-item" style={{ padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div className="settings-item-info">
                            <h4 style={{ margin: "0 0 4px 0", fontSize: "15px", color: "var(--text-error)" }}>{t("settings.clearCache")}</h4>
                            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>{t("settings.clearCacheDesc")}</p>
                        </div>
                        <button className="btn btn-danger btn-sm" style={{ minWidth: "100px", whiteSpace: "nowrap" }} onClick={async () => {
                            const isConfirmed = await confirm(t("settings.confirmClearCache"));
                            if (isConfirmed) {
                                try {
                                    await invoke("clear_temp_cache");
                                    success(t("common.success"));
                                } catch (e: any) {
                                    error(e.toString());
                                }
                            }
                        }}>
                            {t("common.clear")}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
