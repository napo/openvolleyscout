/**
 * Matches live only in this browser's storage, so losing the iPad (or its
 * site data) loses them. The app remembers when the last full backup (.ovs)
 * was written and reminds the scout when it is missing or old.
 */
const LAST_BACKUP_KEY = 'openvolleyscout.lastBackupAt';
export const BACKUP_REMINDER_DAYS = 7;

export function recordBackupDone(at: number = Date.now()): void {
  try {
    window.localStorage.setItem(LAST_BACKUP_KEY, String(at));
  } catch {
    // Without storage the reminder simply keeps showing.
  }
}

export function getLastBackupAt(): number | null {
  try {
    const value = Number(window.localStorage.getItem(LAST_BACKUP_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Whole days since the last backup, or null when there has never been one. */
export function daysSinceLastBackup(now: number = Date.now()): number | null {
  const last = getLastBackupAt();
  return last === null ? null : Math.floor((now - last) / 86_400_000);
}

export function isBackupOverdue(now: number = Date.now()): boolean {
  const days = daysSinceLastBackup(now);
  return days === null || days >= BACKUP_REMINDER_DAYS;
}
