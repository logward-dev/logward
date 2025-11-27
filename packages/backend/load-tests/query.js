import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const queryLatency = new Trend('query_latency');
const queriesExecuted = new Counter('queries_executed');

// Configuration
// Default to port 3001 (docker-compose.test.yml exposes backend on 3001)
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const API_KEY = __ENV.API_KEY || 'your-api-key-here';

// Test scenarios
export const options = {
    scenarios: {
        // Scenario 1: Concurrent queries - 100 simultaneous searches
        concurrent_queries: {
            executor: 'constant-vus',
            vus: 100,
            duration: '3m',
            exec: 'searchLogs',
            startTime: '0s',
        },
        // Scenario 2: Complex filter queries
        complex_filters: {
            executor: 'constant-vus',
            vus: 50,
            duration: '2m',
            exec: 'complexSearch',
            startTime: '4m',
        },
        // Scenario 3: Aggregation queries (stats)
        aggregations: {
            executor: 'constant-vus',
            vus: 30,
            duration: '2m',
            exec: 'getStats',
            startTime: '7m',
        },
        // Scenario 4: Trace correlation
        trace_queries: {
            executor: 'constant-vus',
            vus: 20,
            duration: '2m',
            exec: 'traceCorrelation',
            startTime: '10m',
        },
    },
    thresholds: {
        http_req_duration: ['p(50)<100', 'p(95)<200', 'p(99)<500'], // Target latencies
        errors: ['rate<0.01'], // Error rate under 1%
        http_req_failed: ['rate<0.01'],
    },
};

// Random data generators
const services = ['api-gateway', 'auth-service', 'payment-service', 'user-service', 'notification-service'];
const levels = ['debug', 'info', 'warn', 'error', 'critical'];

function randomService() {
    return services[Math.floor(Math.random() * services.length)];
}

function randomLevel() {
    return levels[Math.floor(Math.random() * levels.length)];
}

function randomTimeRange() {
    const now = new Date();
    const ranges = [
        { from: new Date(now - 15 * 60 * 1000), to: now }, // Last 15 minutes
        { from: new Date(now - 60 * 60 * 1000), to: now }, // Last hour
        { from: new Date(now - 24 * 60 * 60 * 1000), to: now }, // Last 24 hours
        { from: new Date(now - 7 * 24 * 60 * 60 * 1000), to: now }, // Last 7 days
    ];
    return ranges[Math.floor(Math.random() * ranges.length)];
}

// Basic log search
export function searchLogs() {
    const params = new URLSearchParams({
        limit: '100',
        offset: '0',
    });

    // Randomly add filters
    if (Math.random() > 0.5) {
        params.append('service', randomService());
    }
    if (Math.random() > 0.5) {
        params.append('level', randomLevel());
    }

    const response = http.get(
        `${BASE_URL}/api/v1/logs?${params.toString()}`,
        {
            headers: {
                'x-api-key': API_KEY,
            },
            tags: { name: 'search_logs' },
        }
    );

    const success = check(response, {
        'status is 200': (r) => r.status === 200,
        'has logs array': (r) => {
            try {
                const body = JSON.parse(r.body);
                return Array.isArray(body.logs);
            } catch {
                return false;
            }
        },
    });

    errorRate.add(!success);
    queryLatency.add(response.timings.duration);

    if (success) {
        queriesExecuted.add(1);
    }

    sleep(0.1); // Small delay between requests
}

// Complex search with multiple filters
export function complexSearch() {
    const timeRange = randomTimeRange();
    const searchTerms = ['error', 'timeout', 'failed', 'success', 'connection', 'database'];
    const searchTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];

    const params = new URLSearchParams({
        limit: '50',
        offset: '0',
        service: randomService(),
        level: randomLevel(),
        from: timeRange.from.toISOString(),
        to: timeRange.to.toISOString(),
        search: searchTerm,
    });

    const response = http.get(
        `${BASE_URL}/api/v1/logs?${params.toString()}`,
        {
            headers: {
                'x-api-key': API_KEY,
            },
            tags: { name: 'complex_search' },
        }
    );

    const success = check(response, {
        'status is 200': (r) => r.status === 200,
        'response time OK': (r) => r.timings.duration < 500,
    });

    errorRate.add(!success);
    queryLatency.add(response.timings.duration);

    if (success) {
        queriesExecuted.add(1);
    }

    sleep(0.2);
}

// Statistics and aggregations
export function getStats() {
    const timeRange = randomTimeRange();

    const params = new URLSearchParams({
        from: timeRange.from.toISOString(),
        to: timeRange.to.toISOString(),
    });

    const response = http.get(
        `${BASE_URL}/api/v1/stats?${params.toString()}`,
        {
            headers: {
                'x-api-key': API_KEY,
            },
            tags: { name: 'get_stats' },
        }
    );

    const success = check(response, {
        'status is 200': (r) => r.status === 200,
        'has total count': (r) => {
            try {
                const body = JSON.parse(r.body);
                return typeof body.total === 'number';
            } catch {
                return false;
            }
        },
    });

    errorRate.add(!success);
    queryLatency.add(response.timings.duration);

    if (success) {
        queriesExecuted.add(1);
    }

    sleep(0.3);
}

// Trace correlation queries
export function traceCorrelation() {
    // First, get some logs to extract trace IDs
    const response1 = http.get(
        `${BASE_URL}/api/v1/logs?limit=10`,
        {
            headers: {
                'x-api-key': API_KEY,
            },
            tags: { name: 'get_logs_for_trace' },
        }
    );

    if (response1.status !== 200) {
        errorRate.add(true);
        return;
    }

    let traceId = null;
    try {
        const body = JSON.parse(response1.body);
        const logWithTrace = body.logs?.find(log => log.trace_id);
        if (logWithTrace) {
            traceId = logWithTrace.trace_id;
        }
    } catch {
        // No trace ID found
    }

    // If we found a trace ID, query for related logs
    if (traceId) {
        const response2 = http.get(
            `${BASE_URL}/api/v1/logs/trace/${traceId}`,
            {
                headers: {
                    'x-api-key': API_KEY,
                },
                tags: { name: 'trace_correlation' },
            }
        );

        const success = check(response2, {
            'status is 200': (r) => r.status === 200,
        });

        errorRate.add(!success);
        queryLatency.add(response2.timings.duration);

        if (success) {
            queriesExecuted.add(1);
        }
    } else {
        // Use a random UUID as fallback
        const randomUUID = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });

        const response2 = http.get(
            `${BASE_URL}/api/v1/logs/trace/${randomUUID}`,
            {
                headers: {
                    'x-api-key': API_KEY,
                },
                tags: { name: 'trace_correlation_empty' },
            }
        );

        queryLatency.add(response2.timings.duration);
        queriesExecuted.add(1);
    }

    sleep(0.5);
}

// Pagination test
export function paginationTest() {
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore && offset < 1000) {
        const response = http.get(
            `${BASE_URL}/api/v1/logs?limit=${limit}&offset=${offset}`,
            {
                headers: {
                    'x-api-key': API_KEY,
                },
                tags: { name: 'pagination' },
            }
        );

        const success = check(response, {
            'status is 200': (r) => r.status === 200,
        });

        if (!success) {
            errorRate.add(true);
            break;
        }

        try {
            const body = JSON.parse(response.body);
            hasMore = body.logs?.length === limit;
            offset += limit;
        } catch {
            hasMore = false;
        }

        queryLatency.add(response.timings.duration);
        queriesExecuted.add(1);

        sleep(0.1);
    }
}

// Summary handler
export function handleSummary(data) {
    const summary = {
        timestamp: new Date().toISOString(),
        totalRequests: data.metrics.http_reqs?.values?.count || 0,
        totalQueries: data.metrics.queries_executed?.values?.count || 0,
        avgLatency: data.metrics.query_latency?.values?.avg || 0,
        p50Latency: data.metrics.query_latency?.values['p(50)'] || 0,
        p95Latency: data.metrics.query_latency?.values['p(95)'] || 0,
        p99Latency: data.metrics.query_latency?.values['p(99)'] || 0,
        errorRate: data.metrics.errors?.values?.rate || 0,
        throughput: data.metrics.http_reqs?.values?.rate || 0,
    };

    console.log('\n========== QUERY LOAD TEST SUMMARY ==========');
    console.log(`Total Requests: ${summary.totalRequests}`);
    console.log(`Total Queries: ${summary.totalQueries}`);
    console.log(`P50 Latency: ${summary.p50Latency.toFixed(2)}ms (target: <100ms)`);
    console.log(`P95 Latency: ${summary.p95Latency.toFixed(2)}ms (target: <200ms)`);
    console.log(`P99 Latency: ${summary.p99Latency.toFixed(2)}ms (target: <500ms)`);
    console.log(`Error Rate: ${(summary.errorRate * 100).toFixed(2)}%`);
    console.log(`Throughput: ${summary.throughput.toFixed(2)} req/s`);
    console.log('==============================================\n');

    return {
        'stdout': JSON.stringify(summary, null, 2),
        'load-tests/results/query-summary.json': JSON.stringify(summary, null, 2),
    };
}
