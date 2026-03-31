use std::path::Path;
use tauri::{AppHandle, Manager};
use percent_encoding::percent_decode_str;

/// Resolves a potentially "stale" absolute path into a current, valid absolute path.
/// This is critical on iOS and Android where the application's sandbox path (UUID or user-id)
/// can change between app sessions or updates.
/// 
/// If the path contains "audio_archive", it will be re-anchored to the current AppData directory.
pub fn resolve_internal_path(app: &AppHandle, raw_path: &str) -> String {
    // 1. URL Decode first (handles Chinese filenames like %E7%BB%9D%E6%9C%9B)
    let decoded = percent_decode_str(raw_path).decode_utf8_lossy();
    // 2. Remove file:// prefix if present
    let mut path_str = decoded.trim_start_matches("file://").to_string();
    
    // [V53] Critical Fix for iOS: Normalize redundant 'Library/Library' segments
    #[cfg(target_os = "ios")]
    {
        if path_str.contains("Library/Library") {
            path_str = path_str.replace("Library/Library", "Library");
        }
    }
    
    // --- Robust iOS Root Anchoring ---
    // Paths on iOS look like: file:///.../Application/<UUID>/<RelativePath>
    // The <UUID> changes on updates/reinstalls. We seek the part after <UUID>.
    if let Some(app_pos) = path_str.find("/Application/") {
        let after_app = &path_str[app_pos + 13..]; // Skip "/Application/"
        if let Some(slash_pos) = after_app.find('/') {
            let relative_part = &after_app[slash_pos + 1..]; // e.g. "tmp/org.ting.app-Inbox/..."
            
            // Get current Application Root: parent of parent of Caches (Library/Caches)
            if let Ok(cache_dir) = app.path().app_cache_dir() {
                if let Some(app_root) = cache_dir.parent().and_then(|p: &Path| p.parent()) {
                    let mut final_path = app_root.to_path_buf();
                    let normalized_rel = relative_part.replace('\\', "/");
                    for component in normalized_rel.split('/') {
                        if !component.is_empty() {
                            final_path.push(component);
                        }
                    }
                    
                    let final_str = final_path.to_string_lossy().to_string();
                    
                    #[cfg(target_os = "ios")]
                    {
                        if final_str.contains("Library/Library") {
                            return final_str.replace("Library/Library", "Library");
                        }
                    }
                    return final_str;
                }
            }
        }
    }

    // --- Marker-based Fallback (for Android or non-standard iOS paths) ---
    let markers = ["audio_archive", "downloads", "tmp", "Documents", "Inbox"];
    for marker in markers {
        if let Some(pos) = path_str.find(marker) {
            let relative_part = &path_str[pos..]; 
            
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
                
                let res = final_path.to_string_lossy().to_string();
                #[cfg(target_os = "ios")]
                {
                    if res.contains("Library/Library") {
                        return res.replace("Library/Library", "Library");
                    }
                }
                return res;
            }
        }
    }
    
    let final_res = path_str.to_string();
    #[cfg(target_os = "ios")]
    {
        if final_res.contains("Library/Library") {
            return final_res.replace("Library/Library", "Library");
        }
    }
    final_res
}
