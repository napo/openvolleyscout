// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from 'react';

/**
 * The behaviour every dialog of the app shares, whatever it looks like:
 * - Escape and a click outside close it (unless it asks for an answer: no `onClose`);
 * - focus moves into it, Tab and Shift+Tab stay inside it, and focus goes back to whatever opened it;
 * - it is announced as a modal dialog with its title or label.
 * Only the topmost dialog answers Escape, so a dialog opened from another closes alone.
 *
 * The look stays with the caller: `className` is the overlay, `backdropClassName` an optional
 * separate backdrop element, and the children are the panel.
 */
export interface ModalProps {
  /** Closes the dialog. Leave it out for a forced choice: neither Escape nor a click outside answers it. */
  onClose?: () => void;
  role?: 'dialog' | 'alertdialog';
  labelledBy?: string;
  describedBy?: string;
  ariaLabel?: string;
  /** The overlay element. */
  className?: string;
  /** A separate backdrop element (a click on it closes the dialog). Without it, a click on the overlay itself does. */
  backdropClassName?: string;
  /** A click outside closes it (default: yes, whenever the dialog can be closed). Off for forms that hold typed data. */
  closeOnBackdrop?: boolean;
  /** The element that gets the focus first; by default the first control in the dialog. */
  initialFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open dialogs, the last one is on top. */
const openModals: symbol[] = [];

export function Modal({
  onClose,
  role = 'dialog',
  labelledBy,
  describedBy,
  ariaLabel,
  className,
  backdropClassName,
  closeOnBackdrop = true,
  initialFocus,
  children,
}: ModalProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<symbol>(Symbol(useId()));
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissible = onClose !== undefined;

  useEffect(() => {
    const id = idRef.current;
    openModals.push(id);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = rootRef.current;
    // Something inside already took the focus (autoFocus): leave it.
    if (root && !root.contains(document.activeElement)) {
      const target = initialFocus?.current ?? root.querySelector<HTMLElement>(FOCUSABLE);
      (target ?? root).focus();
    }
    return () => {
      const index = openModals.indexOf(id);
      if (index >= 0) openModals.splice(index, 1);
      if (opener && document.contains(opener)) opener.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dismissible) return undefined;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (openModals[openModals.length - 1] !== idRef.current) return;
      onCloseRef.current?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dismissible]);

  // Tab cycles through the controls of the dialog: focus never leaves it.
  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(rootRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((element) => !element.closest('[hidden]') && getComputedStyle(element).display !== 'none');
    if (controls.length === 0) {
      event.preventDefault();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !rootRef.current?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !rootRef.current?.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  const clickedOutside = dismissible && closeOnBackdrop && !backdropClassName
    ? (event: MouseEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) onClose?.(); }
    : undefined;

  return (
    <div
      ref={rootRef}
      className={className}
      role={role}
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-label={ariaLabel}
      tabIndex={-1}
      onKeyDown={trapFocus}
      onClick={clickedOutside}
    >
      {backdropClassName ? (
        <div className={backdropClassName} onClick={dismissible && closeOnBackdrop ? onClose : undefined} />
      ) : null}
      {children}
    </div>
  );
}
