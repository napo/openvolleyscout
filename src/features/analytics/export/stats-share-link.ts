// SPDX-License-Identifier: AGPL-3.0-or-later
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  isSharedPlaylistExpired,
} from '@src/features/analysis/video/youtube-share-link';
import { STATS_VIEWER_PREVIEW_PATH } from './stats-preview';

export type SharedStatsTabId =
  | 'report'
  | 'team-performance'
  | 'player-performance'
  | 'sideout-study'
  | 'cross-rotation'
  | 'play-by-play'
  | 'trends'
  | 'notes'
  | 'generic';

export type SharedStatsBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'svg'; svg: string };

export interface SharedMatchStatsV1 {
  version?: 1;
  title: string;
  matchLabel: string;
  svg: string;
  expiresAt: number;
  generatedAt?: number;
}

export interface SharedMatchStatsV2 {
  version: 2;
  tabId: SharedStatsTabId;
  title: string;
  matchLabel: string;
  blocks: SharedStatsBlock[];
  expiresAt: number;
  generatedAt?: number;
}

export type SharedMatchStats = SharedMatchStatsV1 | SharedMatchStatsV2;

const TAB_TO_CODE: Record<SharedStatsTabId, string> = {
  report: 'r',
  'team-performance': 't',
  'player-performance': 'p',
  'sideout-study': 's',
  'cross-rotation': 'c',
  'play-by-play': 'b',
  trends: 'd',
  notes: 'n',
  generic: 'g',
};

const CODE_TO_TAB: Record<string, SharedStatsTabId> = Object.fromEntries(
  Object.entries(TAB_TO_CODE).map(([tab, code]) => [code, tab as SharedStatsTabId]),
);

const MAX_BYTES = 2_000_000;
const MAX_LINK_LENGTH = 180_000;
const MAX_BLOCKS = 400;

export const SHARED_STATS_ROUTE = '/stats-viewer';

/** Like video and tactical report links, expiry is enforced by the viewer, not server-side access control. */
export function isSharedStatsExpired(stats: Pick<SharedMatchStats, 'expiresAt'>, now = Date.now()): boolean {
  return isSharedPlaylistExpired({ expiresAt: stats.expiresAt }, now);
}

type PackedBlock =
  | [0, string]
  | [1, string]
  | [2, string[][]]
  | [3, string];

type PackedV2Tuple = [
  string, // tabCode
  string, // title
  string, // matchLabel
  number, // expiresAt (unix seconds)
  number, // generatedAt (unix seconds, 0 if omitted)
  PackedBlock[],
];

function packBlock(block: SharedStatsBlock): PackedBlock {
  switch (block.kind) {
    case 'heading': return [0, block.text];
    case 'text': return [1, block.text];
    case 'table': return [2, block.rows];
    case 'svg': return [3, block.svg];
  }
}

function unpackBlock(raw: unknown): SharedStatsBlock | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const [kindCode, payload] = raw;
  if (kindCode === 0 && typeof payload === 'string') return { kind: 'heading', text: payload };
  if (kindCode === 1 && typeof payload === 'string') return { kind: 'text', text: payload };
  if (
    kindCode === 2
    && Array.isArray(payload)
    && payload.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string'))
  ) {
    return { kind: 'table', rows: payload as string[][] };
  }
  if (kindCode === 3 && typeof payload === 'string' && /^<svg\b/.test(payload)) {
    return { kind: 'svg', svg: payload };
  }
  return null;
}

export function encodeSharedStats(stats: SharedMatchStats): string {
  if (stats.version === 2) {
    const tuple: PackedV2Tuple = [
      TAB_TO_CODE[stats.tabId] ?? 'g',
      stats.title,
      stats.matchLabel,
      Math.floor(stats.expiresAt / 1000),
      stats.generatedAt ? Math.floor(stats.generatedAt / 1000) : 0,
      stats.blocks.slice(0, MAX_BLOCKS).map(packBlock),
    ];
    const bytes = strToU8(JSON.stringify(tuple));
    if (bytes.length > MAX_BYTES) {
      throw new Error('Match statistics snapshot exceeds sharing size limit');
    }
    const payload = `2.${bytesToBase64Url(deflateSync(bytes, { level: 9 }))}`;
    if (payload.length > MAX_LINK_LENGTH) {
      throw new Error('Match statistics link exceeds sharing size limit');
    }
    return payload;
  }

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
  if (!payload || payload.length > MAX_LINK_LENGTH || !/^[12]\.[\w-]+$/.test(payload)) {
    return null;
  }
  const versionChar = payload.charAt(0);
  try {
    // Bounded decompression buffer protects the viewer against untrusted link payloads.
    const bytes = inflateSync(base64UrlToBytes(payload.slice(2)), { out: new Uint8Array(MAX_BYTES + 1) });
    const json = strFromU8(bytes).replace(/\0+$/, '');
    if (strToU8(json).length > MAX_BYTES) {
      return null;
    }

    if (versionChar === '2') {
      const tuple = JSON.parse(json) as unknown;
      if (!Array.isArray(tuple) || tuple.length !== 6) return null;
      const [tabCode, title, matchLabel, expiresAtSec, generatedAtSec, rawBlocks] = tuple;
      if (
        typeof tabCode !== 'string'
        || typeof title !== 'string'
        || title.length > 1000
        || typeof matchLabel !== 'string'
        || matchLabel.length > 1000
        || typeof expiresAtSec !== 'number'
        || !Number.isFinite(expiresAtSec)
        || typeof generatedAtSec !== 'number'
        || !Number.isFinite(generatedAtSec)
        || !Array.isArray(rawBlocks)
        || rawBlocks.length > MAX_BLOCKS
      ) {
        return null;
      }
      const blocks: SharedStatsBlock[] = [];
      for (const raw of rawBlocks) {
        const block = unpackBlock(raw);
        if (!block) return null;
        blocks.push(block);
      }
      if (blocks.length === 0) return null;
      return {
        version: 2,
        tabId: CODE_TO_TAB[tabCode] ?? 'generic',
        title,
        matchLabel,
        blocks,
        expiresAt: expiresAtSec * 1000,
        ...(generatedAtSec > 0 ? { generatedAt: generatedAtSec * 1000 } : {}),
      };
    }

    const value = JSON.parse(json) as Partial<SharedMatchStatsV1>;
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

/**
 * <base>/stats-viewer/#<payload>: the address without the fragment is a static page with
 * the social preview (see stats-preview.ts), which forwards to #/stats-viewer/<payload>.
 * Older links of the form <base>/#/stats-viewer/<payload> keep opening the viewer.
 */
export function buildSharedStatsUrl(baseUrl: string, stats: SharedMatchStats): string {
  return `${baseUrl.replace(/[#?].*$/, '').replace(/\/+$/, '')}/${STATS_VIEWER_PREVIEW_PATH}/#${encodeSharedStats(stats)}`;
}
