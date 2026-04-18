import type { ReactNode } from 'react';
import { I18nProvider } from '@src/i18n';

export function AppProviders({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}
