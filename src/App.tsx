import { AppProviders } from './app/providers/AppProviders';
import { AppRouter } from './app/router/AppRouter';

export default function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}
