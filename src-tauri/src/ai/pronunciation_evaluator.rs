use crate::ai::g2p::G2P;
use hound::WavReader;
use ndarray::Array2;
use ort::session::builder::SessionBuilder;
use ort::session::Session;
use ort::value::Value;
use serde::Serialize;
use std::path::Path;

const SAMPLE_RATE: u32 = 16000;

#[derive(Debug, Serialize)]
pub struct PhonemeScore {
    pub phoneme: String,
    pub score: f32, // 0-100
}

#[derive(Debug, Serialize)]
pub struct WordAssessment {
    pub word: String,
    pub phonemes: Vec<PhonemeScore>,
}

#[derive(Debug, Serialize)]
pub struct AssessmentResult {
    pub overall_score: f32,
    pub words: Vec<WordAssessment>,
    pub suggestions: Vec<String>,
}

pub struct PronunciationEvaluator {
    session: Option<Session>,
    g2p: G2P,
    vocab: Vec<String>,
}

impl PronunciationEvaluator {
    pub fn new() -> Self {
        // Standard espeak-ng tokens for wav2vec2-lv-60-espeak-cv-ft
        let vocab = vec![
            "<pad>", "<s>", "</s>", "<unk>", "|", "n", "s", "t", "ə", "l", "a", "i", "k", "d", "m",
            "ɛ", "ɾ", "e", "ɪ", "p", "o", "ɐ", "z", "ð", "f", "j", "v", "b", "ɹ", "ʁ", "ʊ", "iː",
            "r", "w", "ʌ", "u", "ɡ", "æ", "aɪ", "ʃ", "h", "ɔ", "ɑː", "ŋ", "ɚ", "eɪ", "β", "uː",
            "y", "ɑ̃", "oʊ", "ᵻ", "eː", "θ", "aʊ", "ts", "oː", "ɔ̃", "ɣ", "ɜ", "ɑ", "dʒ", "əl", "x",
            "ɜː", "ç", "ʒ", "tʃ", "ɔː", "ɑːɹ", "ɛ̃", "ʎ", "ʋ", "aː", "ɕ",
        ]
        .into_iter()
        .map(|s| s.to_string())
        .collect();

        Self {
            session: None,
            g2p: G2P::new(),
            vocab,
        }
    }

    pub fn load_model<P: AsRef<Path>>(&mut self, model_path: P) -> Result<(), String> {
        let session = SessionBuilder::new()
            .map_err(|e: ort::Error| e.to_string())?
            .commit_from_file(model_path)
            .map_err(|e: ort::Error| e.to_string())?;
        self.session = Some(session);
        Ok(())
    }

    pub fn assess(
        &mut self,
        audio_path: &str,
        reference_text: &str,
    ) -> Result<AssessmentResult, String> {
        // 1. G2P with word grouping
        let target_words = self.g2p.convert_with_words(reference_text);
        if target_words.is_empty() {
            return Err("Could not generate phonemes".to_string());
        }

        // 2. Load and preprocess audio
        let audio_data = self.load_audio(audio_path)?;
        let n_samples = audio_data.len();
        let array =
            Array2::from_shape_vec((1, n_samples), audio_data).map_err(|e| e.to_string())?;

        // 3. Inference
        let session = self.session.as_mut().ok_or("Model not loaded")?;
        let input_name = session
            .inputs()
            .get(0)
            .ok_or("Model has no inputs")?
            .name()
            .to_string();
        let input_tensor = Value::from_array(array).map_err(|e: ort::Error| e.to_string())?;

        let outputs = session
            .run(ort::inputs![&*input_name => input_tensor])
            .map_err(|e: ort::Error| e.to_string())?;

        // Output logits
        let (logits_shape, logits_data) = outputs[0]
            .try_extract_tensor::<f32>()
            .map_err(|e: ort::Error| e.to_string())?;
        let shape_vec: Vec<usize> = logits_shape.iter().map(|&x| x as usize).collect();
        let logits =
            ndarray::ArrayViewD::from_shape(shape_vec, logits_data).map_err(|e| e.to_string())?;

        let shape = logits.shape();
        let n_frames = shape[1];

        // 4. Find speech start anchor (skip leading silence)
        let mut start_anchor = 0;
        for t in 0..n_frames {
            let frame_logits = logits.slice(ndarray::s![0, t, ..]);
            let max_logit = frame_logits
                .iter()
                .cloned()
                .fold(f32::NEG_INFINITY, f32::max);
            // If the clear winner is not silence (pad/pipe)
            let winner_idx = frame_logits
                .iter()
                .cloned()
                .position(|v| v == max_logit)
                .unwrap_or(0);
            if winner_idx > 4 {
                // Indices > 4 in our vocab are actual phonemes
                start_anchor = t.saturating_sub(5); // Buffer a few frames
                break;
            }
        }

        // 5. Calculate GOP with anchored alignment
        let mut word_assessments = Vec::new();
        let mut current_frame = start_anchor;

        let total_phonemes: usize = target_words.iter().map(|(_, phs)| phs.len()).sum();
        let avg_frames_per_ph = (n_frames - start_anchor) / total_phonemes.max(1);
        let mut search_window = (avg_frames_per_ph * 6).max(40).min(n_frames / 2);

        for (i, (word_text, phs)) in target_words.into_iter().enumerate() {
            let mut word_phs = Vec::new();
            for (j, ph_str) in phs.into_iter().enumerate() {
                let ph_idx = self.vocab.iter().position(|v| v == &ph_str).unwrap_or(3);

                let mut best_llr_avg = f32::NEG_INFINITY;
                let mut best_center = current_frame;

                let search_end = (current_frame + search_window).min(n_frames);
                for t in current_frame..search_end {
                    let mut sum_llr = 0.0;
                    let mut count = 0;
                    for dt in -1..=1 {
                        let tt = (t as i32 + dt).max(0).min(n_frames as i32 - 1) as usize;
                        let frame_logits = logits.slice(ndarray::s![0, tt, ..]);
                        let max_logit = frame_logits
                            .iter()
                            .cloned()
                            .fold(f32::NEG_INFINITY, f32::max);
                        sum_llr += frame_logits[ph_idx] - max_logit;
                        count += 1;
                    }
                    let avg = sum_llr / count as f32;
                    if avg > best_llr_avg {
                        best_llr_avg = avg;
                        best_center = t;
                    }
                }

                // Adjusted GOP mapping with tau=6.0 for better range
                let score = (100.0 * (best_llr_avg / 6.0).exp()).clamp(0.0, 100.0);

                word_phs.push(PhonemeScore {
                    phoneme: ph_str,
                    score,
                });

                current_frame = (best_center + 1).min(n_frames - 1);
                if i == 0 && j == 0 {
                    search_window = (avg_frames_per_ph * 5).max(30).min(n_frames / 2);
                }
            }
            word_assessments.push(WordAssessment {
                word: word_text,
                phonemes: word_phs,
            });
        }

        // Calculate overall score
        let all_scores: Vec<f32> = word_assessments
            .iter()
            .flat_map(|w| w.phonemes.iter())
            .map(|p| p.score)
            .collect();
        let overall_score = if all_scores.is_empty() {
            0.0
        } else {
            all_scores.iter().sum::<f32>() / all_scores.len() as f32
        };

        // 5. Suggestions logic
        let mut suggestions = Vec::new();
        for word in &word_assessments {
            for ps in &word.phonemes {
                if ps.score < 60.0 {
                    let msg = match ps.phoneme.as_str() {
                        "θ" => "注意 'th' 的发音，舌尖应轻触上齿 (Try placing your tongue between your teeth for 'θ')".to_string(),
                        "ɹ" | "r" => "注意 'r' 的卷舌音 (Curl your tongue slightly more for 'r')".to_string(),
                        "l" => "注意 'l' 的侧音，舌尖抵住上齿龈 (Press your tongue tip against the roof of your mouth for 'l')".to_string(),
                        "iː" => "这是一个长元音，发音时嘴角向两边拉开 (Stretch your smile for the long 'iː' sound)".to_string(),
                        "æ" => "梅花音 'æ'，嘴巴张大，嘴角后拉 (Open your mouth wider for 'æ')".to_string(),
                        "v" | "f" => "注意唇齿擦音，上齿咬住下唇 (Use your top teeth on your bottom lip for 'v' or 'f')".to_string(),
                        _ => format!("注意音素 /{}/ 的发音", ps.phoneme),
                    };
                    if !suggestions.contains(&msg) {
                        suggestions.push(msg);
                    }
                }
            }
        }

        Ok(AssessmentResult {
            overall_score,
            words: word_assessments,
            suggestions,
        })
    }

    fn load_audio(&self, path: &str) -> Result<Vec<f32>, String> {
        let mut reader = WavReader::open(path).map_err(|e| e.to_string())?;
        let spec = reader.spec();

        // 1. Convert to f32 and handle multi-channel (average to mono)
        let n_channels = spec.channels as usize;
        let mut raw_samples: Vec<f32> = Vec::new();

        let mut current_frame = Vec::with_capacity(n_channels);
        for sample in reader.samples::<i16>() {
            let s = sample.map_err(|e| e.to_string())? as f32 / 32768.0;
            current_frame.push(s);
            if current_frame.len() == n_channels {
                // Average all channels to mono
                let mono: f32 = current_frame.iter().sum::<f32>() / n_channels as f32;
                raw_samples.push(mono);
                current_frame.clear();
            }
        }

        // 2. Audio Standardization (Mean-Variance Normalization)
        // Wav2Vec2 expects input with zero mean and unit variance.
        let mean = raw_samples.iter().sum::<f32>() / raw_samples.len() as f32;
        let variance =
            raw_samples.iter().map(|&x| (x - mean).powi(2)).sum::<f32>() / raw_samples.len() as f32;
        let std_dev = (variance + 1e-7).sqrt();

        for s in &mut raw_samples {
            *s = (*s - mean) / std_dev;
        }

        // 3. Resampling with Linear Interpolation (if not 16k)
        if spec.sample_rate != SAMPLE_RATE {
            let ratio = spec.sample_rate as f64 / SAMPLE_RATE as f64;
            let target_len = (raw_samples.len() as f64 / ratio).floor() as usize;
            let mut resampled = Vec::with_capacity(target_len);

            for i in 0..target_len {
                let pos = i as f64 * ratio;
                let idx = pos as usize;
                let frac = pos - idx as f64;

                if idx + 1 < raw_samples.len() {
                    let s1 = raw_samples[idx];
                    let s2 = raw_samples[idx + 1];
                    resampled.push((s1 as f64 * (1.0 - frac) + s2 as f64 * frac) as f32);
                } else {
                    resampled.push(raw_samples[idx]);
                }
            }
            return Ok(resampled);
        }

        Ok(raw_samples)
    }
}
