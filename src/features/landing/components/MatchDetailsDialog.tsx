import { Modal } from '@src/components/Modal';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { useTranslation } from '@src/i18n';
import { getMatchTeamSelection, normalizeMatchProject, setMatchTeamSelection } from '@src/domain/match';
import type { MatchProject } from '@src/domain/match/types';
import { parseStoredDateTime, toLocalDateString } from '@src/lib/utils/local-date';

interface MatchDetailsDialogProps {
  project: MatchProject;
  onCancel: () => void;
  onSave: (project: MatchProject) => void | Promise<void>;
}

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * The details of a match already recorded: teams' names, competition,
 * number, date, time, venue and notes. The scouting itself is not touched.
 */
export function MatchDetailsDialog({ project, onCancel, onSave }: MatchDetailsDialogProps) {
  const { t } = useTranslation();
  const playedAt = parseStoredDateTime(project.metadata.playedAt);
  const hasTime = Boolean(project.metadata.playedAt && project.metadata.playedAt.includes('T'));
  const [form, setForm] = useState({
    home: getMatchTeamSelection(project, 'home').teamName ?? '',
    away: getMatchTeamSelection(project, 'away').teamName ?? '',
    competition: project.metadata.competition ?? '',
    matchNumber: project.metadata.matchNumber ?? '',
    date: playedAt ? toLocalDateString(playedAt) : '',
    time: playedAt && hasTime ? `${pad(playedAt.getHours())}:${pad(playedAt.getMinutes())}` : '',
    venue: project.metadata.venue ?? '',
    notes: project.metadata.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const save = async () => {
    const next: MatchProject = structuredClone(project);
    const homeSelection = getMatchTeamSelection(next, 'home');
    const awaySelection = getMatchTeamSelection(next, 'away');
    if (form.home.trim()) setMatchTeamSelection(next, 'home', { ...homeSelection, teamName: form.home.trim() });
    if (form.away.trim()) setMatchTeamSelection(next, 'away', { ...awaySelection, teamName: form.away.trim() });
    next.metadata.competition = form.competition.trim() || undefined;
    next.metadata.matchNumber = form.matchNumber.trim() || undefined;
    next.metadata.venue = form.venue.trim() || undefined;
    next.metadata.notes = form.notes.trim() || undefined;
    if (form.date) {
      next.metadata.playedAt = form.time
        ? new Date(`${form.date}T${form.time}:00`).toISOString()
        : form.date;
    }
    next.updatedAt = Date.now();
    setSaving(true);
    try {
      await onSave(normalizeMatchProject(next));
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof typeof form, label: string, type = 'text') => (
    <label className="match-details-dialog__field">
      <span>{label}</span>
      <input type={type} value={form[key]} onChange={(event) => set(key, event.target.value)} />
    </label>
  );

  return (
    // A click outside does not close it: the form may hold typed data.
    <Modal className="match-details-dialog__overlay" labelledBy="match-details-title" onClose={onCancel} closeOnBackdrop={false}>
      <form className="match-details-dialog" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <h2 id="match-details-title">{t('matchDetailsTitle')}</h2>
        <p className="match-details-dialog__hint">{t('matchDetailsHint')}</p>
        <div className="match-details-dialog__grid">
          {field('home', t('homeTeam'))}
          {field('away', t('awayTeam'))}
          {field('competition', t('competitionName'))}
          {field('matchNumber', t('matchNumber'))}
          {field('date', t('matchDate'), 'date')}
          {field('time', t('startTime'), 'time')}
          {field('venue', t('venue'))}
        </div>
        <label className="match-details-dialog__field">
          <span>{t('matchDetailsNotes')}</span>
          <textarea rows={3} value={form.notes} onChange={(event) => set('notes', event.target.value)} />
        </label>
        <div className="match-details-dialog__actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>{t('cancel')}</button>
          <button type="submit" className="btn-primary" disabled={saving}>{t('matchDetailsSave')}</button>
        </div>
      </form>
    </Modal>
  );
}
