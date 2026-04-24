pub mod engine;
pub mod recorder;
pub mod sonic;

pub use engine::{AudioHandle, PlaybackMode, PlaybackInfo, ABSegment};

/// Global audio state managed by Tauri
/// AudioHandle uses channels internally so it is Send + Sync safe.
pub struct AudioState {
    pub handle: AudioHandle,
}

impl Default for AudioState {
    fn default() -> Self {
        Self {
            handle: AudioHandle::new(),
        }
    }
}
