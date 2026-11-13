/**
 * "How they serve": full court drawn left to right, the server's half on the
 * left and the receiving half on the right. One strip per main serve type:
 * target zones shaded as a heatmap (share in each zone), the most used routes
 * as arrows whose width follows their share, and a dashed arrow on the route
 * with most aces. Pure module.
 */
import type { ServeHeatmapCellEdit } from '@src/domain/opponent-report/types';
import type { ServeRouteMetrics, ServeTypeBreakdown, ServerReportMetrics } from './serving-metrics';

export interface ServeCourtLabels {
  title: string;
  /** One heading per strip, already translated (type and figures). */
  stripHeading: (breakdown: ServeTypeBreakdown) => string;
  /** Legend: darker target zones receive more serves. */
  legendHeat: string;
  /** Legend: arrow width follows the route's share. */
  legendRoutes: string;
  legendAce: string;
  aceLabel: (aces: number) => string;
  /** Shown on the court when the serves carry no start/target zones. */
  noZones: string;
}

/** Routes drawn as arrows: more would hide the heatmap underneath. */
export const SERVE_ROUTE_ARROWS = 4;
const ROUTE_COLOR = '#1e3a8a';
const HEAT_RGB = '220, 38, 38';

/** Heat opacity for a zone: 0 when unused, then 0.12-0.72 by share of the busiest zone. */
export function serveHeatOpacity(count: number, maxCount: number): number {
  if (count <= 0 || maxCount <= 0) return 0;
  return 0.12 + 0.6 * (count / maxCount);
}

/** Types shown as their own strip: at most two, each with a meaningful share. */
export function mainServeTypes(server: ServerReportMetrics): ServeTypeBreakdown[] {
  const typed = server.typeBreakdown.filter((entry) => entry.serves > 0);
  if (typed.length <= 1) return typed.length ? typed : [];
  const relevant = typed.filter((entry) => entry.serves >= 3 && entry.serves / server.serves >= 0.2).slice(0, 2);
  return relevant.length ? relevant : typed.slice(0, 1);
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

function drawStrip(
  breakdown: ServeTypeBreakdown,
  top: number,
  labels: ServeCourtLabels,
  index: number,
  heatmapEdits?: Record<string, ServeHeatmapCellEdit>,
): string {
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
  const routeTotal = routes.reduce((sum, route) => sum + route.count, 0);
  const zoneCounts = new Map<string, number>();
  for (const route of routes) zoneCounts.set(route.targetZone, (zoneCounts.get(route.targetZone) ?? 0) + route.count);
  const effectivePercentByZone = new Map<string, { visible: boolean; pct: number }>();
  for (const zones of TARGET_COLUMNS) {
    for (const zone of zones) {
      const count = zoneCounts.get(zone) ?? 0;
      const computedPct = routeTotal > 0 ? Math.round((count / routeTotal) * 100) : 0;
      const edit = heatmapEdits?.[`${index}:${zone}`];
      const visible = edit?.visible ?? true;
      const pct = visible
        ? (edit?.percent != null && Number.isFinite(edit.percent) ? Math.max(0, Math.min(100, Math.round(edit.percent))) : computedPct)
        : 0;
      effectivePercentByZone.set(zone, { visible, pct });
    }
  }
  const maxZonePct = Math.max(0, ...[...effectivePercentByZone.values()].map((entry) => entry.pct));

  // Heatmap of the target zones, with the share of serves in each one.
  const cells = TARGET_COLUMNS.flatMap((zones) => zones.map((zone) => {
    const position = cell(zone)!;
    const { visible, pct } = effectivePercentByZone.get(zone) ?? { visible: true, pct: 0 };
    const opacity = visible ? serveHeatOpacity(pct, maxZonePct) : 0;
    return [
      `<rect data-serve-target-zone="${zone}" data-heat="${opacity.toFixed(2)}" data-serve-strip="${index}" data-serve-pct="${pct}" x="${position.x.toFixed(1)}" y="${position.y.toFixed(1)}" width="${cellW.toFixed(1)}" height="${cellH.toFixed(1)}" fill="${opacity ? `rgb(${HEAT_RGB})` : 'none'}"${opacity ? ` fill-opacity="${opacity.toFixed(2)}"` : ''} stroke="#cbd5e1" stroke-width="0.6"/>`,
      `<text x="${(position.x + 3).toFixed(1)}" y="${(position.y + 9).toFixed(1)}" font-size="7" fill="#64748b">${zone}</text>`,
      visible && pct > 0 ? `<text x="${(position.x + cellW / 2).toFixed(1)}" y="${(position.y + cellH / 2 + 4).toFixed(1)}" font-size="10" font-weight="bold" fill="#111827" stroke="#ffffff" stroke-width="2.5" paint-order="stroke" text-anchor="middle">${pct}%</text>` : '',
    ].join('');
  }));

  // Main routes as arrows; they stop at the target zone's edge so its share stays readable.
  const maxShare = Math.max(0, ...routes.map((route) => route.share));
  const arrowTip = (route: ServeRouteMetrics, offsetY = 0) => {
    const target = cell(route.targetZone)!;
    return { x: target.x + 3, y: target.y + cellH / 2 + offsetY };
  };
  const arrows = routes.slice(0, SERVE_ROUTE_ARROWS).reverse().map((route) => {
    const tip = arrowTip(route);
    const width = 1.2 + 5 * (maxShare ? route.share / maxShare : 0);
    return `<line data-serve-route="${xml(`${route.startZone}->${route.targetZone}`)}" data-width="${width.toFixed(1)}" x1="${startX}" y1="${startY(route.startZone).toFixed(1)}" x2="${tip.x.toFixed(1)}" y2="${tip.y.toFixed(1)}" stroke="${ROUTE_COLOR}" stroke-opacity="0.85" stroke-width="${width.toFixed(1)}" stroke-linecap="round" marker-end="url(#serve-route-arrow-${index})"/>`;
  });

  const starts = new Set(routes.map((route) => route.startZone));
  const startMarks = [...starts].map((zone) => `<circle data-serve-start-zone="${zone}" cx="${startX}" cy="${startY(zone).toFixed(1)}" r="3.2" fill="#002554"/><text x="${startX - 5}" y="${(startY(zone) + 3).toFixed(1)}" font-size="7" fill="#002554" text-anchor="end">${zone}</text>`);

  const aceRoute = [...routes].filter((route) => route.aces > 0).sort((a, b) => b.aces - a.aces || b.count - a.count)[0];
  let aceArrow = '';
  if (aceRoute) {
    const tip = arrowTip(aceRoute, -cellH / 4);
    aceArrow = [
      `<line data-serve-ace-route="${xml(`${aceRoute.startZone}->${aceRoute.targetZone}`)}" x1="${startX}" y1="${(startY(aceRoute.startZone) - 3).toFixed(1)}" x2="${tip.x.toFixed(1)}" y2="${tip.y.toFixed(1)}" stroke="#111827" stroke-width="1.6" stroke-dasharray="5 3" marker-end="url(#serve-ace-arrow-${index})"/>`,
      `<text x="${(tip.x - 3).toFixed(1)}" y="${(tip.y - 4).toFixed(1)}" font-size="7.5" font-weight="bold" fill="#111827" text-anchor="end">${xml(labels.aceLabel(aceRoute.aces))}</text>`,
    ].join('');
  }

  return [
    `<defs><marker id="serve-route-arrow-${index}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="3.5" markerHeight="3.5" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="${ROUTE_COLOR}"/></marker><marker id="serve-ace-arrow-${index}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#111827"/></marker></defs>`,
    `<text data-serve-strip-heading="${index}" x="${MARGIN_X}" y="${top + 11}" font-size="9" font-weight="bold" fill="#002554">${xml(labels.stripHeading(breakdown))}</text>`,
    `<rect x="${MARGIN_X}" y="${courtTop}" width="${COURT_WIDTH}" height="${COURT_HEIGHT}" fill="#f8fafc" stroke="#002554" stroke-width="1.3"/>`,
    `<line x1="${netX - cellW}" y1="${courtTop}" x2="${netX - cellW}" y2="${courtTop + COURT_HEIGHT}" stroke="#94a3b8" stroke-dasharray="4 3"/>`,
    ...cells,
    `<line x1="${netX + cellW}" y1="${courtTop}" x2="${netX + cellW}" y2="${courtTop + COURT_HEIGHT}" stroke="#94a3b8" stroke-dasharray="4 3"/>`,
    `<line x1="${netX}" y1="${courtTop - 4}" x2="${netX}" y2="${courtTop + COURT_HEIGHT + 4}" stroke="#002554" stroke-width="3"/>`,
    ...arrows,
    ...startMarks,
    aceArrow,
    routes.length ? '' : `<text data-serve-no-zones="true" x="${MARGIN_X + COURT_WIDTH / 4}" y="${courtTop + COURT_HEIGHT / 2 + 3}" font-size="8" fill="#64748b" text-anchor="middle">${xml(labels.noZones)}</text>`,
  ].join('');
}

export function buildServeHowCourtSvg(
  server: ServerReportMetrics,
  labels: ServeCourtLabels,
  heatmapEdits?: Record<string, ServeHeatmapCellEdit>,
): string {
  const strips = mainServeTypes(server);
  const stripHeight = HEADING + COURT_HEIGHT;
  // The card already shows the player: the title stays only as accessible <title>.
  const titleHeight = 2;
  const height = titleHeight + Math.max(1, strips.length) * stripHeight + Math.max(0, strips.length - 1) * STRIP_GAP + LEGEND;
  const legendY = height - LEGEND + 12;
  const third = COURT_WIDTH / 3;
  const heatSwatches = [0.25, 0.5, 0.72].map((opacity, i) => `<rect x="${MARGIN_X + i * 8}" y="${legendY - 7}" width="8" height="9" fill="rgb(${HEAT_RGB})" fill-opacity="${opacity}"/>`).join('');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height.toFixed(1)}" viewBox="0 0 ${WIDTH} ${height.toFixed(1)}">`,
    `<title>${xml(labels.title)}</title>`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    ...strips.map((breakdown, index) => drawStrip(breakdown, titleHeight + index * (stripHeight + STRIP_GAP), labels, index, heatmapEdits)),
    heatSwatches,
    `<text x="${MARGIN_X + 28}" y="${legendY + 1}" font-size="7.5" fill="#1f2937">${xml(labels.legendHeat)}</text>`,
    `<line x1="${MARGIN_X + third}" y1="${legendY - 3}" x2="${MARGIN_X + third + 14}" y2="${legendY - 3}" stroke="${ROUTE_COLOR}" stroke-width="1.5"/><line x1="${MARGIN_X + third + 18}" y1="${legendY - 3}" x2="${MARGIN_X + third + 32}" y2="${legendY - 3}" stroke="${ROUTE_COLOR}" stroke-width="5"/>`,
    `<text x="${MARGIN_X + third + 36}" y="${legendY + 1}" font-size="7.5" fill="#1f2937">${xml(labels.legendRoutes)}</text>`,
    `<line x1="${MARGIN_X + 2 * third}" y1="${legendY - 3}" x2="${MARGIN_X + 2 * third + 16}" y2="${legendY - 3}" stroke="#111827" stroke-width="1.6" stroke-dasharray="4 2"/>`,
    `<text x="${MARGIN_X + 2 * third + 20}" y="${legendY + 1}" font-size="7.5" fill="#1f2937">${xml(labels.legendAce)}</text>`,
    '</svg>',
  ].join('');
}
