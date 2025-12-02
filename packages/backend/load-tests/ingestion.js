import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const ingestionLatency = new Trend('ingestion_latency');
const logsIngested = new Counter('logs_ingested');

// Configuration
// Default to port 3001 (docker-compose.test.yml exposes backend on 3001)
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const API_KEY = __ENV.API_KEY || 'your-api-key-here';

// Test scenarios
export const options = {
    scenarios: {
        // Scenario 1: Sustained load - 1000 logs/sec for 5 minutes
        sustained_load: {
            executor: 'constant-arrival-rate',
            rate: 100, // 100 requests per second
            timeUnit: '1s',
            duration: '5m',
            preAllocatedVUs: 50,
            maxVUs: 100,
            exec: 'ingestBatch',
            startTime: '0s',
        },
        // Scenario 2: Burst test - 5000 logs/sec peak for 30 seconds
        burst_load: {
            executor: 'constant-arrival-rate',
            rate: 500, // 500 requests per second (10 logs each = 5000 logs/sec)
            timeUnit: '1s',
            duration: '30s',
            preAllocatedVUs: 100,
            maxVUs: 200,
            exec: 'ingestBatch',
            startTime: '6m', // Start after sustained load
        },
        // Scenario 3: Ramp up test
        ramp_up: {
            executor: 'ramping-arrival-rate',
            startRate: 10,
            timeUnit: '1s',
            preAllocatedVUs: 50,
            maxVUs: 150,
            stages: [
                { duration: '1m', target: 50 },   // Ramp to 50 req/s
                { duration: '2m', target: 100 },  // Ramp to 100 req/s
                { duration: '1m', target: 200 },  // Spike to 200 req/s
                { duration: '1m', target: 50 },   // Back down
            ],
            exec: 'ingestBatch',
            startTime: '8m', // Start after burst
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% under 500ms, 99% under 1s
        errors: ['rate<0.01'], // Error rate under 1%
        http_req_failed: ['rate<0.01'],
    },
};

// Generate random log data
function generateLogs(count = 10) {
    const levels = ['debug', 'info', 'warn', 'error', 'critical'];
    const services = ['api-gateway', 'auth-service', 'payment-service', 'user-service', 'notification-service'];
    const messages = [
        'Request processed successfully',
        'Database query executed',
        'Cache miss - fetching from source',
        'Rate limit approaching threshold',
        'Connection timeout - retrying',
        'Validation failed for input',
        'User authentication successful',
        'Payment transaction completed',
        'Email notification sent',
        'Background job started',
    ];

    const logs = [];
    for (let i = 0; i < count; i++) {
        logs.push({
            time: new Date().toISOString(),
            service: services[Math.floor(Math.random() * services.length)],
            level: levels[Math.floor(Math.random() * levels.length)],
            message: messages[Math.floor(Math.random() * messages.length)] + ` [${Date.now()}-${i}]`,
            metadata: {
                requestId: `req-${Date.now()}-${Date.now().toString(36)}`,
                userId: `user-${Math.floor(Math.random() * 10000)}`,
                duration: Math.floor(Math.random() * 1000),
            },
        });
    }
    return logs;
}

// Main test function - batch ingestion
export function ingestBatch() {
    const logs = generateLogs(10); // 10 logs per request

    const response = http.post(
        `${BASE_URL}/api/v1/ingest`,
        JSON.stringify({ logs }),
        {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY,
            },
            tags: { name: 'ingest_batch' },
        }
    );

    const success = check(response, {
        'status is 200': (r) => r.status === 200,
        'has received count': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.received === logs.length;
            } catch {
                return false;
            }
        },
    });

    errorRate.add(!success);
    ingestionLatency.add(response.timings.duration);

    if (success) {
        logsIngested.add(logs.length);
    }
}

// Single log ingestion (Fluent Bit style)
export function ingestSingle() {
    const log = {
        time: new Date().toISOString(),
        service: 'fluent-bit-test',
        level: 'info',
        message: `Single log test ${Date.now()}`,
    };

    const response = http.post(
        `${BASE_URL}/api/v1/ingest/single`,
        JSON.stringify(log),
        {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY,
            },
            tags: { name: 'ingest_single' },
        }
    );

    const success = check(response, {
        'status is 200': (r) => r.status === 200,
    });

    errorRate.add(!success);
    ingestionLatency.add(response.timings.duration);

    if (success) {
        logsIngested.add(1);
    }
}

// Summary handler
export function handleSummary(data) {
    const summary = {
        timestamp: new Date().toISOString(),
        totalRequests: data.metrics.http_reqs?.values?.count || 0,
        totalLogsIngested: data.metrics.logs_ingested?.values?.count || 0,
        avgLatency: data.metrics.ingestion_latency?.values?.avg || 0,
        p95Latency: data.metrics.ingestion_latency?.values['p(95)'] || 0,
        p99Latency: data.metrics.ingestion_latency?.values['p(99)'] || 0,
        errorRate: data.metrics.errors?.values?.rate || 0,
        throughput: data.metrics.http_reqs?.values?.rate || 0,
    };

    console.log('\n========== INGESTION LOAD TEST SUMMARY ==========');
    console.log(`Total Requests: ${summary.totalRequests}`);
    console.log(`Total Logs Ingested: ${summary.totalLogsIngested}`);
    console.log(`Avg Latency: ${summary.avgLatency.toFixed(2)}ms`);
    console.log(`P95 Latency: ${summary.p95Latency.toFixed(2)}ms`);
    console.log(`P99 Latency: ${summary.p99Latency.toFixed(2)}ms`);
    console.log(`Error Rate: ${(summary.errorRate * 100).toFixed(2)}%`);
    console.log(`Throughput: ${summary.throughput.toFixed(2)} req/s`);
    console.log('==================================================\n');

    return {
        'stdout': JSON.stringify(summary, null, 2),
        'load-tests/results/ingestion-summary.json': JSON.stringify(summary, null, 2),
    };
}
