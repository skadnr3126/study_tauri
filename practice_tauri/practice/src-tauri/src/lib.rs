
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};
use serde::{Deserialize, Serialize};
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Note {
    id: String,
    title: String,
    content: String,
    tags: Vec<String>,
    created_at: String,
}

#[tauri::command]
fn greet(app: AppHandle, name: &str) -> String {
    notes_path(&app);
    
    format!("Hello, {}! You've been greeted from Rust!", name)
    
}

fn notes_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not find the app data directory: {error}"))?;

    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Could not create the app data directory: {error}"))?;

    println!("App data directory: {}", app_data_dir.display());
    Ok(app_data_dir.join("brainstorm-notes.json"))    
}


fn save_notes(app: &AppHandle, notes: Vec<Note>) -> Result<String, String> {
    let path = notes_path(&app)?;
    let json = serde_json::to_string_pretty(&notes)
        .map_err(|error| format!("Could not serialize notes: {error}"))?;
    
    println!("Saving notes: {:#?}", json);

    fs::write(&path, json).map_err(|error| format!("Could not save notes: {error}"))?;

    Ok(path.display().to_string())
}

#[tauri::command]
fn load_arr() -> Result<Vec<Note>, String>{
    println!("Loading arr...");
    Err(format!("error occurred"))
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, load_arr])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
       