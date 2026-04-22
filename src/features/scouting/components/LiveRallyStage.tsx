import type { Team } from '@src/domain/roster/types';
import type { CourtZone } from '@src/domain/court';
import type { ActiveLineup } from '@src/domain/lineup/types';
import { useTranslation } from '@src/i18n';
import { EventDraftPanel } from './EventDraftPanel';
import { EventLog } from './EventLog';
import { RallyFlow } from './RallyFlow';
import { ScoutingCourt } from './ScoutingCourt';
import { ScoutingStageFrame } from './ScoutingStageFrame';

interface LiveRallyStageProps {
  awayTeam: Team;
  homeTeam: Team;
  awayLineup: ActiveLineup | null;
  homeLineup: ActiveLineup | null;
  selectedZone: CourtZone | null;
  onSelectedZoneChange: (zone: CourtZone | null) => void;
  onRallyEnd: () => void;
  onEndSet: () => void;
}

export function LiveRallyStage({
  awayTeam,
  homeTeam,
  awayLineup,
  homeLineup,
  selectedZone,
  onSelectedZoneChange,
  onRallyEnd,
  onEndSet,
}: LiveRallyStageProps) {
  const { t } = useTranslation();

  return (
    <ScoutingStageFrame
      eyebrow={t('liveRallyEyebrow')}
      title={t('liveRallyTitle')}
      description={t('liveRallyDescription')}
    >
      <div className="live-rally-stage">
        <section className="scouting-stage-panel live-rally-stage__court">
          <ScoutingCourt
            awayTeam={awayTeam}
            homeTeam={homeTeam}
            awayLineup={awayLineup}
            homeLineup={homeLineup}
            selectedZone={selectedZone}
            onSelectedZoneChange={onSelectedZoneChange}
          />
        </section>

        <aside className="live-rally-stage__sidebar">
          <div className="scouting-stage-panel scouting-stage-panel--scroll">
            <RallyFlow homeTeam={homeTeam} awayTeam={awayTeam} onRallyEnd={onRallyEnd} />
          </div>

          <div className="live-rally-stage__secondary">
            <div className="scouting-stage-panel scouting-stage-panel--scroll">
              <EventDraftPanel
                selectedTeamSide={selectedZone?.teamSide ?? null}
                selectedZoneId={selectedZone?.id ?? null}
              />
            </div>
            <div className="scouting-stage-panel scouting-stage-panel--scroll">
              <EventLog />
            </div>
          </div>

          <div className="live-rally-stage__footer">
            <button type="button" className="btn-secondary" onClick={onEndSet}>
              {t('endCurrentSet')}
            </button>
          </div>
        </aside>
      </div>
    </ScoutingStageFrame>
  );
}
