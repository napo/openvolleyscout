/**
 * Clip-montage export that copies the original encoded packets with
 * Mediabunny: no decoding or re-encoding, so it runs much faster than real
 * time, keeps the original quality and needs no WebCodecs, ffmpeg or native
 * sidecar. Works the same in browsers and in the desktop webview; only the
 * input Source and what happens to the returned bytes differ per platform.
 *
 * Like `ffmpeg -ss -c copy`, each clip starts at the key frame at or before
 * its requested start (the clip padding absorbs that slack). The action codes
 * travel as a WebVTT subtitle track (soft subtitles, not burned into pixels).
 */
import {
  BlobSource,
  BufferTarget,
  CustomSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  MATROSKA,
  MkvOutputFormat,
  MP4,
  MPEG_TS,
  Mp4OutputFormat,
  Output,
  QTFF,
  TextSubtitleSource,
  WEBM,
  type EncodedPacket,
  type InputAudioTrack,
  type InputVideoTrack,
  type MediaCodec,
  type OutputFormat,
  type Source,
} from 'mediabunny';
import type { ClipExportProgress, ClipInterval } from './clip-export';

// Re-exported so callers that load this module lazily get the input sources
// from the same chunk without importing the whole library namespace.
export { BlobSource, CustomSource };

export interface MediabunnyClipExportOptions {
  source: Source;
  intervals: readonly ClipInterval[];
  signal?: AbortSignal;
  onProgress?: (progress: ClipExportProgress) => void;
}

export interface MediabunnyClipExportResult {
  data: ArrayBuffer;
  mimeType: string;
  /** Without the leading dot, e.g. "mp4". */
  extension: string;
  /**
   * The same codes as an SRT document, or null without labels. Many players
   * built on FFmpeg (mpv, and FFmpeg itself) can't read WebVTT inside MP4 but
   * pick up a same-named .srt next to the video.
   */
  srt: string | null;
}

/** The input can't be copied (unknown container, no video track, unsupported codec). */
export class MediabunnyUnsupportedInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediabunnyUnsupportedInputError';
  }
}

function abortError(): DOMException {
  return new DOMException('Clip export aborted', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

/** MP4 when it can hold every track as-is (what most players expect), else Matroska. */
function pickOutputFormat(codecs: MediaCodec[]): OutputFormat {
  const mp4 = new Mp4OutputFormat({ fastStart: 'in-memory' });
  const mp4Codecs = mp4.getSupportedCodecs();
  if (codecs.every((codec) => mp4Codecs.includes(codec))) return mp4;
  const mkv = new MkvOutputFormat();
  const mkvCodecs = mkv.getSupportedCodecs();
  if (codecs.every((codec) => mkvCodecs.includes(codec))) return mkv;
  throw new MediabunnyUnsupportedInputError(`No output container can hold ${codecs.join(', ')}`);
}

function formatCueTime(seconds: number, fractionSeparator: '.' | ','): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor(totalSeconds / 60) % 60)}:${pad(totalSeconds % 60)}${fractionSeparator}${pad(ms, 3)}`;
}

interface Cue {
  start: number;
  end: number;
  text: string;
}

const toVtt = (cue: Cue) => `${formatCueTime(cue.start, '.')} --> ${formatCueTime(cue.end, '.')}\n${cue.text}\n\n`;
const toSrt = (cue: Cue, index: number) => `${index + 1}\n${formatCueTime(cue.start, ',')} --> ${formatCueTime(cue.end, ',')}\n${cue.text}\n\n`;

/** Cue text must not contain a blank line or the "-->" arrow. */
function sanitizeCueText(text: string): string {
  return text.replace(/-->/g, '->').replace(/\s*\n\s*/g, ' ').trim();
}

interface CopiedSegment {
  /** Timestamp, in source time, that maps to the segment's output start. */
  sourceStart: number;
  /** How much output time the segment occupies. */
  duration: number;
}

/**
 * Copies the video packets of one clip, starting at the key packet at or
 * before `interval.startSeconds` and stopping at the first packet presented
 * at or after `interval.endSeconds`. Iteration is in decode order: stopping
 * there never keeps a frame whose reference was dropped.
 */
async function copyVideoSegment(
  sink: EncodedPacketSink,
  target: EncodedVideoPacketSource,
  interval: ClipInterval,
  outputOffset: number,
  firstPacketMeta: () => EncodedVideoChunkMetadata | undefined,
  signal?: AbortSignal,
): Promise<CopiedSegment | null> {
  const keyPacket = await sink.getKeyPacket(interval.startSeconds, { verifyKeyPackets: true })
    ?? await sink.getFirstKeyPacket({ verifyKeyPackets: true });
  if (!keyPacket) return null;
  const sourceStart = keyPacket.timestamp;
  let presentedEnd = sourceStart;

  for await (const packet of sink.packets(keyPacket)) {
    throwIfAborted(signal);
    if (packet.timestamp >= interval.endSeconds) break;
    // Open-GOP leading frames are presented before the key frame and depend on
    // the previous GOP, which isn't copied.
    if (packet.timestamp < sourceStart) continue;
    await target.add(
      packet.clone({ timestamp: packet.timestamp - sourceStart + outputOffset }),
      firstPacketMeta(),
    );
    presentedEnd = Math.max(presentedEnd, packet.timestamp + packet.duration);
  }

  return { sourceStart, duration: presentedEnd - sourceStart };
}

async function copyAudioSegment(
  sink: EncodedPacketSink,
  target: EncodedAudioPacketSource,
  segment: CopiedSegment,
  outputOffset: number,
  firstPacketMeta: () => EncodedAudioChunkMetadata | undefined,
  signal?: AbortSignal,
) {
  const segmentEnd = segment.sourceStart + segment.duration;
  let packet: EncodedPacket | null = await sink.getPacket(segment.sourceStart)
    ?? await sink.getFirstPacket();
  // Audio packets are all key packets: start with the first one that fits
  // entirely inside the video segment, so audio never precedes the video.
  while (packet && packet.timestamp < segment.sourceStart) {
    packet = await sink.getNextPacket(packet);
  }
  if (!packet) return;

  for await (const audioPacket of sink.packets(packet)) {
    throwIfAborted(signal);
    if (audioPacket.timestamp + audioPacket.duration > segmentEnd) break;
    await target.add(
      audioPacket.clone({ timestamp: audioPacket.timestamp - segment.sourceStart + outputOffset }),
      firstPacketMeta(),
    );
  }
}

export async function exportClipsWithMediabunny({
  source,
  intervals,
  signal,
  onProgress,
}: MediabunnyClipExportOptions): Promise<MediabunnyClipExportResult> {
  // Camera and phone recordings: MP4/MOV, WebM/MKV, and MPEG-TS (.ts/.mts
  // from camcorders). Listing them, rather than ALL_FORMATS, keeps HLS and
  // audio-only demuxers out of the lazily loaded chunk.
  const input = new Input({ formats: [MP4, QTFF, WEBM, MATROSKA, MPEG_TS], source });
  let output: Output | null = null;
  try {
    const videoTrack: InputVideoTrack | null = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new MediabunnyUnsupportedInputError('The file has no video track');
    const audioTrack: InputAudioTrack | null = await videoTrack.getPrimaryPairableAudioTrack();

    const videoCodec = await videoTrack.getCodec();
    const videoConfig = await videoTrack.getDecoderConfig();
    if (!videoCodec || !videoConfig) throw new MediabunnyUnsupportedInputError('Unsupported video codec');
    const audioCodec = audioTrack ? await audioTrack.getCodec() : null;
    const audioConfig = audioTrack ? await audioTrack.getDecoderConfig() : null;
    const copyAudio = Boolean(audioTrack && audioCodec && audioConfig);

    const hasLabels = intervals.some((interval) => interval.labels.length > 0);
    const format = pickOutputFormat([
      videoCodec,
      ...(copyAudio && audioCodec ? [audioCodec] : []),
      ...(hasLabels ? ['webvtt' as const] : []),
    ]);

    const target = new BufferTarget();
    output = new Output({ format, target });
    const videoSource = new EncodedVideoPacketSource(videoCodec);
    output.addVideoTrack(videoSource, { rotation: await videoTrack.getRotation() });
    const audioSource = copyAudio && audioCodec ? new EncodedAudioPacketSource(audioCodec) : null;
    if (audioSource) output.addAudioTrack(audioSource);
    const subtitleSource = hasLabels ? new TextSubtitleSource('webvtt') : null;
    if (subtitleSource) output.addSubtitleTrack(subtitleSource);
    await output.start();

    // Decoder configs ride along with the first packet of each track only.
    let videoMetaSent = false;
    const videoMeta = () => {
      if (videoMetaSent) return undefined;
      videoMetaSent = true;
      return { decoderConfig: videoConfig };
    };
    let audioMetaSent = false;
    const audioMeta = () => {
      if (audioMetaSent || !audioConfig) return undefined;
      audioMetaSent = true;
      return { decoderConfig: audioConfig };
    };

    const videoSink = new EncodedPacketSink(videoTrack);
    const audioSink = audioTrack && audioSource ? new EncodedPacketSink(audioTrack) : null;
    // Cues are added per clip, as the packets are, so the muxer can keep
    // interleaving tracks instead of waiting on the subtitle track.
    if (subtitleSource) await subtitleSource.add('WEBVTT\n\n');
    const allCues: Cue[] = [];
    let outputOffset = 0;

    for (const [index, interval] of intervals.entries()) {
      throwIfAborted(signal);
      const segment = await copyVideoSegment(videoSink, videoSource, interval, outputOffset, videoMeta, signal);
      if (segment && segment.duration > 0) {
        if (audioSink && audioSource) {
          await copyAudioSegment(audioSink, audioSource, segment, outputOffset, audioMeta, signal);
        }
        const segmentOutputEnd = outputOffset + segment.duration;
        const cues = interval.labels.flatMap((label): Cue[] => {
          const start = outputOffset + Math.max(0, label.startSeconds - segment.sourceStart);
          const end = Math.min(segmentOutputEnd, outputOffset + (label.endSeconds - segment.sourceStart));
          return end > start ? [{ start, end, text: sanitizeCueText(label.text) }] : [];
        });
        if (subtitleSource && cues.length > 0) await subtitleSource.add(cues.map(toVtt).join(''));
        allCues.push(...cues);
        outputOffset = segmentOutputEnd;
      }
      onProgress?.({ clipIndex: index + 1, clipCount: intervals.length, fraction: (index + 1) / (intervals.length + 1) });
    }

    if (outputOffset === 0) throw new MediabunnyUnsupportedInputError('No video packets in the requested clips');
    throwIfAborted(signal);
    await output.finalize();
    onProgress?.({ clipIndex: intervals.length, clipCount: intervals.length, fraction: 1 });

    if (!target.buffer) throw new Error('Clip export produced no output');
    return {
      data: target.buffer,
      mimeType: format.mimeType,
      extension: format.fileExtension.replace(/^\./, ''),
      srt: allCues.length > 0 ? allCues.map(toSrt).join('') : null,
    };
  } catch (error) {
    if (output && output.state !== 'finalized' && output.state !== 'canceled') {
      await output.cancel().catch(() => {});
    }
    throw error;
  } finally {
    input.dispose();
  }
}
