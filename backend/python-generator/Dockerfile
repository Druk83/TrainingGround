FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential git curl \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip and install build tools
RUN pip install --upgrade pip setuptools wheel

# Layer 1: Install base dependencies (cached unless requirements-base.txt changes)
COPY requirements-base.txt ./requirements-base.txt
RUN pip install --no-cache-dir -r requirements-base.txt

# Layer 2: Install ML dependencies (cached unless requirements-ml.txt changes)
COPY requirements-ml.txt ./requirements-ml.txt
RUN pip install --no-cache-dir --prefer-binary -r requirements-ml.txt

# Layer 3: Copy application code (changes frequently)
COPY pyproject.toml ./pyproject.toml
COPY README.md ./README.md
COPY src ./src
COPY scripts ./scripts

# Install the package itself (fast, dependencies already installed)
RUN pip install --no-cache-dir --no-deps -e .

EXPOSE 8000

ENV APP_ENV=prod \
    LOG_LEVEL=INFO

CMD ["uvicorn", "explanation_service.app:create_app", "--host", "0.0.0.0", "--port", "8000"]
