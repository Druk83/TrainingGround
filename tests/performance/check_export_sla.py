#!/usr/bin/env python3
import base64
import os
import re
import sys
import urllib.request
from datetime import datetime

METRICS_URL = os.environ.get('EXPORT_METRICS_URL', 'http://localhost:8081/metrics')
SLA_SECONDS = float(os.environ.get('EXPORT_SLA_SECONDS', '10'))
METRICS_AUTH = os.environ.get('EXPORT_METRICS_AUTH')  # format: user:password

BUCKET_RE = re.compile(r'^export_duration_seconds_bucket\{([^}]*)\}\s+(\d+(?:\.\d+)?)$')
COUNT_RE = re.compile(r'^export_duration_seconds_count\{([^}]*)\}\s+(\d+(?:\.\d+)?)$')
SUM_RE = re.compile(r'^export_duration_seconds_sum\{([^}]*)\}\s+(\d+(?:\.\d+)?)$')


def parse_labels(raw: str):
    labels = {}
    for part in raw.split(','):
        if '=' not in part:
            continue
        key, value = part.split('=', 1)
        labels[key.strip()] = value.strip().strip('"')
    return labels


def fetch_metrics():
    request = urllib.request.Request(METRICS_URL)
    if METRICS_AUTH:
        token = base64.b64encode(METRICS_AUTH.encode('utf-8')).decode('ascii')
        request.add_header('Authorization', f'Basic {token}')
    with urllib.request.urlopen(request) as resp:
        return resp.read().decode('utf-8')


def collect_stats(metrics_text: str):
    stats = {}
    for line in metrics_text.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        bucket_match = BUCKET_RE.match(line)
        if bucket_match:
            labels = parse_labels(bucket_match.group(1))
            fmt = labels.get('format', 'unknown')
            bucket = labels.get('le')
            stats.setdefault(fmt, {}).setdefault('buckets', {})[bucket] = float(bucket_match.group(2))
            continue
        count_match = COUNT_RE.match(line)
        if count_match:
            labels = parse_labels(count_match.group(1))
            fmt = labels.get('format', 'unknown')
            stats.setdefault(fmt, {})['count'] = float(count_match.group(2))
            continue
        sum_match = SUM_RE.match(line)
        if sum_match:
            labels = parse_labels(sum_match.group(1))
            fmt = labels.get('format', 'unknown')
            stats.setdefault(fmt, {})['sum'] = float(sum_match.group(2))
            continue
    return stats


def main():
    try:
        metrics_text = fetch_metrics()
    except Exception as exc:  # noqa: BLE001
        print(f'[ERROR] Failed to fetch metrics from {METRICS_URL}: {exc}', file=sys.stderr)
        sys.exit(1)

    stats = collect_stats(metrics_text)
    timestamp = datetime.utcnow().isoformat()
    print(f'=== Export SLA Check @ {timestamp}Z ===')
    if not stats:
        print('No export_duration_seconds metrics found. Ensure worker is running and metrics endpoint is exposed.')
        sys.exit(1)

    overall_violation = False
    for fmt, data in stats.items():
        count = data.get('count', 0)
        total = data.get('sum', 0.0)
        buckets = data.get('buckets', {})
        bucket_le = buckets.get(f'{SLA_SECONDS}') or buckets.get(f'{SLA_SECONDS:.1f}') or buckets.get(str(SLA_SECONDS))
        avg = total / count if count else 0.0
        print(f"Format {fmt}: count={count:.0f}, avg={avg:.3f}s")
        if count:
            le_count = bucket_le if bucket_le is not None else 0.0
            exceeded = max(0, int(count - le_count))
            if exceeded:
                overall_violation = True
                print(f"  Violations (> {SLA_SECONDS}s): {exceeded}")
            else:
                print(f"  All samples within {SLA_SECONDS}s")
        else:
            print('  No exports for this format yet')

    if overall_violation:
        sys.exit(2)


if __name__ == '__main__':
    main()
