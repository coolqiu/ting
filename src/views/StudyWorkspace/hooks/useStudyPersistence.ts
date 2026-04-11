import { useRef, useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PlaybackInfo } from "../../../types";

interface UseStudyPersistenceProps {
    playback: PlaybackInfo | null;
    setPlayback: React.Dispatch<React.SetStateAction<PlaybackInfo | null>>;
    setPosition: (pos: number) => void;
    setVolume: (vol: number) => void;
    setSpeed: (speed: number) => void;
    setIsPlaying: (playing: boolean) => void;
    setResumeData: (data: any) => void;
    pollState: () => void;
}

export function useStudyPersistence({
    playback,
    setPlayback,
    setPosition,
    setVolume,
    setSpeed,
    setResumeData,
    pollState
}: UseStudyPersistenceProps) {
    const isDirtyRef = useRef(false);
    const isRestoringRef = useRef(false);
    const expectedSegmentCountRef = useRef(-1);
    const [isBooting, setIsBooting] = useState(true);
    const isBootingRef = useRef(true);
    const hasSyncProgressRef = useRef<Record<number, boolean>>({});
    const lastSavedRef = useRef<{ materialId: number; position: number; time: number }>({
        materialId: 0,
        position: 0,
        time: 0,
    });
    const lastSessionSegmentsRef = useRef<number>(0);
    const playbackRef = useRef<PlaybackInfo | null>(null);
    const hasCheckedAutoLoadRef = useRef(false);

    useEffect(() => {
        playbackRef.current = playback;
    }, [playback]);

    const saveProgress = useCallback(async (manualData?: PlaybackInfo, retryCount = 0, force = false) => {
        const pb = manualData || playbackRef.current;
        if (!pb?.material_id) return;

        if (!manualData && !isDirtyRef.current && !force) return;

        const currentSegs = (pb.segments || []).length;
        if (isBootingRef.current && currentSegs === 0 && !force) return;

        if (currentSegs === 0 && lastSessionSegmentsRef.current > 0 && !manualData && !force) return;

        try {
            const data = {
                material_id: pb.material_id,
                position_secs: pb.position_secs,
                volume: pb.volume,
                speed: pb.speed,
                mode: pb.mode,
                segments: pb.segments.map((s) => ({
                    id: s.id,
                    start_secs: s.start_secs,
                    end_secs: s.end_secs,
                    loop_count: s.loop_count,
                })),
                active_segment_id: pb.active_segment_id,
                updated_at: null,
            };

            await invoke("save_material_progress", { progress: data });
            isDirtyRef.current = false;
            
            if (currentSegs > 0) lastSessionSegmentsRef.current = currentSegs;
            if (!manualData) {
                lastSavedRef.current = { materialId: pb.material_id, position: pb.position_secs, time: Date.now() };
            }
        } catch (e) {
            if (retryCount < 3 && manualData) {
                setTimeout(() => saveProgress(manualData, retryCount + 1), 800);
            }
        }
    }, [isBootingRef, lastSessionSegmentsRef, isDirtyRef]);

    const applyProgress = useCallback(async (data: any) => {
        if (!data) return;
        isRestoringRef.current = true;
        setResumeData(null);

        try {
            isDirtyRef.current = false;
            if (data.position_secs > 0) {
                setPosition(data.position_secs);
                await invoke("seek", { position_secs: data.position_secs }).catch(() => { });
            }
            if (data.volume !== undefined) {
                setVolume(data.volume);
                await invoke("set_volume", { volume: data.volume }).catch(() => { });
            }
            if (data.speed !== undefined) {
                setSpeed(data.speed);
                await invoke("set_speed", { speed: data.speed }).catch(() => { });
            }
            if (data.mode) {
                await invoke("set_mode", { mode: data.mode }).catch(() => { });
            }

            const segs = data.segments || [];
            expectedSegmentCountRef.current = segs.length;
            isDirtyRef.current = false;

            setPlayback((prev) => {
                const baseInfo: PlaybackInfo = prev || {
                    file_path: data.material_id?.toString() || "",
                    file_name: "",
                    material_id: data.material_id,
                    duration_secs: 0,
                    position_secs: data.position_secs,
                    is_playing: false,
                    volume: data.volume || 1.0,
                    speed: data.speed || 1.0,
                    mode: data.mode || "Global",
                    segments: segs,
                    active_segment_id: data.active_segment_id || null,
                    loop_remaining: null
                };
                return { 
                    ...baseInfo, 
                    segments: segs, 
                    material_id: data.material_id, 
                    active_segment_id: data.active_segment_id || null 
                };
            });

            if (data.material_id) {
                 await invoke("set_material_id", { id: data.material_id }).catch(() => {});
            }
            for (const seg of segs) {
                await invoke("add_segment", { segment: seg }).catch(() => { });
            }
            if (data.active_segment_id) {
                await invoke("set_active_segment", { id: data.active_segment_id }).catch(() => { });
            }

            setTimeout(() => {
                isRestoringRef.current = false;
                pollState();
            }, 300);
        } catch (e) {
            isRestoringRef.current = false;
        }
    }, [pollState, setPlayback, setPosition, setSpeed, setVolume, setResumeData]);

    const checkAndLoadProgress = useCallback(async (materialId: number, autoResume: boolean = false, forceShow: boolean = false) => {
        try {
            if (hasSyncProgressRef.current[materialId] && !forceShow) return;
            const progress = await invoke<any>("get_material_progress", { material_id: materialId });
            if (progress && (progress.position_secs > 5 || (progress.segments && progress.segments.length > 0))) {
                hasSyncProgressRef.current[materialId] = true;
                if (autoResume) {
                    await applyProgress(progress);
                } else {
                    setResumeData(progress);
                }
            }
        } catch (e) {
            console.error("Check progress failed", e);
        } finally {
            setTimeout(() => { 
                isBootingRef.current = false; 
                setIsBooting(false);
            }, 1000);
        }
    }, [applyProgress, setResumeData]);

    useEffect(() => {
        const init = async () => {
            if (hasCheckedAutoLoadRef.current) return;
            hasCheckedAutoLoadRef.current = true;
            try {
                const state = await invoke<PlaybackInfo>("get_playback_state");
                console.log("[Persistence] Initial state check:", state?.file_path || "empty");
                if (state && state.file_path !== "") {
                    if (state.material_id) {
                        await checkAndLoadProgress(state.material_id, true);
                    }
                    setIsBooting(false);
                    isBootingRef.current = false;
                    return;
                }
                
                console.log("[Persistence] Checking recent materials...");
                const materials = await invoke<any[]>("get_recent_materials");
                console.log("[Persistence] Recent materials count:", materials?.length || 0);

                if (materials && materials.length > 0) {
                    const latest = materials[0];
                    console.log("[Persistence] Auto-loading latest:", latest.title);
                    try {
                        const info = await invoke<PlaybackInfo>("load_audio", { path: latest.source_url });
                        await invoke("set_material_id", { id: latest.id });
                        
                        setPlayback({ 
                            ...info, 
                            material_id: latest.id,
                            segments: [],
                            active_segment_id: null,
                            loop_remaining: null
                        });
                        console.log("[Persistence] Audio loaded for:", latest.id);
                        setPosition(0);
                        await checkAndLoadProgress(latest.id, true);
                    } catch (e) {
                        console.error("[Persistence] Auto-load sub-step failed:", e);
                    }
                }
            } catch (e) {
                console.error("[Persistence] Global init failure:", e);
            } finally {
                console.log("[Persistence] Boot sequence complete.");
                setIsBooting(false);
                isBootingRef.current = false;
            }
        };
        init();
    }, [checkAndLoadProgress, setPlayback, setPosition]);

    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === "hidden") saveProgress(undefined, 0, true);
        };
        const handleBlur = () => saveProgress(undefined, 0, true);
        document.addEventListener("visibilitychange", handleVisibility);
        window.addEventListener("blur", handleBlur);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibility);
            window.removeEventListener("blur", handleBlur);
        };
    }, [saveProgress]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (Date.now() - lastSavedRef.current.time > 10000) saveProgress();
        }, 5000);
        return () => {
            clearInterval(interval);
            if (!isBootingRef.current && isDirtyRef.current) saveProgress(undefined, 0, true);
        };
    }, [saveProgress]);

    return {
        isDirtyRef,
        isRestoringRef,
        isBootingRef,
        expectedSegmentCountRef,
        hasSyncProgressRef,
        lastSavedRef,
        isBooting,
        checkAndLoadProgress,
        saveProgress,
        applyProgress
    };
}
