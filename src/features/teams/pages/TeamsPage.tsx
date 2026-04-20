import { useTranslation } from '@src/i18n';
import { AppNavigation } from '@src/app/components/AppNavigation';

export function TeamsPage() {
  const { t } = useTranslation();

  return (
    <>
      <AppNavigation />
      <main style={{ padding: 'var(--space-xl)', background: 'var(--color-background)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 'var(--font-weight-bold)', marginBottom: 'var(--space-lg)', color: 'var(--color-text-primary)' }}>
            {t('teams')}
          </h1>
          <p>{t('teamsDescription')}</p>
          {/* TODO: Implement team archive management */}
        </div>
      </main>
    </>
  );
}