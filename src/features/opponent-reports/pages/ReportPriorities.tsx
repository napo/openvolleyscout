import { useState } from 'react';
import type { OpponentReport, OpponentReportKey } from '@src/domain/opponent-report/types';
import { useTranslation } from '@src/i18n';
import type { KeySuggestion } from '../model/report-keys';
import type { ViewT } from '../model/report-view';
import { automaticPriority, priorityText, reportPriorities, reorderPriorities, setReportPriorities } from '../model/report-priorities';

export function ReportPriorities({ report, suggestions, viewT, update }: {
  report: OpponentReport; suggestions: readonly KeySuggestion[]; viewT: ViewT;
  update: (change: (current: OpponentReport) => OpponentReport) => void;
}) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState<number | null>(null);
  const keys = reportPriorities(report, suggestions);
  const change = (apply: (keys: OpponentReportKey[]) => OpponentReportKey[]) => update((current) => setReportPriorities(current, apply(reportPriorities(current, suggestions))));
  const move = (from: number, to: number) => change((items) => reorderPriorities(items, from, to));
  const available = suggestions.filter((entry) => !keys.some((key) => key.id === entry.id));
  return <div className="tactical-priorities">
    <p className="opponent-report__hint">{t('priorityHelp')}</p>
    <ol className="tactical-priorities__list">
      {keys.map((key, index) => <li key={key.id} className={`tactical-priority tactical-priority--${index < 3 ? 'primary' : index < 5 ? 'secondary' : 'reserve'}`}
        onDragOver={(event) => { if (dragging !== null) event.preventDefault(); }}
        onDrop={(event) => { event.preventDefault(); if (dragging !== null) move(dragging, index); setDragging(null); }}>
        <div className="tactical-priority__heading">
          <span draggable onDragStart={(event) => { setDragging(index); event.dataTransfer.setData('text/plain', key.id); event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDragging(null)} className="tactical-priority__handle" title={t('priorityHelp')}>↕</span>
          <strong>{index + 1}. {t(index < 3 ? 'priorityPrimary' : index < 5 ? 'prioritySecondary' : 'priorityReserve')}</strong>
          <small>{t(key.source === 'custom' ? 'priorityCustom' : 'priorityAutomatic')}</small>
        </div>
        <textarea aria-label={`${index + 1}. ${t('tacticalAdviceColumn')}`} value={priorityText(key, viewT)} rows={3}
          onChange={(event) => change((items) => items.map((entry) => entry.id === key.id ? { ...entry, source: 'custom', text: event.target.value } : entry))} />
        {key.source === 'auto' && key.suggestion ? <small>{t('opponentReportKeySample', { n: key.suggestion.sample })}</small> : null}
        <div className="opponent-report__key-actions">
          <button type="button" className="btn-secondary btn-small" disabled={index === 0} aria-label={t('opponentReportMoveUp')} onClick={() => move(index, index - 1)}>↑</button>
          <button type="button" className="btn-secondary btn-small" disabled={index === keys.length - 1} aria-label={t('opponentReportMoveDown')} onClick={() => move(index, index + 1)}>↓</button>
          {index >= 3 && index < 5 ? <label><input type="checkbox" checked={key.includeInPrint !== false} onChange={(event) => change((items) => items.map((entry) => entry.id === key.id ? { ...entry, includeInPrint: event.target.checked } : entry))} /> {t('priorityPrint')}</label> : null}
          {key.source === 'custom' && (key.suggestion || suggestions.some((s) => s.id === key.id)) ? <button type="button" className="btn-secondary btn-small" onClick={() => change((items) => items.map((entry) => {
            if (entry.id !== key.id) return entry;
            const proposal = suggestions.find((s) => s.id === key.id);
            return proposal ? { ...automaticPriority(proposal), includeInPrint: entry.includeInPrint } : { ...entry, source: 'auto', text: '' };
          }))}>{t('priorityRestore')}</button> : null}
          <button type="button" className="btn-secondary btn-small" onClick={() => update((current) => ({
            ...setReportPriorities(current, reportPriorities(current, suggestions).filter((entry) => entry.id !== key.id)),
            dismissedKeyIds: [...new Set([...(current.dismissedKeyIds ?? []), key.id])],
          }))}>{t('opponentReportDelete')}</button>
        </div>
      </li>)}
    </ol>
    {keys.length < 10 ? <div className="opponent-report__key-actions">
      <button type="button" className="btn-secondary" onClick={() => change((items) => [...items, { id: `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`, source: 'custom', text: '' }])}>{t('priorityAdd')}</button>
      {available.length ? <select className="form-select" aria-label={t('priorityAutomatic')} value="" onChange={(event) => {
        const proposal = available.find((entry) => entry.id === event.target.value);
        if (proposal) change((items) => [...items, automaticPriority(proposal)]);
      }}><option value="">{t('priorityAutomatic')}</option>{available.map((s) => <option key={s.id} value={s.id}>{priorityText(automaticPriority(s), viewT)}</option>)}</select> : null}
    </div> : null}
  </div>;
}
