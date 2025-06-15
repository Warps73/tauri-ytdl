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
use serde::{Deserialize, Serialize};
use serde_json::{self, Value};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PlaylistVideo {
    id: String,
    title: String,
    thumbnail: String,
    duration: String,
    uploader: String,
}

#[tauri::command]
async fn get_playlist_info(app: tauri::AppHandle, playlist_url: String) -> Result<Vec<PlaylistVideo>, String> {
    let args = vec![
        "--flat-playlist",
        "--dump-json",
        "--playlist-items",
        "1-25",
        "--no-warnings",
        "--encoding",
        "utf-8",
        &playlist_url,
    ];

    let output = format!("Récupération des informations de la playlist avec les arguments: {:?}", args);
    println!("{}", output);
    app.emit("download-output", output).ok();

    let command = app.shell().sidecar("yt-dlp").unwrap().args(&args);
    let (mut rx, child) = command.spawn().map_err(|e| e.to_string())?;

    let mut json_data = String::new();
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let line_str = String::from_utf8_lossy(&line).to_string();
                json_data.push_str(&line_str);
                json_data.push('\n');
            }
            CommandEvent::Stderr(line) => {
                let error = format!("Erreur lors de la récupération des informations: {}", String::from_utf8_lossy(&line));
                println!("{}", error);
                app.emit("download-output", error).ok();
            }
            CommandEvent::Terminated(status) => {
                if status.code != Some(0) {
                    return Err("Échec de la récupération des informations de la playlist".to_string());
                }
            }
            _ => {}
        }
    }

    // Traiter les données JSON
    let mut videos = Vec::new();

    for line in json_data.lines() {
        if line.trim().is_empty() {
            continue;
        }

        match serde_json::from_str::<Value>(line) {
            Ok(json) => {
                let thumbnail_url = json.get("thumbnails")
                    .and_then(|thumbs| thumbs.as_array())
                    .and_then(|arr| arr.get(0)) // Prendre la première miniature
                    .and_then(|thumb_obj| thumb_obj.get("url"))
                    .and_then(|url_val| url_val.as_str())
                    .unwrap_or("")
                    .to_string();

                let duration_value =
                    if let Some(ds_str) = json.get("duration_string").and_then(|v| v.as_str()) {
                        ds_str.to_string()
                    } else if let Some(d_f64) = json.get("duration").and_then(|v| v.as_f64()) {
                        format_duration(d_f64)
                    } else {
                        "".to_string()
                    };

                let video = PlaylistVideo {
                    id: json["id"].as_str().unwrap_or("").to_string(),
                    title: json["title"].as_str().unwrap_or("").to_string(),
                    thumbnail: thumbnail_url,
                    duration: duration_value,
                    uploader: json["uploader"].as_str().unwrap_or("").to_string(),
                };
                videos.push(video);
            }
            Err(e) => {
                let error_msg = format!("Erreur de désérialisation JSON pour une vidéo : {} - Ligne: {}", e, line);
                println!("{}", error_msg);
                app.emit("download-output", error_msg).ok();
            }
        }
    }

    if videos.is_empty() && !json_data.trim().is_empty() {
        let error_msg = "Aucune vidéo n'a pu être extraite du JSON, bien que des données aient été reçues.".to_string();
        println!("{}", error_msg);
        app.emit("download-output", error_msg.clone()).ok();
        return Err(error_msg);
    }

    let info = format!("Nombre de vidéos trouvées dans la playlist: {}", videos.len());
    println!("{}", info);
    app.emit("download-output", info).ok();

    Ok(videos)
}

// Helper function to format duration from seconds to MM:SS or HH:MM:SS
fn format_duration(seconds_f64: f64) -> String {
    let total_seconds = seconds_f64.round() as u64;
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;

    if hours > 0 {
        format!("{:02}:{:02}:{:02}", hours, minutes, seconds)
    } else {
        format!("{:02}:{:02}", minutes, seconds)
    }
}

#[tauri::command]
async fn download_playlist_videos(app: tauri::AppHandle, video_ids: Vec<String>, format: String) -> Result<Vec<String>, String> {
    let download_dir = dirs::download_dir()
        .ok_or_else(|| "Impossible de trouver le dossier de téléchargement".to_string())?;

    let mut downloaded_files = Vec::new();
    let total_videos = video_ids.len();

    for (index, video_id) in video_ids.iter().enumerate() {
        let progress_info = format!("Téléchargement de la vidéo {}/{} (ID: {})", index + 1, total_videos, video_id);
        println!("{}", progress_info);
        app.emit("download-output", progress_info).ok();

        // Construire l'URL YouTube à partir de l'ID
        let url = format!("https://www.youtube.com/watch?v={}", video_id);

        // D'abord, récupérer le titre
        let title_args = vec![
            "--get-title",
            "--no-warnings",
            "--encoding",
            "utf-8",
            &url,
        ];

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
        let (mut rx, child) = sidecar_command.spawn().map_err(|e| e.to_string())?;

        let mut success = false;
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
                    if status.code == Some(0) {
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
                            downloaded_files.push(output_path.to_string_lossy().into_owned());
                            success = true;
                        }
                    }
                }
                _ => {}
            }
        }

        if !success {
            let error = format!("Échec du téléchargement de la vidéo {}", video_id);
            println!("{}", error);
            app.emit("download-output", error).ok();
        }
    }

    let summary = format!("Téléchargement terminé. {} fichiers téléchargés sur {}", downloaded_files.len(), total_videos);
    println!("{}", summary);
    app.emit("download-output", summary).ok();

    Ok(downloaded_files)
}

#[tauri::command]
async fn download_music(app: tauri::AppHandle, url: String, format: String) -> Result<String, String> {
    let download_dir = dirs::download_dir()
        .ok_or_else(|| "Impossible de trouver le dossier de téléchargement".to_string())?;
    let file_path: Option<std::path::PathBuf> = None;

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
        .invoke_handler(tauri::generate_handler![
            greet,
            download_music,
            get_playlist_info,
            download_playlist_videos
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
