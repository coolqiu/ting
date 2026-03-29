use crate::db::transcript_store::WordTimestamp;
use rodio::{source::UniformSourceIterator, Decoder, Source};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

pub struct WhisperEngine {
    ctx: WhisperContext,
}

impl WhisperEngine {
    pub fn new(model_path: &Path) -> Result<Self, String> {
        let params = WhisperContextParameters::default();
        let ctx = WhisperContext::new_with_params(
            model_path.to_str().ok_or("Invalid model path string")?,
            params,
        )
        .map_err(|e| format!("Failed to load model: {}", e))?;

        Ok(Self { ctx })
    }

    pub fn transcribe<F>(
        &self,
        audio_path: &Path,
        progress_cb: Option<F>,
    ) -> Result<Vec<WordTimestamp>, String>
    where
        F: FnMut(i32) + 'static,
    {
        // 1. Extract and resample to 16kHz mono f32
        let pcm_data = extract_16k_mono_pcm(audio_path)?;

        // 2. Transcribe
        let mut state = self
            .ctx
            .create_state()
            .map_err(|e| format!("Failed to create state: {}", e))?;

        // Silence verbose whisper.cpp logs to stdout/stderr
        whisper_rs::install_logging_hooks();

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 5 });

        // Critical for breaking hallucination loops: temperature fallback
        // When entropy is high, whisper will try higher temperatures (up to +1.0)
        params.set_temperature_inc(0.2);

        params.set_language(None); // Auto-detect language
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_token_timestamps(true);
        params.set_suppress_blank(true);
        params.set_suppress_nst(true);
        params.set_no_context(true); // Disable context feedback to break hallucination loops

        // Aggressive thresholds to skip long segments of music/noise
        // Lowered no_speech_thold to 0.45 (default 0.6) so it skips more readily when music plays
        params.set_no_speech_thold(0.45);
        params.set_entropy_thold(2.4);

        if let Some(cb) = progress_cb {
            params.set_progress_callback_safe(cb);
        }

        state
            .full(params, &pcm_data[..])
            .map_err(|e| format!("Failed to run inference: {}", e))?;

        // 3. Process tokens from WhisperSegment
        // Whisper uses BPE tokenization: tokens without a leading space are
        // continuation sub-tokens that must be MERGED with the previous token,
        // not stored as new words (e.g. " Lyn" + "ette" → "Lynette").
        let num_segments = state.full_n_segments();
        let mut all_words: Vec<WordTimestamp> = Vec::new();

        for i in 0..num_segments {
            let segment = state
                .get_segment(i)
                .ok_or_else(|| format!("Segment {} out of bounds", i))?;
            let num_tokens = segment.n_tokens();

            // 1. Rebuild full text for the segment to check against known hallucinations
            let mut segment_text = String::new();
            for j in 0..num_tokens {
                if let Some(token) = segment.get_token(j) {
                    segment_text.push_str(token.to_str().unwrap_or_default());
                }
            }

            // 2. Check for known hallucinations often generated during silence/music
            let seg_lower = segment_text.to_lowercase();
            let is_hallucination = seg_lower.contains("subtitles by")
                || seg_lower.contains("amara.org")
                || seg_lower.contains("the queen's house is in the city of st. louis")
                || seg_lower.contains("tiffany axelrod")
                || seg_lower.contains("guess i've done my good deed for the day")
                || (seg_lower.contains("thanks for watching") && seg_lower.len() < 35);

            if is_hallucination {
                println!("Skipping whisper hallucination segment: {}", segment_text);
                continue; // drop all words in this segment
            }

            for j in 0..num_tokens {
                let token = segment
                    .get_token(j)
                    .ok_or_else(|| format!("Token {} out of bounds", j))?;

                // Raw text before any trimming — the leading space is the word-boundary marker
                let raw_text = token.to_str().unwrap_or_default();
                let token_data = token.token_data();

                // token_data.t0 / t1 are in 10ms ticks (centiseconds)
                let start_ms = token_data.t0 as i64 * 10;
                let end_ms = token_data.t1 as i64 * 10;
                let confidence = token.token_probability();

                let trimmed = raw_text.trim();

                // Skip empty tokens and special markers like [_BEG_], [_TT_NNN], etc.
                let is_special = trimmed.starts_with('[') && trimmed.ends_with(']');
                if trimmed.is_empty() || is_special {
                    continue;
                }

                // A token that starts with a space begins a new word.
                // A token WITHOUT a leading space is a BPE continuation and must
                // be appended to the previous word.
                let starts_new_word = raw_text.starts_with(' ') || all_words.is_empty();

                if starts_new_word {
                    all_words.push(WordTimestamp {
                        word: trimmed.to_string(),
                        start_ms,
                        end_ms,
                        confidence,
                    });
                } else {
                    // Merge with previous word
                    if let Some(last) = all_words.last_mut() {
                        last.word.push_str(trimmed);
                        last.end_ms = end_ms; // extend end time to include the continuation
                                              // Keep the minimum confidence of the constituent tokens
                        if confidence < last.confidence {
                            last.confidence = confidence;
                        }
                    }
                }
            }
        }

        Ok(all_words)
    }
}

fn extract_16k_mono_pcm(path: &Path) -> Result<Vec<f32>, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open audio: {}", e))?;
    let source =
        Decoder::new(BufReader::new(file)).map_err(|e| format!("Failed to decode: {}", e))?;

    // We need 1 channel (mono) and 16000Hz samplerate for Whisper
    let f32_source = source.convert_samples::<f32>();
    let resampled = UniformSourceIterator::new(f32_source, 1, 16000);
    let mono_samples: Vec<f32> = resampled.collect();

    if mono_samples.is_empty() {
        return Err("No audio samples found".into());
    }

    Ok(mono_samples)
}
