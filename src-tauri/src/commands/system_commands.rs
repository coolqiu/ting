#[allow(unused_imports)]
use std::process::Command;
use tauri::{command, AppHandle, Manager};

#[command]
pub fn open_app_data_dir(app: AppHandle) -> Result<String, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用目录: {}", e))?;

    // Ensure the directory exists
    if !app_dir.exists() {
        std::fs::create_dir_all(&app_dir).map_err(|e| format!("无法创建应用目录: {}", e))?;
    }

    let path_str = app_dir.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&app_dir)
            .spawn()
            .map_err(|e| format!("打开目录失败: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&app_dir)
            .spawn()
            .map_err(|e| format!("打开目录失败: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&app_dir)
            .spawn()
            .map_err(|e| format!("打开目录失败: {}", e))?;
    }

    // Android/iOS: Just return the path, we can't easily open a file explorer intent without third-party plugins
    Ok(path_str)
}
