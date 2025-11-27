# Load Tests

Performance and load testing for LogWard using [k6](https://k6.io/).

## Prerequisites

1. Install k6:
   ```bash
   # Ubuntu/Debian
   sudo apt-get install k6

   # macOS
   brew install k6

   # Windows
   choco install k6
   ```

2. Have the backend running:
   ```bash
   cd packages/backend
   npm run dev
   ```

3. Create an API key from the LogWard dashboard or use an existing one.

## Running Tests

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:3001` | Backend API URL |
| `API_KEY` | - | Your LogWard API key (required) |

### Quick Start - Smoke Test

Validate the API is working:

```bash
k6 run --env API_KEY=lp_your_key_here smoke.js
```

### Ingestion Load Test

Test log ingestion performance:

```bash
# Full test (sustained + burst + ramp)
k6 run --env API_KEY=lp_your_key_here ingestion.js

# Quick test (1 minute, 50 VUs)
k6 run --env API_KEY=lp_your_key_here --duration 1m --vus 50 ingestion.js
```

**Scenarios:**
- **Sustained Load**: 100 req/s (1000 logs/sec) for 5 minutes
- **Burst Load**: 500 req/s (5000 logs/sec) for 30 seconds
- **Ramp Up**: 10 → 200 → 50 req/s over 5 minutes

**Targets:**
- P95 latency < 500ms
- P99 latency < 1000ms
- Error rate < 1%

### Query Load Test

Test query performance:

```bash
# Full test
k6 run --env API_KEY=lp_your_key_here query.js

# Quick test
k6 run --env API_KEY=lp_your_key_here --duration 1m --vus 20 query.js
```

**Scenarios:**
- **Concurrent Queries**: 100 simultaneous users for 3 minutes
- **Complex Filters**: Full-text + time + service + level filters
- **Aggregations**: Stats and time-bucket queries
- **Trace Correlation**: Trace ID lookups

**Targets:**
- P50 latency < 100ms
- P95 latency < 200ms
- P99 latency < 500ms
- Error rate < 1%

## Test Results

Results are saved to `load-tests/results/`:
- `ingestion-summary.json`
- `query-summary.json`

## Custom Test Runs

### Run with specific VUs and duration:
```bash
k6 run --env API_KEY=key --vus 100 --duration 5m ingestion.js
```

### Run specific scenario only:
```bash
k6 run --env API_KEY=key --scenario sustained_load ingestion.js
```

### Output to InfluxDB (for Grafana dashboards):
```bash
k6 run --out influxdb=http://localhost:8086/k6 ingestion.js
```

### Output to JSON file:
```bash
k6 run --out json=results.json ingestion.js
```

## Performance Benchmarks

### Ingestion API
| Metric | Target | Notes |
|--------|--------|-------|
| Throughput | 1000 logs/sec | Sustained per project |
| Peak | 5000 logs/sec | 1-minute burst |
| P95 Latency | < 500ms | Under load |
| Error Rate | < 0.1% | At 1000 logs/sec |

### Query API
| Metric | Target | Notes |
|--------|--------|-------|
| Concurrent | 100+ users | Simultaneous queries |
| P50 Latency | < 100ms | Simple queries |
| P95 Latency | < 200ms | Complex filters |
| P99 Latency | < 500ms | Worst case |

## Troubleshooting

### "Too many open files"
Increase ulimit:
```bash
ulimit -n 65535
```

### Rate limiting errors (429)
The API has rate limits per API key. For load testing, you may need to:
1. Use multiple API keys
2. Adjust rate limits in config
3. Run against a test environment

### Connection refused
Ensure the backend is running and accessible:
```bash
curl http://localhost:3001/health
```
