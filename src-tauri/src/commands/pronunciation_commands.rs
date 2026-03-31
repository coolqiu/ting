use crate::ai::model_manager::{ModelManager, WAV2VEC2_MODEL_NAME, WAV2VEC2_URL};
use crate::ai::pronunciation_evaluator::{AssessmentResult, PronunciationEvaluator};
use crate::db::study_store::{PronunciationLog, StudyStore};
use crate::session::UserSession;
use std::sync::Mutex;
use tauri::{command, AppHandle, Manager, State};

pub struct EvaluatorState(pub Mutex<PronunciationEvaluator>);

#[command]
pub async fn assess_pronunciation(
    app: AppHandle,
    evaluator: State<'_, EvaluatorState>,
    model_manager: State<'_, ModelManager>,
    audio_path: String,
    reference_text: String,
) -> Result<AssessmentResult, String> {
    let mut evaluator = evaluator.0.lock().unwrap();

    // Ensure model is loaded
    if !model_manager.model_exists(WAV2VEC2_MODEL_NAME) {
        return Err("Model not found. Please download it first.".to_string());
    }

    let model_path = model_manager.get_model_path(WAV2VEC2_MODEL_NAME);
    evaluator.load_model(model_path)?;

    let resolved_path = crate::utils::path_utils::resolve_internal_path(&app, &audio_path);

    evaluator.assess(&resolved_path, &reference_text)
}

#[command]
pub async fn download_pronunciation_model(
    app: AppHandle,
    model_manager: State<'_, ModelManager>,
) -> Result<(), String> {
    model_manager
        .download_model(&app, WAV2VEC2_MODEL_NAME, WAV2VEC2_URL)
        .await
}

#[command]
pub async fn check_pronunciation_model_exists(
    model_manager: State<'_, ModelManager>,
) -> Result<bool, String> {
    Ok(model_manager.model_exists(WAV2VEC2_MODEL_NAME))
}
#[command]
pub async fn open_model_folder(app: AppHandle) -> Result<(), String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?;
    let models_dir = app_dir.join("models");
    let _ = std::fs::create_dir_all(&models_dir);

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(models_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[command]
pub async fn save_pronunciation_score(
    session: State<'_, UserSession>,
    store: State<'_, StudyStore>,
    material_id: i64,
    reference_text: String,
    duration_ms: i64,
    score: f64,
) -> Result<(), String> {
    let user_id = session.current_user_id().unwrap_or(0);
    store
        .save_pronunciation_score(user_id, material_id, &reference_text, duration_ms, score)
        .map_err(|e| format!("Database error: {}", e))
}

#[command]
pub async fn get_pronunciation_history(
    session: State<'_, UserSession>,
    store: State<'_, StudyStore>,
    limit: i64,
) -> Result<Vec<PronunciationLog>, String> {
    let user_id = session.current_user_id().unwrap_or(0);
    store
        .get_pronunciation_history(user_id, limit)
        .map_err(|e| format!("Database error: {}", e))
}
