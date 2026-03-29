use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordTimestamp {
    pub word: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transcript {
    pub id: i64,
    pub file_hash: String, // We'll use file path or hash as identifier
    pub model_used: String,
    pub words: Vec<WordTimestamp>,
}

pub struct TranscriptStore {
    conn: Mutex<Connection>,
}

impl TranscriptStore {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let conn = Connection::open(db_path)?;

        // Initialize tables
        conn.execute(
            "CREATE TABLE IF NOT EXISTS transcripts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_hash TEXT NOT NULL,
                model_used TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(file_hash, model_used)
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS transcript_words (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transcript_id INTEGER NOT NULL,
                word TEXT NOT NULL,
                start_ms INTEGER NOT NULL,
                end_ms INTEGER NOT NULL,
                confidence REAL NOT NULL,
                FOREIGN KEY(transcript_id) REFERENCES transcripts(id) ON DELETE CASCADE
            )",
            [],
        )?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn save_transcript(
        &self,
        file_hash: &str,
        model_used: &str,
        words: &[WordTimestamp],
    ) -> Result<i64> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        // Replace if exists
        tx.execute(
            "INSERT OR REPLACE INTO transcripts (file_hash, model_used) VALUES (?1, ?2)",
            params![file_hash, model_used],
        )?;

        let transcript_id = tx.last_insert_rowid();

        // Delete old words if any
        tx.execute(
            "DELETE FROM transcript_words WHERE transcript_id = ?1",
            params![transcript_id],
        )?;

        let mut stmt = tx.prepare(
            "INSERT INTO transcript_words (transcript_id, word, start_ms, end_ms, confidence) 
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )?;

        for word in words {
            stmt.execute(params![
                transcript_id,
                word.word,
                word.start_ms,
                word.end_ms,
                word.confidence
            ])?;
        }
        drop(stmt);

        tx.commit()?;
        Ok(transcript_id)
    }

    pub fn get_transcript(&self, file_hash: &str, model_used: &str) -> Result<Option<Transcript>> {
        let conn = self.conn.lock().unwrap();

        // Find transcript
        let transcript_id: i64 = {
            let mut stmt = conn
                .prepare("SELECT id FROM transcripts WHERE file_hash = ?1 AND model_used = ?2")?;
            let mut rows = stmt.query(params![file_hash, model_used])?;
            match rows.next()? {
                Some(row) => row.get(0)?,
                None => return Ok(None),
            }
        };

        // Fetch words
        let mut stmt = conn.prepare(
            "SELECT word, start_ms, end_ms, confidence FROM transcript_words WHERE transcript_id = ?1 ORDER BY start_ms ASC"
        )?;

        let word_iter = stmt.query_map(params![transcript_id], |row| {
            Ok(WordTimestamp {
                word: row.get(0)?,
                start_ms: row.get(1)?,
                end_ms: row.get(2)?,
                confidence: row.get(3)?,
            })
        })?;

        let mut words = Vec::new();
        for word in word_iter {
            words.push(word?);
        }

        Ok(Some(Transcript {
            id: transcript_id,
            file_hash: file_hash.to_string(),
            model_used: model_used.to_string(),
            words,
        }))
    }
}
