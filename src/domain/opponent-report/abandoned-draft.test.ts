import { describe, expect, it } from 'vitest';
import { createOpponentReport, isAbandonedOpponentReportDraft } from './types';

const base = () => createOpponentReport({ id: 'r1', title: 'Untitled report', opponent: { name: '' } });

describe('isAbandonedOpponentReportDraft', () => {
  it('flags a report opened and left without any choice', () => {
    expect(isAbandonedOpponentReportDraft(base())).toBe(true);
  });

  it('keeps a report with a chosen opponent or matches', () => {
    expect(isAbandonedOpponentReportDraft({ ...base(), opponent: { name: 'Schwerin' } })).toBe(false);
    expect(isAbandonedOpponentReportDraft({ ...base(), matchIds: ['m1'] })).toBe(false);
  });

  it('keeps a report whose draft was created', () => {
    expect(isAbandonedOpponentReportDraft({ ...base(), draftStatus: 'editing' })).toBe(false);
    expect(isAbandonedOpponentReportDraft({ ...base(), draftCreatedAt: 1 })).toBe(false);
  });
});
