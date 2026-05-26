import { useState } from 'react';
import type { RosterExportFormat } from '../types';
import { useTranslation } from '@src/i18n';

type RosterExportPanelProps = {
  teamName?: string;
  allTeams?: boolean;
  onClose: () => void;
  onExport: (format: RosterExportFormat) => void;
};

export function RosterExportPanel({ teamName, allTeams = false, onClose, onExport }: RosterExportPanelProps) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<RosterExportFormat>('json');

  const title = allTeams
    ? t('exportAllRosters')
    : t('exportRosterForTeam', { name: teamName ?? '' });

  return (
    <div className="roster-export" role="dialog" aria-modal="true" aria-labelledby="roster-export-title">
      <div className="roster-export__backdrop" onClick={onClose} />
      <section className="roster-export__panel">
        <header className="roster-export__header">
          <div>
            <h3 id="roster-export-title" className="roster-export__title">{title}</h3>
            <p className="roster-export__help">{t('exportRosterHelp')}</p>
          </div>
          <button type="button" className="btn-secondary btn-small roster-export__close" onClick={onClose}>
            {t('cancel')}
          </button>
        </header>

        <fieldset className="roster-export__field-set">
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

        <footer className="roster-export__footer">
          <div className="roster-export__actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('cancel')}
            </button>
            <button type="button" className="btn-primary" onClick={() => onExport(format)}>
              {t('downloadRoster')}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
