import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export type RtspStreamError = 'connect_failed' | 'unavailable';

export interface RtspStreamState {
  stream: MediaStream | null;
  error: RtspStreamError | null;
}

interface RtspRelayInfo {
  apiBase: string;
}

// go2rtc's /api/webrtc is a non-trickle WHEP endpoint: the offer must carry
// every ICE candidate up front, so gathering has to finish before the single
// POST — this waits for it, capped so a webview that never fires
// 'complete' can't hang the connection forever.
const ICE_GATHERING_TIMEOUT_MS = 2000;
// Overall connect timeout: browsers can be slow to report connectionState
// 'failed' outright, so an unreachable camera needs its own deadline too.
const CONNECT_TIMEOUT_MS = 10000;
const STREAM_NAME = 'live';

function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', onChange);
      resolve();
    }, ICE_GATHERING_TIMEOUT_MS);
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') {
        window.clearTimeout(timeoutId);
        pc.removeEventListener('icegatheringstatechange', onChange);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', onChange);
  });
}

/**
 * Bridges an RTSP camera to a MediaStream via the go2rtc sidecar (started
 * on demand by the Rust `start_rtsp_relay` command) over WebRTC. The relay
 * process itself is left running once started — only the peer connection
 * here reacts to `active`; call `stopRtspRelay()` separately to actually
 * shut the sidecar down (on explicit source removal, not on every
 * deactivation — killing/respawning a subprocess per toggle risks a port
 * race on fast collapse/expand).
 */
export function useRtspStream(url: string | undefined, active: boolean): RtspStreamState {
  const [state, setState] = useState<RtspStreamState>({ stream: null, error: null });
  const pcRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    if (!active || !url) {
      pcRef.current?.close();
      pcRef.current = null;
      setState({ stream: null, error: null });
      return undefined;
    }

    if (typeof RTCPeerConnection === 'undefined') {
      setState({ stream: null, error: 'unavailable' });
      return undefined;
    }

    let cancelled = false;
    let connectTimeoutId: number | undefined;

    const connect = async () => {
      try {
        const relay = await invoke<RtspRelayInfo>('start_rtsp_relay');
        if (cancelled) return;

        // Best-effort registration: go2rtc registers the stream in memory
        // even when it reports it can't persist to a config file (there is
        // none here — the sidecar runs off an inline config string).
        await fetch(
          `${relay.apiBase}/api/streams?name=${encodeURIComponent(STREAM_NAME)}&src=${encodeURIComponent(url)}`,
          { method: 'PUT' },
        );
        if (cancelled) return;

        const pc = new RTCPeerConnection({ iceServers: [] });
        pcRef.current = pc;

        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.ontrack = (event) => {
          if (cancelled) return;
          setState({ stream: event.streams[0] ?? null, error: null });
        };
        pc.onconnectionstatechange = () => {
          if (!cancelled && pc.connectionState === 'failed') {
            setState({ stream: null, error: 'connect_failed' });
          }
        };

        connectTimeoutId = window.setTimeout(() => {
          if (!cancelled && pc.connectionState !== 'connected') {
            setState({ stream: null, error: 'connect_failed' });
          }
        }, CONNECT_TIMEOUT_MS);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitForIceGathering(pc);
        if (cancelled) return;

        // A camera go2rtc can't reach fails fast here (HTTP 500), before any
        // ICE/connection-state wait would otherwise be needed.
        const response = await fetch(`${relay.apiBase}/api/webrtc?src=${encodeURIComponent(STREAM_NAME)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: pc.localDescription?.sdp ?? '',
        });
        if (cancelled) return;
        if (!response.ok) {
          setState({ stream: null, error: 'connect_failed' });
          return;
        }

        const answerSdp = await response.text();
        if (cancelled) return;
        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      } catch {
        if (!cancelled) setState({ stream: null, error: 'connect_failed' });
      }
    };

    void connect();

    return () => {
      cancelled = true;
      if (connectTimeoutId !== undefined) window.clearTimeout(connectTimeoutId);
      pcRef.current?.close();
      pcRef.current = null;
    };
  }, [url, active]);

  return state;
}

/** Stops the go2rtc sidecar process. Call on explicit source removal or app teardown, not on every deactivation. */
export async function stopRtspRelay(): Promise<void> {
  await invoke('stop_rtsp_relay').catch(() => {});
}
