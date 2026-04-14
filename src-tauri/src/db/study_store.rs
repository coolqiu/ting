use rusqlite::{params, Connection, OptionalExtension, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LearningMaterial {
    pub id: i64,
    pub title: String,
    pub source_url: String, // Path or Hash
    pub duration_ms: i64,
    pub last_opened_at: String, // ISO8601 or DB-specific
    pub progress_secs: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Exercise {
    pub id: i64,
    pub material_id: i64,
    pub start_ms: i64,
    pub end_ms: i64,
    pub original_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudyLog {
    pub id: i64,
    pub user_id: i64,
    pub exercise_id: i64,
    pub score: i64,
    pub user_input: String,
    pub time_spent_ms: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewSchedule {
    pub id: i64,
    pub user_id: i64,
    pub exercise_id: i64,
    pub next_review_date: String,
    pub interval_days: i64,
    pub ease_factor: f64,
    pub repetitions: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DueExercise {
    pub id: i64,
    pub material_id: i64,
    pub start_ms: i64,
    pub end_ms: i64,
    pub original_text: String,
    pub source_url: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PronunciationLog {
    pub id: i64,
    pub user_id: i64,
    pub material_id: i64,
    pub reference_text: String,
    pub duration_ms: i64,
    pub score: f64,
    pub audio_path: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct DailyStat {
    pub date: String,
    pub minutes: f64,
    pub avg_score: f64,
}

#[derive(Debug, Serialize)]
pub struct MaterialDistribution {
    pub mastered: i64,
    pub learning: i64,
    pub new: i64,
}

// ── Progress types (shared with progress_commands) ──────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SegmentSnapshot {
    pub id: String,
    pub start_secs: f64,
    pub end_secs: f64,
    pub loop_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressSnapshot {
    pub material_id: i64,
    pub position_secs: f64,
    pub volume: f32,
    pub speed: f32,
    pub mode: String, // "Global" | "SingleLoop" | "ListLoop"
    pub segments: Vec<SegmentSnapshot>,
    pub active_segment_id: Option<String>,
    pub updated_at: Option<String>,
}

pub struct StudyStore {
    conn: Mutex<Connection>,
}

impl StudyStore {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let conn = Connection::open(db_path)?;

        // Initialize tables for Phase 4 (Dictation and Ebbinghaus)

        // 1. Learning Material table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS learning_material (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 0,
                title TEXT NOT NULL,
                source_url TEXT NOT NULL,
                duration_ms INTEGER NOT NULL,
                last_opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, source_url)
            )",
            [],
        )?;

        // Migration: Add user_id to learning_material
        let has_user_id_mat: bool = conn
            .query_row(
                "SELECT count(*) FROM pragma_table_info('learning_material') WHERE name='user_id'",
                [],
                |row| Ok(row.get::<_, i64>(0)? > 0),
            )
            .unwrap_or(false);

        if !has_user_id_mat {
            let _ = conn.execute(
                "ALTER TABLE learning_material RENAME TO old_learning_material",
                [],
            );
            let _ = conn.execute(
                "CREATE TABLE learning_material (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL DEFAULT 0,
                    title TEXT NOT NULL,
                    source_url TEXT NOT NULL,
                    duration_ms INTEGER NOT NULL,
                    last_opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, source_url)
                )",
                [],
            );
            // Default migrating old materials to user 1
            let _ = conn.execute(
                "INSERT INTO learning_material (id, user_id, title, source_url, duration_ms, last_opened_at)
                 SELECT id, 1, title, source_url, duration_ms, last_opened_at FROM old_learning_material",
                [],
            );
            let _ = conn.execute("DROP TABLE old_learning_material", []);
        }

        // 2. Exercise table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS exercise (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                material_id INTEGER NOT NULL,
                start_ms INTEGER NOT NULL,
                end_ms INTEGER NOT NULL,
                original_text TEXT NOT NULL,
                FOREIGN KEY(material_id) REFERENCES learning_material(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // 3. Study Log table - Added user_id
        conn.execute(
            "CREATE TABLE IF NOT EXISTS study_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 0,
                exercise_id INTEGER NOT NULL,
                score INTEGER NOT NULL,
                user_input TEXT NOT NULL,
                time_spent_ms INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(exercise_id) REFERENCES exercise(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Migration: Add user_id to study_log if not exists
        let has_user_id: bool = conn
            .query_row(
                "SELECT count(*) FROM pragma_table_info('study_log') WHERE name='user_id'",
                [],
                |row| Ok(row.get::<_, i64>(0)? > 0),
            )
            .unwrap_or(false);
        if !has_user_id {
            let _ = conn.execute(
                "ALTER TABLE study_log ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0",
                [],
            );
        }

        // 4. Review Schedule table (Ebbinghaus SM-2) - Added user_id and composite UNIQUE
        // Note: We use a separate create or migration because the UNIQUE constraint changed
        conn.execute(
            "CREATE TABLE IF NOT EXISTS review_schedule (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 0,
                exercise_id INTEGER NOT NULL,
                next_review_date DATETIME NOT NULL,
                interval_days INTEGER NOT NULL,
                ease_factor REAL NOT NULL,
                repetitions INTEGER NOT NULL,
                FOREIGN KEY(exercise_id) REFERENCES exercise(id) ON DELETE CASCADE,
                UNIQUE(user_id, exercise_id)
            )",
            [],
        )?;

        // 5. Pronunciation Log table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS pronunciation_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                material_id INTEGER NOT NULL,
                reference_text TEXT NOT NULL,
                duration_ms INTEGER NOT NULL,
                score REAL NOT NULL,
                audio_path TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        // Migration: Add audio_path to pronunciation_log if not exists
        let has_audio_path: bool = conn
            .query_row(
                "SELECT count(*) FROM pragma_table_info('pronunciation_log') WHERE name='audio_path'",
                [],
                |row| Ok(row.get::<_, i64>(0)? > 0),
            )
            .unwrap_or(false);
        if !has_audio_path {
            let _ = conn.execute(
                "ALTER TABLE pronunciation_log ADD COLUMN audio_path TEXT",
                [],
            );
        }

        // Migration: Add user_id to review_schedule and update UNIQUE constraint
        let has_user_id_rs: bool = conn
            .query_row(
                "SELECT count(*) FROM pragma_table_info('review_schedule') WHERE name='user_id'",
                [],
                |row| Ok(row.get::<_, i64>(0)? > 0),
            )
            .unwrap_or(false);

        if !has_user_id_rs {
            // SQLite doesn't support ALTER TABLE DROP CONSTRAINT or changing UNIQUE.
            // We must do the rename-create-copy dance.
            let _ = conn.execute(
                "ALTER TABLE review_schedule RENAME TO old_review_schedule",
                [],
            );
            conn.execute(
                "CREATE TABLE review_schedule (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL DEFAULT 0,
                    exercise_id INTEGER NOT NULL,
                    next_review_date DATETIME NOT NULL,
                    interval_days INTEGER NOT NULL,
                    ease_factor REAL NOT NULL,
                    repetitions INTEGER NOT NULL,
                    FOREIGN KEY(exercise_id) REFERENCES exercise(id) ON DELETE CASCADE,
                    UNIQUE(user_id, exercise_id)
                )",
                [],
            )?;
            let _ = conn.execute(
                "INSERT INTO review_schedule (id, user_id, exercise_id, next_review_date, interval_days, ease_factor, repetitions)
                 SELECT id, 0, exercise_id, next_review_date, interval_days, ease_factor, repetitions FROM old_review_schedule",
                [],
            );
            let _ = conn.execute("DROP TABLE old_review_schedule", []);
        }

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    // --- Learning Material ---

    pub fn add_or_update_material(
        &self,
        user_id: i64,
        title: &str,
        source_url: &str,
        duration_ms: i64,
    ) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        // Insert or update last_opened_at
        conn.execute(
            "INSERT INTO learning_material (user_id, title, source_url, duration_ms) 
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(user_id, source_url) DO UPDATE SET 
             last_opened_at=CURRENT_TIMESTAMP, title=excluded.title",
            params![user_id, title, source_url, duration_ms],
        )?;

        let mut stmt = conn
            .prepare("SELECT id FROM learning_material WHERE user_id = ?1 AND source_url = ?2")?;
        let id = stmt.query_row(params![user_id, source_url], |row| row.get(0))?;
        Ok(id)
    }

    pub fn get_recent_materials(&self, user_id: i64) -> Result<Vec<LearningMaterial>> {
        let conn = self.conn.lock().unwrap();
        // Join with material_progress to get current user's progress
        let query = "
            SELECT m.id, m.title, m.source_url, m.duration_ms, m.last_opened_at, p.position_secs
            FROM learning_material m
            LEFT JOIN material_progress p ON m.id = p.material_id AND p.user_id = ?1
            WHERE m.user_id = ?1
            ORDER BY m.last_opened_at DESC LIMIT 50
        ";
        let mut stmt = conn.prepare(query)?;

        let materials = stmt
            .query_map([user_id], |row| {
                Ok(LearningMaterial {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    source_url: row.get(2)?,
                    duration_ms: row.get(3)?,
                    last_opened_at: row.get(4)?,
                    progress_secs: row.get(5)?,
                })
            })?
            .filter_map(Result::ok)
            .collect();

        Ok(materials)
    }

    pub fn get_material(&self, id: i64, user_id: i64) -> Result<LearningMaterial> {
        let conn = self.conn.lock().unwrap();
        let query = "
            SELECT m.id, m.title, m.source_url, m.duration_ms, m.last_opened_at, p.position_secs
            FROM learning_material m
            LEFT JOIN material_progress p ON m.id = p.material_id AND p.user_id = ?2
            WHERE m.id = ?1 AND m.user_id = ?2
        ";
        let mut stmt = conn.prepare(query)?;

        let mat = stmt.query_row(params![id, user_id], |row| {
            Ok(LearningMaterial {
                id: row.get(0)?,
                title: row.get(1)?,
                source_url: row.get(2)?,
                duration_ms: row.get(3)?,
                last_opened_at: row.get(4)?,
                progress_secs: row.get(5).unwrap_or(None),
            })
        })?;

        Ok(mat)
    }

    // --- Exercise / SM-2 SuperMemo Algorithm ---

    /// Submits a dictation score and updates the Ebbinghaus interval
    pub fn submit_dictation_score(
        &self,
        user_id: i64,
        material_id: i64,
        start_ms: i64,
        end_ms: i64,
        original_text: &str,
        user_input: &str,
        score: i64,
        time_spent_ms: i64,
    ) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        // 1. Find or create Exercise (Exercise is shared content, results are per-user)
        tx.execute(
            "INSERT INTO exercise (material_id, start_ms, end_ms, original_text)
             SELECT ?1, ?2, ?3, ?4
             WHERE NOT EXISTS (
                SELECT 1 FROM exercise WHERE material_id = ?1 AND start_ms = ?2 AND end_ms = ?3
             )",
            params![material_id, start_ms, end_ms, original_text],
        )?;

        let exercise_id: i64 = tx.query_row(
            "SELECT id FROM exercise WHERE material_id = ?1 AND start_ms = ?2 AND end_ms = ?3",
            params![material_id, start_ms, end_ms],
            |row| row.get(0),
        )?;

        // 2. Insert Study Log - Linked to user_id
        tx.execute(
            "INSERT INTO study_log (user_id, exercise_id, score, user_input, time_spent_ms) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![user_id, exercise_id, score, user_input, time_spent_ms]
        )?;

        // 3. SM-2 Algorithm Calculation
        let quality = match score {
            100 => 5,     // Perfect
            90..=99 => 4, // Good, single typo
            75..=89 => 3, // Passed, some errors
            50..=74 => 2, // Hard, failed
            20..=49 => 1, // Wrong
            _ => 0,       // Complete blackout
        };

        // Fetch previous schedule if it exists for THIS user
        let prev_schedule = tx.query_row(
            "SELECT interval_days, ease_factor, repetitions FROM review_schedule WHERE exercise_id = ?1 AND user_id = ?2",
            params![exercise_id, user_id],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, f64>(1)?, row.get::<_, i64>(2)?))
        ).unwrap_or((0, 2.5, 0));

        let (mut prev_interval, mut ease_factor, mut repetitions) = prev_schedule;

        if quality >= 3 {
            if repetitions == 0 {
                prev_interval = 1;
            } else if repetitions == 1 {
                prev_interval = 6;
            } else {
                prev_interval = (prev_interval as f64 * ease_factor).round() as i64;
            }
            repetitions += 1;
        } else {
            repetitions = 0;
            prev_interval = 0; // Due immediately
        }

        ease_factor =
            ease_factor + (0.1 - (5.0 - quality as f64) * (0.08 + (5.0 - quality as f64) * 0.02));
        if ease_factor < 1.3 {
            ease_factor = 1.3;
        }

        tx.execute(
            "INSERT OR REPLACE INTO review_schedule (user_id, exercise_id, next_review_date, interval_days, ease_factor, repetitions) 
             VALUES (?1, ?2, date('now', '+' || ?3 || ' days'), ?3, ?4, ?5)",
            params![user_id, exercise_id, prev_interval, ease_factor, repetitions]
        )?;

        tx.commit()?;
        Ok(())
    }

    // --- Review Dashboard ---

    pub fn get_due_reviews_count(&self, user_id: i64) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM review_schedule WHERE user_id = ?1 AND next_review_date <= date('now')",
            params![user_id],
            |row| row.get(0)
        )?;
        Ok(count)
    }

    pub fn get_due_exercises(&self, user_id: i64) -> Result<Vec<DueExercise>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT e.id, e.material_id, e.start_ms, e.end_ms, e.original_text, m.source_url, m.title
             FROM review_schedule s
             JOIN exercise e ON s.exercise_id = e.id
             JOIN learning_material m ON e.material_id = m.id
             WHERE s.user_id = ?1 AND s.next_review_date <= date('now')
             ORDER BY s.next_review_date ASC"
        )?;

        let rows = stmt.query_map([user_id], |row| {
            Ok(DueExercise {
                id: row.get(0)?,
                material_id: row.get(1)?,
                start_ms: row.get(2)?,
                end_ms: row.get(3)?,
                original_text: row.get(4)?,
                source_url: row.get(5)?,
                title: row.get(6)?,
            })
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    pub fn get_all_exercises(&self, user_id: i64) -> Result<Vec<DueExercise>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT e.id, e.material_id, e.start_ms, e.end_ms, e.original_text, m.source_url, m.title
             FROM review_schedule s
             JOIN exercise e ON s.exercise_id = e.id
             JOIN learning_material m ON e.material_id = m.id
             WHERE s.user_id = ?1
             ORDER BY s.next_review_date ASC"
        )?;

        let rows = stmt.query_map([user_id], |row| {
            Ok(DueExercise {
                id: row.get(0)?,
                material_id: row.get(1)?,
                start_ms: row.get(2)?,
                end_ms: row.get(3)?,
                original_text: row.get(4)?,
                source_url: row.get(5)?,
                title: row.get(6)?,
            })
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    pub fn get_recent_accuracy(&self, user_id: i64, limit: i64) -> Result<f64> {
        let conn = self.conn.lock().unwrap();
        // Get average score of the last N study logs for this user
        let avg_score: Option<f64> = conn.query_row(
            "SELECT AVG(score) FROM (SELECT score FROM study_log WHERE user_id = ?1 ORDER BY created_at DESC LIMIT ?2)",
            params![user_id, limit],
            |row| row.get(0)
        )?;

        Ok(avg_score.unwrap_or(0.0))
    }

    /// Returns a random exercise and its parent material's audio path from the user's study history.
    pub fn get_random_exercise_with_audio(
        &self,
        user_id: i64,
    ) -> Result<Option<(Exercise, String)>> {
        let conn = self.conn.lock().unwrap();
        let row: Option<(i64, i64, i64, i64, String, String)> = conn
            .query_row(
                "SELECT e.id, e.material_id, e.start_ms, e.end_ms, e.original_text, m.source_url
             FROM exercise e
             JOIN learning_material m ON e.material_id = m.id
             JOIN study_log l ON e.id = l.exercise_id
             WHERE l.user_id = ?1 AND e.original_text != '' 
             ORDER BY RANDOM() LIMIT 1",
                params![user_id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .optional()?;

        Ok(row.map(|(id, mid, start, end, text, url)| {
            (
                Exercise {
                    id,
                    material_id: mid,
                    start_ms: start,
                    end_ms: end,
                    original_text: text,
                },
                url,
            )
        }))
    }

    // ── Learning Progress ────────────────────────────────────────────────────

    /// Ensure the material_progress table exists (called once at startup).
    pub fn init_progress_table(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS material_progress (
                user_id           INTEGER NOT NULL,
                material_id       INTEGER NOT NULL,
                position_secs     REAL    NOT NULL DEFAULT 0,
                volume            REAL    NOT NULL DEFAULT 1,
                speed             REAL    NOT NULL DEFAULT 1,
                mode              TEXT    NOT NULL DEFAULT 'Global',
                segments_json     TEXT    NOT NULL DEFAULT '[]',
                active_segment_id TEXT,
                updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, material_id)
            )",
            [],
        )?;
        Ok(())
    }

    pub fn save_progress(
        &self,
        user_id: i64,
        material_id: i64,
        position_secs: f64,
        volume: f32,
        speed: f32,
        mode: &str,
        segments_json: &str,
        active_segment_id: Option<&str>,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO material_progress
                (user_id, material_id, position_secs, volume, speed, mode, segments_json, active_segment_id, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, CURRENT_TIMESTAMP)
             ON CONFLICT(user_id, material_id) DO UPDATE SET
                position_secs     = excluded.position_secs,
                volume            = excluded.volume,
                speed             = excluded.speed,
                mode              = excluded.mode,
                segments_json     = excluded.segments_json,
                active_segment_id = excluded.active_segment_id,
                updated_at        = CURRENT_TIMESTAMP",
            params![user_id, material_id, position_secs, volume, speed, mode,
                    segments_json, active_segment_id],
        )?;
        Ok(())
    }

    pub fn get_progress(&self, user_id: i64, material_id: i64) -> Result<Option<ProgressSnapshot>> {
        let conn = self.conn.lock().unwrap();
        let row: Option<(f64, f32, f32, String, String, Option<String>, Option<String>)> = conn.query_row(
            "SELECT position_secs, volume, speed, mode, segments_json, active_segment_id, updated_at
             FROM material_progress WHERE user_id = ?1 AND material_id = ?2",
            params![user_id, material_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)),
        ).optional()?;

        let Some((
            position_secs,
            volume,
            speed,
            mode,
            segments_json,
            active_segment_id,
            updated_at,
        )) = row
        else {
            return Ok(None);
        };

        let segments = serde_json::from_str(&segments_json).unwrap_or_default();

        Ok(Some(ProgressSnapshot {
            material_id,
            position_secs,
            volume,
            speed,
            mode,
            segments,
            active_segment_id,
            updated_at,
        }))
    }
    pub fn get_daily_study_stats(&self, user_id: i64, days: i64) -> Result<Vec<DailyStat>> {
        let conn = self.conn.lock().unwrap();
        let query = "
            WITH RECURSIVE dates(d) AS (
                SELECT date('now', '-' || (?2 - 1) || ' days')
                UNION ALL
                SELECT date(d, '+1 day') FROM dates WHERE d < date('now')
            )
            SELECT 
                d as date,
                COALESCE(SUM(time_spent_ms) / 60000.0, 0.0) as minutes,
                COALESCE(AVG(score), 0.0) as avg_score
            FROM dates
            LEFT JOIN study_log ON date(created_at) = d AND user_id = ?1
            GROUP BY d
            ORDER BY d ASC
        ";
        let mut stmt = conn.prepare(query)?;
        let stats = stmt
            .query_map(params![user_id, days], |row| {
                Ok(DailyStat {
                    date: row.get(0)?,
                    minutes: row.get(1)?,
                    avg_score: row.get(2)?,
                })
            })?
            .filter_map(Result::ok)
            .collect();

        Ok(stats)
    }

    pub fn get_material_distribution(&self, user_id: i64) -> Result<MaterialDistribution> {
        let conn = self.conn.lock().unwrap();

        let mastered: i64 = conn.query_row(
            "SELECT COUNT(*) FROM review_schedule WHERE user_id = ?1 AND (repetitions >= 4 OR interval_days > 21)",
            [user_id],
            |row| row.get(0)
        ).unwrap_or(0);

        let learning: i64 = conn.query_row(
            "SELECT COUNT(*) FROM review_schedule WHERE user_id = ?1 AND NOT (repetitions >= 4 OR interval_days > 21)",
            [user_id],
            |row| row.get(0)
        ).unwrap_or(0);

        let total_materials: i64 = conn
            .query_row("SELECT COUNT(*) FROM learning_material", [], |row| {
                row.get(0)
            })
            .unwrap_or(0);
        let in_review: i64 = conn
            .query_row(
                "SELECT COUNT(DISTINCT exercise_id) FROM review_schedule WHERE user_id = ?1",
                [user_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        Ok(MaterialDistribution {
            mastered,
            learning,
            new: (total_materials - in_review).max(0),
        })
    }
    pub fn delete_material(&self, material_id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        // Delete dependents linked via exercise
        conn.execute("DELETE FROM review_schedule WHERE exercise_id IN (SELECT id FROM exercise WHERE material_id = ?1)", [material_id])?;
        conn.execute("DELETE FROM study_log WHERE exercise_id IN (SELECT id FROM exercise WHERE material_id = ?1)", [material_id])?;

        // Delete direct dependents
        conn.execute("DELETE FROM exercise WHERE material_id = ?1", [material_id])?;
        conn.execute(
            "DELETE FROM material_progress WHERE material_id = ?1",
            [material_id],
        )?;

        // Delete material
        conn.execute("DELETE FROM learning_material WHERE id = ?1", [material_id])?;
        Ok(())
    }

    pub fn rename_material(&self, material_id: i64, new_title: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE learning_material SET title = ?1 WHERE id = ?2",
            params![new_title, material_id],
        )?;
        Ok(())
    }

    pub fn search_materials(
        &self,
        user_id: i64,
        query: &str,
        sort_by: &str,
    ) -> Result<Vec<LearningMaterial>> {
        let conn = self.conn.lock().unwrap();

        let mut sql = String::from(
            "
            SELECT m.id, m.title, m.source_url, m.duration_ms, m.last_opened_at, p.position_secs
            FROM learning_material m
            LEFT JOIN material_progress p ON m.id = p.material_id AND p.user_id = ?1
            WHERE m.user_id = ?1
        ",
        );

        let mut params_vec: Vec<rusqlite::types::Value> =
            vec![rusqlite::types::Value::Integer(user_id)];

        if !query.is_empty() {
            sql.push_str(" AND m.title LIKE ?");
            params_vec.push(rusqlite::types::Value::Text(format!("%{}%", query)));
        }

        match sort_by {
            "title" => sql.push_str(" ORDER BY m.title ASC"),
            "oldest" => sql.push_str(" ORDER BY m.last_opened_at ASC"),
            _ => sql.push_str(" ORDER BY m.last_opened_at DESC"),
        }

        let mut stmt = conn.prepare(&sql)?;
        let materials = stmt
            .query_map(rusqlite::params_from_iter(params_vec), |row| {
                Ok(LearningMaterial {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    source_url: row.get(2)?,
                    duration_ms: row.get(3)?,
                    last_opened_at: row.get(4)?,
                    progress_secs: row.get(5)?,
                })
            })?
            .filter_map(Result::ok)
            .collect();

        Ok(materials)
    }

    // --- Pronunciation Scoring ---
    pub fn save_pronunciation_score(
        &self,
        user_id: i64,
        material_id: i64,
        reference_text: &str,
        duration_ms: i64,
        score: f64,
        audio_path: Option<&str>,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO pronunciation_log (user_id, material_id, reference_text, duration_ms, score, audio_path) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![user_id, material_id, reference_text, duration_ms, score, audio_path],
        )?;
        Ok(())
    }

    pub fn get_pronunciation_history(
        &self,
        user_id: i64,
        limit: i64,
    ) -> Result<Vec<PronunciationLog>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "
            SELECT id, user_id, material_id, reference_text, duration_ms, score, audio_path, created_at 
            FROM pronunciation_log 
            WHERE user_id = ?1 
            ORDER BY created_at DESC LIMIT ?2
        ",
        )?;

        let logs = stmt
            .query_map(params![user_id, limit], |row| {
                Ok(PronunciationLog {
                    id: row.get(0)?,
                    user_id: row.get(1)?,
                    material_id: row.get(2)?,
                    reference_text: row.get(3)?,
                    duration_ms: row.get(4)?,
                    score: row.get(5)?,
                    audio_path: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })?
            .filter_map(Result::ok)
            .collect();

        Ok(logs)
    }
}
