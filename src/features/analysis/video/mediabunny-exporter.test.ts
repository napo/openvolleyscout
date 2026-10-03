import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALL_FORMATS, BlobSource, BufferSource, EncodedPacketSink, Input } from 'mediabunny';
import type { ClipInterval } from './clip-export';
import { exportClipsWithMediabunny } from './mediabunny-exporter';

// 12 s, 25 fps, one key frame per second, H.264 with B-frames + AAC (and a
// VP9 + Opus WebM twin), generated with ffmpeg's testsrc/sine sources.
const fixture = (name: string) => new BlobSource(new Blob([
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))),
]));

const interval = (startSeconds: number, endSeconds: number, text = 'a5AH#'): ClipInterval => ({
  startSeconds,
  endSeconds,
  labels: [{ startSeconds, endSeconds, text }],
});

async function inspect(data: ArrayBuffer) {
  const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(data) });
  const video = await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();
  const timestamps: number[] = [];
  for await (const packet of new EncodedPacketSink(video!).packets()) timestamps.push(packet.timestamp);
  return {
    video,
    audio,
    duration: await input.computeDuration(),
    timestamps: timestamps.sort((a, b) => a - b),
  };
}

describe('exportClipsWithMediabunny', () => {
  it('copies H.264/AAC clips back to back into an MP4 with a subtitle track', async () => {
    const progress: number[] = [];
    // Starts between key frames (1 s GOP) so each clip expands to the previous key frame.
    const result = await exportClipsWithMediabunny({
      source: fixture('clip-source.mp4'),
      intervals: [interval(2.4, 4), interval(8.5, 10)],
      onProgress: (p) => progress.push(p.fraction),
    });

    expect(result.extension).toBe('mp4');
    expect(result.mimeType).toContain('mp4');
    const out = await inspect(result.data);
    expect(out.video?.codec).toBe('avc');
    expect(out.audio?.codec).toBe('aac');
    // Mediabunny doesn't demux subtitle tracks back: check the WebVTT
    // sample entry and the cue payload in the bytes instead.
    const bytes = new TextDecoder('latin1').decode(result.data);
    expect(bytes).toContain('wvtt');
    expect(bytes).toContain('a5AH#');
    // Clip 1 = 2.0–4.0 s, clip 2 = 8.0–10.0 s: about 4 s of output in total.
    expect(out.duration).toBeGreaterThan(3.8);
    expect(out.duration).toBeLessThan(4.3);
    // Continuous timeline from zero with no gaps between the two clips.
    expect(out.timestamps[0]).toBeCloseTo(0, 2);
    const gaps = out.timestamps.slice(1).map((t, i) => t - out.timestamps[i]);
    expect(Math.max(...gaps)).toBeLessThan(0.05);
    expect(progress.at(-1)).toBe(1);
    // Clip 1 output 0–2 s (requested 2.4 s sits 0.4 s after its key frame at 2.0 s).
    expect(result.srt).toContain('1\n00:00:00,400 --> 00:00:02,000\na5AH#');
    expect(result.srt).toContain('2\n00:00:02,500 --> 00:00:04,000\na5AH#');
  });

  it('copies VP9/Opus from WebM', async () => {
    const result = await exportClipsWithMediabunny({
      source: fixture('clip-source.webm'),
      intervals: [interval(1, 3)],
    });
    const out = await inspect(result.data);
    expect(out.video?.codec).toBe('vp9');
    expect(out.audio?.codec).toBe('opus');
    expect(out.duration).toBeGreaterThan(1.8);
    expect(out.duration).toBeLessThan(2.3);
  });

  it('stops when aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(exportClipsWithMediabunny({
      source: fixture('clip-source.mp4'),
      intervals: [interval(1, 3)],
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
