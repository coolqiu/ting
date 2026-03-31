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
        const appData = await appDataDir();
        const archiveDir = await join(appData, "audio_archive");

        if (!(await exists(archiveDir))) {
            await mkdir(archiveDir, { recursive: true });
        }

        const safeName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const destPath = await join(archiveDir, `${Date.now()}_${safeName}`);

        console.log(`[AudioLoader V48] Archiving via Native Platform Copy...`);
        await invoke("copy_file_with_progress", { sourcePath: rawPath, destPath });

        return destPath;
    } catch (err) {
        console.error("[AudioLoader] Archive failed:", err);
        throw new Error(`Failed to archive audio file: ${err}`);
    }
}
