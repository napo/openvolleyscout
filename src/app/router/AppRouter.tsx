import { BrowserRouter, Routes, Route, Navigate, Link, Outlet } from 'react-router-dom';
import { LandingPage, LoadDataPage, AboutPage, SettingsPage } from '../../features/landing';
import { StartupPage } from '../../features/startup/pages/StartupPage';
import { MatchSetupPage } from '../../features/startup/pages/MatchSetupPage';
import { CollectionPage } from '../../features/collection/pages/CollectionPage';
import { AnalysisPage } from '../../features/analysis/pages/AnalysisPage';
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
        <Route path="/load-data" element={<LoadDataPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/app" element={<AppLayout />}>
          <Route path="match-setup" element={<MatchSetupPage />} />
          <Route path="startup" element={<StartupPage />} />
          <Route path="collection" element={<CollectionPage />} />
          <Route path="analysis" element={<AnalysisPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}


