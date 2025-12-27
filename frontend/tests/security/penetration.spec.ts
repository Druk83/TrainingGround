// Security Penetration Tests
// OWASP Top 10 compliance - проверка защиты от распространенных атак

import { test, expect, Page } from '@playwright/test';

// Вспомогательная функция для регистрации и логина
async function registerAndLogin(
  page: Page,
): Promise<{ email: string; password: string }> {
  const timestamp = Date.now();
  const email = `pentest-${timestamp}@example.com`;
  const password = 'SecurePassword123!';

  await page.goto('/register');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="confirmPassword"]', password);
  await page.fill('input[name="name"]', 'Penetration Test User');
  await page.click('button[type="submit"]');

  try {
    await page.waitForURL(/^(http:\/\/localhost:\d+)?\/$/, { timeout: 5000 });
  } catch {
    // Может быть уже залогинен
  }

  return { email, password };
}

test.describe('OWASP A03:2021 - Injection Attacks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('should prevent SQL injection in login email field', async ({ page }) => {
    await page.goto('/login');

    // Попытки SQL injection
    const sqlPayloads = [
      "' OR '1'='1",
      "admin'--",
      "' OR 1=1--",
      "admin' OR '1'='1'--",
      "' UNION SELECT NULL--",
      "1' AND '1'='1",
    ];

    for (const payload of sqlPayloads) {
      await page.fill('input[type="email"]', payload);
      await page.fill('input[type="password"]', 'anypassword');
      await page.click('button[type="submit"]');

      // Ждем ответа
      await page.waitForTimeout(500);

      // Проверяем что НЕ произошел успешный вход
      const currentUrl = page.url();
      expect(currentUrl).toContain('/login');

      // Проверяем наличие ошибки
      const errorVisible = await page
        .locator('text=/invalid|error|неверн/i')
        .isVisible()
        .catch(() => false);
      expect(errorVisible).toBe(true);
    }
  });

  test('should prevent NoSQL injection in API requests', async ({ page }) => {
    await registerAndLogin(page);

    // Попытки NoSQL injection через API
    const noSqlPayloads = [
      { $ne: null },
      { $gt: '' },
      { $regex: '.*' },
      { $where: '1==1' },
    ];

    for (const payload of noSqlPayloads) {
      const response = await page.evaluate(async (data) => {
        try {
          const res = await fetch('/api/v1/lessons', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filter: data }),
          });
          return { ok: res.ok, status: res.status };
        } catch (_error) {
          return { ok: false, status: 0, error: String(_error) };
        }
      }, payload);

      // Запрос должен быть отклонен (400 Bad Request или 403 Forbidden)
      expect(
        response.ok === false || response.status === 400 || response.status === 403,
      ).toBe(true);
    }
  });

  test('should sanitize special characters in user input', async ({ page }) => {
    const maliciousName = "Robert'); DROP TABLE users;--";

    await page.goto('/register');
    await page.fill('input[name="email"]', `test-${Date.now()}@example.com`);
    await page.fill('input[name="password"]', 'SecurePassword123!');
    await page.fill('input[name="confirmPassword"]', 'SecurePassword123!');
    await page.fill('input[name="name"]', maliciousName);
    await page.click('button[type="submit"]');

    // Регистрация должна либо успешно завершиться (с санитизацией),
    // либо показать ошибку валидации
    await page.waitForTimeout(1000);

    const isOnHomePage = page.url().match(/^(http:\/\/localhost:\d+)?\/$/) !== null;
    const hasValidationError = await page
      .locator('text=/invalid|error/i')
      .isVisible()
      .catch(() => false);

    expect(isOnHomePage || hasValidationError).toBe(true);

    // Если регистрация успешна, имя должно быть sanitized
    if (isOnHomePage) {
      const displayedName = await page.evaluate(() => {
        return document.body.textContent || '';
      });

      // Проверяем что SQL injection символы не присутствуют в сыром виде
      expect(displayedName.includes('DROP TABLE')).toBe(false);
    }
  });
});

test.describe('OWASP A03:2021 - XSS (Cross-Site Scripting)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('should prevent reflected XSS in URL parameters', async ({ page }) => {
    // Попытки reflected XSS через query parameters
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert("XSS")>',
      '<svg/onload=alert("XSS")>',
      'javascript:alert("XSS")',
      '<iframe src="javascript:alert(\'XSS\')">',
    ];

    for (const payload of xssPayloads) {
      const encodedPayload = encodeURIComponent(payload);
      await page.goto(`/login?error=${encodedPayload}`);

      // Ждем загрузки
      await page.waitForLoadState('networkidle');

      // Проверяем что XSS не выполнился
      const dialogShown = await page.evaluate(() => {
        return (window as Window & { xssTriggered?: boolean }).xssTriggered === true;
      });

      expect(dialogShown).toBe(false);

      // Проверяем что payload был экранирован в HTML
      const pageContent = await page.content();
      expect(pageContent.includes('<script>')).toBe(false);
      expect(pageContent.includes('onerror=')).toBe(false);
      expect(pageContent.includes('javascript:')).toBe(false);
    }
  });

  test('should prevent stored XSS in user profile', async ({ page }) => {
    await registerAndLogin(page);

    // Попытка сохранить XSS payload в профиле
    const xssPayload = '<script>alert("Stored XSS")</script>';

    await page.goto('/profile');
    await page.waitForSelector('h1, h2', { timeout: 3000 });

    // Попытка изменить имя на XSS payload (если есть форма)
    const nameInput = page.locator('input[name="name"]');
    const nameInputExists = await nameInput.count();

    if (nameInputExists > 0) {
      await nameInput.fill(xssPayload);

      const submitButton = page.locator('button[type="submit"]');
      const submitExists = await submitButton.count();

      if (submitExists > 0) {
        await submitButton.click();
        await page.waitForTimeout(1000);

        // Reload и проверка что XSS не выполнился
        await page.reload();
        await page.waitForLoadState('networkidle');

        const pageContent = await page.content();
        expect(pageContent.includes('<script>')).toBe(false);

        // Имя должно быть экранировано
        const displayedContent = await page.textContent('body');
        expect(displayedContent?.includes('<script>')).toBe(false);
      }
    }
  });

  test('should escape HTML entities in form inputs', async ({ page }) => {
    await page.goto('/register');

    const htmlPayload = '<b>Bold</b>&<i>Italic</i>';

    await page.fill('input[name="name"]', htmlPayload);
    await page.fill('input[name="email"]', `test-${Date.now()}@example.com`);
    await page.fill('input[name="password"]', 'SecurePassword123!');
    await page.fill('input[name="confirmPassword"]', 'SecurePassword123!');

    // Проверяем что value экранирован
    const inputValue = await page.inputValue('input[name="name"]');
    expect(inputValue).toBe(htmlPayload); // Input value должен содержать сырой текст

    // Но в DOM он должен быть экранирован
    const renderedHtml = await page.evaluate(() => {
      const input = document.querySelector('input[name="name"]') as HTMLInputElement;
      return input?.outerHTML || '';
    });

    // HTML теги не должны быть интерпретированы как разметка
    expect(renderedHtml.includes('<b>')).toBe(false);
  });

  test('should sanitize data-* attributes', async ({ page }) => {
    await registerAndLogin(page);

    // Попытка inject XSS через data attributes
    const response = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/v1/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            custom_data: {
              'data-onclick': 'alert("XSS")',
            },
          }),
        });
        return { ok: res.ok, status: res.status };
      } catch {
        return { ok: false, status: 0 };
      }
    });

    // Такой запрос должен быть отклонен или sanitized
    if (response.ok) {
      // Если принято, проверяем что не создался onclick handler
      const pageContent = await page.content();
      expect(pageContent.includes('onclick=')).toBe(false);
    }
  });
});

test.describe('OWASP A05:2021 - CSRF (Cross-Site Request Forgery)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('should reject POST requests without CSRF token', async ({ page }) => {
    await registerAndLogin(page);

    // Получаем access token
    const accessToken = await page.evaluate(() => localStorage.getItem('access_token'));

    // Попытка сделать POST без CSRF token
    const response = await page.evaluate(async (token) => {
      try {
        const res = await fetch('/api/v1/profile', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            // НЕТ X-CSRF-Token header
          },
          body: JSON.stringify({ name: 'Attacker' }),
        });
        return { ok: res.ok, status: res.status };
      } catch {
        return { ok: false, status: 0 };
      }
    }, accessToken);

    // Запрос должен быть отклонен (403 Forbidden)
    expect(response.status).toBe(403);
    expect(response.ok).toBe(false);
  });

  test('should reject requests with invalid CSRF token', async ({ page }) => {
    await registerAndLogin(page);

    const accessToken = await page.evaluate(() => localStorage.getItem('access_token'));

    // Попытка с неправильным CSRF token
    const response = await page.evaluate(async (token) => {
      try {
        const res = await fetch('/api/v1/profile', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-CSRF-Token': 'invalid-token-12345',
          },
          body: JSON.stringify({ name: 'Attacker' }),
        });
        return { ok: res.ok, status: res.status };
      } catch {
        return { ok: false, status: 0 };
      }
    }, accessToken);

    // Запрос должен быть отклонен
    expect(response.status).toBe(403);
    expect(response.ok).toBe(false);
  });

  test('should require CSRF token for state-changing operations', async ({ page }) => {
    await registerAndLogin(page);

    // Список state-changing endpoints которые должны требовать CSRF
    const protectedEndpoints = [
      { method: 'POST', path: '/api/v1/sessions', body: {} },
      { method: 'PATCH', path: '/api/v1/profile', body: { name: 'Test' } },
      { method: 'DELETE', path: '/api/v1/sessions/test', body: {} },
    ];

    for (const endpoint of protectedEndpoints) {
      const response = await page.evaluate(async ({ method, path, body }) => {
        try {
          const res = await fetch(path, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          return { ok: res.ok, status: res.status, path };
        } catch {
          return { ok: false, status: 0, path };
        }
      }, endpoint);

      // Без CSRF token должен быть 403
      expect(response.status).toBe(403);
    }
  });
});

test.describe('OWASP A07:2021 - Authentication Failures', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('should prevent brute force login attempts', async ({ page }) => {
    const testEmail = `bruteforce-${Date.now()}@example.com`;

    // Сначала регистрируем пользователя
    await page.goto('/register');
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', 'CorrectPassword123!');
    await page.fill('input[name="confirmPassword"]', 'CorrectPassword123!');
    await page.fill('input[name="name"]', 'Brute Force Test');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);

    // Logout
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      document.cookie.split(';').forEach((c) => {
        document.cookie = c
          .replace(/^ +/, '')
          .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
      });
    });

    // Попытки brute force (10 неудачных попыток)
    await page.goto('/login');

    let rateLimited = false;
    for (let i = 0; i < 10; i++) {
      await page.fill('input[type="email"]', testEmail);
      await page.fill('input[type="password"]', `WrongPassword${i}`);
      await page.click('button[type="submit"]');

      await page.waitForTimeout(300);

      // Проверяем статус
      const errorText = await page
        .locator('text=/too many|rate limit|заблокирован|слишком много/i')
        .isVisible()
        .catch(() => false);

      if (errorText) {
        rateLimited = true;
        break;
      }
    }

    // После 10 попыток должен сработать rate limiting
    expect(rateLimited).toBe(true);
  });

  test('should enforce password complexity', async ({ page }) => {
    await page.goto('/register');

    const weakPasswords = [
      '123456',
      'password',
      'qwerty',
      'abc123',
      '12345678',
      'password1',
    ];

    for (const weakPassword of weakPasswords) {
      await page.fill('input[name="email"]', `test-${Date.now()}@example.com`);
      await page.fill('input[name="password"]', weakPassword);
      await page.fill('input[name="confirmPassword"]', weakPassword);
      await page.fill('input[name="name"]', 'Test User');

      await page.click('button[type="submit"]');
      await page.waitForTimeout(500);

      // Должна быть ошибка валидации
      const hasError = await page
        .locator('text=/password|слаб|weak|требовани/i')
        .isVisible()
        .catch(() => false);
      expect(hasError).toBe(true);

      // Очистка формы
      await page.reload();
    }
  });

  test('should invalidate session after logout', async ({ page }) => {
    await registerAndLogin(page);

    // Получаем access token перед logout
    const accessTokenBefore = await page.evaluate(() =>
      localStorage.getItem('access_token'),
    );
    expect(accessTokenBefore).toBeTruthy();

    // Logout
    const logoutButton = page.locator('button:has-text("Logout"), a:has-text("Выход")');
    const logoutExists = await logoutButton.count();

    if (logoutExists > 0) {
      await logoutButton.first().click();
      await page.waitForTimeout(500);

      // Проверяем что токен удален
      const accessTokenAfter = await page.evaluate(() =>
        localStorage.getItem('access_token'),
      );
      expect(accessTokenAfter).toBeNull();

      // Попытка использовать старый токен
      const response = await page.evaluate(async (token) => {
        try {
          const res = await fetch('/api/v1/profile', {
            headers: { Authorization: `Bearer ${token}` },
          });
          return { ok: res.ok, status: res.status };
        } catch {
          return { ok: false, status: 0 };
        }
      }, accessTokenBefore);

      // Старый токен не должен работать (401 Unauthorized)
      expect(response.status).toBe(401);
    }
  });

  test('should prevent session fixation attacks', async ({ page, context }) => {
    // Получаем session ID до логина
    const cookiesBefore = await context.cookies();
    const sessionCookieBefore = cookiesBefore.find(
      (c) => c.name === 'session_id' || c.name.includes('session'),
    );

    // Логин
    await registerAndLogin(page);

    // Получаем session ID после логина
    const cookiesAfter = await context.cookies();
    const sessionCookieAfter = cookiesAfter.find(
      (c) => c.name === 'session_id' || c.name.includes('session'),
    );

    // Session ID должен измениться после логина (rotation)
    if (sessionCookieBefore && sessionCookieAfter) {
      expect(sessionCookieBefore.value).not.toBe(sessionCookieAfter.value);
    }
  });
});

test.describe('OWASP A08:2021 - Software and Data Integrity Failures', () => {
  test('should have SRI hashes for external scripts', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const externalScripts = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      return scripts
        .filter((script) => {
          const src = script.getAttribute('src') || '';
          return src.startsWith('http') || src.includes('cdn');
        })
        .map((script) => ({
          src: script.getAttribute('src'),
          integrity: script.getAttribute('integrity'),
          crossorigin: script.getAttribute('crossorigin'),
        }));
    });

    // Все внешние скрипты должны иметь integrity атрибут
    for (const script of externalScripts) {
      expect(script.integrity).toBeTruthy();
      expect(script.integrity).toMatch(/^sha(256|384|512)-/);
      expect(script.crossorigin).toBe('anonymous');
    }
  });

  test('should validate Content-Type headers', async ({ page }) => {
    await registerAndLogin(page);

    // Попытка отправить JSON с неправильным Content-Type
    const response = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/v1/profile', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'text/plain', // Неправильный Content-Type
          },
          body: JSON.stringify({ name: 'Attacker' }),
        });
        return { ok: res.ok, status: res.status };
      } catch {
        return { ok: false, status: 0 };
      }
    });

    // Должен быть отклонен (415 Unsupported Media Type или 400)
    expect(response.ok).toBe(false);
    expect([400, 415].includes(response.status)).toBe(true);
  });
});

test.describe('OWASP A01:2021 - Broken Access Control', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('should prevent access to other users data', async ({ page }) => {
    // Создаем первого пользователя
    await registerAndLogin(page);
    const user1Token = await page.evaluate(() => localStorage.getItem('access_token'));

    // Logout
    await page.evaluate(() => localStorage.clear());

    // Создаем второго пользователя
    await registerAndLogin(page);

    // Попытка получить данные первого пользователя с токеном второго
    const response = await page.evaluate(async (token) => {
      try {
        // Попытка доступа к чужому профилю через ID
        const res = await fetch('/api/v1/users/1', {
          headers: { Authorization: `Bearer ${token}` },
        });
        return { ok: res.ok, status: res.status };
      } catch {
        return { ok: false, status: 0 };
      }
    }, user1Token);

    // Доступ должен быть запрещен (403 Forbidden)
    expect([403, 404].includes(response.status)).toBe(true);
  });

  test('should prevent privilege escalation', async ({ page }) => {
    // Регистрируемся как обычный пользователь (student)
    await registerAndLogin(page);

    // Попытка доступа к admin-only endpoint
    const response = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/v1/admin/users');
        return { ok: res.ok, status: res.status };
      } catch {
        return { ok: false, status: 0 };
      }
    });

    // Должен быть 403 Forbidden
    expect(response.status).toBe(403);
    expect(response.ok).toBe(false);
  });

  test('should prevent path traversal attacks', async ({ page }) => {
    await registerAndLogin(page);

    // Попытки path traversal
    const pathTraversalPayloads = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      '....//....//....//etc/passwd',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    ];

    for (const payload of pathTraversalPayloads) {
      const response = await page.evaluate(async (path) => {
        try {
          const res = await fetch(`/api/v1/files/${path}`);
          return { ok: res.ok, status: res.status, path };
        } catch {
          return { ok: false, status: 0, path };
        }
      }, payload);

      // Должен быть 400 Bad Request или 403 Forbidden
      expect([400, 403, 404].includes(response.status)).toBe(true);
    }
  });
});

test.describe('OWASP A02:2021 - Cryptographic Failures', () => {
  test('should use HTTPS for sensitive operations', async ({ page }) => {
    // Проверяем что приложение использует secure context
    await page.goto('/');

    const isSecure = await page.evaluate(() => {
      return window.isSecureContext;
    });

    // В production должен быть true, в development может быть localhost
    const isLocalhost =
      page.url().includes('localhost') || page.url().includes('127.0.0.1');

    expect(isSecure || isLocalhost).toBe(true);
  });

  test('should set Secure flag on cookies', async ({ page, context }) => {
    await registerAndLogin(page);

    const cookies = await context.cookies();

    // Все auth-related cookies должны иметь Secure flag
    const authCookies = cookies.filter(
      (c) =>
        c.name.includes('token') || c.name.includes('session') || c.name === 'csrf_token',
    );

    for (const cookie of authCookies) {
      // В development (localhost) Secure flag может быть false
      const isLocalhost =
        page.url().includes('localhost') || page.url().includes('127.0.0.1');

      if (!isLocalhost) {
        expect(cookie.secure).toBe(true);
      }

      // HttpOnly должен быть всегда для refresh_token
      if (cookie.name === 'refresh_token') {
        expect(cookie.httpOnly).toBe(true);
      }

      // SameSite должен быть установлен
      expect(['Strict', 'Lax']).toContain(cookie.sameSite);
    }
  });

  test('should not expose sensitive data in client-side storage', async ({ page }) => {
    await registerAndLogin(page);

    const sensitiveData = await page.evaluate(() => {
      const localStorage = window.localStorage;
      const sessionStorage = window.sessionStorage;

      const items = {
        localStorage: Object.keys(localStorage).map((key) => ({
          key,
          value: localStorage.getItem(key) || '',
        })),
        sessionStorage: Object.keys(sessionStorage).map((key) => ({
          key,
          value: sessionStorage.getItem(key) || '',
        })),
      };

      return items;
    });

    // Проверяем что в localStorage нет паролей, refresh tokens, sensitive info
    const allValues = [
      ...sensitiveData.localStorage.map((i) => i.value),
      ...sensitiveData.sessionStorage.map((i) => i.value),
    ].join(' ');

    expect(allValues.toLowerCase().includes('password')).toBe(false);
    expect(allValues.includes('refresh_token')).toBe(false);

    // Access token может быть в localStorage (это ожидаемо для нашей архитектуры)
    // Но refresh token НЕ должен быть
  });
});
