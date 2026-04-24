import React from "react";
import { useTranslation } from "react-i18next";

interface SelectionPopupProps {
    selectionPopup: {
        x: number;
        y: number;
        height?: number;
        text: string;
        isBelow?: boolean;
        isTranslating?: boolean;
        translatedText?: string;
    };
    isSelecting: boolean;
    handleCopySelection: (e: React.MouseEvent) => void;
    handleShadowSelection: (e: React.MouseEvent) => void;
    handleAddSelectionAsSegment: (e: React.MouseEvent) => void;
    handleTranslateSelection: (e: React.MouseEvent) => void;
}

export default function SelectionPopupDesktop({
    selectionPopup,
    isSelecting,
    handleCopySelection,
    handleShadowSelection,
    handleAddSelectionAsSegment,
    handleTranslateSelection
}: SelectionPopupProps) {
    const { t } = useTranslation();

    if (!selectionPopup || isSelecting) return null;

    return (
        <div
            className="no-native-callout"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
                position: "fixed",
                zIndex: 10000,
                left: selectionPopup.x,
                top: selectionPopup.isBelow ? (selectionPopup.y + (selectionPopup.height || 24) + 12) : (selectionPopup.y - 12),
                transform: selectionPopup.isBelow ? "translateX(-50%)" : "translateX(-50%) translateY(-100%)",
                width: "fit-content"
            }}
        >
            <style>{`
                @keyframes desktop-popup-spring {
                    0% { transform: scale(0.9) translateY(8px); opacity: 0; }
                    100% { transform: scale(1) translateY(0); opacity: 1; }
                }
            `}</style>
            <div 
                className="selection-popup fade-in"
                style={{
                    position: "relative", // Override global fixed
                    animation: "desktop-popup-spring 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards",
                    transform: "none", // Prevent global residual transforms
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                    minWidth: "160px",
                    width: "100%",
                }}
            >
                {!selectionPopup.translatedText ? (
                    <>
                        <button className="popup-menu-btn" onClick={handleCopySelection}>
                            <span style={{ fontSize: "16px" }}>📋</span> <span>{t("common.copy")}</span>
                        </button>
                        <button className="popup-menu-btn" onClick={handleShadowSelection}>
                            <span style={{ fontSize: "16px", color: "var(--accent-primary)" }}>🎧</span> <span>{t("workspace_v2.shadow_selection")}</span>
                        </button>
                        <button className="popup-menu-btn" onClick={handleAddSelectionAsSegment}>
                            <span style={{ fontSize: "16px", color: "#fab1a0" }}>📌</span> <span>{t("workspace_v2.add_selection_as_segment")}</span>
                        </button>
                        <button className="popup-menu-btn" onClick={handleTranslateSelection}>
                            <span style={{ fontSize: "16px", color: "#81ecec" }}>🌍</span> <span>{t("workspace_v2.translate_selection")}</span>
                        </button>
                    </>
                ) : (
                    <div className="translation-box">
                        {selectionPopup.translatedText}
                    </div>
                )}
            </div>
        </div>
    );
}
