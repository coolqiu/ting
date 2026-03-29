use crate::db::user_store::UserInfo;
use std::sync::Mutex;

/// In-memory session state. Cleared on app restart (stateless between launches).
pub struct UserSession {
    pub current_user: Mutex<Option<UserInfo>>,
}

impl UserSession {
    pub fn new() -> Self {
        Self {
            current_user: Mutex::new(None),
        }
    }

    pub fn current_user_id(&self) -> Option<i64> {
        self.current_user.lock().unwrap().as_ref().map(|u| u.id)
    }
}
