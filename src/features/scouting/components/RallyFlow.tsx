import { useTranslation } from '@src/i18n';
import { useScoutingStore } from '../model';
import type { TeamSide } from '@src/domain/common/enums';
import { createCourtZoneId } from '@src/domain/court';

interface RallyFlowProps {
  onRallyEnd: () => void;
}

export function RallyFlow({ onRallyEnd }: RallyFlowProps) {
  const { t } = useTranslation();
  const liveMatch = useScoutingStore((state) => state.liveMatch);
  const startRally = useScoutingStore((state) => state.startRally);
  const recordTouch = useScoutingStore((state) => state.recordTouch);
  const awardPoint = useScoutingStore((state) => state.awardPoint);
  const endRally = useScoutingStore((state) => state.endRally);

  if (!liveMatch) {
    return null;
  }

  const handleStartRally = () => {
    startRally();
  };

  const handleRecordTouch = () => {
    if (!liveMatch) {
      return;
    }

    const mockTouch = {
      id: `touch-${Date.now()}`,
      setNumber: liveMatch.currentSetNumber,
      rallyNumber: liveMatch.currentRallyNumber,
      sequenceNumber: liveMatch.eventLog.filter((event) => event.type === 'touch_recorded').length + 1,
      playerId: 'player-1',
      teamSide: 'home' as TeamSide,
      skill: 'attack' as const,
      evaluation: '#' as const,
      zone: {
        teamSide: 'home' as TeamSide,
        zoneId: createCourtZoneId('home', 2, 2),
        gridPosition: { row: 2, column: 2 },
        point: { x: 25, y: 25 },
      },
      createdAt: Date.now(),
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
