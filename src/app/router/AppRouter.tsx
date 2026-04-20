import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { LandingPage, LoadDataPage, AboutPage, SettingsPage } from '../../features/landing';
import { MatchSetupPage } from '../../features/startup/pages/MatchSetupPage';
import { ScoutingPage } from '../../features/scouting/pages/ScoutingPage';
import { SystemsPage } from '../../features/systems';
import { AnalysisPage } from '../../features/analysis/pages/AnalysisPage';
import { TeamsPage } from '../../features/teams/pages/TeamsPage';
import { AppNavigation } from '../components/AppNavigation';

function AppLayout() {
  return (
    <div style={{ background: 'var(--color-background)', minHeight: '100vh' }}>
      <AppNavigation />
      <div>
        <Outlet />
      </div>
    </div>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route element={<AppLayout />}>
          <Route path="/load-data" element={<LoadDataPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/match" element={<MatchSetupPage />} />
          <Route path="/scouting" element={<ScoutingPage />} />
          <Route path="/systems" element={<SystemsPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
