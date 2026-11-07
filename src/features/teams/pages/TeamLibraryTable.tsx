import { useMemo, useState } from 'react';
import type { ArchivedTeam } from '@src/domain/team/types';
import { ActionIcon } from '@src/components/ActionIcon';
import { useTranslation, type TranslationKey } from '@src/i18n';
import { queryTeamLibrary, TEAM_LIBRARY_COLUMNS, teamLibraryValue, type TeamLibraryColumn } from '../model/team-library';

const COLUMN_LABELS: Record<TeamLibraryColumn, TranslationKey> = {
  name: 'teamName', teamCode: 'teamLibraryCode', headCoach: 'teamLibraryHeadCoach', assistantCoach: 'teamLibraryAssistantCoach',
};

export function TeamLibraryTable({ teams, selectedId, onSelect, onStudy, onReport, onDelete, onNew }: {
  onNew: () => void; teams: ArchivedTeam[]; selectedId: string | null;
  onSelect: (team: ArchivedTeam) => void; onStudy: (team: ArchivedTeam) => void;
  onReport: (team: ArchivedTeam) => void; onDelete: (team: ArchivedTeam) => void;
}) {
  const { t, locale } = useTranslation();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ column: TeamLibraryColumn; direction: 'ascending' | 'descending' }>({ column: 'name', direction: 'ascending' });
  const visible = useMemo(() => queryTeamLibrary(teams, query, sort.column, sort.direction, locale), [teams, query, sort, locale]);
  return <section className="teams-library" aria-labelledby="team-library-heading">
    <div className="teams-library__header">
      <div><h2 id="team-library-heading">{t('teamLibrary')}</h2><p className="teams-sidebar__meta" role="status">{t('teamLibraryCount', { visible: visible.length, total: teams.length })}</p></div>
      <button type="button" className="btn-primary teams-library__new" onClick={onNew}><ActionIcon name="add" />{t('newTeam')}</button>
      <label className="teams-library__search"><span>{t('teamLibrarySearch')}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('teamLibrarySearchHint')} /></label>
    </div>
    {teams.length === 0 ? <p className="teams-sidebar__empty">{t('noArchivedTeams')}</p> : <div className="teams-library__scroll" role="region" aria-label={t('teamLibrary')} tabIndex={0}>
      <table className="teams-library__table">
        <thead><tr>{TEAM_LIBRARY_COLUMNS.map((column) => <th key={column} scope="col" aria-sort={sort.column === column ? sort.direction : 'none'}><button type="button" onClick={() => setSort({ column, direction: sort.column === column && sort.direction === 'ascending' ? 'descending' : 'ascending' })} title={t('teamLibrarySort', { column: t(COLUMN_LABELS[column]) })}>{t(COLUMN_LABELS[column])}<span aria-hidden="true">{sort.column === column ? (sort.direction === 'ascending' ? ' ↑' : ' ↓') : ' ↕'}</span></button></th>)}</tr></thead>
        {visible.map((team) => <tbody key={team.id} className={selectedId === team.id ? 'is-active' : undefined}><tr>
          <th scope="row"><button type="button" className="teams-library__name" onClick={() => onSelect(team)} aria-current={selectedId === team.id ? 'true' : undefined}>{team.name}</button></th>
          {TEAM_LIBRARY_COLUMNS.slice(1).map((column) => <td key={column}>{teamLibraryValue(team, column) || <span className="teams-library__missing" aria-label={t('notSpecified')}>—</span>}</td>)}
          </tr><tr className="teams-library__action-row"><td colSpan={4}><div className="teams-library__actions" role="group" aria-label={`${t('teamLibraryActions')}: ${team.name}`}>
            <button type="button" onClick={() => onSelect(team)} title={t('editTeam')} aria-label={t('teamLibraryEdit', { name: team.name })}><ActionIcon name="edit" />{t('editTeam')}</button>
            <button type="button" onClick={() => onStudy(team)} title={t('teamDataStudy')} aria-label={t('teamDataStudyAriaLabel', { name: team.name })}><ActionIcon name="preview" />{t('teamDataStudy')}</button>
            <button type="button" onClick={() => onReport(team)} title={t('opponentReportFromTeam')} aria-label={t('teamLibraryReport', { name: team.name })}><ActionIcon name="pdf" />{t('opponentReportFromTeam')}</button>
            <button type="button" className="teams-library__delete" onClick={() => onDelete(team)} title={t('deleteTeamFromLibrary')} aria-label={t('deleteTeamAriaLabel', { name: team.name })}><ActionIcon name="delete" />{t('deleteTeamFromLibrary')}</button>
          </div></td>
        </tr></tbody>)}{visible.length === 0 ? <tbody><tr><td colSpan={4} className="teams-library__empty">{t('teamLibraryNoResults')}</td></tr></tbody> : null}
      </table>
    </div>}
  </section>;
}
