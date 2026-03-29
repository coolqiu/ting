use futures_util::StreamExt;
use reqwest::Client;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use tokio::fs::File;
use tokio::io::AsyncWriteExt;

pub const DEFAULT_MODEL_NAME: &str = "ggml-base.bin";
pub const HUGGINGFACE_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";

pub const WAV2VEC2_MODEL_NAME: &str = "wav2vec2-lv-60-espeak.onnx";
pub const WAV2VEC2_URL: &str = "https://hf-mirror.com/onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX/resolve/main/onnx/model_quantized.onnx";
// This is an espeak-based phoneme model, quantized (~318MB).

#[derive(Clone, serde::Serialize)]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: u64,
}

pub struct ModelManager {
    models_dir: PathBuf,
}

impl ModelManager {
    pub fn new(app: &AppHandle) -> Self {
        let app_dir = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."));
        let models_dir = app_dir.join("models");

        // Ensure directory exists synchronously during setup
        let _ = std::fs::create_dir_all(&models_dir);

        Self { models_dir }
    }

    pub fn get_model_path(&self, model_name: &str) -> PathBuf {
        self.models_dir.join(model_name)
    }

    pub fn model_exists(&self, model_name: &str) -> bool {
        self.get_model_path(model_name).exists()
    }

    pub async fn download_model(
        &self,
        app: &AppHandle,
        model_name: &str,
        url: &str,
    ) -> Result<(), String> {
        let model_path = self.get_model_path(model_name);
        if model_path.exists() {
            return Ok(());
        }

        let client = Client::builder()
            .user_agent("Ting/0.1.0")
            .build()
            .map_err(|e| e.to_string())?;
        let res = client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        if !res.status().is_success() {
            return Err(format!("Download failed with status: {}", res.status()));
        }

        let total_size = res.content_length().unwrap_or(0);
        let mut downloaded: u64 = 0;

        let mut file = File::create(&model_path)
            .await
            .map_err(|e| format!("Failed to create file: {}", e))?;
        let mut stream = res.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| e.to_string())?;
            file.write_all(&chunk).await.map_err(|e| e.to_string())?;

            downloaded += chunk.len() as u64;

            // Emit progress event to frontend
            let _ = app.emit(
                "model-download-progress",
                DownloadProgress {
                    downloaded,
                    total: total_size,
                },
            );
        }

        Ok(())
    }
}
