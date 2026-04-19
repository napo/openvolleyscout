import { useTranslation } from '@src/i18n';
import { useCollectionStore } from '../model';
import type { TeamSide } from '@src/domain/common/enums';

interface RallyFlowProps {
  onRallyEnd: () => void;
}

export function RallyFlow({ onRallyEnd }: RallyFlowProps) {
  const { t } = useTranslation();
  const liveMatch = useCollectionStore((state) => state.liveMatch);
  const startRally = useCollectionStore((state) => state.startRally);
  const recordTouch = useCollectionStore((state) => state.recordTouch);
  const awardPoint = useCollectionStore((state) => state.awardPoint);
  const endRally = useCollectionStore((state) => state.endRally);

  if (!liveMatch) {
    return null;
  }

  const handleStartRally = () => {
    startRally();
  };

  const handleRecordTouch = () => {
    // TODO: Implement proper touch recording
    const mockTouch = {
      playerId: 'player-1',
      teamSide: 'home' as TeamSide,
      action: 'spike',
      zone: 4,
      evaluation: 'winning',
    };
    recordTouch(mockTouch);
  };

  const handleAwardPoint = (teamSide: TeamSide) => {
    awardPoint(teamSide);
    endRally();
    onRallyEnd();
  };

  return (
    <div style={{ padding: 'var(--space-xl)', background: 'var(--color-surface)', borderRadius: 'var(--border-radius-md)' }}>
      <h3 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-lg)', color: 'var(--color-text-primary)' }}>
        {t('rallyActionArea')}
      </h3>

      <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
        {!liveMatch.isRallyActive ? (
          <button
            onClick={handleStartRally}
            style={{
              padding: 'var(--space-lg)',
              background: 'var(--color-primary)',
              color: 'var(--color-background)',
              border: 'none',
              borderRadius: 'var(--border-radius-md)',
              fontSize: 'var(--font-size-lg)',
              fontWeight: 'var(--font-weight-bold)',
              cursor: 'pointer',
            }}
          >
            {t('startRally')}
          </button>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
              <button
                onClick={handleRecordTouch}
                style={{
                  padding: 'var(--space-md)',
                  background: 'var(--color-accent)',
                  color: 'var(--color-background)',
                  border: 'none',
                  borderRadius: 'var(--border-radius-sm)',
                  cursor: 'pointer',
                }}
              >
                {t('recordTouch')}
              </button>

              <button
                onClick={() => handleAwardPoint('home')}
                style={{
                  padding: 'var(--space-md)',
                  background: 'var(--color-primary)',
                  color: 'var(--color-background)',
                  border: 'none',
                  borderRadius: 'var(--border-radius-sm)',
                  cursor: 'pointer',
                }}
              >
                {t('pointToHome')}
              </button>

              <button
                onClick={() => handleAwardPoint('away')}
                style={{
                  padding: 'var(--space-md)',
                  background: 'var(--color-secondary)',
                  color: 'var(--color-background)',
                  border: 'none',
                  borderRadius: 'var(--border-radius-sm)',
                  cursor: 'pointer',
                }}
              >
                {t('pointToAway')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}