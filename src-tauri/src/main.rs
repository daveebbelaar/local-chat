// Hide the extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod apple;
mod ollama;
mod store;

use tauri::RunEvent;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ollama::ChatState::default())
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
        ])
        .build(tauri::generate_context!())
        .expect("error while building Chat")
        .run(|_app, event| {
            // Stop the fm serve process when the app quits.
            if let RunEvent::Exit = event {
                apple::shutdown();
            }
        });
}
