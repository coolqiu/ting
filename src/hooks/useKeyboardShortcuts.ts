import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export function useKeyboardShortcuts() {
    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            // Ignore if user is typing in an input or textarea
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement ||
                (e.target as HTMLElement).isContentEditable
            ) {
                return;
            }

            switch (e.key.toLowerCase()) {
                case " ": // Space
                    e.preventDefault();
                    await invoke("toggle_play").catch(console.error);
                    break;
                case "arrowleft":
                    e.preventDefault();
                    await invoke("seek_relative", { seconds: -5.0 }).catch(console.error);
                    break;
                case "arrowright":
                    e.preventDefault();
                    await invoke("seek_relative", { seconds: 5.0 }).catch(console.error);
                    break;
                case "r":
                    e.preventDefault();
                    // Implement repeat logic - either re-toggle segment or jump to segment start
                    const currentStatus = await invoke<any>("get_playback_state").catch(() => null);
                    if (currentStatus?.active_segment_id) {
                        // If in AB loop or segment, maybe just jump back to segment start
                        // For now, let's just trigger a logic that restarts the current segment
                        await invoke("restart_segment").catch(console.error);
                    }
                    break;
                default:
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);
}
