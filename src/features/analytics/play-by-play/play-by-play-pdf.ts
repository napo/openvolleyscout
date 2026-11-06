import type { TeamSide } from '@src/domain/common/enums';
import type { Team } from '@src/domain/roster/types';
import type { MatchMetadata } from '@src/domain/match/types';
import { APP_METADATA } from '@src/lib/constants/app';
import { saveFile } from '@src/lib/utils/save-file';
import { buildPdfLogo, loadPdfMakeApi, preparePdfFont, PDF_FONT_LATIN } from '@src/features/scouting/model/pdf-branding';
import { scoreGapSvg, type PlayByPlaySet } from './play-by-play';
import { playByPlayDetail, playByPlayServer, type PlayByPlayOptions, type PlayByPlayT } from './play-by-play-labels';

export interface PlayByPlayDocumentInput {
  sets: PlayByPlaySet[];
  teams: Record<TeamSide, Team>;
  metadata?: MatchMetadata | null;
  options: PlayByPlayOptions;
}
export function buildPlayByPlayPdf(input: PlayByPlayDocumentInput, t: PlayByPlayT): Record<string, unknown> {
  const sets = input.sets.filter((set) => !input.options.setNumber || set.setNumber === input.options.setNumber);
  const shown = (side: TeamSide) => input.options.bothTeams || side === input.options.reference;
  const content = sets.flatMap((set, index) => {
    const maxGap = Math.max(1, ...set.rows.map((row) => Math.abs(row.homeScore - row.awayScore)));
    const header = ['P', input.teams.home.name, t('pbpScore'), t('pbpGap'), t('pbpServer'), input.teams.away.name, 'P'].map((text) => ({ text, bold: true, fillColor: '#eef5ff', color: '#002554', fontSize: 7 }));
    const contextHeader = [{ colSpan: 7, stack: [
      { text: `${input.teams.home.name} - ${input.teams.away.name}`, bold: true, fontSize: 9, margin: [0, 0, 0, 2] },
      { text: [input.metadata?.competition, input.metadata?.season, input.metadata?.playedAt?.slice(0, 10)].filter(Boolean).join(' · '), fontSize: 7, margin: [0, 0, 0, 2] },
      { text: t('pbpReference') + ': ' + input.teams[input.options.reference].name + (input.options.bothTeams ? ' · ' + t('pbpBothTeams') : ''), fontSize: 7, color: '#475569', margin: [0, 0, 0, 4] },
      { text: `${t('setLabel', { setNumber: set.setNumber })} · ${set.finalScore.home} - ${set.finalScore.away}`, bold: true, fontSize: 11, margin: [0, 0, 0, 4] },
      { text: t('pbpSample', { matches: 1, rallies: set.pointCount, actions: set.touchCount }), color: '#475569', fontSize: 7, margin: [0, 0, 0, 4] },
      ...(set.incomplete ? [{ text: t('pbpIncomplete'), color: '#92400e', bold: true, margin: [0, 0, 0, 5] }] : []),
    ] }, ...Array.from({ length: 6 }, () => ({}))];
    return [
      { ...(index ? { pageBreak: 'before' } : {}), table: { headerRows: 2, dontBreakRows: true, keepWithHeaderRows: 1, widths: [14, input.options.bothTeams || input.options.reference === 'home' ? '*' : 70, 38, 44, 46, input.options.bothTeams || input.options.reference === 'away' ? '*' : 70, 14], body: [contextHeader, header,
        ...set.rows.map((row) => [
          { text: shown('home') ? String(row.rotations.home ?? '—') : '', color: '#475569' },
          { text: playByPlayDetail(row, 'home', input.teams, input.options, t, true), bold: row.kind === 'point' && row.teamSide === 'home' },
          { text: `${row.homeScore} - ${row.awayScore}${row.breakPoint ? ' BP' : ''}`, alignment: 'center', bold: true },
          { svg: scoreGapSvg(row, maxGap), width: 42, height: 10 },
          { text: playByPlayServer(row, input.teams, t), fontSize: 6.5, color: '#475569' },
          { text: playByPlayDetail(row, 'away', input.teams, input.options, t, true), bold: row.kind === 'point' && row.teamSide === 'away' },
          { text: shown('away') ? String(row.rotations.away ?? '—') : '', color: '#475569' },
        ].map((cell) => ({ ...cell, ...(row.kind !== 'point' ? { fillColor: '#f1f5f9' } : {}) }))),
      ] }, layout: { hLineWidth: () => .35, vLineWidth: () => 0, hLineColor: () => '#cbd5e1', paddingLeft: () => 3, paddingRight: () => 3, paddingTop: () => 1, paddingBottom: () => 1 } },
    ];
  });
  return {
    pageSize: 'A4', pageMargins: [28, 64, 28, 54], defaultStyle: { font: PDF_FONT_LATIN, fontSize: 7.5 },
    header: () => ({ margin: [28, 20, 28, 0], stack: [
      { columns: [buildPdfLogo(22, 22), { text: `${t('pbpTitle')} · ${APP_METADATA.name}`, fontSize: 13, bold: true, margin: [7, 3, 0, 0] }] },
    ] }),
    footer: (page: number, pages: number) => ({ margin: [28, 10, 28, 0], stack: [
      { text: `P: ${t('pbpRotation')}. ${t('pbpLegend')}`, fontSize: 6.5, color: '#475569' },
      { columns: [{ text: `${APP_METADATA.name} v${APP_METADATA.version} · ${APP_METADATA.urls.repository}`, fontSize: 6 }, { text: `${page} / ${pages}`, alignment: 'right', fontSize: 7, width: 44 }] },
    ] }),
    content: content.length ? content : [{ text: t('pbpEmpty') }],
  };
}
export async function exportPlayByPlayPdf(input: PlayByPlayDocumentInput, t: PlayByPlayT): Promise<void> {
  const draft = buildPlayByPlayPdf(input, t);
  const font = await preparePdfFont(JSON.stringify([draft.content, (draft.header as () => unknown)(), (draft.footer as (n: number, total: number) => unknown)(1, 1)]));
  const document = { ...buildPlayByPlayPdf(input, t), defaultStyle: { font, fontSize: 7.5 } };
  const pdf = await loadPdfMakeApi();
  const blob = await pdf.createPdf(document).getBlob();
  await saveFile(`play-by-play-${input.metadata?.id ?? 'match'}.pdf`, blob, 'application/pdf');
}
