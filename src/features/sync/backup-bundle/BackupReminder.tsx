import { Link } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { daysSinceLastBackup, isBackupOverdue } from './backup-reminder';
import { cloudSyncController } from '../cloud/archive-adapter';
import { useCloudSyncStatus } from '../cloud/controller';
import './backup-reminder.css';

interface BackupReminderProps {
  /** Runs the backup in place (Data page); otherwise the reminder links there. */
  onBackup?: () => void;
  busy?: boolean;
  /** One short line (Data page header): offers cloud sync or the archive download. */
  compact?: boolean;
  /** Element id of the cloud sync section the compact reminder leads to. */
  syncAnchorId?: string;
}

export function BackupReminder({ onBackup, busy = false, compact = false, syncAnchorId }: BackupReminderProps) {
  const { t } = useTranslation();
  const sync = useCloudSyncStatus(cloudSyncController);
  // With cloud sync connected the archive is already kept on the cloud.
  if (sync.state !== 'off' || !isBackupOverdue()) {
    return null;
  }

  const days = daysSinceLastBackup();
  const when = days === null ? t('backupReminderNever') : t('backupReminderDays', { days });
  if (compact) {
    return (
      <div className="backup-reminder backup-reminder--compact" role="status">
        <span className="backup-reminder__dot" aria-hidden="true" />
        <span>{when} {t('backupReminderChoose')}</span>
        {syncAnchorId ? (
          <button
            type="button"
            className="backup-reminder__action"
            onClick={() => {
              const target = document.getElementById(syncAnchorId);
              target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              target?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
            }}
          >
            {t('backupReminderUseCloud')}
          </button>
        ) : null}
        {onBackup ? (
          <button type="button" className="backup-reminder__action backup-reminder__action--secondary" onClick={onBackup} disabled={busy}>
            {t('backupReminderDownload')}
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="backup-reminder" role="status">
      <span>
        {days === null ? t('backupReminderNever') : t('backupReminderDays', { days })}
        {' '}
        {t('backupReminderHint')}
      </span>
      {onBackup ? (
        <button type="button" className="btn-primary btn-small" onClick={onBackup} disabled={busy}>
          {t('backupNow')}
        </button>
      ) : (
        <Link to="/load-data" className="btn-secondary btn-small">{t('loadData')}</Link>
      )}
    </div>
  );
}
