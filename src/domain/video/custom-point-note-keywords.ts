// SPDX-License-Identifier: AGPL-3.0-or-later

const STORAGE_KEY = 'ovs:point-note-custom-keywords';

export function normalizeCustomKeyword(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeCustomKeywordList(values: readonly string[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    if (typeof raw !== 'string') continue;
    const normalized = normalizeCustomKeyword(raw);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export function loadCustomPointNoteKeywords(): string[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeCustomKeywordList(parsed);
  } catch {
    return [];
  }
}

export function saveCustomPointNoteKeywords(keywords: readonly string[]): string[] {
  const normalized = normalizeCustomKeywordList(keywords);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Ignore storage quota errors
    }
  }
  return normalized;
}

export function addCustomPointNoteKeyword(keyword: string): string[] {
  const normalized = normalizeCustomKeyword(keyword);
  const existing = loadCustomPointNoteKeywords();
  if (!normalized) return existing;
  return saveCustomPointNoteKeywords([...existing, normalized]);
}
