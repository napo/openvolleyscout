import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { preloadInitialLocale } from './i18n';
import './styles/global.css';
import './styles/theme.css';
import './styles/theme-generated.css';
import { initTheme } from './lib/theme/theme';
import { initAccessibility } from './lib/accessibility/accessibility';

// The saved look (light, dark or the system's) before the first render.
initTheme();
initAccessibility();

// Non-default locales are split into their own chunks: fetch the startup one
// before the first render so the UI never flashes in the fallback language.
void preloadInitialLocale().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
