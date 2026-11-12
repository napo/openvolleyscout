import type { ReactNode } from 'react';

export type ActionIconName = 'pan' | 'zoom-in' | 'zoom-out' | 'fit' | 'pdf' | 'pptx' | 'ods' | 'svg' | 'web' | 'preview' | 'import' | 'export' | 'archive' | 'add' | 'edit' | 'manage' | 'copy' | 'delete' | 'up' | 'down' | 'undo' | 'redo' | 'select' | 'player' | 'arrow' | 'cone' | 'area' | 'text' | 'close' | 'external';

const paths: Record<ActionIconName, ReactNode> = {
  pan: <><path d="M7 12V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v7l1-3a2 2 0 0 1 3 2l-3 8H9l-6-7a2 2 0 0 1 3-2z" /></>,
  'zoom-in': <><circle cx="10" cy="10" r="7" /><path d="m15 15 6 6M10 6v8M6 10h8" /></>,
  'zoom-out': <><circle cx="10" cy="10" r="7" /><path d="m15 15 6 6M6 10h8" /></>,
  fit: <><path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6M8 8h8v8H8z" /></>,
  pdf: <><path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h8" /></>,
  pptx: <><path d="M3 3h18v13H3zM12 16v5M7 21l5-5 5 5M7 12V9M12 12V6M17 12V8" /></>,
  ods: <><path d="M14 3H5v18h14V8zM14 3v5h5M8 11h8v7H8zM8 14h8M11 11v7" /></>,
  svg: <><path d="M4 5h16v14H4zM4 15c5-15 11 15 16-6M4 15h4M16 9h4" /><circle cx="4" cy="15" r="1.5" /><circle cx="20" cy="9" r="1.5" /></>,
  web: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18" /></>,
  preview: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  import: <><path d="M13 3h6v18H5v-6M3 9h10M9 5l4 4-4 4" /></>,
  export: <><path d="M11 3H5v18h14v-6M11 9h10M17 5l4 4-4 4" /></>,
  archive: <><path d="M3 4h18v4H3zM5 8v13h14V8M10 12h4" /></>,
  add: <><path d="M12 4v16M4 12h16" /></>,
  edit: <><path d="m4 15 12-12 5 5L9 20l-6 1zM13 6l5 5" /></>,
  manage: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" fill="var(--icon-surface, white)" /><circle cx="16" cy="12" r="2" fill="var(--icon-surface, white)" /><circle cx="10" cy="18" r="2" fill="var(--icon-surface, white)" /></>,
  copy: <><path d="M8 8h13v13H8zM4 16H3V3h13v1" /></>,
  delete: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
  up: <><path d="m5 11 7-7 7 7M12 4v16" /></>,
  down: <><path d="m5 13 7 7 7-7M12 4v16" /></>,
  undo: <><path d="M4 5v6h6M4 11c2-8 16-8 16 1 0 6-7 8-11 5" /></>,
  redo: <><path d="M20 5v6h-6M20 11C18 3 4 3 4 12c0 6 7 8 11 5" /></>,
  select: <><path d="m5 3 14 10-7 1-3 7z" /></>,
  player: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="9" r="2" /><path d="M7 18v-2c0-4 10-4 10 0v2" /></>,
  arrow: <><path d="M4 20 20 4M10 4h10v10" /></>,
  cone: <><path d="m4 20 8-16 8 16zM8 12h8" /></>,
  area: <><ellipse cx="12" cy="12" rx="9" ry="6" strokeDasharray="3 2" /><path d="M12 9v6M9 12h6" /></>,
  text: <><path d="M4 7V4h16v3M12 4v16M8 20h8" /></>,
  close: <><path d="m5 5 14 14M19 5 5 19" /></>,
  external: <><path d="M14 3h7v7M21 3 10 14M10 3H3v18h18v-7" /></>,
};

/** Decorative icons supplement translated labels; icon-only controls need an aria-label. */
export function ActionIcon({ name, className = '' }: { name: ActionIconName; className?: string }) {
  return <svg className={`ovs-action-icon ovs-action-icon--${name} ${className}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
