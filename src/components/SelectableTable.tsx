import { useMemo, useState } from 'react';
import { useTranslation } from '@src/i18n';
import { filterPickerItems, type ItemPickerColumn } from './ItemPickerDialog';
import './item-picker-dialog.css';

export interface SelectableTableColumn<T> extends ItemPickerColumn<T> {
  /** Optional tooltip for the cell (e.g. the sample behind a score). */
  title?: (item: T) => string | undefined;
}

interface SelectableTableProps<T> {
  label: string;
  items: readonly T[];
  columns: readonly SelectableTableColumn<T>[];
  getId: (item: T) => string;
  selectedIds: ReadonlySet<string>;
  onChange: (selectedIds: string[]) => void;
  emptyText: string;
}

/** Multi-select version of the picker: a searchable, scrolling table with one checkbox per row. */
export function SelectableTable<T>({ label, items, columns, getId, selectedIds, onChange, emptyText }: SelectableTableProps<T>) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const rows = useMemo(() => filterPickerItems(items, columns, getId, null, query), [items, columns, getId, query]);
  const visibleIds = rows.map(getId);
  const toggle = (id: string) => onChange(selectedIds.has(id) ? [...selectedIds].filter((entry) => entry !== id) : [...selectedIds, id]);
  // Bulk actions only touch the rows the search shows.
  const selectVisible = () => onChange([...new Set([...selectedIds, ...visibleIds])]);
  const clearVisible = () => onChange([...selectedIds].filter((id) => !visibleIds.includes(id)));

  return (
    <div className="selectable-table">
      <div className="selectable-table__toolbar">
        <input
          type="search"
          className="item-picker__search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('pickerSearchPlaceholder')}
          aria-label={`${label}: ${t('pickerSearchPlaceholder')}`}
        />
        <button type="button" className="btn-secondary btn-small" onClick={selectVisible} disabled={!rows.length}>{t('tableSelectVisible')}</button>
        <button type="button" className="btn-secondary btn-small" onClick={clearVisible} disabled={!rows.length}>{t('tableClearVisible')}</button>
      </div>
      <p className="item-picker__count" role="status">
        {t('tableSelectionCount', { selected: selectedIds.size, shown: rows.length, total: items.length })}
      </p>
      <div className="item-picker__scroll selectable-table__scroll" role="region" aria-label={label} tabIndex={0}>
        <table className="item-picker__table">
          <thead>
            <tr>
              <th scope="col" className="selectable-table__check"><span className="visually-hidden">{t('tableSelectColumn')}</span></th>
              {columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const id = getId(item);
              const checked = selectedIds.has(id);
              return (
                <tr key={id} className={checked ? 'is-suggested' : undefined} onClick={() => toggle(id)}>
                  <td className="selectable-table__check">
                    <input type="checkbox" checked={checked} onChange={() => toggle(id)} onClick={(event) => event.stopPropagation()}
                      aria-label={columns[0] ? columns[0].text(item) : id} />
                  </td>
                  {columns.map((column) => <td key={column.key} title={column.title?.(item)}>{column.text(item)}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="item-picker__empty">{items.length ? t('pickerNoResults') : emptyText}</p> : null}
      </div>
    </div>
  );
}
