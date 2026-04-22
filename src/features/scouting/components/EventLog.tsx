import { useTranslation } from '@src/i18n';
import { useScoutingStore } from '../model';

interface EventLogProps {
  maxEvents?: number;
}

export function EventLog({ maxEvents = 10 }: EventLogProps) {
  const { t } = useTranslation();
  const liveMatch = useScoutingStore((state) => state.liveMatch);

  if (!liveMatch) {
    return null;
  }

  const recentEvents = liveMatch.eventLog.slice(-maxEvents);

  const formatEvent = (event: any) => {
    switch (event.type) {
      case 'set_started':
        return t('setStarted');
      case 'rally_started':
        return t('rallyStarted');
      case 'touch_recorded':
        return t('touchRecorded');
      case 'point_awarded':
        return `${t('pointAwarded')} - ${event.teamSide === 'home' ? t('home') : t('away')}`;
      case 'set_ended':
        return t('endSet');
      case 'rally_ended':
        return t('rallyEnded');
      default:
        return event.type;
    }
  };

  return (
    <div style={{ padding: 'var(--space-lg)', background: 'var(--color-surface)', borderRadius: 'var(--border-radius-md)' }}>
      <h4 style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--space-md)', color: 'var(--color-text-primary)' }}>
        {t('eventList')}
      </h4>

      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
        {recentEvents.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
            {t('noEventsYet')}
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-xs)' }}>
            {recentEvents.map((event, index) => (
              <div
                key={event.id}
                style={{
                  padding: 'var(--space-sm)',
                  background: 'var(--color-background)',
                  borderRadius: 'var(--border-radius-xs)',
                  fontSize: 'var(--font-size-sm)',
                  border: '1px solid var(--color-surface)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{formatEvent(event)}</span>
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                    {new Date(event.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
