// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Role silhouettes shown in place of an athlete's photo: reception (libero),
 * setter, attacker (outside hitters and opposite) and blocker (middle
 * blockers). When the role is not known, the volleyball of the OpenVolleyScout
 * logo is shown instead, in its own colours.
 *
 * These are original OpenVolleyScout drawings, made for this app and approved
 * by its author. Each one is the inner markup of an SVG with the view box
 * "0 0 120 150": the body is drawn in `currentColor`, the ball in light blue,
 * and the net and the floor shadow are drawn with a lower opacity.
 *
 * Runs under ts-node too: no imports.
 */

export type AthletePose = 'reception' | 'setter' | 'attacker' | 'blocker' | 'unknown';

export const ATHLETE_POSES: readonly AthletePose[] = ['reception', 'setter', 'attacker', 'blocker', 'unknown'];

/** Size of the drawing area of every silhouette. */
export const ATHLETE_SILHOUETTE_WIDTH = 120;
export const ATHLETE_SILHOUETTE_HEIGHT = 150;
export const ATHLETE_SILHOUETTE_VIEWBOX = `0 0 ${ATHLETE_SILHOUETTE_WIDTH} ${ATHLETE_SILHOUETTE_HEIGHT}`;

/** Colour of the ball in every silhouette. */
export const ATHLETE_SILHOUETTE_BALL = '#38bdf8';

/** Inner SVG markup of each silhouette, drawn in `currentColor` (kept exactly as approved). */
export const ATHLETE_SILHOUETTE_SVG: Readonly<Record<AthletePose, string>> = {
  reception:
    '<path d="M36.2 104.3L50.7 119.9A4.4 4.4 0 0 0 57.3 114.1L43.8 97.7A5 5 0 0 0 36.2 104.3ZM51.5 113.4L34.9 126A3.7 3.7 0 0 0 39.1 132L56.5 120.6A4.4 4.4 0 0 0 51.5 113.4Z" fill="currentColor"/><path d="M36.9 133.9L44.9 133.5A2.9 2.9 0 0 0 45.1 127.7L37.1 126.9A3.5 3.5 0 0 0 36.9 133.9Z" fill="currentColor"/><path d="M38.2 104.9L62.3 108.3A4.4 4.4 0 0 0 63.7 99.7L39.8 95.1A5 5 0 0 0 38.2 104.9ZM58.6 104.4L61.3 128.3A3.7 3.7 0 0 0 68.7 127.7L67.4 103.6A4.4 4.4 0 0 0 58.6 104.4Z" fill="currentColor"/><path d="M64.9 133.9L73.9 133.5A2.9 2.9 0 0 0 74.1 127.7L65.1 126.9A3.5 3.5 0 0 0 64.9 133.9Z" fill="currentColor"/><path d="M43.5 104.1L44.3 103.2L45.1 102.3L45.9 101.4L46.8 100.6L47.7 99.8L48.6 98.9L49.5 98.1L50.3 97.3L51.2 96.4L52 95.6L52.9 94.7L53.6 93.7L54.4 92.8L55.1 91.9L55.9 90.9L56.6 90L57.4 89.1L58.1 88.1L58.9 87.2L59.6 86.2L60.4 85.3L61.1 84.4L61.9 83.4L62.6 82.5A7.2 7.2 0 0 0 51.4 73.5L50.6 74.4L49.9 75.4L49.1 76.3L48.4 77.3L47.6 78.2L46.9 79.1L46.1 80.1L45.4 81L44.6 81.9L43.9 82.9L43.1 83.8L42.4 84.8L41.6 85.7L41 86.7L40.3 87.7L39.7 88.7L39 89.8L38.4 90.8L37.8 91.9L37.2 92.9L36.6 93.9L35.9 94.9L35.2 95.9L34.5 96.9A5.8 5.8 0 0 0 43.5 104.1Z" fill="currentColor"/><path d="M55.8 81.6L85.2 99A3.5 3.5 0 0 0 88.8 93L60.2 74.4A4.2 4.2 0 0 0 55.8 81.6Z" fill="currentColor"/><circle cx="87" cy="96" r="4" fill="currentColor"/><circle cx="65" cy="63" r="7.6" fill="currentColor"/><circle cx="88.3" cy="84.9" r="6.5" fill="#38bdf8" stroke="currentColor" stroke-width="1.1"/>',
  setter:
    '<path d="M50.1 81.8L45.2 105A4.4 4.4 0 0 0 53.8 107L59.9 84.2A5 5 0 0 0 50.1 81.8ZM45.1 105.7L44.3 127.7A3.7 3.7 0 0 0 51.7 128.3L53.9 106.3A4.4 4.4 0 0 0 45.1 105.7Z" fill="currentColor"/><path d="M47.4 126.9L40.9 127.7A2.9 2.9 0 0 0 41.1 133.5L47.6 133.9A3.5 3.5 0 0 0 47.4 126.9Z" fill="currentColor"/><path d="M60.1 84.2L66.2 107A4.4 4.4 0 0 0 74.8 105L69.9 81.8A5 5 0 0 0 60.1 84.2ZM66.1 106.3L68.3 128.3A3.7 3.7 0 0 0 75.7 127.7L74.9 105.7A4.4 4.4 0 0 0 66.1 106.3Z" fill="currentColor"/><path d="M72.4 133.9L78.9 133.5A2.9 2.9 0 0 0 79.1 127.7L72.6 126.9A3.5 3.5 0 0 0 72.4 133.9Z" fill="currentColor"/><path d="M46.5 52C46.5 48.5 51 46.5 60 46.5C69 46.5 73.5 48.5 73.5 52C73 62 70 72 69.5 80C69 83 65.5 84.5 60 84.5C54.5 84.5 51 83 50.5 80C50 72 47 62 46.5 52Z" fill="currentColor"/><path d="M54.3 49.9L44.9 36.1A3.5 3.5 0 0 0 39.1 39.9L47.7 54.1A3.9 3.9 0 0 0 54.3 49.9ZM44.9 40L53.7 26.9A3.3 3.3 0 0 0 48.3 23.1L39.1 36A3.5 3.5 0 0 0 44.9 40Z" fill="currentColor"/><path d="M72.3 54.1L80.9 39.9A3.5 3.5 0 0 0 75.1 36.1L65.7 49.9A3.9 3.9 0 0 0 72.3 54.1ZM80.9 36L71.7 23.1A3.3 3.3 0 0 0 66.3 26.9L75.1 40A3.5 3.5 0 0 0 80.9 36Z" fill="currentColor"/><circle cx="51" cy="25" r="4" fill="currentColor"/><circle cx="69" cy="25" r="4" fill="currentColor"/><circle cx="60" cy="35.5" r="7.6" fill="currentColor"/><circle cx="60" cy="12" r="6.5" fill="#38bdf8" stroke="currentColor" stroke-width="1.1"/>',
  attacker:
    '<ellipse cx="44" cy="141" rx="15" ry="1.8" fill="currentColor" opacity="0.18"/><g fill="none" stroke="currentColor" stroke-linecap="round" opacity="0.4"><path d="M79 45H113" stroke-width="2.8"/><path d="M86 46V88M96 46V88M106 46V88M79 56H113M79 67H113M79 78H113M79 88H113" stroke-width="1.1"/></g><path d="M49.7 82L39.2 101.3A4.4 4.4 0 0 0 46.8 105.7L58.3 87A5 5 0 0 0 49.7 82ZM43.9 99.2L23.7 95.9A3.7 3.7 0 0 0 22.3 103.1L42.1 107.8A4.4 4.4 0 0 0 43.9 99.2Z" fill="currentColor"/><path d="M23.7 96.2L16.5 96.4A1.8 1.8 0 0 0 15.8 99.9L22.3 102.8A3.4 3.4 0 0 0 23.7 96.2Z" fill="currentColor"/><path d="M52.1 85.3L56.7 109.2A4.4 4.4 0 0 0 65.3 107.8L61.9 83.7A5 5 0 0 0 52.1 85.3ZM58.4 105L39.8 119.5A3.7 3.7 0 0 0 44.2 125.5L63.6 112A4.4 4.4 0 0 0 58.4 105Z" fill="currentColor"/><path d="M40 119.8L35.3 125.2A1.8 1.8 0 0 0 37.4 128.1L44 125.2A3.4 3.4 0 0 0 40 119.8Z" fill="currentColor"/><path d="M62.1 85.7L62.4 83.9L62.8 82L63.1 80.2L63.3 78.4L63.5 76.6L63.5 74.8L63.5 73L63.3 71.2L63.1 69.5L62.8 67.8L62.6 66L62.2 64.3L61.8 62.5L61.2 60.8L60.5 59.2L59.7 57.6L58.7 56.1L57.5 54.8L56.3 53.5L54.9 52.3L53.5 51.1L52.1 50L50.6 48.9L49.1 47.9A7 7 0 0 0 40.9 59.1L41.8 59.9L42.7 60.8L43.4 61.7L44 62.6L44.6 63.5L45.1 64.4L45.6 65.2L46.1 66L46.6 66.8L47.2 67.6L47.7 68.4L48.3 69.2L48.8 70.1L49.2 71L49.6 72L49.8 73.1L50 74.2L50.1 75.3L50.2 76.5L50.3 77.8L50.3 79.1L50.3 80.4L50.2 81.8L49.9 83.3A6.2 6.2 0 0 0 62.1 85.7Z" fill="currentColor"/><path d="M46 49.7L26.9 45.1A3.5 3.5 0 0 0 25.1 51.9L44 57.3A3.9 3.9 0 0 0 46 49.7ZM29.1 50.1L36.9 35.1A3.3 3.3 0 0 0 31.1 31.9L22.9 46.9A3.5 3.5 0 0 0 29.1 50.1Z" fill="currentColor"/><path d="M54 56L75.8 28.4A3.3 3.3 0 0 0 70.6 24.2L48 51A3.9 3.9 0 0 0 54 56Z" fill="currentColor"/><circle cx="34" cy="33.5" r="4" fill="currentColor"/><circle cx="73.2" cy="26.3" r="4" fill="currentColor"/><circle cx="47" cy="37" r="7.6" fill="currentColor"/><circle cx="63.5" cy="12" r="6.5" fill="#38bdf8" stroke="currentColor" stroke-width="1.1"/>',
  blocker:
    '<ellipse cx="52" cy="136" rx="13" ry="1.8" fill="currentColor" opacity="0.18"/><g fill="none" stroke="currentColor" stroke-linecap="round" opacity="0.4"><path d="M69 45H103" stroke-width="2.8"/><path d="M76 46V88M86 46V88M96 46V88M69 56H103M69 67H103M69 78H103M69 88H103" stroke-width="1.1"/></g><path d="M47 76.6L50.1 96.5A4.4 4.4 0 0 0 58.9 95.5L57 75.4A5 5 0 0 0 47 76.6ZM50.7 93.8L41.8 110.1A3.7 3.7 0 0 0 48.2 113.9L58.3 98.2A4.4 4.4 0 0 0 50.7 93.8Z" fill="currentColor"/><path d="M42.1 110.3L39.9 117.1A1.8 1.8 0 0 0 43 118.9L47.9 113.7A3.4 3.4 0 0 0 42.1 110.3Z" fill="currentColor"/><path d="M49.2 77.2L54.7 96.6A4.4 4.4 0 0 0 63.3 94.4L58.8 74.8A5 5 0 0 0 49.2 77.2ZM55 93.7L47.6 112A3.7 3.7 0 0 0 54.4 115L63 97.3A4.4 4.4 0 0 0 55 93.7Z" fill="currentColor"/><path d="M47.9 112.1L46.5 119.2A1.8 1.8 0 0 0 49.8 120.6L54.1 114.9A3.4 3.4 0 0 0 47.9 112.1Z" fill="currentColor"/><path d="M59.5 76.9L59.7 75.7L59.9 74.5L60.1 73.3L60.3 72.1L60.5 70.9L60.7 69.7L60.9 68.5L61.1 67.3L61.3 66.1L61.5 64.9L61.7 63.7L61.8 62.5L61.9 61.3L62.1 60.1L62.2 58.9L62.3 57.7L62.4 56.5L62.6 55.3L62.7 54.1L62.8 52.9L62.9 51.7L63 50.5L63.1 49.3L63.2 48.1A7.2 7.2 0 0 0 48.8 47.1L48.7 48.3L48.7 49.4L48.6 50.6L48.5 51.7L48.4 52.9L48.3 54.1L48.2 55.2L48.1 56.4L48 57.6L47.9 58.7L47.8 59.9L47.7 61.1L47.6 62.2L47.5 63.4L47.4 64.6L47.3 65.7L47.2 66.9L47.1 68.1L47.1 69.2L47 70.4L46.9 71.6L46.7 72.7L46.6 73.9L46.5 75.1A6.6 6.6 0 0 0 59.5 76.9Z" fill="currentColor"/><path d="M60.5 48.7L75 16.4A3.3 3.3 0 0 0 69 13.6L53.5 45.3A3.9 3.9 0 0 0 60.5 48.7Z" fill="currentColor"/><path d="M61.7 51.3L81.2 22.9A3.3 3.3 0 0 0 75.8 19.1L55.3 46.7A3.9 3.9 0 0 0 61.7 51.3Z" fill="currentColor"/><circle cx="72" cy="15" r="4" fill="currentColor"/><circle cx="78.5" cy="21" r="4" fill="currentColor"/><circle cx="53.5" cy="30" r="7.6" fill="currentColor"/>',
  // The volleyball of the OpenVolleyScout logo (src/assets/openvolleyscout.svg), centred, for an unknown role.
  unknown:
    '<g transform="translate(60 75) scale(0.633) translate(-131 -473.5)"><g transform="translate(0 800) scale(0.1 -0.1)"><path fill="#0b3d91" d="M1180 3985 c-317 -65 -561 -324 -610 -649 -33 -217 61 -465 235 -624 396 -362 1040 -179 1209 343 165 513 -305 1038 -834 930z m-250 -307 c0 -7 -10 -38 -22 -68 -18 -44 -22 -79 -24 -179 -2 -68 -7 -128 -11 -132 -13 -13 -80 37 -98 71 -18 35 -7 94 33 175 49 100 122 179 122 133z m764 -666 c30 -42 30 -42 9 -85 -98 -202 -298 -289 -502 -220 -74 25 -73 36 6 63 151 51 254 114 358 219 79 81 88 82 129 23z"/><path fill="#2ec4e6" d="M1272 3840 c-140 -59 -234 -277 -202 -468 16 -95 36 -115 88 -87 45 25 57 50 71 145 20 135 92 248 216 336 52 37 16 64 -105 78 -25 3 -55 1 -68 -4z"/><path fill="#2ec4e6" d="M1416 3498 c-19 -27 -21 -72 -3 -85 6 -5 43 -18 81 -28 117 -31 200 -79 285 -165 87 -88 101 -90 101 -16 0 61 -23 100 -106 177 -119 110 -318 175 -358 117z"/><path fill="#2ec4e6" d="M1265 3183 c-144 -84 -284 -112 -412 -83 -76 17 -85 6 -50 -65 37 -77 119 -119 253 -132 152 -14 340 80 430 216 34 52 21 71 -65 95 -75 21 -65 23 -156 -31z"/><path fill="#ffffff" d="M867 3643 c-79 -109 -118 -223 -92 -273 18 -34 85 -84 98 -71 4 4 9 64 11 132 2 100 6 135 24 179 38 95 17 112 -41 33z"/><path fill="#ffffff" d="M1565 2989 c-104 -105 -207 -168 -358 -219 -79 -27 -80 -38 -6 -63 204 -69 404 18 502 220 21 43 21 43 -9 85 -41 59 -50 58 -129 -23z"/></g></g>',
};

/**
 * The silhouette for a role: libero (and defensive specialist) receive, the
 * setter sets, the middle blocker blocks, everyone else (outside hitters,
 * opposite) attacks; with no known role the OVS logo ball is shown. Takes the roster role codes
 * (`outside_hitter`, `middle_blocker`, ...) and the role groups of the filters
 * (`outside`, `middle`, ...) alike; `libero` wins over the role.
 */
export function athletePoseForRole(role: string | null | undefined, libero = false): AthletePose {
  if (libero) return 'reception';
  switch (role) {
    case 'libero':
    case 'defensive_specialist':
      return 'reception';
    case 'setter':
      return 'setter';
    case 'middle_blocker':
    case 'middle':
      return 'blocker';
    case 'outside_hitter':
    case 'outside':
    case 'opposite':
      return 'attacker';
    default:
      return 'unknown';
  }
}

const round = (value: number) => Math.round(value * 1000) / 1000;

const escapeAttribute = (value: string) => value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] ?? char));

export interface AthleteSilhouetteBox {
  /** Top-left corner of the square, in the units of the page. */
  x: number;
  y: number;
  /** Side of the square. */
  size: number;
}

/**
 * SVG markup of a silhouette fitted (whole, centred) in a square of the page,
 * for the printed documents: `currentColor` becomes `ink` (the PDF renderer
 * does not know `currentColor`), the ball, the net and the shadow keep their
 * look. Only paths, circles and ellipses in a transformed group: no image,
 * mask or defs, so the PDF and the presentations draw it alike.
 */
export function athleteSilhouetteSvg(pose: AthletePose, box: AthleteSilhouetteBox, ink: string): string {
  const scale = box.size / ATHLETE_SILHOUETTE_HEIGHT;
  const left = box.x + (box.size - ATHLETE_SILHOUETTE_WIDTH * scale) / 2;
  const markup = ATHLETE_SILHOUETTE_SVG[pose].split('currentColor').join(escapeAttribute(ink));
  return `<g transform="translate(${round(left)} ${round(box.y)}) scale(${round(scale)})">${markup}</g>`;
}
