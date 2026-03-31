use crate::audio::sonic::SonicStretcherExt;
use rodio::{Decoder, OutputStream, Sink, Source};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;
use symphonia::core::formats::{FormatOptions, SeekMode};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PlaybackMode {
    Global,     // Play entire file normally
    SingleLoop, // Loop the currently active AB segment
    ListLoop,   // Loop through the list of AB segments in order
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ABSegment {
    pub id: String,
    pub start_secs: f64,
    pub end_secs: f64,
    pub loop_count: u32, // 0 = infinite
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaybackInfo {
    pub file_path: String,
    pub file_name: String,
    pub material_id: Option<i64>, // Added for dictate/study mapping
    pub duration_secs: f64,
    pub position_secs: f64,
    pub is_playing: bool,
    pub volume: f32,
    pub speed: f32,
    pub mode: PlaybackMode,
    pub segments: Vec<ABSegment>,
    pub active_segment_id: Option<String>,
    pub loop_remaining: Option<u32>,
}

// Commands sent to the audio thread
enum AudioCommand {
    Load { path: String },
    Play,
    Pause,
    Resume,
    Stop,
    Unload,
    Seek { position_secs: f64 },
    SetVolume { volume: f32 },
    SetSpeed { speed: f32 },
    SetMode { mode: PlaybackMode },
    AddSegment { segment: ABSegment },
    UpdateSegment { segment: ABSegment },
    RemoveSegment { id: String },
    SetActiveSegment { id: Option<String> }, // manually jump to a segment
    SetMaterialId { id: Option<i64> },
    GetState,
    Shutdown,
}

// Responses from the audio thread
enum AudioResponse {
    Loaded(Result<PlaybackInfo, String>),
    Ok(Result<(), String>),
    State(PlaybackInfo),
}

/// Thread-safe handle to the audio engine.
pub struct AudioHandle {
    cmd_tx: mpsc::Sender<AudioCommand>,
    resp_rx: Mutex<mpsc::Receiver<AudioResponse>>,
}

impl AudioHandle {
    pub fn new() -> Self {
        let (cmd_tx, cmd_rx) = mpsc::channel::<AudioCommand>();
        let (resp_tx, resp_rx) = mpsc::channel::<AudioResponse>();

        thread::spawn(move || {
            audio_thread_main(cmd_rx, resp_tx);
        });

        Self {
            cmd_tx,
            resp_rx: Mutex::new(resp_rx),
        }
    }

    pub fn load(&self, path: &str) -> Result<PlaybackInfo, String> {
        self.cmd_tx
            .send(AudioCommand::Load {
                path: path.to_string(),
            })
            .map_err(|e| e.to_string())?;
        match self.resp_rx.lock().unwrap().recv().unwrap() {
            AudioResponse::Loaded(res) => res,
            _ => Err("Unexpected response".into()),
        }
    }

    pub fn play(&self) -> Result<(), String> {
        self.send_and_wait_ok(AudioCommand::Play)
    }

    pub fn pause(&self) -> Result<(), String> {
        self.send_and_wait_ok(AudioCommand::Pause)
    }

    pub fn resume(&self) -> Result<(), String> {
        self.send_and_wait_ok(AudioCommand::Resume)
    }

    pub fn stop(&self) -> Result<(), String> {
        self.send_and_wait_ok(AudioCommand::Stop)
    }

    pub fn unload(&self) -> Result<(), String> {
        self.send_and_wait_ok(AudioCommand::Unload)
    }

    pub fn seek(&self, position_secs: f64) -> Result<(), String> {
        self.send_and_wait_ok(AudioCommand::Seek { position_secs })
    }

    pub fn set_volume(&self, volume: f32) -> Result<(), String> {
        self.send_and_wait_ok(AudioCommand::SetVolume { volume })
    }

    pub fn set_speed(&self, speed: f32) -> Result<(), String> {
        self.send_and_wait_ok(AudioCommand::SetSpeed { speed })
    }

    pub fn set_mode(&self, mode: PlaybackMode) -> Result<(), String> {
        self.send_and_wait_ok(AudioCommand::SetMode { mode })
    }

    pub fn add_segment(&self, segment: ABSegment) -> Result<(), String> {
        self.send_and_wait_ok(AudioCommand::AddSegment { segment })
    }

    pub fn update_segment(&self, segment: ABSegment) -> Result<(), String> {
        self.send_and_wait_ok(AudioCommand::UpdateSegment { segment })
    }

    pub fn remove_segment(&self, id: String) -> Result<(), String> {
        self.send_and_wait_ok(AudioCommand::RemoveSegment { id })
    }

    pub fn set_active_segment(&self, id: Option<String>) -> Result<(), String> {
        self.send_and_wait_ok(AudioCommand::SetActiveSegment { id })
    }

    pub fn set_material_id(&self, id: Option<i64>) -> Result<(), String> {
        self.send_and_wait_ok(AudioCommand::SetMaterialId { id })
    }

    pub fn get_state(&self) -> PlaybackInfo {
        let _ = self.cmd_tx.send(AudioCommand::GetState);
        match self.resp_rx.lock().unwrap().recv() {
            Ok(AudioResponse::State(info)) => info,
            _ => PlaybackInfo {
                file_path: "".into(),
                file_name: "".into(),
                material_id: None,
                duration_secs: 0.0,
                position_secs: 0.0,
                is_playing: false,
                volume: 1.0,
                speed: 1.0,
                mode: PlaybackMode::Global,
                segments: vec![],
                active_segment_id: None,
                loop_remaining: None,
            },
        }
    }

    fn send_and_wait_ok(&self, cmd: AudioCommand) -> Result<(), String> {
        self.cmd_tx.send(cmd).map_err(|e| e.to_string())?;
        match self.resp_rx.lock().unwrap().recv().unwrap() {
            AudioResponse::Ok(res) => res,
            _ => Err("Unexpected response".into()),
        }
    }
}

impl Drop for AudioHandle {
    fn drop(&mut self) {
        let _ = self.cmd_tx.send(AudioCommand::Shutdown);
    }
}

// =============================================
// Audio Engine internal logic
// =============================================

struct AudioEngine {
    _stream: OutputStream,
    stream_handle: rodio::OutputStreamHandle,
    sink: Option<Sink>,
    current_file: Option<PathBuf>,
    material_id: Option<i64>,
    duration: Duration,
    volume: f32,
    speed: f32,
    speed_arc: Arc<AtomicU32>,

    // Anchor points for logical position calculation via Sonic
    anchor_logical_secs: f64,
    anchor_physical_secs: f64,

    // Multi-AB state
    mode: PlaybackMode,
    segments: Vec<ABSegment>,
    active_segment_id: Option<String>,
    loop_remaining: u32, // loops left for current segment
    last_seek_time: std::time::Instant,
}

fn audio_thread_main(cmd_rx: mpsc::Receiver<AudioCommand>, resp_tx: mpsc::Sender<AudioResponse>) {
    let (stream, handle) = match OutputStream::try_default() {
        Ok(pair) => pair,
        Err(e) => {
            eprintln!("Failed to create audio output: {}", e);
            return;
        }
    };

    let speed_arc = Arc::new(AtomicU32::new(1.0f32.to_bits()));

    let mut engine = AudioEngine {
        _stream: stream,
        stream_handle: handle,
        sink: None,
        current_file: None,
        material_id: None,
        duration: Duration::ZERO,
        volume: 1.0,
        speed: 1.0,
        speed_arc,
        anchor_logical_secs: 0.0,
        anchor_physical_secs: 0.0,
        mode: PlaybackMode::Global,
        segments: Vec::new(),
        active_segment_id: None,
        loop_remaining: 0,
        last_seek_time: std::time::Instant::now() - Duration::from_secs(1),
    };

    loop {
        match cmd_rx.try_recv() {
            Ok(AudioCommand::Load { path }) => {
                let result = engine.load(&path);
                let _ = resp_tx.send(AudioResponse::Loaded(result));
            }
            Ok(AudioCommand::Play) => {
                let result = engine.play();
                let _ = resp_tx.send(AudioResponse::Ok(result));
            }
            Ok(AudioCommand::Pause) => {
                let result = engine.pause();
                let _ = resp_tx.send(AudioResponse::Ok(result));
            }
            Ok(AudioCommand::Resume) => {
                let result = engine.resume();
                let _ = resp_tx.send(AudioResponse::Ok(result));
            }
            Ok(AudioCommand::Stop) => {
                let result = engine.stop();
                let _ = resp_tx.send(AudioResponse::Ok(result));
            }
            Ok(AudioCommand::Unload) => {
                let result = engine.unload();
                let _ = resp_tx.send(AudioResponse::Ok(result));
            }
            Ok(AudioCommand::Seek { position_secs }) => {
                let result = engine.seek(position_secs);
                let _ = resp_tx.send(AudioResponse::Ok(result));
            }
            Ok(AudioCommand::SetVolume { volume }) => {
                let result = engine.set_volume(volume);
                let _ = resp_tx.send(AudioResponse::Ok(result));
            }
            Ok(AudioCommand::SetSpeed { speed }) => {
                let result = engine.set_speed(speed);
                let _ = resp_tx.send(AudioResponse::Ok(result));
            }
            Ok(AudioCommand::SetMode { mode }) => {
                let result = engine.set_mode(mode);
                let _ = resp_tx.send(AudioResponse::Ok(result));
            }
            Ok(AudioCommand::AddSegment { segment }) => {
                let result = engine.add_segment(segment);
                let _ = resp_tx.send(AudioResponse::Ok(result));
            }
            Ok(AudioCommand::UpdateSegment { segment }) => {
                let result = engine.update_segment(segment);
                let _ = resp_tx.send(AudioResponse::Ok(result));
            }
            Ok(AudioCommand::RemoveSegment { id }) => {
                let result = engine.remove_segment(id);
                let _ = resp_tx.send(AudioResponse::Ok(result));
            }
            Ok(AudioCommand::SetActiveSegment { id }) => {
                let result = engine.set_active_segment(id);
                let _ = resp_tx.send(AudioResponse::Ok(result));
            }
            Ok(AudioCommand::SetMaterialId { id }) => {
                let result = engine.set_material_id(id);
                let _ = resp_tx.send(AudioResponse::Ok(result));
            }
            Ok(AudioCommand::GetState) => {
                let state = engine.get_state();
                let _ = resp_tx.send(AudioResponse::State(state));
            }
            Ok(AudioCommand::Shutdown) => {
                break;
            }
            Err(mpsc::TryRecvError::Empty) => {
                engine.check_ab_loop();
                thread::sleep(Duration::from_millis(20));
            }
            Err(mpsc::TryRecvError::Disconnected) => {
                break;
            }
        }
    }
}

impl AudioEngine {
    fn current_logical_position(&self) -> f64 {
        if let Some(ref sink) = self.sink {
            let current_physical = sink.get_pos().as_secs_f64();
            self.anchor_logical_secs
                + (current_physical - self.anchor_physical_secs) * (self.speed as f64)
        } else {
            0.0
        }
    }

    fn load(&mut self, path: &str) -> Result<PlaybackInfo, String> {
        let file_path = PathBuf::from(path);
        if !file_path.exists() {
            return Err(format!("File not found: {}", path));
        }

        self.stop_internal();
        self.segments.clear();
        self.active_segment_id = None;
        self.material_id = None; // Reset until updated via another command if needed
        self.anchor_logical_secs = 0.0;
        self.anchor_physical_secs = 0.0;
        self.mode = PlaybackMode::Global;
        self.loop_remaining = 0;

        let duration = Self::get_duration_symphonia(&file_path)?;
        self.duration = duration;
        self.current_file = Some(file_path.clone());

        let _file_name = file_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Unknown".to_string());

        Ok(self.get_state())
    }

    fn play(&mut self) -> Result<(), String> {
        let path = self.current_file.clone().ok_or("No audio file loaded")?;

        self.stop_internal();

        let sink = Sink::try_new(&self.stream_handle)
            .map_err(|e| format!("Failed to create audio sink: {}", e))?;

        let file = File::open(&path).map_err(|e| format!("Failed to open file: {}", e))?;
        let reader = BufReader::new(file);
        let decoder = Decoder::new(reader).map_err(|e| format!("Failed to decode audio: {}", e))?;

        // Convert to f32 to feed into SonicStretcher
        let float_source = decoder.convert_samples::<f32>();

        // Wrap with pitch-preserving time-stretcher
        let source = float_source.sonic_stretch(self.speed_arc.clone());

        sink.set_volume(self.volume);
        // Do NOT use sink.set_speed(self.speed). The SonicStretcher handles speed internally now!
        sink.append(source);

        self.sink = Some(sink);
        self.anchor_logical_secs = 0.0;
        self.anchor_physical_secs = 0.0;

        // If ListLoop or SingleLoop is active and we have a segment, prepare loop
        if self.mode != PlaybackMode::Global {
            if self.active_segment_id.is_none() && !self.segments.is_empty() {
                self.set_active_segment(Some(self.segments[0].id.clone()))?;
            } else if let Some(id) = self.active_segment_id.clone() {
                // Re-trigger seek to start of current segment on play if needed
                self.set_active_segment(Some(id))?;
            }
        }

        Ok(())
    }

    fn pause(&mut self) -> Result<(), String> {
        if let Some(ref sink) = self.sink {
            sink.pause();
            Ok(())
        } else {
            Err("No audio is playing".to_string())
        }
    }

    fn resume(&mut self) -> Result<(), String> {
        if let Some(ref sink) = self.sink {
            if sink.empty() {
                // If the sink finished, we need to re-initialize it to play again
                return self.play();
            }
            sink.play();
            Ok(())
        } else {
            // If no sink exists but we have a file, just start playing
            if self.current_file.is_some() {
                self.play()
            } else {
                Err("No audio is playing".to_string())
            }
        }
    }

    fn stop(&mut self) -> Result<(), String> {
        self.stop_internal();
        Ok(())
    }

    fn unload(&mut self) -> Result<(), String> {
        self.stop_internal();
        self.current_file = None;
        self.material_id = None;
        self.duration = Duration::ZERO;
        self.anchor_logical_secs = 0.0;
        self.anchor_physical_secs = 0.0;
        self.segments.clear();
        self.active_segment_id = None;
        self.loop_remaining = 0;
        self.mode = PlaybackMode::Global;
        Ok(())
    }

    fn stop_internal(&mut self) {
        if let Some(sink) = self.sink.take() {
            sink.stop();
        }
    }

    fn seek(&mut self, position_secs: f64) -> Result<(), String> {
        let target = Duration::from_secs_f64(position_secs);
        self.last_seek_time = std::time::Instant::now();

        if let Some(ref sink) = self.sink {
            sink.try_seek(target)
                .map_err(|e| format!("Seek failed: {}", e))?;
            
            // CRITICAL: Pull ACTUAL sink position after seek for physical anchor.
            // On some backends, sink.get_pos() might not reset to target immediately 
            // or might use an accumulated clock.
            self.anchor_physical_secs = sink.get_pos().as_secs_f64();
            self.anchor_logical_secs = position_secs;
            return Ok(());
        }

        self.play()?;
        if let Some(ref sink) = self.sink {
            sink.try_seek(target)
                .map_err(|e| format!("Seek failed: {}", e))?;
            self.anchor_physical_secs = sink.get_pos().as_secs_f64();
            self.anchor_logical_secs = position_secs;
        }
        Ok(())
    }

    fn set_volume(&mut self, volume: f32) -> Result<(), String> {
        let volume = volume.clamp(0.0, 1.0);
        self.volume = volume;
        if let Some(ref sink) = self.sink {
            sink.set_volume(volume);
        }
        Ok(())
    }

    fn set_speed(&mut self, speed: f32) -> Result<(), String> {
        let speed = speed.clamp(0.25, 3.0);
        if let Some(ref sink) = self.sink {
            let current_physical = sink.get_pos().as_secs_f64();
            let current_logical = self.anchor_logical_secs
                + (current_physical - self.anchor_physical_secs) * (self.speed as f64);
            self.anchor_logical_secs = current_logical;
            self.anchor_physical_secs = current_physical;
        }
        self.speed = speed;
        // Update the atomic value so the SonicStretcher picks it up on next poll
        self.speed_arc.store(speed.to_bits(), Ordering::Relaxed);
        Ok(())
    }

    fn set_mode(&mut self, mode: PlaybackMode) -> Result<(), String> {
        self.mode = mode;
        if self.mode == PlaybackMode::Global {
            self.active_segment_id = None;
            self.loop_remaining = 0;
        } else if self.active_segment_id.is_none() && !self.segments.is_empty() {
            self.set_active_segment(Some(self.segments[0].id.clone()))?;
        }
        Ok(())
    }

    fn add_segment(&mut self, segment: ABSegment) -> Result<(), String> {
        if segment.end_secs <= segment.start_secs {
            return Err("End time must be greater than start time".into());
        }
        
        // If segment with same ID exists, update it instead of adding a duplicate
        if let Some(idx) = self.segments.iter().position(|s| s.id == segment.id) {
            self.segments[idx] = segment.clone();
        } else {
            self.segments.push(segment.clone());
        }

        // Sort segments chronologically
        self.segments
            .sort_by(|a, b| a.start_secs.partial_cmp(&b.start_secs).unwrap());

        // Auto-select if it's the first one and mode is not Global
        if self.segments.len() == 1 && self.mode != PlaybackMode::Global {
            self.set_active_segment(Some(segment.id))?;
        }
        Ok(())
    }

    fn update_segment(&mut self, segment: ABSegment) -> Result<(), String> {
        if segment.end_secs <= segment.start_secs {
            return Err("End time must be greater than start time".into());
        }
        if let Some(idx) = self.segments.iter().position(|s| s.id == segment.id) {
            self.segments[idx] = segment.clone();
            self.segments
                .sort_by(|a, b| a.start_secs.partial_cmp(&b.start_secs).unwrap());

            // If we updated the active one, refresh loop counter
            if self.active_segment_id.as_deref() == Some(&segment.id) {
                self.loop_remaining = segment.loop_count;
            }
            Ok(())
        } else {
            Err("Segment not found".into())
        }
    }

    fn remove_segment(&mut self, id: String) -> Result<(), String> {
        self.segments.retain(|s| s.id != id);
        if self.active_segment_id.as_deref() == Some(&id) {
            self.active_segment_id = None;
            self.loop_remaining = 0;
            // Mode gets reset to global if list is empty
            if self.segments.is_empty() {
                self.mode = PlaybackMode::Global;
            } else if self.mode == PlaybackMode::ListLoop {
                self.set_active_segment(Some(self.segments[0].id.clone()))?;
            }
        }
        Ok(())
    }

    fn set_active_segment(&mut self, id: Option<String>) -> Result<(), String> {
        self.active_segment_id = id.clone();
        if let Some(id) = id {
            if let Some(seg) = self.segments.iter().find(|s| s.id == id) {
                self.loop_remaining = seg.loop_count;
                self.seek(seg.start_secs)?;

                // If we are in a looping mode and the engine was paused (e.g. at end of a previous loop),
                // auto-resume so the user actually hears the new segment.
                if self.mode != PlaybackMode::Global {
                    if let Some(ref sink) = self.sink {
                        if sink.is_paused() {
                            sink.play();
                        }
                    }
                }
            }
        }
        Ok(())
    }

    fn set_material_id(&mut self, id: Option<i64>) -> Result<(), String> {
        self.material_id = id;
        Ok(())
    }

    fn check_ab_loop(&mut self) {
        if self.mode == PlaybackMode::Global {
            return;
        }

        // 50ms grace period after a seek to let position/anchors stabilize
        if self.last_seek_time.elapsed() < Duration::from_millis(50) {
            return;
        }

        let pos = match self.sink.as_ref() {
            Some(sink) if !sink.is_paused() && !sink.empty() => self.current_logical_position(),
            _ => return,
        };

        if let Some(id) = &self.active_segment_id {
            if let Some(idx) = self.segments.iter().position(|s| s.id == *id) {
                let seg = &self.segments[idx];

                // If we passed the end of the segment
                if pos >= seg.end_secs {
                    let mut move_next = false;

                    if seg.loop_count > 0 {
                        if self.loop_remaining <= 1 {
                            // Finished required loops
                            self.loop_remaining = 0;
                            move_next = true;
                        } else {
                            // Repeat current
                            self.loop_remaining -= 1;
                            let _ = self.seek(seg.start_secs);
                        }
                    } else {
                        // Infinite loop
                        let _ = self.seek(seg.start_secs);
                    }

                    if move_next {
                        match self.mode {
                            PlaybackMode::SingleLoop => {
                                // Just pause at the end
                                if let Some(ref sink) = self.sink {
                                    sink.pause();
                                }
                            }
                            PlaybackMode::ListLoop => {
                                // Jump to next segment
                                let next_idx = idx + 1;
                                if next_idx < self.segments.len() {
                                    let next_id = self.segments[next_idx].id.clone();
                                    let _ = self.set_active_segment(Some(next_id));
                                } else {
                                    // Finished the entire list
                                    if let Some(ref sink) = self.sink {
                                        sink.pause();
                                    }
                                    // Reset to the first segment but leave it paused
                                    if !self.segments.is_empty() {
                                        let first_id = self.segments[0].id.clone();
                                        let _ = self.set_active_segment(Some(first_id));
                                        if let Some(ref sink) = self.sink {
                                            sink.pause();
                                        }
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
    }

    fn get_state(&self) -> PlaybackInfo {
        let is_playing = self
            .sink
            .as_ref()
            .map_or(false, |s| !s.is_paused() && !s.empty());
        let position_secs = self.current_logical_position();

        let file_name = self
            .current_file
            .as_ref()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let file_path = self
            .current_file
            .as_ref()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        let l_rem = if self.mode != PlaybackMode::Global && self.active_segment_id.is_some() {
            let seg = self
                .segments
                .iter()
                .find(|s| Some(&s.id) == self.active_segment_id.as_ref());
            if let Some(s) = seg {
                if s.loop_count == 0 {
                    None
                } else {
                    Some(self.loop_remaining)
                }
            } else {
                None
            }
        } else {
            None
        };

        PlaybackInfo {
            file_path,
            file_name,
            material_id: self.material_id, // include the tracked ID
            duration_secs: self.duration.as_secs_f64(),
            position_secs,
            is_playing,
            volume: self.volume,
            speed: self.speed,
            mode: self.mode.clone(),
            segments: self.segments.clone(),
            active_segment_id: self.active_segment_id.clone(),
            loop_remaining: l_rem,
        }
    }

    fn get_duration_symphonia(path: &PathBuf) -> Result<Duration, String> {

        let file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
        let mss = MediaSourceStream::new(Box::new(file), Default::default());

        let mut hint = Hint::new();
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            hint.with_extension(ext);
        }

        let probed = symphonia::default::get_probe()
            .format(
                &hint,
                mss,
                &FormatOptions::default(),
                &MetadataOptions::default(),
            )
            .map_err(|e| format!("Failed to probe audio: {}", e))?;

        let mut reader = probed.format;

        // Stage 1: Fast path — use metadata if n_frames is known
        let track_id;
        let codec_params;
        if let Some(track) = reader.default_track() {
            track_id = track.id;
            codec_params = track.codec_params.clone();
        } else if let Some(track) = reader.tracks().first() {
            track_id = track.id;
            codec_params = track.codec_params.clone();
        } else {
            return Ok(Duration::ZERO);
        }

        if let (Some(tb), Some(frames)) = (codec_params.time_base, codec_params.n_frames) {
            if frames > 0 {
                let time = tb.calc_time(frames);
                return Ok(Duration::from_secs_f64(time.seconds as f64 + time.frac));
            }
        }

        // Stage 2: Slow path — seek to end and read timestamp of last packet
        // Try seeking to a very large position to get the last timestamp
        let _ = reader.seek(
            SeekMode::Coarse,
            symphonia::core::formats::SeekTo::Time {
                time: symphonia::core::units::Time { seconds: u64::MAX / 2, frac: 0.0 },
                track_id: Some(track_id),
            },
        );

        let mut last_ts: u64 = 0;
        let mut last_tb = None;

        loop {
            match reader.next_packet() {
                Ok(packet) => {
                    if packet.track_id() == track_id && packet.dur > 0 {
                        let end_ts = packet.ts + packet.dur;
                        if end_ts > last_ts {
                            last_ts = end_ts;
                        }
                        last_tb = codec_params.time_base;
                    }
                }
                Err(symphonia::core::errors::Error::IoError(_)) | Err(symphonia::core::errors::Error::ResetRequired) => break,
                Err(_) => break,
            }
        }

        if last_ts > 0 {
            if let Some(tb) = last_tb {
                let time = tb.calc_time(last_ts);
                return Ok(Duration::from_secs_f64(time.seconds as f64 + time.frac));
            }
        }

        Ok(Duration::ZERO)
    }
}

