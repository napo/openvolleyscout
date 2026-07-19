export interface PickFileFilter {
  name: string;
  /** Extensions without a leading dot, e.g. 'mp4'. */
  extensions: string[];
}

export const VIDEO_FILE_DIALOG_FILTERS: PickFileFilter[] = [
  { name: 'Video', extensions: ['mp4', 'webm', 'mkv', 'mov', 'avi', 'm4v', 'ogv'] },
];

/**
 * Opens a native file-open dialog and returns a real absolute path.
 *
 * Desktop-only (call only when `isTauri()`). A plain browser
 * `<input type="file">` never exposes a real filesystem path — Tauri only
 * attaches `File.path` for files dropped onto the window via native
 * drag-and-drop, not for one picked through a clicked `<input>` dialog. That
 * gap silently degraded a file's stored path down to just its bare name
 * (`getFilePath()`'s `?? file.name` fallback), which then 404/403s against
 * the asset-protocol scope on next resolution — a real absolute path from
 * this dialog avoids the gap entirely, and never requires a blob: URL or
 * loading the video's bytes into memory just to display it.
 */
export async function pickFilePath(filters?: PickFileFilter[]): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const path = await open({ multiple: false, directory: false, filters });
  return typeof path === 'string' ? path : null;
}
