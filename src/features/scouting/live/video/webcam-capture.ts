import { useEffect, useRef, useState } from 'react';

export interface WebcamDeviceOption {
  deviceId: string;
  label: string;
}

export async function listVideoInputDevices(): Promise<WebcamDeviceOption[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === 'videoinput')
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Camera ${index + 1}`,
    }));
}

export type WebcamStreamError = 'permission_denied' | 'not_found' | 'not_readable' | 'unavailable';

/**
 * getUserMedia rejects with a DOMException whose `name` says exactly why —
 * conflating them all into "permission denied" is actively misleading once
 * the user has already granted the permission prompt (the actual failure is
 * usually the camera being busy/unreachable at the OS level, common on
 * Linux where the webview's media backend depends on system camera plugins).
 */
function mapGetUserMediaError(error: unknown): WebcamStreamError {
  const name = error instanceof DOMException ? error.name : null;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'permission_denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'not_found';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'not_readable';
    default:
      return 'unavailable';
  }
}

export interface WebcamStreamState {
  stream: MediaStream | null;
  error: WebcamStreamError | null;
}

/** Opens a getUserMedia video-only stream for the given device while `active` is true. */
export function useWebcamStream(deviceId: string | undefined, active: boolean): WebcamStreamState {
  const [state, setState] = useState<WebcamStreamState>({ stream: null, error: null });
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!active) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setState({ stream: null, error: null });
      return undefined;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState({ stream: null, error: 'unavailable' });
      return undefined;
    }

    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        setState({ stream, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ stream: null, error: mapGetUserMediaError(error) });
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [deviceId, active]);

  return state;
}

const RECORDING_TIMESLICE_MS = 5000;
const RECORDING_FILE_NAME = 'recording.webm';

export type WebcamRecordingError = 'write_failed' | 'recorder_error' | 'unsupported';

export interface WebcamRecordingState {
  /** Absolute path of the file being written, available as soon as recording starts. */
  recordingPath: string | null;
  error: WebcamRecordingError | null;
}

function recordingDirName(sessionId: string) {
  return `webcam-recording-${sessionId}`;
}

/**
 * Records a MediaStream to a temp file under the app cache dir, flushing
 * chunks to disk as they arrive rather than buffering in memory — a set can
 * run 30-90 minutes, too long to hold as one in-memory Blob.
 */
export function useWebcamRecorder(
  stream: MediaStream | null,
  recording: boolean,
  sessionId: string,
): WebcamRecordingState {
  const [state, setState] = useState<WebcamRecordingState>({ recordingPath: null, error: null });
  const recorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    if (!recording || !stream) {
      recorderRef.current?.stop();
      recorderRef.current = null;
      return undefined;
    }

    if (typeof MediaRecorder === 'undefined') {
      setState({ recordingPath: null, error: 'unsupported' });
      return undefined;
    }

    // Only guards the async mkdir/remove setup below, before a recorder
    // exists — once `recorder.start()` runs, every chunk it emits (including
    // the final one MediaRecorder.stop() fires asynchronously afterwards)
    // must still be written, or every recording loses its last few seconds.
    let stopped = false;
    const relativePath = `${recordingDirName(sessionId)}/${RECORDING_FILE_NAME}`;

    const start = async () => {
      const { BaseDirectory, mkdir, remove, writeFile } = await import('@tauri-apps/plugin-fs');
      const { appCacheDir, join } = await import('@tauri-apps/api/path');

      await mkdir(recordingDirName(sessionId), { baseDir: BaseDirectory.AppCache, recursive: true }).catch(() => {});
      await remove(relativePath, { baseDir: BaseDirectory.AppCache }).catch(() => {});
      if (stopped) return;

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      // Chain each chunk's write onto the previous one instead of firing
      // them independently, so a slow write for an earlier chunk can't
      // resolve after a faster write for a later one and corrupt the file
      // with out-of-order bytes.
      let writeQueue = Promise.resolve();
      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) return;
        writeQueue = writeQueue
          .then(() => event.data.arrayBuffer())
          .then((buffer) => writeFile(relativePath, new Uint8Array(buffer), { baseDir: BaseDirectory.AppCache, append: true }))
          .catch(() => {
            setState((current) => ({ ...current, error: 'write_failed' }));
          });
      };
      recorder.onerror = () => setState((current) => ({ ...current, error: 'recorder_error' }));

      recorder.start(RECORDING_TIMESLICE_MS);

      const absolutePath = await join(await appCacheDir(), recordingDirName(sessionId), RECORDING_FILE_NAME);
      if (!stopped) setState({ recordingPath: absolutePath, error: null });
    };

    void start();

    return () => {
      stopped = true;
      recorderRef.current?.stop();
      recorderRef.current = null;
    };
  }, [recording, stream, sessionId]);

  return state;
}

/** Deletes a temp webcam recording once its scouting session is done. */
export async function deleteWebcamRecording(sessionId: string): Promise<void> {
  const { BaseDirectory, remove } = await import('@tauri-apps/plugin-fs');
  await remove(recordingDirName(sessionId), { baseDir: BaseDirectory.AppCache, recursive: true }).catch(() => {});
}
