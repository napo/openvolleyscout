// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from '@src/i18n';

export interface SetterCandidate {
  id: string;
  label: string;
}

export interface SetterAssignmentDialogProps {
  open: boolean;
  candidates: readonly SetterCandidate[];
  selectedSetterId: string;
  onSelectSetter: (playerId: string) => void;
  onConfirm: () => void;
}

export function SetterAssignmentDialog({
  open,
  candidates,
  selectedSetterId,
  onSelectSetter,
  onConfirm,
}: SetterAssignmentDialogProps) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div className="scouting-screen__setter-assignment-overlay" role="dialog" aria-modal="true">
      <div className="scouting-screen__setter-assignment-dialog">
        <strong>{t('newSetterPromptTitle')}</strong>
        <label className="scouting-screen__correction-field">
          <span>{t('newSetterLabel')}</span>
          <select
            value={selectedSetterId}
            onChange={(event) => onSelectSetter(event.target.value)}
          >
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
              </option>
            ))}
          </select>
        </label>
        <div className="scouting-screen__correction-actions">
          <button
            type="button"
            className="btn-primary btn-small"
            onClick={onConfirm}
            disabled={!selectedSetterId}
          >
            {t('confirmNewSetter')}
          </button>
        </div>
      </div>
    </div>
  );
}
