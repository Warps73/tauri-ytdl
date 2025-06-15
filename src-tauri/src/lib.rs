// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tauri::Emitter;
use regex::Regex;
use dirs;
use filetime::FileTime;
use std::fs;
use std::time::SystemTime;
use encoding_rs::UTF_8;

// Fonction pour nettoyer les noms de fichiers
fn clean_filename(filename: &str) -> String {
    filename.to_string()
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn download_music(app: tauri::AppHandle, url: String, format: String) -> Result<String, String> {
    let download_dir = dirs::download_dir()
        .ok_or_else(|| "Impossible de trouver le dossier de téléchargement".to_string())?;
    let mut file_path: Option<std::path::PathBuf> = None;

    // D'abord, récupérer le titre
    let title_args = vec![
        "--get-title",
        "--no-warnings",
        "--encoding",
        "utf-8",
        &url,
    ];
    println!("Récupération du titre avec les arguments: {:?}", title_args);
    let title_command = app.shell().sidecar("yt-dlp").unwrap().args(&title_args);
    let (mut title_rx, title_child) = title_command.spawn().map_err(|e| e.to_string())?;

    let mut title = String::new();
    while let Some(event) = title_rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                title = String::from_utf8_lossy(&line).trim().to_string();
                let output = format!("Titre récupéré: {}", title);
                println!("{}", output);
                app.emit("download-output", output).ok();
                break;
            }
            CommandEvent::Stderr(line) => {
                let error = format!("Erreur lors de la récupération du titre: {}", String::from_utf8_lossy(&line));
                println!("{}", error);
                app.emit("download-output", error).ok();
            }
            _ => {}
        }
    }
    title_child.kill().map_err(|e| e.to_string())?;

    // Ensuite, télécharger le fichier
    let file_extension = if format == "audio" { "mp3" } else { "mp4" };
    let output_path = download_dir.join(format!("{}.{}", title, file_extension));
    let path_output = format!("Chemin de sortie: {}", output_path.display());
    println!("{}", path_output);
    app.emit("download-output", path_output).ok();

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
                "--no-playlist",
            ]);
        },
        "video" => {
            args.extend_from_slice(&[
                "-f",
                "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                "--merge-output-format",
                "mp4",
                "--no-playlist",
            ]);
        },
        _ => return Err("Format non supporté. Utilisez 'audio' ou 'video'".to_string()),
    }

    args.extend_from_slice(&[
        "--encoding",
        "utf-8",
        "-o",
        output_path.to_str().ok_or("Chemin invalide")?,
        &url,
    ]);

    let args_output = format!("Arguments de téléchargement: {:?}", args);
    println!("{}", args_output);
    app.emit("download-output", args_output).ok();

    let sidecar_command = app.shell().sidecar("yt-dlp").unwrap().args(&args);
    let child = sidecar_command.spawn().map_err(|e| e.to_string())?;
    let (mut rx, child) = child;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let output = String::from_utf8_lossy(&line).to_string();
                println!("{}", output);
                app.emit("download-output", output).ok();
            }
            CommandEvent::Stderr(line) => {
                let error = format!("Error: {}", String::from_utf8_lossy(&line));
                println!("{}", error);
                app.emit("download-output", error).ok();
            }
            CommandEvent::Terminated(status) => {
                return if status.code == Some(0) {
                    if output_path.exists() {
                        let now = SystemTime::now();
                        let ft = FileTime::from_system_time(now);
                        if let Err(e) = filetime::set_file_mtime(&output_path, ft) {
                            let error = format!("Erreur lors de la mise à jour de la date de modification: {}", e);
                            println!("{}", error);
                            app.emit("download-output", error).ok();
                        }
                        if let Err(e) = filetime::set_file_atime(&output_path, ft) {
                            let error = format!("Erreur lors de la mise à jour de la date d'accès: {}", e);
                            println!("{}", error);
                            app.emit("download-output", error).ok();
                        }
                        Ok(output_path.to_string_lossy().into_owned())
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
