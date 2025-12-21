use rand;
use std::time::Duration;

#[derive(Clone)]
pub struct RetryConfig {
    pub max_attempts: usize,
    pub base_backoff: Duration,
    pub max_backoff: Duration,
    pub jitter_max: Option<Duration>,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 5,
            base_backoff: Duration::from_millis(20),
            max_backoff: Duration::from_millis(500),
            jitter_max: Some(Duration::from_millis(50)),
        }
    }
}

impl RetryConfig {
    pub fn aggressive() -> Self {
        Self {
            max_attempts: 7,
            base_backoff: Duration::from_millis(50),
            max_backoff: Duration::from_millis(1000),
            jitter_max: Some(Duration::from_millis(100)),
        }
    }
}

/// Backwards compatible wrapper that mimics the old behavior (attempts & backoff)
pub async fn retry_async<F, Fut, T, E>(attempts: usize, backoff: Duration, f: F) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
{
    let cfg = RetryConfig {
        max_attempts: attempts,
        base_backoff: backoff,
        max_backoff: backoff * 16,
        jitter_max: Some(backoff / 2),
    };
    retry_async_with_config(cfg, f).await
}

pub async fn retry_async_with_config<F, Fut, T, E>(config: RetryConfig, mut f: F) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
{
    let mut attempts_left = config.max_attempts;
    let mut backoff = config.base_backoff;

    loop {
        let res = f().await;
        match res {
            Ok(v) => return Ok(v),
            Err(e) => {
                attempts_left = attempts_left.saturating_sub(1);
                if attempts_left == 0 {
                    return Err(e);
                }

                // apply jitter
                if let Some(jitter_max) = config.jitter_max {
                    let jitter_ms = jitter_max.as_millis() as u64;
                    let extra = if jitter_ms == 0 {
                        0
                    } else {
                        rand::random::<u64>() % (jitter_ms + 1)
                    };
                    let wait = backoff + Duration::from_millis(extra);
                    tokio::time::sleep(wait).await;
                } else {
                    tokio::time::sleep(backoff).await;
                }

                backoff = std::cmp::min(backoff * 2, config.max_backoff);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[tokio::test]
    async fn retry_succeeds_after_retries() {
        let counter = AtomicUsize::new(0);
        let cfg = RetryConfig {
            max_attempts: 3,
            base_backoff: Duration::from_millis(1),
            max_backoff: Duration::from_millis(10),
            jitter_max: None,
        };

        let res: Result<usize, &'static str> = retry_async_with_config(cfg, || async {
            let n = counter.fetch_add(1, Ordering::SeqCst);
            if n < 2 {
                Err("fail")
            } else {
                Ok(n)
            }
        })
        .await;

        assert!(res.is_ok());
        assert!(counter.load(Ordering::SeqCst) >= 3);
    }

    #[tokio::test]
    async fn retry_fails_after_max_attempts() {
        let counter = AtomicUsize::new(0);
        let cfg = RetryConfig {
            max_attempts: 2,
            base_backoff: Duration::from_millis(1),
            max_backoff: Duration::from_millis(10),
            jitter_max: None,
        };

        let res: Result<(), &'static str> = retry_async_with_config(cfg, || async {
            counter.fetch_add(1, Ordering::SeqCst);
            Err("always fail")
        })
        .await;

        assert!(res.is_err());
        assert_eq!(counter.load(Ordering::SeqCst), 2);
    }
}
