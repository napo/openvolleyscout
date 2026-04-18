import { BrowserRouter, Routes, Route, Navigate, Link, Outlet } from 'react-router-dom';
import { LandingPage, LoadDataPage, AboutPage, SettingsPage } from '../../features/landing';
import { StartupPage } from '../../features/startup/pages/StartupPage';
import { CollectionPage } from '../../features/collection/pages/CollectionPage';
import { AnalysisPage } from '../../features/analysis/pages/AnalysisPage';

function AppLayout() {
  return (
    <div style={{ background: 'var(--color-background)', minHeight: '100vh' }}>
      <nav style={{ display: 'flex', gap: 'var(--space-lg)', padding: 'var(--space-lg)', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-text-secondary)', boxShadow: 'var(--shadow-sm)' }}>
        <Link to="/" style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 'var(--font-weight-medium)', padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--border-radius-sm)', transition: 'background 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = 'var(--color-primary-light)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}>Home</Link>
        <Link to="/app/startup" style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 'var(--font-weight-medium)', padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--border-radius-sm)', transition: 'background 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = 'var(--color-primary-light)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}>Startup</Link>
        <Link to="/app/collection" style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 'var(--font-weight-medium)', padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--border-radius-sm)', transition: 'background 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = 'var(--color-primary-light)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}>Collection</Link>
        <Link to="/app/analysis" style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 'var(--font-weight-medium)', padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--border-radius-sm)', transition: 'background 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = 'var(--color-primary-light)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}>Analysis</Link>
      </nav>
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
          <Route path="startup" element={<StartupPage />} />
          <Route path="collection" element={<CollectionPage />} />
          <Route path="analysis" element={<AnalysisPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}


