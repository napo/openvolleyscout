import { useTranslation } from '@src/i18n';

export function AnalysisPage() {
  const { t } = useTranslation();

  return (
    <main style={{ padding: 'var(--space-xl)', background: 'var(--color-background)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 'var(--font-weight-bold)', marginBottom: 'var(--space-lg)', color: 'var(--color-text-primary)' }}>{t('analysisTitle')}</h1>
        <p style={{ fontSize: 'var(--font-size-lg)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xl)' }}>{t('analysisDescription')}</p>

        <div style={{ background: 'var(--color-surface)', padding: 'var(--space-xl)', borderRadius: 'var(--border-radius-md)', boxShadow: 'var(--shadow-md)', textAlign: 'center' }}>
          <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-secondary)' }}>{t('comingSoon')}</p>
        </div>
      </div>
    </main>
  );
}
