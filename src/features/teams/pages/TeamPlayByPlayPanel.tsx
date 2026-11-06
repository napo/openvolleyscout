import { useMemo, useState } from 'react';
import type { MatchProject } from '@src/domain/match/types';
import { getMatchTeamSnapshot } from '@src/domain/match';
import { useTranslation } from '@src/i18n';
import { formatDisplayDate } from '@src/lib/utils/local-date';
import { buildProjectMatchStats } from '@src/features/scouting/model/project-match-stats';
import { PlayByPlayPanel } from '@src/features/analytics/play-by-play/PlayByPlayPanel';
import { getFocusTeamSide } from '../model/team-match-filter';

/** Timelines belong to individual matches; never merge rally numbers across matches. */
export function TeamPlayByPlayPanel({ projects, focusTeamId, focusTeamName }: {
  projects: readonly MatchProject[]; focusTeamId?: string; focusTeamName?: string;
}) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState(projects[0]?.metadata.id ?? '');
  const project = projects.find((candidate) => candidate.metadata.id === selectedId) ?? projects[0];
  const stats = useMemo(() => project ? buildProjectMatchStats(project) : null, [project]);
  if (!project || !stats) return <p>{t('pbpEmpty')}</p>;
  return <div className="team-analysis-play-by-play">
    <div className="play-by-play__controls">
      <label>{t('match')}<select value={project.metadata.id} onChange={(event) => setSelectedId(event.target.value)}>
        {projects.map((candidate) => <option key={candidate.metadata.id} value={candidate.metadata.id}>{[
          formatDisplayDate(candidate.metadata.playedAt),
          `${getMatchTeamSnapshot(candidate, 'home').name} - ${getMatchTeamSnapshot(candidate, 'away').name}`,
          candidate.metadata.competition,
          candidate.metadata.matchNumber,
        ].filter(Boolean).join(' · ')}</option>)}
      </select></label>
    </div>
    <p>{t('pbpMatchHelp')}</p>
    <PlayByPlayPanel key={`${project.metadata.id}:${focusTeamId ?? focusTeamName ?? ''}`}
      homeTeam={getMatchTeamSnapshot(project, 'home')} awayTeam={getMatchTeamSnapshot(project, 'away')}
      stats={stats} eventLog={project.events} metadata={project.metadata}
      initialReference={getFocusTeamSide(project, focusTeamId, focusTeamName)} />
  </div>;
}
