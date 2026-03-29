use tauri::AppHandle;
use tauri_plugin_shell::process::Command;
use tauri_plugin_shell::ShellExt;
use tauri::{Emitter, Manager};

/// Helper to get a command for a binary, prioritizing sidecars.
fn get_command(app: &AppHandle, binary: &str) -> Command {
    // Try sidecar first
    if let Ok(cmd) = app.shell().sidecar(binary) {
        return cmd;
    }
    // Fallback to system PATH
    app.shell().command(binary)
}

/// Checks if yt-dlp is available (sidecar or PATH).
#[tauri::command]
pub fn check_ytdlp(app: AppHandle) -> bool {
    app.shell().sidecar("yt-dlp").is_ok() || which::which("yt-dlp").is_ok()
}

/// Checks if ffmpeg is available (sidecar or PATH).
#[tauri::command]
pub fn check_ffmpeg(app: AppHandle) -> bool {
    app.shell().sidecar("ffmpeg").is_ok() || which::which("ffmpeg").is_ok()
}

/// Downloads audio from a URL using yt-dlp (sidecar or system), streaming progress.
#[tauri::command]
pub async fn download_url_audio(app: AppHandle, url: String) -> Result<String, String> {
    let cmd = get_command(&app, "yt-dlp");

    // Download destination
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用目录: {}", e))?;
    let downloads_dir = app_dir.join("downloads");
    std::fs::create_dir_all(&downloads_dir).map_err(|e| format!("无法创建下载目录: {}", e))?;

    // %(title)s.%(ext)s — yt-dlp will substitute these
    let output_template = downloads_dir
        .join("%(title)s.%(ext)s")
        .to_string_lossy()
        .to_string();

    let (mut rx, _child) = cmd
        .args([
            "--extract-audio",
            "--audio-format",
            "mp3",
            "--audio-quality",
            "0",
            "--no-playlist",
            "-o",
            &output_template,
            "--print",
            "after_move:filepath",
            &url,
        ])
        .spawn()
        .map_err(|e| format!("启动下载器失败: {}", e))?;

    let app_clone = app.clone();
    let mut final_path = String::new();

    while let Some(event) = rx.recv().await {
        match event {
            tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                let l = String::from_utf8_lossy(&line).trim().to_string();
                if !l.is_empty() {
                    final_path = l.clone();
                    let _ = app_clone.emit("ytdlp-output", format!("✅ 文件保存至: {}", final_path));
                }
            }
            tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                let l = String::from_utf8_lossy(&line).to_string();
                let _ = app_clone.emit("ytdlp-output", l);
            }
            tauri_plugin_shell::process::CommandEvent::Terminated(status) => {
                if status.code != Some(0) {
                    return Err(format!("下载失败，退出码: {:?}", status.code));
                }
            }
            _ => {}
        }
    }

    if final_path.is_empty() {
        return Err("下载完成但未获取到文件路径".to_string());
    }

    Ok(final_path)
}
