export function jsonOrUndefined(value: unknown): string | undefined {
  return value === undefined ? undefined : JSON.stringify(value);
}

export function parseJsonOrUndefined<T>(value: string | undefined | null): T | undefined {
  return value === undefined || value === null ? undefined : (JSON.parse(value) as T);
}

/** Strips own properties whose value is `undefined` so round-tripped objects
 * are deep-equal to inputs that never set those keys at all. */
export function pruneUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result = {} as T;
  for (const key of Object.keys(obj) as Array<keyof T>) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}
