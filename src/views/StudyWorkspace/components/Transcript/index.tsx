import { useRef, useEffect } from "react";
import TranscriptLineDesktop from "./TranscriptLine.desktop";
import TranscriptLineAndroid from "./TranscriptLine.android";
import { WordTimestamp } from "../../../../types";

interface TranscriptViewProps {
    lines: { text: string; start: number; end: number; words: WordTimestamp[] }[];
    position: number;
    isPlaying: boolean;
    activeTab: string;
    onWordClick: (pos: number) => void;
    isMobile: boolean;
    materialId?: number | null;
}

export default function TranscriptView({
    lines,
    position,
    isPlaying,
    activeTab,
    onWordClick,
    isMobile,
    materialId
}: TranscriptViewProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll logic (Build 97.1)
    useEffect(() => {
        if (activeTab === 'transcript' && isPlaying) {
            const activeLine = document.getElementById("active-transcript-line");
            if (activeLine) {
                activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [position, activeTab, isPlaying, lines.length]);

    // Persistence of scroll position (Build 97.1)
    useEffect(() => {
        if (activeTab === 'transcript' && lines.length > 0 && containerRef.current && materialId) {
            const savedScroll = sessionStorage.getItem(`transcript_scroll_${materialId}`);
            if (savedScroll) {
                containerRef.current.scrollTop = parseInt(savedScroll);
            }
        }
    }, [activeTab, lines.length, materialId]);

    const handleScroll = () => {
        if (containerRef.current && materialId) {
            sessionStorage.setItem(`transcript_scroll_${materialId}`, containerRef.current.scrollTop.toString());
        }
    };

    const LineComponent = isMobile ? TranscriptLineAndroid : TranscriptLineDesktop;

    if (lines.length === 0) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                No transcript available.
            </div>
        );
    }

    return (
        <div 
            ref={containerRef} 
            onScroll={handleScroll}
            className="transcript-container custom-scrollbar" 
            style={{ flex: 1, overflowY: 'auto', padding: '20px', height: '100%' }}
        >
            {(() => {
                let cumulativeWords = 0;
                return lines.map((line, idx) => {
                    const isActive = (position * 1000) >= line.start && (position * 1000) <= line.end;
                    const startIdx = cumulativeWords;
                    cumulativeWords += line.words.length;
                    
                    return (
                        <LineComponent
                            key={idx}
                            line={line}
                            isActive={isActive}
                            onWordClick={onWordClick}
                            startIndex={startIdx}
                        />
                    );
                });
            })()}
        </div>
    );
}
