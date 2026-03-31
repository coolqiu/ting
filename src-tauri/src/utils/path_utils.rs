use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Resolves a potentially "stale" absolute path into a current, valid absolute path.
/// This is critical on iOS and Android where the application's sandbox path (UUID or user-id)
/// can change between app sessions or updates.
/// 
/// If the path contains "audio_archive", it will be re-anchored to the current AppData directory.
pub fn resolve_internal_path(app: &AppHandle, raw_path: &str) -> String {
    let path = Path::new(raw_path);
    
    // --- Robust iOS Root Anchoring ---
    // Paths on iOS look like: file:///.../Application/<UUID>/<RelativePath>
    // The <UUID> changes on updates/reinstalls. We seek the part after <UUID>.
    if let Some(app_pos) = raw_path.find("/Application/") {
        let after_app = &raw_path[app_pos + 13..]; // Skip "/Application/"
        if let Some(slash_pos) = after_app.find('/') {
            let relative_part = &after_app[slash_pos + 1..]; // e.g. "tmp/org.ting.app-Inbox/..."
            
            // Get current Application Root: parent of parent of Caches (Library/Caches)
            if let Ok(cache_dir) = app.path().app_cache_dir() {
                if let Some(app_root) = cache_dir.parent().and_then(|p| p.parent()) {
                    let mut final_path = app_root.to_path_buf();
                    let normalized_rel = relative_part.replace('\\', "/");
                    for component in normalized_rel.split('/') {
                        if !component.is_empty() {
                            final_path.push(component);
                        }
                    }
                    
                    return final_path.to_string_lossy().to_string();
                }
            }
        }
    }

    // --- Marker-based Fallback (for Android or non-standard iOS paths) ---
    let markers = ["audio_archive", "downloads", "tmp", "Documents", "Inbox"];
    for marker in markers {
        if let Some(pos) = raw_path.find(marker) {
            let relative_part = &raw_path[pos..]; 
            
            // Get the appropriate root based on the marker
            let target_base = if marker == "tmp" || marker == "Inbox" {
                app.path().app_cache_dir().ok().map(|p| p.parent().unwrap().join("tmp"))
            } else if marker == "Documents" {
                app.path().document_dir().ok()
            } else {
                app.path().app_data_dir().ok()
            };

            if let Some(mut final_path) = target_base {
                let normalized_rel = relative_part.replace('\\', "/");
                for component in normalized_rel.split('/') {
                    if !component.is_empty() {
                        final_path.push(component);
                    }
                }
                
                return final_path.to_string_lossy().to_string();
            }
        }
    }
    
    // If no internal markers found, or app_data fails, return as-is (e.g. external files on Desktop)
    raw_path.to_string()
}
