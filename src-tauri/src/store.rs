//! Conversations as JSON files in the app data folder.
//! macOS: ~/Library/Application Support/com.datalumina.chat
//! Windows: %APPDATA%\com.datalumina.chat

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub mode: String,
    pub model: String,
    #[serde(default)]
    pub think: Option<Value>,
    #[serde(default)]
    pub folder: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
    /// React owns the shape of a message. Rust only stores it.
    pub messages: Vec<Value>,
    /// Code mode: the text, tool calls, and notices of a Pi session, in order.
    #[serde(default)]
    pub items: Vec<Value>,
}

/// What the sidebar needs, without loading every message.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub id: String,
    pub title: String,
    pub mode: String,
    pub updated_at: u64,
}

#[tauri::command]
pub fn list_conversations(app: AppHandle) -> Result<Vec<Summary>, String> {
    let mut summaries = Vec::new();
    for entry in fs::read_dir(conversations_dir(&app)?).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        // Skip files that are not conversations instead of failing the whole list.
        let Ok(text) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(c) = serde_json::from_str::<Conversation>(&text) else {
            continue;
        };
        summaries.push(Summary {
            id: c.id,
            title: c.title,
            mode: c.mode,
            updated_at: c.updated_at,
        });
    }
    summaries.sort_by_key(|s| std::cmp::Reverse(s.updated_at));
    Ok(summaries)
}

#[tauri::command]
pub fn load_conversation(app: AppHandle, id: String) -> Result<Conversation, String> {
    let text = fs::read_to_string(conversation_path(&app, &id)?).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_conversation(app: AppHandle, conversation: Conversation) -> Result<(), String> {
    let path = conversation_path(&app, &conversation.id)?;
    let text = serde_json::to_string_pretty(&conversation).map_err(|e| e.to_string())?;
    write_atomic(&path, &text)
}

#[tauri::command]
pub fn delete_conversation(app: AppHandle, id: String) -> Result<(), String> {
    fs::remove_file(conversation_path(&app, &id)?).map_err(|e| e.to_string())
}

fn conversations_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join("conversations");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// The id comes from the webview, so check it before it becomes part of a file path.
fn conversation_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    let valid = !id.is_empty()
        && id.len() <= 64
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    if !valid {
        return Err(format!("Invalid conversation id: {id}"));
    }
    Ok(conversations_dir(app)?.join(format!("{id}.json")))
}

/// Write to a temporary file, then rename. A crash mid-write never leaves half a file.
pub fn write_atomic(path: &PathBuf, text: &str) -> Result<(), String> {
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, text).map_err(|e| e.to_string())?;
    fs::rename(&temporary, path).map_err(|e| e.to_string())
}

/// App settings, stored in settings.json next to the conversations folder.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub system_prompt: String,
    pub default_model: String,
    /// Empty means "use the model's own default".
    pub temperature: Option<f64>,
    pub code_model: String,
    /// Empty means "find pi on the PATH".
    pub pi_path: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            system_prompt: String::new(),
            default_model: String::new(),
            temperature: None,
            code_model: "gpt-oss:20b".to_string(),
            pi_path: String::new(),
        }
    }
}

#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<Settings, String> {
    let path = data_dir(&app)?.join("settings.json");
    match fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text).map_err(|e| e.to_string()),
        Err(_) => Ok(Settings::default()), // first start: no file yet
    }
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    let path = data_dir(&app)?.join("settings.json");
    let text = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    write_atomic(&path, &text)
}
