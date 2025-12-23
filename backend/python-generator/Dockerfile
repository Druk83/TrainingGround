FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential git curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/python-generator/pyproject.toml ./pyproject.toml
COPY backend/python-generator/README.md ./README.md
COPY backend/python-generator/src ./src
COPY backend/python-generator/scripts ./scripts

RUN pip install --upgrade pip \
    && pip install --no-cache-dir -e .

EXPOSE 8000

ENV APP_ENV=prod \
    LOG_LEVEL=INFO

CMD ["uvicorn", "explanation_service.app:create_app", "--host", "0.0.0.0", "--port", "8000"]
