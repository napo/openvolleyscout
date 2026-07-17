import { getMatchTeamSnapshot } from '@src/domain/match';
import { useTranslation } from '@src/i18n';
import type { OvsBackupImportPreview as OvsBackupImportPreviewModel } from '../build-ovs-backup-preview';
import type { OvsImportPreview as OvsImportPreviewModel } from '../build-ovs-import-preview';

interface OvsBackupImportPreviewProps {
  preview: OvsBackupImportPreviewModel;
  fileName?: string;
  isImporting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onResolveMatch: (matchPreview: OvsImportPreviewModel) => void;
}

type MatchStatus = 'new' | 'clean' | 'needs_attention';

function getMatchStatus(preview: OvsImportPreviewModel): MatchStatus {
  if (preview.kind === 'new_match') {
    return 'new';
  }
  if (preview.kind === 'no_common_base') {
    return 'needs_attention';
  }
  return preview.result.status === 'merged' ? 'clean' : 'needs_attention';
}

function getMatchLabel(preview: OvsImportPreviewModel): string {
  const project = preview.kind === 'new_match' ? preview.project : preview.local;
  const home = getMatchTeamSnapshot(project, 'home').name;
  const away = getMatchTeamSnapshot(project, 'away').name;
  return `${home} – ${away}`;
}

export function OvsBackupImportPreview({
  preview,
  fileName,
  isImporting = false,
  onConfirm,
  onCancel,
  onResolveMatch,
}: OvsBackupImportPreviewProps) {
  const { t } = useTranslation();

  const newCount = preview.matchPreviews.filter((p) => getMatchStatus(p) === 'new').length;
  const cleanCount = preview.matchPreviews.filter((p) => getMatchStatus(p) === 'clean').length;
  const needsAttention = preview.matchPreviews.filter((p) => getMatchStatus(p) === 'needs_attention');
  const archiveConflictCount = preview.archivePreview.result.conflicts.length;

  return (
    <section className="datavolley-import-preview" aria-label={t('ovsBackupImportPreview')}>
      <div className="datavolley-import-preview__header">
        <div>
          <h2 className="datavolley-import-preview__title">{t('ovsBackupImportPreview')}</h2>
          {fileName ? <p className="datavolley-import-preview__file">{fileName}</p> : null}
        </div>
      </div>

      <p>
        {t('ovsBackupSummary', {
          newCount,
          cleanCount,
          needsAttentionCount: needsAttention.length,
        })}
      </p>

      <p>
        {archiveConflictCount > 0
          ? t('ovsBackupArchiveConflicts', { count: archiveConflictCount })
          : t('ovsBackupArchiveClean')}
      </p>

      {needsAttention.length > 0 ? (
        <div className="ovs-import-preview__divergence-list">
          {needsAttention.map((matchPreview) => (
            <article key={matchPreview.matchId} className="ovs-import-preview__divergence">
              <strong>{getMatchLabel(matchPreview)}</strong>
              <button
                type="button"
                className="btn-secondary btn-small"
                onClick={() => onResolveMatch(matchPreview)}
              >
                {t('ovsBackupResolveMatch')}
              </button>
            </article>
          ))}
        </div>
      ) : null}

      <div className="datavolley-import-preview__actions">
        <button type="button" className="btn-secondary btn-small" onClick={onCancel} disabled={isImporting}>
          {t('cancelImport')}
        </button>
        <button type="button" className="btn-primary btn-small" onClick={onConfirm} disabled={isImporting}>
          {isImporting ? t('importingDataVolley') : t('confirmImport')}
        </button>
      </div>
    </section>
  );
}
