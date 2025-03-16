// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use regex::Regex;
use dirs;
use filetime::FileTime;
use std::fs;
use std::time::SystemTime;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn download_music(app: tauri::AppHandle, url: String, format: String) -> Result<String, String> {
    let download_dir = dirs::download_dir()
        .ok_or_else(|| "Impossible de trouver le dossier de téléchargement".to_string())?;
    let mut file_path = None;

    let output_template = download_dir.join("%(title)s.%(ext)s").to_string_lossy().into_owned();

    let mut args = Vec::new();
    
    match format.as_str() {
        "audio" => {
            args.extend_from_slice(&[
                "-x",
                "--audio-format",
                "mp3",
                "--audio-quality",
                "0",
                "--prefer-ffmpeg",
            ]);
        },
        "video" => {
            args.extend_from_slice(&[
                "-f",
                "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                "--merge-output-format",
                "mp4",
            ]);
        },
        _ => return Err("Format non supporté. Utilisez 'audio' ou 'video'".to_string()),
    }

    args.extend_from_slice(&[
        "-o",
        &output_template,
        &url,
    ]);

    let sidecar_command = app.shell().sidecar("youtube-dl").unwrap().args(&args);

    let child = sidecar_command.spawn().map_err(|e| e.to_string())?;
    let (mut rx, child) = child;
    
    // Regex pour extraire le nom du fichier, adaptée selon le format
    let file_extension = if format == "audio" { "mp3" } else { "mp4" };
    let file_regex = Regex::new(&format!(r#"(?:\[ffmpeg\] Destination: |\[ffmpeg\] Merging formats into "|(?:\[download\] )).+?([^/]+\.{})(?:\"|\s|$)"#, 
        file_extension)).unwrap();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let line_str = String::from_utf8_lossy(&line);
                println!("{}", line_str);
                
                // Cherche le nom du fichier dans la sortie
                if let Some(captures) = file_regex.captures(&line_str) {
                    if let Some(filename) = captures.get(1) {
                        file_path = Some(download_dir.join(filename.as_str()));
                    }
                }
            }
            CommandEvent::Stderr(line) => {
                println!("Error: {}", String::from_utf8_lossy(&line));
            }
            CommandEvent::Terminated(status) => {
                return if status.code == Some(0) {
                    if let Some(path) = file_path {
                        // Mettre à jour la date de modification du fichier
                        let now = SystemTime::now();
                        let ft = FileTime::from_system_time(now);
                        if let Err(e) = filetime::set_file_mtime(&path, ft) {
                            println!("Erreur lors de la mise à jour de la date de modification: {}", e);
                        }
                        Ok(path.to_string_lossy().into_owned())
                    } else {
                        Ok("Téléchargement réussi mais impossible de récupérer le chemin du fichier".to_string())
                    }
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_upload::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, download_music])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
