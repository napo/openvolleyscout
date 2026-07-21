import { Suspense, lazy, type ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage, LoadDataPage, AboutPage, SettingsPage } from '../../features/landing';
import { MatchSetupPage } from '../../features/startup/pages/MatchSetupPage';
import { ScoutingPage } from '../../features/scouting/pages/ScoutingPage';
import { SystemsPage } from '../../features/systems';
import { AnalysisPage } from '../../features/analysis/pages/AnalysisPage';
import { MetricsGlossaryPage } from '../../features/analytics/glossary/MetricsGlossaryPage';
import { TeamsPage } from '../../features/teams/pages/TeamsPage';
import { TeamAnalysisPage } from '../../features/teams/pages/TeamAnalysisPage';
import { VideoPopoutPage } from '../../features/scouting/live/video/VideoPopoutPage';
import { ScoutingAppShell, StandardAppShell } from '../layout/AppShell';

const DevLiveScoutingSmokePage = import.meta.env.DEV
  ? lazy(() =>
      import('../../features/scouting/pages/DevLiveScoutingSmokePage').then((m) => ({
        default: m.DevLiveScoutingSmokePage,
      }))
    )
  : null;

export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<div className="app-root"><StandardAppShell /></div>}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/load-data" element={<LoadDataPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/team-analysis" element={<TeamAnalysisPage />} />
          <Route path="/match" element={<MatchSetupPage />} />
          <Route path="/systems" element={<SystemsPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/metrics-glossary" element={<MetricsGlossaryPage />} />
        </Route>
        <Route element={<div className="app-root"><ScoutingAppShell /></div>}>
          <Route path="/scouting" element={<ScoutingPage />} />
          {import.meta.env.DEV && DevLiveScoutingSmokePage ? (
            <Route
              path="/dev/live-scouting-smoke"
              element={
                <Suspense fallback={null}>
                  {DevLiveScoutingSmokePage && <DevLiveScoutingSmokePage />}
                </Suspense>
              }
            />
          ) : null}
        </Route>
        <Route path="/video-popout" element={<VideoPopoutPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
