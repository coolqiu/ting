use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Resolves a potentially "stale" absolute path into a current, valid absolute path.
/// This is critical on iOS and Android where the application's sandbox path (UUID or user-id)
/// can change between app sessions or updates.
/// 
/// If the path contains "audio_archive", it will be re-anchored to the current AppData directory.
pub fn resolve_internal_path(app: &AppHandle, raw_path: &str) -> String {
    let path = Path::new(raw_path);
    
    // Check for "audio_archive" or "downloads" markers which indicate persistent files
    let markers = ["audio_archive", "downloads"];
    for marker in markers {
        if let Some(pos) = raw_path.find(marker) {
            let relative_part = &raw_path[pos..]; 
            
            if let Ok(app_data) = app.path().app_data_dir() {
                let normalized_rel = relative_part.replace('\\', "/");
                let mut final_path = app_data;
                for component in normalized_rel.split('/') {
                    if !component.is_empty() {
                        final_path.push(component);
                    }
                }
                
                if final_path.exists() {
                    return final_path.to_string_lossy().to_string();
                }
                
                return final_path.to_string_lossy().to_string();
            }
        }
    }
    
    // If no internal markers found, or app_data fails, return as-is (e.g. external files on Desktop)
    raw_path.to_string()
}
