import { useState } from 'react';
import { useTranslation } from '@src/i18n';
import { useAppStore } from '@src/app/store/app-store';
import type { CourtZone } from '@src/domain/court';
import { useScoutingStore } from '../model/scouting-store';
import { EventDraftPanel, EventLog, RallyFlow, ScoutingCourt, SetStartFlow } from '../components';
import '../scouting-screen.css';

function formatCurrentEventLabel(eventType: string | undefined, t: (key: string) => string) {
  switch (eventType) {
    case 'set_started':
      return t('setStarted');
    case 'rally_started':
      return t('rallyStarted');
    case 'touch_recorded':
      return t('touchRecorded');
    case 'point_awarded':
      return t('pointAwarded');
    case 'rally_ended':
      return t('rallyEnded');
    default:
      return t('waitingToStartSet');
  }
}

export function ScoutingPage() {
  const { t } = useTranslation();
  const activeProject = useAppStore((state) => state.activeProject);
  const liveMatch = useScoutingStore((state) => state.liveMatch);
  const [selectedZone, setSelectedZone] = useState<CourtZone | null>(null);

  const handleRallyEnd = () => {
    // Handle rally end - could trigger animations, sounds, etc.
  };

  if (!activeProject) {
    return (
      <main className="scouting-screen">
        <div className="scouting-screen__container">
          <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)', margin: 0 }}>
            {t('scouting')}
          </h1>
          <SetStartFlow onSetStarted={() => {}} />
        </div>
      </main>
    );
  }

  const currentEvent = liveMatch?.eventLog.at(-1);
  const currentEventLabel = formatCurrentEventLabel(currentEvent?.type, t);
  const awayTeamName = activeProject.awayTeam.name || t('away');
  const homeTeamName = activeProject.homeTeam.name || t('home');
  const currentSetLabel = liveMatch?.currentSetNumber ?? 1;
  const currentRallyLabel = liveMatch?.currentRallyNumber ?? 0;
  const servingTeamLabel = liveMatch?.servingTeam
    ? liveMatch.servingTeam === 'home'
      ? homeTeamName
      : awayTeamName
    : t('notSpecified');

  return (
    <main className="scouting-screen">
      <div className="scouting-screen__container">
        <section className="scouting-screen__header">
          <div className="scouting-screen__event">
            <span className="scouting-screen__event-label">{t('currentEvent')}</span>
            <strong className="scouting-screen__event-value">{currentEventLabel}</strong>
          </div>

          <div className="scouting-screen__matchbar">
            <div className="scouting-screen__team scouting-screen__team--away">
              <span className="scouting-screen__team-role">{t('away')}</span>
              <strong className="scouting-screen__team-name">{awayTeamName}</strong>
            </div>

            <div className="scouting-screen__scoreboard">
              <span className="scouting-screen__score-label">{t('liveScore')}</span>
              <div className="scouting-screen__score-value">
                <span>{liveMatch?.awayScore ?? 0}</span>
                <span className="scouting-screen__score-divider">:</span>
                <span>{liveMatch?.homeScore ?? 0}</span>
              </div>
              <div className="scouting-screen__score-meta">
                <span>{t('currentSet')}: {currentSetLabel}</span>
                <span>{t('rallyNumber')}: {currentRallyLabel}</span>
                <span>{t('servingTeam')}: {servingTeamLabel}</span>
              </div>
            </div>

            <div className="scouting-screen__team scouting-screen__team--home">
              <span className="scouting-screen__team-role">{t('home')}</span>
              <strong className="scouting-screen__team-name">{homeTeamName}</strong>
            </div>
          </div>
        </section>

        <section className="scouting-screen__court-stage">
          <ScoutingCourt
            awayTeam={activeProject.awayTeam}
            homeTeam={activeProject.homeTeam}
            awayLineup={liveMatch?.awayLineup ?? null}
            homeLineup={liveMatch?.homeLineup ?? null}
            selectedZone={selectedZone}
            onSelectedZoneChange={setSelectedZone}
          />
        </section>

        <section className="scouting-screen__support">
          <div className="scouting-screen__panel">
            {!liveMatch ? (
              <SetStartFlow onSetStarted={() => {}} />
            ) : (
              <RallyFlow onRallyEnd={handleRallyEnd} />
            )}
          </div>

          <aside className="scouting-screen__panel scouting-screen__panel-stack">
            <EventDraftPanel
              selectedTeamSide={selectedZone?.teamSide ?? null}
              selectedZoneId={selectedZone?.id ?? null}
            />
            <EventLog />
          </aside>
        </section>
      </div>
    </main>
  );
}
