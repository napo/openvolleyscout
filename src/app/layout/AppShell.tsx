import type { ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { SmartphoneExperienceWarning } from '../../features/scouting/components/SmartphoneExperienceWarning';
import { AppNavigation } from '../components/AppNavigation';
import { UpdateChecker } from '../components/UpdateChecker';
import { PwaUpdateBanner } from '../components/PwaUpdateBanner';

export function StandardAppShell({ children }: { children?: ReactNode }) {
  const isTacticalReport = useLocation().pathname.startsWith('/opponent-reports');
  return (
    <div className="standard-app-shell">
      <UpdateChecker />
      <PwaUpdateBanner />
      {!isTacticalReport ? <SmartphoneExperienceWarning /> : null}
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
      <PwaUpdateBanner />
      <SmartphoneExperienceWarning />
      <AppNavigation compact />
      <main className="scouting-app-shell__content">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
