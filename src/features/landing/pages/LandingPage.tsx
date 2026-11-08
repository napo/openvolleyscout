import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { useAppStore } from '@src/app/store/app-store';
import ballLogo from '@src/assets/openvolleyscout-ball.png';
import { evaluateMatchReadiness } from '@src/lib/validation/match-readiness';
import { matchRepository, teamRepository } from '@src/infrastructure/repositories';
import { getMatchTeamSnapshot } from '@src/domain/match/helpers';
import type { MatchProject } from '@src/domain/match/types';
import type { ArchivedTeam } from '@src/domain/team/types';
import { formatDisplayDate } from '@src/lib/utils/local-date';
import { formatProjectMatchResult } from '@src/features/scouting/model/match-result-format';
import { ItemPickerDialog, type ItemPickerColumn } from '@src/components/ItemPickerDialog';
import {
  ChartIcon,
  CirclePlusIcon,
  CourtIcon,
  FolderOpenIcon,
  PlayIcon,
  ReportIcon,
  UsersIcon,
  VideoIcon,
} from '../components/LandingActionIcons';

type IconComponent = ComponentType<{ className?: string }>;
type Picker = 'video' | 'team' | null;

const LAST_VIDEO_MATCH_KEY = 'openvolleyscout.home.lastVideoMatchId';
const LAST_TEAM_STUDY_KEY = 'openvolleyscout.home.lastTeamStudyId';

function readStored(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function writeStored(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch { /* not remembered */ }
}

const matchName = (project: MatchProject) => `${getMatchTeamSnapshot(project, 'home').name} – ${getMatchTeamSnapshot(project, 'away').name}`;
// Most recent first: played date, then last change.
const byRecency = (left: MatchProject, right: MatchProject) =>
  (right.metadata.playedAt ?? '').localeCompare(left.metadata.playedAt ?? '') || right.updatedAt - left.updatedAt;

function HomeTile({ Icon, title, hint, onClick, primary = false, disabled = false }: {
  Icon: IconComponent; title: string; hint: string; onClick: () => void; primary?: boolean; disabled?: boolean;
}) {
  return (
    <button type="button" className={`home-tile${primary ? ' home-tile--primary' : ''}`} onClick={onClick} disabled={disabled}>
      <Icon className="home-tile__icon" />
      <span className="home-tile__text">
        <strong>{title}</strong>
        <small>{hint}</small>
      </span>
      <span className="home-tile__chevron" aria-hidden="true">›</span>
    </button>
  );
}

export function LandingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const activeProject = useAppStore((state) => state.activeProject);
  const closeProject = useAppStore((state) => state.closeProject);
  const setActiveProject = useAppStore((state) => state.setActiveProject);
  const [matches, setMatches] = useState<MatchProject[]>([]);
  const [teams, setTeams] = useState<ArchivedTeam[]>([]);
  const [picker, setPicker] = useState<Picker>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([matchRepository.list(), teamRepository.list()]).then(([loadedMatches, loadedTeams]) => {
      if (cancelled) return;
      setMatches([...loadedMatches].sort(byRecency));
      setTeams([...loadedTeams].sort((a, b) => a.name.localeCompare(b.name)));
    }).catch((error) => console.error('Error loading home data:', error));
    return () => { cancelled = true; };
  }, []);

  // A match is "in progress" when it is open, ready to scout and not finished yet.
  const activeResult = activeProject ? formatProjectMatchResult(activeProject, { goldenSetLabel: t('goldenSet') }) : null;
  const inProgress = Boolean(activeProject && evaluateMatchReadiness(activeProject).isReady && activeResult
    && !activeResult.winnerSide && activeProject.phase !== 'closed');
  const session = activeProject?.scoutingSession;

  const lastPlayed = useMemo(
    () => matches.find((project) => formatProjectMatchResult(project, { goldenSetLabel: t('goldenSet') }).hasResult) ?? null,
    [matches, t],
  );
  const lastVideoId = readStored(LAST_VIDEO_MATCH_KEY);
  const suggestedVideoMatch = matches.find((project) => project.metadata.id === lastVideoId)
    ?? matches.find((project) => project.videoAnalysis?.source)
    ?? lastPlayed;
  const lastTeamId = readStored(LAST_TEAM_STUDY_KEY);
  const suggestedTeam = teams.find((team) => team.id === lastTeamId) ?? null;

  const matchCountByTeam = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of matches) {
      for (const id of [project.homeSelection?.archivedTeamId, project.awaySelection?.archivedTeamId]) {
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  }, [matches]);

  const openStatistics = async (project: MatchProject, view?: 'video-analysis') => {
    const persisted = await matchRepository.getById(project.metadata.id);
    if (!persisted) return;
    setActiveProject(persisted);
    navigate('/analysis', view ? { state: { view } } : undefined);
  };

  const matchColumns: ItemPickerColumn<MatchProject>[] = [
    { key: 'match', label: t('match'), text: matchName },
    { key: 'date', label: t('pickerColumnDate'), text: (project) => formatDisplayDate(project.metadata.playedAt) || '–' },
    { key: 'competition', label: t('competition'), text: (project) => project.metadata.competition || '–' },
    { key: 'result', label: t('pickerColumnResult'), text: (project) => {
      const result = formatProjectMatchResult(project, { goldenSetLabel: t('goldenSet') });
      return result.hasResult ? `${result.homeSetsWon}-${result.awaySetsWon}` : '–';
    } },
    { key: 'video', label: t('videoAnalysis'), text: (project) => (project.videoAnalysis?.source ? t('pickerVideoLinked') : t('pickerVideoNone')) },
  ];
  const teamColumns: ItemPickerColumn<ArchivedTeam>[] = [
    { key: 'team', label: t('teams'), text: (team) => team.name },
    { key: 'code', label: t('pickerColumnCode'), text: (team) => team.teamCode || '–' },
    { key: 'matches', label: t('pickerColumnMatches'), text: (team) => String(matchCountByTeam.get(team.id) ?? 0) },
    { key: 'coach', label: t('headCoach'), text: (team) => team.staff?.headCoach || '–' },
  ];

  return (
    <div className="landing-page">
      <main className="landing-main">
        {/* The ball mark only; the name is real text (sharp, translatable, readable by screen readers). */}
        <img src={ballLogo} alt="" aria-hidden="true" className="landing-logo" />
        <h1 className="landing-title">
          <span>Open</span><span className="landing-title__accent">Volley</span><span>Scout</span>
        </h1>
      </main>

      <div className="home-content">
        {inProgress && activeProject && activeResult ? (
          <section className="home-resume" aria-label={t('homeInProgress')}>
            <span className="home-resume__badge">{t('homeInProgress')}</span>
            <div className="home-resume__match">
              <strong>{matchName(activeProject)}</strong>
              <small>{[activeProject.metadata.competition || t('defaultCompetitionName'), formatDisplayDate(activeProject.metadata.playedAt)].filter(Boolean).join(' · ')}</small>
            </div>
            <div className="home-resume__score">
              <strong>{activeResult.homeSetsWon}-{activeResult.awaySetsWon}</strong>
              <small>{t('sets')}{session?.isSetStarted ? ` · ${session.homeScore}-${session.awayScore}` : ''}</small>
            </div>
            <button type="button" className="btn-primary home-resume__continue" onClick={() => navigate('/scouting')}>
              <PlayIcon className="home-resume__play" />{t('homeContinueScouting')}
            </button>
          </section>
        ) : null}

        <div className="home-groups">
          <section className="home-group">
            <h2 className="home-group__title">{t('homeGroupMatch')}</h2>
            <HomeTile Icon={CirclePlusIcon} title={t('newMatch')} hint={t('homeNewMatchHint')} primary={!inProgress}
              onClick={() => { closeProject(); navigate('/match'); }} />
            <HomeTile Icon={ChartIcon} title={t('homeLastStats')} hint={lastPlayed ? matchName(lastPlayed) : t('homeNoMatchesYet')}
              disabled={!lastPlayed} onClick={() => { if (lastPlayed) void openStatistics(lastPlayed); }} />
          </section>

          <section className="home-group">
            <h2 className="home-group__title">{t('homeGroupAnalysis')}</h2>
            <HomeTile Icon={VideoIcon} title={t('videoAnalysis')}
              hint={suggestedVideoMatch ? t('homeLastUsed', { name: matchName(suggestedVideoMatch) }) : t('homeNoMatchesYet')}
              disabled={!matches.length} onClick={() => setPicker('video')} />
            <HomeTile Icon={UsersIcon} title={t('teamDataStudy')} hint={t('homeTeamStudyHint')}
              disabled={!teams.length} onClick={() => setPicker('team')} />
            <HomeTile Icon={ReportIcon} title={t('opponentReports')} hint={t('homeReportsHint')} onClick={() => navigate('/opponent-reports')} />
          </section>

          <section className="home-group">
            <h2 className="home-group__title">{t('homeGroupArchive')}</h2>
            <HomeTile Icon={FolderOpenIcon} title={t('loadData')} hint={t('homeDataHint')} onClick={() => navigate('/load-data')} />
            <HomeTile Icon={UsersIcon} title={t('teams')} hint={t('homeTeamsHint')} onClick={() => navigate('/teams')} />
            <HomeTile Icon={CourtIcon} title={t('systems')} hint={t('homeSystemsHint')} onClick={() => navigate('/systems')} />
          </section>
        </div>

        <p className="home-tutorials">
          <button type="button" className="home-tutorials__link" onClick={() => navigate('/about')}>{t('homeTutorials')}</button>
        </p>
      </div>

      {picker === 'video' ? (
        <ItemPickerDialog
          title={t('pickerVideoTitle')}
          description={t('pickerVideoDescription')}
          items={matches}
          columns={matchColumns}
          getId={(project) => project.metadata.id}
          suggestedId={suggestedVideoMatch?.metadata.id}
          emptyText={t('homeNoMatchesYet')}
          onClose={() => setPicker(null)}
          onPick={(project) => { writeStored(LAST_VIDEO_MATCH_KEY, project.metadata.id); setPicker(null); void openStatistics(project, 'video-analysis'); }}
        />
      ) : null}
      {picker === 'team' ? (
        <ItemPickerDialog
          title={t('pickerTeamTitle')}
          items={teams}
          columns={teamColumns}
          getId={(team) => team.id}
          suggestedId={suggestedTeam?.id}
          emptyText={t('noArchivedTeams')}
          onClose={() => setPicker(null)}
          onPick={(team) => { writeStored(LAST_TEAM_STUDY_KEY, team.id); setPicker(null); navigate('/team-analysis', { state: { teamId: team.id, teamName: team.name } }); }}
        />
      ) : null}
    </div>
  );
}
