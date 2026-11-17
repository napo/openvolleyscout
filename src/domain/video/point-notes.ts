// SPDX-License-Identifier: AGPL-3.0-or-later
import type { PointNote, PointNoteTag } from './types';
import { normalizeCustomKeywordList } from './custom-point-note-keywords';

export const POINT_NOTE_TAGS: readonly PointNoteTag[] = [
  'double_touch',
  'net_invasion',
  'rotation_fault',
  'formation_fault',
  'funny_gesture',
  'to_review',
];

export interface CreatePointNoteInput {
  id?: string;
  touchId?: string;
  setNumber: number;
  rallyNumber: number;
  homeScore: number;
  awayScore: number;
  videoTimeSeconds?: number;
  tags: readonly PointNoteTag[];
  customKeywords?: readonly string[];
  text?: string;
  createdAt?: number;
}

export function normalizePointNote(note: PointNote): PointNote {
  const validTags = Array.from(
    new Set((note.tags ?? []).filter((tag): tag is PointNoteTag => POINT_NOTE_TAGS.includes(tag))),
  );
  const customKeywords = normalizeCustomKeywordList(note.customKeywords);
  return {
    id: note.id,
    ...(note.touchId ? { touchId: note.touchId } : {}),
    setNumber: note.setNumber,
    rallyNumber: note.rallyNumber,
    homeScore: note.homeScore,
    awayScore: note.awayScore,
    ...(typeof note.videoTimeSeconds === 'number' && Number.isFinite(note.videoTimeSeconds)
      ? { videoTimeSeconds: Math.max(0, note.videoTimeSeconds) }
      : {}),
    tags: validTags,
    ...(customKeywords.length > 0 ? { customKeywords } : {}),
    text: (note.text ?? '').trim(),
    createdAt: note.createdAt,
  };
}

export function normalizePointNotes(notes: readonly PointNote[] | undefined): PointNote[] {
  if (!Array.isArray(notes)) return [];
  return notes.map(normalizePointNote);
}

export function createPointNote(input: CreatePointNoteInput): PointNote {
  const now = input.createdAt ?? Date.now();
  return normalizePointNote({
    id: input.id ?? `note-${now}-${Math.random().toString(36).slice(2, 8)}`,
    touchId: input.touchId,
    setNumber: input.setNumber,
    rallyNumber: input.rallyNumber,
    homeScore: input.homeScore,
    awayScore: input.awayScore,
    videoTimeSeconds: input.videoTimeSeconds,
    tags: [...input.tags],
    customKeywords: input.customKeywords ? [...input.customKeywords] : undefined,
    text: input.text ?? '',
    createdAt: now,
  });
}

export function addPointNote(notes: readonly PointNote[], note: PointNote): PointNote[] {
  return [...notes, normalizePointNote(note)];
}

export function updatePointNote(
  notes: readonly PointNote[],
  noteId: string,
  patch: Partial<Pick<PointNote, 'tags' | 'customKeywords' | 'text' | 'touchId' | 'videoTimeSeconds'>>,
): PointNote[] {
  return notes.map((note) => (note.id === noteId ? normalizePointNote({ ...note, ...patch }) : note));
}

export function getPointNoteLabels(
  note: Pick<PointNote, 'tags' | 'customKeywords'>,
  getTagLabel: (tag: PointNoteTag) => string,
): string[] {
  return [...note.tags.map(getTagLabel), ...(note.customKeywords ?? [])];
}

export function deletePointNote(notes: readonly PointNote[], noteId: string): PointNote[] {
  return notes.filter((note) => note.id !== noteId);
}

export function filterPointNotesByTag(
  notes: readonly PointNote[],
  tag: PointNoteTag | null,
): PointNote[] {
  if (!tag) return [...notes];
  return notes.filter((note) => note.tags.includes(tag));
}
