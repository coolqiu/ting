import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WordTimestamp, PlaybackInfo, ABSegment } from "../../../../types";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TranscriptSelectionContext, SelectionPopup } from "./types";
import { DesktopSelectionStrategy } from "./strategies/desktop";
import { IosSelectionStrategy } from "./strategies/ios";
import { AndroidSelectionStrategy } from "./strategies/android";

interface UseTranscriptSelectionProps {
    playback: PlaybackInfo | null;
    setPlayback: (pb: PlaybackInfo) => void;
    memoWords: WordTimestamp[];
    saveProgress: (pb: PlaybackInfo) => void;
    setActiveTab: (tab: 'segments' | 'transcript' | 'dictation') => void;
    pollState: () => void;
    generateId: () => string;
}

export function useTranscriptSelection({
    playback,
    setPlayback,
    memoWords,
    saveProgress,
    setActiveTab,
    pollState,
    generateId
}: UseTranscriptSelectionProps) {
    const [selectionPopup, setSelectionPopup] = useState<SelectionPopup | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const navigate = useNavigate();
    const { i18n } = useTranslation();

    const context: TranscriptSelectionContext = useMemo(() => ({
        memoWords,
        setSelectionPopup,
        setIsSelecting
    }), [memoWords]);

    const strategy = useMemo(() => {
        const ua = navigator.userAgent;
        const isiOS = /iPad|iPhone|iPod/.test(ua);
        const isAndroid = /Android/i.test(ua);

        if (isiOS) return new IosSelectionStrategy(context);
        if (isAndroid) return new AndroidSelectionStrategy(context);
        return new DesktopSelectionStrategy(context);
    }, [context]);

    useEffect(() => {
        console.log("[TranscriptSelection] Strategy active:", strategy.constructor.name);
        strategy.onMount();
        return () => strategy.onUnmount();
    }, [strategy]);

    const handleCopySelection = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectionPopup || !selectionPopup.text) return;
        try {
            await navigator.clipboard.writeText(selectionPopup.text);
            window.getSelection()?.removeAllRanges();
            setSelectionPopup(null);
        } catch (err) { console.error("Failed to copy:", err); }
    };

    const handleShadowSelection = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectionPopup || !playback?.file_path) return;
        try {
            await invoke("set_shadowing_override", {
                text: selectionPopup.text,
                audioPath: playback.file_path,
                startMs: selectionPopup.start,
                endMs: selectionPopup.end
            });
            window.getSelection()?.removeAllRanges();
            setSelectionPopup(null);
            navigate("/speaking");
        } catch (err) { console.error("[Shadowing] Failed:", err); }
    };

    const handleAddSelectionAsSegment = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectionPopup) return;
        const seg: ABSegment = {
            id: generateId(),
            start_secs: selectionPopup.start / 1000,
            end_secs: selectionPopup.end / 1000,
            loop_count: 3,
        };
        try {
            if (playback) {
                const updated = { ...playback, segments: [...playback.segments, seg] };
                setPlayback(updated);
                saveProgress(updated);
            }
            await invoke("add_segment", { segment: seg });
            window.getSelection()?.removeAllRanges();
            setSelectionPopup(null);
            setActiveTab('segments');
            setTimeout(pollState, 100);
        } catch (err) { console.error("[Segment] Failed:", err); }
    };

    const handleTranslateSelection = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectionPopup || !selectionPopup.text) return;
        setSelectionPopup({ ...selectionPopup, isTranslating: true, translatedText: undefined });
        try {
            const targetLang = i18n.language || "zh-CN";
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(selectionPopup.text)}`;
            const response = await fetch(url);
            const data = await response.json();
            if (data && data[0]) {
                const translated = data[0].map((item: any) => item[0]).join("");
                setSelectionPopup((prev: SelectionPopup | null) => prev ? { ...prev, translatedText: translated, isTranslating: false } : null);
            }
        } catch (err) {
            console.error("[Translate] Failed:", err);
            setSelectionPopup((prev: SelectionPopup | null) => prev ? { ...prev, translatedText: "Error", isTranslating: false } : null);
        }
    };

    const handleBlankClick = useCallback(() => {
        const sel = window.getSelection();
        if (!sel || sel.toString().trim().length === 0) {
            setSelectionPopup(null);
            sel?.removeAllRanges();
        }
    }, []);

    return {
        selectionPopup,
        isSelecting,
        setSelectionPopup,
        handleCopySelection,
        handleShadowSelection,
        handleAddSelectionAsSegment,
        handleTranslateSelection,
        handleBlankClick
    };
}
