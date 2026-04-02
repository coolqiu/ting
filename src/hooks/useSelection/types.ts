import { WordTimestamp } from "../../types";

export interface SelectionPopup {
    x: number;
    y: number;
    height: number;
    text: string;
    start: number;
    end: number;
    isTranslating?: boolean;
    translatedText?: string | null;
}

export interface SelectionContext {
    wordsRef: React.MutableRefObject<WordTimestamp[]>;
    setSelectionPopup: (popup: SelectionPopup | null) => void;
    setIsSelecting: (isSelecting: boolean) => void;
}

export interface SelectionStrategy {
    onMount: () => void;
    onUnmount: () => void;
    syncSelection: () => void;
}
