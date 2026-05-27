import { useState } from 'react';
import type { RosterExportFormat } from '../types';
import { useTranslation } from '@src/i18n';

type ExportScope = 'single' | 'all';

type RosterExportPanelProps = {
  teams: Array<{ id: string; name: string }>;
  /** Pre-selected team id. If provided, scope defaults to 'single'. */
  defaultTeamId?: string;
  onClose: () => void;
  onExport: (format: RosterExportFormat, scope: ExportScope, teamId: string | undefined) => void;
};

export function RosterExportPanel({ teams, defaultTeamId, onClose, onExport }: RosterExportPanelProps) {
  const { t } = useTranslation();

  const [format, setFormat] = useState<RosterExportFormat>('json');
  const [scope, setScope] = useState<ExportScope>(defaultTeamId ? 'single' : 'all');
  const [teamId, setTeamId] = useState<string>(defaultTeamId ?? teams[0]?.id ?? '');

  const canExport = scope === 'all' ? teams.length > 0 : !!teamId;

  const handleExport = () => {
    if (!canExport) return;
    onExport(format, scope, scope === 'single' ? teamId : undefined);
  };

  return (
    <div className="roster-modal" role="dialog" aria-modal="true" aria-labelledby="roster-export-title">
      <div className="roster-modal__backdrop" onClick={onClose} />
      <section className="roster-modal__panel">
        <header className="roster-modal__header">
          <div>
            <h3 id="roster-export-title" className="roster-modal__title">{t('exportAllRosters')}</h3>
            <p className="roster-modal__help">{t('exportRosterHelp')}</p>
          </div>
          <button type="button" className="btn-secondary btn-small roster-modal__close" onClick={onClose}>
            {t('cancel')}
          </button>
        </header>

        <div className="roster-modal__body">
          <fieldset className="roster-modal__field-set">
            <legend className="form-label">{t('exportScope')}</legend>
            <label className="form-radio">
              <input
                type="radio"
                name="roster-export-scope"
                value="all"
                checked={scope === 'all'}
                onChange={() => setScope('all')}
              />
              <span>{t('exportAllTeams')}</span>
            </label>
            <label className="form-radio">
              <input
                type="radio"
                name="roster-export-scope"
                value="single"
                checked={scope === 'single'}
                onChange={() => setScope('single')}
                disabled={teams.length === 0}
              />
              <span>{t('exportSingleTeam')}</span>
            </label>
          </fieldset>

          {scope === 'single' && (
            <div className="roster-modal__select-group">
              <label className="form-label" htmlFor="roster-export-team-select">
                {t('exportSelectTeam')}
              </label>
              <select
                id="roster-export-team-select"
                className="form-select"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
          )}

          <fieldset className="roster-modal__field-set">
            <legend className="form-label">{t('exportFormat')}</legend>
            <label className="form-radio">
              <input
                type="radio"
                name="roster-export-format"
                value="json"
                checked={format === 'json'}
                onChange={() => setFormat('json')}
              />
              <span>{t('exportFormatJson')}</span>
            </label>
            <label className="form-radio">
              <input
                type="radio"
                name="roster-export-format"
                value="csv"
                checked={format === 'csv'}
                onChange={() => setFormat('csv')}
              />
              <span>{t('exportFormatCsv')}</span>
            </label>
          </fieldset>
        </div>

        <footer className="roster-modal__footer">
          <div className="roster-modal__actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('cancel')}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleExport}
              disabled={!canExport}
            >
              {t('downloadRoster')}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
