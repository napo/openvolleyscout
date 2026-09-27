/** Returns the 11-character video id from any common YouTube URL form, or null. */
export function extractYouTubeId(input: string): string | null {
  const value = input.trim();
  if (/^[\w-]{11}$/.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\.|^m\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.slice(1).split('/')[0];
  } else if (host === 'youtube.com' || host === 'music.youtube.com') {
    id = url.searchParams.get('v')
      ?? url.pathname.match(/^\/(?:live|embed|shorts|v)\/([\w-]{11})/)?.[1]
      ?? null;
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

/**
 * Parses a video position: "83", "1:23", "1:02:03", or YouTube's "1h2m3s" / "83s".
 * Returns seconds, or null when the text is not a position.
 */
export function parseVideoPosition(input: string): number | null {
  const value = input.trim().replace(/：/g, ':');
  if (!value) return null;

  if (/^\d+(:\d{1,2}){0,2}$/.test(value)) {
    return value.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  }

  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(value);
  if (match && (match[1] || match[2] || match[3])) {
    return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  }
  return null;
}

/** The start position a YouTube link carries (?t=83 / &t=1m23s), if any. */
export function extractYouTubeStartSeconds(input: string): number | null {
  try {
    const t = new URL(input.trim()).searchParams.get('t') ?? new URL(input.trim()).searchParams.get('start');
    return t ? parseVideoPosition(t) : null;
  } catch {
    return null;
  }
}

export function formatVideoPosition(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}
