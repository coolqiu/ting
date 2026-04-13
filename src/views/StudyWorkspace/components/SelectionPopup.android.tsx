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

export default function SelectionPopupAndroid({
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
            className="selection-popup fade-in"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
                left: selectionPopup.x,
                top: selectionPopup.isBelow ? (selectionPopup.y + (selectionPopup.height || 24) + 12) : (selectionPopup.y - 12),
                transform: selectionPopup.isBelow ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(-100%)",
                display: "flex",
                flexDirection: "column",
                gap: "2px",
                minWidth: "160px"
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
    );
}
