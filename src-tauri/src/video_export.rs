//! Desktop export of the filtered clip sequence via the bundled minimal
//! ffmpeg sidecar (stream-copy only: no real encoders, decoders or filters).
//! Each interval is cut with `-ss/-t -c copy`, the segments are joined with
//! the concat demuxer and the result lands in the user's Downloads folder.
//! The action codes become a soft ASS subtitle track (bottom-left), muxed
//! without re-encoding. The output is always Matroska: it is the container
//! that embeds ASS natively with its styling, and it accepts nearly every
//! codec in stream copy. Cuts align to the previous keyframe; the actual
//! segment durations are probed so the subtitle timing follows the
//! concatenated timeline, and the clip padding absorbs the keyframe slack.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

const PROGRESS_EVENT: &str = "video-clip-export-progress";

#[derive(Default)]
pub struct ClipExportFlags {
  running: AtomicBool,
  cancelled: AtomicBool,
}

#[derive(Default)]
pub struct ClipExportState(pub Arc<ClipExportFlags>);

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClipIntervalArg {
  pub start_seconds: f64,
  pub end_seconds: f64,
  #[serde(default)]
  pub labels: Vec<ClipLabelArg>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClipLabelArg {
  pub start_seconds: f64,
  pub end_seconds: f64,
  pub text: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ClipExportProgressEvent {
  clip_index: usize,
  clip_count: usize,
  fraction: f64,
}

fn ffmpeg_sidecar_path() -> Option<PathBuf> {
  let exe = std::env::current_exe().ok()?;
  let dir = exe.parent()?;
  let name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
  let path = dir.join(name);
  path.is_file().then_some(path)
}

#[tauri::command]
pub fn clip_export_available() -> bool {
  ffmpeg_sidecar_path().is_some()
}

#[tauri::command]
pub fn cancel_video_clip_export(state: State<'_, ClipExportState>) {
  state.0.cancelled.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub async fn export_video_clips(
  app: AppHandle,
  state: State<'_, ClipExportState>,
  input_path: String,
  intervals: Vec<ClipIntervalArg>,
  output_base_name: String,
) -> Result<String, String> {
  let flags = state.0.clone();
  if flags.running.swap(true, Ordering::SeqCst) {
    return Err("export already running".into());
  }
  flags.cancelled.store(false, Ordering::SeqCst);

  let result = tauri::async_runtime::spawn_blocking({
    let flags = flags.clone();
    move || run_export(&app, &flags, &input_path, &intervals, &output_base_name)
  })
  .await
  .map_err(|error| error.to_string())
  .and_then(|inner| inner);

  flags.running.store(false, Ordering::SeqCst);
  result
}

fn run_export(
  app: &AppHandle,
  flags: &ClipExportFlags,
  input_path: &str,
  intervals: &[ClipIntervalArg],
  output_base_name: &str,
) -> Result<String, String> {
  let ffmpeg = ffmpeg_sidecar_path().ok_or("ffmpeg sidecar not found")?;
  let input = PathBuf::from(input_path);
  if !input.is_file() {
    return Err(format!("input video not found: {input_path}"));
  }
  let clips: Vec<ClipIntervalArg> = intervals
    .iter()
    .cloned()
    .filter(|clip| clip.end_seconds - clip.start_seconds > 0.05)
    .collect();
  if clips.is_empty() {
    return Err("no clips to export".into());
  }

  // Always Matroska: the only mainstream container that embeds the ASS
  // track with its bottom-left styling intact, whatever the input codecs.
  let extension = "mkv";
  let cache_dir = app.path().app_cache_dir().map_err(|error| error.to_string())?;
  let work_dir = cache_dir.join(format!("clip-export-{}", std::process::id()));
  fs::create_dir_all(&work_dir).map_err(|error| error.to_string())?;

  let result = cut_and_concat(app, flags, &ffmpeg, &input, &clips, extension, &work_dir, output_base_name);
  let _ = fs::remove_dir_all(&work_dir);
  result
}

#[allow(clippy::too_many_arguments)]
fn cut_and_concat(
  app: &AppHandle,
  flags: &ClipExportFlags,
  ffmpeg: &Path,
  input: &Path,
  clips: &[ClipIntervalArg],
  extension: &str,
  work_dir: &Path,
  output_base_name: &str,
) -> Result<String, String> {
  // The concat pass counts as one extra step for the progress fraction.
  let step_count = clips.len() + 1;
  let mut concat_list = String::new();
  let mut subtitle_events = String::new();
  // Start of the current segment on the concatenated output timeline.
  let mut output_offset = 0.0_f64;

  for (index, clip) in clips.iter().enumerate() {
    if flags.cancelled.load(Ordering::SeqCst) {
      return Err("cancelled".into());
    }
    let requested_duration = clip.end_seconds - clip.start_seconds;
    let segment_name = format!("segment-{index:04}.{extension}");
    let segment = work_dir.join(&segment_name);
    run_ffmpeg(ffmpeg, &[
      "-ss".into(),
      format!("{:.3}", clip.start_seconds.max(0.0)),
      "-t".into(),
      format!("{:.3}", requested_duration),
      "-i".into(),
      input.to_string_lossy().into_owned(),
      "-c".into(),
      "copy".into(),
      "-avoid_negative_ts".into(),
      "make_zero".into(),
      segment.to_string_lossy().into_owned(),
    ])?;
    concat_list.push_str(&format!("file '{segment_name}'\n"));

    // Stream copy starts the segment at the keyframe before the requested
    // time: probe the real duration so the subtitle windows track the extra
    // footage at the head of the segment.
    let actual_duration = probe_duration_seconds(ffmpeg, &segment).unwrap_or(requested_duration);
    let keyframe_slack = (actual_duration - requested_duration).max(0.0);
    for label in &clip.labels {
      let event_start = output_offset + (label.start_seconds - clip.start_seconds).max(0.0) + keyframe_slack;
      let event_end = (output_offset + (label.end_seconds - clip.start_seconds) + keyframe_slack)
        .min(output_offset + actual_duration);
      if event_end > event_start {
        subtitle_events.push_str(&format!(
          "Dialogue: 0,{},{},Code,,0,0,0,,{}\n",
          format_ass_time(event_start),
          format_ass_time(event_end),
          sanitize_ass_text(&label.text),
        ));
      }
    }
    output_offset += actual_duration;

    emit_progress(app, index + 1, clips.len(), (index + 1) as f64 / step_count as f64);
  }

  if flags.cancelled.load(Ordering::SeqCst) {
    return Err("cancelled".into());
  }

  let list_path = work_dir.join("concat.txt");
  fs::write(&list_path, concat_list).map_err(|error| error.to_string())?;

  let downloads = app.path().download_dir().map_err(|error| error.to_string())?;
  let base_name = sanitize_base_name(output_base_name);
  let output = unique_output_path(&downloads, &base_name, extension);

  let mut args: Vec<String> = vec![
    "-f".into(),
    "concat".into(),
    "-safe".into(),
    "0".into(),
    "-i".into(),
    list_path.to_string_lossy().into_owned(),
  ];
  if subtitle_events.is_empty() {
    args.extend(["-c".into(), "copy".into()]);
  } else {
    let subs_path = work_dir.join("codes.ass");
    fs::write(&subs_path, ass_document(&subtitle_events)).map_err(|error| error.to_string())?;
    args.extend([
      "-i".into(),
      subs_path.to_string_lossy().into_owned(),
      "-map".into(),
      "0:v:0".into(),
      "-map".into(),
      "0:a?".into(),
      "-map".into(),
      "1:0".into(),
      "-c".into(),
      "copy".into(),
    ]);
  }
  args.push(output.to_string_lossy().into_owned());
  run_ffmpeg(ffmpeg, &args)?;

  emit_progress(app, clips.len(), clips.len(), 1.0);
  Ok(output.to_string_lossy().into_owned())
}

/// ASS document with a single bottom-left style (Alignment=1) drawn on an
/// opaque box (BorderStyle=3), so players render the codes like the burned-in
/// web overlay.
fn ass_document(events: &str) -> String {
  format!(
    "[Script Info]\n\
     ScriptType: v4.00+\n\
     PlayResX: 1280\n\
     PlayResY: 720\n\
     \n\
     [V4+ Styles]\n\
     Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n\
     Style: Code,Arial,36,&H00FFFFFF,&H00FFFFFF,&H00000000,&HA0000000,1,0,0,0,100,100,0,0,3,4,0,1,24,24,24,1\n\
     \n\
     [Events]\n\
     Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n\
     {events}"
  )
}

fn format_ass_time(seconds: f64) -> String {
  let total_centiseconds = (seconds.max(0.0) * 100.0).round() as u64;
  let centiseconds = total_centiseconds % 100;
  let total_seconds = total_centiseconds / 100;
  format!(
    "{}:{:02}:{:02}.{:02}",
    total_seconds / 3600,
    (total_seconds % 3600) / 60,
    total_seconds % 60,
    centiseconds,
  )
}

/// Strip characters with ASS markup meaning; codes are plain ASCII anyway.
fn sanitize_ass_text(text: &str) -> String {
  text
    .chars()
    .filter(|character| !matches!(character, '{' | '}' | '\\' | '\n' | '\r'))
    .collect()
}

/// Read a container duration by parsing `ffmpeg -i` stderr: the minimal
/// build has no ffprobe, but ffmpeg always prints the input summary.
fn probe_duration_seconds(ffmpeg: &Path, file: &Path) -> Option<f64> {
  let mut command = Command::new(ffmpeg);
  command.arg("-nostdin").arg("-hide_banner").arg("-i").arg(file);
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
  }
  let output = command.output().ok()?;
  let stderr = String::from_utf8_lossy(&output.stderr);
  let line = stderr.lines().find(|line| line.trim_start().starts_with("Duration:"))?;
  let value = line.trim_start().strip_prefix("Duration:")?.trim().split(',').next()?.trim();
  let mut parts = value.split(':');
  let hours: f64 = parts.next()?.parse().ok()?;
  let minutes: f64 = parts.next()?.parse().ok()?;
  let seconds: f64 = parts.next()?.parse().ok()?;
  Some(hours * 3600.0 + minutes * 60.0 + seconds)
}

fn run_ffmpeg(ffmpeg: &Path, args: &[String]) -> Result<(), String> {
  let mut command = Command::new(ffmpeg);
  command
    .arg("-nostdin")
    .arg("-hide_banner")
    .arg("-loglevel")
    .arg("error")
    .arg("-y")
    .args(args);
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
  }
  let output = command
    .output()
    .map_err(|error| format!("failed to run ffmpeg: {error}"))?;
  if output.status.success() {
    return Ok(());
  }
  let stderr = String::from_utf8_lossy(&output.stderr);
  let mut tail: Vec<&str> = stderr.lines().rev().take(5).collect();
  tail.reverse();
  Err(format!("ffmpeg failed: {}", tail.join("\n")))
}

fn emit_progress(app: &AppHandle, clip_index: usize, clip_count: usize, fraction: f64) {
  let _ = app.emit(
    PROGRESS_EVENT,
    ClipExportProgressEvent { clip_index, clip_count, fraction },
  );
}

fn sanitize_base_name(value: &str) -> String {
  let safe: String = value
    .chars()
    .filter(|character| character.is_alphanumeric() || matches!(character, '-' | '_'))
    .collect();
  if safe.is_empty() { "clips".into() } else { safe }
}

fn unique_output_path(dir: &Path, base_name: &str, extension: &str) -> PathBuf {
  let mut candidate = dir.join(format!("{base_name}.{extension}"));
  let mut counter = 1;
  while candidate.exists() {
    candidate = dir.join(format!("{base_name}-{counter}.{extension}"));
    counter += 1;
  }
  candidate
}
