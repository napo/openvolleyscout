import { describe, expect, it } from 'vitest';
import { createOpponentReport } from '@src/domain/opponent-report/types';
import { DEFAULT_RECEPTION_SYSTEM_BLOCK } from '@src/config/systems/reception-defaults';
import { en } from '@src/i18n/locales/en';
import { computeOpponentReportMetrics } from './report-metrics';
import { computeAttackingReportMetrics } from './attacking-metrics';
import { DEFAULT_THRESHOLDS } from './traffic-light';
import { buildReportView, type ViewT } from './report-view';
import { buildOpponentReportPdfDocDefinition } from './opponent-report-pdf';

type PdfNode = Record<string, any>;
const t: ViewT = (key, params) => String(en[key as keyof typeof en] ?? key).replace(/{{(\w+)}}/g, (_, name: string) => String(params?.[name] ?? name));
function nodes(value: unknown): PdfNode[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object') return [];
  return [value as PdfNode, ...Object.values(value).flatMap(nodes)];
}
function buildDocument(advice: string[]) {
  const report = createOpponentReport({ id: 'r', title: 'Match preparation', opponent: { name: 'Rivals' }, matchIds: ['m1'] });
  report.boardPieceIds = ['keys:main', 'overview:rotations', 'reception:serve-targets'];
  report.pieceEdits = { 'keys:main': { items: advice } };
  const view = buildReportView(report, computeOpponentReportMetrics([]), [], DEFAULT_THRESHOLDS, t, DEFAULT_RECEPTION_SYSTEM_BLOCK, computeAttackingReportMetrics([]));
  return buildOpponentReportPdfDocDefinition({ report, view, matchLines: ['06/11/2026 · Rivals'], sampleLine: '1 match · 20 actions', sampleActions: 20, generatedOn: '06/11/2026' }, t);
}

describe('compact tactical report PDF', () => {
  it('keeps any number of priorities in coach-defined order, with repeating table headers', () => {
    const advice = Array.from({ length: 7 }, (_, index) => `Instruction ${index + 1}`);
    const doc = buildDocument(advice);
    const priority = nodes(doc.content).find((node) => node.table?.body?.[0]?.[0]?.text === 'Priority')!;
    expect(priority.table.body.slice(1).map((row: PdfNode[]) => [row[0].text, row[1].text])).toEqual(advice.map((text, index) => [String(index + 1), text]));
    expect(priority.table.headerRows).toBe(1);
    expect(priority.table.dontBreakRows).toBe(true);
    expect(priority.table.keepWithHeaderRows).toBe(1);
    expect(nodes(doc.content).some((node) => node.ol)).toBe(false);
  });
  it('keeps branding in the running header and allows sections to share pages', () => {
    const doc = buildDocument(['Serve short']);
    expect(nodes(doc.content).some((node) => node.image || node.text === 'OpenVolleyScout')).toBe(false);
    expect(nodes(doc.content).some((node) => node.pageBreak)).toBe(false);
    expect(nodes((doc.header as () => unknown)()).some((node) => node.text === 'Tactical sheet generated with OVS')).toBe(true);
    const table = nodes(doc.content).find((node) => node.table?.widths?.length === 1)!;
    expect(table.table.headerRows).toBeGreaterThan(0);
    expect(table.table.body.slice(table.table.headerRows)).toHaveLength(2); // Six courts, kept as two three-court rows.
    expect(table.unbreakable).not.toBe(true);
  });
});
