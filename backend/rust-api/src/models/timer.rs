use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum TimerEvent {
    TimerTick(TimerTick),
    TimeExpired(TimeExpired),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TimerTick {
    pub session_id: String,
    pub remaining_seconds: u32,
    pub elapsed_seconds: u32,
    pub total_seconds: u32,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TimeExpired {
    pub session_id: String,
    pub timestamp: DateTime<Utc>,
    pub message: String,
}

impl TimerEvent {
    pub fn to_sse_data(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| "{}".to_string())
    }

    pub fn event_name(&self) -> &'static str {
        match self {
            TimerEvent::TimerTick(_) => "timer-tick",
            TimerEvent::TimeExpired(_) => "time-expired",
        }
    }
}
