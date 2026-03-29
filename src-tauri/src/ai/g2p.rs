use std::collections::HashMap;

pub struct G2P {
    // Basic CMUdict mapping (subset for demo/testing, in production this should be a full dict)
    dict: HashMap<String, Vec<String>>,
}

impl G2P {
    pub fn new() -> Self {
        let mut dict = HashMap::new();
        // Common words (eSpeak NG / IPA)
        dict.insert(
            "HAVE".to_string(),
            vec!["h".to_string(), "æ".to_string(), "v".to_string()],
        );
        dict.insert("TO".to_string(), vec!["t".to_string(), "u".to_string()]);
        dict.insert("DO".to_string(), vec!["d".to_string(), "uː".to_string()]);
        dict.insert(
            "WHAT".to_string(),
            vec!["w".to_string(), "ʌ".to_string(), "t".to_string()],
        );
        dict.insert("I".to_string(), vec!["aɪ".to_string()]);
        dict.insert("SAY".to_string(), vec!["s".to_string(), "eɪ".to_string()]);
        dict.insert("YOU".to_string(), vec!["j".to_string(), "uː".to_string()]);
        dict.insert("ARE".to_string(), vec!["ɑː".to_string()]);
        dict.insert("AM".to_string(), vec!["æ".to_string(), "m".to_string()]);
        dict.insert("FOR".to_string(), vec!["f".to_string(), "ɔː".to_string()]);

        Self { dict }
    }

    pub fn convert(&self, text: &str) -> Vec<String> {
        self.convert_with_words(text)
            .into_iter()
            .flat_map(|(_, phs)| phs)
            .collect()
    }

    pub fn convert_with_words(&self, text: &str) -> Vec<(String, Vec<String>)> {
        let mut result = Vec::new();
        let cleaned: String = text
            .chars()
            .map(|c| {
                if c.is_alphabetic() || c.is_whitespace() || c == '\'' {
                    c
                } else {
                    ' '
                }
            })
            .collect();

        let normalized = cleaned.to_uppercase();
        let words = normalized.split_whitespace();

        for word in words {
            if let Some(phs) = self.dict.get(word) {
                result.push((word.to_string(), phs.iter().cloned().collect()));
            } else {
                // Better fallback mapping for common letters to espeak IPA
                let mut phs = Vec::new();
                let word_low = word.to_lowercase();
                let mut chars = word_low.chars().peekable();
                let len = word_low.len();
                let mut pos = 0;

                while let Some(c) = chars.next() {
                    pos += 1;
                    match c {
                        'a' => phs.push("æ".to_string()),
                        'b' => phs.push("b".to_string()),
                        'c' => {
                            if let Some(&next) = chars.peek() {
                                if next == 'h' {
                                    phs.push("tʃ".to_string());
                                    chars.next();
                                    pos += 1;
                                } else {
                                    phs.push("k".to_string());
                                }
                            } else {
                                phs.push("k".to_string());
                            }
                        }
                        'd' => phs.push("d".to_string()),
                        'e' => {
                            // Silent 'e' at the end of word (simple heuristic)
                            if pos < len || len <= 2 {
                                phs.push("ɛ".to_string());
                            }
                        }
                        'f' => phs.push("f".to_string()),
                        'g' => phs.push("ɡ".to_string()),
                        'h' => phs.push("h".to_string()),
                        'i' => phs.push("ɪ".to_string()),
                        'j' => phs.push("dʒ".to_string()),
                        'k' => phs.push("k".to_string()),
                        'l' => phs.push("l".to_string()),
                        'm' => phs.push("m".to_string()),
                        'n' => phs.push("n".to_string()),
                        'o' => phs.push("ɒ".to_string()),
                        'p' => phs.push("p".to_string()),
                        'q' => phs.push("k".to_string()),
                        'r' => phs.push("ɹ".to_string()),
                        's' => {
                            if let Some(&next) = chars.peek() {
                                if next == 'h' {
                                    phs.push("ʃ".to_string());
                                    chars.next();
                                    pos += 1;
                                } else {
                                    phs.push("s".to_string());
                                }
                            } else {
                                phs.push("s".to_string());
                            }
                        }
                        't' => {
                            if let Some(&next) = chars.peek() {
                                if next == 'h' {
                                    phs.push("θ".to_string());
                                    chars.next();
                                    pos += 1;
                                } else {
                                    phs.push("t".to_string());
                                }
                            } else {
                                phs.push("t".to_string());
                            }
                        }
                        'u' => phs.push("ʌ".to_string()),
                        'v' => phs.push("v".to_string()),
                        'w' => phs.push("w".to_string()),
                        'x' => {
                            phs.push("k".to_string());
                            phs.push("s".to_string());
                        }
                        'y' => {
                            if pos == len {
                                phs.push("i".to_string());
                            } else {
                                phs.push("j".to_string());
                            }
                        }
                        'z' => phs.push("z".to_string()),
                        _ => {}
                    }
                }
                result.push((word.to_string(), phs));
            }
        }
        result
    }
}
