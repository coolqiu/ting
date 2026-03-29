export enum PlaybackMode {
    Global = "Global",
    SingleLoop = "SingleLoop",
    ListLoop = "ListLoop",
}

export interface ABSegment {
    id: string; // uuid
    start_secs: number;
    end_secs: number;
    loop_count: number;
}

export interface WordTimestamp {
    word: string;
    start_ms: number;
    end_ms: number;
    confidence: number;
}

export interface PlaybackInfo {
    file_path: string;
    file_name: string;
    material_id: number | null;
    duration_secs: number;
    position_secs: number;
    is_playing: boolean;
    volume: number;
    speed: number;
    mode: PlaybackMode;
    segments: ABSegment[];
    active_segment_id: string | null;
    loop_remaining: number | null;
}

export interface LearningMaterial {
    id: number;
    title: string;
    source_url: string;
    duration_ms: number;
    last_opened_at: string;
    progress_secs: number | null;
}
