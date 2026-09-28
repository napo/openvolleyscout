import { Link } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { daysSinceLastBackup, isBackupOverdue } from './backup-reminder';
import './backup-reminder.css';

interface BackupReminderProps {
  /** Runs the backup in place (Data page); otherwise the reminder links there. */
  onBackup?: () => void;
  busy?: boolean;
}

export function BackupReminder({ onBackup, busy = false }: BackupReminderProps) {
  const { t } = useTranslation();
  if (!isBackupOverdue()) {
    return null;
  }

  const days = daysSinceLastBackup();
  return (
    <div className="backup-reminder" role="status">
      <span>
        {days === null ? t('backupReminderNever') : t('backupReminderDays', { days })}
        {' '}
        {t('backupReminderHint')}
      </span>
      {onBackup ? (
        <button type="button" className="btn-primary btn-small" onClick={onBackup} disabled={busy}>
          {t('exportBackupAll')}
        </button>
      ) : (
        <Link to="/load-data" className="btn-secondary btn-small">{t('loadData')}</Link>
      )}
    </div>
  );
}
