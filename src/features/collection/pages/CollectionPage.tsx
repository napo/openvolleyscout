import { useTranslation } from '@src/i18n';
import { useCollectionStore } from '../model';
import { SetStartFlow } from '../components/SetStartFlow';
import { RallyFlow } from '../components/RallyFlow';
import { EventLog } from '../components/EventLog';

export function CollectionPage() {
  const { t } = useTranslation();
  const liveMatch = useCollectionStore((state) => state.liveMatch);

  const handleRallyEnd = () => {
    // Handle rally end - could trigger animations, sounds, etc.
  };

  return (
    <main style={{ padding: 'var(--space-xl)', background: 'var(--color-background)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 'var(--font-weight-bold)', marginBottom: 'var(--space-lg)', color: 'var(--color-text-primary)' }}>
          {t('collection')}
        </h1>

        {!liveMatch ? (
          <SetStartFlow />
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-xl)' }}>
            {/* Match Header */}
            <div style={{ background: 'var(--color-surface)', padding: 'var(--space-lg)', borderRadius: 'var(--border-radius-md)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 'var(--space-lg)' }}>
                <div style={{ textAlign: 'center' }}>
                  <h2 style={{ fontSize: 'var(--font-size-xl)', color: 'var(--color-text-primary)' }}>{t('home')}</h2>
                  <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary)' }}>
                    {liveMatch.homeScore}
                  </p>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-secondary)' }}>
                    {t('set')} {liveMatch.setNumber}
                  </p>
                  <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                    {t('rally')} {liveMatch.rallyNumber}
                  </p>
                  <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                    {t('serving')}: {liveMatch.servingTeam === 'home' ? t('home') : t('away')}
                  </p>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <h2 style={{ fontSize: 'var(--font-size-xl)', color: 'var(--color-text-primary)' }}>{t('away')}</h2>
                  <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-secondary)' }}>
                    {liveMatch.awayScore}
                  </p>
                </div>
              </div>
            </div>

            {/* Rally Flow */}
            <RallyFlow onRallyEnd={handleRallyEnd} />

            {/* Event Log */}
            <EventLog />
          </div>
        )}
      </div>
    </main>
  );
}
