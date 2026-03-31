use std::io::Write;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn copy_file_with_progress(
    app: AppHandle,
    source_path: String,
    dest_path: String,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return copy_android_content(&app, &source_path, &dest_path).await;
    }

    #[cfg(not(target_os = "android"))]
    {
        use std::fs::File;
        use std::io::Read;
        use percent_encoding::percent_decode_str;

        // Standard File IO for Windows/iPhone/Mac
        let decoded_path = percent_decode_str(&source_path).decode_utf8_lossy();
        let clean_source = decoded_path.trim_start_matches("file://");

        let mut source = File::open(clean_source).map_err(|e| {
            format!("Failed to open source [{}]: {}", clean_source, e)
        })?;
        let mut dest = File::create(&dest_path).map_err(|e| e.to_string())?;

        let total_size = source.metadata().map_err(|e| e.to_string())?.len();
        let mut buffer = [0; 64 * 1024]; // 64KB buffer
        let mut copied_size = 0;

        loop {
            let n = source.read(&mut buffer).map_err(|e| e.to_string())?;
            if n == 0 { break; }
            dest.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
            copied_size += n as u64;

            if total_size > 0 {
                let percentage = (copied_size as f64 / total_size as f64 * 100.0) as u32;
                let _ = app.emit("copy-progress", percentage);
            }
        }
        Ok(())
    }
}

#[cfg(target_os = "android")]
async fn copy_android_content(
    app: &AppHandle,
    source_uri: &str,
    dest_path: &str,
) -> Result<(), String> {
    use std::fs::File;
    use jni::objects::JValue;
    use jni::objects::JString;
    use jni::objects::JObject;

    // 1. Get Android Context via ndk-context 
    let ctx = ndk_context::android_context();
    let vm_ptr = ctx.vm();
    let activity_ptr = ctx.context();

    if vm_ptr.is_null() || activity_ptr.is_null() {
        return Err("Android VM or Context not found".to_string());
    }

    let vm = unsafe { jni::JavaVM::from_raw(vm_ptr as *mut _) }.map_err(|e: jni::errors::Error| e.to_string())?;
    let mut env = vm.attach_current_thread().map_err(|e: jni::errors::Error| e.to_string())?;
    let activity = unsafe { JObject::from_raw(activity_ptr as jni::sys::jobject) };

    // 2. Parse URI
    let uri_class = env.find_class("android/net/Uri").map_err(|e: jni::errors::Error| e.to_string())?;
    let source_uri_jstr: JString = env.new_string(source_uri).map_err(|e: jni::errors::Error| e.to_string())?;
    
    let uri_obj = env.call_static_method(
        uri_class,
        "parse",
        "(Ljava/lang/String;)Landroid/net/Uri;",
        &[JValue::from(&source_uri_jstr)],
    ).map_err(|e: jni::errors::Error| e.to_string())?.l().map_err(|e: jni::errors::Error| e.to_string())?;

    // 3. Get ContentResolver
    let resolver = env.call_method(
        &activity,
        "getContentResolver",
        "()Landroid/content/ContentResolver;",
        &[],
    ).map_err(|e: jni::errors::Error| e.to_string())?.l().map_err(|e: jni::errors::Error| e.to_string())?;

    // 4. Open InputStream
    let input_stream = env.call_method(
        &resolver,
        "openInputStream",
        "(Landroid/net/Uri;)Ljava/io/InputStream;",
        &[JValue::from(&uri_obj)],
    ).map_err(|e: jni::errors::Error| e.to_string())?.l().map_err(|e: jni::errors::Error| e.to_string())?;

    // 5. Get File Size (Optional)
    let mut total_size: i64 = -1;
    let r_str = env.new_string("r").map_err(|e: jni::errors::Error| e.to_string())?;
    if let Ok(pfd_val) = env.call_method(
        &resolver,
        "openAssetFileDescriptor",
        "(Landroid/net/Uri;Ljava/lang/String;)Landroid/content/res/AssetFileDescriptor;",
        &[JValue::from(&uri_obj), JValue::from(&r_str)],
    ) {
        if let Ok(pfd_obj) = pfd_val.l() {
            if let Ok(len_val) = env.call_method(&pfd_obj, "getLength", "()J", &[]) {
                total_size = len_val.j().unwrap_or(-1);
            }
            let _ = env.call_method(&pfd_obj, "close", "()V", &[]);
        }
    }

    // 6. Prepare destination file
    let mut dest = File::create(dest_path).map_err(|e| e.to_string())?;

    // 7. Read/Write Loop
    let mut buffer = [0u8; 64 * 1024]; 
    let j_buffer = env.new_byte_array(64 * 1024).map_err(|e: jni::errors::Error| e.to_string())?;
    let mut copied_size = 0i64;

    loop {
        let read_count_val = env.call_method(
            &input_stream,
            "read",
            "([B)I",
            &[JValue::from(&j_buffer)],
        ).map_err(|e: jni::errors::Error| e.to_string())?;
        
        let read_count = read_count_val.i().map_err(|e: jni::errors::Error| e.to_string())?;
        if read_count <= 0 { break; }

        let mut i8_buffer = [0i8; 64 * 1024];
        env.get_byte_array_region(&j_buffer, 0, &mut i8_buffer[..read_count as usize])
            .map_err(|e: jni::errors::Error| e.to_string())?;

        for i in 0..(read_count as usize) {
            buffer[i] = i8_buffer[i] as u8;
        }

        dest.write_all(&buffer[..read_count as usize]).map_err(|e| e.to_string())?;
        copied_size += read_count as i64;

        if total_size > 0 {
            let percentage = (copied_size as f64 / total_size as f64 * 100.0) as u32;
            let _ = app.emit("copy-progress", percentage);
        }
    }

    let _ = env.call_method(input_stream, "close", "()V", &[]);
    Ok(())
}
