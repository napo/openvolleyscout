/**
 * Video positions typed by the user: "83", "1:23", "1:02:03", YouTube's
 * "1h2m3s", or a shared YouTube link carrying ?t= / &start=.
 */

/** Seconds for a typed position, or null when the text is not a position. */
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


/** A typed position or a YouTube link with a start time, in seconds; null otherwise. */
export function parseVideoPositionOrLink(input: string): number | null {
  return parseVideoPosition(input) ?? extractYouTubeStartSeconds(input);
}
