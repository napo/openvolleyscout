import { useTranslation } from '@src/i18n';

export function AboutPage() {
  const { t } = useTranslation();

  return (
    <div style={{ background: 'var(--color-background)', minHeight: '100vh' }}>
      <div style={{ padding: 'var(--space-xl)', maxWidth: '600px', margin: '0 auto' }}>
        <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 'var(--font-weight-bold)', marginBottom: 'var(--space-lg)', color: 'var(--color-text-primary)' }}>{t('appName')}</h1>
        <p style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>{t('appDescription')}</p>

        <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-sm)', color: 'var(--color-text-primary)' }}>{t('author')}</h2>
        <p style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--space-lg)', color: 'var(--color-text-secondary)' }}>Maurizio Napolitano</p>

        <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-sm)', color: 'var(--color-text-primary)' }}>{t('license')}</h2>
        <p style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--space-lg)', color: 'var(--color-text-secondary)' }}>GPL-3.0</p>

        <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-sm)', color: 'var(--color-text-primary)' }}>{t('repository')}</h2>
        <p style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--space-lg)', color: 'var(--color-text-secondary)' }}><a href="https://github.com/napo/openvolleyscout/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>https://github.com/napo/openvolleyscout/</a></p>

        <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-sm)', color: 'var(--color-text-primary)' }}>{t('currentCapabilities')}</h2>
        <p style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>{t('capabilitiesText')}</p>
      </div>
    </div>
  );
}
