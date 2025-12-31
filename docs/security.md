# Безопасность TrainingGround

Документ описывает базовые технические меры, реализованные в задаче A7, а также команды для проверки их работоспособности.

## TLS, HSTS и CSP
- `docker-compose.prod.yml` поднимает `nginx` перед Rust API, включены только TLS 1.3/1.2, принудительный HSTS (`max-age=31536000; includeSubDomains`) и строгий CSP (`default-src 'self'; script-src 'self'`).
- Для локальной разработки TLS/HTTP заголовки доступны через слой `csp_middleware` в `src/lib.rs`, который всегда добавляет CSP и Strict-Transport-Security.
- Проверка (dev): `curl -I http://localhost:8081/api/v1/auth/login` — в ответе должны присутствовать `content-security-policy` и `strict-transport-security`.

## JWT и SSO
- JWT содержит `sub`, `role`, `group_ids`, `iat`, `exp`. В `config.rs` появился массив `jwt_fallback_secrets`; при ротации добавьте предыдущий секрет в `JWT_FALLBACK_SECRETS` и перезапустите сервис.
- Middleware пишет user_id в текущий `tracing` span, поэтому все логи/метрики получают поля `trace_id` + `user_id`.
- Включение SSO производится флагом `ENABLE_SSO=true` (см. `docs/security/credentials-management.md`), требуются корпоративные IdP (OAuth2/SAML) и обновление UI.

### Процедура ротации JWT
1. Создайте новый секрет: `openssl rand -base64 32`.
2. Пропишите его в `JWT_SECRET`, старый — в `JWT_FALLBACK_SECRETS` (через запятую).
3. Перезапустите `rust-api`. После того как все refresh-токены обновлены — удалите fallback.

## CSRF и защита от replay
- В `middlewares/csrf.rs` реализован double-submit cookie + header `X-CSRF-Token`.
- Дополнительно проверяются `Origin/Referer` (белый список `CSRF_ALLOWED_ORIGINS`) и связка `X-Request-Nonce` + `X-Request-Timestamp` (nonce кэшируется на 5 минут, повторы блокируются с HTTP 409).
- Клиент обязан отправлять оба заголовка для всех небезопасных методов (POST/PUT/PATCH/DELETE).

## PII и шифрование
- Бизнес-данные в Mongo могут быть защищены CSFLE: в `.env` установите `MONGODB_ENCRYPTION_ENABLED=true`, `MONGODB_ENCRYPTION_PROVIDER=vault`; скрипт `infra/config/mongodb-encryption.yaml` создаёт ключи в Vault.
- Секреты управляются Vault/AppRole (`VAULT_ROLE_ID`/`VAULT_SECRET_ID`). Скрипты `infra/scripts/check_env.*` валидируют отсутствие дефолтных значений.

## Проверки безопасности в CI/CD
- `make audit` запускает `npm audit`, `cargo audit`, `pip-audit`.
- `cargo clippy`/`npm run lint` блокируют потенциальные XSS/инъекции в фронте.
- OWASP ZAP/Zed Attack Proxy можно прогонять против `http://localhost:8081` — CSP и CSRF должны оставаться зелёными.

## Наблюдаемость логов
- Каждый ответ API содержит `X-Trace-Id`. Логи в Loki (`http://localhost:3100` / Grafana Logs panel) фильтруются по `trace_id` и `user_id`.
- Корреляция инцидентов описана в `docs/devops/runbooks.md` (см. шаги реагирования на алерты).
