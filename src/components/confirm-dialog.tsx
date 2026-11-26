// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Modal } from './Modal';
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
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    hostMounted = true;
    return () => {
      hostMounted = false;
      while (queue.length) settle(false);
    };
  }, []);

  if (!current) return null;
  return (
    <Modal
      className="confirm-dialog"
      backdropClassName="confirm-dialog__backdrop"
      role="alertdialog"
      describedBy="confirm-dialog-message"
      initialFocus={cancelRef}
      onClose={() => settle(false)}
    >
      {/* Focus starts on Cancel: the safe choice for a destructive question. */}
      <section className="confirm-dialog__panel">
        <p id="confirm-dialog-message" className="confirm-dialog__message">{current.message}</p>
        <div className="confirm-dialog__actions">
          <button type="button" className="btn-secondary" ref={cancelRef} onClick={() => settle(false)}>{t('cancel')}</button>
          <button type="button" className="btn-primary" onClick={() => settle(true)}>{t('confirm')}</button>
        </div>
      </section>
    </Modal>
  );
}
