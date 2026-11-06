import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import {
  createOpponentReport,
  duplicateOpponentReport,
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
  // React's development double effects must not create the report twice.
  const startedRef = useRef(false);

  const load = () => {
    void opponentReportRepository.list().then(setReports);
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
          {t('opponentReportNew')}
        </button>
      </div>
      {reports === null ? (
        <p>{t('loading')}</p>
      ) : reports.length === 0 ? (
        <p className="opponent-reports__empty">{t('opponentReportsEmpty')}</p>
      ) : (
        <ul className="opponent-reports__list">
          {reports.map((report) => (
            <li key={report.id} className="opponent-reports__item">
              <button type="button" className="opponent-reports__open" onClick={() => navigate(`/opponent-reports/${report.id}`)}>
                <strong>{report.title || t('opponentReportUntitled')}</strong>
                <span>
                  {[
                    report.opponent.name || t('opponentReportNoOpponent'),
                    t('opponentReportMatchCount', { count: report.matchIds.length }),
                    t('opponentReportUpdatedAt', { date: formatDisplayDate(new Date(report.updatedAt).toISOString()) }),
                  ].join(' · ')}
                </span>
              </button>
              <button type="button" className="btn-secondary btn-small" onClick={() => void duplicate(report)}>
                {t('opponentReportDuplicate')}
              </button>
              <button type="button" className="btn-secondary btn-small" onClick={() => void remove(report)}>
                {t('opponentReportDelete')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </AppPageLayout>
  );
}
