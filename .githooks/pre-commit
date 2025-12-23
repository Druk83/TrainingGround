#!/bin/bash
set -e

echo "================================"
echo "Pre-commit validation started"
echo "================================"

# Определить измененные компоненты
CHANGED_FILES=$(git diff --cached --name-only)

RUN_FRONTEND=false
RUN_RUST=false
RUN_PYTHON=false

if echo "$CHANGED_FILES" | grep -q "^frontend/"; then
  RUN_FRONTEND=true
fi

if echo "$CHANGED_FILES" | grep -q "^backend/rust-api/"; then
  RUN_RUST=true
fi

if echo "$CHANGED_FILES" | grep -q "^backend/python-generator/"; then
  RUN_PYTHON=true
fi

# Запуск проверок для измененных компонентов
if [ "$RUN_FRONTEND" = true ]; then
  .githooks/pre-commit-frontend || exit 1
fi

if [ "$RUN_RUST" = true ]; then
  .githooks/pre-commit-rust || exit 1
fi

if [ "$RUN_PYTHON" = true ]; then
  .githooks/pre-commit-python || exit 1
fi

# Если изменений нет или они только в документации
if [ "$RUN_FRONTEND" = false ] && [ "$RUN_RUST" = false ] && [ "$RUN_PYTHON" = false ]; then
  echo "[INFO] No code changes detected, skipping checks"
fi

echo "================================"
echo "All pre-commit checks passed!"
echo "================================"
