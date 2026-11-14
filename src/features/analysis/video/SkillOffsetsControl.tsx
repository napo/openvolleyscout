// SPDX-License-Identifier: AGPL-3.0-or-later
import type { SkillType } from '@src/domain/common/enums';
import { useTranslation } from '@src/i18n';

const SKILLS = [
  { skill: 'serve', labelKey: 'skillServe' },
  { skill: 'receive', labelKey: 'skillReceive' },
  { skill: 'set', labelKey: 'skillSet' },
  { skill: 'attack', labelKey: 'skillAttack' },
  { skill: 'block', labelKey: 'skillBlock' },
  { skill: 'dig', labelKey: 'skillDig' },
] as const satisfies ReadonlyArray<{ skill: SkillType; labelKey: string }>;

export type SkillOffsets = Partial<Record<SkillType, number>>;

/** Sets one offset; 0 or an invalid value removes it. */
export function setSkillOffset(offsets: SkillOffsets, skill: SkillType, value: number): SkillOffsets {
  const next = { ...offsets };
  const rounded = Math.round(value * 10) / 10;
  if (!Number.isFinite(rounded) || rounded === 0) delete next[skill];
  else next[skill] = Math.max(-10, Math.min(10, rounded));
  return next;
}

interface SkillOffsetsControlProps {
  offsets: SkillOffsets;
  onChange: (offsets: SkillOffsets) => void;
}

/**
 * Per-skill delay: moves every action of a skill by the same seconds, e.g. all
 * serves 2 s earlier to remove the time it took to record them.
 */
export function SkillOffsetsControl({ offsets, onChange }: SkillOffsetsControlProps) {
  const { t } = useTranslation();
  const active = Object.values(offsets).filter((value) => value).length;
  return (
    <details className="video-analysis__skill-offsets">
      <summary>{t('videoSkillOffsetsTitle')}{active ? ` (${active})` : ''}</summary>
      <p className="video-analysis__hint">{t('videoSkillOffsetsHelp')}</p>
      <div className="video-analysis__skill-offsets-grid">
        {SKILLS.map(({ skill, labelKey }) => {
          const value = offsets[skill] ?? 0;
          return (
            <label key={skill}>
              <span>{t(labelKey)}</span>
              <span className="video-analysis__skill-offset-input">
                <button type="button" className="btn-secondary btn-small" onClick={() => onChange(setSkillOffset(offsets, skill, value - 0.5))} aria-label={`${t(labelKey)} −0.5 s`}>−</button>
                <input
                  type="number"
                  step={0.5}
                  min={-10}
                  max={10}
                  value={value}
                  onChange={(event) => onChange(setSkillOffset(offsets, skill, Number(event.target.value)))}
                />
                <button type="button" className="btn-secondary btn-small" onClick={() => onChange(setSkillOffset(offsets, skill, value + 0.5))} aria-label={`${t(labelKey)} +0.5 s`}>+</button>
                <span>s</span>
              </span>
            </label>
          );
        })}
      </div>
    </details>
  );
}
