import React from "react";
import { useTranslation } from "react-i18next";

interface SelectionPopupProps {
    selectionPopup: {
        text: string;
        isTranslating?: boolean;
        translatedText?: string;
    };
    isSelecting: boolean;
    handleShadowSelection: (e: React.MouseEvent) => void;
    handleAddSelectionAsSegment: (e: React.MouseEvent) => void;
}

export default function SelectionPopupIos({
    selectionPopup,
    isSelecting,
    handleShadowSelection,
    handleAddSelectionAsSegment,
}: SelectionPopupProps) {
    const { t } = useTranslation();

    if (!selectionPopup || isSelecting) return null;

    return (
        <div
            className="selection-popup fade-in"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
                position: "fixed",
                left: "16px",
                right: "16px",
                bottom: "calc(20px + env(safe-area-inset-bottom, 20px))",
                top: "auto",
                transform: "none",
                width: "auto",
                minWidth: "unset",
                display: "flex",
                flexDirection: "row",
                justifyContent: "space-around",
                alignItems: "center",
                padding: "10px 16px",
                borderRadius: "24px",
                zIndex: 10001,
                backgroundColor: "rgba(30, 30, 40, 0.85)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
                gap: "12px"
            }}
        >
            {!selectionPopup.translatedText ? (
                <>
                    <button 
                        className="popup-menu-btn" 
                        onClick={handleShadowSelection}
                        style={{ flexDirection: "column", gap: "2px", padding: "4px 12px", background: "transparent", border: "none" }}
                    >
                        <span style={{ fontSize: "20px" }}>🎧</span> 
                        <span style={{ fontSize: "10px", opacity: 0.9 }}>{t("workspace_v2.shadow_selection")}</span>
                    </button>
                    <button 
                        className="popup-menu-btn" 
                        onClick={handleAddSelectionAsSegment}
                        style={{ flexDirection: "column", gap: "2px", padding: "4px 12px", background: "transparent", border: "none" }}
                    >
                        <span style={{ fontSize: "20px" }}>📌</span> 
                        <span style={{ fontSize: "10px", opacity: 0.9 }}>{t("workspace_v2.add_selection_as_segment")}</span>
                    </button>
                </>
            ) : (
                <div className="translation-box" style={{ width: "100%", textAlign: "center" }}>
                    {selectionPopup.translatedText}
                </div>
            )}
        </div>
    );
}
