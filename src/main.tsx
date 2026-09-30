import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { preloadInitialLocale } from './i18n';
import './styles/global.css';

// Non-default locales are split into their own chunks: fetch the startup one
// before the first render so the UI never flashes in the fallback language.
void preloadInitialLocale().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
