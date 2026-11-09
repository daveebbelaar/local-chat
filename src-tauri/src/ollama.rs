//! Everything that talks to the Ollama server lives here.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::io::{BufRead, BufReader};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::State;
use tauri::ipc::Channel;

const OLLAMA_URL: &str = "http://127.0.0.1:11434";

/// One message in the conversation, in the shape Ollama expects.
#[derive(Serialize, Deserialize, Clone)]
pub struct Message {
    pub role: String,
    pub content: String,
}

/// What React sends to start an answer.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<Message>,
    /// `false`, `true`, or a level such as `"low"`. `None` uses the model's default.
    pub think: Option<Value>,
    /// The model's maximum context, from `list_models`.
    pub context_length: u64,
    /// `None` uses the model's default. 0 makes answers repeatable.
    pub temperature: Option<f64>,
}

/// One installed model, as the picker shows it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub name: String,
    pub size: u64,
    pub parameter_size: String,
    pub context_length: u64,
}

/// The thinking levels a model accepts, from `/api/show`.
#[derive(Serialize)]
pub struct ModelOptions {
    pub thinking: Option<Thinking>,
}

#[derive(Serialize)]
pub struct Thinking {
    pub values: Vec<Value>,
    pub default: Value,
}

/// What Rust sends back over the Channel while the answer streams.
#[derive(Serialize, Clone)]
#[serde(
    tag = "event",
    content = "data",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ChatEvent {
    Thinking {
        delta: String,
    },
    Text {
        delta: String,
    },
    Done {
        stopped: bool,
        tokens: u64,
        tokens_per_second: f64,
        load_seconds: f64,
        prompt_seconds: f64,
    },
    Error {
        message: String,
    },
}

impl ChatEvent {
    /// The last event of an answer that was stopped.
    pub fn stopped() -> Self {
        ChatEvent::Done {
            stopped: true,
            tokens: 0,
            tokens_per_second: 0.0,
            load_seconds: 0.0,
            prompt_seconds: 0.0,
        }
    }
}

/// The stop flag of the answer that is streaming now, if any.
#[derive(Default)]
pub struct ChatState(Mutex<Option<Arc<AtomicBool>>>);

/// The models installed in Ollama.
#[tauri::command(async)]
pub fn list_models() -> Result<Vec<ModelInfo>, String> {
    let tags = get("/api/tags")?;
    let models = tags["models"].as_array().cloned().unwrap_or_default();
    let mut list: Vec<ModelInfo> = models
        .iter()
        .map(|m| ModelInfo {
            name: m["name"].as_str().unwrap_or_default().to_string(),
            size: m["size"].as_u64().unwrap_or(0),
            parameter_size: m["details"]["parameter_size"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            context_length: m["details"]["context_length"].as_u64().unwrap_or(8192),
        })
        .collect();
    // Optional: Apple's on-device model, on macOS 27 only.
    if crate::apple::available() {
        list.push(ModelInfo {
            name: crate::apple::MODEL.to_string(),
            size: 0,
            parameter_size: "Apple, built in".to_string(),
            context_length: 8192,
        });
    }
    Ok(list)
}

/// Which thinking levels a model accepts. Models without thinking return `None`.
#[tauri::command(async)]
pub fn model_options(model: String) -> Result<ModelOptions, String> {
    if model == crate::apple::MODEL {
        return Ok(ModelOptions { thinking: None });
    }
    let mut response = post("/api/show", &json!({ "model": model }))?;
    let show: Value = response.body_mut().read_json().map_err(|e| e.to_string())?;
    let thinking = show["thinking"]["values"]
        .as_array()
        .map(|values| Thinking {
            values: values.clone(),
            default: show["thinking"]["default"].clone(),
        });
    Ok(ModelOptions { thinking })
}

/// Free the model's memory now instead of after Ollama's 5 minute timeout.
/// Two 18 GB models loaded together do not fit in 36 GB, and both would slow down.
#[tauri::command(async)]
pub fn unload_model(model: String) -> Result<(), String> {
    if model == crate::apple::MODEL {
        return Ok(()); // macOS manages Apple's model
    }
    post("/api/generate", &json!({ "model": model, "keep_alive": 0 }))?;
    Ok(())
}

/// Start an answer. Returns at once; the answer arrives on `on_event`.
#[tauri::command]
pub fn chat(request: ChatRequest, on_event: Channel<ChatEvent>, state: State<'_, ChatState>) {
    let stop = Arc::new(AtomicBool::new(false));
    // A new answer replaces the old one, so stop the old one first.
    if let Some(previous) = state.0.lock().unwrap().replace(stop.clone()) {
        previous.store(true, Ordering::SeqCst);
    }
    std::thread::spawn(move || {
        let result = if request.model == crate::apple::MODEL {
            crate::apple::stream_answer(&request, &on_event, &stop)
        } else {
            stream_answer(&request, &on_event, &stop)
        };
        if let Err(message) = result {
            let _ = on_event.send(ChatEvent::Error { message });
        }
    });
}

/// Stop the answer that is streaming now.
#[tauri::command]
pub fn stop_chat(state: State<'_, ChatState>) {
    if let Some(stop) = state.0.lock().unwrap().as_ref() {
        stop.store(true, Ordering::SeqCst);
    }
}

fn stream_answer(
    request: &ChatRequest,
    events: &Channel<ChatEvent>,
    stop: &AtomicBool,
) -> Result<(), String> {
    let mut body = json!({
        "model": request.model,
        "messages": request.messages,
        "stream": true,
        // Without num_ctx, Ollama uses its default and silently cuts the start of long chats.
        "options": { "num_ctx": context_size(&request.messages, request.context_length) },
    });
    if let Some(think) = &request.think {
        body["think"] = think.clone();
    }
    if let Some(temperature) = request.temperature {
        body["options"]["temperature"] = json!(temperature);
    }
    let response = post("/api/chat", &body)?;

    // Ollama sends one JSON object per line until `done` is true.
    let reader = BufReader::new(response.into_body().into_reader());
    for line in reader.lines() {
        if stop.load(Ordering::SeqCst) {
            // Returning drops the connection, and Ollama stops generating.
            let _ = events.send(ChatEvent::stopped());
            return Ok(());
        }
        let line = line.map_err(|e| e.to_string())?;
        if line.trim().is_empty() {
            continue;
        }
        let chunk: Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
        if let Some(error) = chunk["error"].as_str() {
            return Err(error.to_string());
        }
        let thinking = chunk["message"]["thinking"].as_str().unwrap_or("");
        if !thinking.is_empty() {
            let _ = events.send(ChatEvent::Thinking {
                delta: thinking.to_string(),
            });
        }
        let text = chunk["message"]["content"].as_str().unwrap_or("");
        if !text.is_empty() {
            let _ = events.send(ChatEvent::Text {
                delta: text.to_string(),
            });
        }
        if chunk["done"].as_bool() == Some(true) {
            // The last line carries the stats. Durations are in nanoseconds.
            let seconds = |key: &str| chunk[key].as_f64().unwrap_or(0.0) / 1e9;
            let tokens = chunk["eval_count"].as_u64().unwrap_or(0);
            let eval_seconds = seconds("eval_duration");
            let _ = events.send(ChatEvent::Done {
                stopped: false,
                tokens,
                tokens_per_second: if eval_seconds > 0.0 {
                    tokens as f64 / eval_seconds
                } else {
                    0.0
                },
                load_seconds: seconds("load_duration"),
                prompt_seconds: seconds("prompt_eval_duration"),
            });
        }
    }
    Ok(())
}

/// The context window for this request: room for the chat so far plus a long answer.
/// It grows in large steps, because every change makes Ollama reload the model.
fn context_size(messages: &[Message], model_max: u64) -> u64 {
    let characters: usize = messages.iter().map(|m| m.content.len()).sum();
    let needed = characters as u64 / 3 + 4096; // about 3 characters per token, plus the answer
    let size = [8192, 16384, 32768, 65536, 131072]
        .into_iter()
        .find(|&size| size >= needed)
        .unwrap_or(131072);
    size.min(model_max)
}

/// GET JSON from Ollama.
fn get(path: &str) -> Result<Value, String> {
    ureq::get(format!("{OLLAMA_URL}{path}"))
        .call()
        .map_err(|_| "Ollama is not running. Start it and try again.".to_string())?
        .body_mut()
        .read_json()
        .map_err(|e| e.to_string())
}

/// POST JSON to Ollama. Turns "server not running" and Ollama's own errors into readable text.
fn post(path: &str, body: &Value) -> Result<ureq::http::Response<ureq::Body>, String> {
    let mut response = ureq::post(format!("{OLLAMA_URL}{path}"))
        .config()
        .http_status_as_error(false)
        .build()
        .send_json(body)
        .map_err(|_| "Ollama is not running. Start it and try again.".to_string())?;
    if response.status().is_success() {
        return Ok(response);
    }
    let text = response.body_mut().read_to_string().unwrap_or_default();
    let message = serde_json::from_str::<Value>(&text)
        .ok()
        .and_then(|v| v["error"].as_str().map(String::from))
        .unwrap_or(text);
    Err(format!("Ollama: {message}"))
}
