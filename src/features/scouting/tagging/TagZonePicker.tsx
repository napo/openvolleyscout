// SPDX-License-Identifier: AGPL-3.0-or-later
import { useTranslation } from '@src/i18n';
import './tag-zone-picker.css';

/**
 * Where the ball came from and went, for Tags: the whole court seen from
 * the side of the team making the play. At the top the other team's court,
 * seen across the net (DataVolley zones 4 3 2 / 7 8 9 / 5 6 1 from its own
 * players' view turn half round: 1 6 5 / 9 8 7 / 2 3 4; subzones C B / D A
 * turn to A D / B C); at the bottom the team's own court, net at the top
 * (4 3 2 / 7 8 9 / 5 6 1). Arrival above, start below.
 */
export const PICKER_ZONE_ROWS = [[1, 6, 5], [9, 8, 7], [2, 3, 4]] as const;
export const PICKER_SUBZONE_ROWS = [['A', 'D'], ['B', 'C']] as const;
const START_ZONE_ROWS = [[4, 3, 2], [7, 8, 9], [5, 6, 1]] as const;
/** A serve starts behind the baseline: only the back-row zones. */
const SERVE_START_ZONES = new Set([5, 6, 1]);

interface TagZonePickerProps {
  /** Pad: 9 zones (phones). Court: arrival zones split in subzones (tablets, computers). */
  variant: 'pad' | 'court';
  skill: 'serve' | 'attack' | 'receive';
  startZone?: string;
  endZone?: string;
  onStart: (zone: string) => void;
  onEnd: (zone: string) => void;
  onClose: () => void;
}

export function TagZonePicker({ variant, skill, startZone, endZone, onStart, onEnd, onClose }: TagZonePickerProps) {
  const { t } = useTranslation();
  const titleKey = skill === 'serve'
    ? 'tagZoneServeTitle'
    : skill === 'receive'
      ? 'tagZoneReceiveTitle'
      : 'tagZoneAttackTitle';

  const renderArrivalHalf = (rows: readonly (readonly number[])[], labelFirst: boolean) => (
    <div className="tag-zone-picker__half">
      {labelFirst ? <span className="tag-zone-picker__part">{t('tagZoneArrival')}</span> : null}
      {rows.map((row, rowIndex) => (
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
      {!labelFirst ? <span className="tag-zone-picker__part">{t('tagZoneArrival')}</span> : null}
    </div>
  );

  const renderStartHalf = (rows: readonly (readonly number[])[], labelFirst: boolean) => (
    <div className="tag-zone-picker__half">
      {labelFirst ? <span className="tag-zone-picker__part">{t('tagZoneStart')}</span> : null}
      {rows.map((row, rowIndex) => (
        <div key={`start-${rowIndex}`} className="tag-zone-picker__row tag-zone-picker__row--start">
          {row.map((zone) => {
            const allowed = skill === 'attack' || SERVE_START_ZONES.has(zone);
            return (
              <button
                key={zone}
                type="button"
                aria-label={`${t('tagZoneStart')} ${zone}`}
                disabled={!allowed}
                className={`tag-zone-picker__zone tag-zone-picker__zone--start${startZone === String(zone) ? ' is-selected' : ''}`}
                onClick={() => onStart(String(zone))}
              >
                {zone}
              </button>
            );
          })}
        </div>
      ))}
      {!labelFirst ? <span className="tag-zone-picker__part">{t('tagZoneStart')}</span> : null}
    </div>
  );

  return (
    <div className={`tag-zone-picker tag-zone-picker--${variant}`} role="group" aria-label={t('tagZoneTitle')}>
      <div className="tag-zone-picker__header">
        <strong>{t(titleKey)}</strong>
        <button type="button" className="tag-zone-picker__close" onClick={onClose} aria-label={t('tagZoneSkip')}>
          {t(startZone || endZone ? 'tagZoneDone' : 'tagZoneSkip')}
        </button>
      </div>
      <div className="tag-zone-picker__court">
        {skill === 'receive' ? renderStartHalf(PICKER_ZONE_ROWS, true) : renderArrivalHalf(PICKER_ZONE_ROWS, true)}
        <div className="tag-zone-picker__net">{t('quickStartNet')}</div>
        {skill === 'receive' ? renderArrivalHalf(START_ZONE_ROWS, false) : renderStartHalf(START_ZONE_ROWS, false)}
      </div>
    </div>
  );
}
