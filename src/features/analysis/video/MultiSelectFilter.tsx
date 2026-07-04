import type { ReactNode } from 'react';

export interface MultiSelectOption<T extends string | number> {
  value: T;
  label: ReactNode;
}

interface MultiSelectFilterProps<T extends string | number> {
  label: ReactNode;
  allLabel: string;
  selectedCountLabel: (count: number) => string;
  options: MultiSelectOption<T>[];
  selected: T[];
  onChange: (next: T[]) => void;
  disabled?: boolean;
}

export function MultiSelectFilter<T extends string | number>({
  label,
  allLabel,
  selectedCountLabel,
  options,
  selected,
  onChange,
  disabled,
}: MultiSelectFilterProps<T>) {
  const selectedSet = new Set(selected);
  const summary = selected.length === 0
    ? allLabel
    : selected.length === 1
      ? options.find((option) => option.value === selected[0])?.label ?? String(selected[0])
      : selectedCountLabel(selected.length);

  const toggle = (value: T, checked: boolean) => {
    onChange(checked ? [...selected, value] : selected.filter((entry) => entry !== value));
  };

  return (
    <div className="video-analysis__multiselect">
      <span>{label}</span>
      <details
        className={disabled ? 'video-analysis__multiselect--disabled' : undefined}
        onToggle={(event) => {
          if (disabled) (event.target as HTMLDetailsElement).open = false;
        }}
      >
        <summary onClick={(event) => { if (disabled) event.preventDefault(); }}>
          {summary}
        </summary>
        <div className="video-analysis__multiselect-panel">
          {options.map((option) => (
            <label key={String(option.value)} className="video-analysis__multiselect-option">
              <input
                type="checkbox"
                disabled={disabled}
                checked={selectedSet.has(option.value)}
                onChange={(event) => toggle(option.value, event.target.checked)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
