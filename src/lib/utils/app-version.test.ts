import { describe, expect, it } from 'vitest';
import { isNewerVersion, swapLastVersion } from './app-version';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe('app version', () => {
  it('compares versions numerically', () => {
    expect(isNewerVersion('0.17.10', '0.17.9')).toBe(true);
    expect(isNewerVersion('0.18.0', '0.17.5')).toBe(true);
    expect(isNewerVersion('0.17.5', '0.17.5')).toBe(false);
    expect(isNewerVersion('0.17.4', '0.17.5')).toBe(false);
  });

  it('remembers the last version that ran', () => {
    const storage = memoryStorage();
    expect(swapLastVersion('0.17.5', storage)).toBeNull();
    expect(swapLastVersion('0.18.0', storage)).toBe('0.17.5');
    expect(swapLastVersion('0.18.0', storage)).toBe('0.18.0');
  });
});
