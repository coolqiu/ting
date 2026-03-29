import { appDataDir, join } from '@tauri-apps/api/path';
import { readFile, writeFile, mkdir, exists } from '@tauri-apps/plugin-fs';

/**
 * Resolves an audio file path selected via the Tauri dialog.
 * If the path is an Android `content://` URI, it reads the file via
 * Android's ContentResolver (handled natively by tauri-plugin-fs)
 * and writes the bytes into the app's private storage sandbox.
 *
 * @param rawPath The file path returned by `@tauri-apps/plugin-dialog`
 * @param originalName The original filename to preserve extension
 * @returns The definitive, POSIX-compliant absolute path to the audio file
 */
export async function resolveAndArchiveAudio(rawPath: string, originalName: string): Promise<string> {
    // If it's a standard absolute path (e.g., Windows/Mac or already cached), return as is.
    if (!rawPath.startsWith('content://')) {
        return rawPath;
    }

    try {
        // Prepare the internal archive directory
        const appData = await appDataDir();
        const archiveDir = await join(appData, "audio_archive");

        // Ensure the directory exists
        const dirExists = await exists(archiveDir);
        if (!dirExists) {
            await mkdir(archiveDir, { recursive: true });
        }

        // Sanitize filename and prepend timestamp to avoid collisions
        const safeName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const newFileName = `${Date.now()}_${safeName}`;
        const destPath = await join(archiveDir, newFileName);

        console.log(`[AudioLoader] Reading content URI via ContentResolver...`);

        // readFile on Android uses ContentResolver to open content:// URIs natively
        const bytes = await readFile(rawPath);

        // Write the bytes to permanent internal storage
        await writeFile(destPath, bytes);

        console.log(`[AudioLoader] Archived to: ${destPath}`);
        return destPath;
    } catch (err) {
        console.error("[AudioLoader] Failed to archive Android content URI:", err);
        throw new Error(`Failed to archive audio file: ${err}`);
    }
}
