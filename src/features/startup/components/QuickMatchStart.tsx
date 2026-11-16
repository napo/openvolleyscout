// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { useTranslation, type TranslationKey } from '@src/i18n';
import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import type { MatchRosterSelectionPlayer } from '@src/domain/match/types';
import type { QuickJerseyEntryOutcome } from '@src/components/roster/QuickJerseyEntry';
import { parseLineupJersey, type QuickStartLevel, type QuickStartRequest } from '@src/features/scouting/model/quick-start';
import { MatchTeamSelection, type MatchTeamSelectionProps } from './MatchTeamSelection';
import './quick-match-start.css';

/** Court layout seen from behind the team's own baseline: net at the top. */
const FRONT_ROW: CourtPosition[] = [4, 3, 2];
const BACK_ROW: CourtPosition[] = [5, 6, 1];

const LEVELS: Array<{ level: QuickStartLevel; labelKey: TranslationKey; hintKey: TranslationKey }> = [
  { level: 'basic', labelKey: 'inputModeBasic', hintKey: 'inputModeBasicHint' },
  { level: 'tag', labelKey: 'inputModeTag', hintKey: 'inputModeTagHint' },
  { level: 'court', labelKey: 'inputModeCourt', hintKey: 'inputModeCourtHint' },
  { level: 'detailed', labelKey: 'inputModeDetailed', hintKey: 'inputModeDetailedHint' },
];

interface QuickMatchStartProps {
  homeTeamProps: MatchTeamSelectionProps;
  awayTeamProps: MatchTeamSelectionProps;
  homeName: string;
  awayName: string;
  homePlayers: MatchRosterSelectionPlayer[];
  awayHasRoster: boolean;
  isSubmitting: boolean;
  onOpponentNameChange: (name: string) => void;
  /** Drops the opponent's roster: it is then only a name. */
  onOwnTeamOnly: () => void;
  /** A lineup number not yet in the roster joins it. */
  onAddLineupJersey: (jerseyNumber: number) => QuickJerseyEntryOutcome;
  onStart: (request: QuickStartRequest) => void;
  onFullSetup: () => void;
}

/**
 * New match on one page, in the order a coach thinks of it: my team, who I
 * scout, who is on court, who serves, how I record. Then straight to the
 * first rally; everything else keeps its default and can be changed later.
 */
export function QuickMatchStart({
  homeTeamProps,
  awayTeamProps,
  homeName,
  awayName,
  homePlayers,
  awayHasRoster,
  isSubmitting,
  onOpponentNameChange,
  onOwnTeamOnly,
  onAddLineupJersey,
  onStart,
  onFullSetup,
}: QuickMatchStartProps) {
  const { t } = useTranslation();
  const [ownTeamOnly, setOwnTeamOnly] = useState(!awayHasRoster);
  const [lineup, setLineup] = useState<Partial<Record<CourtPosition, string>>>({});
  const [setterPosition, setSetterPosition] = useState<CourtPosition | undefined>();
  const [servingTeam, setServingTeam] = useState<TeamSide | null>(null);
  const [level, setLevel] = useState<QuickStartLevel | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const chosenLevel = level ?? (ownTeamOnly ? 'tag' : 'court');
  const selectedPlayers = homePlayers.filter((player) => player.isSelectedForMatch !== false);
  const rosterJerseys = selectedPlayers.filter((player) => !player.isLibero).map((player) => player.jerseyNumber);
  const parsed = Object.fromEntries(
    Object.entries(lineup).map(([position, value]) => [position, parseLineupJersey(value ?? '')]),
  ) as Partial<Record<CourtPosition, number | undefined>>;
  const numbers = Object.values(parsed).filter((value): value is number => value !== undefined);
  const duplicates = new Set(numbers.filter((value, index) => numbers.indexOf(value) !== index));
  const filledCount = numbers.length;
  const missingName = !homeName.trim();
  const opponentLabel = awayName.trim() || t('opponentDefaultName');
  const homeLabel = homeName.trim() || t('quickStartYourTeam');

  const setPosition = (position: CourtPosition, value: string) => {
    setLineup((current) => ({ ...current, [position]: value.replace(/\D/g, '').slice(0, 2) }));
  };
  const commitPosition = (position: CourtPosition) => {
    const jersey = parsed[position];
    if (jersey !== undefined && !rosterJerseys.includes(jersey)) onAddLineupJersey(jersey);
  };

  const start = () => {
    setShowErrors(true);
    if (missingName || !servingTeam || duplicates.size > 0) return;
    const request: QuickStartRequest = {
      lineup: Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined)) as QuickStartRequest['lineup'],
      setterPosition: setterPosition && parsed[setterPosition] !== undefined ? setterPosition : undefined,
      servingTeam,
      level: chosenLevel,
      ownTeamOnly,
    };
    onStart(request);
  };

  const renderSlot = (position: CourtPosition) => {
    const value = lineup[position] ?? '';
    const jersey = parsed[position];
    const isDuplicate = jersey !== undefined && duplicates.has(jersey);
    return (
      <div key={position} className={`quick-start__slot${jersey !== undefined ? ' is-filled' : ''}${isDuplicate ? ' is-invalid' : ''}`}>
        <span className="quick-start__slot-label">P{position}</span>
        <input
          type="text"
          inputMode="numeric"
          className="quick-start__slot-input"
          aria-label={t('quickStartLineupPosition', { position })}
          placeholder="#"
          value={value}
          list="quick-start-roster"
          onChange={(event) => setPosition(position, event.target.value)}
          onBlur={() => commitPosition(position)}
        />
        <label className="quick-start__setter">
          <input
            type="radio"
            name="quick-start-setter"
            checked={setterPosition === position}
            disabled={jersey === undefined}
            onChange={() => setSetterPosition(position)}
          />
          {t('quickStartSetterShort')}
        </label>
      </div>
    );
  };

  return (
    <main className="match-setup-page match-setup-page--with-nav">
      <div className="quick-start">
        <header className="quick-start__header">
          <h1>{t('quickStartTitle')}</h1>
          <p>{t('quickStartIntro')}</p>
        </header>

        <section className="quick-start__step">
          <h2><span className="quick-start__index">1</span>{t('quickStartTeamQuestion')}</h2>
          <MatchTeamSelection {...homeTeamProps} />
          {showErrors && missingName ? <p className="quick-start__error" role="alert">{t('homeTeamNameRequired')}</p> : null}
        </section>

        <section className="quick-start__step">
          <h2><span className="quick-start__index">2</span>{t('quickStartWhoQuestion')}</h2>
          <div className="quick-start__choices">
            <button type="button" className={`quick-start__choice${ownTeamOnly ? ' is-selected' : ''}`} aria-pressed={ownTeamOnly}
              onClick={() => { setOwnTeamOnly(true); onOwnTeamOnly(); }}>
              <strong>{t('quickStartOwnTeamOnly')}</strong>
              <span>{t('quickStartOwnTeamOnlyHint')}</span>
            </button>
            <button type="button" className={`quick-start__choice${!ownTeamOnly ? ' is-selected' : ''}`} aria-pressed={!ownTeamOnly}
              onClick={() => setOwnTeamOnly(false)}>
              <strong>{t('quickStartBothTeams')}</strong>
              <span>{t('quickStartBothTeamsHint')}</span>
            </button>
          </div>
          {ownTeamOnly ? (
            <label className="quick-start__field">
              <span>{t('quickStartOpponentName')}</span>
              <input type="text" value={awayName} placeholder={t('opponentDefaultName')} onChange={(event) => onOpponentNameChange(event.target.value)} />
            </label>
          ) : (
            <MatchTeamSelection {...awayTeamProps} />
          )}
        </section>

        <section className="quick-start__step">
          <h2><span className="quick-start__index">3</span>{t('quickStartLineupQuestion')}</h2>
          <p className="quick-start__hint">{t('quickStartLineupHint')}</p>
          <datalist id="quick-start-roster">
            {rosterJerseys.map((jersey) => <option key={jersey} value={jersey} />)}
          </datalist>
          <div className="quick-start__court">
            <div className="quick-start__net">{t('quickStartNet')}</div>
            <div className="quick-start__row">{FRONT_ROW.map(renderSlot)}</div>
            <div className="quick-start__row">{BACK_ROW.map(renderSlot)}</div>
          </div>
          {duplicates.size > 0 ? <p className="quick-start__error" role="alert">{t('quickStartLineupDuplicate', { jerseys: [...duplicates].map((value) => `#${value}`).join(', ') })}</p> : null}
          <p className="quick-start__note">
            {filledCount === 6 ? t('quickStartLineupComplete') : t('quickStartLineupFromServes', { count: 6 - filledCount })}
          </p>
        </section>

        <section className="quick-start__step">
          <h2><span className="quick-start__index">4</span>{t('quickStartServeQuestion')}</h2>
          <div className="quick-start__choices">
            {(['home', 'away'] as TeamSide[]).map((side) => (
              <button key={side} type="button" className={`quick-start__choice${servingTeam === side ? ' is-selected' : ''}`} aria-pressed={servingTeam === side}
                onClick={() => setServingTeam(side)}>
                <strong>{side === 'home' ? homeLabel : opponentLabel}</strong>
              </button>
            ))}
          </div>
          {showErrors && !servingTeam ? <p className="quick-start__error" role="alert">{t('quickStartServeRequired')}</p> : null}
        </section>

        <section className="quick-start__step">
          <h2><span className="quick-start__index">5</span>{t('quickStartLevelQuestion')}</h2>
          <div className="quick-start__levels">
            {LEVELS.map((entry) => (
              <button key={entry.level} type="button" className={`quick-start__choice${chosenLevel === entry.level ? ' is-selected' : ''}`} aria-pressed={chosenLevel === entry.level}
                onClick={() => setLevel(entry.level)}>
                <strong>
                  {t(entry.labelKey)}
                  {entry.level === (ownTeamOnly ? 'tag' : 'court') ? <em className="quick-start__badge">{t('quickStartRecommended')}</em> : null}
                </strong>
                <span>{t(entry.hintKey)}</span>
              </button>
            ))}
          </div>
        </section>

        <footer className="quick-start__footer">
          <button type="button" className="btn-secondary" onClick={onFullSetup} disabled={isSubmitting}>
            {t('quickStartFullSetup')}
          </button>
          <button type="button" className="btn-primary quick-start__go" onClick={start} disabled={isSubmitting}>
            {isSubmitting ? t('creating') : t('quickStartGo')}
          </button>
        </footer>
        <p className="quick-start__defaults">{t('quickStartDefaults')}</p>
      </div>
    </main>
  );
}
