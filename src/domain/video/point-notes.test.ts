// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { createEmptyMatchProject } from '@src/domain/match/factories';
import { normalizeMatchProject } from '@src/domain/match/helpers';
import { CURRENT_MATCH_SCHEMA_VERSION } from '@src/domain/match/types';
import { exportMatchToOvsBundle, parseOvsBundleFile } from '@src/features/sync/ovs-bundle';
import { mergeMetaJson } from '@src/features/sync/merge/meta-merge';
import { buildMetaJson } from '@src/features/sync/ovs-bundle/serializer/meta-json';
import {
  addPointNote,
  createPointNote,
  deletePointNote,
  filterPointNotesByTag,
  updatePointNote,
} from './point-notes';
import { createDefaultMatchVideoAnalysis } from './types';

describe('point notes model', () => {
  it('creates a note attached to a touch or to a rally without a touch', () => {
    const touchNote = createPointNote({
      id: 'note-1',
      touchId: 'touch-99',
      setNumber: 1,
      rallyNumber: 4,
      homeScore: 3,
      awayScore: 2,
      videoTimeSeconds: 42.5,
      tags: ['double_touch', 'to_review'],
      text: '  #7 setter  ',
      createdAt: 1000,
    });
    expect(touchNote).toEqual({
      id: 'note-1',
      touchId: 'touch-99',
      setNumber: 1,
      rallyNumber: 4,
      homeScore: 3,
      awayScore: 2,
      videoTimeSeconds: 42.5,
      tags: ['double_touch', 'to_review'],
      text: '#7 setter',
      createdAt: 1000,
    });

    const rallyNote = createPointNote({
      id: 'note-2',
      setNumber: 2,
      rallyNumber: 1,
      homeScore: 0,
      awayScore: 0,
      tags: ['rotation_fault'],
      createdAt: 2000,
    });
    expect(rallyNote.touchId).toBeUndefined();
    expect(rallyNote.text).toBe('');
    expect(rallyNote.tags).toEqual(['rotation_fault']);
  });

  it('adds, updates, deletes, and filters notes by tag', () => {
    const n1 = createPointNote({
      id: 'n1',
      setNumber: 1,
      rallyNumber: 1,
      homeScore: 0,
      awayScore: 0,
      tags: ['net_invasion'],
      text: 'MB #9',
      createdAt: 10,
    });
    const n2 = createPointNote({
      id: 'n2',
      setNumber: 1,
      rallyNumber: 2,
      homeScore: 1,
      awayScore: 0,
      tags: ['formation_fault', 'to_review'],
      text: '',
      createdAt: 20,
    });

    let list = addPointNote([], n1);
    list = addPointNote(list, n2);
    expect(list).toHaveLength(2);
    expect(filterPointNotesByTag(list, null)).toHaveLength(2);
    expect(filterPointNotesByTag(list, 'to_review').map((n) => n.id)).toEqual(['n2']);

    list = updatePointNote(list, 'n1', { text: 'MB #9 net touch', tags: ['net_invasion', 'to_review'] });
    expect(list.find((n) => n.id === 'n1')?.text).toBe('MB #9 net touch');
    expect(filterPointNotesByTag(list, 'to_review')).toHaveLength(2);

    list = deletePointNote(list, 'n2');
    expect(list.map((n) => n.id)).toEqual(['n1']);
  });

  it('migrates schema v4 projects unchanged and normalizes notes when videoAnalysis exists', () => {
    const legacy = createEmptyMatchProject();
    legacy.metadata.id = 'legacy-1';
    legacy.metadata.schemaVersion = 4;
    legacy.videoAnalysis = {
      syncPoints: [],
      starredTouchIds: ['t1'],
      paddingBeforeSeconds: 3,
      paddingAfterSeconds: 3,
      updatedAt: 500,
    };

    const migrated = normalizeMatchProject(legacy);
    expect(migrated.metadata.schemaVersion).toBe(CURRENT_MATCH_SCHEMA_VERSION);
    expect(migrated.videoAnalysis?.starredTouchIds).toEqual(['t1']);
    expect(migrated.videoAnalysis?.notes).toEqual([]);
  });

  it('preserves notes across .ovs export/import round-trip and 3-way merge', () => {
    const noteA = createPointNote({
      id: 'note-a',
      touchId: 'touch-1',
      setNumber: 1,
      rallyNumber: 2,
      homeScore: 1,
      awayScore: 1,
      videoTimeSeconds: 18.2,
      tags: ['double_touch'],
      text: 'Setter #4',
      createdAt: 100,
    });
    const noteB = createPointNote({
      id: 'note-b',
      setNumber: 1,
      rallyNumber: 5,
      homeScore: 3,
      awayScore: 2,
      tags: ['rotation_fault'],
      text: 'Check P1/P6',
      createdAt: 200,
    });

    const project = createEmptyMatchProject();
    project.metadata.id = 'match-notes-roundtrip';
    project.videoAnalysis = {
      ...createDefaultMatchVideoAnalysis(),
      notes: [noteA],
    };

    const { bytes } = exportMatchToOvsBundle(project);
    const parsed = parseOvsBundleFile(bytes);
    expect(parsed.meta.videoAnalysis?.notes).toEqual([noteA]);

    const baseProject = createEmptyMatchProject();
    baseProject.metadata.id = 'match-notes-merge';
    const baseMeta = buildMetaJson(baseProject);
    const localMeta = {
      ...baseMeta,
      videoAnalysis: { ...createDefaultMatchVideoAnalysis(), notes: [noteA] },
    };
    const remoteMeta = {
      ...baseMeta,
      videoAnalysis: { ...createDefaultMatchVideoAnalysis(), notes: [noteB] },
    };
    const { merged, conflicts } = mergeMetaJson(baseMeta, localMeta, remoteMeta);
    expect(conflicts).toHaveLength(0);
    expect(merged.videoAnalysis?.notes?.map((n) => n.id)).toEqual(['note-a', 'note-b']);
  });
});
