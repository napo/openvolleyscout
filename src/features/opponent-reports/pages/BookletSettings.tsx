import type { OpponentReport, OpponentReportBooklet } from '@src/domain/opponent-report/types';
import { useTranslation } from '@src/i18n';
import type { ReportView } from '../model/report-view';
import { playerLabel } from '../model/report-keys';
import { DEFAULT_BOOKLET, type ReportBookletPlan } from '../model/report-booklet';

export function BookletSettings({ report, plan, attackers, update }: { report: OpponentReport; plan: ReportBookletPlan; attackers: ReportView['attackers']; update: (change: (report: OpponentReport) => OpponentReport) => void }) {
  const { t } = useTranslation();
  const settings = { ...DEFAULT_BOOKLET, ...report.booklet };
  const change = (patch: Partial<OpponentReportBooklet>) => update((current) => ({ ...current, booklet: { ...DEFAULT_BOOKLET, ...current.booklet, ...patch } }));
  return <section className="tactical-booklet-settings" aria-label={t('bookletFormat')}>
    <label><strong>{t('bookletFormat')}</strong><select className="form-select" value={settings.format} onChange={(event) => {
      const format = event.target.value as OpponentReportBooklet['format'];
      change({ format, ...(format !== 'custom' ? { base: format } : {}) });
    }}>
      <option value="compact">{t('bookletCompact')}</option><option value="extended">{t('bookletExtended')}</option><option value="custom">{t('bookletCustom')}</option>
    </select></label>
    <p className="opponent-report__hint">{t('bookletHelp')}</p>
    {settings.format === 'custom' ? <>
      <label>{t('bookletBase')}<select className="form-select" value={settings.base} onChange={(event) => change({ base: event.target.value as OpponentReportBooklet['base'] })}>
        <option value="compact">{t('bookletCompact')}</option><option value="extended">{t('bookletExtended')}</option>
      </select></label>
      {(['includeServe', 'includeBoardExtras'] as const).map((key) => <label key={key}><input type="checkbox" checked={settings[key]} onChange={(event) => change({ [key]: event.target.checked })} />{t(key === 'includeServe' ? 'bookletServe' : 'bookletBoardExtras')}</label>)}
    </> : null}
    <label><input type="checkbox" checked={settings.includeSecondSetter} onChange={event => change({includeSecondSetter: event.target.checked})}/>{t('bookletSecondSetter')}</label>
    {attackers.length ? <details><summary>{t('bookletAttackTextOnly')}</summary>
      <p>{t('bookletAttackTextOnlyHelp')}</p>
      {[...attackers].sort((a,b)=>(a.attempts ?? 0)-(b.attempts ?? 0) || a.player.key.localeCompare(b.player.key)).map(attacker=><label key={attacker.player.key}>
        <input type="checkbox" checked={settings.textOnlyAttackerKeys?.includes(attacker.player.key) ?? false} onChange={event=>{
          const keys=new Set(settings.textOnlyAttackerKeys ?? []);
          if(event.target.checked)keys.add(attacker.player.key);else keys.delete(attacker.player.key);
          change({textOnlyAttackerKeys:[...keys]});
        }}/>{playerLabel(attacker.player)}{attacker.attempts !== undefined ? ` · ${t('opponentReportAttackAll')}: ${attacker.attempts}` : ''}
      </label>)}
    </details> : null}
    <p role="status"><strong>{t('bookletCount', { pages: plan.pages.length, sheets: plan.sheets })}</strong>{plan.paddingPages ? <> · {t('bookletPadding', { n: plan.paddingPages })}</> : null}</p>
    <p className="opponent-report__hint">{t('bookletPrintHelp')}</p>
    {settings.format === 'compact' || settings.format === 'custom' && settings.base === 'compact' ? <p className="opponent-report__hint">{t('bookletSmall')}</p> : null}
  </section>;
}
