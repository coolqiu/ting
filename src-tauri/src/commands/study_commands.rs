use crate::db::study_store::{DailyStat, LearningMaterial, MaterialDistribution, StudyStore};
use crate::session::UserSession;
use tauri::{command, State};

// ... existing commands (no changes to them)

#[command]
pub fn get_daily_study_stats(
    days: i64,
    session: State<'_, UserSession>,
    store: State<'_, StudyStore>,
) -> Result<Vec<DailyStat>, String> {
    let user_id = session.current_user_id().unwrap_or(0);
    store
        .get_daily_study_stats(user_id, days)
        .map_err(|e| format!("Database error: {}", e))
}

#[command]
pub fn get_material_distribution(
    session: State<'_, UserSession>,
    store: State<'_, StudyStore>,
) -> Result<MaterialDistribution, String> {
    let user_id = session.current_user_id().unwrap_or(0);
    store
        .get_material_distribution(user_id)
        .map_err(|e| format!("Database error: {}", e))
}

#[command]
pub fn add_or_update_material(
    title: String,
    source_url: String,
    duration_ms: i64,
    session: State<'_, UserSession>,
    store: State<'_, StudyStore>,
) -> Result<i64, String> {
    let user_id = session.current_user_id().unwrap_or(0);
    store
        .add_or_update_material(user_id, &title, &source_url, duration_ms)
        .map_err(|e| format!("Database error: {}", e))
}

#[command]
pub fn get_recent_materials(
    session: State<'_, UserSession>,
    store: State<'_, StudyStore>,
) -> Result<Vec<LearningMaterial>, String> {
    let user_id = session.current_user_id().unwrap_or(0);
    store
        .get_recent_materials(user_id)
        .map_err(|e| format!("Database error: {}", e))
}

#[command]
pub fn submit_dictation_score(
    session: State<'_, UserSession>,
    material_id: i64,
    start_ms: i64,
    end_ms: i64,
    original_text: String,
    user_input: String,
    score: i64,
    time_spent_ms: i64,
    store: State<'_, StudyStore>,
) -> Result<(), String> {
    let user_id = session.current_user_id().unwrap_or(0);
    store
        .submit_dictation_score(
            user_id,
            material_id,
            start_ms,
            end_ms,
            &original_text,
            &user_input,
            score,
            time_spent_ms,
        )
        .map_err(|e| format!("Database error: {}", e))
}

#[command]
pub fn get_due_reviews_count(
    session: State<'_, UserSession>,
    store: State<'_, StudyStore>,
) -> Result<i64, String> {
    let user_id = session.current_user_id().unwrap_or(0);
    store
        .get_due_reviews_count(user_id)
        .map_err(|e| format!("Database error: {}", e))
}

#[command]
pub fn get_recent_accuracy(
    session: State<'_, UserSession>,
    limit: i64,
    store: State<'_, StudyStore>,
) -> Result<f64, String> {
    let user_id = session.current_user_id().unwrap_or(0);
    store
        .get_recent_accuracy(user_id, limit)
        .map_err(|e| format!("Database error: {}", e))
}

#[command]
pub fn get_due_exercises(
    session: State<'_, UserSession>,
    store: State<'_, StudyStore>,
) -> Result<Vec<crate::db::study_store::DueExercise>, String> {
    let user_id = session.current_user_id().unwrap_or(0);
    store
        .get_due_exercises(user_id)
        .map_err(|e| format!("Database error: {}", e))
}

#[command]
pub fn get_all_exercises(
    session: State<'_, UserSession>,
    store: State<'_, StudyStore>,
) -> Result<Vec<crate::db::study_store::DueExercise>, String> {
    let user_id = session.current_user_id().unwrap_or(0);
    store
        .get_all_exercises(user_id)
        .map_err(|e| format!("Database error: {}", e))
}

#[tauri::command]
pub fn delete_material(
    material_id: i64,
    session: State<'_, UserSession>,
    store: State<'_, StudyStore>,
) -> Result<(), String> {
    let user_id = session.current_user_id().unwrap_or(0);

    // 1. Fetch material details to get path
    let material = store
        .get_material(material_id, user_id)
        .map_err(|e| format!("Database error fetching material: {}", e))?;

    let file_path = material.source_url;

    // 2. Perform physical deletion ONLY IF it's in our archive
    // On mobile, all imported files are moved here. On Windows, they are not.
    if file_path.contains("audio_archive") {
        let path = std::path::Path::new(&file_path);
        if path.exists() {
            if let Err(e) = std::fs::remove_file(path) {
                eprintln!("[Storage] Failed to delete archived file {}: {}", file_path, e);
                // We continue with DB deletion even if FS deletion fails 
                // to avoid unreferenced entries in UI.
            } else {
                println!("[Storage] Physically deleted archived file: {}", file_path);
            }
        }
    }

    // 3. Delete from DB
    store
        .delete_material(material_id)
        .map_err(|e| format!("Database error: {}", e))
}

#[tauri::command]
pub fn rename_material(
    material_id: i64,
    new_title: String,
    store: State<'_, StudyStore>,
) -> Result<(), String> {
    store
        .rename_material(material_id, &new_title)
        .map_err(|e| format!("Database error: {}", e))
}

#[tauri::command]
pub fn search_materials(
    session: State<'_, UserSession>,
    query: String,
    sort_by: String,
    store: State<'_, StudyStore>,
) -> Result<Vec<LearningMaterial>, String> {
    let user_id = session.current_user_id().unwrap_or(0);
    store
        .search_materials(user_id, &query, &sort_by)
        .map_err(|e| format!("Database error: {}", e))
}

#[tauri::command]
pub fn get_material(
    session: State<'_, UserSession>,
    id: i64,
    store: State<'_, StudyStore>,
) -> Result<LearningMaterial, String> {
    let user_id = session.current_user_id().unwrap_or(0);
    store
        .get_material(id, user_id)
        .map_err(|e| format!("Database error: {}", e))
}
