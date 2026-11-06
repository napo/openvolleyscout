import type { OpponentReport } from '@src/domain/opponent-report/types';
import { APP_METADATA } from '@src/lib/constants/app';
import type { ResolvedBoardPiece } from './board-pieces';
import { formatViewCell, type ViewT } from './report-view';
export const escapeReportXml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
export interface ReportExportBranding {
    generatedOn: string;
    sampleLine: string;
    logoDataUrl: string;
    legend?: string;
    warning?: string;
}
/** Standalone, editable SVG: text remains text and every court remains vector data. */
export function buildReportPieceSvg(report: OpponentReport, piece: ResolvedBoardPiece, branding: ReportExportBranding, t: ViewT): string {
    const width = 794;
    let y = 36;
    const nodes: string[] = [];
    const text = (value: string, size = 14, x = 32, maxWidth = 730) => {
        // Conservative wrapping also handles unbroken URLs and CJK text.
        const capacity = Math.max(1, Math.floor(maxWidth / size));
        for (const paragraph of value.split('\n')) {
            const chars = Array.from(paragraph);
            if (!chars.length) {
                y += size * 1.5;
                continue;
            }
            while (chars.length) {
                let length = Math.min(capacity, chars.length);
                if (length < chars.length) {
                    const boundary = chars.slice(0, length).lastIndexOf(' ');
                    if (boundary > length / 2)
                        length = boundary + 1;
                }
                const line = chars.splice(0, length).join('');
                nodes.push(`<text x="${x}" y="${y}" font-size="${size}" fill="#172554">${escapeReportXml(line)}</text>`);
                y += size * 1.5;
            }
        }
    };
    nodes.push(`<image x="32" y="12" width="36" height="36" href="${escapeReportXml(branding.logoDataUrl)}"/>`);
    text(t('tacticalGeneratedHeader'), 14, 82, 670);
    text(report.opponent.name, 16);
    const link = APP_METADATA.urls.releases;
    nodes.push(`<a href="${escapeReportXml(link)}" target="_blank">`);
    text(t('tacticalDownloadSoftware'), 12);
    nodes.push('</a>');
    text(branding.sampleLine, 12);
    if (branding.legend) text(branding.legend, 11);
    if (branding.warning) text(branding.warning, 12);
    y += 12;
    text(piece.title, 20);
    if (piece.subtitle)
        text(piece.subtitle);
    if (piece.itemsTitle)
        text(piece.itemsTitle, 16);
    piece.items?.forEach((item, index) => text(`${index + 1}. ${item}`));
    if (piece.secondaryItemsTitle)
        text(piece.secondaryItemsTitle, 16);
    piece.secondaryItems?.forEach((item) => text(`• ${item}`));
    if (piece.tableTitle) text(piece.tableTitle, 16);
    if (piece.table) {
        const columns = piece.table.columns.length;
        const colWidth = 730 / Math.max(1, columns);
        const rows = [piece.table.columns, ...piece.table.rows.map((row) => row.map(formatViewCell))];
        rows.forEach((row, index) => {
            const top = y;
            let bottom = y;
            row.forEach((value, column) => {
                y = top + 16;
                text(value, index === 0 ? 12 : 11, 36 + column * colWidth, colWidth - 12);
                bottom = Math.max(bottom, y);
            });
            nodes.push(`<rect x="32" y="${top}" width="730" height="${bottom - top + 6}" fill="none" stroke="#64748b"/>`);
            y = bottom + 10;
        });
    }
    for (const [index, court] of (piece.courts ?? (piece.court ? [piece.court] : [])).entries()) {
        text(court.label, 15);
        const vb = court.svg.match(/viewBox="([^"]+)"/);
        const dimensions = vb?.[1].split(/[ ,]+/).map(Number);
        const w = dimensions?.[2] ?? Number(court.svg.match(/\bwidth="([\d.]+)"/)?.[1] ?? 320);
        const h = dimensions?.[3] ?? Number(court.svg.match(/\bheight="([\d.]+)"/)?.[1] ?? 320);
        const displayWidth = Math.min(600, w * 1.4);
        const displayHeight = displayWidth * h / w;
        // Namespace ids to keep marker references independent across several courts.
        const svg = court.svg.replace(/\bid="([^"]+)"/g, `id="c${index}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#c${index}-$1)`);
        nodes.push(`<g transform="translate(32 ${y}) scale(${displayWidth / w})">${svg}</g>`);
        y += displayHeight + 20;
        if (court.sample)
            text(court.sample, 12);
        if (court.badge)
            text(formatViewCell(court.badge), 12);
    }
    if (piece.videoLink) {
        nodes.push(`<a href="${escapeReportXml(piece.videoLink.url)}" target="_blank">`);
        text(t(piece.videoLink.skill === 'receive' ? 'tacticalWatchReception' : 'tacticalWatchAttack'));
        nodes.push('</a>');
        text(t('tacticalVideoCoverage', { available: piece.videoLink.actions ?? piece.videoLink.clips, total: piece.videoLink.totalActions ?? piece.videoLink.clips }), 12);
        text(t('opponentReportVideoLink', { date: new Date(piece.videoLink.expiresAt).toLocaleDateString() }), 12);
    }
    if (piece.note) {
        text(t('opponentReportBoardSheetNote'), 15);
        text(piece.note);
    }
    y += 24;
    text(t('tacticalCreatedFooter', { date: branding.generatedOn, author: APP_METADATA.author.name }), 11);
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${Math.max(300, Math.ceil(y + 20))}" viewBox="0 0 ${width} ${Math.max(300, Math.ceil(y + 20))}" font-family="sans-serif"><rect width="100%" height="100%" fill="white"/>${nodes.join('')}</svg>`;
}
