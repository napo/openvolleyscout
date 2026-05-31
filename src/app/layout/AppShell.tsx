import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { SmartphoneExperienceWarning } from '../../features/scouting/components/SmartphoneExperienceWarning';
import { AppNavigation } from '../components/AppNavigation';

export function StandardAppShell({ children }: { children?: ReactNode }) {
  return (
    <div className="standard-app-shell">
      <SmartphoneExperienceWarning />
      <AppNavigation />
      <main className="standard-app-shell__content">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}

export function ScoutingAppShell({ children }: { children?: ReactNode }) {
  return (
    <div className="scouting-app-shell">
      <SmartphoneExperienceWarning />
      <AppNavigation compact />
      <main className="scouting-app-shell__content">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
