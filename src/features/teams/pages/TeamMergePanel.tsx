// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from 'react';
import type { ArchivedTeam } from '@src/domain/team/types';
import { ActionIcon } from '@src/components/ActionIcon';
import { useTranslation } from '@src/i18n';
import type { SimilarTeamGroup, TeamMergeComparison } from '../model/team-merge';
import './team-merge-panel.css';

interface TeamMergePanelProps {
  similarGroups: readonly SimilarTeamGroup[];
  competitionsByTeamId: ReadonlyMap<string, string[]>;
  comparison: TeamMergeComparison | null;
  isBusy: boolean;
  onComparePair: (teamA: ArchivedTeam, teamB: ArchivedTeam) => void;
  onBackToGroups: () => void;
  onMerge: (keepId: string, discardId: string) => void;
  onSaveDistinction: (updates: Array<{ id: string; name: string; club: string }>) => void;
  onClose: () => void;
}

export function TeamMergePanel({
  similarGroups,
  competitionsByTeamId,
  comparison,
  isBusy,
  onComparePair,
  onBackToGroups,
  onMerge,
  onSaveDistinction,
  onClose,
}: TeamMergePanelProps) {
  const { t } = useTranslation();
  const [keepSide, setKeepSide] = useState<'A' | 'B'>('A');
  const [groupPickedIds, setGroupPickedIds] = useState<Record<string, string[]>>({});
  const [nameA, setNameA] = useState('');
  const [clubA, setClubA] = useState('');
  const [nameB, setNameB] = useState('');
  const [clubB, setClubB] = useState('');

  useEffect(() => {
    if (!comparison) return;
    setKeepSide('A');
    setNameA(comparison.teamA.name);
    setClubA(comparison.teamA.club ?? '');
    setNameB(comparison.teamB.name);
    setClubB(comparison.teamB.club ?? '');
  }, [comparison]);

  const toggleGroupPick = (groupId: string, teamId: string) => {
    setGroupPickedIds((prev) => {
      const current = prev[groupId] ?? [];
      if (current.includes(teamId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== teamId) };
      }
      const next = [...current, teamId].slice(-2);
      return { ...prev, [groupId]: next };
    });
  };

  return (
    <section className="team-merge" aria-label={t('teamMergeTitle')}>
      <header className="team-merge__header">
        <div>
          <h2>{t('teamMergeTitle')}</h2>
          <p className="team-merge__meta">{t('teamMergeSubtitle')}</p>
        </div>
        <div className="team-merge__actions">
          {comparison && similarGroups.length > 0 ? (
            <button type="button" className="btn-secondary btn-small" disabled={isBusy} onClick={onBackToGroups}>
              {t('teamMergeBackToGroups')}
            </button>
          ) : null}
          <button type="button" className="btn-secondary btn-small" disabled={isBusy} onClick={onClose}>
            {t('cancel')}
          </button>
        </div>
      </header>

      {!comparison ? (
        <div className="team-merge__groups">
          {similarGroups.length === 0 ? (
            <p className="team-merge__meta">{t('teamMergeNoSimilar')}</p>
          ) : (
            similarGroups.map((group) => {
              const picked = groupPickedIds[group.id] ?? (group.teams.length === 2 ? [group.teams[0].id, group.teams[1].id] : []);
              const pairA = group.teams.find((tm) => tm.id === picked[0]);
              const pairB = group.teams.find((tm) => tm.id === picked[1]);
              return (
                <div key={group.id} className="team-merge__group">
                  <div className="team-merge__group-items">
                    {group.teams.map((tm) => {
                      const comps = competitionsByTeamId.get(tm.id) ?? [];
                      return (
                        <label key={tm.id} className="team-merge__chip">
                          {group.teams.length > 2 ? (
                            <input
                              type="checkbox"
                              checked={picked.includes(tm.id)}
                              onChange={() => toggleGroupPick(group.id, tm.id)}
                            />
                          ) : null}
                          <strong>{tm.name}</strong>
                          <span>({tm.teamCode}{comps.length ? ` - ${comps.join(', ')}` : ''})</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="team-merge__actions">
                    <button
                      type="button"
                      className="btn-primary btn-small"
                      disabled={isBusy || !pairA || !pairB}
                      onClick={() => pairA && pairB && onComparePair(pairA, pairB)}
                    >
                      {t('teamMergeCompare')}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <>
          <div className={`team-merge__verdict ${comparison.verdict === 'duplicate' ? 'is-duplicate' : 'is-needs-info'}`} role="status">
            {comparison.verdict === 'duplicate'
              ? t('teamMergeDuplicateNotice', {
                sharedPlayers: comparison.sharedPlayers.length,
                minRoster: Math.min(comparison.rosterA.length, comparison.rosterB.length),
                overlappingMatches: comparison.overlappingMatches.length,
              })
              : t('teamMergeNeedsInfoNotice', {
                sharedPlayers: comparison.sharedPlayers.length,
                overlappingMatches: comparison.overlappingMatches.length,
              })}
          </div>

          <div className="team-merge__compare-grid">
            {([
              {
                side: 'A' as const,
                team: comparison.teamA,
                roster: comparison.rosterA,
                onlyHere: comparison.onlyInA,
                matches: comparison.matchesA,
                comps: comparison.competitionsA,
                nameVal: nameA,
                setNameVal: setNameA,
                clubVal: clubA,
                setClubVal: setClubA,
              },
              {
                side: 'B' as const,
                team: comparison.teamB,
                roster: comparison.rosterB,
                onlyHere: comparison.onlyInB,
                matches: comparison.matchesB,
                comps: comparison.competitionsB,
                nameVal: nameB,
                setNameVal: setNameB,
                clubVal: clubB,
                setClubVal: setClubB,
              },
            ]).map((entry) => (
              <div key={entry.team.id} className="team-merge__card">
                <label className="team-merge__actions">
                  <input
                    type="radio"
                    name="team-merge-keep"
                    checked={keepSide === entry.side}
                    onChange={() => setKeepSide(entry.side)}
                  />
                  <h3>{entry.team.name}</h3>
                </label>
                <p className="team-merge__meta">
                  {t('teamLibraryCode')}: <strong>{entry.team.teamCode}</strong>
                </p>
                <p className="team-merge__meta">
                  {t('competition')}: <strong>{entry.comps.length ? entry.comps.join(', ') : t('notSpecified')}</strong>
                </p>
                <p className="team-merge__meta">
                  {t('matches')}: <strong>{entry.matches.length}</strong> | {t('players')}: <strong>{entry.roster.length}</strong>
                </p>
                {entry.onlyHere.length > 0 ? (
                  <p className="team-merge__meta">
                    {t('teamMergeUniquePlayers')}: {entry.onlyHere.slice(0, 5).map((p) => `#${p.jerseyNumber} ${p.lastName}`).join(', ')}
                    {entry.onlyHere.length > 5 ? ` (+${entry.onlyHere.length - 5})` : ''}
                  </p>
                ) : null}
                {comparison.verdict === 'needs_info' ? (
                  <div className="team-merge__fields">
                    <label>
                      {t('teamName')}
                      <input value={entry.nameVal} onChange={(e) => entry.setNameVal(e.target.value)} />
                    </label>
                    <label>
                      {t('club')}
                      <input value={entry.clubVal} onChange={(e) => entry.setClubVal(e.target.value)} />
                    </label>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="team-merge__actions">
            <button
              type="button"
              className="btn-primary btn-small"
              disabled={isBusy}
              onClick={() => {
                const keepId = keepSide === 'A' ? comparison.teamA.id : comparison.teamB.id;
                const discardId = keepSide === 'A' ? comparison.teamB.id : comparison.teamA.id;
                onMerge(keepId, discardId);
              }}
            >
              <ActionIcon name="manage" />
              {comparison.verdict === 'duplicate'
                ? t('teamMergeConfirmDuplicate', {
                  keep: keepSide === 'A' ? comparison.teamA.name : comparison.teamB.name,
                })
                : t('teamMergeConfirmAnyway', {
                  keep: keepSide === 'A' ? comparison.teamA.name : comparison.teamB.name,
                })}
            </button>
            {comparison.verdict === 'needs_info' ? (
              <button
                type="button"
                className="btn-secondary btn-small"
                disabled={isBusy || !nameA.trim() || !nameB.trim()}
                onClick={() => onSaveDistinction([
                  { id: comparison.teamA.id, name: nameA.trim(), club: clubA.trim() },
                  { id: comparison.teamB.id, name: nameB.trim(), club: clubB.trim() },
                ])}
              >
                {t('teamMergeSaveSeparate')}
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
