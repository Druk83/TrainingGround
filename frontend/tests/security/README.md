# Security Penetration Testing

Comprehensive OWASP Top 10 compliance testing suite для TrainingGround, проверяющий защиту от распространенных web уязвимостей.

## Обзор

Security penetration тесты симулируют реальные атаки на приложение для проверки эффективности защитных механизмов. Тесты покрывают OWASP Top 10 2021 категории уязвимостей.

## OWASP Top 10 Coverage

### A01:2021 - Broken Access Control (3 теста)
- Предотвращение доступа к данным других пользователей
- Защита от privilege escalation (повышение привилегий)
- Предотвращение path traversal атак (../../../etc/passwd)

**Проверяемые механизмы:**
- Authorization middleware на API endpoints
- User ID validation в запросах
- Path sanitization для file access

### A02:2021 - Cryptographic Failures (3 теста)
- Использование HTTPS для sensitive операций
- Secure flag на cookies (HttpOnly, SameSite)
- Отсутствие sensitive data в client-side storage

**Проверяемые механизмы:**
- HTTPS enforcement (window.isSecureContext)
- Cookie security attributes (Secure, HttpOnly, SameSite)
- localStorage/sessionStorage sanitization

### A03:2021 - Injection (3 теста)
- SQL injection в login fields (6 payloads)
- NoSQL injection в API requests (MongoDB operators)
- Special character sanitization в user input

**Проверяемые payloads:**
- SQL: `' OR '1'='1`, `admin'--`, `' UNION SELECT NULL--`
- NoSQL: `{ $ne: null }`, `{ $gt: '' }`, `{ $where: '1==1' }`
- Special chars: `Robert'); DROP TABLE users;--`

### A03:2021 - XSS (Cross-Site Scripting) (4 теста)
- Reflected XSS через URL parameters
- Stored XSS в user profile
- HTML entity escaping в form inputs
- Data attribute sanitization

**Проверяемые payloads:**
- `<script>alert("XSS")</script>`
- `<img src=x onerror=alert("XSS")>`
- `<svg/onload=alert("XSS")>`
- `javascript:alert("XSS")`
- `<iframe src="javascript:alert('XSS')">`

### A05:2021 - CSRF (Cross-Site Request Forgery) (3 теста)
- Rejection POST requests без CSRF token
- Rejection requests с invalid CSRF token
- CSRF protection на state-changing operations (POST, PATCH, DELETE)

**Проверяемые endpoints:**
- `/api/v1/sessions` (POST)
- `/api/v1/profile` (PATCH)
- `/api/v1/sessions/test` (DELETE)

### A07:2021 - Authentication Failures (4 теста)
- Brute force protection (rate limiting после 10 попыток)
- Password complexity enforcement
- Session invalidation после logout
- Session fixation attack prevention (session rotation)

**Weak passwords:**
- `123456`, `password`, `qwerty`, `abc123`

### A08:2021 - Software and Data Integrity Failures (2 теста)
- SRI hashes для external scripts (sha256/384/512)
- Content-Type header validation

**Проверяемые attributes:**
- `integrity="sha384-..."`
- `crossorigin="anonymous"`

## Запуск Тестов

### Запустить все security penetration тесты
```bash
npm run test:security
# или
npx playwright test tests/security/penetration.spec.ts
```

### Запустить конкретную OWASP категорию
```bash
npx playwright test tests/security/penetration.spec.ts -g "Injection"
npx playwright test tests/security/penetration.spec.ts -g "XSS"
npx playwright test tests/security/penetration.spec.ts -g "CSRF"
npx playwright test tests/security/penetration.spec.ts -g "Authentication"
npx playwright test tests/security/penetration.spec.ts -g "Access Control"
npx playwright test tests/security/penetration.spec.ts -g "Cryptographic"
```

### Debug режим
```bash
npx playwright test tests/security/penetration.spec.ts --debug
```

### Headed режим (видимый браузер)
```bash
npx playwright test tests/security/penetration.spec.ts --headed
```

### Генерация отчета
```bash
npx playwright test tests/security/penetration.spec.ts --reporter=html
npx playwright show-report
```

## Требования

### Обязательные
- Playwright установлен (`npm install -D @playwright/test`)
- Backend API запущен (`cargo run` в `backend/rust-api/`)
- Frontend dev server (`npm run dev` в `frontend/`)

### Backend Security Features
Тесты предполагают что backend реализует:
- JWT-based authentication
- CSRF token validation (Double-submit cookie pattern)
- Rate limiting middleware
- Input sanitization/validation
- Authorization checks
- Secure cookie configuration

## Интерпретация Результатов

### Успешный прогон
```
  25 passed (2.5m)
```
Все security механизмы работают корректно, приложение защищено от OWASP Top 10 атак.

### SQL Injection тест падает
```
Error: expect(received).toBe(expected)

Expected: true (error visible)
Received: false
```

**Проблема:** Login endpoint принял SQL injection payload и пользователь был залогинен.

**Как исправить:**
1. Backend должен использовать parameterized queries/prepared statements:
   ```rust
   // НЕ так:
   let query = format!("SELECT * FROM users WHERE email = '{}'", email);

   // Так:
   sqlx::query!("SELECT * FROM users WHERE email = $1", email)
   ```
2. Добавьте input validation на email format
3. Используйте ORM (SQLx, Diesel) который автоматически защищает от SQL injection

### NoSQL Injection тест падает
```
Error: expect(response.status === 400 || response.status === 403).toBe(true)
Received: 200 OK
```

**Проблема:** API endpoint принял MongoDB operator injection.

**Как исправить:**
1. Validate request body schema:
   ```rust
   #[derive(Deserialize)]
   struct LessonFilter {
       title: Option<String>,  // Только простые типы
       // НЕ разрешать объекты с $ operators
   }
   ```
2. Reject objects containing keys starting with `$`
3. Используйте strict schema validation (serde)

### XSS тест падает
```
Error: expect(pageContent.includes('<script>')).toBe(false)
Received: true
```

**Проблема:** XSS payload был отрендерен в HTML без экранирования.

**Как исправить:**
1. Frontend (Lit): Используйте text binding вместо HTML:
   ```typescript
   // НЕ так:
   html`<div>${unsafeUserInput}</div>`

   // Так (Lit автоматически экранирует):
   html`<div>${userInput}</div>`
   ```
2. Backend: Sanitize HTML в user input:
   ```rust
   use ammonia::clean;
   let safe_html = clean(&user_input);
   ```
3. Set Content-Security-Policy header:
   ```
   Content-Security-Policy: default-src 'self'; script-src 'self' 'sha384-...'
   ```

### CSRF тест падает
```
Error: expect(response.status).toBe(403)
Received: 200 OK
```

**Проблема:** State-changing endpoint принял запрос без CSRF token.

**Как исправить:**
1. Backend: Добавьте CSRF middleware:
   ```rust
   async fn csrf_middleware(req: Request, next: Next) -> Result<Response> {
       if is_state_changing(&req) {
           let csrf_token = req.headers().get("X-CSRF-Token")?;
           let cookie_token = req.cookies().get("csrf_token")?;

           if csrf_token != cookie_token {
               return Err(StatusCode::FORBIDDEN);
           }
       }
       next.run(req).await
   }
   ```
2. Frontend: Добавьте CSRF token в headers:
   ```typescript
   fetch('/api/v1/profile', {
       method: 'PATCH',
       headers: {
           'X-CSRF-Token': getCsrfToken(),
       },
   });
   ```

### Brute Force тест падает
```
Error: expect(rateLimited).toBe(true)
Received: false
```

**Проблема:** Rate limiting не сработал после 10 попыток.

**Как исправить:**
1. Backend: Добавьте rate limiting middleware (уже есть в TrainingGround):
   ```rust
   // src/middlewares/rate_limit.rs
   RateLimiter::new(
       10,  // max_requests
       Duration::from_secs(60),  // window
   )
   ```
2. Проверьте что middleware применен к login endpoint:
   ```rust
   .route("/api/v1/auth/login", post(login_handler))
   .layer(RateLimitLayer::new(rate_limiter))
   ```

### Session Fixation тест падает
```
Error: expect(sessionCookieBefore.value).not.toBe(sessionCookieAfter.value)
```

**Проблема:** Session ID не меняется после login (session fixation vulnerability).

**Как исправить:**
1. Backend: Regenerate session ID после успешного login:
   ```rust
   async fn login(session: &mut Session) -> Result<()> {
       // Сохраняем старые данные
       let old_data = session.data.clone();

       // Regenerate session ID
       session.regenerate().await?;

       // Восстанавливаем данные
       session.data = old_data;
       session.data.insert("user_id", user.id);
   }
   ```

### Path Traversal тест падает
```
Error: expect([400, 403, 404].includes(response.status)).toBe(true)
Received: 200 OK
```

**Проблема:** File endpoint позволяет path traversal.

**Как исправить:**
1. Backend: Sanitize file paths:
   ```rust
   fn sanitize_path(path: &str) -> Result<PathBuf> {
       let path = PathBuf::from(path);

       // Reject paths with ..
       if path.components().any(|c| c == Component::ParentDir) {
           return Err(Error::InvalidPath);
       }

       // Canonicalize и проверить что внутри allowed directory
       let canonical = path.canonicalize()?;
       if !canonical.starts_with("/var/app/data") {
           return Err(Error::InvalidPath);
       }

       Ok(canonical)
   }
   ```

## Best Practices

### 1. Defense in Depth
Используйте несколько layers защиты:
- **Frontend:** Input validation, XSS escaping
- **Backend:** Authorization, sanitization, rate limiting
- **Database:** Parameterized queries, least privilege
- **Infrastructure:** HTTPS, secure headers, WAF

### 2. Principle of Least Privilege
```rust
// НЕ так:
if user.is_authenticated() {
    return all_users();
}

// Так:
if user.role == Role::Admin {
    return all_users();
} else {
    return Err(StatusCode::FORBIDDEN);
}
```

### 3. Fail Securely
```rust
// НЕ так:
let user = get_user(id).unwrap_or(default_admin_user);

// Так:
let user = get_user(id).ok_or(Error::Unauthorized)?;
```

### 4. Never Trust User Input
```typescript
// Всегда валидируйте и санитизируйте:
function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

if (!validateEmail(userInput)) {
  throw new Error('Invalid email');
}
```

### 5. Use Security Headers
```rust
// Backend response headers:
.header("X-Frame-Options", "DENY")
.header("X-Content-Type-Options", "nosniff")
.header("X-XSS-Protection", "1; mode=block")
.header("Strict-Transport-Security", "max-age=31536000")
.header("Content-Security-Policy", "default-src 'self'")
```

## CI/CD Интеграция

### Пример GitHub Actions
```yaml
name: Security Tests

on: [push, pull_request]

jobs:
  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable

      - name: Start Backend
        run: |
          cd backend/rust-api
          cargo run &
          sleep 10

      - name: Install Frontend Dependencies
        run: |
          cd frontend
          npm ci

      - name: Run Security Penetration Tests
        run: |
          cd frontend
          npm run test:security

      - name: Upload Test Report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: security-test-report
          path: frontend/playwright-report/

      - name: Fail on Security Issues
        if: failure()
        run: |
          echo "⚠️ Security tests failed! Review the report."
          exit 1
```

### Pre-commit Hook
```bash
#!/bin/bash
# .githooks/pre-commit-security

echo "Running security tests..."
cd frontend && npm run test:security

if [ $? -ne 0 ]; then
    echo "❌ Security tests failed. Commit blocked."
    exit 1
fi

echo "✅ Security tests passed"
```

## Attack Scenarios Explained

### 1. SQL Injection
**Как работает:**
```sql
-- User input: admin'--
SELECT * FROM users WHERE email = 'admin'--' AND password = 'xxx'
-- Комментарий -- игнорирует проверку пароля
```

**Защита:**
```rust
sqlx::query!("SELECT * FROM users WHERE email = $1 AND password = $2", email, hash)
// Параметры экранируются автоматически
```

### 2. XSS (Cross-Site Scripting)
**Как работает:**
```html
<!-- User profile name: <script>alert(document.cookie)</script> -->
<div class="user-name"><script>alert(document.cookie)</script></div>
<!-- JavaScript выполнится и украдет cookies -->
```

**Защита:**
```html
<!-- Lit автоматически экранирует -->
<div class="user-name">&lt;script&gt;alert(document.cookie)&lt;/script&gt;</div>
```

### 3. CSRF (Cross-Site Request Forgery)
**Как работает:**
```html
<!-- Malicious website -->
<img src="https://trainingground.com/api/v1/profile?name=Hacker">
<!-- Если пользователь залогинен, запрос выполнится с его cookies -->
```

**Защита:**
```typescript
// Double-submit cookie pattern
fetch('/api/v1/profile', {
  headers: {
    'X-CSRF-Token': getCsrfToken(),  // Must match cookie
  },
});
```

### 4. Brute Force
**Как работает:**
```
POST /api/v1/auth/login {"email": "admin@example.com", "password": "password1"}
POST /api/v1/auth/login {"email": "admin@example.com", "password": "password2"}
...
POST /api/v1/auth/login {"email": "admin@example.com", "password": "password9999"}
```

**Защита:**
```rust
// Rate limiter: max 10 requests per 60 seconds
if attempts > 10 {
    return Err(StatusCode::TOO_MANY_REQUESTS);
}
```

### 5. Session Fixation
**Как работает:**
```
1. Attacker получает session ID: abc123
2. Attacker заставляет victim использовать этот session ID
3. Victim логинится с session ID abc123
4. Attacker теперь может использовать abc123 для доступа к victim аккаунту
```

**Защита:**
```rust
// Regenerate session ID после login
session.regenerate().await?;
```

## Мониторинг в Production

### Логирование Security Events
```rust
// Backend
info!("Failed login attempt for email: {}", email);
warn!("Rate limit exceeded for IP: {}", ip);
error!("SQL injection attempt detected: {}", payload);
```

### Metrics
```rust
// Prometheus metrics
security_events_total{type="failed_login"}.inc();
security_events_total{type="rate_limited"}.inc();
security_events_total{type="csrf_violation"}.inc();
```

### Alerting
```yaml
# Prometheus alert rules
- alert: HighFailedLoginRate
  expr: rate(security_events_total{type="failed_login"}[5m]) > 10
  annotations:
    summary: "High rate of failed login attempts"

- alert: CSRFViolations
  expr: increase(security_events_total{type="csrf_violation"}[1h]) > 5
  annotations:
    summary: "Multiple CSRF violations detected"
```

## Полезные Ссылки

- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [PortSwigger Web Security Academy](https://portswigger.net/web-security)
- [Playwright Testing](https://playwright.dev/)
- [Rust Security](https://anssi-fr.github.io/rust-guide/)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)

## Расширение Тестов

### Добавление нового security теста
```typescript
test('should prevent XXX attack', async ({ page }) => {
  // Setup
  await registerAndLogin(page);

  // Attack
  const response = await page.evaluate(async () => {
    return fetch('/api/v1/vulnerable-endpoint', {
      method: 'POST',
      body: JSON.stringify({ malicious: 'payload' }),
    });
  });

  // Assert
  expect(response.status).toBe(403); // Blocked
});
```

### Penetration Testing Checklist
- [ ] Input validation на всех user inputs
- [ ] Output encoding для предотвращения XSS
- [ ] Parameterized queries для предотвращения SQL injection
- [ ] CSRF tokens на state-changing operations
- [ ] Rate limiting на authentication endpoints
- [ ] Authorization checks на всех protected endpoints
- [ ] Secure session management (HttpOnly, Secure, SameSite)
- [ ] HTTPS enforcement
- [ ] Security headers (CSP, X-Frame-Options, etc)
- [ ] Path sanitization для file operations
- [ ] Password complexity requirements
- [ ] Account lockout после N failed attempts
- [ ] Logging security events
- [ ] Regular security audits
