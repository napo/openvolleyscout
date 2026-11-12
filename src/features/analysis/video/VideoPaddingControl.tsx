import { useEffect, useState } from 'react';

export function parseVideoPadding(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const value = Number(normalized);
  return value >= 0 && value <= 30 ? Math.round(value * 10) / 10 : null;
}

/** Keep an editable draft: mobile keyboards need to clear a field before entering a new value. */
export function VideoPaddingControl({ label, value, onChange }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(current => (parseVideoPadding(current) === value ? current : String(value)));
  }, [value]);
  const handleChange = (raw: string) => {
    setDraft(raw);
    const parsed = parseVideoPadding(raw);
    if (parsed !== null && parsed !== value) onChange(parsed);
  };
  const commit = () => {
    const parsed = parseVideoPadding(draft);
    setDraft(String(parsed ?? value));
    if (parsed !== null && parsed !== value) onChange(parsed);
  };
  const nudge = (delta: number) => {
    const next = Math.max(0, Math.min(30, Math.round(((parseVideoPadding(draft) ?? value) + delta) * 10) / 10));
    setDraft(String(next));
    onChange(next);
  };
  return <div className="video-analysis__padding-control">
    <label>
      <span>{label}</span>
      <input type="text" inputMode="decimal" enterKeyHint="done" autoComplete="off" spellCheck={false} value={draft}
        onChange={event => handleChange(event.target.value)} onBlur={commit}
        onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
    </label>
    <button type="button" className="btn-secondary" aria-label={`${label} −1 s`} onClick={() => nudge(-1)} disabled={value <= 0}>−1 s</button>
    <button type="button" className="btn-secondary" aria-label={`${label} +1 s`} onClick={() => nudge(1)} disabled={value >= 30}>+1 s</button>
  </div>;
}
