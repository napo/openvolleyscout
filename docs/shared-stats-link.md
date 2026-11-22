# Shared Statistics Link Format

OpenVolleyScout lets coaches share an analysis tab as a self-contained URL without uploading match data to any server. The implementation lives in `src/features/analytics/export/`:

- `stats-share-link.ts`: payload types, v1/v2 encoder and decoder, size limits, expiry check, URL builder.
- `stats-preview.ts`: static HTML preview page generator for link unfurling.
- `tab-export.ts`: `extractSharedTabBlocks` (DOM to structured blocks) and `buildTabSvg` (legacy v1 SVG capture).
- `TabExportControl.tsx`: "Share via web" UI popover, expiry selector (1-90 days), copy/preview/WhatsApp actions.
- `SharedStatsViewerPage.tsx`: public standalone viewer mounted at `/stats-viewer/:payload`.

## URL Shape and Static Preview Page

Generated links have the shape:

```text
<base>/stats-viewer/#<payload>
```

Why the static preview page exists:
- Messaging apps and social crawlers fetch `<base>/stats-viewer/` and never read the URL fragment (`#<payload>`).
- During the Vite build (`vite.config.ts`), `buildStatsViewerPreviewPage` emits `<base>/stats-viewer/index.html` containing Open Graph and Twitter Card tags (`og:title`, `og:description`, `og:image`, `twitter:card`) in English.
- When a human opens the link in a browser, the inline redirect script forwards `<base>/stats-viewer/#<payload>` to `<base>/#/stats-viewer/<payload>`, where `SharedStatsViewerPage` decodes the payload from the hash route.
- Legacy links of the form `<base>/#/stats-viewer/<payload>` continue to work directly.

Because the payload lives strictly in the URL fragment, match data is never sent to the static host.

## Payload Versions

All payloads are UTF-8 JSON compressed with `fflate.deflateSync(bytes, { level: 9 })`, encoded with URL-safe base64 (`base64url` without padding), and prefixed with `<version>.`.

### Version 1 (`1.<base64url>`) - Legacy Single SVG

JSON object (`SharedMatchStatsV1`):

```json
{
  "title": "Side-out study",
  "matchLabel": "Home vs Away · 2026-04-12",
  "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" ...>...</svg>",
  "expiresAt": 1776556800000,
  "generatedAt": 1775952000000
}
```

The viewer renders v1 links as a single zoomable image (`tacticalZoom` / `tacticalFit`).

### Version 2 (`2.<base64url>`) - Compact Block Tuple

`TabExportControl` generates v2 links by running `extractSharedTabBlocks(panel)` on the active tab panel. To minimize URL length, v2 serializes as a positional 6-element JSON tuple (`PackedV2Tuple`) with Unix timestamps in **seconds**:

```json
[
  "<tabCode>",
  "<title>",
  "<matchLabel>",
  1776556800,
  1775952000,
  [
    [0, "Section heading"],
    [1, "Short summary note"],
    [2, [["Player", "Tot", "Eff"], ["#4 Rossi", "18", "+38%"]]],
    [3, "<svg xmlns=\"http://www.w3.org/2000/svg\" ...>...</svg>"]
  ]
]
```

Tuple fields:
1. `tabCode` (`string`): single-character tab identifier:
   - `r`: `report`
   - `t`: `team-performance`
   - `p`: `player-performance`
   - `s`: `sideout-study`
   - `c`: `cross-rotation`
   - `b`: `play-by-play`
   - `d`: `trends`
   - `n`: `notes`
   - `g`: `generic`
2. `title` (`string`, max 1000 chars)
3. `matchLabel` (`string`, max 1000 chars)
4. `expiresAt` (`number`, Unix epoch seconds; multiplied by 1000 on decode)
5. `generatedAt` (`number`, Unix epoch seconds, or `0` if omitted)
6. `blocks` (`PackedBlock[]`, up to 400 blocks):
   - `[0, text]`: `{ kind: 'heading', text }`
   - `[1, text]`: `{ kind: 'text', text }`
   - `[2, rows]`: `{ kind: 'table', rows: string[][] }`
   - `[3, svg]`: `{ kind: 'svg', svg }` (vector charts: Recharts evaluation bars, side-out courts, attack/serve directions)
   - `[4, title, items]`: `{ kind: 'bars', title?, items }` (efficiency progress bars and points-vs-errors paired bars rendered natively in the viewer)
   - `[5, items]`: `{ kind: 'kpi', items }` (KPI / situation analytics card grid)
   - `[6, dataUrl, alt]`: `{ kind: 'image', dataUrl, alt? }` (compact WebP/PNG raster snapshots of canvas heatmaps, restricted to `data:image/(png|webp|jpeg);base64,`)

Bar items retain the original 4-field (single bar) and 7-field (paired bars) tuples. An optional final `details` field contains `[label, value]` string pairs, producing 5-field or 8-field tuples. The viewer displays these supporting statistics below the bar label. Existing links without details remain supported. Previously omitted details require generating a new link from the analysis tab.

KPI extraction uses explicit label/value elements, including player totals, so cards remain correctly paired even when the analysis tab displays values before labels. Points/errors legends and all six heading levels are retained. Shared pages remain static snapshots: analysis filters and chart interactions are not included.

### Version 3 (`3.<base64url>`) - Filtered data, real components

Used for the Team, Player, Side-out study and Cross rotation tabs of the match Analysis page. The payload is a 6-element tuple like v2 whose last element is a snapshot: the calculated match statistics the tab shows plus the page filters and the picked athletes. On the Player tab the statistics are cut to the picked athletes (their totals and the rallies they touched). Each set's rallies are not sent twice; they are rebuilt from the rally list on decode. `SharedStatsPanel` restores the filters and mounts the same dashboard components as the Data study page, so charts, tooltips and filters behave the same. The athlete picker is hidden because the athletes are chosen by the sender. Trends, Priorities and the multi-match Team analysis page still use v2.

## Size Limits and Validation

Enforced in `stats-share-link.ts`:
- `MAX_BYTES = 4_000_000` (4 MB uncompressed UTF-8 JSON; `inflateSync` uses a bounded `Uint8Array(MAX_BYTES + 1)` buffer to prevent zip-bomb expansion).
- `MAX_LINK_LENGTH = 250_000` characters for `<version>.<base64url>`.
- `MAX_BLOCKS = 400` blocks per v2 snapshot.
- `title` and `matchLabel` must each be `<= 1000` characters.
- Regex gate before inflation: `/^[123]\.[\w-]+$/`.

## Expiry Semantics

Expiry is **viewer-enforced**, not server-side access control:
- `TabExportControl` lets the user pick an expiry between 1 and 90 days (`sharedPlaylistExpiryAfter(shareDays)`).
- `SharedStatsViewerPage` checks `isSharedStatsExpired(stats, now)` on render and re-checks every 1000 ms.
- Anyone with the raw URL can still decode the fragment offline; the expiry provides a clean UX cutoff for shared links.

## SVG Safety Rules

Untrusted SVG payloads are never injected into the DOM:
- Both v1 (`stats.svg`) and v2 (`block.kind === 'svg'`) validate that the string begins with `<svg\b`.
- `SharedStatsViewerPage` renders SVG content exclusively via `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" />`, which isolates scripts and external resource loads inside an image document.

## Extending Without Breaking Old Links

- **New tab IDs**: add a new key and unused single-letter code to `TAB_TO_CODE` in `stats-share-link.ts` and an optional label in `TAB_LABEL_KEYS` in `SharedStatsViewerPage.tsx`. Older viewers fall back unknown codes to `generic`.
- **New block kinds**: assign the next unused integer code (`4`, `5`, ...) in `packBlock` / `unpackBlock` and handle it in `SharedStatsViewerPage.tsx`. Existing v1 and v2 links continue to decode unchanged.
- **Breaking tuple changes**: introduce prefix `3.` while keeping branches for `1.` and `2.` in `decodeSharedStats`.

## Social Preview Image

- `STATS_VIEWER_PREVIEW_IMAGE` points to `public/social-preview-stats.png` (1280x640), referenced as `og:image` by `buildStatsViewerPreviewPage`.
- `vite.config.ts` excludes `**/social-preview-stats.png` from the Workbox service worker precache list (`globIgnores`) so offline caches stay small while social crawlers fetch it directly from the static origin.

## Worked Example (v2)

Input `SharedMatchStatsV2`:

```ts
const snapshot: SharedMatchStatsV2 = {
  version: 2,
  tabId: 'sideout-study',
  title: 'Side-out study',
  matchLabel: 'Aurora Volley vs Boreal Club',
  expiresAt: 1776556800000,
  generatedAt: 1775952000000,
  blocks: [
    { kind: 'heading', text: 'Rotation P1' },
    { kind: 'table', rows: [['Metric', 'Value'], ['Side-out %', '62%']] },
  ],
};
```

1. Packed tuple JSON:

```json
["s","Side-out study","Aurora Volley vs Boreal Club",1776556800,1775952000,[[0,"Rotation P1"],[2,[["Metric","Value"],["Side-out %","62%"]]]]]
```

2. Deflate (level 9) + base64url + prefix `2.`:

```text
https://napo.github.io/openvolleyscout/stats-viewer/#2.<deflated-base64url-payload>
```

3. Opening that URL serves `stats-viewer/index.html` (showing the `social-preview-stats.png` card in chat apps) and redirects browsers to `#/stats-viewer/2.<deflated-base64url-payload>`, where `SharedStatsViewerPage` renders the "Side-out study" badge, heading, and responsive HTML table.
