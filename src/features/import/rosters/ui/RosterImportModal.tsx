import { useRef, useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { RosterImportFormat, RosterImportPayload } from '../types';
import { detectRosterImportFormat, downloadRosterCsvTemplate, parseRosterFile } from '../roster-importer';

type RosterImportModalProps = {
  onClose: () => void;
  onImport: (payload: RosterImportPayload, format: RosterImportFormat) => void;
};

export function RosterImportModal({ onClose, onImport }: RosterImportModalProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<RosterImportFormat | null>(null);
  const [preview, setPreview] = useState<RosterImportPayload | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setPreview(null);
    setFileError(null);
    setDetectedFormat(null);

    if (!file) return;

    const format = detectRosterImportFormat(file.name);
    setDetectedFormat(format);

    if (!format) {
      setFileError(t('importRosterInvalidFile'));
      return;
    }

    setIsReading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const payload = parseRosterFile(text, format);
        setPreview(payload);
      } catch {
        setFileError(t('importRosterFileReadFailed'));
      } finally {
        setIsReading(false);
      }
    };
    reader.onerror = () => {
      setFileError(t('importRosterFileReadFailed'));
      setIsReading(false);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleConfirm = () => {
    if (!preview || !detectedFormat) return;
    onImport(preview, detectedFormat);
  };

  const formatLabel = detectedFormat === 'ovs-json'
    ? t('importRosterFormatOvsJson')
    : detectedFormat === 'csv'
      ? t('importRosterFormatCsv')
      : t('importRosterFormatUnknown');

  const hasErrors = preview?.diagnostics.some((d) => d.severity === 'error') ?? false;
  const hasTeams = (preview?.teams.length ?? 0) > 0;
  const canImport = !!preview && hasTeams && !hasErrors;

  return (
    <div className="roster-modal" role="dialog" aria-modal="true" aria-labelledby="roster-import-title">
      <div className="roster-modal__backdrop" onClick={onClose} />
      <section className="roster-modal__panel">
        <header className="roster-modal__header">
          <div>
            <h3 id="roster-import-title" className="roster-modal__title">{t('importRosterTitle')}</h3>
            <p className="roster-modal__help">{t('importRosterHelp')}</p>
          </div>
          <button type="button" className="btn-secondary btn-small" onClick={onClose}>
            {t('cancel')}
          </button>
        </header>

        <div className="roster-modal__body">
          <div className="roster-modal__file-row">
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => fileInputRef.current?.click()}
            >
              {t('importRosterSelectFile')}
            </button>
            <span className="roster-modal__file-name">
              {selectedFile ? t('importRosterSelectedFile', { name: selectedFile.name }) : t('importRosterNoFile')}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv"
              className="roster-modal__file-input"
              onChange={handleFileChange}
              aria-label={t('importRosterSelectFile')}
            />
          </div>

          {detectedFormat && (
            <p className="roster-modal__format-label">
              <span className="roster-modal__label">{t('importRosterFormat')}:</span>
              <span className="roster-modal__format-value">{formatLabel}</span>
            </p>
          )}

          {fileError && (
            <p className="roster-modal__error">{fileError}</p>
          )}

          {isReading && (
            <p className="roster-modal__reading">{t('loading')}</p>
          )}

          {preview && !isReading && (
            <div className="roster-modal__preview">
              <h4 className="roster-modal__preview-title">{t('importRosterPreview')}</h4>
              {preview.teams.length === 0 ? (
                <p className="roster-modal__empty">{t('importRosterNoTeamsFound')}</p>
              ) : (
                <ul className="roster-modal__team-list">
                  {preview.teams.map((team) => (
                    <li key={team.teamName} className="roster-modal__team-item">
                      <span className="roster-modal__team-name">{team.teamName}</span>
                      <span className="roster-modal__team-count">
                        {t('importRosterPreviewPlayers', { count: team.players.length })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {preview.diagnostics.length > 0 && (
                <div className="roster-modal__diagnostics">
                  <p className="roster-modal__label">{t('importRosterDiagnostics')}:</p>
                  <ul className="roster-modal__diagnostic-list">
                    {preview.diagnostics.map((d, index) => (
                      <li
                        key={index}
                        className={`roster-modal__diagnostic roster-modal__diagnostic--${d.severity}`}
                      >
                        {d.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="roster-modal__footer">
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={downloadRosterCsvTemplate}
          >
            {t('downloadCsvTemplate')}
          </button>
          <div className="roster-modal__actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('cancel')}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleConfirm}
              disabled={!canImport}
            >
              {t('importRosterConfirm')}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
