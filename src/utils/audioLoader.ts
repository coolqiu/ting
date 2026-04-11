import { appDataDir, join } from '@tauri-apps/api/path';
import { mkdir, exists } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';

export async function resolveAndArchiveAudio(rawPath: string, originalName: string): Promise<string> {
    const isAndroidContent = rawPath.startsWith('content://');
    const isMobileFile = rawPath.startsWith('file://');
    const isAlreadyArchived = rawPath.includes('audio_archive');

    if (!isAndroidContent && (!isMobileFile || isAlreadyArchived)) {
        return rawPath;
    }

    try {
        let appData = await appDataDir();

        // [V53] Surgical iOS Fix: Only normalize on iOS if double Library is found
        if (/iPad|iPhone|iPod/.test(navigator.userAgent) && appData.includes('Library/Library')) {
            appData = appData.replace('Library/Library', 'Library');
        }

        const archiveDir = await join(appData, "audio_archive");
        console.log(`[AudioLoader V53] Final Archive Dir: ${archiveDir}`);

        if (!(await exists(archiveDir))) {
            await mkdir(archiveDir, { recursive: true });
        }

        const safeName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const destPath = await join(archiveDir, `${Date.now()}_${safeName}`);

        console.log(`[AudioLoader V53] Archiving via Native Platform Copy...`);
        await invoke("copy_file_with_progress", { sourcePath: rawPath, destPath });

        return destPath;
    } catch (e) {
        console.error('Archive error:', e);
        return rawPath;
    }
}

/**
 * [Build 67] Robustly decodes strings that might be URL encoded.
 * Handles potential double or triple encoding common on some Android/iOS file pickers.
 */
export function decodeSafe(s: string): string {
    if (!s) return "";
    let decoded = s;
    try {
        // Try decoding up to 3 times to handle multi-layer encoding (e.g. %25E4...)
        for (let i = 0; i < 3; i++) {
            const prev = decoded;
            decoded = decodeURIComponent(decoded);
            if (decoded === prev) break;
        }
    } catch (e) {
        // If it throws, it's either not encoded or contains bad '%' sequences.
        // Return original if first attempt fails, or the last successful deck.
    }
    return decoded;
}
