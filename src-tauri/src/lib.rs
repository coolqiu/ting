pub mod ai;
pub mod audio;
pub mod commands;
pub mod db;
pub mod session;
pub mod utils;

use commands::ai_commands;
use commands::audio_commands;
use commands::auth_commands;
use commands::download_commands;
use commands::progress_commands;
use commands::pronunciation_commands;
use commands::settings_commands;
use commands::speaking_commands;
use commands::study_commands;
use commands::system_commands;
use commands::file_commands;
use std::sync::Mutex as StdMutex;
use tauri::Manager;
use tokio::sync::Mutex as AsyncMutex;

use std::os::raw::{c_char, c_int, c_long, c_longlong, c_ulonglong};

#[no_mangle]
pub static mut __libc_single_threaded: i8 = 0;

extern "C" {
    fn strtol(nptr: *const c_char, endptr: *mut *mut c_char, base: c_int) -> c_long;
    fn strtoll(nptr: *const c_char, endptr: *mut *mut c_char, base: c_int) -> c_longlong;
    fn strtoull(nptr: *const c_char, endptr: *mut *mut c_char, base: c_int) -> c_ulonglong;
}

#[no_mangle]
pub unsafe extern "C" fn __isoc23_strtol(nptr: *const c_char, endptr: *mut *mut c_char, base: c_int) -> c_long {
    strtol(nptr, endptr, base)
}

#[no_mangle]
pub unsafe extern "C" fn __isoc23_strtoll(nptr: *const c_char, endptr: *mut *mut c_char, base: c_int) -> c_longlong {
    strtoll(nptr, endptr, base)
}

#[no_mangle]
pub unsafe extern "C" fn __isoc23_strtoull(nptr: *const c_char, endptr: *mut *mut c_char, base: c_int) -> c_ulonglong {
    strtoull(nptr, endptr, base)
}

// ABI Shims have been moved to android_abi_fix.cpp for a more systemic solution.




pub struct TranscriptionState {


    pub lock: AsyncMutex<()>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
                use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};

                let show_i = MenuItem::with_id(app, "show", "Show Ting", true, None::<&str>).unwrap();
                let quit_i = MenuItem::with_id(app, "quit", "Quit Ting", true, None::<&str>).unwrap();
                let separator = PredefinedMenuItem::separator(app).unwrap();
                let menu = Menu::with_items(app, &[&show_i, &separator, &quit_i]).unwrap();

                let _tray = TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .tooltip("Ting")
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "quit" => app.exit(0),
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    })
            }

            #[cfg(target_os = "ios")]
            {
                use objc::{msg_send, sel, sel_impl, class};
                unsafe {
                    let session: *mut objc::runtime::Object = msg_send![class!(AVAudioSession), sharedInstance];
                    let str_class = class!(NSString);
                    let category_str = "AVAudioSessionCategoryPlayback\0";
                    let category: *mut objc::runtime::Object = msg_send![str_class, stringWithUTF8String: category_str.as_ptr()];
                    let _: () = msg_send![session, setCategory:category error:0];
                    let _: () = msg_send![session, setActive:1 error:0];
                }
            }

            let model_manager = ai::model_manager::ModelManager::new(app.handle());
            app.manage(model_manager);

            let app_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            let db_dir = app_dir.join("db");
            let _ = std::fs::create_dir_all(&db_dir);

            // User store + session
            let user_store = db::user_store::UserStore::new(db_dir.join("users.db"))
                .expect("Failed to initialize user database");
            app.manage(user_store);
            app.manage(session::UserSession::new());

            // Transcript store
            let transcript_store =
                db::transcript_store::TranscriptStore::new(db_dir.join("transcripts.db"))
                    .expect("Failed to initialize transcript database");
            app.manage(transcript_store);

            // Study store (init progress table too)
            let study_store = db::study_store::StudyStore::new(db_dir.join("study.db"))
                .expect("Failed to initialize study database");
            let _ = study_store.init_progress_table();
            app.manage(study_store);

            app.manage(speaking_commands::ShadowingState {
                override_segment: StdMutex::new(None),
            });
            app.manage(pronunciation_commands::EvaluatorState(StdMutex::new(
                ai::pronunciation_evaluator::PronunciationEvaluator::new(),
            )));
            app.manage(TranscriptionState {
                lock: AsyncMutex::new(()),
            });
            Ok(())
        })
        .manage(audio::AudioState::default())
        .invoke_handler(tauri::generate_handler![
            // Audio
            audio_commands::load_audio,
            audio_commands::play,
            audio_commands::pause,
            audio_commands::resume,
            audio_commands::stop,
            audio_commands::unload_audio,
            audio_commands::seek,
            audio_commands::set_volume,
            audio_commands::set_speed,
            audio_commands::set_mode,
            audio_commands::add_segment,
            audio_commands::update_segment,
            audio_commands::remove_segment,
            audio_commands::set_active_segment,
            audio_commands::set_material_id,
            audio_commands::get_playback_state,
            audio_commands::save_temp_audio,
            audio_commands::save_recording_as,
            audio_commands::restart_segment,
            // AI
            ai_commands::check_model_exists,
            ai_commands::download_default_model,
            ai_commands::transcribe_audio,
            // Study
            study_commands::add_or_update_material,
            study_commands::get_recent_materials,
            study_commands::submit_dictation_score,
            study_commands::get_due_reviews_count,
            study_commands::get_recent_accuracy,
            study_commands::get_due_exercises,
            study_commands::get_all_exercises,
            study_commands::get_daily_study_stats,
            study_commands::get_material_distribution,
            study_commands::delete_material,
            study_commands::rename_material,
            study_commands::search_materials,
            study_commands::get_material,
            // Speaking
            speaking_commands::get_reference_text,
            speaking_commands::set_shadowing_override,
            speaking_commands::clear_shadowing_override,
            // Auth
            auth_commands::register_user,
            auth_commands::login_user,
            auth_commands::logout_user,
            auth_commands::get_current_user,
            auth_commands::update_username,
            auth_commands::update_avatar,
            auth_commands::list_users,
            // Progress
            progress_commands::save_material_progress,
            progress_commands::get_material_progress,
            // Download
            download_commands::check_ytdlp,
            download_commands::check_ffmpeg,
            download_commands::download_url_audio,
            // Pronunciation
            pronunciation_commands::assess_pronunciation,
            pronunciation_commands::download_pronunciation_model,
            pronunciation_commands::check_pronunciation_model_exists,
            pronunciation_commands::save_pronunciation_score,
            pronunciation_commands::get_pronunciation_history,
            system_commands::open_app_data_dir,
            pronunciation_commands::open_model_folder,
            // Settings
            settings_commands::clear_temp_cache,
            settings_commands::export_user_data,
            file_commands::copy_file_with_progress,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
