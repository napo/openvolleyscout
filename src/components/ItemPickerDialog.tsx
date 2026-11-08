import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@src/i18n';
import './item-picker-dialog.css';

export interface ItemPickerColumn<T> {
  key: string;
  label: string;
  /** Text shown in the cell; also what the search matches. */
  text: (item: T) => string;
}

interface ItemPickerDialogProps<T> {
  title: string;
  description?: string;
  items: readonly T[];
  columns: readonly ItemPickerColumn<T>[];
  getId: (item: T) => string;
  /** Shown first and highlighted ("last used"). */
  suggestedId?: string | null;
  emptyText: string;
  onPick: (item: T) => void;
  onClose: () => void;
}

const normalise = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Suggested item first; then keep the rows where every search word appears in some column. */
export function filterPickerItems<T>(items: readonly T[], columns: readonly ItemPickerColumn<T>[], getId: (item: T) => string, suggestedId: string | null | undefined, query: string): T[] {
  const ordered = suggestedId
    ? [...items.filter((item) => getId(item) === suggestedId), ...items.filter((item) => getId(item) !== suggestedId)]
    : [...items];
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (!words.length) return ordered;
  return ordered.filter((item) => {
    const haystack = normalise(columns.map((column) => column.text(item)).join(' '));
    return words.every((word) => haystack.includes(word));
  });
}

/** Searchable, vertically scrolling table to pick one item (a match, a team) from a long list. */
export function ItemPickerDialog<T>({ title, description, items, columns, getId, suggestedId, emptyText, onPick, onClose }: ItemPickerDialogProps<T>) {
  const { t } = useTranslation();
  const titleId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const rows = useMemo(() => filterPickerItems(items, columns, getId, suggestedId, query), [items, columns, getId, suggestedId, query]);

  return (
    <div className="item-picker" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
      <div className="item-picker__backdrop" onClick={onClose} />
      <section className="item-picker__panel">
        <header className="item-picker__header">
          <div>
            <h2 id={titleId} className="item-picker__title">{title}</h2>
            {description ? <p className="item-picker__description">{description}</p> : null}
          </div>
          <button type="button" className="item-picker__close" onClick={onClose} aria-label={t('pickerClose')} title={t('pickerClose')}>✕</button>
        </header>
        <input
          ref={searchRef}
          type="search"
          className="item-picker__search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && rows[0]) onPick(rows[0]); }}
          placeholder={t('pickerSearchPlaceholder')}
          aria-label={t('pickerSearchPlaceholder')}
        />
        <p className="item-picker__count" role="status">{t('pickerResultCount', { shown: rows.length, total: items.length })}</p>
        <div className="item-picker__scroll" tabIndex={0}>
          <table className="item-picker__table">
            <thead>
              <tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const id = getId(item);
                const suggested = id === suggestedId;
                return (
                  <tr key={id} className={suggested ? 'is-suggested' : undefined}>
                    {columns.map((column, index) => (
                      <td key={column.key}>
                        {index === 0 ? (
                          <button type="button" className="item-picker__pick" onClick={() => onPick(item)}>
                            {column.text(item)}
                            {suggested ? <span className="item-picker__badge">{t('pickerLastUsed')}</span> : null}
                          </button>
                        ) : column.text(item)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="item-picker__empty">{items.length ? t('pickerNoResults') : emptyText}</p> : null}
        </div>
      </section>
    </div>
  );
}
