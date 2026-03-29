import { useTranslation } from "react-i18next";
import { HelpCircle, BookOpen, MessageSquare, Keyboard, MousePointer2 } from "lucide-react";

export default function HelpView() {
    const { t } = useTranslation();

    const sections = [
        {
            icon: <BookOpen className="w-5 h-5 text-accent-primary" />,
            title: t("help.library_title"),
            description: t("help.library_desc")
        },
        {
            icon: <MousePointer2 className="w-5 h-5 text-accent-primary" />,
            title: t("help.workspace_title"),
            description: t("help.workspace_desc")
        },
        {
            icon: <HelpCircle className="w-5 h-5 text-accent-primary" />,
            title: t("help.speaking_title"),
            description: t("help.speaking_desc")
        },
        {
            icon: <MessageSquare className="w-5 h-5 text-accent-primary" />,
            title: t("help.review_title"),
            description: t("help.review_desc")
        }
    ];

    const shortcuts = [
        { key: "Space", desc: t("help.shortcut_space") },
        { key: "←", desc: t("help.shortcut_left") },
        { key: "→", desc: t("help.shortcut_right") },
        { key: "A / B", desc: t("workspace_v2.ab_a") + " / " + t("workspace_v2.ab_b") },
        { key: "Ctrl + Enter", desc: t("workspace_v2.dictation_quick_submit") }
    ];

    return (
        <div className="view-container fade-in">
            <header className="view-header">
                <div>
                    <h1>{t("help.title")}</h1>
                    <p className="subtitle">{t("help.subtitle")}</p>
                </div>
            </header>

            <div className="view-content" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "24px", paddingBottom: "40px" }}>
                {/* Feature Guides */}
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {sections.map((section, idx) => (
                        <div key={idx} style={{ background: "var(--bg-secondary)", padding: "20px", borderRadius: "16px", border: "1px solid var(--border-subtle)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                                {section.icon}
                                <h3 style={{ margin: 0, fontSize: "16px" }}>{section.title}</h3>
                            </div>
                            <p style={{ margin: 0, fontSize: "14px", color: "var(--text-secondary)", lineHeight: "1.6" }}>
                                {section.description}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Shortcuts and FAQ */}
                <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    <div style={{ background: "var(--bg-secondary)", padding: "20px", borderRadius: "16px", border: "1px solid var(--border-subtle)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                            <Keyboard className="w-5 h-5 text-accent-primary" />
                            <h3 style={{ margin: 0, fontSize: "16px" }}>{t("help.shortcuts_title")}</h3>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            {shortcuts.map((s, idx) => (
                                <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", padding: "8px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                                    <span style={{ color: "var(--text-secondary)" }}>{s.desc}</span>
                                    <kbd style={{
                                        background: "var(--bg-tertiary)",
                                        padding: "2px 8px",
                                        borderRadius: "4px",
                                        fontSize: "12px",
                                        fontFamily: "monospace",
                                        border: "1px solid var(--border-medium)"
                                    }}>{s.key}</kbd>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ background: "var(--bg-secondary)", padding: "20px", borderRadius: "16px", border: "1px solid var(--border-subtle)" }}>
                        <h3 style={{ margin: "0 0 16px 0", fontSize: "16px" }}>{t("help.faq_title")}</h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "14px" }}>
                            <p style={{ margin: 0, color: "var(--text-secondary)" }}>• {t("help.faq_blackscreen")}</p>
                            <p style={{ margin: 0, color: "var(--text-secondary)" }}>• {t("help.faq_ytdlp")}</p>
                            <p style={{ margin: 0, color: "var(--text-secondary)" }}>• {t("help.faq_db")}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
