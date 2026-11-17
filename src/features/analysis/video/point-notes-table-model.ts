// SPDX-License-Identifier: AGPL-3.0-or-later
import type { MatchProject } from '@src/domain/match/types';
import { getMatchTeamSnapshot } from '@src/domain/match';
import type { BallTouch } from '@src/domain/touch/types';
import type { PointNote, PointNoteTag } from '@src/domain/video/types';
import { buildDataVolleyTouchCode } from '@src/features/scouting/model/datavolley-code';
import { buildVideoEventIndex, type VideoEventEntry } from './video-event-index';

export const POINT_NOTES_PAGE_SIZE = 5;

export interface PointNoteDistributionItem {
  key: string;
  label: string;
  count: number;
}

export interface PointNoteCodeToken {
  touchId: string;
  code: string;
  isTarget: boolean;
}

export interface PointNoteTableRow {
  note: PointNote;
  primaryTouchId?: string;
  timeSortValue: number;
  timeLabel: string;
  noteTypeLabel: string;
  scoreSortValue: number;
  scoreLabel: string;
  codes: PointNoteCodeToken[];
  codesText: string;
}

export type PointNoteSortKey = 'time' | 'type' | 'score' | 'codes';
export type PointNoteSortDir = 'asc' | 'desc';

/**
 * Counts how many times each note tag appears and returns items sorted alphabetically by label.
 * Notes without tags are grouped under `otherLabel`.
 */
export function buildPointNoteDistribution(
  notes: readonly PointNote[],
  getTagLabel: (tag: PointNoteTag) => string,
  otherLabel: string,
): PointNoteDistributionItem[] {
  const counts = new Map<string, { label: string; count: number }>();

  const increment = (key: string, label: string) => {
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { label, count: 1 });
    }
  };

  for (const note of notes) {
    const customKeywords = note.customKeywords ?? [];
    if (note.tags.length === 0 && customKeywords.length === 0) {
      increment('__other__', otherLabel);
      continue;
    }
    for (const tag of note.tags) {
      increment(tag, getTagLabel(tag));
    }
    for (const keyword of customKeywords) {
      increment(`kw:${keyword.toLowerCase()}`, keyword);
    }
  }

  return Array.from(counts.entries())
    .map(([key, value]) => ({ key, label: value.label, count: value.count }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function resolveTouchClock(touch: BallTouch | undefined, fallbackMs: number): { sortValue: number; label: string } {
  if (touch?.recordedAtTime) {
    const match = touch.recordedAtTime.trim().match(/^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?$/);
    if (match) {
      const h = Number.parseInt(match[1], 10);
      const m = Number.parseInt(match[2], 10);
      const s = match[3] ? Number.parseInt(match[3], 10) : 0;
      return {
        sortValue: (h * 3600 + m * 60 + s) * 1000,
        label: `${pad2(h)}:${pad2(m)}:${pad2(s)}`,
      };
    }
  }

  const parsedIso = touch?.recordedAtIso ? Date.parse(touch.recordedAtIso) : Number.NaN;
  const candidateMs = Number.isFinite(parsedIso)
    ? parsedIso
    : typeof touch?.createdAt === 'number' && Number.isFinite(touch.createdAt)
      ? touch.createdAt
      : fallbackMs;

  const date = new Date(candidateMs);
  return {
    sortValue: candidateMs,
    label: `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`,
  };
}

/**
 * Builds table rows joining each note with its event timestamp, score, and rally DVW codes.
 */
export function buildPointNoteTableRows(
  project: MatchProject,
  getTagLabel: (tag: PointNoteTag) => string,
  otherLabel: string,
): PointNoteTableRow[] {
  const notes = project.videoAnalysis?.notes ?? [];
  if (notes.length === 0) return [];

  const homeTeam = getMatchTeamSnapshot(project, 'home');
  const awayTeam = getMatchTeamSnapshot(project, 'away');
  const jerseyByPlayerId = new Map<string, number>();
  for (const player of [...homeTeam.players, ...awayTeam.players]) {
    jerseyByPlayerId.set(player.id, player.jerseyNumber);
  }

  const eventIndex = buildVideoEventIndex(project.events);
  const entryByTouchId = new Map<string, VideoEventEntry>();
  const entriesByRallyKey = new Map<string, VideoEventEntry[]>();

  for (const entry of eventIndex.entries) {
    entryByTouchId.set(entry.touchId, entry);
    const key = `${entry.setNumber}:${entry.rallyNumber}`;
    const list = entriesByRallyKey.get(key);
    if (list) list.push(entry);
    else entriesByRallyKey.set(key, [entry]);
  }

  return notes.map((note) => {
    const targetEntry = note.touchId ? entryByTouchId.get(note.touchId) : undefined;
    const rallyEntries = entriesByRallyKey.get(`${note.setNumber}:${note.rallyNumber}`) ?? [];
    const primaryEntry = targetEntry ?? rallyEntries[0];
    const clock = resolveTouchClock(primaryEntry?.touch, note.createdAt);

    const codes: PointNoteCodeToken[] = (rallyEntries.length > 0 ? rallyEntries : targetEntry ? [targetEntry] : []).map(
      (entry) => ({
        touchId: entry.touchId,
        code: buildDataVolleyTouchCode({
          touch: entry.touch,
          jerseyNumber: entry.playerId ? jerseyByPlayerId.get(entry.playerId) : undefined,
        }),
        isTarget: Boolean(note.touchId && entry.touchId === note.touchId),
      }),
    );

    const tagLabels = [...note.tags.map((tag) => getTagLabel(tag)), ...(note.customKeywords ?? [])];
    const noteTypeLabel = tagLabels.length > 0 ? tagLabels.join(' · ') : otherLabel;

    return {
      note,
      primaryTouchId: note.touchId ?? rallyEntries[0]?.touchId,
      timeSortValue: clock.sortValue,
      timeLabel: clock.label,
      noteTypeLabel,
      scoreSortValue: note.setNumber * 10000 + note.homeScore * 100 + note.awayScore,
      scoreLabel: `S${note.setNumber} · ${note.homeScore}-${note.awayScore}`,
      codes,
      codesText: codes.map((item) => item.code).join(' '),
    };
  });
}

export function filterPointNoteRows(rows: readonly PointNoteTableRow[], query: string): PointNoteTableRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...rows];

  return rows.filter((row) => {
    const haystack = [
      row.timeLabel,
      row.noteTypeLabel,
      row.note.text,
      row.scoreLabel,
      row.codesText,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function sortPointNoteRows(
  rows: readonly PointNoteTableRow[],
  sortKey: PointNoteSortKey,
  sortDir: PointNoteSortDir,
): PointNoteTableRow[] {
  const factor = sortDir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'time') {
      cmp = a.timeSortValue - b.timeSortValue;
    } else if (sortKey === 'score') {
      cmp = a.scoreSortValue - b.scoreSortValue;
    } else if (sortKey === 'type') {
      cmp = `${a.noteTypeLabel} ${a.note.text}`.localeCompare(`${b.noteTypeLabel} ${b.note.text}`, undefined, {
        sensitivity: 'base',
      });
    } else {
      cmp = a.codesText.localeCompare(b.codesText, undefined, { sensitivity: 'base' });
    }
    if (cmp !== 0) return cmp * factor;
    return (a.timeSortValue - b.timeSortValue) * factor;
  });
}

export function paginatePointNoteRows(
  rows: readonly PointNoteTableRow[],
  page: number,
  pageSize = POINT_NOTES_PAGE_SIZE,
): { items: PointNoteTableRow[]; page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: rows.slice(start, start + pageSize),
    page: safePage,
    totalPages,
  };
}
