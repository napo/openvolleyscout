import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { LandingNavigation } from '../components/LandingNavigation';
import logo from '@src/assets/openvolleyscout.png';

export function LandingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="landing-page">
      <LandingNavigation currentPage="home" />

      {/* Centered logo */}
      <main className="landing-main">
        <img
          src={logo}
          alt={t('appName')}
          className="landing-logo"
        />
      </main>

      {/* Bottom action buttons */}
      <footer className="landing-actions">
        <button
          className="landing-action-button"
          onClick={() => navigate('/teams')}
        >
          <span className="landing-action-icon">👥</span>
          <span>{t('teams')}</span>
        </button>
        <button
          className="landing-action-button"
          onClick={() => navigate('/match')}
        >
          <span className="landing-action-icon">🏐</span>
          <span>{t('newMatch')}</span>
        </button>
        <button
          className="landing-action-button"
          onClick={() => navigate('/load-data')}
        >
          <span className="landing-action-icon">📁</span>
          <span>{t('loadData')}</span>
        </button>
      </footer>
    </div>
  );
}

