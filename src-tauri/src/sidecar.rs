//! Shared resolution for bundled sidecar binaries (ffmpeg, go2rtc): both
//! live alongside the app executable, named after the platform's convention.

use std::path::PathBuf;

pub fn sidecar_path(unix_name: &str, windows_name: &str) -> Option<PathBuf> {
  let exe = std::env::current_exe().ok()?;
  let dir = exe.parent()?;
  let name = if cfg!(windows) { windows_name } else { unix_name };
  let path = dir.join(name);
  path.is_file().then_some(path)
}
