# Security Testing

Документация по запуску security тестов и сканирования уязвимостей.

## OWASP ZAP Scanning

### Локальный запуск

**Linux/Mac:**
```bash
# Baseline scan (быстрый, пассивный)
./infra/tests/security/zap-scan.sh http://localhost:8081 baseline

# Full scan (полный, с активными атаками)
./infra/tests/security/zap-scan.sh http://localhost:8081 full

# API scan (с использованием OpenAPI spec)
OPENAPI_SPEC=docs/admin-openapi.yaml \
./infra/tests/security/zap-scan.sh http://localhost:8081 api
```

**Windows:**
```cmd
REM Baseline scan
bash infra\tests\security\zap-scan.sh http://localhost:8081 baseline

REM Full scan
bash infra\tests\security\zap-scan.sh http://localhost:8081 full
```

### Типы сканирования

#### Baseline Scan
- Быстрое пассивное сканирование
- Безопасно для production
- Время выполнения: 5-10 минут
- Проверяет: CSP, HSTS, XSS prevention, информационные утечки

#### Full Scan
- Полное сканирование с активными атаками
- НЕ БЕЗОПАСНО для production
- Время выполнения: 30-60 минут
- Проверяет: SQL injection, XSS, CSRF, path traversal, и т.д.

#### API Scan
- Сканирование на основе OpenAPI спецификации
- Автоматическая генерация тестовых запросов
- Время выполнения: 10-20 минут

### Интерпретация результатов

Отчеты сохраняются в `security-reports/`:
- `zap-baseline-YYYYMMDD_HHMMSS.html` - HTML отчет
- `zap-baseline-YYYYMMDD_HHMMSS.json` - JSON для автоматизации

**Уровни риска:**
- **High** - критические уязвимости, требуют немедленного исправления
- **Medium** - серьезные проблемы, исправить в ближайшее время
- **Low** - незначительные проблемы, исправить при возможности
- **Informational** - информация для сведения

### Исправление распространенных проблем

**CSP Header Not Set:**
- Проверить [backend/rust-api/src/lib.rs](backend/rust-api/src/lib.rs) `csp_middleware`
- Убедиться что middleware применяется ко всем маршрутам

**CSRF Token Missing:**
- Проверить [backend/rust-api/src/middlewares/csrf.rs](backend/rust-api/src/middlewares/csrf.rs)
- Убедиться что фронтенд отправляет `X-CSRF-Token` header

**Secure/HttpOnly Cookie Flags:**
- Проверить `COOKIE_SECURE=true` в .env
- Проверить настройки cookie в auth handlers

**SQL Injection:**
- Убедиться что используются parameterized queries
- Проверить MongoDB query sanitization

**XSS:**
- Проверить input validation
- Убедиться что Lit-элементы используют правильное escaping

---

## Dependency Audit

### NPM Audit
```bash
cd frontend
npm audit

# Автоматическое исправление
npm audit fix

# Игнорировать false positives
npm audit --audit-level=high
```

### Cargo Audit
```bash
cd backend/rust-api
cargo install cargo-audit
cargo audit

# С JSON отчетом
cargo audit --json > cargo-audit-report.json
```

---

## SAST (Static Analysis)

### Rust - Clippy
```bash
cd backend/rust-api
cargo clippy -- -D warnings -W clippy::all
```

### TypeScript - ESLint
```bash
cd frontend
npm run lint

# Автоисправление
npm run lint:fix
```

### Semgrep
```bash
# Установка
pip install semgrep

# Запуск
semgrep --config=p/security-audit --config=p/owasp-top-ten .
```

---

## Secret Scanning

### TruffleHog
```bash
# Docker
docker run --rm -v "$(pwd):/src" trufflesecurity/trufflehog:latest filesystem /src

# Локально
pip install trufflehog
trufflehog filesystem .
```

### GitLeaks
```bash
# Docker
docker run --rm -v "$(pwd):/path" zricethezav/gitleaks:latest detect --source=/path

# Локально (если установлен)
gitleaks detect
```

---

## CI/CD Integration

Security сканы автоматически запускаются в GitHub Actions:

### Триггеры
- Push в `main` или `develop`
- Pull requests
- Еженедельно (понедельник 02:00 UTC)
- Ручной запуск (workflow_dispatch)

### Артефакты
- `audit-reports` - npm и cargo audit
- `zap-reports` - OWASP ZAP HTML/JSON отчеты
- `security-summary` - сводный отчет

### Просмотр результатов
1. Перейти в Actions tab на GitHub
2. Выбрать workflow "Security Scan"
3. Скачать artifacts
4. Открыть HTML отчеты

---

## Production Security Checklist

Перед production deployment:

- [ ] Запустить `zap-scan.sh` baseline против staging
- [ ] Проверить что все High/Critical уязвимости исправлены
- [ ] Запустить `npm audit` и `cargo audit`
- [ ] Проверить что secrets не закоммичены (GitLeaks)
- [ ] Проверить CSP и HSTS headers
- [ ] Убедиться что TLS 1.3/1.2 включены
- [ ] Проверить CSRF protection
- [ ] Валидировать JWT configuration
- [ ] Проверить rate limiting
- [ ] Тестировать anticheat alerts

---

## Ресурсы

- [OWASP ZAP User Guide](https://www.zaproxy.org/docs/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Rust Security Guidelines](https://anssi-fr.github.io/rust-guide/)
- [TypeScript Security Best Practices](https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html)

---

**Последнее обновление:** 2026-01-02
