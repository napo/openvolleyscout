import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { ActionIcon } from '@src/components/ActionIcon';
import { InteractiveDataTable, type InteractiveTableColumn } from '@src/components/InteractiveDataTable';
import { LoadingProgressBanner, type LoadProgressState } from '@src/components/LoadingProgressBanner';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import {
  createOpponentReport,
  duplicateOpponentReport,
  isAbandonedOpponentReportDraft,
  type OpponentReport,
  type OpponentReportTeamRef,
} from '@src/domain/opponent-report/types';
import { opponentReportRepository } from '@src/infrastructure/repositories';
import { formatDisplayDate } from '@src/lib/utils/local-date';
import './opponent-reports.css';

const newReportId = () => `opponent-report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface NewReportState {
  /** Set by the Teams page: start a report on this team right away. */
  opponent?: OpponentReportTeamRef;
}

/** The archive of opponent reports: create, open, duplicate, delete. */
export function OpponentReportsPage() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [reports, setReports] = useState<OpponentReport[] | null>(null);
  const [loadProgress, setLoadProgress] = useState<LoadProgressState | null>(null);
  // React's development double effects must not create the report twice.
  const startedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = () => {
    void opponentReportRepository.listWithProgress((progress) => {
      if (mountedRef.current) setLoadProgress(progress);
    }).then(async (all) => {
      // Drop reports opened with "Create tactical report" and left untouched.
      const abandoned = all.filter(isAbandonedOpponentReportDraft);
      await Promise.all(abandoned.map((report) => opponentReportRepository.delete(report.id)));
      if (!mountedRef.current) return;
      setReports(all.filter((report) => !isAbandonedOpponentReportDraft(report)));
      setLoadProgress(null);
    });
  };

  const createReport = async (opponent?: OpponentReportTeamRef) => {
    const report = createOpponentReport({
      id: newReportId(),
      title: opponent ? t('opponentReportDefaultTitle', { team: opponent.name }) : t('opponentReportUntitled'),
      opponent: opponent ?? { name: '' },
    });
    await opponentReportRepository.save(report);
    navigate(`/opponent-reports/${report.id}`, { replace: Boolean(opponent), state: { preparing: true } });
  };

  useEffect(() => {
    const opponent = (location.state as NewReportState | null)?.opponent;
    if (startedRef.current) return;
    startedRef.current = true;
    if (opponent) {
      void createReport(opponent);
      return;
    }
    load();
    // Runs once per visit: the Teams page passes the opponent in the navigation state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const duplicate = async (report: OpponentReport) => {
    await opponentReportRepository.save(duplicateOpponentReport(report, newReportId(), t('opponentReportCopyTitle', { title: report.title })));
    load();
  };

  const remove = async (report: OpponentReport) => {
    if (!window.confirm(t('opponentReportDeleteConfirm', { title: report.title }))) return;
    await opponentReportRepository.delete(report.id);
    load();
  };

  const removeMany = async (selected: OpponentReport[], clearSelection: () => void) => {
    if (selected.length === 0) return;
    if (!window.confirm(t('tableDeleteSelectedConfirm', { count: selected.length }))) return;
    for (const report of selected) {
      await opponentReportRepository.delete(report.id);
    }
    clearSelection();
    load();
  };

  return (
    <AppPageLayout
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      className="app-page-card opponent-reports"
      headerClassName="app-page-card__header"
      contentClassName="app-page-card__content"
      header={(
        <div className="app-page-card__header-copy">
          <h1 className="app-page-card__title">{t('opponentReports')}</h1>
          <p className="app-page-card__description">{t('opponentReportsDescription')}</p>
        </div>
      )}
    >
      <div className="opponent-reports__toolbar">
        <button type="button" className="btn-primary" onClick={() => void createReport()}>
          <ActionIcon name="add" />{t('opponentReportNew')}
        </button>
      </div>
      {reports === null ? (
        <LoadingProgressBanner progress={loadProgress} />
      ) : (
        <InteractiveDataTable
          label={t('opponentReports')}
          items={reports}
          getId={(report) => report.id}
          emptyText={t('opponentReportsEmpty')}
          defaultSortKey="updatedAt"
          defaultSortDir="desc"
          columns={[
            {
              key: 'title',
              label: t('tableColTitle'),
              text: (report) => report.title || t('opponentReportUntitled'),
              render: (report) => (
                <button type="button" className="teams-library__name" onClick={() => navigate(`/opponent-reports/${report.id}`)}>
                  {report.title || t('opponentReportUntitled')}
                </button>
              ),
            },
            {
              key: 'opponent',
              label: t('tableColOpponent'),
              text: (report) => report.opponent.name || t('opponentReportNoOpponent'),
            },
            {
              key: 'matches',
              label: t('matches'),
              text: (report) => String(report.matchIds.length),
              sortValue: (report) => report.matchIds.length,
            },
            {
              key: 'updatedAt',
              label: t('tableColUpdated'),
              text: (report) => formatDisplayDate(new Date(report.updatedAt).toISOString()),
              sortValue: (report) => report.updatedAt,
            },
          ] satisfies InteractiveTableColumn<OpponentReport>[]}
          actionsLabel={t('teamLibraryActions')}
          renderBulkActions={(selected, clearSelection) => (
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => void removeMany(selected, clearSelection)}
            >
              <ActionIcon name="delete" />{t('tableDeleteSelected', { count: selected.length })}
            </button>
          )}
          renderActions={(report) => (
            <>
              <button type="button" className="btn-primary btn-small" onClick={() => navigate(`/opponent-reports/${report.id}`)}>
                {t('opponentReportTitle') ? t('editTeam') : 'Open'}
              </button>
              <button type="button" className="btn-secondary btn-small" onClick={() => void duplicate(report)}>
                <ActionIcon name="copy" />{t('opponentReportDuplicate')}
              </button>
              <button type="button" className="btn-secondary btn-small" onClick={() => void remove(report)}>
                <ActionIcon name="delete" />{t('opponentReportDelete')}
              </button>
            </>
          )}
        />
      )}
    </AppPageLayout>
  );
}
