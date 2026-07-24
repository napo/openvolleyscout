import { useTranslation, type TranslationKey } from '@src/i18n';
import type { PlayerOption } from './technical-player';

export interface PlayerPickerProps {
  players: readonly PlayerOption[];
  selectedIds: ReadonlySet<string>;
  onToggle: (playerId: string) => void;
}

export function PlayerPicker({ players, selectedIds, onToggle }: PlayerPickerProps) {
  const { t } = useTranslation();

  if (players.length === 0) return null;

  return (
    <div className="priorities-player-picker" role="group" aria-label={t('prioritiesPlayerPickerLabel')}>
      {players.map((player) => (
        <label key={player.playerId} className="priorities-player-picker__item">
          <input
            type="checkbox"
            checked={selectedIds.has(player.playerId)}
            onChange={() => onToggle(player.playerId)}
          />
          <span className="priorities-player-picker__jersey">#{player.jerseyNumber}</span>
          <span className="priorities-player-picker__name">{player.playerName}</span>
          {player.role ? (
            <span className="priorities-player-picker__role">{t(player.role as TranslationKey)}</span>
          ) : null}
        </label>
      ))}
    </div>
  );
}
