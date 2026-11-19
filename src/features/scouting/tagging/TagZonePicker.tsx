// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { useTranslation } from '@src/i18n';
import './tag-zone-picker.css';

/**
 * Where the ball came from and went, for Tags: the whole court seen from
 * the side of the team making the play.
 * Canonical (rotation = 0, vertical bottom->top):
 * - top half: opponent court (1 6 5 / 9 8 7 / 2 3 4; subzones A D / B C)
 * - bottom half: own court (4 3 2 / 7 8 9 / 5 6 1)
 * Rotation steps (each +90° clockwise):
 * - 1 (default): horizontal left->right (bottom half on left, top half on right)
 * - 2: vertical top->bottom
 * - 3: horizontal right->left
 * - 0: vertical bottom->top
 */
export const PICKER_ZONE_ROWS = [[1, 6, 5], [9, 8, 7], [2, 3, 4]] as const;
export const PICKER_SUBZONE_ROWS = [['A', 'D'], ['B', 'C']] as const;
const START_ZONE_ROWS = [[4, 3, 2], [7, 8, 9], [5, 6, 1]] as const;
/**
 * A serve starts behind the baseline: the five serve start zones of DataVolley (manual 13.2),
 * 9 and 7 being the conflict zones between 6 and 1 and between 6 and 5. The server's own half
 * is one row along the baseline; on a reception the same five zones are where the ball came
 * from, on the opponent's half (mirrored, as that half is drawn).
 */
export const SERVE_START_ROWS = [[5, 7, 6, 9, 1]] as const;
export const RECEIVE_ORIGIN_ROWS = [[1, 9, 6, 7, 5]] as const;
const SERVE_START_ZONES = new Set<number>([5, 7, 6, 9, 1]);

export type TagZoneRotationSteps = 0 | 1 | 2 | 3;

const ROTATION_STORAGE_KEY = 'ovs:tag-zone-picker-rotation';
export const DEFAULT_TAG_ZONE_ROTATION: TagZoneRotationSteps = 1;

export function rotateGrid90CW<T>(grid: readonly (readonly T[])[], steps: TagZoneRotationSteps): T[][] {
  let current: T[][] = grid.map((row) => [...row]);
  for (let s = 0; s < steps; s += 1) {
    const rows = current.length;
    const cols = current[0]?.length ?? 0;
    const next: T[][] = Array.from({ length: cols }, () => []);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        next[c][rows - 1 - r] = current[r][c];
      }
    }
    current = next;
  }
  return current;
}

function loadSavedRotation(): TagZoneRotationSteps {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_TAG_ZONE_ROTATION;
  try {
    const raw = window.localStorage.getItem(ROTATION_STORAGE_KEY);
    if (raw === '0' || raw === '1' || raw === '2' || raw === '3') {
      return Number(raw) as TagZoneRotationSteps;
    }
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_TAG_ZONE_ROTATION;
}

function saveRotation(steps: TagZoneRotationSteps): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(ROTATION_STORAGE_KEY, String(steps));
  } catch {
    // Ignore storage errors
  }
}

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
  const [rotation, setRotation] = useState<TagZoneRotationSteps>(() => loadSavedRotation());

  const handleRotate = () => {
    setRotation((prev) => {
      const next = ((prev + 1) % 4) as TagZoneRotationSteps;
      saveRotation(next);
      return next;
    });
  };

  const titleKey = skill === 'serve'
    ? 'tagZoneServeTitle'
    : skill === 'receive'
      ? 'tagZoneReceiveTitle'
      : 'tagZoneAttackTitle';

  const isHorizontal = rotation === 1 || rotation === 3;
  const subzoneOrder = rotateGrid90CW(PICKER_SUBZONE_ROWS, rotation).flat();

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
              {subzoneOrder.map((subzone) => {
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
    <div className={`tag-zone-picker__half${skill === 'attack' ? '' : ' tag-zone-picker__half--baseline'}`}>
      {labelFirst ? <span className="tag-zone-picker__part">{t('tagZoneStart')}</span> : null}
      {rows.map((row, rowIndex) => (
        <div
          key={`start-${rowIndex}`}
          className={`tag-zone-picker__row tag-zone-picker__row--start${row.length === 5 ? ' tag-zone-picker__row--baseline' : ''}`}
        >
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

  // Top half = opponent's side, bottom half = own side. Serve: the start is the own baseline;
  // receive: the start (where the serve came from) is the opponent's baseline.
  const topHalfRows = rotateGrid90CW(skill === 'receive' ? RECEIVE_ORIGIN_ROWS : PICKER_ZONE_ROWS, rotation);
  const bottomHalfRows = rotateGrid90CW(skill === 'serve' ? SERVE_START_ROWS : START_ZONE_ROWS, rotation);
  const topFirst = rotation === 0 || rotation === 3;

  const renderHalfA = (labelFirst: boolean) =>
    (skill === 'receive' ? renderStartHalf(topHalfRows, labelFirst) : renderArrivalHalf(topHalfRows, labelFirst));
  const renderHalfB = (labelFirst: boolean) =>
    (skill === 'receive' ? renderArrivalHalf(bottomHalfRows, labelFirst) : renderStartHalf(bottomHalfRows, labelFirst));

  const firstHalf = topFirst ? renderHalfA(true) : renderHalfB(true);
  const secondHalf = topFirst ? renderHalfB(isHorizontal) : renderHalfA(isHorizontal);

  return (
    <div className={`tag-zone-picker tag-zone-picker--${variant}`} role="group" aria-label={t('tagZoneTitle')}>
      <div className="tag-zone-picker__header">
        <strong>{t(titleKey)}</strong>
        <div className="tag-zone-picker__header-actions">
          <button
            type="button"
            className="tag-zone-picker__rotate"
            onClick={handleRotate}
            title={t('tagZoneRotate')}
            aria-label={t('tagZoneRotate')}
          >
            ↻ 90°
          </button>
          <button type="button" className="tag-zone-picker__close" onClick={onClose} aria-label={t('tagZoneSkip')}>
            {t(startZone || endZone ? 'tagZoneDone' : 'tagZoneSkip')}
          </button>
        </div>
      </div>
      <div className={`tag-zone-picker__court${isHorizontal ? ' tag-zone-picker__court--horizontal' : ''}`}>
        {firstHalf}
        <div className="tag-zone-picker__net">{t('quickStartNet')}</div>
        {secondHalf}
      </div>
    </div>
  );
}
