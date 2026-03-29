use crate::db::study_store::StudyStore;
use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Manager;
use tauri::State;

#[tauri::command]
pub async fn clear_temp_cache(app: AppHandle) -> Result<(), String> {
    // Determine typical cache locations
    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;

    // Also clear the `temp` directory within app local data, if we stored things there
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let temp_dir = data_dir.join("temp");

    let count1 = clear_directory(&cache_dir);
    let count2 = clear_directory(&temp_dir);

    // Also clear any dangling .WAV files we generated for Sherpa in the root data dir
    let mut wav_count = 0;
    if let Ok(entries) = fs::read_dir(&data_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("wav") {
                let _ = fs::remove_file(path);
                wav_count += 1;
            }
        }
    }

    println!(
        "Cache cleared: {} items from cache, {} from temp, {} dangling wavs",
        count1, count2, wav_count
    );
    Ok(())
}

fn clear_directory(dir: &Path) -> usize {
    let mut deleted_count = 0;
    if dir.exists() {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if fs::remove_file(&path).is_ok() {
                        deleted_count += 1;
                    }
                } else if path.is_dir() {
                    if fs::remove_dir_all(&path).is_ok() {
                        deleted_count += 1;
                    }
                }
            }
        }
    }
    deleted_count
}

#[tauri::command]
pub async fn export_user_data(
    app: AppHandle,
    _store: State<'_, StudyStore>,
) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = data_dir.join("db").join("study.db");
    let downloads_dir = app
        .path()
        .download_dir()
        .unwrap_or_else(|_| PathBuf::from("."));

    let timestamp = Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let export_filename = format!("Ting_Data_Backup_{}.sqlite", timestamp);
    let export_path = downloads_dir.join(export_filename);

    fs::copy(db_path, &export_path).map_err(|e| format!("Failed to export database: {}", e))?;
    println!("Exported database to {:?}", export_path);

    Ok(export_path.to_string_lossy().to_string())
}
