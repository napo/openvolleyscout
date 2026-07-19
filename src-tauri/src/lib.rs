mod rtsp_relay;
mod sidecar;
mod video_export;

use tauri::Manager;

#[tauri::command]
fn multi_window_available() -> bool {
  cfg!(desktop)
}

/// Whether getUserMedia (webcam) is expected to work in this build's webview.
/// On Linux, distro-packaged WebKitGTK often ships with its WebRTC/media-stream
/// support compiled in but disabled by default, and with no permission-request
/// handler wired up (see enable_linux_webcam_support below, which attempts to
/// turn both on via Tauri's public `with_webview` API). Whether it actually
/// works still depends on the specific distro's WebKitGTK build — this stays
/// optimistic (true) so the UI offers the option and surfaces the real
/// getUserMedia error if the underlying library truly lacks the feature,
/// rather than silently hiding it. Windows (WebView2) and macOS (WKWebView,
/// with the Info.plist NSCameraUsageDescription key) are unaffected either way.
#[tauri::command]
fn webcam_supported() -> bool {
  true
}

/// Attempts to turn on WebKitGTK's WebRTC/media-stream support and
/// auto-approve camera permission requests — both are off by default even
/// when the underlying library has them compiled in, since neither WRY nor
/// this app previously called the WebKitSettings toggles or handled the
/// `permission-request` signal. Uses Tauri's public `with_webview` escape
/// hatch (no WRY patch, no custom WebKitGTK build); if the installed
/// WebKitGTK genuinely lacks WebRTC support, getUserMedia still fails, but
/// with the OS/library's real error rather than being blocked here.
#[cfg(target_os = "linux")]
fn enable_linux_webcam_support(app: &tauri::App) {
  use webkit2gtk::{PermissionRequestExt, SettingsExt, WebViewExt};

  let Some(window) = app.get_webview_window("main") else {
    return;
  };

  let _ = window.with_webview(|webview| {
    let view = webview.inner();
    if let Some(settings) = WebViewExt::settings(&view) {
      settings.set_enable_media_stream(true);
      settings.set_enable_webrtc(true);
    }
    view.connect_permission_request(|_, request| {
      use webkit2gtk::glib::Cast;
      if let Some(user_media) = request.downcast_ref::<webkit2gtk::UserMediaPermissionRequest>() {
        user_media.allow();
        return true;
      }
      false
    });
  });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .manage(video_export::ClipExportState::default())
    .manage(rtsp_relay::RtspRelayState::default())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      video_export::clip_export_available,
      video_export::export_video_clips,
      video_export::cancel_video_clip_export,
      multi_window_available,
      webcam_supported,
      rtsp_relay::rtsp_relay_available,
      rtsp_relay::start_rtsp_relay,
      rtsp_relay::stop_rtsp_relay,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      #[cfg(target_os = "linux")]
      enable_linux_webcam_support(app);
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while running tauri application");

  app.run(|app_handle, event| {
    if let tauri::RunEvent::ExitRequested { .. } = event {
      let state = app_handle.state::<rtsp_relay::RtspRelayState>();
      rtsp_relay::kill_relay(&state.0);
    }
  });
}
