import { TranscriptSelectionContext } from "../types";

export class IosSelectionStrategy {
    private selectTimeout: number | null = null;

    constructor(private context: TranscriptSelectionContext) {}

    public onMount() {
        document.addEventListener("selectionchange", this.handleSelectionChange);
        document.addEventListener("mouseup", this.handleLift, { passive: false });
        document.addEventListener("touchend", this.handleLift, { passive: false });
        // iOS: Allow native selection menu by NOT preventing contextmenu
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
            this.context.setIsSelecting(false);
            return;
        }

        // Mark as selecting immediately
        this.context.setIsSelecting(true);

        // Wait for selection to stabilize (user has stopped dragging handles)
        this.selectTimeout = window.setTimeout(() => {
            const stableSel = window.getSelection();
            if (!stableSel || stableSel.isCollapsed || stableSel.rangeCount === 0) {
                this.context.setIsSelecting(false);
                return;
            }
            const range = stableSel.getRangeAt(0);

            // Only show popup if selection is inside a transcript element
            const startNode = range.startContainer;
            const startEl = startNode.nodeType === 3 ? startNode.parentElement : startNode as HTMLElement;
            if (!startEl?.closest('.transcript-text') && !startEl?.closest('.transcript-word')) {
                this.context.setIsSelecting(false);
                return;
            }

            this.syncSelection(range);
            this.context.setIsSelecting(false);
        }, 200);
    };

    private handleLift = (e?: any) => {
        this.context.setIsSelecting(false);
        // iOS: We do NOT call preventDefault here to allow native callouts
        if (e?.target && (e.target as HTMLElement).closest('.selection-popup')) return;
    };

    private nodeToElement = (node: Node): Element | null => {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.parentElement;
        }
        return node as Element;
    };

    private syncSelection = (range: Range) => {
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const startEl = this.nodeToElement(range.startContainer);
        const endEl = this.nodeToElement(range.endContainer);

        const closestStart = startEl?.closest('.transcript-word') as HTMLElement | null;
        const closestEnd = endEl?.closest('.transcript-word') as HTMLElement | null;

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
