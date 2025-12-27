# Тестирование Доступности (Accessibility)

Comprehensive набор тестов доступности для TrainingGround frontend с использованием axe-core и Playwright.

## Обзор

Этот набор тестов валидирует соответствие WCAG 2.1 AA на всех страницах и компонентах, обеспечивая доступность приложения для пользователей с ограниченными возможностями.

## Покрытие Тестами

### 1. Контрастность Цветов (WCAG AA >= 4.5:1)
- Автоматические проверки через axe-core
- Валидация соотношения контраста текст/фон
- Обеспечение читаемости для пользователей с нарушениями зрения

### 2. ARIA Атрибуты
- `aria-label` на полях ввода форм
- `aria-describedby` для подсказок к полям
- `aria-live` для динамических обновлений контента
- `role` атрибуты для семантической структуры
- `aria-current` для состояния навигации

### 3. Клавиатурная Навигация
- Tab/Shift+Tab между интерактивными элементами
- Enter для активации кнопок/ссылок
- Escape для закрытия модальных окон
- Arrow keys для выпадающих меню
- Видимые индикаторы фокуса

### 4. Совместимость со Screen Reader
- Правильная структура документа (заголовки, landmarks)
- Атрибут `<html lang>`
- Описательные заголовки страниц
- Альтернативный текст для изображений
- Совместимость с NVDA/JAWS

### 5. Масштабирование Текста (до 200%)
- Нет горизонтальной прокрутки при 200% zoom
- Все интерактивные элементы остаются видимыми и кликабельными
- Layout адаптируется без поломок

### 6. Управление Фокусом
- Ловушка фокуса в модальных окнах
- Восстановление фокуса после закрытия модального окна
- Skip-to-main ссылка для пользователей клавиатуры

### 7. Мобильная Доступность
- Touch targets >= 44x44 px (WCAG 2.1 AAA)
- Responsive дизайн сохраняет доступность
- Тестирование мобильного viewport (375x667)

## Запуск Тестов

### Запустить все accessibility тесты
```bash
npm run test:a11y
```

### Запустить конкретный файл тестов
```bash
npx playwright test tests/a11y/accessibility.spec.ts
```

### Запустить с UI mode для отладки
```bash
npx playwright test tests/a11y/accessibility.spec.ts --ui
```

### Запустить тесты для конкретной страницы
```bash
npx playwright test tests/a11y/accessibility.spec.ts -g "Login Page"
```

## Структура Тестов

### accessibility.spec.ts
Основной comprehensive набор тестов, покрывающий:
- Страница логина
- Страница регистрации
- Админ-консоль
- Навигационный header
- Контрастность цветов на всех страницах
- Совместимость со screen reader
- Управление фокусом
- Мобильная адаптивность

### wcag.spec.ts
Regression тесты для специфических user flow:
- Главная страница
- Состояния активной сессии
- Разрешение конфликтов

## Интерпретация Результатов

### Успешный прогон тестов
```
  24 passed (1.2m)
```
Все проверки доступности прошли - приложение соответствует WCAG 2.1 AA.

### Пример падения теста
```
Accessibility - Login Page > should not have any automatically detectable accessibility issues
Expected: []
Received: [
  {
    id: 'color-contrast',
    impact: 'serious',
    description: 'Ensures the contrast between foreground and background colors...',
    nodes: [...]
  }
]
```

**Как исправить:**
1. Определите failing rule (например, `color-contrast`)
2. Проверьте массив `nodes` для конкретных элементов
3. Обновите CSS для исправления проблем с контрастом
4. Перезапустите тесты для проверки

## Интеграция с Lighthouse

### Запустить Lighthouse accessibility audit
```bash
npm run lighthouse
```

### Ожидаемый Score
- Accessibility: >= 90

### Lighthouse проверки
- Контрастность цветов
- Валидность ARIA атрибутов
- Alt текст для изображений
- Labels для форм
- Иерархия заголовков
- Использование tab index
- Viewport meta tag

## Распространенные Проблемы Доступности и Исправления

### Проблема: Color Contrast Failure
**Проблема:** Цвет текста слишком светлый на фоне
**Решение:** Обновить CSS переменные в `global.css`
```css
--text-main: #ffffff; /* Contrast ratio 4.65:1 */
--primary: #3b82f6;   /* Contrast ratio 4.65:1 */
```

### Проблема: Отсутствуют ARIA Labels
**Проблема:** Поля ввода без labels
**Решение:** Добавить атрибут `aria-label`
```html
<input type="email" aria-label="Email address">
```

### Проблема: Сломана Клавиатурная Навигация
**Проблема:** Элементы не фокусируются через Tab
**Решение:** Обеспечить правильный tab order и focus styles
```css
:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
```

### Проблема: Фокус Не Ограничен в Modal
**Проблема:** Tab выходит за пределы модального окна
**Решение:** Реализовать focus trap используя атрибут `inert` или JavaScript
```javascript
// Пометить все элементы вне modal как inert
document.querySelectorAll('body > *:not(dialog)').forEach(el => {
  el.setAttribute('inert', '');
});
```

## CI/CD Интеграция

### Пример GitHub Actions
```yaml
- name: Run Accessibility Tests
  run: npm run test:a11y

- name: Upload Accessibility Report
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: accessibility-report
    path: playwright-report/
```

## Используемые Инструменты

- **@axe-core/playwright**: Автоматизированный движок тестирования accessibility
- **Playwright**: E2E testing framework
- **Lighthouse**: Performance и accessibility аудит
- **@storybook/addon-a11y**: Проверки accessibility на уровне компонентов (Storybook)

## Ресурсы

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [axe-core Rules](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)
- [Playwright Accessibility Testing](https://playwright.dev/docs/accessibility-testing)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

## Поддержка Доступности

1. **Запускайте тесты локально перед commit**
   ```bash
   npm run test:a11y
   ```

2. **Используйте Storybook addon-a11y во время разработки**
   - Находите проблемы рано в процессе разработки компонентов
   - Визуальный feedback на нарушения accessibility

3. **Тестируйте с реальными assistive technologies**
   - NVDA (Windows, бесплатно)
   - JAWS (Windows, commercial)
   - VoiceOver (macOS, встроенный)
   - TalkBack (Android, встроенный)

4. **Регулярно проверяйте Lighthouse отчеты**
   - Мониторьте тренды accessibility score
   - Находите регрессии рано

## Best Practices

1. **Semantic HTML First**
   - Используйте `<button>` для кнопок, не `<div onclick>`
   - Используйте `<nav>`, `<main>`, `<aside>` для landmarks
   - Правильная иерархия заголовков (`<h1>` -> `<h2>` -> `<h3>`)

2. **Progressive Enhancement**
   - Обеспечьте работу базовой функциональности без JavaScript
   - Добавляйте ARIA только когда semantic HTML недостаточно

3. **Тестируйте Рано и Часто**
   - Запускайте accessibility тесты в разработке
   - Включите в pre-commit hooks
   - Добавьте в CI/CD pipeline

4. **Тестирование с Пользователями**
   - Вовлекайте пользователей с ограниченными возможностями в тестирование
   - Собирайте реальный feedback
   - Итерируйте на основе потребностей пользователей

## Troubleshooting

### Тесты падают локально но проходят в CI
- **Причина:** Разные размеры viewport или версии браузера
- **Решение:** Используйте `page.setViewportSize()` для обеспечения консистентного viewport

### Intermittent failures
- **Причина:** Динамический контент не полностью загружен
- **Решение:** Добавьте `await page.waitForLoadState('networkidle')` перед тестами

### False positives
- **Причина:** Third-party виджеты или legacy код
- **Решение:** Используйте `.exclude()` для пропуска конкретных элементов
```typescript
const results = await new AxeBuilder({ page })
  .exclude('#third-party-widget')
  .analyze();
```

## Поддержка

Для вопросов по accessibility или проблем:
1. Проверьте существующие issues в GitHub
2. Изучите документацию WCAG 2.1
3. Проконсультируйтесь с accessibility командой
4. Создавайте детальные bug reports со скриншотами и выводом axe-core
