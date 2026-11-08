import { describe, expect, it } from 'vitest';
import { pruneSetSetupDrafts } from './set-setup-draft';

function memoryStorage(entries: Record<string, string>): Storage {
  const map = new Map(Object.entries(entries));
  return {
    get length() { return map.size; },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
    clear: () => map.clear(),
  };
}

describe('set setup drafts', () => {
  it('removes drafts of matches that no longer exist and keeps everything else', () => {
    const storage = memoryStorage({
      'openvolleyscout.setSetupDraft.match-a:1': '{}',
      'openvolleyscout.setSetupDraft.match-a:2': '{}',
      'openvolleyscout.setSetupDraft.match-gone:1': '{}',
      'openvolleyscout.somethingElse': 'x',
    });
    expect(pruneSetSetupDrafts(['match-a'], storage)).toBe(1);
    expect(storage.getItem('openvolleyscout.setSetupDraft.match-gone:1')).toBeNull();
    expect(storage.getItem('openvolleyscout.setSetupDraft.match-a:2')).toBe('{}');
    expect(storage.getItem('openvolleyscout.somethingElse')).toBe('x');
  });
});
