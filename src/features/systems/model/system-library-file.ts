/**
 * Systems library file: reception and defense systems exported to (and
 * imported from) a JSON file, and carried inside the `.ovs` backup.
 *
 * Importing never loses local work: a system already present unchanged is
 * skipped, a different system with the same id is added as a copy, and the
 * local team assignments win over the imported ones.
 */
import type { DefenseSystemBlock, ReceptionSystemBlock } from '@src/domain/systems';

export const SYSTEM_LIBRARY_FILE_KIND = 'openvolleyscout-systems';
export const SYSTEM_LIBRARY_FORMAT_VERSION = 1;

export interface SystemLibrarySnapshot {
  receptionSystems: ReceptionSystemBlock[];
  defenseSystems: DefenseSystemBlock[];
}

export interface SystemLibraryFile extends SystemLibrarySnapshot {
  kind: typeof SYSTEM_LIBRARY_FILE_KIND;
  formatVersion: number;
  exportedAt: string;
  appVersion?: string;
}

/** Raw (not yet normalized) systems read from a file or a backup. */
export interface RawSystemLibrary {
  receptionSystems: unknown[];
  defenseSystems: unknown[];
}

export function serializeSystemLibraryFile(snapshot: SystemLibrarySnapshot, appVersion?: string): string {
  const file: SystemLibraryFile = {
    kind: SYSTEM_LIBRARY_FILE_KIND,
    formatVersion: SYSTEM_LIBRARY_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion,
    receptionSystems: snapshot.receptionSystems,
    defenseSystems: snapshot.defenseSystems,
  };
  return JSON.stringify(file, null, 2);
}

export class SystemLibraryFileError extends Error {}

export function parseSystemLibraryFile(text: string): RawSystemLibrary {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new SystemLibraryFileError('The file is not valid JSON.');
  }

  if (typeof value !== 'object' || value === null || (value as { kind?: unknown }).kind !== SYSTEM_LIBRARY_FILE_KIND) {
    throw new SystemLibraryFileError('The file is not an OpenVolleyScout systems file.');
  }

  const file = value as Partial<Record<keyof SystemLibraryFile, unknown>>;
  if (typeof file.formatVersion === 'number' && file.formatVersion > SYSTEM_LIBRARY_FORMAT_VERSION) {
    throw new SystemLibraryFileError('The file was exported by a newer version of OpenVolleyScout.');
  }

  return {
    receptionSystems: Array.isArray(file.receptionSystems) ? file.receptionSystems : [],
    defenseSystems: Array.isArray(file.defenseSystems) ? file.defenseSystems : [],
  };
}

export function getSystemLibraryFileName(date: string, systemName?: string): string {
  const slug = systemName
    ?.toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `openvolleyscout-system-${slug}.json` : `openvolleyscout-systems-${date}.json`;
}

type SystemBlockLike = { id: string; name: string; teamId?: string };

/** JSON with sorted keys, so equal systems compare equal whatever their key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function withoutTeam<T extends SystemBlockLike>(block: T): Omit<T, 'teamId'> {
  const { teamId: _teamId, ...rest } = block;
  return rest;
}

export function isSameSystem<T extends SystemBlockLike>(left: T, right: T): boolean {
  return canonical(withoutTeam(left)) === canonical(withoutTeam(right));
}

export interface SystemMergeResult<T> {
  blocks: T[];
  added: number;
  unchanged: number;
}

export function mergeImportedSystemBlocks<T extends SystemBlockLike>(
  local: readonly T[],
  incoming: readonly T[],
  options: {
    createId: () => string;
    /** Name for an imported system that differs from a local one with its id. */
    renameConflict: (name: string) => string;
    /** Local systems an import may overwrite in place (e.g. untouched presets). */
    isReplaceable?: (block: T) => boolean;
  },
): SystemMergeResult<T> {
  const blocks = [...local];
  let added = 0;
  let unchanged = 0;

  incoming.forEach((block) => {
    const existingIndex = blocks.findIndex((entry) => entry.id === block.id);
    const existing = existingIndex >= 0 ? blocks[existingIndex] : null;

    if (existing && isSameSystem(existing, block)) {
      unchanged += 1;
      return;
    }

    const replaces = existing !== null && (options.isReplaceable?.(existing) ?? false);
    let candidate: T = existing && !replaces
      ? { ...block, id: options.createId(), name: options.renameConflict(block.name) }
      : { ...block };

    // Local team assignments win: an imported system never takes a team
    // away from a local one.
    if (candidate.teamId && blocks.some((entry, index) => entry.teamId === candidate.teamId && index !== existingIndex)) {
      candidate = { ...candidate, teamId: undefined };
    } else if (replaces && !candidate.teamId && existing?.teamId) {
      candidate = { ...candidate, teamId: existing.teamId };
    }

    if (replaces) {
      blocks[existingIndex] = candidate;
    } else {
      blocks.push(candidate);
    }
    added += 1;
  });

  return { blocks, added, unchanged };
}
