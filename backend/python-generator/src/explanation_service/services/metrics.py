"""
Prometheus metrics helpers shared across the FastAPI app and background workers.
"""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable

from fastapi import FastAPI
from prometheus_client import Counter, Gauge, Histogram, generate_latest
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

REQUEST_LATENCY = Histogram(
    "explanation_request_latency_seconds",
    "Latency of /explanations handler",
    ["method", "endpoint", "status"],
    buckets=(0.05, 0.1, 0.2, 0.4, 0.8, 1.5, 2.0, 5.0),
)
CACHE_HITS = Counter(
    "explanation_cache_hits_total",
    "How many explanations served from Redis cache",
)
CACHE_MISSES = Counter(
    "explanation_cache_misses_total",
    "How many explanation cache misses occurred",
)
YANDEXGPT_ERRORS = Counter(
    "explanation_yandexgpt_errors_total",
    "Errors returned by YandexGPT API",
    ["reason"],
)
STREAM_BACKLOG = Gauge(
    "explanation_content_changes_lag",
    "Approximate number of pending events in content:changes stream",
)


class MetricsMiddleware(BaseHTTPMiddleware):
    """Simple middleware that records request latency histogram values."""

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        elapsed = time.perf_counter() - start
        REQUEST_LATENCY.labels(
            method=request.method,
            endpoint=request.url.path,
            status=response.status_code,
        ).observe(elapsed)
        return response


def register_metrics(app: FastAPI) -> None:
    """Attach middleware and /metrics endpoint to the FastAPI app."""

    app.add_middleware(MetricsMiddleware)

    @app.get("/metrics")
    async def metrics_endpoint() -> Response:
        return Response(generate_latest(), media_type="text/plain; version=0.0.4")
