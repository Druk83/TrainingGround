# Builder stage
FROM rust:alpine AS builder

WORKDIR /app

# Install build dependencies with retries
RUN for i in 1 2 3; do \
        apk update && \
        apk add --no-cache musl-dev openssl-dev openssl-libs-static pkgconfig && \
        break || sleep 5; \
    done

# Copy manifests
COPY Cargo.toml Cargo.lock ./

# Create dummy source files to cache dependencies
RUN mkdir -p src && \
    echo "fn main() {}" > src/main.rs && \
    echo "pub mod config; pub mod services; pub mod middlewares; pub mod routes; pub mod models; pub mod utils; pub fn create_router() -> axum::Router { axum::Router::new() }" > src/lib.rs && \
    mkdir -p src/config src/services src/middlewares src/routes src/models src/utils && \
    echo "pub struct Config;" > src/config/mod.rs && \
    echo "pub struct AppState;" > src/services/mod.rs && \
    echo "" > src/middlewares/mod.rs && \
    echo "" > src/routes/mod.rs && \
    echo "" > src/models/mod.rs && \
    echo "" > src/utils/mod.rs
RUN cargo build --release
RUN rm -rf src

# Copy source code and config
COPY src ./src
COPY config ./config

# Build application
RUN touch src/main.rs && cargo build --release

# Runtime stage
FROM alpine:3.19

WORKDIR /app

# Install runtime dependencies with retries
RUN for i in 1 2 3; do \
        apk update && \
        apk add --no-cache libgcc ca-certificates wget && \
        break || sleep 5; \
    done

# Copy binary from builder
COPY --from=builder /app/target/release/trainingground-api /app/trainingground-api

# Copy config files
COPY --from=builder /app/config /app/config

# Create non-root user
RUN addgroup -g 1000 appuser && adduser -D -u 1000 -G appuser appuser && \
    chown -R appuser:appuser /app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8081/health || exit 1

# Environment defaults
ENV RUST_LOG=info
ENV APP_ENV=prod

EXPOSE 8081

CMD ["/app/trainingground-api"]
