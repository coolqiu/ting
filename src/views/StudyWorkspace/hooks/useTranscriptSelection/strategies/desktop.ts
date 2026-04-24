import { TranscriptSelectionContext } from "../types";

export class DesktopSelectionStrategy {
    private selectTimeout: number | null = null;
    private isMouseDown: boolean = false;

    constructor(private context: TranscriptSelectionContext) {}

    public onMount() {
        document.addEventListener("mousedown", this.handleMouseDown);
        document.addEventListener("selectionchange", this.handleSelectionChange);
        document.addEventListener("mouseup", this.handleLift, { passive: false });
        document.addEventListener("touchend", this.handleLift, { passive: false });
        document.addEventListener("contextmenu", this.preventContextMenu, { capture: true });
    }

    public onUnmount() {
        document.removeEventListener("mousedown", this.handleMouseDown);
        document.removeEventListener("selectionchange", this.handleSelectionChange);
        document.removeEventListener("mouseup", this.handleLift);
        document.removeEventListener("touchend", this.handleLift);
        document.removeEventListener("contextmenu", this.preventContextMenu, { capture: true });
        if (this.selectTimeout) window.clearTimeout(this.selectTimeout);
    }

    private handleMouseDown = (e: MouseEvent) => {
        if (e.target && (e.target as HTMLElement).closest('.selection-popup')) return;
        this.isMouseDown = true;

        const target = e.target as HTMLElement;
        if (!target.closest('.transcript-text') && !target.closest('.transcript-word')) {
            // User explicitly clicked away onto empty space. Force kill the browser selection!
            window.getSelection()?.removeAllRanges();
        }

        // Destroy the popup immediately on fresh click to prevent ghosting
        this.context.setSelectionPopup(null);
        this.context.setIsSelecting(false);
        if (this.selectTimeout) window.clearTimeout(this.selectTimeout);
    };

    private handleLift = (e?: any) => {
        this.isMouseDown = false;
        if (e?.target && (e.target as HTMLElement).closest('.selection-popup')) return;

        // Prevent native behaviors if necessary
        if (e && e.cancelable && e.type !== "touchend") {
            // e.preventDefault(); // Don't prevent default on lift, it breaks standard clicks
        }

        this.debounceSelection();
    };

    private handleSelectionChange = () => {
        // Only hide popup (enter selecting mode) if actively dragging with mouse
        if (this.isMouseDown) {
            this.context.setIsSelecting(true);
        }
        this.debounceSelection();
    };

    private debounceSelection = () => {
        if (this.selectTimeout) window.clearTimeout(this.selectTimeout);

        this.selectTimeout = window.setTimeout(() => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
                // Ensure selecting spinner is off if selection vanishes
                if (!this.isMouseDown) {
                    this.context.setIsSelecting(false);
                }
                return;
            }

            const range = sel.getRangeAt(0);
            const startNode = range.startContainer;
            const startEl = startNode.nodeType === 3 ? startNode.parentElement : startNode as HTMLElement;
            
            if (!startEl?.closest('.transcript-text') && !startEl?.closest('.transcript-word')) return;

            this.syncSelection(range);
            this.context.setIsSelecting(false);
        }, 300);
    };

    private preventContextMenu = (e: Event) => {
        const target = e.target as HTMLElement;
        if (target && target.closest('.no-native-callout')) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    private syncSelection = (range: Range) => {
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const startNode = range.startContainer;
        const startEl = startNode.nodeType === 3 ? startNode.parentElement : startNode as HTMLElement;
        const endNode = range.endContainer;
        const endEl = endNode.nodeType === 3 ? endNode.parentElement : endNode as HTMLElement;

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
