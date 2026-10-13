import { describe, expect, it } from 'vitest';
import { DEFAULT_DEFENSE_SYSTEM_BLOCK, DEFAULT_RECEPTION_SYSTEM_BLOCK } from '@src/config/systems';
import { mergeDefenseSystemImport } from './defense-system-store';
import type { ReceptionSystemBlock } from '@src/domain/systems';
import { mergeReceptionSystemImport } from './reception-system-store';
import {
  SystemLibraryFileError,
  getSystemLibraryFileName,
  parseSystemLibraryFile,
  serializeSystemLibraryFile,
} from './system-library-file';

const rename = (name: string) => `${name} (imported)`;

function clone(block: ReceptionSystemBlock): ReceptionSystemBlock {
  return JSON.parse(JSON.stringify(block)) as ReceptionSystemBlock;
}

function custom(id: string, name: string, teamId?: string): ReceptionSystemBlock {
  return { ...clone(DEFAULT_RECEPTION_SYSTEM_BLOCK), id, name, teamId };
}

function moved(block: ReceptionSystemBlock): ReceptionSystemBlock {
  const next = clone(block);
  next.rotations[0].positions[0] = { ...next.rotations[0].positions[0], x: 33, y: 44 };
  return next;
}

describe('systems file', () => {
  it('round-trips through JSON', () => {
    const text = serializeSystemLibraryFile({ receptionSystems: [custom('r-1', 'Mine')], defenseSystems: [] }, '0.17.5');
    const library = parseSystemLibraryFile(text);
    expect(library.receptionSystems).toHaveLength(1);
    expect(library.defenseSystems).toEqual([]);
  });

  it('rejects files that are not systems files', () => {
    expect(() => parseSystemLibraryFile('not json')).toThrow(SystemLibraryFileError);
    expect(() => parseSystemLibraryFile('{"teams": []}')).toThrow(SystemLibraryFileError);
    expect(() => parseSystemLibraryFile('{"kind":"openvolleyscout-systems","formatVersion":99}')).toThrow(SystemLibraryFileError);
  });

  it('names the file after the system when exporting one', () => {
    expect(getSystemLibraryFileName('2026-10-13')).toBe('openvolleyscout-systems-2026-10-13.json');
    expect(getSystemLibraryFileName('2026-10-13', 'P1 a 3 in 4 · Città')).toBe('openvolleyscout-system-p1-a-3-in-4-citta.json');
  });
});

describe('importing systems', () => {
  it('adds new systems and skips the ones already present', () => {
    const local = [custom('r-1', 'Mine')];
    const result = mergeReceptionSystemImport(local, [custom('r-1', 'Mine'), custom('r-2', 'Theirs')], rename);
    expect(result).toMatchObject({ added: 1, unchanged: 1 });
    expect(result.blocks.map((block) => block.name)).toEqual(['Mine', 'Theirs']);
  });

  it('recognizes the built-in systems after an export round trip', () => {
    const library = parseSystemLibraryFile(serializeSystemLibraryFile({
      receptionSystems: [DEFAULT_RECEPTION_SYSTEM_BLOCK],
      defenseSystems: [DEFAULT_DEFENSE_SYSTEM_BLOCK],
    }));
    expect(mergeReceptionSystemImport([DEFAULT_RECEPTION_SYSTEM_BLOCK], library.receptionSystems, rename))
      .toMatchObject({ added: 0, unchanged: 1 });
    expect(mergeDefenseSystemImport([DEFAULT_DEFENSE_SYSTEM_BLOCK], library.defenseSystems, rename))
      .toMatchObject({ added: 0, unchanged: 1 });
  });

  it('keeps the local system and adds a changed one as a copy', () => {
    const local = [custom('r-1', 'Mine')];
    const result = mergeReceptionSystemImport(local, [moved(custom('r-1', 'Mine'))], rename);
    expect(result.added).toBe(1);
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]).toEqual(local[0]);
    expect(result.blocks[1].name).toBe('Mine (imported)');
    expect(result.blocks[1].id).not.toBe('r-1');
  });

  it('overwrites an untouched built-in preset with its edited version', () => {
    const local = [clone(DEFAULT_RECEPTION_SYSTEM_BLOCK)];
    const result = mergeReceptionSystemImport(local, [moved(DEFAULT_RECEPTION_SYSTEM_BLOCK)], rename);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].rotations[0].positions[0]).toMatchObject({ x: 33, y: 44 });
  });

  it('never takes a team away from a local system', () => {
    const local = [custom('r-1', 'Mine', 'team-1')];
    const result = mergeReceptionSystemImport(local, [custom('r-2', 'Theirs', 'team-1'), custom('r-3', 'Other', 'team-2')], rename);
    expect(result.blocks.find((block) => block.id === 'r-1')?.teamId).toBe('team-1');
    expect(result.blocks.find((block) => block.id === 'r-2')?.teamId).toBeUndefined();
    expect(result.blocks.find((block) => block.id === 'r-3')?.teamId).toBe('team-2');
  });

  it('ignores entries that are not systems and normalizes partial ones', () => {
    const result = mergeReceptionSystemImport([], [42, null, { id: 'r-9', name: 'Partial', rotations: [] }], rename);
    expect(result.added).toBe(1);
    expect(result.blocks[0].rotations).toHaveLength(6);
  });

  it('keeps the role order across the round trip', () => {
    const pcs = { ...custom('r-pcs', 'PCS'), roleSequence: [...DEFAULT_RECEPTION_SYSTEM_BLOCK.roleSequence].reverse() };
    const library = parseSystemLibraryFile(serializeSystemLibraryFile({ receptionSystems: [pcs], defenseSystems: [] }));
    const result = mergeReceptionSystemImport([], library.receptionSystems, rename);
    expect(result.blocks[0].roleSequence).toEqual(pcs.roleSequence);
  });
});
