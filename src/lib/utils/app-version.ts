const LAST_VERSION_STORAGE_KEY = 'openvolleyscout.lastVersion';

/** Stores the running version and returns the one stored before, if any. */
export function swapLastVersion(version: string, storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = globalThis.localStorage): string | null {
  try {
    const previous = storage?.getItem(LAST_VERSION_STORAGE_KEY) ?? null;
    storage?.setItem(LAST_VERSION_STORAGE_KEY, version);
    return previous;
  } catch {
    return null;
  }
}

/** Compares dotted numeric versions ("0.17.10" is newer than "0.17.9"). */
export function isNewerVersion(version: string, than: string): boolean {
  const left = version.split('.').map(Number);
  const right = than.split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}
