use rodio::cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rodio::cpal::{self, Sample, SampleFormat};
use std::sync::Mutex;
use std::path::PathBuf;
use hound::{WavSpec, WavWriter, SampleFormat as HoundSampleFormat};

pub struct AudioRecorderState {
    recording_path: Mutex<Option<PathBuf>>,
    // We signal the background stream-holder thread to stop using a simple channel
    stop_stream_tx: Mutex<Option<std::sync::mpsc::Sender<()>>>,
    // Signal back that the writer thread has finished flushing and finalizing the file
    finish_rx: Mutex<Option<std::sync::mpsc::Receiver<()>>>,
}

impl AudioRecorderState {
    pub fn new() -> Self {
        Self {
            recording_path: Mutex::new(None),
            stop_stream_tx: Mutex::new(None),
            finish_rx: Mutex::new(None),
        }
    }

    pub fn start_recording(&self, dest_path: PathBuf) -> Result<(), String> {
        self.stop_recording()?; // Ensure any existing stream is closed

        let (init_tx, init_rx) = std::sync::mpsc::channel::<Result<(), String>>();
        let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();
        let (finish_tx, finish_rx) = std::sync::mpsc::channel::<()>();

        *self.recording_path.lock().unwrap() = Some(dest_path.clone());
        *self.stop_stream_tx.lock().unwrap() = Some(stop_tx);
        *self.finish_rx.lock().unwrap() = Some(finish_rx);

        // Spawn a thread to handle hardware initialization and keep the stream alive.
        std::thread::spawn(move || {
            let host = cpal::default_host();
            let device = match host.default_input_device() {
                Some(d) => d,
                None => { let _ = init_tx.send(Err("No input device found".to_string())); return; }
            };

            let config = match device.default_input_config() {
                Ok(c) => c,
                Err(e) => { let _ = init_tx.send(Err(format!("Error getting config: {}", e))); return; }
            };

            let sample_rate = config.sample_rate().0;
            let channels = config.channels();

            let spec = WavSpec {
                channels,
                sample_rate,
                bits_per_sample: 16,
                sample_format: HoundSampleFormat::Int,
            };

            let mut writer = match WavWriter::create(&dest_path, spec) {
                Ok(w) => w,
                Err(e) => { let _ = init_tx.send(Err(format!("WavWriter error: {}", e))); return; }
            };

            let (sample_tx, sample_rx) = std::sync::mpsc::channel::<Vec<i16>>();
            let (writer_stop_tx, writer_stop_rx) = std::sync::mpsc::channel::<()>();

            // 1. Spawn Writer Thread (Safe because sample_rx is Send)
            std::thread::spawn(move || {
                println!("[RustRecorder] Writer thread started for: {:?}", dest_path);
                let mut is_stopping = false;
                let mut total_samples = 0;
                let mut batch_count = 0;

                loop {
                    if !is_stopping && writer_stop_rx.try_recv().is_ok() {
                        println!("[RustRecorder] Stop signal received, draining channel...");
                        is_stopping = true;
                    }
                    match sample_rx.recv_timeout(std::time::Duration::from_millis(100)) {
                        Ok(samples) => {
                            batch_count += 1;
                            for sample in samples {
                                if let Err(e) = writer.write_sample(sample) {
                                    eprintln!("[RustRecorder] Write error: {}", e);
                                }
                                total_samples += 1;
                            }
                            let _ = writer.flush();
                            if batch_count % 10 == 0 {
                                println!("[RustRecorder] Recorded {} samples", total_samples);
                            }
                        }
                        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                            if is_stopping { break; }
                        }
                        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => { break; }
                    }
                }
                match writer.finalize() {
                    Ok(_) => println!("[RustRecorder] Finalized. Samples: {}", total_samples),
                    Err(e) => eprintln!("[RustRecorder] Finalize error: {}", e),
                }
                // Signal that the file is completely closed and ready to be read
                let _ = finish_tx.send(());
            });

            // 2. Build Stream
            let err_fn = |err| eprintln!("Audio input stream error: {}", err);
            let stream_result = match config.sample_format() {
                SampleFormat::F32 => device.build_input_stream(
                    &config.into(),
                    move |data: &[f32], _| write_input_data(data, &sample_tx),
                    err_fn,
                    None,
                ),
                SampleFormat::I16 => device.build_input_stream(
                    &config.into(),
                    move |data: &[i16], _| write_input_data::<i16>(data, &sample_tx),
                    err_fn,
                    None,
                ),
                SampleFormat::U16 => device.build_input_stream(
                    &config.into(),
                    move |data: &[u16], _| write_input_data::<u16>(data, &sample_tx),
                    err_fn,
                    None,
                ),
                _ => { let _ = init_tx.send(Err("Unsupported sample format".to_string())); return; },
            };

            let stream = match stream_result {
                Ok(s) => s,
                Err(e) => { let _ = init_tx.send(Err(format!("Failed to build stream: {}", e))); return; }
            };

            // 3. Start Stream
            if let Err(e) = stream.play() {
                let _ = init_tx.send(Err(format!("Failed to start stream: {}", e)));
                return;
            }

            let _ = init_tx.send(Ok(()));

            // 4. Block until stop signal
            let _ = stop_rx.recv();
            let _ = writer_stop_tx.send(());
            
            // Keep the stream alive long enough for any final samples to flush? 
            // Actually, we keep it alive for a split second or until stop signal
        });

        init_rx.recv().map_err(|e| format!("Initialization thread died: {}", e))?
    }

    pub fn stop_recording(&self) -> Result<Option<PathBuf>, String> {
        // 1. Send stop signal to the holder thread
        if let Some(tx) = self.stop_stream_tx.lock().unwrap().take() {
            let _ = tx.send(());
        }
        
        // 2. WAIT for the writer thread to finish finalizing the WAV
        if let Some(rx) = self.finish_rx.lock().unwrap().take() {
            println!("[RustRecorder] Waiting for writer to finalize...");
            let _ = rx.recv_timeout(std::time::Duration::from_secs(2));
        }

        let path = self.recording_path.lock().unwrap().take();
        Ok(path)
    }
}


fn write_input_data<T>(input: &[T], tx: &std::sync::mpsc::Sender<Vec<i16>>)
where
    T: Sample,
    i16: rodio::cpal::FromSample<T>,
{
    let i16_samples: Vec<i16> = input.iter().map(|&s| i16::from_sample(s)).collect();
    let _ = tx.send(i16_samples);
}

