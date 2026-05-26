import { useTranslation } from '@src/i18n';
import type { DataVolleyImportPreview as DataVolleyImportPreviewModel } from './types';

interface DataVolleyImportPreviewProps {
  preview: DataVolleyImportPreviewModel;
  fileName?: string;
  isImporting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function formatSetScore(set: DataVolleyImportPreviewModel['sets'][number]): string {
  if (!set.score) return '-';
  return `${set.score.home}-${set.score.away}`;
}

function getRosterChangeLabel(
  preview: DataVolleyImportPreviewModel['teamPersistence'][number],
  t: ReturnType<typeof useTranslation>['t'],
): string {
  const { playersAdded, playersUpdated, playersUnchanged } = preview.rosterChanges;
  if (playersAdded === 0 && playersUpdated === 0) {
    return playersUnchanged > 0 ? t('dataVolleyNoRosterChanges') : t('dataVolleyNoImportedPlayers');
  }

  return t('dataVolleyRosterChangeCounts', {
    added: playersAdded,
    updated: playersUpdated,
  });
}

export function DataVolleyImportPreview({
  preview,
  fileName,
  isImporting = false,
  onConfirm,
  onCancel,
}: DataVolleyImportPreviewProps) {
  const { t } = useTranslation();
  const visibleWarnings = preview.warnings.slice(0, 6);

  return (
    <section className="datavolley-import-preview" aria-label={t('dataVolleyImportPreview')}>
      <div className="datavolley-import-preview__header">
        <div>
          <h2 className="datavolley-import-preview__title">{t('dataVolleyImportPreview')}</h2>
          {fileName ? (
            <p className="datavolley-import-preview__file">{fileName}</p>
          ) : null}
        </div>
        <div className="datavolley-import-preview__score">
          {preview.score.homeSets}-{preview.score.awaySets}
        </div>
      </div>

      <div className="datavolley-import-preview__teams">
        <span>{preview.homeTeamName}</span>
        <span>{t('vs')}</span>
        <span>{preview.awayTeamName}</span>
      </div>

      <dl className="datavolley-import-preview__metrics">
        <div>
          <dt>{t('dataVolleyImportSets')}</dt>
          <dd>{preview.sets.filter((set) => set.played).length || preview.sets.length}</dd>
        </div>
        <div>
          <dt>{t('dataVolleyImportPlayers')}</dt>
          <dd>{preview.playerCounts.home + preview.playerCounts.away}</dd>
        </div>
        <div>
          <dt>{t('dataVolleyImportActions')}</dt>
          <dd>{preview.parsedActionsCount}</dd>
        </div>
        <div>
          <dt>{t('dataVolleyImportDiagnostics')}</dt>
          <dd>{preview.errorsCount} / {preview.warningsCount}</dd>
        </div>
      </dl>

      {preview.sets.length > 0 ? (
        <div className="datavolley-import-preview__sets">
          {preview.sets.map((set) => (
            <span key={set.setNumber} className="datavolley-import-preview__set">
              {set.setNumber}: {formatSetScore(set)}
            </span>
          ))}
        </div>
      ) : null}

      {preview.teamPersistence.length > 0 ? (
        <div className="datavolley-import-preview__team-persistence">
          {preview.teamPersistence.map((team) => (
            <article key={team.side} className="datavolley-import-preview__team-plan">
              <div>
                <span className="datavolley-import-preview__team-side">
                  {team.side === 'home' ? t('homeTeam') : t('awayTeam')}
                </span>
                <strong>{team.teamName}</strong>
              </div>
              <span className={`datavolley-import-preview__team-action datavolley-import-preview__team-action--${team.action}`}>
                {team.action === 'create'
                  ? t('dataVolleyTeamWillBeCreated')
                  : t('dataVolleyTeamWillBeUpdated', { name: team.existingTeamName ?? team.teamName })}
              </span>
              <span className="datavolley-import-preview__team-roster">
                {t('dataVolleyRosterChangesDetected', { changes: getRosterChangeLabel(team, t) })}
              </span>
            </article>
          ))}
        </div>
      ) : null}

      {visibleWarnings.length > 0 ? (
        <div className="datavolley-import-preview__warnings">
          {visibleWarnings.map((warning, index) => (
            <p key={`${warning.line ?? 'file'}-${warning.code ?? index}`}>
              <strong>{warning.severity}</strong>
              {warning.line ? ` L${warning.line}` : ''}: {warning.message}
            </p>
          ))}
          {preview.warnings.length > visibleWarnings.length ? (
            <p>{t('dataVolleyImportMoreDiagnostics', { count: preview.warnings.length - visibleWarnings.length })}</p>
          ) : null}
        </div>
      ) : null}

      <div className="datavolley-import-preview__actions">
        <button
          type="button"
          className="btn-secondary btn-small"
          onClick={onCancel}
          disabled={isImporting}
        >
          {t('cancelImport')}
        </button>
        <button
          type="button"
          className="btn-primary btn-small"
          onClick={onConfirm}
          disabled={isImporting || preview.errorsCount > 0}
        >
          {isImporting ? t('importingDataVolley') : t('confirmImport')}
        </button>
      </div>
    </section>
  );
}
