use crate::ai::model_manager::{ModelManager, DEFAULT_MODEL_NAME, HUGGINGFACE_URL};
use crate::ai::whisper_engine::WhisperEngine;
use crate::db::transcript_store::{TranscriptStore, WordTimestamp};
use crate::TranscriptionState;
use tauri::{command, AppHandle, Emitter, State};

#[command]
pub fn check_model_exists(model_manager: State<'_, ModelManager>) -> bool {
    model_manager.model_exists(DEFAULT_MODEL_NAME)
}

#[command]
pub async fn download_default_model(
    app: AppHandle,
    model_manager: State<'_, ModelManager>,
) -> Result<(), String> {
    model_manager
        .download_model(&app, DEFAULT_MODEL_NAME, HUGGINGFACE_URL)
        .await
}

#[command]
pub async fn transcribe_audio(
    app: AppHandle,
    path: String,
    model_manager: State<'_, ModelManager>,
    store: State<'_, TranscriptStore>,
    transcription_state: State<'_, TranscriptionState>,
    force_refresh: Option<bool>,
) -> Result<Vec<WordTimestamp>, String> {
    // Acquire the lock first. This ensures that if the user clicks out and back in,
    // the second request waits here until the first request finishes writing to DB.
    let _guard = transcription_state.lock.lock().await;

    // Resolve path for mobile stability
    let resolved_path = crate::utils::path_utils::resolve_internal_path(&app, &path);
    let audio_path = std::path::PathBuf::from(&resolved_path);
    
    // Stabilize cache key: use filename only if it's in our archive, as absolute paths break on mobile
    let file_hash = if path.contains("audio_archive") || path.contains("ting_rec_") {
        audio_path.file_name()
            .and_then(|n| n.to_str())
            .map(|s| s.to_string())
            .unwrap_or(path.clone())
    } else {
        path.clone()
    };

    // Use model file size as cache key version: cache only invalidates when the model
    // binary actually changes (e.g. user downloads a different model), NOT on every
    // App update where the hardcoded "_v8" suffix used to be bumped manually.
    let model_path_for_key = model_manager.get_model_path(DEFAULT_MODEL_NAME);
    let model_size = std::fs::metadata(&model_path_for_key)
        .map(|m| m.len())
        .unwrap_or(0);
    let cache_key = format!("{}_sz{}", DEFAULT_MODEL_NAME, model_size);
    let model_used = DEFAULT_MODEL_NAME;

    // 1. Check Store (if not forcing)
    if force_refresh.unwrap_or(false) == false {
        if let Ok(Some(transcript)) = store.get_transcript(&file_hash, &cache_key) {
            if !transcript.words.is_empty() {
                return Ok(transcript.words);
            }
        }
    }

    // 2. Transcribe Using Whisper
    let model_path = model_manager.get_model_path(model_used);
    if !model_path.exists() {
        return Err(
            "Model not initialized or not downloaded. Please download the model first.".into(),
        );
    }

    // Run CPU heavy inference in spawn_blocking pattern
    let words = tokio::task::spawn_blocking(move || {
        let engine = WhisperEngine::new(&model_path)?;

        let app_handle = app.clone();
        let progress_cb = move |progress: i32| {
            let _ = app_handle.emit("transcribe-progress", progress);
        };

        engine.transcribe(&audio_path, Some(progress_cb))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    // 3. Save to Store
    let _ = store.save_transcript(&file_hash, &cache_key, &words);

    Ok(words)
}
