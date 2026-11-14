import { prepareRtlReportPdf } from './rtl-pdf';
import { describe, it, expect } from 'vitest';
import { createOpponentReport } from '@src/domain/opponent-report/types';
import { buildReportPieceSvg } from './report-svg';
import type { ResolvedBoardPiece } from './board-pieces';
import { pickPdfFontFamily, PDF_FONT_ARABIC, PDF_FONT_LATIN } from '@src/features/scouting/model/pdf-branding';
import { en } from '@src/i18n/locales/en';
const t = (key: string, params?: Record<string, string | number>) => String(en[key as keyof typeof en] ?? key).replace(/{{(\w+)}}/g, (_, name: string) => String(params?.[name] ?? name));
describe('editable SVG report sheets', () => {
  it('leaves Latin PDF definitions unchanged without using browser APIs', async () => {
    const definition = { content: [{ text: 'Serve on number 11' }] };
    expect(await prepareRtlReportPdf(definition)).toBe(definition);
  });
  it('selects the bundled Arabic font for Arabic labels and names', () => {
    expect(pickPdfFontFamily('تقرير تكتيكي')).toBe(PDF_FONT_ARABIC);
    expect(pickPdfFontFamily('Tactical report')).toBe(PDF_FONT_LATIN);
  });
  it('exports text, table status, notes, branding and links without HTML injection', () => {
    const report = createOpponentReport({ id: 'r', title: 'Report', opponent: { name: '<Rivals>' }, matchIds: ['m1'] });
    const piece: ResolvedBoardPiece = { id: 'test', sheetId: 'attackers', kind: 'player-card', title: 'Number 11', note: '<script>bad</script>', isModified: false, table: { columns: ['Metric'], rows: [[{ text: '30% (3/10)', band: 'red', few: false }]] }, videoLink: { url: 'https://example.org/?x=1&y=2', expiresAt: 1000, clips: 1, actions: 2, totalActions: 10, skill: 'receive' } };
    const svg = buildReportPieceSvg(report, piece, { generatedOn: '06/11/2026', sampleLine: '1 match · 10 actions', logoDataUrl: 'data:image/png;base64,AA' }, t);
    expect(svg).toContain('Tactical sheet generated with OVS');
    expect(svg).toContain('a project by napo');
    expect(svg).not.toContain('Maurizio Napolitano');
    expect(svg).toContain('06/11/2026');
    expect(svg).toContain('[-] 30% (3/10)');
    expect(svg).toContain('2 actions with video out of 10 analysed');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('<text');
    expect(svg).toContain('x=1&amp;y=2');
  });
});

describe('workflow translations', () => {
  it('has all tactical keys and matching placeholders in every locale', async () => {
    const locales = ['it', 'en', 'de', 'es', 'ro', 'sl', 'ja', 'zh', 'ar', 'tr'];
    const keys = Object.keys(en).filter((key) => key.startsWith('tactical') || key.startsWith('booklet') || key.startsWith('priority') || ['opponentKey_receiverSideOut', 'opponentKey_attackerEfficiencyDrop', 'opponentKey_setterContext'].includes(key));
    const placeholders = (value: string) => [...value.matchAll(/{{(\w+)}}/g)].map((match) => match[1]).sort();
    for (const locale of locales) {
      const module = await import(`../../../i18n/locales/${locale}.ts`);
      const messages = module[locale] as Record<string, string>;
      for (const key of keys) {
        expect(messages[key], `${locale}:${key}`).toBeTruthy();
        expect(placeholders(messages[key]), `${locale}:${key}`).toEqual(placeholders(en[key as keyof typeof en]));
      }
    }
  });
});
