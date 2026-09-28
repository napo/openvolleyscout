import { useState } from 'react';
import { parseQuickJerseyList, type QuickEntryPlayer } from '@src/domain/roster/quick-entry';
import { useTranslation } from '@src/i18n';
import './quick-jersey-entry.css';

export interface QuickJerseyEntryOutcome {
  added: number[];
  skipped: number[];
}

interface QuickJerseyEntryProps {
  /** Adds the parsed players; returns which jerseys were added or already present. */
  onAdd: (players: QuickEntryPlayer[]) => QuickJerseyEntryOutcome | Promise<QuickJerseyEntryOutcome>;
  compact?: boolean;
  autoFocus?: boolean;
}

/**
 * One text field to add many players by jersey number ("1-12 L13").
 * Names are optional and can be filled in later.
 */
export function QuickJerseyEntry({ onAdd, compact = false, autoFocus = false }: QuickJerseyEntryProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  // Compact mode uses the numeric keypad, so liberos are marked with a toggle instead of "L".
  const [markAsLibero, setMarkAsLibero] = useState(false);

  const submit = async () => {
    const parsed = parseQuickJerseyList(text);
    const invalidTokens = parsed.invalidTokens;
    const players = markAsLibero ? parsed.players.map((player) => ({ ...player, isLibero: true })) : parsed.players;
    if (players.length === 0) {
      setMessage(invalidTokens.length > 0
        ? { tone: 'error', text: t('quickJerseyEntryInvalid', { tokens: invalidTokens.join(' ') }) }
        : null);
      return;
    }

    setIsBusy(true);
    try {
      const outcome = await onAdd(players);
      const parts: string[] = [];
      if (outcome.added.length > 0) {
        parts.push(t('quickJerseyEntryAdded', { numbers: outcome.added.map((n) => `#${n}`).join(' ') }));
      }
      if (outcome.skipped.length > 0) {
        parts.push(t('quickJerseyEntrySkipped', { numbers: outcome.skipped.map((n) => `#${n}`).join(' ') }));
      }
      if (invalidTokens.length > 0) {
        parts.push(t('quickJerseyEntryInvalid', { tokens: invalidTokens.join(' ') }));
      }
      setMessage({ tone: invalidTokens.length > 0 ? 'error' : 'success', text: parts.join(' / ') });
      if (invalidTokens.length === 0) {
        setText('');
        setMarkAsLibero(false);
      }
    } catch (error) {
      console.error('Quick jersey entry failed:', error);
      setMessage({ tone: 'error', text: t('quickJerseyEntryFailed') });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className={`quick-jersey-entry${compact ? ' quick-jersey-entry--compact' : ''}`}>
      <label className="quick-jersey-entry__label">
        <span>{t('quickJerseyEntryLabel')}</span>
        <div className="quick-jersey-entry__row">
          <input
            type="text"
            className="form-input quick-jersey-entry__input"
            inputMode={compact ? 'numeric' : 'text'}
            autoComplete="off"
            autoFocus={autoFocus}
            value={text}
            placeholder={t('quickJerseyEntryPlaceholder')}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                void submit();
              }
            }}
          />
          <button type="button" className="btn-secondary btn-small" disabled={isBusy || !text.trim()} onClick={() => void submit()}>
            {t('quickJerseyEntryAdd')}
          </button>
        </div>
      </label>
      {compact && (
        <label className="quick-jersey-entry__libero">
          <input type="checkbox" checked={markAsLibero} onChange={(event) => setMarkAsLibero(event.target.checked)} />
          <span>{t('libero')}</span>
        </label>
      )}
      {!compact && <p className="quick-jersey-entry__hint">{t('quickJerseyEntryHint')}</p>}
      {message && (
        <p className={`quick-jersey-entry__message is-${message.tone}`} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}
