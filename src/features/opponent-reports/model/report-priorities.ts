import type { OpponentReport, OpponentReportKey } from '@src/domain/opponent-report/types';
import { KEY_COUNT, type KeySuggestion } from './report-keys';
import type { ViewT } from './report-view';

export const MAX_PRIORITY_PROPOSALS = KEY_COUNT;
export const PRINT_PRIORITY_COUNT = 5;

export function automaticPriority(suggestion: KeySuggestion): OpponentReportKey {
  return { id: suggestion.id, text: '', source: 'auto', suggestion: {
    kind: suggestion.kind, params: { ...suggestion.params }, sample: suggestion.sample,
  } };
}

/** Legacy frozen lists are preserved as coach text, never silently overwritten. */
export function reportPriorities(report: OpponentReport, suggestions: readonly KeySuggestion[]): OpponentReportKey[] {
  if (report.keys !== undefined) return report.keys.map((key) => {
    const current = suggestions.find((entry) => entry.id === key.id);
    return key.source === 'auto' && !key.suggestion && current
      ? { ...key, suggestion: automaticPriority(current).suggestion }
      : key.source === 'auto' && !key.suggestion ? { ...key, source: 'custom' as const } : key;
  });
  const legacy = report.pieceEdits?.['keys:main']?.items;
  if (legacy !== undefined) return legacy.map((text, index) => ({ id: `legacy-key-${index}`, text, source: 'custom' }));
  const dismissed = new Set(report.dismissedKeyIds ?? []);
  return suggestions.filter((entry) => !dismissed.has(entry.id)).slice(0, MAX_PRIORITY_PROPOSALS).map(automaticPriority);
}

export function priorityText(key: OpponentReportKey, t: ViewT): string {
  return key.source === 'auto' && key.suggestion
    ? t(`opponentKey_${key.suggestion.kind}`, key.suggestion.params)
    : key.text;
}

export function setReportPriorities(report: OpponentReport, keys: OpponentReportKey[]): OpponentReport {
  const pieceEdits = { ...report.pieceEdits };
  if (pieceEdits['keys:main']) {
    const { items: _items, ...rest } = pieceEdits['keys:main'];
    pieceEdits['keys:main'] = rest;
  }
  return { ...report, keys, pieceEdits };
}

export function reorderPriorities(keys: readonly OpponentReportKey[], from: number, to: number): OpponentReportKey[] {
  if (from < 0 || to < 0 || from >= keys.length || to >= keys.length) return [...keys];
  const next = [...keys];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}
