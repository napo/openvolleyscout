// SPDX-License-Identifier: AGPL-3.0-or-later
import { useTranslation } from '@src/i18n';
import './tag-zone-picker.css';

/**
 * Where the ball went, for Tags: the receiving court seen from the scout's
 * side of the net (net at the bottom). DataVolley zones from the receiving
 * players' view are 4 3 2 / 7 8 9 / 5 6 1 with net at the top; seen from
 * across the net they turn half round: 1 6 5 / 9 8 7 / 2 3 4. Subzones
 * C B / D A (net side first) turn to A D / B C.
 */
export const PICKER_ZONE_ROWS = [[1, 6, 5], [9, 8, 7], [2, 3, 4]] as const;
export const PICKER_SUBZONE_ROWS = [['A', 'D'], ['B', 'C']] as const;
/** Serve start zones from behind the server's baseline, server's left to right. */
const SERVE_START_ZONES = ['5', '6', '1'] as const;

interface TagZonePickerProps {
  /** Pad: 9 zones (phones). Court: zones split in subzones (tablets, computers). */
  variant: 'pad' | 'court';
  skill: 'serve' | 'attack';
  startZone?: string;
  endZone?: string;
  onStart: (zone: string) => void;
  onEnd: (zone: string) => void;
  onClose: () => void;
}

export function TagZonePicker({ variant, skill, startZone, endZone, onStart, onEnd, onClose }: TagZonePickerProps) {
  const { t } = useTranslation();
  return (
    <div className={`tag-zone-picker tag-zone-picker--${variant}`} role="group" aria-label={t('tagZoneTitle')}>
      <div className="tag-zone-picker__header">
        <strong>{t(skill === 'serve' ? 'tagZoneServeTitle' : 'tagZoneAttackTitle')}</strong>
        <button type="button" className="tag-zone-picker__close" onClick={onClose} aria-label={t('tagZoneSkip')}>
          {t('tagZoneSkip')}
        </button>
      </div>
      <div className="tag-zone-picker__court">
        {PICKER_ZONE_ROWS.map((row, rowIndex) => (
          <div key={rowIndex} className="tag-zone-picker__row">
            {row.map((zone) => (variant === 'pad' ? (
              <button
                key={zone}
                type="button"
                className={`tag-zone-picker__zone${endZone?.charAt(0) === String(zone) ? ' is-selected' : ''}`}
                onClick={() => onEnd(String(zone))}
              >
                {zone}
              </button>
            ) : (
              <div key={zone} className="tag-zone-picker__block">
                <span className="tag-zone-picker__block-label">{zone}</span>
                {PICKER_SUBZONE_ROWS.flat().map((subzone) => {
                  const code = `${zone}${subzone}`;
                  return (
                    <button
                      key={code}
                      type="button"
                      aria-label={code}
                      className={`tag-zone-picker__subzone${endZone === code ? ' is-selected' : ''}`}
                      onClick={() => onEnd(code)}
                    />
                  );
                })}
              </div>
            )))}
          </div>
        ))}
        <div className="tag-zone-picker__net">{t('quickStartNet')}</div>
      </div>
      {skill === 'serve' ? (
        <div className="tag-zone-picker__start">
          <span>{t('tagZoneServeFrom')}</span>
          {SERVE_START_ZONES.map((zone) => (
            <button
              key={zone}
              type="button"
              className={startZone === zone ? 'is-selected' : ''}
              onClick={() => onStart(zone)}
            >
              {zone}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
