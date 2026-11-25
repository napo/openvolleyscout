// SPDX-License-Identifier: AGPL-3.0-or-later
import { useId } from 'react';
import { SKILL_ICON_SVG, type SkillIconName } from './skill-icon-paths';

export type { SkillIconName };

export function isSkillIconName(value: string): value is SkillIconName {
  return Object.prototype.hasOwnProperty.call(SKILL_ICON_SVG, value);
}

/** Pictogram of a skill. Decorative: the skill name is always written next to it or in `title`. */
export function SkillIcon({ skill, size = 18, title }: { skill: SkillIconName; size?: number; title?: string }) {
  const id = `skill-icon-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      className="skill-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: `${title ? `<title>${escapeXml(title)}</title>` : ''}${SKILL_ICON_SVG[skill].split('__ID__').join(id)}` }}
    />
  );
}

function escapeXml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] ?? char));
}
