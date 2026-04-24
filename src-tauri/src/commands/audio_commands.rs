use crate::audio::engine::{ABSegment, PlaybackInfo, PlaybackMode};
use crate::audio::AudioState;
use std::io::Write;
use tauri::State;

#[tauri::command]
pub fn load_audio(
    app: tauri::AppHandle,
    path: String,
    state: State<'_, AudioState>,
) -> Result<PlaybackInfo, String> {
    let resolved_path = crate::utils::path_utils::resolve_internal_path(&app, &path);
    state.handle.load(&resolved_path)
}

#[tauri::command]
pub fn play(state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.play()
}

#[tauri::command]
pub fn pause(state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.pause()
}

#[tauri::command]
pub fn resume(state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.resume()
}

#[tauri::command]
pub fn stop(state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.stop()
}

#[tauri::command]
pub fn unload_audio(state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.unload()
}

#[tauri::command]
pub fn seek(position_secs: f64, state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.seek(position_secs)
}

#[tauri::command]
pub fn set_volume(volume: f32, state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.set_volume(volume)
}

#[tauri::command]
pub fn set_speed(speed: f32, state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.set_speed(speed)
}

#[tauri::command]
pub fn set_mode(mode: PlaybackMode, state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.set_mode(mode)
}

#[tauri::command]
pub fn add_segment(segment: ABSegment, state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.add_segment(segment)
}

#[tauri::command]
pub fn update_segment(segment: ABSegment, state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.update_segment(segment)
}

#[tauri::command]
pub fn set_material_id(id: Option<i64>, state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.set_material_id(id)
}

#[tauri::command]
pub fn remove_segment(id: String, state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.remove_segment(id)
}

#[tauri::command]
pub fn set_active_segment(id: Option<String>, state: State<'_, AudioState>) -> Result<(), String> {
    state.handle.set_active_segment(id)
}

#[tauri::command]
pub fn get_playback_state(state: State<'_, AudioState>) -> PlaybackInfo {
    state.handle.get_state()
}

/// Accepts raw WAV bytes from the frontend recorder, writes them to a timestamped temp file,
/// Using a unique filename per recording ensures the transcription cache is not stale.
#[tauri::command]
pub fn save_temp_audio(app: tauri::AppHandle, bytes: Vec<u8>) -> Result<String, String> {
    use tauri::Manager;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    
    // Use a managed folder in AppData/LocalData instead of system temp
    #[cfg(target_os = "ios")]
    let app_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;

    #[cfg(target_os = "android")]
    let app_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;

    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    let temp_dir = app_dir.join("temp_recordings");
    println!("[save_temp_audio] app_dir = {:?}", app_dir);
    println!("[save_temp_audio] temp_dir = {:?}", temp_dir);
    let _ = std::fs::create_dir_all(&temp_dir);

    // Delete any previous recording files to avoid filling up disk
    if let Ok(entries) = std::fs::read_dir(&temp_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let n = name.to_string_lossy();
            if n.starts_with("ting_rec_") && n.ends_with(".wav") {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
    
    let path = temp_dir.join(format!("ting_rec_{}.wav", ts));
    println!("[save_temp_audio] writing to = {:?}", path);
    let mut file =
        std::fs::File::create(&path).map_err(|e| format!("Failed to create recording file at {:?}: {}", path, e))?;
    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write recording file at {:?}: {}", path, e))?;
    
    let relative = format!("temp_recordings/ting_rec_{}.wav", ts);
    println!("[save_temp_audio] returning relative path = {}", relative);
    Ok(relative)
}

/// Saves the WAV recording to a user-specified location using a native Save dialog.
#[tauri::command]
pub async fn save_recording_as(app: tauri::AppHandle, source_path: String) -> Result<(), String> {
    use tauri_plugin_dialog::DialogExt;

    let clean_src = source_path.trim_start_matches("file://");
    let src = std::path::Path::new(clean_src);
    println!("[save_recording_as] source_path (raw) = {}", source_path);
    println!("[save_recording_as] clean_src = {}", clean_src);
    println!("[save_recording_as] src.exists() = {}", src.exists());
    if !src.exists() {
        return Err(format!("Source file not found at: '{}'", clean_src));
    }

    let path = app
        .dialog()
        .file()
        .add_filter("WAV Audio", &["wav"])
        .set_file_name("ting_recording.wav")
        .blocking_save_file();

    if let Some(fp) = path {
        println!("[save_recording_as] dialog returned path = {}", fp.to_string());

        #[cfg(target_os = "android")]
        {
            let dest_uri = fp.to_string();
            println!("[save_recording_as] Android: writing to uri = {}", dest_uri);
            save_to_android_content(&app, clean_src, &dest_uri)
                .map_err(|e| format!("Android save error (src='{}' dest='{}'): {}", clean_src, dest_uri, e))?;
        }

        #[cfg(target_os = "ios")]
        {
            let dest_path = fp.to_string();
            println!("[save_recording_as] iOS: writing to path = {}", dest_path);
            save_to_ios_file(clean_src, &dest_path)
                .map_err(|e| format!("iOS save error (src='{}' dest='{}'): {}", clean_src, dest_path, e))?;
        }

        #[cfg(not(any(target_os = "android", target_os = "ios")))]
        {
            let dest = fp.as_path().ok_or("Invalid path")?;
            println!("[save_recording_as] Desktop: copying to = {:?}", dest);
            std::fs::copy(src, dest).map_err(|e| format!("Failed to copy file (src='{}' dest='{:?}'): {}", clean_src, dest, e))?;
        }
    } else {
        println!("[save_recording_as] user cancelled the dialog");
    }
    Ok(())
}

#[cfg(target_os = "android")]
fn save_to_android_content(
    _app: &tauri::AppHandle,
    source_path: &str,
    dest_uri: &str,
) -> Result<(), String> {
    use jni::objects::{JValue, JObject, JString};
    use std::io::{Read, Write};

    // 1. Get Android Context via ndk-context 
    let ctx = ndk_context::android_context();
    let vm_ptr = ctx.vm();
    let activity_ptr = ctx.context();

    if vm_ptr.is_null() || activity_ptr.is_null() {
        return Err("Android VM or Context not found".to_string());
    }

    let vm = unsafe { jni::JavaVM::from_raw(vm_ptr as *mut _) }.map_err(|e| e.to_string())?;
    let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;
    let activity = unsafe { JObject::from_raw(activity_ptr as jni::sys::jobject) };

    // 2. Parse Destination URI
    let uri_class = env.find_class("android/net/Uri").map_err(|e| e.to_string())?;
    let dest_uri_jstr: JString = env.new_string(dest_uri).map_err(|e| e.to_string())?;
    let uri_obj = env.call_static_method(
        uri_class,
        "parse",
        "(Ljava/lang/String;)Landroid/net/Uri;",
        &[JValue::from(&dest_uri_jstr)],
    ).map_err(|e| e.to_string())?.l().map_err(|e| e.to_string())?;

    // 3. Get ContentResolver
    let resolver = env.call_method(
        &activity,
        "getContentResolver",
        "()Landroid/content/ContentResolver;",
        &[],
    ).map_err(|e| e.to_string())?.l().map_err(|e| e.to_string())?;

    // 4. Open OutputStream
    let w_str = env.new_string("w").map_err(|e| e.to_string())?;
    let output_stream = env.call_method(
        &resolver,
        "openOutputStream",
        "(Landroid/net/Uri;Ljava/lang/String;)Ljava/io/OutputStream;",
        &[JValue::from(&uri_obj), JValue::from(&w_str)],
    ).map_err(|e| e.to_string())?.l().map_err(|e| e.to_string())?;

    // 5. Stream local file to the Android OutputStream
    let mut source_file = std::fs::File::open(source_path).map_err(|e| e.to_string())?;
    let mut buffer = [0u8; 128 * 1024]; // 128KB buffer
    
    loop {
        let n = source_file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 { break; }

        // Convert slice to jni byte array
        let j_buffer = env.new_byte_array(n as i32).map_err(|e| e.to_string())?;
        
        // JNI byte arrays are i8, but we have u8. unsafe cast or loop.
        let i8_buffer: &[i8] = unsafe { std::slice::from_raw_parts(buffer.as_ptr() as *const i8, n) };
        env.set_byte_array_region(&j_buffer, 0, i8_buffer).map_err(|e| e.to_string())?;

        // call outputStream.write(byte[] b, int off, int len)
        env.call_method(
            &output_stream,
            "write",
            "([B)V",
            &[JValue::from(&j_buffer)],
        ).map_err(|e| e.to_string())?;
    }

    // 6. Close stream
    let _ = env.call_method(&output_stream, "close", "()V", &[]);

    Ok(())
}

#[cfg(target_os = "ios")]
fn save_to_ios_file(source_path: &str, dest_path: &str) -> Result<(), String> {
    use objc::{msg_send, sel, sel_impl, class};
    use std::fs;
    use std::ffi::CString;

    unsafe {
        // 1. Clean source path only (strip file:// for filesystem access)
        let clean_source = source_path.trim_start_matches("file://");

        // 2. Read source file data
        let file_data = fs::read(clean_source)
            .map_err(|e| format!("Failed to read source file '{}': {}", clean_source, e))?;

        let ns_string_class = class!(NSString);
        let ns_url_class = class!(NSURL);

        // 3. Create NSURL from the destination.
        // CRITICAL FIX: The file picker on iOS returns a URL string (file:///path/File%20Provider%20Storage/...)
        // with URL encoding (%20, %E6%88%91 etc).
        // - fileURLWithPath: treats the string as a raw filesystem path → WRONG, % chars are not decoded
        // - URLWithString:   correctly parses the full file:// URL → CORRECT
        let dest_url: *mut objc::runtime::Object = if dest_path.starts_with("file://") {
            // Already a proper file URL — use URLWithString: to preserve URL decoding
            let url_cstr = CString::new(dest_path).map_err(|_| "Invalid destination URL string")?;
            let url_nsstr: *mut objc::runtime::Object = msg_send![ns_string_class, stringWithUTF8String: url_cstr.as_ptr()];
            msg_send![ns_url_class, URLWithString: url_nsstr]
        } else {
            // Plain filesystem path — use fileURLWithPath:
            let path_cstr = CString::new(dest_path).map_err(|_| "Invalid destination path")?;
            let path_nsstr: *mut objc::runtime::Object = msg_send![ns_string_class, stringWithUTF8String: path_cstr.as_ptr()];
            msg_send![ns_url_class, fileURLWithPath: path_nsstr]
        };

        if dest_url.is_null() {
            return Err(format!("Failed to create NSURL from destination: '{}'", dest_path));
        }

        // 4. Try to access security-scoped resource (required for Files app / AppGroup paths)
        let _: bool = msg_send![dest_url, startAccessingSecurityScopedResource];

        // 5. Write using NSData (supports both sandboxed and security-scoped locations)
        let data: *mut objc::runtime::Object = msg_send![class!(NSData),
            dataWithBytes: file_data.as_ptr()
            length: file_data.len()
        ];

        let success: bool = msg_send![data, writeToURL: dest_url atomically: true];

        // 6. Always stop accessing
        let _: () = msg_send![dest_url, stopAccessingSecurityScopedResource];

        if success {
            Ok(())
        } else {
            Err(format!("NSData writeToURL failed for dest='{}'", dest_path))
        }
    }
}

/// Moves a recording from the volatile temp directory to the persistent audio archive.
/// Returns the new stable path (containing the "audio_archive" marker).
#[tauri::command]
pub async fn archive_recording(app: tauri::AppHandle, temp_path: String) -> Result<String, String> {
    use tauri::Manager;

    // 1. Resolve Root Dir
    #[cfg(target_os = "ios")]
    let app_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    
    #[cfg(target_os = "android")]
    let app_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;

    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    
    println!("[archive_recording] temp_path (raw) = {}", temp_path);
    println!("[archive_recording] app_dir = {:?}", app_dir);

    let archive_dir = app_dir.join("audio_archive").join("recordings");
    println!("[archive_recording] archive_dir = {:?}", archive_dir);
    if let Err(e) = std::fs::create_dir_all(&archive_dir) {
        println!("[archive_recording] create_dir_all error: {}", e);
    }

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    
    let filename = format!("rec_{}.wav", ts);
    let dest_path = archive_dir.join(&filename);
    println!("[archive_recording] dest_path = {:?}", dest_path);

    // 2. Resolve Input Path intelligently
    let clean_path = temp_path.trim_start_matches("file://");
    let src_path = if clean_path.starts_with('/') || clean_path.contains(':') {
        println!("[archive_recording] path type = ABSOLUTE");
        std::path::PathBuf::from(clean_path)
    } else {
        println!("[archive_recording] path type = RELATIVE, joining with app_dir");
        app_dir.join(clean_path)
    };
    println!("[archive_recording] resolved src_path = {:?}", src_path);
    println!("[archive_recording] src_path.exists() = {}", src_path.exists());

    if !src_path.exists() {
        return Err(format!("Source temp file does not exist at: '{:?}'", src_path));
    }

    // 3. Perform Copy
    std::fs::copy(&src_path, &dest_path)
        .map_err(|e| format!("Failed to archive recording (src='{:?}' dest='{:?}'): {}", src_path, dest_path, e))?;
    
    let result = format!("audio_archive/recordings/{}", filename);
    println!("[archive_recording] success, returning = {}", result);
    Ok(result)
}

#[tauri::command]
pub fn restart_segment(state: tauri::State<'_, AudioState>) -> Result<(), String> {
    let info = state.handle.get_state();
    if let Some(id) = &info.active_segment_id {
        if let Some(seg) = info.segments.iter().find(|s| &s.id == id) {
            let _ = state.handle.seek(seg.start_secs);
            return Ok(());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn configure_play_and_record() -> Result<(), String> {
    #[cfg(target_os = "ios")]
    {
        use objc::{msg_send, sel, sel_impl, class};
        unsafe {
            let session: *mut objc::runtime::Object = msg_send![class!(AVAudioSession), sharedInstance];
            if session.is_null() {
                return Ok(());
            }
            let str_class = class!(NSString);
            let category_str = "AVAudioSessionCategoryPlayAndRecord\0";
            let category: *mut objc::runtime::Object = msg_send![str_class, stringWithUTF8String: category_str.as_ptr()];

            if !category.is_null() {
                // Options: Mix(1) | BT(4) | Speaker(8) | BT_A2DP(32) | AirPlay(64) = 109 -> 0x6D
                let options: usize = 0x6D;
                let _: () = msg_send![session, setCategory:category withOptions:options error:0];
                let _: () = msg_send![session, setActive:1 error:0];
            }
        }
        Ok(())
    }
    #[cfg(not(target_os = "ios"))]
    Ok(())
}

#[tauri::command]
pub fn configure_playback() -> Result<(), String> {
    #[cfg(target_os = "ios")]
    {
        use objc::{msg_send, sel, sel_impl, class};
        unsafe {
            let session: *mut objc::runtime::Object = msg_send![class!(AVAudioSession), sharedInstance];
            if session.is_null() {
                return Ok(());
            }
            let str_class = class!(NSString);
            let category_str = "AVAudioSessionCategoryPlayback\0";
            let category: *mut objc::runtime::Object = msg_send![str_class, stringWithUTF8String: category_str.as_ptr()];

            if !category.is_null() {
                // Options: 1 (Mix) | 8 (DefaultToSpeaker) = 9 -> 0x9
                let options: usize = 0x1;
                let _: () = msg_send![session, setCategory:category withOptions:options error:0];
                let _: () = msg_send![session, setActive:1 error:0];
            }
        }
        Ok(())
    }
    #[cfg(not(target_os = "ios"))]
    Ok(())
}

#[tauri::command]
pub fn reinit_audio_output(state: tauri::State<'_, crate::audio::AudioState>) -> Result<(), String> {
    state.handle.reinit_output()
}

// ---------------------------------------------
// Native Recording Commands
// ---------------------------------------------
use crate::audio::recorder::AudioRecorderState;

#[tauri::command]
pub fn start_native_recording(
    app: tauri::AppHandle,
    recorder: tauri::State<'_, AudioRecorderState>,
) -> Result<(), String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    use tauri::Manager;
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let temp_dir = app.path().app_local_data_dir()
        .map_err(|_| "Failed to resolve app local data dir".to_string())?;
    
    let path = temp_dir.join(format!("native_recording_{}.wav", ts));
    
    // Explicitly configure play and record mode on iOS
    #[cfg(target_os = "ios")]
    let _ = configure_play_and_record();

    recorder.start_recording(path)
}

#[tauri::command]
pub fn stop_native_recording(
    recorder: tauri::State<'_, AudioRecorderState>,
) -> Result<String, String> {
    let path = recorder.stop_recording()?
        .ok_or_else(|| "No active recording found".to_string())?;
    
    Ok(path.to_string_lossy().to_string())
}
