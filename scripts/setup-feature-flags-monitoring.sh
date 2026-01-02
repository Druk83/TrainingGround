#!/bin/bash
# Feature Flags Monitoring Setup Script
# Настройка мониторинга для Feature Flags в Prometheus и Alertmanager

set -e

PROMETHEUS_CONFIG="/etc/prometheus/prometheus.yml"
ALERTMANAGER_CONFIG="/etc/alertmanager/alertmanager.yml"
RULES_DIR="/etc/prometheus/rules"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-https://hooks.slack.com/services/YOUR/WEBHOOK/URL}"
TELEGRAM_TOKEN="${TELEGRAM_TOKEN:-your_telegram_bot_token}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-your_chat_id}"

echo "Setting up Feature Flags monitoring..."

# 1. Add feature_flags scrape job to Prometheus
echo "Updating Prometheus config..."
if ! grep -q "feature-flags" "$PROMETHEUS_CONFIG"; then
    cat >> "$PROMETHEUS_CONFIG" << EOF

  # Feature Flags metrics scrape job
  - job_name: 'feature-flags'
    static_configs:
      - targets: ['localhost:9090']  # Rust API metrics endpoint
    scrape_interval: 30s
    scrape_timeout: 10s
    honor_labels: true
EOF
    echo "Added feature-flags scrape job to Prometheus"
else
    echo "feature-flags job already configured"
fi

# 2. Add alert rules
echo "Installing alert rules..."
mkdir -p "$RULES_DIR"
cp /app/infra/prometheus/feature_flags_alerts.yml "$RULES_DIR/feature_flags_alerts.yml"
echo "Alert rules installed"

# 3. Update Alertmanager config (optional - requires API)
echo "Note: Update Alertmanager config manually or via API:"
echo "   - Set SLACK_WEBHOOK to your Slack webhook URL"
echo "   - Set TELEGRAM_TOKEN and TELEGRAM_CHAT_ID for Telegram alerts"
echo "   - Example webhook URL: https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

# 4. Create Grafana dashboard JSON
echo "Creating Grafana dashboard..."
cat > /tmp/feature_flags_dashboard.json << 'EOF'
{
  "dashboard": {
    "title": "Feature Flags Monitoring",
    "description": "Dashboard for monitoring Feature Flags metrics and alerts",
    "tags": ["feature-flags", "monitoring"],
    "timezone": "UTC",
    "panels": [
      {
        "title": "Active Feature Flags",
        "type": "gauge",
        "targets": [{"expr": "feature_flags_active_total"}],
        "fieldConfig": {
          "defaults": {
            "custom": {},
            "unit": "short",
            "thresholds": {
              "mode": "absolute",
              "steps": [
                {"color": "red", "value": null},
                {"color": "yellow", "value": 2},
                {"color": "green", "value": 5}
              ]
            }
          }
        }
      },
      {
        "title": "Flag Check Rate (per second)",
        "type": "graph",
        "targets": [{"expr": "rate(feature_flags_check_total[1m])"}]
      },
      {
        "title": "Cache Hit Rate (%)",
        "type": "graph",
        "targets": [{"expr": "(increase(feature_flags_cache_hits[5m]) / (increase(feature_flags_cache_hits[5m]) + increase(feature_flags_cache_misses[5m]))) * 100"}]
      }
    ]
  }
}
EOF
echo "Dashboard JSON created at /tmp/feature_flags_dashboard.json"
echo "  Import manually to Grafana:"
echo "  1. Grafana > Dashboards > Import"
echo "  2. Paste JSON from /tmp/feature_flags_dashboard.json"

# 5. Test Prometheus connectivity
echo "Testing Prometheus connectivity..."
if curl -s http://localhost:9090/-/healthy > /dev/null; then
    echo "Prometheus is healthy"
else
    echo "Warning: Could not reach Prometheus at localhost:9090"
fi

# 6. Instructions for Slack integration
echo ""
echo "Slack Integration Setup:"
echo "1. Create Slack App: https://api.slack.com/apps"
echo "2. Get Webhook URL from Incoming Webhooks"
echo "3. Update in Alertmanager:"
echo "   slack_configs:"
echo "     - api_url: '$SLACK_WEBHOOK'"
echo "       channel: '#devops-alerts'"

# 7. Instructions for Telegram integration
echo ""
echo "Telegram Integration Setup:"
echo "1. Create bot: @BotFather in Telegram"
echo "2. Get bot token"
echo "3. Get chat ID: Send message to bot and check updates"
echo "4. Setup Telegram alertmanager webhook:"
echo "   webhook_configs:"
echo "     - url: 'http://telegram-alertmanager-webhook:5001/'"

echo ""
echo "Feature Flags monitoring setup complete!"
echo ""
echo "Next steps:"
echo "1. Verify Prometheus scrapes metrics: http://localhost:9090/targets"
echo "2. Import Grafana dashboard from /tmp/feature_flags_dashboard.json"
echo "3. Configure Slack/Telegram webhooks in Alertmanager"
echo "4. Test alerts by toggling a feature flag"
echo ""
echo "Documentation: docs/feature-flags-monitoring.md"
