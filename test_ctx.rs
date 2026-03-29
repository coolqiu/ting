use whisper_rs::FullParams; fn main() { let mut p = FullParams::new(whisper_rs::SamplingStrategy::Greedy { best_of: 1 }); p.set_no_context(true); }
