import { useCallback, MutableRefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PlaybackInfo } from "../../../types";

interface UseAudioEngineProps {
    playback: PlaybackInfo | null;
    isPlaying: boolean;
    setIsPlaying: (playing: boolean) => void;
    position: number;
    setPosition: (pos: number) => void;
    duration: number;
    setVolume: (vol: number) => void;
    setSpeed: (speed: number) => void;
    isSeekingRef: MutableRefObject<number>;
    targetPositionRef: MutableRefObject<number | null>;
}

export function useAudioEngine({
    playback,
    isPlaying,
    setIsPlaying,
    position,
    setPosition,
    duration,
    setVolume,
    setSpeed,
    isSeekingRef,
    targetPositionRef,
}: UseAudioEngineProps) {

    const handlePlayPause = useCallback(async () => {
        if (!playback) return;
        try {
            if (isPlaying) {
                await invoke("pause");
                setIsPlaying(false);
            } else {
                if (position >= duration - 0.2) {
                    await invoke("seek", { position_secs: 0 });
                    await invoke("play");
                } else if (position === 0) {
                    await invoke("play");
                } else {
                    await invoke("resume");
                }
                setIsPlaying(true);
            }
        } catch (e) {
            try {
                await invoke("play");
                setIsPlaying(true);
            } catch {
                console.error("Playback error:", e);
            }
        }
    }, [playback, isPlaying, position, duration, setIsPlaying]);

    const handleSkip = useCallback(async (deltaSecs: number) => {
        const newPos = Math.max(0, Math.min(duration, position + deltaSecs));
        isSeekingRef.current = Date.now();
        targetPositionRef.current = newPos;
        setPosition(newPos);
        try {
            await invoke("seek", { position_secs: newPos });
        } catch (e) {
            console.error("Seek error:", e);
        }
    }, [duration, position, setPosition, isSeekingRef, targetPositionRef]);

    const handleSeek = useCallback(async (pos: number) => {
        const newPos = Math.max(0, Math.min(duration, pos));
        isSeekingRef.current = Date.now();
        targetPositionRef.current = newPos;
        setPosition(newPos);
        try {
            await invoke("seek", { position_secs: newPos });
        } catch (e) {
            console.error("Seek error:", e);
        }
    }, [duration, setPosition, isSeekingRef, targetPositionRef]);

    const handleVolumeChange = useCallback((vol: number) => {
        setVolume(vol);
        invoke("set_volume", { volume: vol }).catch(console.error);
    }, [setVolume]);

    const handleSpeedChange = useCallback(async (newSpeed: number) => {
        setSpeed(newSpeed);
        try {
            await invoke("set_speed", { speed: newSpeed });
        } catch (e) {
            console.error("Speed error:", e);
        }
    }, [setSpeed]);

    return {
        handlePlayPause,
        handleSkip,
        handleSeek,
        handleVolumeChange,
        handleSpeedChange
    };
}
