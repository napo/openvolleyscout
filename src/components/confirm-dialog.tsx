// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent } from 'react';
import { useTranslation } from '@src/i18n';
import './confirm-dialog.css';

interface PendingConfirm {
  message: string;
  resolve: (confirmed: boolean) => void;
}

let queue: PendingConfirm[] = [];
const listeners = new Set<() => void>();
let hostMounted = false;

function emit() {
  for (const listener of listeners) listener();
}

/**
 * Promise-based replacement for window.confirm: renders an in-app dialog
 * (consistent on Tauri and mobile PWAs). Falls back to window.confirm when the
 * host is not mounted (tests, standalone pages).
 */
export function confirmAction(message: string): Promise<boolean> {
  if (!hostMounted) return Promise.resolve(typeof window !== 'undefined' && window.confirm(message));
  return new Promise((resolve) => {
    queue = [...queue, { message, resolve }];
    emit();
  });
}

function settle(confirmed: boolean) {
  const [current, ...rest] = queue;
  if (!current) return;
  queue = rest;
  emit();
  current.resolve(confirmed);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const getSnapshot = () => queue[0] ?? null;

export function ConfirmDialogHost() {
  const { t } = useTranslation();
  const current = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const panelRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    hostMounted = true;
    return () => {
      hostMounted = false;
      while (queue.length) settle(false);
    };
  }, []);

  // Focus starts on Cancel (the safe choice for a destructive question) and returns to
  // whatever opened the dialog once it is answered.
  useEffect(() => {
    if (!current) return undefined;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => { opener?.focus(); };
  }, [current]);

  // Tab and Shift+Tab cycle between the two buttons: focus never leaves the dialog.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { settle(false); return; }
    if (event.key !== 'Tab') return;
    const buttons = Array.from(panelRef.current?.querySelectorAll('button') ?? []);
    if (buttons.length === 0) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !buttons.includes(active as HTMLButtonElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !buttons.includes(active as HTMLButtonElement))) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!current) return null;
  return (
    <div
      className="confirm-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-describedby="confirm-dialog-message"
      onKeyDown={handleKeyDown}
    >
      <div className="confirm-dialog__backdrop" onClick={() => settle(false)} />
      <section className="confirm-dialog__panel" ref={panelRef}>
        <p id="confirm-dialog-message" className="confirm-dialog__message">{current.message}</p>
        <div className="confirm-dialog__actions">
          <button type="button" className="btn-secondary" ref={cancelRef} onClick={() => settle(false)}>{t('cancel')}</button>
          <button type="button" className="btn-primary" onClick={() => settle(true)}>{t('confirm')}</button>
        </div>
      </section>
    </div>
  );
}
