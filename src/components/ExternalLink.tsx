import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { isTauri } from '@tauri-apps/api/core';

/**
 * Link to an external site. On the web it opens in a new tab; the desktop
 * webview does not open `target="_blank"` links, so there the click goes to
 * the system browser through the opener plugin. Nothing is requested from
 * the site until the user clicks.
 */
export function ExternalLink({ href, children, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || !isTauri()) return;
    event.preventDefault();
    void import('@tauri-apps/plugin-opener')
      .then(({ openUrl }) => openUrl(href))
      .catch((error: unknown) => console.error('Error opening external link:', error));
  };

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={handleClick} {...props}>
      {children}
    </a>
  );
}
