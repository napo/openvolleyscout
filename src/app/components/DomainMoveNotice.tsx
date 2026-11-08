import { useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { useTranslation } from '@src/i18n';
import { exportBackupAsOvs } from '@src/features/sync/export/export-backup';
import { recordBackupDone } from '@src/features/sync/backup-bundle/backup-reminder';

/** Last day the web app is served from its current address; data stays in this browser's origin. */
const DOMAIN_MOVE_DATE = '2026-11-23';
const DISMISS_KEY = 'openvolleyscout.domainMoveNotice.dismissedOn';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Web-only notice: on the move to a new domain the browser storage (matches, teams, reports)
 * does not follow, so users are asked to export a full backup before the move date.
 * It can be hidden for the day, and reappears the next day until the move.
 */
export function DomainMoveNotice() {
  const { t, locale } = useTranslation();
  const [hidden, setHidden] = useState(() => {
    try { return window.localStorage.getItem(DISMISS_KEY) === todayIso(); } catch { return false; }
  });
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  if (isTauri() || hidden || todayIso() > DOMAIN_MOVE_DATE) return null;
  const moveDate = new Date(`${DOMAIN_MOVE_DATE}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });

  const exportAll = async () => {
    setState('busy');
    try {
      await exportBackupAsOvs({ includeArchivedTeams: true, includeArchivedRosters: true, includeArchivedCompetitions: true, includeSystems: true });
      recordBackupDone();
      setState('done');
    } catch (error) {
      console.error('Error exporting the domain-move backup:', error);
      setState('error');
    }
  };

  return (
    <div className="domain-move-notice" role="alert">
      <p className="domain-move-notice__text">
        <strong>{t('domainMoveTitle', { date: moveDate })}</strong> {t('domainMoveBody', { date: moveDate })}
      </p>
      <div className="domain-move-notice__actions">
        <button type="button" className="btn-primary btn-small" onClick={() => void exportAll()} disabled={state === 'busy'}>
          {t(state === 'busy' ? 'domainMoveExporting' : 'domainMoveExport')}
        </button>
        <button type="button" className="btn-secondary btn-small" onClick={() => {
          try { window.localStorage.setItem(DISMISS_KEY, todayIso()); } catch { /* shown again */ }
          setHidden(true);
        }}>
          {t('domainMoveLater')}
        </button>
      </div>
      {state === 'done' ? <p className="domain-move-notice__status">{t('domainMoveDone')}</p> : null}
      {state === 'error' ? <p className="domain-move-notice__status domain-move-notice__status--error">{t('ovsBackupExportFailed')}</p> : null}
    </div>
  );
}
