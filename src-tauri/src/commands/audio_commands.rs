use crate::audio::engine::{ABSegment, PlaybackInfo, PlaybackMode};
use crate::audio::AudioState;
use std::io::Write;
use tauri::State;

#[tauri::command]
pub fn load_audio(path: String, state: State<'_, AudioState>) -> Result<PlaybackInfo, String> {
    state.handle.load(&path)
}

#[tauri::command]
pub fn play(state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.play()
}

#[tauri::command]
pub fn pause(state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.pause()
}

#[tauri::command]
pub fn resume(state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.resume()
}

#[tauri::command]
pub fn stop(state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.stop()
}

#[tauri::command]
pub fn unload_audio(state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.unload()
}

#[tauri::command]
pub fn seek(position_secs: f64, state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.seek(position_secs)
}

#[tauri::command]
pub fn set_volume(volume: f32, state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.set_volume(volume)
}

#[tauri::command]
pub fn set_speed(speed: f32, state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.set_speed(speed)
}

#[tauri::command]
pub fn set_mode(mode: PlaybackMode, state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.set_mode(mode)
}

#[tauri::command]
pub fn add_segment(segment: ABSegment, state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.add_segment(segment)
}

#[tauri::command]
pub fn update_segment(segment: ABSegment, state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.update_segment(segment)
}

#[tauri::command]
pub fn set_material_id(id: Option<i64>, state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.set_material_id(id)
}

#[tauri::command]
pub fn remove_segment(id: String, state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.remove_segment(id)
}

#[tauri::command]
pub fn set_active_segment(id: Option<String>, state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.set_active_segment(id)
}

#[tauri::command]
pub fn get_playback_state(state: State<'_, AudioState>) -> PlaybackInfo {
    state.handle.get_state()
}

/// Accepts raw WAV bytes from the frontend recorder, writes them to a timestamped temp file,
/// and returns the absolute file path for use with `transcribe_audio`.
/// Using a unique filename per recording ensures the transcription cache is not stale.
#[tauri::command]
pub fn save_temp_audio(bytes: Vec<u8>) -> Result<String, String> {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    // Delete any previous recording files to avoid filling up temp dir
    let temp_dir = std::env::temp_dir();
    if let Ok(entries) = std::fs::read_dir(&temp_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let n = name.to_string_lossy();
            if n.starts_with("ting_rec_") && n.ends_with(".wav") {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
    let path = temp_dir.join(format!("ting_rec_{}.wav", ts));
    let mut file =
        std::fs::File::create(&path).map_err(|e| format!("Failed to create temp file: {}", e))?;
    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;
    path.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid temp path".to_string())
}

/// Saves the WAV recording to a user-specified location using a native Save dialog.
#[tauri::command]
pub async fn save_recording_as(app: tauri::AppHandle, bytes: Vec<u8>) -> Result<(), String> {
    use tauri_plugin_dialog::DialogExt;

    let path = app
        .dialog()
        .file()
        .add_filter("WAV Audio", &["wav"])
        .set_file_name("ting_recording.wav")
        .blocking_save_file();

    if let Some(fp) = path {
        let dest = fp.as_path().ok_or("Invalid path")?;
        let mut file =
            std::fs::File::create(dest).map_err(|e| format!("Failed to create file: {}", e))?;
        file.write_all(&bytes)
            .map_err(|e| format!("Failed to write file: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn restart_segment(state: tauri::State<'_, AudioState>) -> Result<(), String> {
    let info = state.handle.get_state();
    if let Some(id) = &info.active_segment_id {
        if let Some(seg) = info.segments.iter().find(|s| &s.id == id) {
            let _ = state.handle.seek(seg.start_secs);
            return Ok(());
        }
    }
    Ok(())
}
