use rodio::Source;
use std::os::raw::{c_float, c_int};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

// Opaque struct for pointers
#[repr(C)]
pub struct sonicStreamStruct {
    _private: [u8; 0], // Keep the opaque struct definition as is
}
pub type SonicStream = *mut sonicStreamStruct; // Renamed sonicStream to SonicStream

extern "C" {
    // Create a sonic stream
    pub fn sonicCreateStream(sampleRate: c_int, numChannels: c_int) -> SonicStream;

    // Destroy a sonic stream
    pub fn sonicDestroyStream(stream: SonicStream);

    // Write float samples to the stream
    pub fn sonicWriteFloatToStream(
        stream: SonicStream,
        samples: *const c_float,
        numSamples: c_int,
    ) -> c_int;

    // Read float samples from the stream
    pub fn sonicReadFloatFromStream(
        stream: SonicStream,
        samples: *mut c_float,
        maxSamples: c_int,
    ) -> c_int;

    // Flush the stream (forces all data out)
    pub fn sonicFlushStream(stream: SonicStream) -> c_int;

    // Set speed (1.0 = normal, 2.0 = double, 0.5 = half)
    pub fn sonicSetSpeed(stream: SonicStream, speed: c_float);

    // Set pitch (1.0 = normal, 2.0 = double, 0.5 = half)
    pub fn sonicSetPitch(stream: SonicStream, pitch: c_float);

    // Set rate (1.0 = normal, 2.0 = double, 0.5 = half)
    pub fn sonicSetRate(stream: SonicStream, rate: c_float);

    // Return the number of samples in the output buffer
    pub fn sonicSamplesAvailable(stream: SonicStream) -> c_int;
}

pub struct SonicWrapper {
    stream: SonicStream, // Renamed sonicStream to SonicStream
    channels: usize,
}

// Sonic stream pointer doesn't share state, so it's Send.
unsafe impl Send for SonicWrapper {}

impl SonicWrapper {
    pub fn new(sample_rate: u32, channels: u16) -> Self {
        let stream = unsafe { sonicCreateStream(sample_rate as c_int, channels as c_int) };
        assert!(!stream.is_null(), "sonicCreateStream failed");
        Self {
            stream,
            channels: channels as usize,
        }
    }

    pub fn set_speed(&mut self, speed: f32) {
        unsafe { sonicSetSpeed(self.stream, speed as c_float) }
    }

    /// Writes frames to sonic. `samples` length must be a multiple of channels.
    pub fn write_float(&mut self, samples: &[f32]) -> bool {
        let frames = (samples.len() / self.channels) as c_int;
        if frames == 0 {
            return true;
        }
        let res = unsafe {
            sonicWriteFloatToStream(self.stream, samples.as_ptr() as *const c_float, frames)
        };
        res == 1
    }

    /// Reads output frames into `out`. `out` length must be a multiple of channels.
    /// Returns the number of frames actually read.
    pub fn read_float(&mut self, out: &mut [f32]) -> usize {
        let max_frames = (out.len() / self.channels) as c_int;
        if max_frames == 0 {
            return 0;
        }
        let frames_read = unsafe {
            sonicReadFloatFromStream(self.stream, out.as_mut_ptr() as *mut c_float, max_frames)
        };
        frames_read as usize
    }

    pub fn flush(&mut self) {
        unsafe { sonicFlushStream(self.stream) };
    }

    pub fn available_frames(&self) -> usize {
        unsafe { sonicSamplesAvailable(self.stream) as usize }
    }
}

impl Drop for SonicWrapper {
    fn drop(&mut self) {
        unsafe { sonicDestroyStream(self.stream) }
    }
}

/// A `rodio::Source` that wraps another Source and applies time-stretching (speed) without pitch shifting.
pub struct SonicStretcher<S: Source<Item = f32>> {
    inner: S,
    sonic: SonicWrapper,
    buffer: Vec<f32>,
    out_buffer: Vec<f32>,
    out_index: usize,
    finished: bool,
    speed_arc: Arc<AtomicU32>,
    last_speed: f32,
    channels: u16,
    sample_rate: u32,
}

impl<S: Source<Item = f32>> SonicStretcher<S> {
    pub fn new(inner: S, speed_arc: Arc<AtomicU32>) -> Self {
        let channels = inner.channels();
        let sample_rate = inner.sample_rate();

        let initial_speed = f32::from_bits(speed_arc.load(Ordering::Relaxed));
        let mut sonic = SonicWrapper::new(sample_rate, channels);
        sonic.set_speed(initial_speed);

        Self {
            inner,
            sonic,
            buffer: Vec::with_capacity(1024 * channels as usize),
            out_buffer: vec![0.0; 1024 * channels as usize],
            out_index: 0,
            finished: false,
            speed_arc,
            last_speed: initial_speed,
            channels,
            sample_rate,
        }
    }
}

impl<S: Source<Item = f32>> Iterator for SonicStretcher<S> {
    type Item = f32;

    fn next(&mut self) -> Option<Self::Item> {
        // Check for speed updates
        let current_speed = f32::from_bits(self.speed_arc.load(Ordering::Relaxed));
        if (current_speed - self.last_speed).abs() > 0.001 {
            self.last_speed = current_speed;
            self.sonic.set_speed(current_speed);
        }

        loop {
            // Check if we have processed data ready to yield
            if self.out_index < self.out_buffer.len() {
                let sample = self.out_buffer[self.out_index];
                self.out_index += 1;
                return Some(sample);
            }

            if self.finished {
                // Read any remaining flushed data
                let frames = self.sonic.read_float(&mut self.out_buffer);
                if frames == 0 {
                    return None;
                }
                self.out_buffer.truncate(frames * self.channels as usize);
                self.out_index = 0;
                continue;
            }

            // Need more input data
            self.buffer.clear();
            for _ in 0..(1024 * self.channels as usize) {
                if let Some(sample) = self.inner.next() {
                    self.buffer.push(sample);
                } else {
                    self.finished = true;
                    self.sonic.flush();
                    break;
                }
            }

            if !self.buffer.is_empty() {
                self.sonic.write_float(&self.buffer);
            }

            // Read output data
            self.out_buffer.resize(1024 * self.channels as usize, 0.0);
            let frames = self.sonic.read_float(&mut self.out_buffer);
            if frames > 0 {
                self.out_buffer.truncate(frames * self.channels as usize);
                self.out_index = 0;
            } else {
                self.out_buffer.clear();
            }
        }
    }
}

impl<S: Source<Item = f32>> Source for SonicStretcher<S> {
    fn current_frame_len(&self) -> Option<usize> {
        None
    }

    fn channels(&self) -> u16 {
        self.channels
    }

    fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    fn total_duration(&self) -> Option<std::time::Duration> {
        self.inner.total_duration().map(|d| {
            let spd = f32::from_bits(self.speed_arc.load(Ordering::Relaxed));
            if spd > 0.0 {
                std::time::Duration::from_secs_f64(d.as_secs_f64() / spd as f64)
            } else {
                d
            }
        })
    }

    fn try_seek(&mut self, pos: std::time::Duration) -> Result<(), rodio::source::SeekError> {
        self.inner.try_seek(pos)?;
        // Recreate SonicWrapper to completely clear its internal DSP buffers and state
        let current_speed = f32::from_bits(self.speed_arc.load(Ordering::Relaxed));
        self.sonic = SonicWrapper::new(self.sample_rate, self.channels);
        self.sonic.set_speed(current_speed);

        self.buffer.clear();
        self.out_buffer.clear();
        self.out_index = 0;
        self.finished = false;
        Ok(())
    }
}

pub trait SonicStretcherExt: Source<Item = f32> + Sized {
    fn sonic_stretch(self, speed_arc: Arc<AtomicU32>) -> SonicStretcher<Self>;
}

impl<S: Source<Item = f32>> SonicStretcherExt for S {
    fn sonic_stretch(self, speed_arc: Arc<AtomicU32>) -> SonicStretcher<Self> {
        SonicStretcher::new(self, speed_arc)
    }
}
