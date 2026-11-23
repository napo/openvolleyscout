// SPDX-License-Identifier: AGPL-3.0-or-later

//! Desktop OAuth 2.0 loopback redirect listener (RFC 8252): binds 127.0.0.1 on
//! a free port (Google Drive, OneDrive) or a fixed registered port (Dropbox),
//! waits for the single redirect request from the system browser, and returns
//! the request target ("/?code=...&state=...") to the webview for PKCE exchange.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

struct Waiting {
    listener: Option<TcpListener>,
    cancel: Arc<AtomicBool>,
}

/// Active loopback listeners waiting for an OAuth redirect, keyed by port.
#[derive(Default)]
pub struct Pending(Mutex<HashMap<u16, Waiting>>);

/// Maximum time the user has to complete sign-in in the browser.
const TIMEOUT: Duration = Duration::from_secs(300);

const PAGE: &str = "<!doctype html><meta charset=\"utf-8\"><title>OpenVolleyScout</title>\
<body style=\"font-family:sans-serif;text-align:center;padding:3em\">\
<h1>OpenVolleyScout</h1><p>Accesso completato: puoi chiudere questa pagina e tornare all'app.</p>\
<p>Signed in: you can close this page and go back to the app.</p></body>";

/// Opens the loopback TCP listener and returns the bound port.
#[tauri::command]
pub fn oauth_listen(port: Option<u16>, pending: tauri::State<'_, Pending>) -> Result<u16, String> {
    if let Some(port) = port {
        cancel(port, &pending);
    }
    let mut tries = 0;
    let listener = loop {
        match TcpListener::bind(("127.0.0.1", port.unwrap_or(0))) {
            Ok(listener) => break listener,
            Err(_) if port.is_some() && tries < 15 => {
                tries += 1;
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(e.to_string()),
        }
    };
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let waiting = Waiting {
        listener: Some(listener),
        cancel: Arc::new(AtomicBool::new(false)),
    };
    pending
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .insert(port, waiting);
    Ok(port)
}

fn cancel(port: u16, pending: &Pending) {
    if let Ok(mut map) = pending.0.lock() {
        if let Some(waiting) = map.remove(&port) {
            waiting.cancel.store(true, Ordering::SeqCst);
        }
    }
}

/// Cancels an active sign-in wait and frees the loopback port.
#[tauri::command]
pub fn oauth_cancel(port: u16, pending: tauri::State<'_, Pending>) {
    cancel(port, &pending);
}

/// Waits for the browser redirect and returns the request path with query ("/?code=...&state=...").
#[tauri::command]
pub async fn oauth_wait(port: u16, pending: tauri::State<'_, Pending>) -> Result<String, String> {
    let (listener, stop) = {
        let mut map = pending.0.lock().map_err(|e| e.to_string())?;
        let waiting = map.get_mut(&port).ok_or("unknown port")?;
        (
            waiting.listener.take().ok_or("already waiting")?,
            waiting.cancel.clone(),
        )
    };
    let result = tauri::async_runtime::spawn_blocking(move || accept(listener, &stop))
        .await
        .map_err(|e| e.to_string())?;
    if let Ok(mut map) = pending.0.lock() {
        map.remove(&port);
    }
    result
}

fn accept(listener: TcpListener, stop: &AtomicBool) -> Result<String, String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let start = Instant::now();
    loop {
        match listener.accept() {
            Ok((mut stream, _)) => {
                stream.set_nonblocking(false).map_err(|e| e.to_string())?;
                stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
                let mut buffer = [0u8; 8192];
                let read = stream.read(&mut buffer).map_err(|e| e.to_string())?;
                let request = String::from_utf8_lossy(&buffer[..read]);
                let target = request
                    .lines()
                    .next()
                    .and_then(|line| line.split_whitespace().nth(1))
                    .unwrap_or("")
                    .to_string();
                // Ignore browser requests such as /favicon.ico and keep waiting for the OAuth redirect.
                if !target.starts_with("/?") {
                    let _ = stream.write_all(
                        b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                    );
                    continue;
                }
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    PAGE.len(),
                    PAGE
                );
                let _ = stream.write_all(response.as_bytes());
                return Ok(target);
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if stop.load(Ordering::SeqCst) {
                    return Err("cancelled".into());
                }
                if start.elapsed() > TIMEOUT {
                    return Err("timeout".into());
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}
