import { SelectionContext } from "../types";

export class AndroidSelectionStrategy {
    private isPointerDown = false;
    private selectTimeout: number | null = null;

    constructor(private context: SelectionContext) {}

    public onMount() {
        window.addEventListener("touchstart", this.handlePress, { passive: true });
        window.addEventListener("touchend", this.handleLift, { passive: false });
        document.addEventListener("selectionchange", this.handleSelectionChange);
        window.addEventListener("contextmenu", this.preventContextMenu, { capture: true });
    }

    public onUnmount() {
        window.removeEventListener("touchstart", this.handlePress);
        window.removeEventListener("touchend", this.handleLift);
        document.removeEventListener("selectionchange", this.handleSelectionChange);
        window.removeEventListener("contextmenu", this.preventContextMenu, { capture: true });
        if (this.selectTimeout) window.clearTimeout(this.selectTimeout);
    }

    private handlePress = () => {
        this.isPointerDown = true;
    };

    private handleLift = (e: any) => {
        this.isPointerDown = false;
        this.context.setIsSelecting(false);

        const target = e?.target as HTMLElement;
        if (!target) return;

        // Systematic Fix: If the target is an interactive UI element, do NOT intercept.
        // This prevents blocking clicks on "Resume Progress", "Play/Pause", etc.
        if (target.closest('button, a, .btn, [role="button"], input, select, label')) {
            return;
        }

        // Only manage selection if it's inside the transcript
        const isTranscript = !!target.closest('.transcript-text, .transcript-word');
        const sel = window.getSelection();
        const hasSelection = sel && !sel.isCollapsed;

        if (hasSelection && isTranscript && e && e.cancelable) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        this.syncSelection();
    };

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
                if (!this.isPointerDown) {
                    this.syncSelection();
                }
            }
        }, 60);
    };

    private preventContextMenu = (e: Event) => {
        const target = e.target as HTMLElement;
        // Only block context menu if specifically on the transcript words
        if (target && target.closest('.transcript-word, .transcript-text')) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    public syncSelection = () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
            if (!this.isPointerDown) this.context.setSelectionPopup(null);
            return;
        }

        const range = sel.getRangeAt(0);
        const startNode = range.startContainer;
        const startEl = startNode.nodeType === 3 ? startNode.parentElement : startNode as HTMLElement;
        if (!startEl?.closest('.transcript-text') && !startEl?.closest('.transcript-word')) return;

        const rect = range.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const endNode = range.endContainer;
        const endEl = endNode.nodeType === 3 ? endNode.parentElement : endNode as HTMLElement;
        const closestStart = startEl?.closest('.transcript-word') as HTMLElement;
        const closestEnd = endEl?.closest('.transcript-word') as HTMLElement;

        if (closestStart && closestEnd) {
            const sMs = parseInt(closestStart.dataset.start || "0", 10);
            const eMs = parseInt(closestEnd.dataset.end || "0", 10);
            const realStart = Math.min(sMs, eMs);
            const realEnd = Math.max(sMs, eMs);

            const selectedWords = this.context.wordsRef.current.filter(w => w.start_ms >= realStart && w.start_ms <= realEnd);
            const text = selectedWords.map(w => w.word).join(" ");

            if (text) {
                this.context.setSelectionPopup({
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                    height: rect.height,
                    text: text,
                    start: realStart,
                    end: realEnd
                });
            }
        }
    };
}
