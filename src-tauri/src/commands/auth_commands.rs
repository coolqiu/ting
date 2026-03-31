use crate::db::user_store::{UserInfo, UserStore};
use crate::session::UserSession;
use tauri::State;

#[tauri::command]
pub fn register_user(
    username: String,
    password: String,
    user_store: State<'_, UserStore>,
    session: State<'_, UserSession>,
) -> Result<UserInfo, String> {
    let id = user_store.register(&username, &password)?;
    let info = UserInfo {
        id,
        username: username.trim().to_string(),
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        avatar: None,
    };
    *session.current_user.lock().unwrap() = Some(info.clone());
    Ok(info)
}

#[tauri::command]
pub fn login_user(
    username: String,
    password: String,
    user_store: State<'_, UserStore>,
    session: State<'_, UserSession>,
) -> Result<UserInfo, String> {
    let info = user_store.login(&username, &password)?;
    *session.current_user.lock().unwrap() = Some(info.clone());
    Ok(info)
}

#[tauri::command]
pub fn logout_user(session: State<'_, UserSession>) -> Result<(), String> {
    *session.current_user.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub fn get_current_user(session: State<'_, UserSession>) -> Option<UserInfo> {
    session.current_user.lock().unwrap().clone()
}

#[tauri::command]
pub fn update_username(
    new_username: String,
    user_store: State<'_, UserStore>,
    session: State<'_, UserSession>,
) -> Result<UserInfo, String> {
    let mut current_user = session.current_user.lock().unwrap();
    if let Some(user) = current_user.as_mut() {
        user_store.update_username(user.id, &new_username)?;
        user.username = new_username.trim().to_string();
        Ok(user.clone())
    } else {
        Err("未登录".to_string())
    }
}

#[tauri::command]
pub fn update_avatar(
    new_avatar: Option<String>,
    user_store: State<'_, UserStore>,
    session: State<'_, UserSession>,
) -> Result<UserInfo, String> {
    let mut current_user = session.current_user.lock().unwrap();
    if let Some(user) = current_user.as_mut() {
        // 1. Physical Cleanup of OLD avatar
        if let Some(old_avatar) = &user.avatar {
            // Only delete if it's an internal managed file
            if old_avatar.contains("avatars") || old_avatar.contains("audio_archive") {
                let path = std::path::Path::new(old_avatar);
                if path.exists() {
                    let _ = std::fs::remove_file(path); // Silently try to delete
                }
            }
        }

        // 2. Update DB
        user_store.update_avatar(user.id, new_avatar.as_deref())?;
        
        // 3. Update Session
        user.avatar = new_avatar;
        Ok(user.clone())
    } else {
        Err("未登录".to_string())
    }
}

#[tauri::command]
pub fn list_users(user_store: State<'_, UserStore>) -> Result<Vec<UserInfo>, String> {
    user_store.list_users().map_err(|e| e.to_string())
}
