import { useState, useMemo, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { WordTimestamp, PlaybackInfo } from "../../../types";

// Extract basename from a path, works for both Unix (/a/b/c.mp3) and Windows (\a\b\c.mp3)
// Used to compare "which file is transcribing" without being affected by Android path
// format differences (/data/user/0/... vs /data/data/... — same physical location, different string)
function getFileKey(path: string): string {
    return path.split(/[/\\]/).pop() || path;
}

export function useTranscript(playback: PlaybackInfo | null) {
    const [words, setWords] = useState<WordTimestamp[]>([]);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [transcribeProgress, setTranscribeProgress] = useState(0);
    // Stores the BASENAME of the file currently being transcribed (not full path),
    // so Android path format differences don't break the "already transcribing" guard.
    const [currentFileTranscribing, setCurrentFileTranscribing] = useState<string | null>(null);

    // AI Model State (extracted from main)
    const [modelExists, setModelExists] = useState<boolean>(true);
    const [isDownloading, setIsDownloading] = useState<boolean>(false);
    const [downloadProgress, setDownloadProgress] = useState<{ downloaded: number; total: number } | null>(null);

    const startTranscription = useCallback((force = false) => {
        if (!playback?.file_path) return;
        const fileKey = getFileKey(playback.file_path);
        if (!force && currentFileTranscribing === fileKey) return;

        setCurrentFileTranscribing(fileKey);
        setIsTranscribing(true);
        setTranscribeProgress(0);
        setWords([]);

        invoke<WordTimestamp[]>("transcribe_audio", { path: playback.file_path, force_refresh: force })
            .then((result) => setWords(result))
            .catch((e) => console.error("Transcription failed", e))
            .finally(() => setIsTranscribing(false));
    }, [playback?.file_path, currentFileTranscribing]);

    // Initial Model Check & Listeners (Build 97.1 logic)
    useEffect(() => {
        async function checkModel() {
            try {
                const exists = await invoke<boolean>("check_model_exists");
                setModelExists(exists);
            } catch (e) { console.error("Failed to check model:", e); }
        }
        checkModel();

        const unlistenModel = listen<{ downloaded: number; total: number }>("model-download-progress", (event) => {
            setDownloadProgress(event.payload);
            if (event.payload.downloaded >= event.payload.total && event.payload.total > 0) {
                setIsDownloading(false);
                setModelExists(true);
            }
        });

        const unlistenProgress = listen<number>("transcribe-progress", (event) => {
            setTranscribeProgress(event.payload);
        });

        return () => {
            unlistenModel.then((fn) => fn());
            unlistenProgress.then((fn) => fn());
        };
    }, []);

    // Auto-trigger transcription
    useEffect(() => {
        if (modelExists && playback?.file_path) {
            const fileKey = getFileKey(playback.file_path);
            if (currentFileTranscribing !== fileKey) {
                startTranscription();
            }
        }
    }, [modelExists, playback?.file_path, currentFileTranscribing, startTranscription]);

    const handleDownloadModel = async () => {
        setIsDownloading(true);
        setDownloadProgress({ downloaded: 0, total: 100 });
        try {
            await invoke("download_default_model");
            setModelExists(true);
        } catch (e) {
            console.error("Failed to download model:", e);
        } finally {
            setIsDownloading(false);
        }
    };

    // Unified Source of Truth: memoWords filters out hallucinations once (Build 97.1 algorithm)
    const memoWords = useMemo(() => {
        if (!words || words.length === 0) return [];
        
        let filteredWords: WordTimestamp[] = [];
        let duplicateCount = 0;
        for (let i = 0; i < words.length; i++) {
            const currentWText = words[i].word.trim().toLowerCase().replace(/[.,!?。！？]/g, '');
            if (i > 0) {
                const prevWText = words[i - 1].word.trim().toLowerCase().replace(/[.,!?。！？]/g, '');
                if (currentWText === prevWText) duplicateCount++;
                else duplicateCount = 0;
            } else duplicateCount = 0;
            if (duplicateCount < 2) filteredWords.push(words[i]);
        }

        const cleanWords: WordTimestamp[] = [];
        const maxSeqLen = 20; 
        for (let i = 0; i < filteredWords.length; i++) {
            let isSeqDuplicate = false;
            for (let len = 4; len <= maxSeqLen; len++) {
                if (i >= len && i + len <= filteredWords.length) {
                    const gap = filteredWords[i].start_ms - filteredWords[i - 1].end_ms;
                    if (gap < 5000) {
                        let match = true;
                        for (let k = 0; k < len; k++) {
                            const wordA = filteredWords[i - len + k].word.trim().toLowerCase().replace(/[.,!?。！？]/g, '');
                            const wordB = filteredWords[i + k].word.trim().toLowerCase().replace(/[.,!?。！？]/g, '');
                            if (wordA !== wordB) { match = false; break; }
                        }
                        if (match) { isSeqDuplicate = true; i += (len - 1); break; }
                    }
                }
            }
            if (!isSeqDuplicate) cleanWords.push(filteredWords[i]);
        }
        return cleanWords;
    }, [words]);

    // Group clean words into lines for efficient rendering (Build 97.1 algorithm)
    const transcriptLines = useMemo(() => {
        const lines: { text: string; start: number; end: number; words: WordTimestamp[] }[] = [];
        let currentLine: WordTimestamp[] = [];
        for (let i = 0; i < memoWords.length; i++) {
            currentLine.push(memoWords[i]);
            const w = memoWords[i].word.trim().toLowerCase();
            const isAbbrev = ["mr.", "mrs.", "ms.", "dr.", "prof.", "st.", "vs.", "etc."].includes(w);
            const isEnd = /[.!?。！？]$/.test(memoWords[i].word.trim()) && !isAbbrev;
            const gap = (i < memoWords.length - 1) ? (memoWords[i + 1].start_ms - memoWords[i].end_ms) : 0;
            if ((isEnd && (gap > 250 || currentLine.length > 20)) || gap > 800 || i === memoWords.length - 1) {
                if (currentLine.length > 0) {
                    lines.push({
                        text: currentLine.map(x => x.word).join(" "),
                        start: currentLine[0].start_ms,
                        end: currentLine[currentLine.length - 1].end_ms,
                        words: [...currentLine]
                    });
                }
                currentLine = [];
            }
        }
        return lines;
    }, [memoWords]);

    return {
        words,
        memoWords,
        transcriptLines,
        isTranscribing,
        transcribeProgress,
        modelExists,
        isDownloading,
        downloadProgress,
        startTranscription,
        handleDownloadModel,
        setWords
    };
}
