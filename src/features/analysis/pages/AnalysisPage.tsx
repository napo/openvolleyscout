import { useTranslation } from '@src/i18n';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import { useAppStore } from '@src/app/store/app-store';
import { getMatchTeamSnapshot } from '@src/domain/match';
import { getCompletedSetsFromEvents, mergeCompletedSets } from '@src/domain/scouting';
import { MatchResultDisplay } from '@src/features/scouting/components/MatchResultDisplay';
import { MatchStatsQuickReport } from '@src/features/scouting/components/MatchStatsQuickReport';
import { buildMatchStats } from '@src/features/scouting/model/match-stats';
import { formatProjectMatchResult } from '@src/features/scouting/model/match-result-format';
import '@src/features/scouting/scouting-screen.css';

export function AnalysisPage() {
  const { t } = useTranslation();
  const activeProject = useAppStore((state) => state.activeProject);

  const homeTeam = activeProject ? getMatchTeamSnapshot(activeProject, 'home') : null;
  const awayTeam = activeProject ? getMatchTeamSnapshot(activeProject, 'away') : null;
  const completedSets = activeProject
    ? mergeCompletedSets(
        activeProject.scoutingSession?.completedSets,
        getCompletedSetsFromEvents(activeProject.events),
      )
    : [];
  const matchResult = activeProject
    ? formatProjectMatchResult(activeProject, { goldenSetLabel: t('goldenSet').toLowerCase() })
    : null;
  const matchStats = activeProject && homeTeam && awayTeam
    ? buildMatchStats({
        homeTeam,
        awayTeam,
        eventLog: activeProject.events,
        completedSets,
        currentRallyTouches: activeProject.scoutingSession?.currentRallyTouches ?? [],
      })
    : null;

  return (
    <main className="app-page-screen">
      <div className="app-page-screen__container app-page-screen__container--wide">
        <AppPageLayout
          className="app-page-card analysis-page__layout"
          headerClassName="app-page-card__header"
          contentClassName="app-page-card__content analysis-page__content"
          header={(
            <div className="app-page-card__header-copy">
              <h1 className="app-page-card__title">{t('matchStatistics')}</h1>
              <p className="app-page-card__description">{activeProject ? t('analysisDescription') : t('noActiveProject')}</p>
            </div>
          )}
        >
          {activeProject && matchResult && matchStats ? (
            <>
              <div className="analysis-page__summary">
                <span className="load-data-card__result-label">
                  {matchResult.hasResult ? t('finalResult') : t('currentResult')}
                </span>
                {matchResult.hasResult ? (
                  <MatchResultDisplay
                    result={matchResult}
                    goldenSetLabel={t('goldenSet').toLowerCase()}
                  />
                ) : (
                  <span>{t('matchNotStarted')}</span>
                )}
              </div>
              <MatchStatsQuickReport
                stats={matchStats}
                eyebrow={t('matchStatistics')}
                title={t('matchStatistics')}
                scoreLabel={t('finalResult')}
              />
            </>
          ) : (
            <div className="analysis-page__placeholder">
              <p className="analysis-page__placeholder-copy">{t('noActiveProject')}</p>
            </div>
          )}
        </AppPageLayout>
      </div>
    </main>
  );
}
