import { useMemo } from 'react';
import type { ArchivedTeam } from '@src/domain/team/types';
import { ActionIcon } from '@src/components/ActionIcon';
import { InteractiveDataTable, type InteractiveTableColumn } from '@src/components/InteractiveDataTable';
import { useTranslation, type TranslationKey } from '@src/i18n';
import { TEAM_LIBRARY_COLUMNS, teamLibraryValue, type TeamLibraryColumn } from '../model/team-library';

const COLUMN_LABELS: Record<TeamLibraryColumn, TranslationKey> = {
  name: 'teamName',
  teamCode: 'teamLibraryCode',
  headCoach: 'teamLibraryHeadCoach',
  assistantCoach: 'teamLibraryAssistantCoach',
};

export function TeamLibraryTable({
  teams,
  selectedId,
  onSelect,
  onStudy,
  onReport,
  onDelete,
  onDeleteMany,
  onNew,
}: {
  onNew: () => void;
  teams: ArchivedTeam[];
  selectedId: string | null;
  onSelect: (team: ArchivedTeam) => void;
  onStudy: (team: ArchivedTeam) => void;
  onReport: (team: ArchivedTeam) => void;
  onDelete: (team: ArchivedTeam) => void;
  onDeleteMany?: (teams: ArchivedTeam[]) => void;
}) {
  const { t } = useTranslation();

  const columns = useMemo<InteractiveTableColumn<ArchivedTeam>[]>(
    () => TEAM_LIBRARY_COLUMNS.map((column) => ({
      key: column,
      label: t(COLUMN_LABELS[column]),
      text: (team) => teamLibraryValue(team, column) || '-',
      render: column === 'name'
        ? (team) => (
          <button
            type="button"
            className="teams-library__name"
            onClick={() => onSelect(team)}
            aria-current={selectedId === team.id ? 'true' : undefined}
          >
            {team.name}
          </button>
        )
        : (team) => teamLibraryValue(team, column) || (
          <span className="teams-library__missing" aria-label={t('notSpecified')}>-</span>
        ),
    })),
    [t, onSelect, selectedId],
  );

  return (
    <section className="teams-library" aria-labelledby="team-library-heading">
      <div className="teams-library__header">
        <div>
          <h2 id="team-library-heading">{t('teamLibrary')}</h2>
          <p className="teams-sidebar__meta" role="status">
            {t('teamLibraryCount', { visible: teams.length, total: teams.length })}
          </p>
        </div>
        <button type="button" className="btn-primary teams-library__new" onClick={onNew}>
          <ActionIcon name="add" />{t('newTeam')}
        </button>
      </div>

      <InteractiveDataTable
        label={t('teamLibrary')}
        items={teams}
        columns={columns}
        getId={(team) => team.id}
        emptyText={t('noArchivedTeams')}
        activeId={selectedId}
        defaultSortKey="name"
        actionsLabel={t('teamLibraryActions')}
        renderBulkActions={onDeleteMany ? (selected, clearSelection) => (
          <button
            type="button"
            className="btn-secondary btn-small teams-library__delete"
            onClick={() => {
              onDeleteMany(selected);
              clearSelection();
            }}
          >
            <ActionIcon name="delete" />{t('tableDeleteSelected', { count: selected.length })}
          </button>
        ) : undefined}
        renderActions={(team) => (
          <>
            <button type="button" onClick={() => onSelect(team)} title={t('editTeam')} aria-label={t('teamLibraryEdit', { name: team.name })}>
              <ActionIcon name="edit" />{t('editTeam')}
            </button>
            <button type="button" onClick={() => onStudy(team)} title={t('teamDataStudy')} aria-label={t('teamDataStudyAriaLabel', { name: team.name })}>
              <ActionIcon name="preview" />{t('teamDataStudy')}
            </button>
            <button type="button" onClick={() => onReport(team)} title={t('opponentReportFromTeam')} aria-label={t('teamLibraryReport', { name: team.name })}>
              <ActionIcon name="pdf" />{t('opponentReportFromTeam')}
            </button>
            <button type="button" className="teams-library__delete" onClick={() => onDelete(team)} title={t('deleteTeamFromLibrary')} aria-label={t('deleteTeamAriaLabel', { name: team.name })}>
              <ActionIcon name="delete" />{t('deleteTeamFromLibrary')}
            </button>
          </>
        )}
      />
    </section>
  );
}
