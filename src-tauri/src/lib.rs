// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn download_music(app: tauri::AppHandle, url: String) -> Result<String, String> {
    let sidecar_command = app.shell().sidecar("youtube-dl").unwrap().args(&[
        "-x",
        "--audio-format",
        "mp3",
        "-o",
        "./downloads/%(title)s.%(ext)s",
        &url,
    ]);

    let mut child = sidecar_command.spawn().map_err(|e| e.to_string())?;

    let (mut rx, mut child) = child;
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                println!("{}", String::from_utf8_lossy(&line));
            }
            CommandEvent::Stderr(line) => {
                println!("Error: {}", String::from_utf8_lossy(&line));
            }
            CommandEvent::Terminated(status) => {
                return if status.code == Some(0) {
                    Ok("Téléchargement réussi !".to_string())
                } else {
                    Err("Le téléchargement a échoué".to_string())
                }
            }
            _ => {}
        }
    }
    Err("Le processus s'est terminé de manière inattendue".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_upload::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, download_music])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
