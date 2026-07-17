/**
 * Structural equality via a key-order-independent JSON serialization.
 *
 * Plain `JSON.stringify` compares by insertion order, but this merge engine
 * compares objects built by different code paths (live-scouting builders vs.
 * the `.ovs` bundle's flatten/unflatten reconstruction) that legitimately
 * produce the same data with different key order — a naive stringify
 * comparison would report those as "changed" even though nothing was edited.
 */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function deepEqual<T>(a: T | undefined, b: T | undefined): boolean {
  return JSON.stringify(sortKeysDeep(a)) === JSON.stringify(sortKeysDeep(b));
}
