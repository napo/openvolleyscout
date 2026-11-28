// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { useTranslation } from '@src/i18n';
import { ActionIcon } from '@src/components/ActionIcon';
import { AthleteSilhouette } from '@src/components/athlete-silhouettes/AthleteSilhouette';
import { assignLineupCell } from '../model/board-pieces';
import type { TeamPlayerInfo } from '../model/report-view';

interface TeamLineupEditorProps {
  /** The cells in force: zones 1 to 6, then two libero cells. */
  cells: readonly TeamPlayerInfo[][];
  labels: readonly string[];
  players: readonly TeamPlayerInfo[];
  /** Athlete photos by player key; an athlete with none shows the drawing of the role. */
  photos?: ReadonlyMap<string, string>;
  /** True when the coach changed the computed line-up. */
  edited: boolean;
  onChange: (cells: string[][] | undefined) => void;
}

/** Zones as on the printed page: 4, 3, 2 at the net, 5, 6, 1 behind, the liberos below. */
const LAYOUT = [[3, 2, 1], [4, 5, 0], [6, 7]] as const;

export function TeamLineupEditor({ cells, labels, players, photos, edited, onChange }: TeamLineupEditorProps) {
  const { t } = useTranslation();
  const [active, setActive] = useState<number | null>(null);
  const keys = cells.map((cell) => cell.map((player) => player.key));
  const cellLabel = (index: number) => (index < 6 ? `${t('teamColZone')} ${labels[index] ?? index + 1}` : labels[index] ?? 'L');
  const where = (key: string) => keys.findIndex((cell) => cell.includes(key));
  const chosen = active === null ? [] : keys[active] ?? [];

  const toggle = (key: string) => {
    if (active === null) return;
    const next = chosen.includes(key) ? chosen.filter((entry) => entry !== key) : [...chosen, key];
    if (next.length > 2) return;
    onChange(assignLineupCell(keys, active, next));
  };

  return (
    <div className="team-lineup-editor">
      <p className="opponent-report__hint">{t('teamLineupEditorHint')}</p>
      {LAYOUT.map((row, rowIndex) => (
        <div key={rowIndex} className={`team-lineup-editor__row${rowIndex === 0 ? ' team-lineup-editor__row--net' : ''}`}>
          {row.map((index) => (
            <button
              key={index}
              type="button"
              className={`team-lineup-editor__cell${active === index ? ' is-active' : ''}`}
              aria-pressed={active === index}
              onClick={() => setActive(active === index ? null : index)}
            >
              <small>{cellLabel(index)}</small>
              {cells[index]?.length ? (
                <span className={`team-lineup-editor__athletes${cells[index].length > 1 ? ' team-lineup-editor__athletes--shared' : ''}`}>
                  {cells[index].map((player) => (
                    <span key={player.key} className="team-lineup-editor__athlete">
                      {photos?.get(player.key)
                        // The name is written beside it: the picture adds nothing for a screen reader.
                        ? <img className="team-lineup-editor__portrait" src={photos.get(player.key)} alt="" data-testid="athlete-photo" />
                        : <span className="team-lineup-editor__portrait"><AthleteSilhouette pose={player.pose ?? 'attacker'} size={26} /></span>}
                      <span>
                        <strong>{player.role}</strong> #{player.jersey} {player.name}
                        <em>{player.figures} · {t('teamCellMatches', { n: player.matches })}</em>
                      </span>
                    </span>
                  ))}
                </span>
              ) : <span className="team-lineup-editor__empty">{t('teamLineupEmptyCell')}</span>}
            </button>
          ))}
        </div>
      ))}

      {active !== null ? (
        <div className="team-lineup-editor__picker" role="group" aria-label={cellLabel(active)}>
          <strong>{cellLabel(active)}</strong>
          <p className="opponent-report__hint">{t('teamLineupPickerHint')}</p>
          <div className="team-lineup-editor__choices">
            {players.map((player) => {
              const cell = where(player.key);
              const inThis = chosen.includes(player.key);
              return (
                <label key={player.key} className={inThis ? 'is-chosen' : ''}>
                  <input type="checkbox" checked={inThis} disabled={!inThis && chosen.length >= 2} onChange={() => toggle(player.key)} />
                  #{player.jersey} {player.name} <small>{player.role}</small>
                  {cell >= 0 && cell !== active ? <small> · {cellLabel(cell)}</small> : null}
                </label>
              );
            })}
          </div>
          <div className="team-lineup-editor__actions">
            {chosen.length === 2 ? (
              <button type="button" className="btn-secondary btn-small" onClick={() => onChange(assignLineupCell(keys, active, [chosen[1], chosen[0]]))}>
                ⇄ {t('teamLineupSwap')}
              </button>
            ) : null}
            {chosen.length ? (
              <button type="button" className="btn-secondary btn-small" onClick={() => onChange(assignLineupCell(keys, active, []))}>
                {t('teamLineupClearCell')}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {edited ? (
        <button type="button" className="btn-secondary btn-small" onClick={() => { setActive(null); onChange(undefined); }}>
          <ActionIcon name="undo" />{t('teamLineupReset')}
        </button>
      ) : null}
    </div>
  );
}
