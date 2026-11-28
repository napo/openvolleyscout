// SPDX-License-Identifier: AGPL-3.0-or-later
import { ATHLETE_SILHOUETTE_SVG, ATHLETE_SILHOUETTE_VIEWBOX, type AthletePose } from './athlete-silhouettes';

/**
 * Role silhouette of an athlete without a photo. The body takes the text
 * colour of its place (`currentColor`); it is decorative unless `title` is given.
 */
export function AthleteSilhouette({ pose, size = 32, title, className }: {
  pose: AthletePose;
  /** Side in px of the square it fills; the 120 x 150 drawing is fitted whole and centred. */
  size?: number;
  title?: string;
  className?: string;
}) {
  return (
    <svg
      className={['athlete-silhouette', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox={ATHLETE_SILHOUETTE_VIEWBOX}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: `${title ? `<title>${escapeXml(title)}</title>` : ''}${ATHLETE_SILHOUETTE_SVG[pose]}` }}
    />
  );
}

function escapeXml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] ?? char));
}
