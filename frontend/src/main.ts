import './styles/global.css';
import { registerSW } from 'virtual:pwa-register';

const isTeacherDashboard = window.location.pathname.startsWith('/teacher-dashboard');
const isAdminConsole = window.location.pathname.startsWith('/admin');

if (isAdminConsole) {
  import('./pages/admin-console');
  document.body.appendChild(document.createElement('admin-console'));
} else if (isTeacherDashboard) {
  import('./pages/teacher-dashboard');
  const wrapper = document.createElement('div');
  wrapper.style.minHeight = '100vh';
  document.body.appendChild(wrapper);
  wrapper.appendChild(document.createElement('teacher-dashboard'));
} else {
  import('./app-shell');
}

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
