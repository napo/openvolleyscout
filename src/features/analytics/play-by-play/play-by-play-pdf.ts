import type { TeamSide } from '@src/domain/common/enums';
import type { Team } from '@src/domain/roster/types';
import type { MatchMetadata } from '@src/domain/match/types';
import { APP_METADATA } from '@src/lib/constants/app';
import { saveFile } from '@src/lib/utils/save-file';
import { buildPdfLogo, loadPdfMakeApi, preparePdfFont, PDF_FONT_LATIN, type PdfFontFamily } from '@src/features/scouting/model/pdf-branding';
import type { PlayByPlaySet } from './play-by-play';
import { buildPlayByPlayChartSvg } from './play-by-play-chart';
import { type PlayByPlayOptions, type PlayByPlayT } from './play-by-play-labels';

export interface PlayByPlayDocumentInput {
  sets: PlayByPlaySet[];
  teams: Record<TeamSide, Team>;
  metadata?: MatchMetadata | null;
  options: PlayByPlayOptions;
}
export function buildPlayByPlayPdf(input: PlayByPlayDocumentInput, t: PlayByPlayT, font: PdfFontFamily = PDF_FONT_LATIN): Record<string, unknown> {
  const sets = input.sets.filter((set) => !input.options.setNumber || set.setNumber === input.options.setNumber);
  const reference = input.options.reference;
  const other = reference === 'home' ? 'away' : 'home';
  // Explicit vector pages keep the band continuous and retain its scale on continuation pages.
  const content = sets.flatMap((set) => {
    const longTeamNames = input.teams[reference].name.length + input.teams[other].name.length > 100;
    const longMetadata = [input.metadata?.competition, input.metadata?.season, input.metadata?.playedAt].join(' ').length > 130;
    const pageRows = (font === PDF_FONT_LATIN ? 52 : 44) - (set.incomplete ? 4 : 0) - (longTeamNames ? 4 : 0) - (longMetadata ? 2 : 0);
    const chunks = [];
    for (let offset = 0; offset < set.rows.length; offset += pageRows) {
      const rows = set.rows.slice(offset, offset + pageRows);
      const score = reference === 'home' ? `${set.finalScore.home} - ${set.finalScore.away}` : `${set.finalScore.away} - ${set.finalScore.home}`;
      chunks.push({ stack: [
        { text: `${input.teams[reference].name} - ${input.teams[other].name}`, bold: true, fontSize: 9, margin: [0, 0, 0, 2] },
        { text: [input.metadata?.competition, input.metadata?.season, input.metadata?.playedAt?.slice(0, 10)].filter(Boolean).join(' · '), fontSize: 7, margin: [0, 0, 0, 2] },
        { text: t('pbpReference') + ': ' + input.teams[reference].name, fontSize: 7, color: '#475569', margin: [0, 0, 0, 4] },
        { text: `${t('setLabel', { setNumber: set.setNumber })} · ${score}`, bold: true, fontSize: 11, margin: [0, 0, 0, 4] },
        { text: t('pbpSample', { matches: 1, rallies: set.pointCount, actions: set.touchCount }), color: '#475569', fontSize: 7, margin: [0, 0, 0, 4] },
        ...(set.incomplete ? [{ text: t('pbpIncomplete'), color: '#92400e', bold: true, margin: [0, 0, 0, 5] }] : []),
        { svg: buildPlayByPlayChartSvg(input, set, t, { compact: true, rows }), width: 539, font },
      ], unbreakable: true });
    }
    return chunks;
  }).map((page, index) => ({ ...page, ...(index ? { pageBreak: 'before' } : {}) }));
  return {
    pageSize: 'A4', pageMargins: [28, 64, 28, 54], defaultStyle: { font, fontSize: 7.5 },
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
  const document = { ...buildPlayByPlayPdf(input, t, font), defaultStyle: { font, fontSize: 7.5 } };
  const pdf = await loadPdfMakeApi();
  const blob = await pdf.createPdf(document).getBlob();
  await saveFile(`play-by-play-${input.metadata?.id ?? 'match'}.pdf`, blob, 'application/pdf');
}
