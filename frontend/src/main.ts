import { registerSW } from 'virtual:pwa-register';
import { authService } from './lib/auth-service';
import './styles/breakpoints.css';
import './styles/global.css';

const DEFAULT_TITLE = 'TrainingGround';
if (!document.title || document.title.trim().length === 0) {
  document.title = DEFAULT_TITLE;
}

if (!document.documentElement.getAttribute('lang')) {
  document.documentElement.setAttribute('lang', 'ru');
}

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
const isTeacherStudentsList = pathname === '/teacher/students';
const isTeacherStudentDetail =
  pathname.startsWith('/teacher/students/') && pathname.split('/').length >= 4;
const isTeacherNotifications = pathname.startsWith('/teacher/notifications');
const isUsersManagement = pathname.startsWith('/admin/users');
const isGroupsManagement = pathname.startsWith('/admin/groups');
const isSystemSettings = pathname.startsWith('/admin/settings');
const isAnticheat = pathname.startsWith('/admin/anticheat');
const isAuditLogs = pathname.startsWith('/admin/audit');
const isAdminConsole = pathname.startsWith('/admin-console') || pathname === '/admin';

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
    !isAnticheat &&
    !isAuditLogs &&
    !isSystemSettings &&
    !isTeacherDashboard &&
    !isTeacherNotifications;

  if (appShell) {
    if (isStudentHome) {
      appShell.style.display = 'block';
    } else {
      appShell.style.display = 'none';
    }
  }

  if (skipLink) {
    skipLink.style.display = '';
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
  } else if (isSystemSettings) {
    if (!requireAuth()) return;
    if (!requireRole(['admin'])) return;

    import('./pages/system-settings').then(() => {
      document.body.appendChild(document.createElement('system-settings-page'));
    });
  } else if (isAnticheat) {
    if (!requireAuth()) return;
    if (!requireRole(['admin'])) return;

    import('./pages/anticheat-incidents').then(() => {
      document.body.appendChild(document.createElement('anticheat-incidents-page'));
    });
  } else if (isAuditLogs) {
    if (!requireAuth()) return;
    if (!requireRole(['admin'])) return;

    import('./pages/audit-logs').then(() => {
      document.body.appendChild(document.createElement('audit-logs-page'));
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
  } else if (isTeacherStudentDetail) {
    if (!requireAuth()) return;
    if (!requireRole(['teacher', 'admin'])) return;

    import('./pages/teacher-student-detail').then(() => {
      const wrapper = document.createElement('div');
      wrapper.style.minHeight = '100vh';
      document.body.appendChild(wrapper);
      wrapper.appendChild(document.createElement('teacher-student-detail'));
    });
  } else if (isTeacherStudentsList) {
    if (!requireAuth()) return;
    if (!requireRole(['teacher', 'admin'])) return;

    import('./pages/teacher-students').then(() => {
      const wrapper = document.createElement('div');
      wrapper.style.minHeight = '100vh';
      document.body.appendChild(wrapper);
      wrapper.appendChild(document.createElement('teacher-students'));
    });
  } else if (isTeacherNotifications) {
    if (!requireAuth()) return;
    if (!requireRole(['teacher', 'admin'])) return;

    import('./pages/teacher-notifications').then(() => {
      const wrapper = document.createElement('div');
      wrapper.style.minHeight = '100vh';
      document.body.appendChild(wrapper);
      wrapper.appendChild(document.createElement('teacher-notifications'));
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
