// SPDX-License-Identifier: AGPL-3.0-or-later
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  isSharedPlaylistExpired,
} from '@src/features/analysis/video/youtube-share-link';

export interface SharedMatchStats {
  title: string;
  matchLabel: string;
  svg: string;
  expiresAt: number;
  generatedAt?: number;
}

const MAX_BYTES = 2_000_000;
const MAX_LINK_LENGTH = 180_000;

export const SHARED_STATS_ROUTE = '/stats-viewer';

/** Like video and tactical report links, expiry is enforced by the viewer, not server-side access control. */
export function isSharedStatsExpired(stats: Pick<SharedMatchStats, 'expiresAt'>, now = Date.now()): boolean {
  return isSharedPlaylistExpired({ expiresAt: stats.expiresAt }, now);
}

export function encodeSharedStats(stats: SharedMatchStats): string {
  const bytes = strToU8(JSON.stringify(stats));
  if (bytes.length > MAX_BYTES) {
    throw new Error('Match statistics snapshot exceeds sharing size limit');
  }
  const payload = `1.${bytesToBase64Url(deflateSync(bytes, { level: 9 }))}`;
  if (payload.length > MAX_LINK_LENGTH) {
    throw new Error('Match statistics link exceeds sharing size limit');
  }
  return payload;
}

export function decodeSharedStats(payload: string): SharedMatchStats | null {
  if (!payload || payload.length > MAX_LINK_LENGTH || !/^1\.[\w-]+$/.test(payload)) {
    return null;
  }
  try {
    // Bounded decompression buffer protects the viewer against untrusted link payloads.
    const bytes = inflateSync(base64UrlToBytes(payload.slice(2)), { out: new Uint8Array(MAX_BYTES + 1) });
    const json = strFromU8(bytes).replace(/\0+$/, '');
    if (strToU8(json).length > MAX_BYTES) {
      return null;
    }
    const value = JSON.parse(json) as Partial<SharedMatchStats>;
    if (
      !value
      || typeof value.title !== 'string'
      || value.title.length > 1000
      || typeof value.matchLabel !== 'string'
      || value.matchLabel.length > 1000
      || typeof value.svg !== 'string'
      || !/^<svg\b/.test(value.svg)
      || typeof value.expiresAt !== 'number'
      || !Number.isFinite(value.expiresAt)
    ) {
      return null;
    }
    const generatedAt = typeof value.generatedAt === 'number' && Number.isFinite(value.generatedAt)
      ? value.generatedAt
      : undefined;
    return {
      title: value.title,
      matchLabel: value.matchLabel,
      svg: value.svg,
      expiresAt: value.expiresAt,
      ...(generatedAt !== undefined ? { generatedAt } : {}),
    };
  } catch {
    return null;
  }
}

export function buildSharedStatsUrl(baseUrl: string, stats: SharedMatchStats): string {
  return `${baseUrl.replace(/[#?].*$/, '').replace(/\/+$/, '')}/#${SHARED_STATS_ROUTE}/${encodeSharedStats(stats)}`;
}
