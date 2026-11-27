import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { AppNavigation } from '../components/AppNavigation';
import { UpdateChecker } from '../components/UpdateChecker';
import { PwaUpdateBanner } from '../components/PwaUpdateBanner';
import { CloudSyncAlert } from '@src/features/sync/cloud/CloudSyncAlert';

export function StandardAppShell({ children }: { children?: ReactNode }) {
  return (
    <div className="standard-app-shell">
      <UpdateChecker />
      <PwaUpdateBanner />
      <AppNavigation />
      <main className="standard-app-shell__content">
        {children ?? <Outlet />}
      </main>
      <CloudSyncAlert />
    </div>
  );
}

export function ScoutingAppShell({ children }: { children?: ReactNode }) {
  return (
    <div className="scouting-app-shell">
      <PwaUpdateBanner />
      <AppNavigation compact />
      <main className="scouting-app-shell__content">
        {children ?? <Outlet />}
      </main>
      <CloudSyncAlert placement="inline" />
    </div>
  );
}
