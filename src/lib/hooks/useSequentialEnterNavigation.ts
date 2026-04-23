import type { KeyboardEvent } from 'react';

const SEQUENTIAL_NAV_ROOT_SELECTOR = '[data-sequential-nav-root="true"]';

function isEditableField(element: Element): element is HTMLInputElement | HTMLSelectElement {
  if (element instanceof HTMLTextAreaElement) {
    return false;
  }

  if (element instanceof HTMLInputElement) {
    if (element.disabled || element.readOnly) {
      return false;
    }

    return !['hidden', 'checkbox', 'radio', 'button', 'submit', 'reset', 'file'].includes(element.type);
  }

  if (element instanceof HTMLSelectElement) {
    return !element.disabled;
  }

  return false;
}

function getSequentialFields(root: Element) {
  return Array.from(root.querySelectorAll('input, select')).filter(isEditableField);
}

function findScrollableAncestor(element: HTMLElement): HTMLElement | null {
  let current = element.parentElement;

  while (current) {
    const style = window.getComputedStyle(current);
    const hasScrollableOverflow = /(auto|scroll)/.test(style.overflowY);
    const canScroll = current.scrollHeight > current.clientHeight + 1;

    if (hasScrollableOverflow && canScroll) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function scrollFieldIntoView(element: HTMLElement) {
  const scrollContainer = findScrollableAncestor(element);

  if (!scrollContainer) {
    element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    return;
  }

  const fieldRect = element.getBoundingClientRect();
  const containerRect = scrollContainer.getBoundingClientRect();
  const offset = 24;

  if (fieldRect.top < containerRect.top + offset) {
    scrollContainer.scrollBy({
      top: fieldRect.top - containerRect.top - offset,
      behavior: 'smooth',
    });
    return;
  }

  if (fieldRect.bottom > containerRect.bottom - offset) {
    scrollContainer.scrollBy({
      top: fieldRect.bottom - containerRect.bottom + offset,
      behavior: 'smooth',
    });
  }
}

function focusField(element: HTMLInputElement | HTMLSelectElement) {
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}

export function useSequentialEnterNavigation() {
  return (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const currentField = event.currentTarget;
    const root = currentField.closest(SEQUENTIAL_NAV_ROOT_SELECTOR);
    if (!root) {
      return;
    }

    const fields = getSequentialFields(root);
    const currentIndex = fields.indexOf(currentField);
    const nextField = currentIndex >= 0 ? fields[currentIndex + 1] : undefined;

    if (!nextField) {
      return;
    }

    event.preventDefault();
    focusField(nextField);
    scrollFieldIntoView(nextField);
  };
}
