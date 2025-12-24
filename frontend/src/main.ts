import './styles/global.css';
import './app-shell';
import { registerSW } from 'virtual:pwa-register';

if ('serviceWorker' in navigator) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      window.dispatchEvent(
        new CustomEvent('sw-update-available', { detail: () => updateSW(true) }),
      );
    },
    onOfflineReady() {
      window.dispatchEvent(new CustomEvent('sw-offline-ready'));
    },
  });
}
