import React from "react";
import SelectionPopupIos from "./SelectionPopup.ios";
import SelectionPopupDesktop from "./SelectionPopup.desktop";

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

export default function SelectionPopup(props: SelectionPopupProps) {
    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua);

    if (isIos) {
        return <SelectionPopupIos {...props} />;
    }

    // Unify Android and Windows/Desktop to use the same inline floating popup.
    return <SelectionPopupDesktop {...props} />;
}
