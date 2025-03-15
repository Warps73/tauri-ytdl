// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::process::Command;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn download_music(url: String) -> Result<String, String> {
    let output = Command::new("youtube-dl")
        .args(&["-x", "--audio-format", "mp3", &url])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok("Téléchargement réussi !".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Erreur lors du téléchargement : {}", stderr))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, download_music])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
