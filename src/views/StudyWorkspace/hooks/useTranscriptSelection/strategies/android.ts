import { TranscriptSelectionContext } from "../types";

export class AndroidSelectionStrategy {
    private selectTimeout: number | null = null;

    constructor(private context: TranscriptSelectionContext) {}

    public onMount() {
        document.addEventListener("selectionchange", this.handleSelectionChange);
        document.addEventListener("touchend", this.handleLift, { passive: false });
        document.addEventListener("mouseup", this.handleLift, { passive: false });
        document.addEventListener("contextmenu", this.preventContextMenu, { capture: true });
    }

    public onUnmount() {
        document.removeEventListener("selectionchange", this.handleSelectionChange);
        document.removeEventListener("touchend", this.handleLift);
        document.removeEventListener("mouseup", this.handleLift);
        document.removeEventListener("contextmenu", this.preventContextMenu, { capture: true });
        if (this.selectTimeout) window.clearTimeout(this.selectTimeout);
    }

    // Bug fix: On Android, selectionchange fires continuously while dragging handles.
    // We now show the popup directly from selectionchange after a stability delay,
    // rather than relying on touchend/handleLift (which may fire before selection is
    // finalized, or with a target that fails the .transcript-word check).
    private handleSelectionChange = () => {
        if (this.selectTimeout) window.clearTimeout(this.selectTimeout);

        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
            this.context.setSelectionPopup(null);
            this.context.setIsSelecting(false);
            return;
        }

        // Mark as selecting immediately so UI can react (e.g. hide other overlays)
        this.context.setIsSelecting(true);

        // Wait for selection to stabilize (user has stopped dragging handles)
        // 200ms is enough on Android WebView; shorter values cause flickering popups
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

    // handleLift now ONLY handles preventing native context/callout menus.
    // Popup display is handled entirely via handleSelectionChange above.
    private handleLift = (e?: any) => {
        if (e?.target && (e.target as HTMLElement).closest('.selection-popup')) return;

        const sel = window.getSelection();
        const hasSelection = sel && !sel.isCollapsed;
        const target = e?.target as HTMLElement | undefined;
        const isTranscript = !!target?.closest('.transcript-text, .transcript-word');

        // Prevent native Android callout/context menu when inside transcript
        if (hasSelection && isTranscript && e && e.cancelable) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    private preventContextMenu = (e: Event) => {
        const target = e.target as HTMLElement;
        if (target && target.closest('.no-native-callout')) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    /** 安全地将 Node（可能是文本节点）转换为 Element，避免在文本节点上调用 .closest() */
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
