import { TranscriptSelectionContext } from "../types";

export class IosSelectionStrategy {
    private selectTimeout: number | null = null;

    constructor(private context: TranscriptSelectionContext) {}

    public onMount() {
        document.addEventListener("selectionchange", this.handleSelectionChange);
        document.addEventListener("mouseup", this.handleLift, { passive: false });
        document.addEventListener("touchend", this.handleLift, { passive: false });
        // iOS: Do NOT prevent contextmenu to allow native selection menu
    }

    public onUnmount() {
        document.removeEventListener("selectionchange", this.handleSelectionChange);
        document.removeEventListener("mouseup", this.handleLift);
        document.removeEventListener("touchend", this.handleLift);
        if (this.selectTimeout) window.clearTimeout(this.selectTimeout);
    }

    private handleSelectionChange = () => {
        if (this.selectTimeout) window.clearTimeout(this.selectTimeout);

        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
            this.context.setSelectionPopup(null);
            return;
        }

        this.selectTimeout = window.setTimeout(() => {
            const sel = window.getSelection();
            if (sel && !sel.isCollapsed) {
                this.context.setIsSelecting(true);
            }
        }, 150);
    };

    private handleLift = (e?: any) => {
        this.context.setIsSelecting(false);

        if (e?.target && (e.target as HTMLElement).closest('.selection-popup')) return;

        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

        const range = sel.getRangeAt(0);
        const startNode = range.startContainer;
        const startEl = startNode.nodeType === 3 ? startNode.parentElement : startNode as HTMLElement;
        if (!startEl?.closest('.transcript-text') && !startEl?.closest('.transcript-word')) return;

        // iOS: Do NOT prevent default - let native selection work
        this.syncSelection(range);
    };

    private syncSelection = (range: Range) => {
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const closestStart = (range.startContainer.parentElement?.closest('.transcript-word') ||
            (range.startContainer as HTMLElement).closest('.transcript-word')) as HTMLElement;
        const closestEnd = (range.endContainer.parentElement?.closest('.transcript-word') ||
            (range.endContainer as HTMLElement).closest('.transcript-word')) as HTMLElement;

        if (closestStart && closestEnd) {
            const sIdx = parseInt(closestStart.dataset.index || "0", 10);
            const eIdx = parseInt(closestEnd.dataset.index || "0", 10);
            const realStartIdx = Math.min(sIdx, eIdx);
            const realEndIdx = Math.max(sIdx, eIdx);

            const selectedWords = this.context.memoWords.slice(realStartIdx, realEndIdx + 1);
            const text = selectedWords.map(w => w.word).join(" ");

            if (text) {
                this.context.setSelectionPopup({
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                    height: rect.height,
                    text: text,
                    start: selectedWords[0].start_ms,
                    end: selectedWords[selectedWords.length - 1].end_ms,
                    isBelow: rect.top < 220
                });
            }
        }
    };
}
