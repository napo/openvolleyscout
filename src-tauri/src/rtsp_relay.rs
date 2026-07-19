//! Bridges an RTSP camera to the webview via the bundled go2rtc sidecar,
//! exposed to the browser as WebRTC (see rtsp-capture.ts on the frontend).
//! Unlike the ffmpeg sidecar in video_export.rs (short-lived, run-to-completion
//! `Command::output()` calls), go2rtc is a long-lived background process: it
//! is spawned once on first use and kept running for the app's lifetime,
//! not restarted per source activation.

use serde::Serialize;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::State;

// App-specific ports (not go2rtc's own defaults of 1984/8555) to avoid
// colliding with any other go2rtc instance the user might already have running.
const API_PORT: u16 = 17984;
const WEBRTC_PORT: u16 = 18555;

#[derive(Default)]
pub struct RtspRelayState(pub Mutex<Option<Child>>);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RtspRelayInfo {
  pub api_base: String,
}

fn go2rtc_sidecar_path() -> Option<PathBuf> {
  crate::sidecar::sidecar_path("go2rtc", "go2rtc.exe")
}

#[tauri::command]
pub fn rtsp_relay_available() -> bool {
  go2rtc_sidecar_path().is_some()
}

#[tauri::command]
pub fn start_rtsp_relay(state: State<'_, RtspRelayState>) -> Result<RtspRelayInfo, String> {
  let api_base = format!("http://127.0.0.1:{API_PORT}");
  let mut guard = state.0.lock().map_err(|_| "rtsp relay state poisoned".to_string())?;

  if let Some(child) = guard.as_mut() {
    if matches!(child.try_wait(), Ok(None)) {
      // Already running — reuse it rather than spawning a second instance.
      return Ok(RtspRelayInfo { api_base });
    }
  }

  let bin = go2rtc_sidecar_path().ok_or_else(|| "go2rtc sidecar not found".to_string())?;
  let config = serde_json::json!({
    "api": { "listen": format!("127.0.0.1:{API_PORT}") },
    // Loopback-only, same as the API above: the browser side only ever
    // connects via 127.0.0.1, and both ends run on this machine, so there's
    // no reason for the media port to be reachable from the LAN.
    "webrtc": { "listen": format!("127.0.0.1:{WEBRTC_PORT}") },
    // Only consuming an external camera here, not re-serving one — disable
    // go2rtc's own RTSP server (empty listen = disabled, confirmed in source).
    "rtsp": { "listen": "" },
  })
  .to_string();

  let child = Command::new(bin)
    .arg("-c")
    .arg(config)
    .spawn()
    .map_err(|e| e.to_string())?;

  *guard = Some(child);
  Ok(RtspRelayInfo { api_base })
}

#[tauri::command]
pub fn stop_rtsp_relay(state: State<'_, RtspRelayState>) {
  kill_relay(&state.0);
}

/// Shared by stop_rtsp_relay and the app's ExitRequested handler — holds the
/// lock through both kill() and wait() so a fast stop-then-start can't race
/// a still-exiting process for the same fixed ports.
pub fn kill_relay(state: &Mutex<Option<Child>>) {
  if let Ok(mut guard) = state.lock() {
    if let Some(mut child) = guard.take() {
      let _ = child.kill();
      let _ = child.wait();
    }
  }
}
