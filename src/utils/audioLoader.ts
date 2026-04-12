import { appDataDir, join } from '@tauri-apps/api/path';
import { mkdir, exists } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';

export async function resolveAndArchiveAudio(rawPath: string, originalName: string): Promise<{ destPath: string, finalName: string }> {
    const isAndroidContent = rawPath.startsWith('content://');
    const isMobileFile = rawPath.startsWith('file://');
    const isAlreadyArchived = rawPath.includes('audio_archive');

    if (!isAndroidContent && (!isMobileFile || isAlreadyArchived)) {
        return { destPath: rawPath, finalName: originalName };
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

        // Allow Unicode characters (Chinese, etc.) while keeping the filename safe
        // Build 68+: Fixed Chinese filename encoding issue - complete keep original name
        // Original filename from file system is already valid, no need to filter
        const destPath = await join(archiveDir, `${Date.now()}_${originalName}`);

        console.log(`[AudioLoader Build 68] Chinese filename fix enabled: originalName="${originalName}", destPath="${destPath}"`);
        console.log(`[AudioLoader V53] Archiving via Native Platform Copy...`);
        // Android may return the real filename from ContentResolver
        const realFilename = await invoke<string | null>("copy_file_with_progress", { sourcePath: rawPath, destPath });
        // If we got the real filename from Android, use it instead of what we extracted
        const finalOriginalName = realFilename || originalName;
        console.log(`[AudioLoader Build 68] Final filename: ${finalOriginalName}`);

        return { destPath, finalName: finalOriginalName };
    } catch (e) {
        console.error('Archive error:', e);
        return { destPath: rawPath, finalName: originalName };
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
