import { WordTimestamp } from "../../../../types";

export interface SelectionPopup {
    x: number;
    y: number;
    height?: number;
    text: string;
    start: number;
    end: number;
    translatedText?: string;
    isTranslating?: boolean;
    isBelow?: boolean;
}

export interface TranscriptSelectionContext {
    memoWords: WordTimestamp[];
    setSelectionPopup: (popup: SelectionPopup | null) => void;
    setIsSelecting: (isSelecting: boolean) => void;
}

export interface TranscriptSelectionStrategy {
    onMount: () => void;
    onUnmount: () => void;
}
