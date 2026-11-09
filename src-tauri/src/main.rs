// Hide the extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod apple;
mod ollama;
mod pi;
mod store;

use tauri::{Manager, RunEvent, WindowEvent};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ollama::ChatState::default())
        .manage(pi::PiState::default())
        .invoke_handler(tauri::generate_handler![
            ollama::list_models,
            ollama::model_options,
            ollama::unload_model,
            ollama::chat,
            ollama::stop_chat,
            store::list_conversations,
            store::load_conversation,
            store::save_conversation,
            store::delete_conversation,
            store::load_settings,
            store::save_settings,
            pi::code_start,
            pi::code_prompt,
            pi::code_abort,
            pi::code_stop,
        ])
        // Never leave a Pi process behind: kill it when the window closes and when the app exits.
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                pi::shutdown(&window.state::<pi::PiState>());
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Chat")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                pi::shutdown(&app.state::<pi::PiState>());
                apple::shutdown();
            }
        });
}
