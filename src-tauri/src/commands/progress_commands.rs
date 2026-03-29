// Feature B: Learning progress persistence
// Saves/restores per-user, per-material playback state

use crate::db::study_store::{ProgressSnapshot, StudyStore};
use crate::session::UserSession;
use tauri::State;

#[tauri::command]
pub fn save_material_progress(
    progress: ProgressSnapshot,
    session: State<'_, UserSession>,
    study_store: State<'_, StudyStore>,
) -> Result<(), String> {
    let user_id = session.current_user_id().unwrap_or(0); // 0 = guest
    let segments_json =
        serde_json::to_string(&progress.segments).map_err(|e| format!("序列化失败: {}", e))?;
    study_store
        .save_progress(
            user_id,
            progress.material_id,
            progress.position_secs,
            progress.volume,
            progress.speed,
            &progress.mode,
            &segments_json,
            progress.active_segment_id.as_deref(),
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_material_progress(
    material_id: i64,
    session: State<'_, UserSession>,
    study_store: State<'_, StudyStore>,
) -> Result<Option<ProgressSnapshot>, String> {
    let user_id = session.current_user_id().unwrap_or(0);
    study_store
        .get_progress(user_id, material_id)
        .map_err(|e| e.to_string())
}
