export function formatTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

export function generateId(): string {
    return Math.random().toString(36).substring(2, 9);
}
