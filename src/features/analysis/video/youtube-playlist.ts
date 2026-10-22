/**
 * YouTube playlist exports for the filtered action sequence: a plain-text
 * list of timestamped links, and a self-contained HTML page that plays the
 * clips in order through the official YouTube iframe player. Nothing is
 * downloaded: the page streams from YouTube like the in-app player does.
 * Pure module (ts-node safe): keep browser APIs and value imports out.
 */
import type { ClipLabel } from './clip-export';

/** One filtered action on a YouTube source. */
export interface YouTubePlaylistSource {
  videoId: string;
  videoSeconds: number | null;
  /** DataVolley code overlaid while the action plays. */
  label: string;
  /** Context line shown in the clip list (opponent, set, score). */
  caption: string;
}

export interface YouTubePlaylistClip {
  videoId: string;
  startSeconds: number;
  endSeconds: number;
  /** Codes of the actions covered by this (possibly merged) clip. */
  labels: ClipLabel[];
  caption: string;
}

/** UI strings baked into the HTML page, already translated. */
export interface YouTubePlaylistPageStrings {
  previous: string;
  next: string;
  openOnYoutube: string;
  /** Shown when the page is opened from disk, where YouTube may refuse to embed. */
  fileNotice: string;
  playbackError: string;
}

export interface YouTubePlaylistPage {
  title: string;
  subtitle: string;
  lang: string;
  clips: YouTubePlaylistClip[];
  strings: YouTubePlaylistPageStrings;
}

/**
 * Build clips in the given (filter/sort) order, applying the padding.
 * Consecutive actions on the same video whose windows overlap are merged, so
 * a rally's serve, reception, set and attack play as one clip instead of
 * replaying the same seconds. Mirrors buildClipIntervals' one-second minimum.
 */
export function buildYouTubePlaylistClips(
  sources: ReadonlyArray<YouTubePlaylistSource>,
  paddingBeforeSeconds: number,
  paddingAfterSeconds: number,
): YouTubePlaylistClip[] {
  const clips: YouTubePlaylistClip[] = [];
  sources.forEach((source) => {
    if (source.videoSeconds === null || !Number.isFinite(source.videoSeconds)) return;
    const startSeconds = Math.max(0, source.videoSeconds - paddingBeforeSeconds);
    const endSeconds = Math.max(source.videoSeconds + paddingAfterSeconds, startSeconds + 1);
    const label: ClipLabel = { startSeconds, endSeconds, text: source.label };
    const previous = clips[clips.length - 1];
    if (
      previous
      && previous.videoId === source.videoId
      && startSeconds >= previous.startSeconds
      && startSeconds <= previous.endSeconds
    ) {
      previous.endSeconds = Math.max(previous.endSeconds, endSeconds);
      previous.labels.push(label);
      return;
    }
    clips.push({ videoId: source.videoId, startSeconds, endSeconds, labels: [label], caption: source.caption });
  });
  return clips;
}

export function youtubeWatchUrl(videoId: string, startSeconds: number): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&t=${Math.max(0, Math.floor(startSeconds))}`;
}

/** One timestamped link per clip, each followed by a comment with its codes. */
export function buildYouTubePlaylistText(title: string, date: string, clips: ReadonlyArray<YouTubePlaylistClip>): string {
  const lines = [`# OVS Video Playlist – ${title}`, `# ${date}`, ''];
  clips.forEach((clip) => {
    lines.push(youtubeWatchUrl(clip.videoId, clip.startSeconds));
    lines.push(`# ${[clip.caption, clip.labels.map((label) => label.text).join(' ')].filter(Boolean).join(' · ')}`);
    lines.push('');
  });
  return lines.join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** JSON safe to inline in a <script> element. */
function toInlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const PAGE_STYLE = `
:root { color-scheme: light dark; --bg: #f6f7f9; --fg: #1d2330; --muted: #5d6675; --line: rgba(127,127,127,0.3); --accent: #1f6feb; --panel: #ffffff; }
@media (prefers-color-scheme: dark) { :root { --bg: #11151c; --fg: #e6e9ef; --muted: #9aa3b2; --panel: #1a2029; --accent: #58a6ff; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
header { padding: 16px; }
h1 { font-size: 1.2rem; margin: 0; }
header p { margin: 4px 0 0; color: var(--muted); font-size: 0.9rem; }
main { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 16px; padding: 0 16px 16px; }
@media (max-width: 800px) { main { grid-template-columns: minmax(0, 1fr); } }
.stage { position: relative; aspect-ratio: 16 / 9; background: #000; border-radius: 8px; overflow: hidden; }
#player { position: absolute; inset: 0; width: 100%; height: 100%; }
.code { position: absolute; left: 12px; bottom: 48px; padding: 4px 10px; border-radius: 6px; background: rgba(0,0,0,0.7); color: #fff; font: 600 1rem ui-monospace, Menlo, Consolas, monospace; pointer-events: none; }
.code:empty { display: none; }
.controls { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.controls button { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--line); background: var(--panel); color: inherit; font: inherit; cursor: pointer; }
.controls span { color: var(--muted); }
.notice { margin: 0 0 8px; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--line); background: var(--panel); font-size: 0.9rem; }
.notice[hidden] { display: none; }
ol { list-style: none; margin: 0; padding: 0; max-height: 75vh; overflow-y: auto; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
li { display: flex; align-items: baseline; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--line); cursor: pointer; }
li:last-child { border-bottom: none; }
li.active { background: color-mix(in srgb, var(--accent) 18%, transparent); }
li .n { color: var(--muted); min-width: 2ch; text-align: right; }
li .body { flex: 1; min-width: 0; }
li code { font-weight: 600; }
li small { display: block; color: var(--muted); }
li a { color: var(--accent); font-size: 0.85rem; white-space: nowrap; }
`;

const PAGE_SCRIPT = `
(function () {
  var data = JSON.parse(document.getElementById('ovs-playlist').textContent);
  var clips = data.clips;
  var current = -1;
  var player = null;
  var codeEl = document.getElementById('code');
  var counterEl = document.getElementById('counter');
  var errorEl = document.getElementById('error');
  var items = Array.prototype.slice.call(document.querySelectorAll('li[data-index]'));
  if (location.protocol === 'file:') document.getElementById('file-notice').hidden = false;

  function select(index) {
    if (index < 0 || index >= clips.length) return;
    current = index;
    var clip = clips[index];
    items.forEach(function (item, i) { item.classList.toggle('active', i === index); });
    items[index].scrollIntoView({ block: 'nearest' });
    counterEl.textContent = (index + 1) + ' / ' + clips.length;
    errorEl.hidden = true;
    if (player) player.loadVideoById({ videoId: clip.videoId, startSeconds: clip.startSeconds, endSeconds: clip.endSeconds });
  }

  function refreshCode() {
    var clip = clips[current];
    if (!clip || !player || typeof player.getCurrentTime !== 'function') { codeEl.textContent = ''; return; }
    var time = player.getCurrentTime();
    codeEl.textContent = clip.labels
      .filter(function (label) { return time >= label.startSeconds && time <= label.endSeconds; })
      .map(function (label) { return label.text; })
      .join('  ');
  }

  items.forEach(function (item) {
    item.addEventListener('click', function (event) {
      if (event.target.closest('a')) return;
      select(Number(item.getAttribute('data-index')));
    });
  });
  document.getElementById('prev').addEventListener('click', function () { select(current - 1); });
  document.getElementById('next').addEventListener('click', function () { select(current + 1); });
  setInterval(refreshCode, 200);

  window.onYouTubeIframeAPIReady = function () {
    var first = clips[0];
    player = new YT.Player('player', {
      videoId: first.videoId,
      playerVars: { start: Math.floor(first.startSeconds), end: Math.ceil(first.endSeconds), playsinline: 1, rel: 0 },
      events: {
        onReady: function () { select(0); },
        onStateChange: function (event) {
          if (event.data === YT.PlayerState.ENDED && current + 1 < clips.length) select(current + 1);
        },
        onError: function () { errorEl.hidden = false; }
      }
    });
  };
  var api = document.createElement('script');
  api.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(api);
})();
`;

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mmss = `${String(minutes).padStart(hours > 0 ? 2 : 1, '0')}:${String(secs).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${mmss}` : mmss;
}

/**
 * A standalone page (no OVS needed) that plays the clips back to back, with
 * the action codes overlaid and a clickable clip list. YouTube refuses to
 * embed into pages without an HTTP referrer, so it plays when served from a
 * web address (or OVS desktop's local server); opened from disk it falls
 * back to the per-clip YouTube links.
 */
export function buildYouTubePlaylistHtml(page: YouTubePlaylistPage): string {
  const items = page.clips.map((clip, index) => {
    const codes = clip.labels.map((label) => label.text).join(' ');
    return `<li data-index="${index}"><span class="n">${index + 1}</span><span class="body"><code>${escapeHtml(codes)}</code>`
      + `<small>${escapeHtml([formatClock(clip.startSeconds), clip.caption].filter(Boolean).join(' · '))}</small></span>`
      + `<a href="${escapeHtml(youtubeWatchUrl(clip.videoId, clip.startSeconds))}" target="_blank" rel="noopener">${escapeHtml(page.strings.openOnYoutube)}</a></li>`;
  }).join('\n');

  return `<!doctype html>
<html lang="${escapeHtml(page.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="generator" content="OpenVolleyScout">
<title>${escapeHtml(page.title)}</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<header><h1>${escapeHtml(page.title)}</h1><p>${escapeHtml(page.subtitle)}</p></header>
<main>
<section>
<p class="notice" id="file-notice" hidden>${escapeHtml(page.strings.fileNotice)}</p>
<p class="notice" id="error" hidden>${escapeHtml(page.strings.playbackError)}</p>
<div class="stage"><div id="player"></div><div class="code" id="code"></div></div>
<div class="controls"><button type="button" id="prev">${escapeHtml(page.strings.previous)}</button><button type="button" id="next">${escapeHtml(page.strings.next)}</button><span id="counter"></span></div>
</section>
<ol>
${items}
</ol>
</main>
<script type="application/json" id="ovs-playlist">${toInlineJson({ clips: page.clips })}</script>
<script>${PAGE_SCRIPT}</script>
</body>
</html>
`;
}
