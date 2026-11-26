// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import './empty-state.css';

/**
 * What a tab, a chart or a list says when it has nothing to show: one reason in plain words, in the
 * same dashed box everywhere, with an optional next step (a button or a link).
 */
export function EmptyState({ children, title, action, className }: {
  children: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`empty-state${className ? ` ${className}` : ''}`} role="status">
      {title ? <strong className="empty-state__title">{title}</strong> : null}
      <p className="empty-state__message">{children}</p>
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}
