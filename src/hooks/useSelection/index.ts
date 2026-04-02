import { useEffect, useMemo } from "react";
import { SelectionContext, SelectionStrategy, SelectionPopup } from "./types";
import { AndroidSelectionStrategy } from "./strategies/android";
import { IosSelectionStrategy } from "./strategies/ios";
import { DesktopSelectionStrategy } from "./strategies/desktop";
import { WordTimestamp } from "../../types";

export function useSelection(
    wordsRef: React.MutableRefObject<WordTimestamp[]>,
    setSelectionPopup: (popup: SelectionPopup | null) => void,
    setIsSelecting: (isSelecting: boolean) => void
) {
    const context: SelectionContext = useMemo(() => ({
        wordsRef,
        setSelectionPopup,
        setIsSelecting
    }), [wordsRef, setSelectionPopup, setIsSelecting]);

    const strategy: SelectionStrategy = useMemo(() => {
        const ua = navigator.userAgent;
        const isiOS = /iPad|iPhone|iPod/.test(ua);
        const isAndroid = /Android/i.test(ua);

        if (isiOS) return new IosSelectionStrategy(context);
        if (isAndroid) return new AndroidSelectionStrategy(context);
        return new DesktopSelectionStrategy(context);
    }, [context]);

    useEffect(() => {
        console.log("[Selection] Strategy active:", strategy.constructor.name);
        strategy.onMount();
        return () => strategy.onUnmount();
    }, [strategy]);

    return {
        syncSelection: strategy.syncSelection.bind(strategy)
    };
}
