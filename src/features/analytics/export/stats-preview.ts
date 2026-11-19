// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What a shared statistics link shows in chats and social networks. The link is
 * <base>/stats-viewer/#<payload>: the address without the fragment is a small static
 * page with the social tags (crawlers never read the fragment, and the snapshot itself
 * only lives in it), which sends the browser on to #/stats-viewer/<payload> inside the app.
 *
 * Loaded by vite.config.ts too: only relative and type imports here.
 */
export const STATS_VIEWER_PREVIEW_PATH = 'stats-viewer';
export const STATS_VIEWER_PREVIEW_IMAGE = 'social-preview-stats.png';

/** The preview is always in English, whatever the language of the person sharing. */
export const STATS_VIEWER_PREVIEW_TEXTS = {
  title: 'Shared statistics',
  subtitle: 'Match statistics shared from OpenVolleyScout: open the charts from the link.',
  appName: 'OpenVolleyScout',
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

export function buildStatsViewerPreviewPage(
  texts: { title: string; subtitle: string; appName: string } = STATS_VIEWER_PREVIEW_TEXTS,
  webApp: string,
): string {
  const base = webApp.replace(/\/+$/, '');
  const url = `${base}/${STATS_VIEWER_PREVIEW_PATH}/`;
  const image = `${base}/${STATS_VIEWER_PREVIEW_IMAGE}`;
  const title = escapeHtml(`${texts.title} · ${texts.appName}`);
  const description = escapeHtml(texts.subtitle);
  // Relative on purpose: it keeps working if the app moves to another address.
  const redirect = `var h=location.hash.replace(/^#\\/?/,'');location.replace(new URL('../#/stats-viewer'+(h?'/'+h:''),location.href).href);`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${description}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${escapeHtml(texts.appName)}" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${image}" />
<meta property="og:image:width" content="1280" />
<meta property="og:image:height" content="640" />
<meta property="og:image:alt" content="${escapeHtml(texts.title)}" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="canonical" href="${url}" />
<script>${redirect}</script>
<noscript><meta http-equiv="refresh" content="0; url=../#/stats-viewer" /></noscript>
</head>
<body><p><a href="../#/stats-viewer">${title}</a></p></body>
</html>
`;
}
