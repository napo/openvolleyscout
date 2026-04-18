import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import logo from '@src/assets/openvolleyscout.png';

export function LandingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="landing-page">
      {/* Top-right menu */}
      <header className="landing-header">
        <nav className="landing-menu">
          <button
            className="landing-menu-button"
            onClick={() => navigate('/about')}
          >
            {t('about')}
          </button>
          <button
            className="landing-menu-button"
            onClick={() => navigate('/settings')}
          >
            {t('settings')}
          </button>
        </nav>
      </header>

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
          onClick={() => navigate('/app/startup')}
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

