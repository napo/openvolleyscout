import { AppProviders } from './app/providers/AppProviders';
import { AppShell } from './app/layout/AppShell';
import { AppRouter } from './app/router/AppRouter';

export default function App() {
  return (
    <AppProviders>
      <AppShell>
        <AppRouter />
      </AppShell>
    </AppProviders>
  );
}
