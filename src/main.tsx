import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { IS_PREVIEW } from './lib/env';
import './styles.css';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

/**
 * Service worker: приложение открывается без интернета. Новая версия скачивается в фоне,
 * а применяется по нажатию на баннер «Доступна новая версия».
 */
function registerServiceWorker(): void {
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!('serviceWorker' in navigator) || !secure) return;
  let reloading = false;
  // При первой установке service worker страницу перезагружать не нужно — только при обновлении.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker
    .register('./sw.js', { scope: './' })
    .then((registration) => {
      const announce = () => {
        if (registration.waiting && navigator.serviceWorker.controller) window.dispatchEvent(new Event('app-update-ready'));
      };
      announce();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') announce();
        });
      });
      window.addEventListener('app-apply-update', () => registration.waiting?.postMessage({ type: 'SKIP_WAITING' }));
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update().catch(() => undefined);
      });
    })
    .catch(() => undefined);
}

if (!IS_PREVIEW) registerServiceWorker();
