import { useRef, useEffect } from "react";
import TranscriptLine from "./TranscriptLine";
import { WordTimestamp } from "../../../types";

interface TranscriptViewProps {
    lines: { text: string; start: number; end: number; words: WordTimestamp[] }[];
    position: number;
    isPlaying: boolean;
    activeTab: string;
    onWordClick: (pos: number) => void;
    materialId: number | null;
    onScrollHidePopup?: () => void;
}

export default function TranscriptView({
    lines,
    position,
    isPlaying,
    activeTab,
    onWordClick,
    materialId,
    onScrollHidePopup
}: TranscriptViewProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    // Build 97: Smooth Auto-scroll to current line
    useEffect(() => {
        if (activeTab === 'transcript' && isPlaying) {
            const activeLine = document.getElementById("active-transcript-line");
            if (activeLine) {
                activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [position, activeTab, isPlaying, lines.length]);

    // Build 97.1: Persistent scroll position restoration
    useEffect(() => {
        if (activeTab === 'transcript' && lines.length > 0 && containerRef.current && materialId) {
            const savedScroll = sessionStorage.getItem(`transcript_scroll_${materialId}`);
            if (savedScroll) {
                containerRef.current.scrollTop = parseInt(savedScroll, 10);
            }
        }
    }, [activeTab, lines.length, materialId]);

    const handleScroll = () => {
        if (containerRef.current && materialId) {
            sessionStorage.setItem(`transcript_scroll_${materialId}`, containerRef.current.scrollTop.toString());
        }
        if (onScrollHidePopup) onScrollHidePopup();
    };

    if (lines.length === 0) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                No transcript available.
            </div>
        );
    }

    let cumulativeWords = 0;
    return (
        <div 
            ref={containerRef} 
            onScroll={handleScroll}
            className="transcript-container custom-scrollbar" 
            style={{ flex: 1, overflowY: 'auto', padding: '24px', position: 'relative' }}
        >
            {lines.map((line, idx) => {
                const isActive = (position * 1000) >= line.start && (position * 1000) <= line.end;
                const startIdx = cumulativeWords;
                cumulativeWords += line.words.length;
                
                return (
                    <TranscriptLine
                        key={idx}
                        line={line}
                        isActive={isActive}
                        onWordClick={onWordClick}
                        startIndex={startIdx}
                    />
                );
            })}
        </div>
    );
}
