import { memo, Fragment } from "react";
import { WordTimestamp } from "../../../../types";

function formatTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

const TranscriptLineDesktop = memo(({
    line,
    isActive,
    onWordClick,
    startIndex,
}: {
    line: { text: string; start: number; end: number; words: WordTimestamp[] };
    isActive: boolean;
    onWordClick: (pos: number) => void;
    startIndex: number;
}) => {
    return (
        <p
            id={isActive ? "active-transcript-line" : undefined}
            className={`transcript-line no-native-callout ${isActive ? 'active-line' : ''}`}
            style={{
                fontWeight: isActive ? 700 : 400,
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                marginBottom: '16px',
                lineHeight: '1.6',
                transition: 'color 0.2s, font-weight 0.2s',
            }}
        >
            <span
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2px 8px',
                    marginRight: '8px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: isActive ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: isActive ? 'white' : 'var(--text-muted)',
                    cursor: 'pointer',
                    userSelect: 'none'
                }}
                onClick={() => onWordClick(line.start / 1000)}
            >
                {formatTime(line.start / 1000)}
            </span>
            <span style={{ userSelect: 'text' }}>
                {line.words.map((w, i) => (
                    <Fragment key={i}>
                        <span
                            className="transcript-word"
                            data-index={startIndex + i}
                            onClick={() => {
                                const sel = window.getSelection();
                                if (!sel || sel.isCollapsed) {
                                    onWordClick(w.start_ms / 1000);
                                }
                            }}
                            style={{
                                display: "inline",
                                cursor: "pointer",
                                padding: "2px 2px",
                                borderRadius: "4px",
                                userSelect: "text"
                            }}
                        >
                            {w.word}
                        </span>
                        {" "}
                    </Fragment>
                ))}
            </span>
        </p>
    );
});

export default TranscriptLineDesktop;
