// Hide the extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod store;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            store::list_conversations,
            store::load_conversation,
            store::save_conversation,
            store::delete_conversation,
            store::load_settings,
            store::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Chat");
}
