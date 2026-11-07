/**
 * "How they serve": full court drawn left to right, the server's half on the
 * left and the receiving half on the right. One strip per main serve type,
 * with cones from the start zone to the target zone grouped in three
 * preference clusters, and an arrow on the route with most aces. Pure module.
 */
import type { ServeRouteMetrics, ServeTypeBreakdown, ServerReportMetrics } from './serving-metrics';

export type ServePreferenceCluster = 'high' | 'medium' | 'low';

export interface ServeCourtLabels {
  title: string;
  /** One heading per strip, already translated (type and figures). */
  stripHeading: (breakdown: ServeTypeBreakdown) => string;
  legendHigh: string;
  legendMedium: string;
  legendLow: string;
  legendAce: string;
  aceLabel: (aces: number) => string;
  /** Shown on the court when the serves carry no start/target zones. */
  noZones: string;
}

export const SERVE_CLUSTER_COLORS: Record<ServePreferenceCluster, string> = {
  high: '#dc2626',
  medium: '#f59e0b',
  low: '#60a5fa',
};

/** Types shown as their own strip: at most two, each with a meaningful share. */
export function mainServeTypes(server: ServerReportMetrics): ServeTypeBreakdown[] {
  const typed = server.typeBreakdown.filter((entry) => entry.serves > 0);
  if (typed.length <= 1) return typed.length ? typed : [];
  const relevant = typed.filter((entry) => entry.serves >= 3 && entry.serves / server.serves >= 0.2).slice(0, 2);
  return relevant.length ? relevant : typed.slice(0, 1);
}

/** Cluster by share of the most used route: ≥ 2/3 high, ≥ 1/3 medium, else low. */
export function servePreferenceCluster(route: ServeRouteMetrics, maxShare: number): ServePreferenceCluster {
  if (maxShare <= 0) return 'low';
  const relative = route.share / maxShare;
  if (relative >= 2 / 3) return 'high';
  if (relative >= 1 / 3) return 'medium';
  return 'low';
}

const xml = (value: string) => value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!);

// Receiving half, seen from the server: depth columns from the net outwards,
// rows from top to bottom. The receiver faces left, so its left (4, 7, 5) is at the bottom.
const TARGET_COLUMNS: readonly (readonly string[])[] = [['2', '3', '4'], ['9', '8', '7'], ['1', '6', '5']];
// The server faces right, so its left (zone 5) is at the top.
const START_ROW: Record<string, number> = { '5': 0, '7': 0, '6': 1, '8': 1, '1': 2, '9': 2 };

const WIDTH = 360;
const MARGIN_X = 26;
const COURT_WIDTH = WIDTH - MARGIN_X * 2;
const COURT_HEIGHT = COURT_WIDTH / 2;
const HEADING = 16;
const STRIP_GAP = 10;
const LEGEND = 30;

function drawStrip(breakdown: ServeTypeBreakdown, top: number, labels: ServeCourtLabels, index: number): string {
  const courtTop = top + HEADING;
  const netX = MARGIN_X + COURT_WIDTH / 2;
  const half = COURT_WIDTH / 2;
  const cellW = half / 3;
  const cellH = COURT_HEIGHT / 3;
  const startY = (zone: string) => courtTop + ((START_ROW[zone] ?? 1) + 0.5) * cellH;
  const startX = MARGIN_X - 8;
  const cell = (zone: string) => {
    const column = TARGET_COLUMNS.findIndex((zones) => zones.includes(zone));
    if (column < 0) return null;
    const row = TARGET_COLUMNS[column].indexOf(zone);
    return { x: netX + column * cellW, y: courtTop + row * cellH };
  };

  const routes = breakdown.routes.filter((route) => cell(route.targetZone));
  const maxShare = Math.max(0, ...routes.map((route) => route.share));
  // Least used first, so the preferred cones are painted on top.
  const cones = [...routes].reverse().map((route) => {
    const target = cell(route.targetZone)!;
    const cluster = servePreferenceCluster(route, maxShare);
    const color = SERVE_CLUSTER_COLORS[cluster];
    const sy = startY(route.startZone);
    const tipX = target.x + cellW / 2;
    return `<polygon data-serve-cone="${xml(`${route.startZone}->${route.targetZone}`)}" data-cluster="${cluster}" points="${startX},${sy.toFixed(1)} ${tipX.toFixed(1)},${(target.y + 3).toFixed(1)} ${tipX.toFixed(1)},${(target.y + cellH - 3).toFixed(1)}" fill="${color}" fill-opacity="${cluster === 'high' ? 0.38 : cluster === 'medium' ? 0.28 : 0.18}" stroke="${color}" stroke-opacity="0.7" stroke-width="0.8"/>`;
  });

  const targetShares = new Map<string, number>();
  const routeTotal = routes.reduce((sum, route) => sum + route.count, 0);
  for (const route of routes) targetShares.set(route.targetZone, (targetShares.get(route.targetZone) ?? 0) + route.count);
  const cells = TARGET_COLUMNS.flatMap((zones) => zones.map((zone) => {
    const position = cell(zone)!;
    const count = targetShares.get(zone) ?? 0;
    return [
      `<rect data-serve-target-zone="${zone}" x="${position.x.toFixed(1)}" y="${position.y.toFixed(1)}" width="${cellW.toFixed(1)}" height="${cellH.toFixed(1)}" fill="none" stroke="#cbd5e1" stroke-width="0.6"/>`,
      `<text x="${(position.x + 3).toFixed(1)}" y="${(position.y + 9).toFixed(1)}" font-size="7" fill="#94a3b8">${zone}</text>`,
      count && routeTotal ? `<text x="${(position.x + cellW / 2).toFixed(1)}" y="${(position.y + cellH / 2 + 4).toFixed(1)}" font-size="10" font-weight="bold" fill="#111827" text-anchor="middle">${Math.round((count / routeTotal) * 100)}%</text>` : '',
    ].join('');
  }));

  const starts = new Set(routes.map((route) => route.startZone));
  const startMarks = [...starts].map((zone) => `<circle data-serve-start-zone="${zone}" cx="${startX}" cy="${startY(zone).toFixed(1)}" r="3.2" fill="#002554"/><text x="${startX - 5}" y="${(startY(zone) + 3).toFixed(1)}" font-size="7" fill="#002554" text-anchor="end">${zone}</text>`);

  const aceRoute = [...routes].filter((route) => route.aces > 0).sort((a, b) => b.aces - a.aces || b.count - a.count)[0];
  let arrow = '';
  if (aceRoute) {
    const target = cell(aceRoute.targetZone)!;
    const tx = target.x + cellW / 2, ty = target.y + cellH / 2 - 9;
    arrow = [
      `<line data-serve-ace-route="${xml(`${aceRoute.startZone}->${aceRoute.targetZone}`)}" x1="${startX}" y1="${startY(aceRoute.startZone).toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="#111827" stroke-width="2" marker-end="url(#serve-ace-arrow-${index})"/>`,
      `<text x="${tx.toFixed(1)}" y="${(ty - 4).toFixed(1)}" font-size="7.5" font-weight="bold" fill="#111827" text-anchor="middle">${xml(labels.aceLabel(aceRoute.aces))}</text>`,
    ].join('');
  }

  return [
    `<defs><marker id="serve-ace-arrow-${index}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#111827"/></marker></defs>`,
    `<text x="${MARGIN_X}" y="${top + 11}" font-size="9" font-weight="bold" fill="#002554">${xml(labels.stripHeading(breakdown))}</text>`,
    `<rect x="${MARGIN_X}" y="${courtTop}" width="${COURT_WIDTH}" height="${COURT_HEIGHT}" fill="#f8fafc" stroke="#002554" stroke-width="1.3"/>`,
    `<line x1="${netX - cellW}" y1="${courtTop}" x2="${netX - cellW}" y2="${courtTop + COURT_HEIGHT}" stroke="#94a3b8" stroke-dasharray="4 3"/>`,
    `<line x1="${netX + cellW}" y1="${courtTop}" x2="${netX + cellW}" y2="${courtTop + COURT_HEIGHT}" stroke="#94a3b8" stroke-dasharray="4 3"/>`,
    ...cells,
    ...cones,
    `<line x1="${netX}" y1="${courtTop - 4}" x2="${netX}" y2="${courtTop + COURT_HEIGHT + 4}" stroke="#002554" stroke-width="3"/>`,
    ...startMarks,
    arrow,
    routes.length ? '' : `<text data-serve-no-zones="true" x="${MARGIN_X + COURT_WIDTH / 4}" y="${courtTop + COURT_HEIGHT / 2 + 3}" font-size="8" fill="#64748b" text-anchor="middle">${xml(labels.noZones)}</text>`,
  ].join('');
}

export function buildServeHowCourtSvg(server: ServerReportMetrics, labels: ServeCourtLabels): string {
  const strips = mainServeTypes(server);
  const stripHeight = HEADING + COURT_HEIGHT;
  // The card already shows the player: the title stays only as accessible <title>.
  const titleHeight = 2;
  const height = titleHeight + Math.max(1, strips.length) * stripHeight + Math.max(0, strips.length - 1) * STRIP_GAP + LEGEND;
  const legendY = height - LEGEND + 12;
  const legendItems: Array<[string, string]> = [
    [SERVE_CLUSTER_COLORS.high, labels.legendHigh],
    [SERVE_CLUSTER_COLORS.medium, labels.legendMedium],
    [SERVE_CLUSTER_COLORS.low, labels.legendLow],
  ];
  const legendStep = COURT_WIDTH / 4;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height.toFixed(1)}" viewBox="0 0 ${WIDTH} ${height.toFixed(1)}">`,
    `<title>${xml(labels.title)}</title>`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    ...strips.map((breakdown, index) => drawStrip(breakdown, titleHeight + index * (stripHeight + STRIP_GAP), labels, index)),
    ...legendItems.map(([fill, label], index) => `<rect x="${MARGIN_X + index * legendStep}" y="${legendY - 7}" width="9" height="9" fill="${fill}" fill-opacity="0.6"/><text x="${MARGIN_X + index * legendStep + 12}" y="${legendY + 1}" font-size="7.5" fill="#1f2937">${xml(label)}</text>`),
    `<line x1="${MARGIN_X + 3 * legendStep}" y1="${legendY - 3}" x2="${MARGIN_X + 3 * legendStep + 12}" y2="${legendY - 3}" stroke="#111827" stroke-width="2"/><path d="M${MARGIN_X + 3 * legendStep + 11} ${legendY - 7} L${MARGIN_X + 3 * legendStep + 17} ${legendY - 3} L${MARGIN_X + 3 * legendStep + 11} ${legendY + 1} z" fill="#111827"/><text x="${MARGIN_X + 3 * legendStep + 20}" y="${legendY + 1}" font-size="7.5" fill="#1f2937">${xml(labels.legendAce)}</text>`,
    '</svg>',
  ].join('');
}
