import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage, LoadDataPage, AboutPage, SettingsPage } from '../../features/landing';
import { MatchSetupPage } from '../../features/startup/pages/MatchSetupPage';
import { ScoutingPage } from '../../features/scouting/pages/ScoutingPage';
import { SystemsPage } from '../../features/systems';
import { AnalysisPage } from '../../features/analysis/pages/AnalysisPage';
import { TeamsPage } from '../../features/teams/pages/TeamsPage';
import { ScoutingAppShell, StandardAppShell } from '../layout/AppShell';

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
          <Route path="/match" element={<MatchSetupPage />} />
          <Route path="/systems" element={<SystemsPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
        </Route>
        <Route element={<div className="app-root"><ScoutingAppShell /></div>}>
          <Route path="/scouting" element={<ScoutingPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
