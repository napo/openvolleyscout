import type { ReactNode } from 'react';
import { OrientationGuard } from './OrientationGuard';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <OrientationGuard>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </OrientationGuard>
  );
}
