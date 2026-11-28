// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { createOpponentReport } from '@src/domain/opponent-report/types';
import { DEFAULT_RECEPTION_SYSTEM_BLOCK } from '@src/config/systems/reception-defaults';
import { en } from '@src/i18n/locales/en';
import { PRINT_THEMES } from '@src/lib/theme/print-theme';
import { ATHLETE_SILHOUETTE_BALL } from '@src/components/athlete-silhouettes/athlete-silhouettes';
import { computeOpponentReportMetrics } from './report-metrics';
import { computeAttackingReportMetrics } from './attacking-metrics';
import { DEFAULT_THRESHOLDS } from './traffic-light';
import { buildReportView, type TeamPlayerInfo, type ViewT } from './report-view';
import { bookletSilhouette, bookletTextWidth, buildReportBooklet, buildSharedReportBooklet, LINEUP_CELL_HEIGHT, lineupCellHeight, lineupFigureLines, lineupPortraitSize } from './report-booklet';
import { buildSharedReportUrl, decodeSharedReport } from './report-share-link';

const t: ViewT = (key, params) => ((en as Record<string, string>)[key] ?? key).replace(/{{(\w+)}}/g, (_, name) => String(params?.[name] ?? name));
// A tiny real JPEG would do as well: the booklet only checks the data URL shape.
const PHOTO = `data:image/jpeg;base64,${'/9j/4AAQSkZJRgABAQ'.padEnd(400, 'A')}`;
const OTHER_PHOTO = `data:image/png;base64,${'iVBORw0KGgo'.padEnd(400, 'B')}`;

function fixture() {
  const report = createOpponentReport({ id: 'photos', title: 'Prep', opponent: { name: 'Rivals' } });
  report.booklet = { ...report.booklet!, includeServe: false };
  const view = buildReportView(report, computeOpponentReportMetrics([]), [], DEFAULT_THRESHOLDS, t, DEFAULT_RECEPTION_SYSTEM_BLOCK, computeAttackingReportMetrics([]));
  const cell = (text: string) => ({ text });
  const info = (key: string, name: string, role: string, pose: TeamPlayerInfo['pose'], figures = 'Att. eff. 30% · Rec. pos. 61%'): TeamPlayerInfo =>
    ({ key, jersey: key, name, role, pose, figures, matches: 3, stats: [cell(key), cell(name), ...Array.from({ length: 7 }, () => cell('1'))] });
  const players = [info('1', 'Ada Setter', 'P', 'setter'), info('2', 'Bea Out', 'S', 'attacker'), info('3', 'Cia Mid', 'C', 'blocker'), info('4', 'Dea Opp', 'O', 'attacker'),
    info('5', 'Eva Out', 'S', 'attacker'), info('6', 'Fra Mid', 'C', 'blocker'), info('7', 'Giovanna Outside', 'S', 'attacker'), info('8', 'Ila Lib', 'L', 'reception', 'Rec. pos. 58% · Digs 41')];
  view.team = { roster: { columns: [], rows: [] }, starts: { columns: [], rows: [] }, hasStarts: false, basis: '', singleMatch: false, players,
    lineupCells: [['1'], ['2'], ['3'], ['4'], ['5'], ['6'], ['8'], []], liberoLabels: ['L', 'L'], lineupCaption: 'Six that started most sets together.',
    startersColumns: ['#', 'Name', 'Serve', 'Serve eff.', 'Rec.', 'Rec. pos.', 'Att.', 'Att. eff.', 'Block'] };
  // Zone 5 holds two athletes side by side.
  report.pieceEdits = { 'team:lineup': { lineupCells: [['1'], ['2'], ['3'], ['4'], ['5', '7'], ['6'], ['8'], []] } };
  return { report, view };
}
const lineupPage = (pages: string[]) => pages.find((page) => page.includes(`>${t('teamLineupTitle')}<`))!;
const images = (page: string) => [...page.matchAll(/<image href="([^"]+)" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)"[^>]*\/>/g)]
  .map((match) => ({ href: match[1], x: Number(match[2]), y: Number(match[3]), size: Number(match[4]), tag: match[0] }));

describe('athlete photos in the line-up of the Team page', () => {
  it('draws the photo of an athlete in a rounded square, alone in a cell or sharing it, in A5 and A4', () => {
    const { report, view } = fixture();
    const photos = new Map([['1', PHOTO], ['5', OTHER_PHOTO]]);
    for (const a4 of [false, true]) {
      const page = lineupPage(buildReportBooklet(report, view, t, '', { a4, logo: null, athletePhotos: photos }).pages);
      const drawn = images(page);
      expect(drawn.map((image) => image.href).sort(), `a4=${a4}`).toEqual([PHOTO, OTHER_PHOTO].sort());
      for (const image of drawn) {
        expect(image.tag).toContain('preserveAspectRatio="xMidYMid slice"');
        const clip = image.tag.match(/clip-path="url\(#([^)]+)\)"/)![1];
        expect(page).toContain(`<clipPath id="${clip}"><rect x="${image.x}" y="${image.y}" width="${image.size}" height="${image.size}" rx="3"/></clipPath>`);
      }
      const alone = drawn.find((image) => image.href === PHOTO)!, shared = drawn.find((image) => image.href === OTHER_PHOTO)!;
      expect(alone.size).toBe(lineupPortraitSize(a4, 1, LINEUP_CELL_HEIGHT[a4 ? 'a4' : 'a5'].full));
      expect(shared.size).toBeLessThan(alone.size);
      expect(shared.size).toBeGreaterThanOrEqual(10);
      // The other athletes get the drawing of their role, in the ink of the theme.
      expect(page).toContain(`fill="${ATHLETE_SILHOUETTE_BALL}"`);
      expect(page).not.toContain('currentColor');
    }
  });

  it('draws the role drawing when there is no photo and ignores anything that is not a usable picture', () => {
    const { report, view } = fixture();
    const page = lineupPage(buildReportBooklet(report, view, t, '', { logo: null, athletePhotos: new Map([['1', 'data:image/svg+xml;base64,PHN2Zz4='], ['2', 'https://example.org/a.jpg']]) }).pages);
    expect(page).not.toContain('<image');
    // Eight athletes, eight drawings; the setter, the blocker and the libero have their own pose.
    expect(page.match(/<g transform="translate\([\d. -]+\) scale\([\d.]+\)"><(?:path|ellipse)/g)).toHaveLength(8);
    const bw = lineupPage(buildReportBooklet(report, view, t, '', { logo: null, theme: PRINT_THEMES['black-white'] }).pages);
    expect(bw).toContain('fill="#000000"');
  });

  it('keeps every name and figure of two athletes sharing a cell, without overlapping the matches line', () => {
    const { report, view } = fixture();
    for (const a4 of [false, true]) {
      const page = lineupPage(buildReportBooklet(report, view, t, '', { a4, logo: null }).pages);
      expect(page, `a4=${a4}`).toContain('>Rec. pos. 61%<');
      expect(page).toMatch(/>#7 Giovanna( Outside)?</);
      const texts = [...page.matchAll(/<text x="([\d.]+)" y="([\d.]+)" font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), size: Number(m[3]), value: m[4] }));
      const matches = texts.filter((entry) => entry.value === t('teamCellMatches', { n: 3 }));
      for (const line of matches) {
        const above = texts.filter((entry) => entry.x === line.x && entry.y < line.y && entry.y > line.y - 20);
        for (const entry of above) expect(line.y - entry.y, `${entry.value} above ${line.value}`).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it('keeps both figures and clears the zone label when the cells are at their smallest', () => {
    const { report, view } = fixture();
    const team = view.team!;
    // A long note under the line-up leaves the cells at their old, smallest height.
    team.lineupCaption = 'Six that started most sets together. '.repeat(50);
    team.liberoLabels = ['L 接发', 'L 防守'];
    team.players = [
      ...team.players!.map((player) => (player.key === '7' ? { ...player, figures: 'Att. eff. 77% · Rec. pos. 88%' } : player)),
      { ...team.players!.find((player) => player.key === '8')!, key: '9', jersey: '9', name: 'Lia Lib' },
    ].map((player) => (player.pose === 'reception' ? { ...player, role: '自由人' } : player));
    report.pieceEdits = { 'team:lineup': { lineupCells: [['1'], ['7'], ['3'], ['4'], ['5', '2'], ['6'], ['8', '9'], []] } };
    const page = lineupPage(buildReportBooklet(report, view, t, '', { logo: null, athletePhotos: new Map([['8', PHOTO]]) }).pages);
    expect(page).toContain(`height="${LINEUP_CELL_HEIGHT.a5.base}" rx="4"`);
    // The athlete alone with a name on two lines keeps her second figure.
    expect(page).toMatch(/>#7 Giovanna/);
    expect(page).toMatch(/>(Att\. eff\. 77% · )?Rec\. pos\. 88%</);
    // No two texts of the cells overlap (the zone and libero labels included).
    const texts = [...page.matchAll(/<text x="([\d.]+)" y="([\d.]+)" font-size="([\d.]+)"([^>]*)>([^<]*)<\/text>/g)]
      .map((m) => {
        const x = Number(m[1]), y = Number(m[2]), size = Number(m[3]), value = m[5];
        const width = bookletTextWidth(value, size);
        const left = m[4].includes('text-anchor="end"') ? x - width : x;
        return { value, left, right: left + width, top: y - 0.75 * size, bottom: y + 0.2 * size };
      });
    const lineupBottom = Number(page.match(/>Six that started most sets together\./) ? texts.find((entry) => entry.value.startsWith('Six that'))!.top : Infinity);
    const cellTexts = texts.filter((entry) => entry.bottom < lineupBottom && entry.top > 60);
    expect(cellTexts.filter((entry) => /^(Zone \d|L )/.test(entry.value)).length).toBeGreaterThanOrEqual(7);
    cellTexts.forEach((a, i) => cellTexts.slice(i + 1).forEach((b) => {
      const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      expect(overlap, `"${a.value}" overlaps "${b.value}"`).toBe(false);
    }));
  });

  it('sizes the cells and portraits within the page', () => {
    expect(lineupCellHeight(false, 1000, 3)).toBe(LINEUP_CELL_HEIGHT.a5.full);
    expect(lineupCellHeight(true, 1000, 3)).toBe(LINEUP_CELL_HEIGHT.a4.full);
    // Never smaller than the cells before photos, even when the starters' table leaves little room.
    expect(lineupCellHeight(false, 100, 3)).toBe(LINEUP_CELL_HEIGHT.a5.base);
    expect(lineupCellHeight(false, 3 * 70, 3)).toBe(70);
    expect(lineupPortraitSize(false, 1, 78)).toBeLessThanOrEqual(78 - 12);
    expect(lineupPortraitSize(false, 2, 62)).toBeGreaterThanOrEqual(10);
    expect(lineupFigureLines('Att. eff. 30% · Block 3', 1000)).toEqual(['Att. eff. 30% · Block 3']);
    expect(lineupFigureLines('Att. eff. 30% · Block 3', 50)).toEqual(['Att. eff. 30%', 'Block 3']);
  });

  it('fits each role drawing in its square with paths only, one path per piece of a curved shape', () => {
    for (const pose of ['reception', 'setter', 'attacker', 'blocker'] as const) {
      const svg = bookletSilhouette(pose, 10, 20, 40, '#142e42');
      expect(svg).not.toMatch(/currentColor|<image|<mask|<defs|clipPath/);
      // No path draws two curved pieces at once.
      for (const [, d] of svg.matchAll(/<path d="([^"]+)"/g)) if (/[ACQST]/i.test(d)) expect(d.match(/M/g)).toHaveLength(1);
      const [, x, y, scale] = svg.match(/translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)/)!.map(Number);
      // The drawn height (from y=4 to y=144 of the drawing) stays inside the square.
      expect(y + 4 * scale).toBeGreaterThanOrEqual(20 - 0.01);
      expect(y + 144 * scale).toBeLessThanOrEqual(60 + 0.01);
      expect(x).toBeLessThan(50);
    }
  });

  it('gives a pose to each athlete from the role', () => {
    const report = createOpponentReport({ id: 'poses', title: 'Prep', opponent: { name: 'Rivals' } });
    const metrics = computeOpponentReportMetrics([]);
    const player = (key: string) => ({ key, jersey: key, name: `Player ${key}` });
    metrics.teamPlayers = [
      { player: player('1'), role: 'setter', libero: false, matches: 1 },
      { player: player('2'), role: 'outside_hitter', libero: false, matches: 1 },
      { player: player('3'), role: 'middle_blocker', libero: false, matches: 1 },
      { player: player('4'), role: 'opposite', libero: false, matches: 1 },
      { player: player('5'), role: undefined, libero: true, matches: 1 },
      { player: player('6'), role: undefined, libero: false, matches: 1 },
    ];
    const view = buildReportView(report, metrics, [], DEFAULT_THRESHOLDS, t, DEFAULT_RECEPTION_SYSTEM_BLOCK, computeAttackingReportMetrics([]));
    expect(view.team?.players?.map((entry) => entry.pose)).toEqual(['setter', 'attacker', 'blocker', 'attacker', 'reception', 'unknown']);
  });
});

describe('share link of the tactical report', () => {
  it('never carries athlete photos: the shared pages show the role drawings', () => {
    const { report, view } = fixture();
    const photos = new Map([['1', PHOTO], ['5', OTHER_PHOTO], ['8', PHOTO]]);
    // The printed booklet has them ...
    expect(buildReportBooklet(report, view, t, '', { logo: null, athletePhotos: photos }).pages.join('')).toContain(PHOTO);
    // ... the pages of the link do not, even when the photos are passed by mistake.
    const shared = buildSharedReportBooklet(report, view, t, '', { logo: null, athletePhotos: photos });
    const sharedPages = shared.pages.join('');
    expect(sharedPages).not.toContain(PHOTO);
    expect(sharedPages).not.toContain(OTHER_PHOTO);
    expect(sharedPages).not.toContain('data-athlete-photo');
    expect(lineupPage(shared.pages)).toContain(`fill="${ATHLETE_SILHOUETTE_BALL}"`);
    // And so does the link built from them.
    const url = buildSharedReportUrl('https://example.org/ovs/', { title: 'Prep', pages: shared.pages, links: [], expiresAt: Date.now() + 86_400_000 });
    const decoded = decodeSharedReport(url.slice(url.indexOf('#')).replace(/^#\/tactical-report\//, ''));
    expect(decoded).not.toBeNull();
    expect(decoded!.pages.join('')).not.toMatch(/data:image\/(jpeg|png)/);
  });
});
