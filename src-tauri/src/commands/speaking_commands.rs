use crate::ai::model_manager::DEFAULT_MODEL_NAME;
use crate::audio::{AudioState, PlaybackMode};
use crate::db::study_store::StudyStore;
use crate::db::transcript_store::TranscriptStore;
use crate::session::UserSession;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReferenceText {
    pub text: String,
    pub material_id: Option<i64>,
    pub audio_path: Option<String>,
    pub start_ms: Option<i64>,
    pub end_ms: Option<i64>,
}

pub struct ShadowingState {
    pub override_segment: std::sync::Mutex<Option<ReferenceText>>,
}

/// Returns the best available reference sentence for Speaking practice, using the following priority:
/// 1. The text of the active A/B segment (from the transcript of the loaded file)
/// 2. The text of the sentence currently playing (words crossing the playback cursor)
/// 3. A random exercise sentence from the study history
#[tauri::command]
pub fn get_reference_text(
    audio_state: State<'_, AudioState>,
    transcript_store: State<'_, TranscriptStore>,
    study_store: State<'_, StudyStore>,
    session: State<'_, UserSession>,
    shadowing_state: State<'_, ShadowingState>,
) -> Result<Option<ReferenceText>, String> {
    // Priority 0: Explicit Override
    {
        let ov = shadowing_state.override_segment.lock().unwrap();
        if let Some(segment) = ov.as_ref() {
            return Ok(Some(segment.clone()));
        }
    }

    let cache_key = format!("{}_v3", DEFAULT_MODEL_NAME);
    let info = audio_state.handle.get_state();

    // Priority 1: Active AB segment text (ONLY if not in Global mode)
    if info.mode != PlaybackMode::Global {
        if let Some(seg_id) = &info.active_segment_id {
            if let Some(seg) = info.segments.iter().find(|s| &s.id == seg_id) {
                let start_ms = (seg.start_secs * 1000.0) as i64;
                let end_ms = (seg.end_secs * 1000.0) as i64;

                let text = words_in_range(
                    &transcript_store,
                    &info.file_path,
                    &cache_key,
                    start_ms,
                    end_ms,
                );
                if let Some(t) = text {
                    if !t.trim().is_empty() {
                        return Ok(Some(ReferenceText {
                            text: t,
                            material_id: info.material_id,
                            audio_path: Some(info.file_path.clone()),
                            start_ms: Some(start_ms),
                            end_ms: Some(end_ms),
                        }));
                    }
                }
            }
        }
    }

    // Priority 2: Sentence around current playback position
    if !info.file_path.is_empty() {
        let cursor_ms = (info.position_secs * 1000.0) as i64;
        let sentence = find_sentence_at_ms(
            &transcript_store,
            &info.file_path,
            &cache_key,
            cursor_ms,
        );
        if let Some(s) = sentence {
            return Ok(Some(s));
        }
    }

    // Priority 3: Random exercise from study history
    let user_id = session.current_user_id().unwrap_or(0);
    let random = study_store
        .get_random_exercise_with_audio(user_id)
        .map_err(|e| format!("DB error: {}", e))?;

    if let Some((exercise, audio_path)) = random {
        return Ok(Some(ReferenceText {
            text: exercise.original_text,
            material_id: Some(exercise.material_id),
            audio_path: Some(audio_path),
            start_ms: Some(exercise.start_ms),
            end_ms: Some(exercise.end_ms),
        }));
    }

    Ok(None)
}

#[tauri::command]
pub fn set_shadowing_override(
    text: String,
    audio_path: String,
    start_ms: i64,
    end_ms: i64,
    shadowing_state: State<'_, ShadowingState>,
) -> Result<(), String> {
    let mut ov = shadowing_state.override_segment.lock().unwrap();
    *ov = Some(ReferenceText {
        text,
        material_id: None, // Overrides are usually ad-hoc
        audio_path: Some(audio_path),
        start_ms: Some(start_ms),
        end_ms: Some(end_ms),
    });
    Ok(())
}

/// Helper: find the full sentence containing the target_ms.
fn find_sentence_at_ms(
    store: &TranscriptStore,
    file_path: &str,
    cache_key: &str,
    target_ms: i64,
) -> Option<ReferenceText> {
    if file_path.is_empty() {
        return None;
    }

    let transcript = store.get_transcript(file_path, cache_key).ok()??;
    if transcript.words.is_empty() {
        return None;
    }

    // Find the word containing the cursor, or the closest one before it
    let idx = match transcript.words.binary_search_by(|w| w.start_ms.cmp(&target_ms)) {
        Ok(i) => i,
        Err(i) => {
            if i > 0 { i - 1 } else { 0 }
        }
    };

    // Expand backwards to find sentence start
    let mut start = idx;
    while start > 0 {
        let prev_w = transcript.words[start - 1].word.trim();
        if is_sentence_ender(prev_w) {
            break;
        }
        start -= 1;
    }

    // Expand forwards to find sentence end
    let mut end = idx;
    while end < transcript.words.len() - 1 {
        let curr_w = transcript.words[end].word.trim();
        if is_sentence_ender(curr_w) {
            break;
        }
        end += 1;
    }

    let sub_words = &transcript.words[start..=end];
    let text = sub_words.iter().map(|w| w.word.clone()).collect::<Vec<_>>().join(" ");
    
    Some(ReferenceText {
        text: text.trim().to_string(),
        material_id: None, // Will be filled by info.material_id in caller if needed, or left None
        audio_path: Some(file_path.to_string()),
        start_ms: Some(sub_words[0].start_ms),
        end_ms: Some(sub_words[sub_words.len()-1].end_ms),
    })
}

fn is_sentence_ender(w: &str) -> bool {
    w.ends_with('.') || w.ends_with('!') || w.ends_with('?') || 
    w.ends_with('。') || w.ends_with('！') || w.ends_with('？')
}

/// Helper: fetch transcript words for a file within [start_ms, end_ms] and join to a sentence.
fn words_in_range(
    store: &TranscriptStore,
    file_path: &str,
    cache_key: &str,
    start_ms: i64,
    end_ms: i64,
) -> Option<String> {
    if file_path.is_empty() {
        return None;
    }

    let transcript = store.get_transcript(file_path, cache_key).ok()??;
    let words: Vec<String> = transcript
        .words
        .iter()
        .filter(|w| w.start_ms >= start_ms && w.end_ms <= end_ms)
        .map(|w| w.word.clone())
        .collect();

    if words.is_empty() {
        None
    } else {
        Some(words.join(" "))
    }
}

#[tauri::command]
pub fn clear_shadowing_override(shadowing_state: State<'_, ShadowingState>) -> Result<(), String> {
    let mut ov = shadowing_state.override_segment.lock().unwrap();
    *ov = None;
    Ok(())
}
