import { useTranslation } from '@src/i18n';
import type { PlayerRole } from '@src/domain/common/enums';
import type { DataVolleyPlayerDecisions, DataVolleyTeamPersistencePreview } from '../persistence/types';

const roles: PlayerRole[] = ['setter', 'outside_hitter', 'middle_blocker', 'opposite', 'libero', 'defensive_specialist'];

export function playerReconciliationsComplete(teams: DataVolleyTeamPersistencePreview[], decisions: DataVolleyPlayerDecisions): boolean {
  return teams.every(team => (team.playerReconciliations ?? []).every(item => {
    const decision = decisions[item.key];
    return decision?.action === 'merge' ? item.candidates.some(player => player.id === decision.playerId)
      : decision?.action === 'distinct' && Boolean(decision.role || decision.birthYear?.trim() || decision.note?.trim())
        && (!decision.birthYear || /^(18|19|20)\d{2}$/.test(decision.birthYear));
  }));
}

export function PlayerReconciliation({ teams, decisions, onChange, disabled = false }: {
  teams: DataVolleyTeamPersistencePreview[];
  decisions: DataVolleyPlayerDecisions;
  onChange: (next: DataVolleyPlayerDecisions) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  if (!teams.some(team => team.playerReconciliations?.length)) return null;
  return <section className="datavolley-import-preview" aria-label={t('playerReconcileTitle')}>
    <h2>{t('playerReconcileTitle')}</h2><p>{t('playerReconcileHelp')}</p>
    {teams.flatMap(team => (team.playerReconciliations ?? []).map(item => {
      const decision = decisions[item.key];
      const update = (detail: {role?: PlayerRole; birthYear?: string; note?: string}) => onChange({...decisions, [item.key]: {...(decision?.action === 'distinct' ? decision : {action: 'distinct' as const}), ...detail}});
      return <fieldset key={item.key} disabled={disabled} className="player-reconciliation">
        <legend>{team.teamName} · #{item.imported.jerseyNumber} {item.imported.firstName} {item.imported.lastName}{item.imported.role ? ` · ${t(item.imported.role)}` : ''}</legend>
        <label>{t('playerReconcileChoice')}<select className="form-select" value={decision?.action === 'merge' ? `merge:${decision.playerId}` : decision?.action ?? ''} onChange={event => {
          const value = event.target.value;
          const next = {...decisions};
          if (!value) delete next[item.key];
          else next[item.key] = value === 'distinct' ? {action: 'distinct'} : {action: 'merge', playerId: value.slice(6)};
          onChange(next);
        }}>
          <option value="">{t('playerReconcileChoose')}</option>
          {item.candidates.map(player => <option key={player.id} value={`merge:${player.id}`}>{t('playerReconcileSame', {name: `${player.firstName} ${player.lastName}`, number: player.jerseyNumber})}{[player.role ? t(player.role) : '', player.birthYear ?? player.birthDate?.slice(0, 4), player.notes].filter(Boolean).map(detail => ` · ${detail}`).join('')}</option>)}
          <option value="distinct">{t('playerReconcileDistinct')}</option>
        </select></label>
        {decision?.action === 'distinct' ? <div className="player-reconciliation__details">
          <p>{t('playerReconcileDetailHelp')}</p>
          <label>{t('roleMarker')}<select className="form-select" value={decision.role ?? ''} onChange={event => update({role: event.target.value as PlayerRole || undefined})}><option value="">—</option>{roles.map(role => <option key={role} value={role}>{t(role)}</option>)}</select></label>
          <label>{t('playerReconcileBirthYear')}<input type="text" inputMode="numeric" pattern="(18|19|20)[0-9]{2}" maxLength={4} value={decision.birthYear ?? ''} onChange={event => update({birthYear: event.target.value})}/></label>
          <label>{t('playerReconcileNote')}<input type="text" value={decision.note ?? ''} onChange={event => update({note: event.target.value})}/></label>
        </div> : null}
      </fieldset>;
    }))}
  </section>;
}
