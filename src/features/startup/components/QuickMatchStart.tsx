// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { useAppStore } from '@src/app/store/app-store';
import { useTranslation, type TranslationKey } from '@src/i18n';
import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import type { MatchRosterSelectionPlayer } from '@src/domain/match/types';
import type { QuickJerseyEntryOutcome } from '@src/components/roster/QuickJerseyEntry';
import { parseLineupJersey, type QuickStartLevel, type QuickStartRequest } from '@src/features/scouting/model/quick-start';
import { MatchTeamSelection, type MatchTeamSelectionProps } from './MatchTeamSelection';
import { SetupVideoField, type SetupVideoFile } from './SetupVideoField';
import './quick-match-start.css';

/** Court layout seen from behind the team's own baseline: net at the top. */
const FRONT_ROW: CourtPosition[] = [4, 3, 2];
const BACK_ROW: CourtPosition[] = [5, 6, 1];

const STEP_COUNT = 5;

const LEVELS: Array<{ level: QuickStartLevel; labelKey: TranslationKey; hintKey: TranslationKey }> = [
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
  /** A lineup or libero number: joins the roster when new; a libero is marked as libero. */
  onAddLineupJersey: (jerseyNumber: number, isLibero?: boolean) => QuickJerseyEntryOutcome | void;
  onStart: (request: QuickStartRequest) => void;
  onFullSetup: () => void;
  /** Match details, all optional (defaults: friendly, today, now). */
  details?: { competitionName: string; matchDate: string; startTime: string; venue: string; videoUrl: string; videoUrlError?: string; videoFile: SetupVideoFile | null };
  onVideoFileChange?: (file: SetupVideoFile | null) => void;
  onDetailChange?: (field: 'competitionName' | 'matchDate' | 'startTime' | 'venue' | 'videoUrl', value: string) => void;
  /** Tutorial: show only this step (1-5, or 6 for the start buttons), filled with `initial`, not interactive. */
  previewStep?: number;
  initial?: {
    ownTeamOnly?: boolean;
    lineup?: Partial<Record<CourtPosition, string>>;
    setterPosition?: CourtPosition;
    servingTeam?: TeamSide;
    level?: QuickStartLevel;
    liberos?: [string, string];
    liberoAutoMiddleReplacement?: boolean;
  };
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
  previewStep,
  initial,
  details,
  onDetailChange,
  onVideoFileChange,
}: QuickMatchStartProps) {
  const { t } = useTranslation();
  const defaultLiberoAuto = useAppStore((state) => state.liberoAutoMiddleReplacement);
  const [ownTeamOnly, setOwnTeamOnly] = useState(initial?.ownTeamOnly ?? !awayHasRoster);
  const [lineup, setLineup] = useState<Partial<Record<CourtPosition, string>>>(initial?.lineup ?? {});
  // The two liberos, outside the court; proposed from the roster's liberos.
  // A box not typed in shows the roster's libero; typing takes over.
  const [typedLiberos, setTypedLiberos] = useState<[string | null, string | null]>([initial?.liberos?.[0] ?? null, initial?.liberos?.[1] ?? null]);
  const rosterLiberos = homePlayers.filter((player) => player.isLibero && player.isSelectedForMatch !== false).map((player) => String(player.jerseyNumber));
  const liberos: [string, string] = [typedLiberos[0] ?? rosterLiberos[0] ?? '', typedLiberos[1] ?? rosterLiberos[1] ?? ''];
  const [liberoAutoMiddleReplacement, setLiberoAutoMiddleReplacement] = useState(
    initial?.liberoAutoMiddleReplacement ?? defaultLiberoAuto,
  );
  const [setterPosition, setSetterPosition] = useState<CourtPosition | undefined>(initial?.setterPosition);
  const [servingTeam, setServingTeam] = useState<TeamSide | null>(initial?.servingTeam ?? null);
  const [level, setLevel] = useState<QuickStartLevel | null>(initial?.level ?? null);
  const [showErrors, setShowErrors] = useState(false);
  // One question per page, with back and forward; the tutorial shows a given step.
  const [step, setStep] = useState(1);
  const shown = previewStep ?? step;

  const chosenLevel = level ?? (ownTeamOnly ? 'tag' : 'court');
  const selectedPlayers = homePlayers.filter((player) => player.isSelectedForMatch !== false);
  const rosterJerseys = selectedPlayers.filter((player) => !player.isLibero).map((player) => player.jerseyNumber);
  const parsed = Object.fromEntries(
    Object.entries(lineup).map(([position, value]) => [position, parseLineupJersey(value ?? '')]),
  ) as Partial<Record<CourtPosition, number | undefined>>;
  const liberoNumbers = liberos.map((value) => parseLineupJersey(value)).filter((value): value is number => value !== undefined);
  const numbers = [...Object.values(parsed).filter((value): value is number => value !== undefined), ...liberoNumbers];
  const duplicates = new Set(numbers.filter((value, index) => numbers.indexOf(value) !== index));
  const filledCount = numbers.length - liberoNumbers.length;
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

  /** Forward, once the current question is answered well enough. */
  const next = () => {
    setShowErrors(true);
    if (step === 1 && missingName) return;
    if (step === 3 && duplicates.size > 0) return;
    if (step === 4 && !servingTeam) return;
    setShowErrors(false);
    setStep((value) => Math.min(STEP_COUNT, value + 1));
  };

  const setLibero = (index: 0 | 1, value: string) => {
    setTypedLiberos((current) => {
      const next: [string | null, string | null] = [...current];
      next[index] = value.replace(/\D/g, '').slice(0, 2);
      return next;
    });
  };
  const commitLibero = (index: 0 | 1) => {
    const jersey = parseLineupJersey(liberos[index]);
    if (jersey !== undefined) onAddLineupJersey(jersey, true);
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
      liberos: liberoNumbers,
      liberoAutoMiddleReplacement,
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

  if (previewStep) {
    // Tutorial preview: the real step, not interactive.
    return (
      <div className="quick-start quick-start--preview">
        {content()}
      </div>
    );
  }

  return (
    <main className="match-setup-page match-setup-page--with-nav">
      <div className="quick-start">
        {content()}
      </div>
    </main>
  );

  function content() {
    return (
      <>
        {!previewStep && (
          <header className="quick-start__header">
            <h1>{t('quickStartTitle')}</h1>
            <p>{t('quickStartIntro')}</p>
            <p className="quick-start__full-alt">
              {t('quickStartOrFullSetupPrefix')}{' '}
              <button type="button" className="quick-start__full-link" onClick={onFullSetup} disabled={isSubmitting}>
                {t('quickStartFullSetupLink')}
              </button>
            </p>
            <ol className="quick-start__progress" aria-label={t('quickStartStepOf', { current: step, total: STEP_COUNT })}>
              {Array.from({ length: STEP_COUNT }, (_, index) => index + 1).map((value) => (
                <li key={value}>
                  <button
                    type="button"
                    className={`quick-start__progress-step${value === step ? ' is-current' : ''}${value < step ? ' is-done' : ''}`}
                    aria-current={value === step ? 'step' : undefined}
                    disabled={value > step}
                    onClick={() => setStep(value)}
                  >
                    {value}
                  </button>
                </li>
              ))}
            </ol>
          </header>
        )}

        {shown === 1 && <section className="quick-start__step">
          <h2><span className="quick-start__index">1</span>{t('quickStartTeamQuestion')}</h2>
          <MatchTeamSelection {...homeTeamProps} />
          {details && onDetailChange ? (
            <details className="quick-start__details" open={details.videoUrlError ? true : undefined}>
              <summary>{t('quickStartMatchDetails')}</summary>
              <div className="quick-start__details-grid">
                <label className="quick-start__field">
                  <span>{t('competitionName')}</span>
                  <input type="text" value={details.competitionName} placeholder={t('competitionNamePlaceholder')} onChange={(event) => onDetailChange('competitionName', event.target.value)} />
                </label>
                <label className="quick-start__field">
                  <span>{t('matchDate')}</span>
                  <input type="date" value={details.matchDate} onChange={(event) => onDetailChange('matchDate', event.target.value)} />
                </label>
                <label className="quick-start__field">
                  <span>{t('startTime')}</span>
                  <input type="time" value={details.startTime} onChange={(event) => onDetailChange('startTime', event.target.value)} />
                </label>
                <label className="quick-start__field">
                  <span>{t('venue')}</span>
                  <input type="text" value={details.venue} placeholder={t('venuePlaceholder')} onChange={(event) => onDetailChange('venue', event.target.value)} />
                </label>
                <div className="quick-start__field quick-start__field--wide">
                  <span>{t('matchVideoLink')}</span>
                  <SetupVideoField
                    url={details.videoUrl}
                    file={details.videoFile}
                    error={details.videoUrlError}
                    onUrlChange={(value) => onDetailChange('videoUrl', value)}
                    onFileChange={(file) => onVideoFileChange?.(file)}
                  />
                </div>
              </div>
            </details>
          ) : null}
          {showErrors && missingName ? <p className="quick-start__error" role="alert">{t('homeTeamNameRequired')}</p> : null}
        </section>}

        {shown === 2 && <section className="quick-start__step">
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
        </section>}

        {shown === 3 && <section className="quick-start__step">
          <h2><span className="quick-start__index">3</span>{t('quickStartLineupQuestion')}</h2>
          <p className="quick-start__hint">{t('quickStartLineupHint')}</p>
          <datalist id="quick-start-roster">
            {rosterJerseys.map((jersey) => <option key={jersey} value={jersey} />)}
          </datalist>
          <div className="quick-start__court-row">
          <div className="quick-start__court">
            <div className="quick-start__net">{t('quickStartNet')}</div>
            <div className="quick-start__row">{FRONT_ROW.map(renderSlot)}</div>
            <div className="quick-start__row">{BACK_ROW.map(renderSlot)}</div>
          </div>
          <div className="quick-start__liberos" role="group" aria-label={t('quickStartLiberos')}>
            {([0, 1] as const).map((index) => (
              <label key={index} className={`quick-start__slot quick-start__slot--libero${parseLineupJersey(liberos[index]) !== undefined ? ' is-filled' : ''}`}>
                <span className="quick-start__slot-label">L{index + 1}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="quick-start__slot-input"
                  aria-label={t('quickStartLiberoNumber', { index: index + 1 })}
                  placeholder="#"
                  value={liberos[index]}
                  onChange={(event) => setLibero(index, event.target.value)}
                  onBlur={() => commitLibero(index)}
                />
              </label>
            ))}
          </div>
          </div>
          <label className="quick-start__libero-auto">
            <input
              type="checkbox"
              checked={liberoAutoMiddleReplacement}
              onChange={(event) => setLiberoAutoMiddleReplacement(event.target.checked)}
            />
            <span>{t('liberoReplacesMiddlesByDefault')}</span>
          </label>
          {duplicates.size > 0 ? <p className="quick-start__error" role="alert">{t('quickStartLineupDuplicate', { jerseys: [...duplicates].map((value) => `#${value}`).join(', ') })}</p> : null}
          <p className="quick-start__note">
            {filledCount === 6 ? t('quickStartLineupComplete') : t('quickStartLineupFromServes', { count: 6 - filledCount })}
          </p>
        </section>}

        {shown === 4 && <section className="quick-start__step">
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
        </section>}

        {shown === 5 && <section className="quick-start__step">
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
        </section>}

        {!previewStep && (
          <footer className="quick-start__footer quick-start__footer--steps">
            <button type="button" className="btn-secondary" onClick={() => setStep((value) => Math.max(1, value - 1))} disabled={step === 1 || isSubmitting}>
              {t('back')}
            </button>
            <span className="quick-start__step-count">{t('quickStartStepOf', { current: step, total: STEP_COUNT })}</span>
            {step < STEP_COUNT ? (
              <button type="button" className="btn-primary quick-start__go" onClick={next}>
                {t('next')}
              </button>
            ) : (
              <button type="button" className="btn-primary quick-start__go" onClick={start} disabled={isSubmitting}>
                {isSubmitting ? t('creating') : t('quickStartGo')}
              </button>
            )}
          </footer>
        )}
        {!previewStep && (
          <div className="quick-start__full">
            <button type="button" className="btn-secondary btn-small" onClick={onFullSetup} disabled={isSubmitting}>
              {t('quickStartFullSetup')}
            </button>
            {step === STEP_COUNT ? <p className="quick-start__defaults">{t('quickStartDefaults')}</p> : null}
          </div>
        )}
        {previewStep === 6 && <footer className="quick-start__footer">
          <button type="button" className="btn-secondary" onClick={onFullSetup} disabled={isSubmitting}>
            {t('quickStartFullSetup')}
          </button>
          <button type="button" className="btn-primary quick-start__go" onClick={start} disabled={isSubmitting}>
            {isSubmitting ? t('creating') : t('quickStartGo')}
          </button>
        </footer>}
        {previewStep === 6 && <p className="quick-start__defaults">{t('quickStartDefaults')}</p>}
      </>
    );
  }
}
