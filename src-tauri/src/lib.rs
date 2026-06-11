mod video_export;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(video_export::ClipExportState::default())
    .invoke_handler(tauri::generate_handler![
      video_export::clip_export_available,
      video_export::export_video_clips,
      video_export::cancel_video_clip_export,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
