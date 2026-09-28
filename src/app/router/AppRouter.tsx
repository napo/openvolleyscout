import { Suspense, lazy, type ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage } from '../../features/landing/pages/LandingPage';
import { MatchSetupPage } from '../../features/startup/pages/MatchSetupPage';
import { ScoutingPage } from '../../features/scouting/pages/ScoutingPage';
import { TeamsPage } from '../../features/teams/pages/TeamsPage';
import { ScoutingAppShell, StandardAppShell } from '../layout/AppShell';

// Pages outside the match-day flow (analysis, charts, video, settings) load on
// demand, so the scouting screens start faster. The service worker still
// precaches every chunk, so they keep working offline.
function lazyPage<T extends Record<string, unknown>>(loader: () => Promise<T>, name: keyof T) {
  const Page = lazy(() => loader().then((module) => ({ default: module[name] as React.ComponentType })));
  return <Suspense fallback={null}><Page /></Suspense>;
}

const loadDataPage = lazyPage(() => import('../../features/landing/pages/LoadDataPage'), 'LoadDataPage');
const aboutPage = lazyPage(() => import('../../features/landing/pages/AboutPage'), 'AboutPage');
const settingsPage = lazyPage(() => import('../../features/landing/pages/SettingsPage'), 'SettingsPage');
const teamAnalysisPage = lazyPage(() => import('../../features/teams/pages/TeamAnalysisPage'), 'TeamAnalysisPage');
const systemsPage = lazyPage(() => import('../../features/systems'), 'SystemsPage');
const analysisPage = lazyPage(() => import('../../features/analysis/pages/AnalysisPage'), 'AnalysisPage');
const metricsGlossaryPage = lazyPage(() => import('../../features/analytics/glossary/MetricsGlossaryPage'), 'MetricsGlossaryPage');
const videoPopoutPage = lazyPage(() => import('../../features/scouting/live/video/VideoPopoutPage'), 'VideoPopoutPage');

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
          <Route path="/load-data" element={loadDataPage} />
          <Route path="/about" element={aboutPage} />
          <Route path="/settings" element={settingsPage} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/team-analysis" element={teamAnalysisPage} />
          <Route path="/match" element={<MatchSetupPage />} />
          <Route path="/systems" element={systemsPage} />
          <Route path="/analysis" element={analysisPage} />
          <Route path="/metrics-glossary" element={metricsGlossaryPage} />
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
        <Route path="/video-popout" element={videoPopoutPage} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
