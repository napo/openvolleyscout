import { useMemo } from 'react';
import { InteractiveDataTable, type InteractiveTableColumn } from './InteractiveDataTable';
import type { ItemPickerColumn } from './ItemPickerDialog';

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

/** Multi-select table: filterable, sortable, and paginated in configurable blocks. */
export function SelectableTable<T>({ label, items, columns, getId, selectedIds, onChange, emptyText }: SelectableTableProps<T>) {
  const tableColumns = useMemo<InteractiveTableColumn<T>[]>(
    () => columns.map((column) => ({
      key: column.key,
      label: column.label,
      text: column.text,
      title: column.title,
    })),
    [columns],
  );

  return (
    <InteractiveDataTable
      label={label}
      items={items}
      columns={tableColumns}
      getId={getId}
      emptyText={emptyText}
      selectedIds={selectedIds}
      onSelectionChange={(next) => onChange([...next])}
    />
  );
}
