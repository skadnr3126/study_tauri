use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Note {
    id: String,
    title: String,
    content: String,
    tags: Vec<String>,
    created_at: String,
}

fn notes_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not find the app data directory: {error}"))?;

    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Could not create the app data directory: {error}"))?;

    Ok(app_data_dir.join("brainstorm-notes.json"))
}

#[tauri::command]
fn load_notes(app: AppHandle) -> Result<Vec<Note>, String> {
    let path = notes_path(&app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let contents =
        fs::read_to_string(path).map_err(|error| format!("Could not read notes: {error}"))?;

    serde_json::from_str(&contents).map_err(|error| format!("Could not parse notes: {error}"))
}

#[tauri::command]
fn save_notes(app: AppHandle, notes: Vec<Note>) -> Result<String, String> {
    let path = notes_path(&app)?;
    let json = serde_json::to_string_pretty(&notes)
        .map_err(|error| format!("Could not serialize notes: {error}"))?;

    fs::write(&path, json).map_err(|error| format!("Could not save notes: {error}"))?;

    Ok(path.display().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![load_notes, save_notes])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
