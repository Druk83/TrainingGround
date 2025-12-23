"""Custom middleware for rate limiting and circuit breaking."""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable

from fastapi import Response, status
from redis.asyncio import Redis
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple Redis-backed sliding window limiter."""

    def __init__(self, app, limit: int = 60, window_seconds: int = 60) -> None:
        super().__init__(app)
        self._limit = limit
        self._window = window_seconds

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        redis: Redis = request.app.state.redis
        client_ip = request.client.host if request.client else "unknown"
        key = f"ratelimit:{client_ip}"
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, self._window)
        if count > self._limit:
            return JSONResponse(
                {"detail": "Too many requests"},
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        return await call_next(request)


class CircuitBreakerMiddleware(BaseHTTPMiddleware):
    """Blocks requests temporarily after repeated failures."""

    def __init__(
        self,
        app,
        failure_threshold: int = 5,
        recovery_time: int = 30,
    ) -> None:
        super().__init__(app)
        self._failure_threshold = failure_threshold
        self._recovery_time = recovery_time
        self._state: dict[str, dict[str, float]] = {}

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        key = request.url.path
        state = self._state.setdefault(key, {"failures": 0, "open_until": 0.0})

        now = time.time()
        if state["open_until"] > now:
            return JSONResponse(
                {
                    "detail": "Circuit breaker is open, please retry later.",
                    "retry_at": state["open_until"],
                },
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            response = await call_next(request)
            if response.status_code >= 500:
                self._record_failure(state)
            else:
                state["failures"] = 0
            return response
        except Exception:
            self._record_failure(state)
            raise

    def _record_failure(self, state: dict[str, float]) -> None:
        state["failures"] = state.get("failures", 0) + 1
        if state["failures"] >= self._failure_threshold:
            state["open_until"] = time.time() + self._recovery_time
            state["failures"] = 0
