import { registerSW } from 'virtual:pwa-register';
import { authService } from './lib/auth-service';
import './styles/breakpoints.css';
import './styles/global.css';

// Auth helpers
function requireAuth(redirectTo = '/login'): boolean {
  if (!authService.isAuthenticated()) {
    window.location.href = redirectTo;
    return false;
  }
  return true;
}

function requireRole(allowedRoles: string[]): boolean {
  const user = authService.getUser();
  console.log('[requireRole] Checking role access:', {
    userRole: user?.role,
    allowedRoles,
    hasAccess: authService.hasAnyRole(allowedRoles),
  });

  if (!authService.hasAnyRole(allowedRoles)) {
    console.warn('[requireRole] Access denied - redirecting to /forbidden');
    window.location.href = '/forbidden';
    return false;
  }
  return true;
}

const pathname = window.location.pathname;
const isLogin = pathname.startsWith('/login');
const isRegister = pathname.startsWith('/register');
const isForbidden = pathname.startsWith('/forbidden') || pathname.startsWith('/403');
const isProfile = pathname.startsWith('/profile');
const isTeacherDashboard = pathname.startsWith('/teacher-dashboard');
const isUsersManagement = pathname.startsWith('/admin/users');
const isGroupsManagement = pathname.startsWith('/admin/groups');
const isAdminConsole =
  pathname.startsWith('/admin-console') || pathname === '/admin';

// Router logic
(function initializeRouter() {
  // app-shell and skip-link are only needed for student-home (lessons page)
  // Hide them on all other pages (login, register, forbidden, profile, admin, teacher-dashboard)
  const appShell = document.querySelector('app-shell') as HTMLElement | null;
  const skipLink = document.querySelector('.skip-link') as HTMLElement | null;
  const isStudentHome =
    !isLogin &&
    !isRegister &&
    !isForbidden &&
    !isProfile &&
    !isAdminConsole &&
    !isUsersManagement &&
    !isGroupsManagement &&
    !isTeacherDashboard;

  if (appShell) {
    if (isStudentHome) {
      appShell.style.display = 'block';
    } else {
      appShell.style.display = 'none';
    }
  }

  if (skipLink) {
    if (isStudentHome) {
      skipLink.style.display = '';
    } else {
      skipLink.style.display = 'none';
    }
  }

  // Public pages (no auth required)
  if (isLogin) {
    import('./pages/login-page').then(() => {
      document.body.appendChild(document.createElement('login-page'));
    });
  } else if (isRegister) {
    import('./pages/register-page').then(() => {
      document.body.appendChild(document.createElement('register-page'));
    });
  } else if (isForbidden) {
    import('./pages/forbidden-page').then(() => {
      document.body.appendChild(document.createElement('forbidden-page'));
    });
  }
  // Protected pages (auth required)
  else if (isProfile) {
    if (!requireAuth()) return;

    import('./pages/user-profile').then(() => {
      document.body.appendChild(document.createElement('user-profile'));
    });
  } else if (isUsersManagement) {
    if (!requireAuth()) return;
    if (!requireRole(['admin'])) return;

    import('./pages/users-management').then(() => {
      document.body.appendChild(document.createElement('users-management'));
    });
  } else if (isGroupsManagement) {
    if (!requireAuth()) return;
    if (!requireRole(['admin'])) return;

    import('./pages/groups-management').then(() => {
      document.body.appendChild(document.createElement('groups-management'));
    });
  } else if (isAdminConsole) {
    console.log('[Router] /admin or /admin-console route matched');
    if (!requireAuth()) return;
    console.log('[Router] Auth check passed, checking role...');
    if (!requireRole(['admin', 'content_admin'])) return;
    console.log('[Router] Role check passed, loading admin console...');

    import('./pages/admin-console').then(() => {
      document.body.appendChild(document.createElement('admin-console'));
    });
  } else if (isTeacherDashboard) {
    if (!requireAuth()) return;
    if (!requireRole(['teacher', 'admin'])) return;

    import('./pages/teacher-dashboard').then(() => {
      const wrapper = document.createElement('div');
      wrapper.style.minHeight = '100vh';
      document.body.appendChild(wrapper);
      wrapper.appendChild(document.createElement('teacher-dashboard'));
    });
  } else {
    // Default route (student home) - requires auth
    if (!requireAuth()) return;

    import('./pages/student-home').then(() => {
      const appShell = document.querySelector('app-shell');
      if (appShell) {
        appShell.appendChild(document.createElement('student-home'));
      }
    });
  }
})();

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
