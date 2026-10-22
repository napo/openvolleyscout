//! Serves the YouTube playlist player page (youtube-playlist.ts on the
//! frontend) over http://127.0.0.1 and opens it in the system browser.
//! YouTube refuses to embed its player into pages that send no HTTP referrer,
//! which is the case for an .html file opened from disk; a loopback address
//! is a real web origin, so the same page plays there. A tiny std-only
//! HTTP/1.0 responder is enough for one static page: it is started on first
//! use on a random loopback port and kept running for the app's lifetime.
//! Each page sits under an unguessable token, so other local pages cannot
//! enumerate it.

use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::State;
use tauri_plugin_opener::OpenerExt;

/// Older pages are dropped beyond this, oldest first.
const MAX_PAGES: usize = 20;

type Pages = Arc<Mutex<Vec<(String, String)>>>;

#[derive(Default)]
pub struct PlaylistServerState(Mutex<Option<(u16, Pages)>>);

fn random_token() -> String {
  // RandomState is seeded from the OS RNG per instance: no extra crate needed.
  let mut token = String::new();
  for _ in 0..2 {
    let mut hasher = RandomState::new().build_hasher();
    hasher.write_u128(SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
    token.push_str(&format!("{:016x}", hasher.finish()));
  }
  token
}

fn respond(stream: &mut TcpStream, status: &str, content_type: &str, body: &[u8]) {
  let header = format!(
    "HTTP/1.0 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: strict-origin-when-cross-origin\r\nConnection: close\r\n\r\n",
    body.len()
  );
  let _ = stream.write_all(header.as_bytes());
  let _ = stream.write_all(body);
}

fn handle_connection(mut stream: TcpStream, pages: Pages) {
  let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
  let mut request_line = String::new();
  {
    let mut reader = BufReader::new(&stream);
    if reader.read_line(&mut request_line).is_err() {
      return;
    }
    // Drain the headers; the request body (if any) is irrelevant.
    let mut line = String::new();
    while reader.read_line(&mut line).map(|n| n > 2).unwrap_or(false) {
      line.clear();
    }
  }

  let mut parts = request_line.split_whitespace();
  let method = parts.next().unwrap_or("");
  let path = parts.next().unwrap_or("");
  let token = path.strip_prefix("/p/").unwrap_or("");
  if method != "GET" || token.is_empty() {
    respond(&mut stream, "404 Not Found", "text/plain; charset=utf-8", b"Not found");
    return;
  }
  let html = pages
    .lock()
    .ok()
    .and_then(|pages| pages.iter().find(|(key, _)| key == token).map(|(_, html)| html.clone()));
  match html {
    Some(html) => respond(&mut stream, "200 OK", "text/html; charset=utf-8", html.as_bytes()),
    None => respond(&mut stream, "404 Not Found", "text/plain; charset=utf-8", b"Not found"),
  }
}

fn start_server() -> Result<(u16, Pages), String> {
  let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| error.to_string())?;
  let port = listener.local_addr().map_err(|error| error.to_string())?.port();
  let pages: Pages = Arc::default();
  let server_pages = pages.clone();
  std::thread::spawn(move || {
    for stream in listener.incoming().flatten() {
      let pages = server_pages.clone();
      std::thread::spawn(move || handle_connection(stream, pages));
    }
  });
  Ok((port, pages))
}

/// Publish `html` on the loopback server and open it in the default browser.
/// Returns the page URL so the UI can show it.
#[tauri::command]
pub fn open_playlist_page(
  app: tauri::AppHandle,
  state: State<'_, PlaylistServerState>,
  html: String,
) -> Result<String, String> {
  let (port, pages) = {
    let mut guard = state.0.lock().map_err(|_| "playlist server state poisoned".to_string())?;
    if guard.is_none() {
      *guard = Some(start_server()?);
    }
    guard.clone().ok_or("playlist server not started")?
  };

  let token = random_token();
  {
    let mut pages = pages.lock().map_err(|_| "playlist pages poisoned".to_string())?;
    pages.push((token.clone(), html));
    let overflow = pages.len().saturating_sub(MAX_PAGES);
    pages.drain(..overflow);
  }

  let url = format!("http://127.0.0.1:{port}/p/{token}");
  app.opener().open_url(&url, None::<&str>).map_err(|error| error.to_string())?;
  Ok(url)
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::io::Read;

  fn get(port: u16, path: &str) -> String {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    stream.write_all(format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").as_bytes()).unwrap();
    let mut response = String::new();
    stream.read_to_string(&mut response).unwrap();
    response
  }

  #[test]
  fn serves_only_registered_tokens() {
    let (port, pages) = start_server().unwrap();
    let token = random_token();
    assert_eq!(token.len(), 32);
    pages.lock().unwrap().push((token.clone(), "<p>ok</p>".to_string()));

    let found = get(port, &format!("/p/{token}"));
    assert!(found.starts_with("HTTP/1.0 200 OK"));
    assert!(found.contains("text/html"));
    assert!(found.ends_with("<p>ok</p>"));

    assert!(get(port, "/p/other").starts_with("HTTP/1.0 404"));
    assert!(get(port, "/").starts_with("HTTP/1.0 404"));
  }
}
