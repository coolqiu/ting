import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";

export function AboutView() {
    const { t } = useTranslation();
    const version = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "Unknown";

    const handleOpenLink = async (url: string) => {
        try {
            await openUrl(url);
        } catch (err) {
            console.error("Failed to open link:", err);
        }
    };

    return (
        <div className="view-container fade-in">
            <div className="view-header">
                <h2>{t("about.title")}</h2>
                <p>{t("about.slogan")}</p>
            </div>

            <div className="view-content">
                <div style={{ textAlign: "center", padding: "40px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                    <div className="logo-icon" style={{ margin: "0 auto 16px", transform: "scale(1.5)" }}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-primary">
                            <path d="M3 18v-6a9 9 0 0 1 18 0v6"></path>
                            <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path>
                        </svg>
                    </div>
                    <h3 style={{ fontSize: "24px", marginBottom: "8px" }}>{t("common.appName")}</h3>
                    <p style={{ color: "var(--text-muted)" }}>{t("about.version")} {version}</p>
                </div>

                <div style={{ marginTop: "32px", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
                    <div style={{ maxWidth: "600px", textAlign: "center" }}>
                        <h4 style={{ marginBottom: "16px" }}>{t("about.tech_title")}</h4>
                        <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "24px" }}>
                            {t("about.tech")}
                        </p>

                        <h4 style={{ marginBottom: "8px" }}>{t("about.license")}</h4>
                        <p style={{ color: "var(--text-muted)", fontSize: "12px" }}>MIT License</p>

                        <div style={{ marginTop: "24px", display: "flex", justifyContent: "center", gap: "12px" }}>
                            <button
                                onClick={() => handleOpenLink("https://github.com/coolqiu/ting")}
                                className="btn btn-primary"
                                style={{ cursor: "pointer" }}
                            >
                                GitHub
                            </button>
                            <button
                                onClick={() => handleOpenLink("mailto:thinkinsap@gmail.com")}
                                className="btn btn-ghost"
                                style={{ cursor: "pointer" }}
                            >
                                {t("about.feedback")}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
