import { emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { MatchVideoSource } from '@src/domain/video/types';

export const VIDEO_POPOUT_WINDOW_LABEL = 'video-popout';
export const MAIN_WINDOW_LABEL = 'main';

const CHANNEL_READY = 'video-popout:ready';
const CHANNEL_INIT = 'video-popout:init';
const CHANNEL_COMMAND = 'video-popout:command';
const CHANNEL_TIME = 'video-popout:time';

/** The popout page's own React app takes a moment to mount after the OS
 * window exists, so it announces readiness rather than the main window
 * guessing a delay — emitTo has no queueing for listeners that aren't
 * registered yet. */
export function sendPopoutReady(): Promise<void> {
  return emitTo(MAIN_WINDOW_LABEL, CHANNEL_READY, undefined);
}

export function onPopoutReady(handler: () => void): Promise<UnlistenFn> {
  return listen(CHANNEL_READY, () => handler());
}

export interface VideoPopoutInitPayload {
  source: MatchVideoSource;
  startAtSeconds?: number;
}

export type VideoPopoutCommand =
  | { type: 'seek'; seconds: number; autoplay: boolean }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'rate'; value: number };

export interface VideoPopoutTimePayload {
  seconds: number | undefined;
}

export function sendPopoutInit(payload: VideoPopoutInitPayload): Promise<void> {
  return emitTo(VIDEO_POPOUT_WINDOW_LABEL, CHANNEL_INIT, payload);
}

export function onPopoutInit(handler: (payload: VideoPopoutInitPayload) => void): Promise<UnlistenFn> {
  return listen<VideoPopoutInitPayload>(CHANNEL_INIT, (event) => handler(event.payload));
}

export function sendPopoutCommand(command: VideoPopoutCommand): Promise<void> {
  return emitTo(VIDEO_POPOUT_WINDOW_LABEL, CHANNEL_COMMAND, command);
}

export function onPopoutCommand(handler: (command: VideoPopoutCommand) => void): Promise<UnlistenFn> {
  return listen<VideoPopoutCommand>(CHANNEL_COMMAND, (event) => handler(event.payload));
}

export function sendPopoutTime(payload: VideoPopoutTimePayload): Promise<void> {
  return emitTo(MAIN_WINDOW_LABEL, CHANNEL_TIME, payload);
}

export function onPopoutTime(handler: (payload: VideoPopoutTimePayload) => void): Promise<UnlistenFn> {
  return listen<VideoPopoutTimePayload>(CHANNEL_TIME, (event) => handler(event.payload));
}
