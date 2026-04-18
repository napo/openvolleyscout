import { OrientationGuard } from './app/layout/OrientationGuard';
import { StartupPage } from './features/startup/pages/StartupPage';

export default function App() {
  return (
    <OrientationGuard>
      <StartupPage />
    </OrientationGuard>
  );
}
