# PWA (Progressive Web App) Тестирование

Comprehensive набор тестов для проверки функциональности Progressive Web App, включая Service Worker, offline режим, cache strategies, Web Manifest и Subresource Integrity.

## Обзор

PWA тесты проверяют что TrainingGround работает как полноценное прогрессивное веб-приложение с поддержкой offline режима, фонового синхронизации и installability.

## Структура Тестов

### Service Worker Registration (3 теста)
- Успешная регистрация Service Worker
- Проверка `navigator.serviceWorker.ready` resolved
- Контроль страницы после регистрации (SW controller)

### Offline Mode (3 теста)
- Загрузка страницы из кеша в offline режиме
- Показ offline fallback для некешированных страниц
- Graceful handling API запросов в offline

### Cache Strategies (5 тестов)
- Network First strategy для API запросов
- Cache First strategy для static assets (JS, CSS)
- Кеширование navigation requests (App Shell)
- Проверка cache expiration policies
- Версионирование кешей (v1, v2, etc)

**Реализованные стратегии:**
- **App Shell** - Network First с 5s timeout для HTML страниц
- **API Requests** - Network First с 3s timeout, fallback to cache
- **Static Assets (JS/CSS)** - Cache First с SRI verification
- **Images** - Cache First с TTL 30 дней
- **Fonts** - Cache First с TTL 1 год
- **Google Fonts** - Stale While Revalidate

### Service Worker Updates (2 теста)
- Обработка skipWaiting message
- Cleanup старых кешей при activation

### Web Manifest (5 тестов)
- Наличие валидного manifest.webmanifest
- Display mode: standalone
- Обязательные icon sizes (192x192, 512x512)
- Theme и background colors
- PWA install prompt availability

### SRI (Subresource Integrity) Verification (4 теста)
- Integrity атрибуты на script tags
- Integrity атрибуты на link tags (CSS)
- Наличие sri-manifest.json
- SRI verification в Service Worker коде

### Lighthouse Audit (2 теста - optional)
- PWA score >= 90
- Installable PWA criteria (HTTPS, SW, Manifest, Icons)

**NOTE:** Lighthouse тесты помечены как `.skip` по умолчанию, так как требуют установки `playwright-lighthouse`.

### Background Sync (1 тест)
- Queuing POST requests в offline режиме
- Replay запросов при возврате online

## Запуск Тестов

### Запустить все PWA тесты
```bash
npm run test:pwa
# или
npx playwright test tests/pwa/
```

### Запустить конкретную группу тестов
```bash
npx playwright test tests/pwa/service-worker.spec.ts -g "Service Worker Registration"
npx playwright test tests/pwa/service-worker.spec.ts -g "Offline Mode"
npx playwright test tests/pwa/service-worker.spec.ts -g "Cache Strategies"
npx playwright test tests/pwa/service-worker.spec.ts -g "SRI Verification"
```

### Запустить Lighthouse audit (требует установки)
```bash
# Сначала установите зависимости
npm install -D playwright-lighthouse lighthouse

# Раскомментируйте импорт в service-worker.spec.ts
# Уберите .skip с test.describe('PWA - Lighthouse Audit')

# Запустите тесты
npx playwright test tests/pwa/service-worker.spec.ts -g "Lighthouse"
```

### Debug режим
```bash
npx playwright test tests/pwa/service-worker.spec.ts --debug
```

### Headed режим (видимый браузер)
```bash
npx playwright test tests/pwa/service-worker.spec.ts --headed
```

## Требования

### Обязательные
- Playwright установлен (`npm install -D @playwright/test`)
- Service Worker зарегистрирован в приложении
- Web Manifest доступен по `/manifest.webmanifest`
- HTTPS или localhost (для Service Worker API)

### Опциональные
- playwright-lighthouse для Lighthouse audit
- Chrome debugging port 9222 для Lighthouse

## Интерпретация Результатов

### Успешный прогон
```
  26 passed (1.2m)
  2 skipped
```
Все критические PWA функции работают корректно.

### Service Worker не зарегистрирован
```
Error: expect(received).toBe(expected)

Expected: true (Service Worker registered)
Received: false
```

**Как исправить:**
1. Проверьте что SW регистрируется в `main.ts`:
   ```typescript
   if ('serviceWorker' in navigator) {
     navigator.serviceWorker.register('/sw.js');
   }
   ```
2. Проверьте что `sw.js` доступен по корневому URL
3. Убедитесь что используется HTTPS или localhost

### Offline mode тест падает
```
Error: Offline page did not load from cache
```

**Как исправить:**
1. Проверьте cache strategies в `sw.ts`
2. Убедитесь что Navigation requests используют Network First с fallback
3. Проверьте что offline fallback HTML генерируется в `setCatchHandler`

### Cache strategy тест падает
```
Error: Expected cache name to include 'tg-api-v1'
Received: []
```

**Как исправить:**
1. Убедитесь что Service Worker активен (reload страницы)
2. Проверьте naming кешей в `sw.ts` (должны включать version, напр. `-v1`)
3. Проверьте что cache strategies правильно настроены в Workbox

### SRI verification падает
```
Error: Expected script to have integrity attribute
```

**Как исправить:**
1. Добавьте Vite plugin для генерации SRI:
   ```typescript
   // vite.config.ts
   import { vitePluginSRI } from './vite-plugin-sri';
   plugins: [vitePluginSRI()]
   ```
2. Убедитесь что `sri-manifest.json` генерируется при build
3. Проверьте что SRI Plugin добавляет integrity атрибуты в HTML

### Web Manifest invalid
```
Error: Expected manifest.display to be 'standalone'
Received: undefined
```

**Как исправить:**
1. Проверьте `public/manifest.webmanifest`:
   ```json
   {
     "name": "App Name",
     "short_name": "App",
     "display": "standalone",
     "start_url": "/",
     "icons": [...]
   }
   ```
2. Добавьте `<link rel="manifest" href="/manifest.webmanifest">` в HTML
3. Убедитесь что все обязательные поля присутствуют

## CI/CD Интеграция

### Пример GitHub Actions
```yaml
- name: Run PWA Tests
  run: npm run test:pwa

- name: Upload PWA Test Report
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: pwa-test-report
    path: playwright-report/

- name: Run Lighthouse CI (optional)
  run: |
    npm install -D playwright-lighthouse lighthouse
    npx playwright test tests/pwa/ -g "Lighthouse"

- name: Upload Lighthouse Reports
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: lighthouse-reports
    path: lighthouse-reports/
```

## Offline Testing Best Practices

### 1. Тестируйте Real Offline Scenarios
```typescript
// Переходим в offline режим
await context.setOffline(true);

// Делаем запросы
const response = await fetch('/api/data');

// Проверяем fallback behavior
expect(response.ok || response.status === 503).toBe(true);

// Возвращаем online
await context.setOffline(false);
```

### 2. Очищайте Кеши Между Тестами
```typescript
test.beforeEach(async ({ page }) => {
  await page.evaluate(async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
  });
});
```

### 3. Ждите Service Worker Ready
```typescript
await page.evaluate(async () => {
  if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.ready;
  }
});
```

### 4. Reload После Регистрации SW
```typescript
// Первая загрузка - регистрация SW
await page.goto('/');
await waitForServiceWorkerRegistration(page);

// Reload - SW начинает контролировать страницу
await page.reload();
```

## Cache Strategies Explained

### Network First (API, HTML)
```
Request → Network (timeout 3-5s) → Success? Return
                ↓
              Timeout/Fail
                ↓
              Cache → Return cached or Error
```

**Используется для:**
- API endpoints (свежие данные приоритет)
- HTML navigation (latest app shell)

### Cache First (Static Assets)
```
Request → Cache → Found? Return
            ↓
          Not Found
            ↓
          Network → Return & Update Cache
```

**Используется для:**
- JavaScript bundles
- CSS stylesheets
- Images, Fonts
- Static assets с версионированными именами

### Stale While Revalidate (External Resources)
```
Request → Cache → Return immediately
            ↓
          Network → Update cache in background
```

**Используется для:**
- Google Fonts
- CDN resources
- Редко меняющиеся внешние ресурсы

## SRI (Subresource Integrity) Verification

### Как работает SRI в TrainingGround

1. **Build Time:**
   - Vite plugin генерирует `sri-manifest.json` с SHA-384 хешами
   - Добавляет `integrity` атрибуты в HTML

2. **Service Worker Install:**
   - Загружает `sri-manifest.json`
   - Сохраняет mapping filename → integrity hash

3. **Cache Time:**
   - Перед сохранением в cache - проверяет integrity
   - Вычисляет SHA-384 hash response body
   - Сравнивает с expected hash из manifest

4. **Serve Time:**
   - Перед отдачей из cache - проверяет integrity
   - Если hash не совпадает - не отдает, идет в network

### Формат sri-manifest.json
```json
{
  "index.html": {
    "integrity": "sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC",
    "size": 1234
  },
  "assets/index-abc123.js": {
    "integrity": "sha384-...",
    "size": 5678
  }
}
```

## Troubleshooting

### Service Worker не обновляется
**Проблема:** Старая версия SW остается активной

**Решение:**
```typescript
// В SW коде
self.skipWaiting(); // Skip waiting phase
self.clients.claim(); // Claim clients immediately

// Или отправьте message из app
registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
```

### Cache занимает слишком много места
**Проблема:** Quota exceeded errors

**Решение:**
```typescript
// Добавьте expiration plugin
new ExpirationPlugin({
  maxEntries: 100,
  maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
  purgeOnQuotaError: true, // Auto cleanup
})
```

### Background Sync не работает
**Проблема:** Offline requests не replay при возврате online

**Решение:**
1. Проверьте что Background Sync API поддерживается
2. Используйте Workbox BackgroundSyncPlugin
3. Зарегистрируйте sync event в SW:
   ```typescript
   self.addEventListener('sync', event => {
     if (event.tag === 'offline-queue') {
       event.waitUntil(replayQueue());
     }
   });
   ```

### SRI verification блокирует valid assets
**Проблема:** Ложные срабатывания SRI проверки

**Решение:**
1. Убедитесь что sri-manifest.json актуальный (rebuild)
2. Проверьте что Content-Encoding не меняет body (gzip)
3. Disable SRI для development:
   ```typescript
   if (import.meta.env.DEV) {
     // Skip SRI in development
   }
   ```

## Полезные Ссылки

- [PWA Documentation (MDN)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Workbox Documentation](https://developers.google.com/web/tools/workbox)
- [Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest)
- [Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity)
- [Lighthouse PWA Audit](https://web.dev/lighthouse-pwa/)
- [Background Sync API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)

## Расширение Тестов

### Добавление нового cache strategy теста
```typescript
test('should use custom strategy for XYZ', async ({ page }) => {
  await page.goto('/');
  await waitForServiceWorkerRegistration(page);

  // Делаем запрос который должен использовать вашу стратегию
  const response = await page.evaluate(async () => {
    const res = await fetch('/api/xyz');
    return { ok: res.ok, cached: res.headers.get('x-cached') };
  });

  expect(response.ok).toBe(true);
});
```

### Добавление offline scenario теста
```typescript
test('should handle offline scenario XYZ', async ({ page, context }) => {
  await page.goto('/');
  await context.setOffline(true);

  // Ваш offline сценарий

  await context.setOffline(false);
});
```

### Мониторинг PWA метрик в production
```typescript
// В приложении
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then(registration => {
    // Отправляем metrics
    analytics.track('pwa_active', {
      scope: registration.scope,
      version: registration.active?.scriptURL
    });
  });
}
```
