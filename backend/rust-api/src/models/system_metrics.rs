use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct SystemMetricsResponse {
    pub uptime_seconds: u64,
    pub total_users: u64,
    pub blocked_users: u64,
    pub total_groups: u64,
    pub total_incidents: u64,
    pub open_incidents: u64,
    pub critical_incidents: u64,
    pub audit_events_24h: u64,
    pub active_sessions: u64,
}
