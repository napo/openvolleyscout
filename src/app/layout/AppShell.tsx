import type { ReactNode } from 'react';
import { OrientationGuard } from './OrientationGuard';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <OrientationGuard>
      <div className="app-shell-root">
        {children}
      </div>
    </OrientationGuard>
  );
}
