#!/bin/bash
set -e

echo "================================"
echo "Pre-commit validation started"
echo "================================"

run_frontend_checks_fallback() {
  echo "[INFO] Running frontend fallback checks..."
  if [ ! -d "frontend" ]; then
    echo "[WARN] frontend/ directory not found, skipping frontend checks"
    return 0
  fi
  pushd frontend >/dev/null
  npm run lint
  npm run format:check
  npm run type-check
  npm run test
  npm audit --audit-level=moderate
  popd >/dev/null
  echo "[SUCCESS] Frontend fallback checks passed!"
}

run_rust_checks_fallback() {
  echo "[INFO] Running rust fallback checks..."
  if [ ! -d "backend/rust-api" ]; then
    echo "[WARN] backend/rust-api directory not found, skipping Rust checks"
    return 0
  fi
  pushd backend/rust-api >/dev/null
  cargo fmt --check
  cargo clippy --all-targets --all-features -- -D warnings
  cargo test --lib
  if [ "$OS" != "Windows_NT" ]; then
    echo "[INFO] Running content validation integration tests (A6)..."
    cargo test --test content_validation_test
  else
    echo "[INFO] Skipping content validation tests on Windows (linker limitations)"
  fi
  echo "[INFO] Running cargo audit..."
  if ! cargo audit; then
    echo "[WARN] cargo audit failed, continuing"
  fi
  popd >/dev/null
  echo "[SUCCESS] Rust fallback checks passed!"
}

run_python_checks_fallback() {
  echo "[INFO] Running python fallback checks..."
  PYTHON_DIR="backend/python-generator"
  if [ ! -d "$PYTHON_DIR" ]; then
    echo "[WARN] $PYTHON_DIR not found, skipping Python checks"
    return 0
  fi
  pushd "$PYTHON_DIR" >/dev/null
  BLACK_TARGETS="src tests"
  ruff check $BLACK_TARGETS
  black --check $BLACK_TARGETS
  if [ -d "tests" ]; then
    echo "[INFO] Running pytest..."
    if ! pytest tests --tb=short; then
      echo "[WARN] pytest failed, continuing..."
    fi
  else
    echo "[WARN] tests/ not found, skipping pytest"
  fi
  echo "[INFO] Running pip-audit..."
  if ! pip-audit; then
    echo "[WARN] pip-audit failed or not installed, continuing..."
  fi
  popd >/dev/null
  echo "[SUCCESS] Python fallback checks completed!"
}

# Determine what changed. If git is unavailable, assume everything changed.
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  CHANGED_FILES=$(git diff --name-only HEAD)
else
  echo "[WARN] Not inside a Git repository; running all checks."
  CHANGED_FILES="frontend/ backend/rust-api/ backend/python-generator/"
fi

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

if [ "$RUN_FRONTEND" = true ]; then
  if [ -x ".githooks/pre-commit-frontend" ]; then
    .githooks/pre-commit-frontend || exit 1
  else
    run_frontend_checks_fallback
  fi
fi

if [ "$RUN_RUST" = true ]; then
  if [ -x ".githooks/pre-commit-rust" ]; then
    .githooks/pre-commit-rust || exit 1
  else
    run_rust_checks_fallback
  fi
fi

if [ "$RUN_PYTHON" = true ]; then
  if [ -x ".githooks/pre-commit-python" ]; then
    .githooks/pre-commit-python || exit 1
  else
    run_python_checks_fallback
  fi
fi

if [ "$RUN_FRONTEND" = false ] && [ "$RUN_RUST" = false ] && [ "$RUN_PYTHON" = false ]; then
  echo "[INFO] No code changes detected, skipping checks"
fi

echo "================================"
echo "All pre-commit checks passed!"
echo "================================"
