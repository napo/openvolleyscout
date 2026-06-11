/**
 * Web export path for the filtered clip sequence: plays the clips on a hidden
 * video element, composites each frame onto a canvas with the action codes
 * burned in bottom-left, and records the canvas stream with MediaRecorder
 * into a WebM (or MP4 on Safari) blob. Recording is real-time, so the tab
 * must stay in the foreground. Local-file sources only; YouTube iframes
 * expose no media data. Desktop Tauri builds use the ffmpeg-sidecar exporter
 * behind the same ClipInterval/ClipExportProgress contract.
 */
import type { ClipExportProgress, ClipInterval } from './clip-export';

interface CapturableVideo extends HTMLVideoElement {
  captureStream?: () => MediaStream;
  /** Firefox still ships captureStream behind the moz prefix. */
  mozCaptureStream?: () => MediaStream;
}

export function supportsMediaRecorderClipExport(): boolean {
  if (typeof MediaRecorder === 'undefined' || typeof document === 'undefined') return false;
  // The recorded video track comes from the compositing canvas; the video
  // element capture is only the audio fallback.
  return typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

export function clipExportFileExtension(mimeType: string): string {
  return mimeType.includes('mp4') ? 'mp4' : 'webm';
}

function abortError(): DOMException {
  return new DOMException('Clip export aborted', 'AbortError');
}

export function isClipExportAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: keyof HTMLVideoElementEventMap,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const cleanup = () => {
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Video failed to load'));
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    video.addEventListener(eventName, onEvent);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort);
  });
}

async function seekVideo(video: HTMLVideoElement, seconds: number, signal?: AbortSignal): Promise<void> {
  if (Math.abs(video.currentTime - seconds) < 0.05) return;
  const seeked = waitForVideoEvent(video, 'seeked', signal);
  video.currentTime = seconds;
  await seeked;
}

function playUntil(
  video: HTMLVideoElement,
  endSeconds: number,
  signal: AbortSignal | undefined,
  onTick: (currentTimeSeconds: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const cleanup = () => {
      window.clearInterval(intervalId);
      video.removeEventListener('timeupdate', check);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const check = () => {
      onTick(video.currentTime);
      if (video.currentTime >= endSeconds - 0.05 || video.ended) {
        cleanup();
        resolve();
      }
    };
    const onError = () => {
      cleanup();
      reject(new Error('Video playback failed'));
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    // timeupdate fires ~4 Hz; the interval tightens the cut and keeps the
    // export alive when timeupdate stalls.
    const intervalId = window.setInterval(check, 100);
    video.addEventListener('timeupdate', check);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort);
  });
}

/** Burn the codes of the labels active at `currentTime` into the frame. */
function drawClipLabels(
  context: CanvasRenderingContext2D,
  clip: ClipInterval,
  currentTimeSeconds: number,
  width: number,
  height: number,
): void {
  const texts = clip.labels
    .filter((label) => currentTimeSeconds >= label.startSeconds && currentTimeSeconds <= label.endSeconds)
    .map((label) => label.text);
  if (texts.length === 0) return;

  const fontSize = Math.max(16, Math.round(height * 0.05));
  const margin = Math.max(8, Math.round(height * 0.03));
  const paddingX = Math.round(fontSize * 0.5);
  const lineHeight = Math.round(fontSize * 1.5);
  context.font = `bold ${fontSize}px sans-serif`;
  context.textBaseline = 'middle';

  texts.forEach((text, index) => {
    const boxWidth = Math.ceil(context.measureText(text).width) + paddingX * 2;
    const top = height - margin - lineHeight * (texts.length - index);
    context.fillStyle = 'rgba(0, 0, 0, 0.65)';
    context.fillRect(margin, top, boxWidth, lineHeight);
    context.fillStyle = '#ffffff';
    context.fillText(text, margin + paddingX, top + lineHeight / 2);
  });
}

export interface MediaRecorderClipExportOptions {
  videoUrl: string;
  intervals: readonly ClipInterval[];
  signal?: AbortSignal;
  onProgress?: (progress: ClipExportProgress) => void;
}

export async function exportClipsWithMediaRecorder({
  videoUrl,
  intervals,
  signal,
  onProgress,
}: MediaRecorderClipExportOptions): Promise<Blob> {
  if (!supportsMediaRecorderClipExport()) {
    throw new Error('MediaRecorder clip export is not supported in this browser');
  }
  if (intervals.length === 0) {
    throw new Error('No clips to export');
  }

  const video = document.createElement('video') as CapturableVideo;
  video.preload = 'auto';
  video.playsInline = true;
  // Keep the element rendered but out of view: display:none would let some
  // browsers stop decoding frames and produce an empty recording.
  video.style.position = 'fixed';
  video.style.left = '-10000px';
  video.style.width = '320px';
  video.src = videoUrl;
  document.body.appendChild(video);

  let audioContext: AudioContext | null = null;
  let recorder: MediaRecorder | null = null;
  let rafId = 0;
  try {
    await waitForVideoEvent(video, 'loadedmetadata', signal);
    const duration = Number.isFinite(video.duration) ? video.duration : Number.POSITIVE_INFINITY;
    const clips = intervals
      .map((interval) => ({
        ...interval,
        startSeconds: Math.min(interval.startSeconds, duration),
        endSeconds: Math.min(interval.endSeconds, duration),
      }))
      .filter((interval) => interval.endSeconds - interval.startSeconds > 0.05);
    if (clips.length === 0) {
      throw new Error('No clips fall inside the video duration');
    }

    // Composite each frame onto a canvas so the action codes are burned into
    // the recorded pixels, bottom-left.
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D context unavailable');
    }
    let activeClip: ClipInterval | null = null;
    const drawFrame = () => {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (activeClip) {
        drawClipLabels(context, activeClip, video.currentTime, canvas.width, canvas.height);
      }
      rafId = window.requestAnimationFrame(drawFrame);
    };
    rafId = window.requestAnimationFrame(drawFrame);

    const canvasStream = canvas.captureStream();
    let audioTracks: MediaStreamTrack[] = [];
    try {
      // Route audio through WebAudio: the export stays silent for the user
      // while the recorded track keeps the original sound.
      audioContext = new AudioContext();
      await audioContext.resume();
      const sourceNode = audioContext.createMediaElementSource(video);
      const destination = audioContext.createMediaStreamDestination();
      sourceNode.connect(destination);
      audioTracks = destination.stream.getAudioTracks();
    } catch {
      // No WebAudio routing available: mute to avoid playing the export out
      // loud and take the audio from the element capture, accepting that
      // some browsers will then record silent audio.
      video.muted = true;
      try {
        const capture = video.captureStream ?? video.mozCaptureStream;
        audioTracks = capture ? capture.call(video).getAudioTracks() : [];
      } catch {
        audioTracks = [];
      }
    }
    const recordedStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);

    const mimeType = MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate));
    recorder = new MediaRecorder(recordedStream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder!.onstop = () => resolve();
    });

    const totalSeconds = clips.reduce((sum, clip) => sum + (clip.endSeconds - clip.startSeconds), 0);
    let completedSeconds = 0;

    for (let index = 0; index < clips.length; index += 1) {
      if (signal?.aborted) throw abortError();
      const clip = clips[index];
      activeClip = clip;
      await seekVideo(video, clip.startSeconds, signal);
      // Pausing the recorder across seeks keeps the gaps out of the output.
      if (index === 0) {
        recorder.start(1000);
      } else {
        recorder.resume();
      }
      await video.play();
      await playUntil(video, clip.endSeconds, signal, (currentTimeSeconds) => {
        const clipDoneSeconds = Math.max(0, currentTimeSeconds - clip.startSeconds);
        onProgress?.({
          clipIndex: index + 1,
          clipCount: clips.length,
          fraction: Math.min(1, (completedSeconds + clipDoneSeconds) / totalSeconds),
        });
      });
      video.pause();
      completedSeconds += clip.endSeconds - clip.startSeconds;
      if (index < clips.length - 1) recorder.pause();
    }

    recorder.stop();
    await stopped;
    onProgress?.({ clipIndex: clips.length, clipCount: clips.length, fraction: 1 });
    return new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
  } finally {
    window.cancelAnimationFrame(rafId);
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // Already stopped.
      }
    }
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    void audioContext?.close().catch(() => {});
  }
}
