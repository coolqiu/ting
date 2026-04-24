use crate::db::transcript_store::WordTimestamp;
use rodio::{Decoder, Source};
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
        prompt: Option<String>,
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
        // Keep context between 30-second segments so Whisper remembers what it already said,
        // preventing repetition loops on recordings longer than 30s.
        params.set_no_context(false);

        #[cfg(target_os = "ios")]
        params.set_no_speech_thold(0.15); // Balanced "door" for iOS with silence padding

        #[cfg(target_os = "android")]
        params.set_no_speech_thold(0.1);  // Balanced sensitivity for Android

        #[cfg(not(any(target_os = "ios", target_os = "android")))]
        params.set_no_speech_thold(0.2);  // Conservative for Desktop noise environment

        params.set_entropy_thold(2.4); // Lower threshold to be more lenient with initial words

        if let Some(p) = prompt.as_deref() {
            // Passing the reference text to Whisper strongly biases the language model
            // towards the expected vocabulary, eliminating homophone errors and name misspellings!
            params.set_initial_prompt(p);
        }

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

        // --- Post-Processing: Deduplicate repeated segments ---
        // Whisper can sometimes repeat a block of text. We detect this by checking
        // if a later substring of words exactly matches an earlier one.
        let deduped = deduplicate_words(all_words);

        Ok(deduped)
    }
}

/// Removes repeated blocks of words from the transcription output.
/// Whisper may produce "A B C D E . A B C D E" when processing segments near boundaries.
/// This function detects when the second half is a repeat of an earlier block and trims it.
fn deduplicate_words(words: Vec<WordTimestamp>) -> Vec<WordTimestamp> {
    if words.len() < 6 {
        return words;
    }

    // Try different split points: check if the words from position `split` onward
    // are a repeat of words starting from some earlier position.
    let word_texts: Vec<&str> = words.iter().map(|w| w.word.as_str()).collect();
    let n = word_texts.len();

    // We look for a repeated suffix: the last K words match a block of K words earlier.
    // Try block sizes from n/2 down to 3 words.
    let max_block = n / 2;
    for block_size in (3..=max_block).rev() {
        let suffix_start = n - block_size;
        
        // Search for this suffix block earlier in the text
        'outer: for start in 0..=(n - 2 * block_size) {
            // Check if words[start..start+block_size] matches words[suffix_start..suffix_start+block_size]
            for k in 0..block_size {
                if word_texts[start + k].to_lowercase() != word_texts[suffix_start + k].to_lowercase() {
                    continue 'outer;
                }
            }
            // Found a match! Trim the repeated suffix.
            println!("[Whisper] Trimming {} repeated words (block at {} duplicated at {})", block_size, start, suffix_start);
            return words[..suffix_start].to_vec();
        }
    }

    words
}

fn extract_16k_mono_pcm(path: &Path) -> Result<Vec<f32>, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open audio: {}", e))?;
    let source =
        Decoder::new(BufReader::new(file)).map_err(|e| format!("Failed to decode: {}", e))?;

    let channels = source.channels() as usize;
    let sample_rate = source.sample_rate();

    let f32_source = source.convert_samples::<f32>();

    // 1. Read all samples to memory
    let all_samples: Vec<f32> = f32_source.collect();
    if all_samples.is_empty() {
        return Err("No audio samples found".into());
    }

    // 2. Identify the primary voice channel by highest energy
    // This entirely avoids the dreaded "Phase Cancellation" issue when mixing Stereo to Mono
    // which previously destroyed the voice waveform and caused Whisper to hallucinate context.
    let mut channel_energies = vec![0.0_f32; channels];
    for (i, &sample) in all_samples.iter().enumerate() {
        channel_energies[i % channels] += sample.abs();
    }

    let mut best_channel = 0;
    let mut max_energy = -1.0;
    for (i, &energy) in channel_energies.iter().enumerate() {
        if energy > max_energy {
            max_energy = energy;
            best_channel = i;
        }
    }

    // 3. Extract only the best channel
    let best_channel_samples: Vec<f32> = all_samples
        .iter()
        .enumerate()
        .filter_map(|(i, &s)| if i % channels == best_channel { Some(s) } else { None })
        .collect();

    // 4. Boxcar Anti-Aliasing Decimation (48kHz -> 16kHz)
    // This applies a low-pass moving average filter, far superior to rodio's nearest-neighbor
    let mut mono_samples: Vec<f32> = Vec::new();
    let target_rate = 16000.0;
    let ratio = sample_rate as f32 / target_rate;

    let mut resample_sum = 0.0_f32;
    let mut resample_count = 0.0_f32;
    let mut current_idx = 0.0_f32;

    for sample in best_channel_samples {
        resample_sum += sample;
        resample_count += 1.0;
        current_idx += 1.0;

        if current_idx >= ratio {
            let avg = if resample_count > 0.0 {
                resample_sum / resample_count
            } else {
                0.0
            };
            mono_samples.push(avg);
            
            resample_sum = 0.0;
            resample_count = 0.0;
            current_idx -= ratio;
        }
    }

    if mono_samples.is_empty() {
        return Err("No audio samples produced after resampling".into());
    }

    // 5. Peak Normalization
    // Ensure the AI gets a consistent volume level by scaling the peak to 0.9.
    // This dramatically improves recognition on iPhone where initial mic gain may be low.
    let mut max_abs = 0.0_f32;
    for &sample in &mono_samples {
        let abs = sample.abs();
        if abs > max_abs { max_abs = abs; }
    }

    if max_abs > 0.001 {
        let scale = 0.9 / max_abs;
        for sample in &mut mono_samples {
            *sample *= scale;
        }
    }

    Ok(mono_samples)
}
