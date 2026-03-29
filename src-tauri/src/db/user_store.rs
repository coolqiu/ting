use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand::rngs::OsRng;
use rusqlite::{params, Connection, OptionalExtension, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub id: i64,
    pub username: String,
    pub created_at: String,
    pub avatar: Option<String>,
}

pub struct UserStore {
    conn: Mutex<Connection>,
}

impl UserStore {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        conn.execute(
            "CREATE TABLE IF NOT EXISTS users (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                username   TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                avatar     TEXT
            )",
            [],
        )?;

        // Gracefully handle migration for existing users
        let _ = conn.execute("ALTER TABLE users ADD COLUMN avatar TEXT", []);
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn register(&self, username: &str, password: &str) -> Result<i64, String> {
        let username = username.trim();
        if username.is_empty() {
            return Err("用户名不能为空".into());
        }
        if password.len() < 4 {
            return Err("密码至少需要 4 位".into());
        }

        let salt = SaltString::generate(&mut OsRng);
        let hash = Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| format!("密码加密失败: {}", e))?
            .to_string();

        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?1, ?2)",
            params![username, hash],
        )
        .map_err(|e| {
            if e.to_string().contains("UNIQUE") {
                "该用户名已被注册".to_string()
            } else {
                format!("注册失败: {}", e)
            }
        })?;

        Ok(conn.last_insert_rowid())
    }

    pub fn login(&self, username: &str, password: &str) -> Result<UserInfo, String> {
        let conn = self.conn.lock().unwrap();

        let row: Option<(i64, String, String, Option<String>)> = conn
            .query_row(
                "SELECT id, password_hash, created_at, avatar FROM users WHERE username = ?1 COLLATE NOCASE",
                params![username.trim()],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()
            .map_err(|e| format!("查询失败: {}", e))?;

        let (id, hash, created_at, avatar) = row.ok_or_else(|| "用户名或密码不正确".to_string())?;

        let parsed = PasswordHash::new(&hash).map_err(|_| "内部错误：哈希解析失败".to_string())?;
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .map_err(|_| "用户名或密码不正确".to_string())?;

        Ok(UserInfo {
            id,
            username: username.to_string(),
            created_at,
            avatar,
        })
    }

    pub fn update_username(&self, id: i64, new_username: &str) -> Result<(), String> {
        let username = new_username.trim();
        if username.is_empty() {
            return Err("用户名不能为空".into());
        }

        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE users SET username = ?1 WHERE id = ?2",
            params![username, id],
        )
        .map_err(|e| {
            if e.to_string().contains("UNIQUE") {
                "该用户名已被注册".to_string()
            } else {
                format!("更新失败: {}", e)
            }
        })?;

        Ok(())
    }

    pub fn update_avatar(&self, id: i64, new_avatar: Option<&str>) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE users SET avatar = ?1 WHERE id = ?2",
            params![new_avatar, id],
        )
        .map_err(|e| format!("更新头像失败: {}", e))?;
        Ok(())
    }

    pub fn list_users(&self) -> Result<Vec<UserInfo>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, username, created_at, avatar FROM users ORDER BY created_at ASC",
        )?;
        let users = stmt
            .query_map([], |r| {
                Ok(UserInfo {
                    id: r.get(0)?,
                    username: r.get(1)?,
                    created_at: r.get(2)?,
                    avatar: r.get(3)?,
                })
            })?
            .filter_map(Result::ok)
            .collect();
        Ok(users)
    }

    pub fn user_count(&self) -> i64 {
        let conn = self.conn.lock().unwrap();
        conn.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))
            .unwrap_or(0)
    }
}
