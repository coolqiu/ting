import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, X } from "lucide-react";

export function ShortcutOverlay() {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if in input
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement ||
                (e.target as HTMLElement).isContentEditable
            ) {
                return;
            }

            if (e.key === "?" && e.shiftKey) {
                e.preventDefault();
                setIsOpen(prev => !prev);
            } else if (e.key === "Escape" && isOpen) {
                setIsOpen(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen]);

    if (!isOpen) return null;

    const shortcuts = [
        { keys: ["Space"], desc: t("shortcuts.playPause", "Play / Pause") },
        { keys: ["←"], desc: t("shortcuts.rewind", "Rewind 5s") },
        { keys: ["→"], desc: t("shortcuts.forward", "Forward 5s") },
        { keys: ["R"], desc: t("shortcuts.repeat", "Repeat Segment") },
        { keys: ["Shift", "?"], desc: t("shortcuts.help", "Show Shortcuts") },
    ];

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center"
        }} onClick={() => setIsOpen(false)}>
            <div
                style={{
                    background: "var(--bg-primary)", padding: "32px", borderRadius: "16px",
                    width: "400px", maxWidth: "90vw", border: "1px solid var(--border-medium)",
                    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)"
                }}
                onClick={e => e.stopPropagation()}
                className="fade-in"
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <Keyboard size={24} color="var(--accent-primary)" />
                        <h2 style={{ margin: 0, fontSize: "20px" }}>{t("nav.help") || "Keyboard Shortcuts"}</h2>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setIsOpen(false)} style={{ padding: "4px" }}>
                        <X size={20} />
                    </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {shortcuts.map((s, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>{s.desc}</span>
                            <div style={{ display: "flex", gap: "6px" }}>
                                {s.keys.map((k, idx) => (
                                    <kbd key={idx} style={{
                                        background: "var(--bg-secondary)", border: "1px solid var(--border-medium)",
                                        padding: "4px 8px", borderRadius: "6px", fontSize: "12px",
                                        color: "var(--text-primary)", fontFamily: "monospace",
                                        boxShadow: "0 2px 0 var(--border-medium)"
                                    }}>
                                        {k}
                                    </kbd>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
