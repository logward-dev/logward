import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * Smoke Test - Quick validation that the API is working
 * Run: k6 run --env API_KEY=your-key smoke.js
 */

// Default to port 3001 (docker-compose.test.yml exposes backend on 3001)
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const API_KEY = __ENV.API_KEY || 'your-api-key-here';

export const options = {
    vus: 1,
    duration: '30s',
    thresholds: {
        http_req_failed: ['rate<0.01'],
        http_req_duration: ['p(95)<500'],
    },
};

export default function () {
    // Test 1: Health check
    const healthRes = http.get(`${BASE_URL}/health`);
    check(healthRes, {
        'health check OK': (r) => r.status === 200,
    });

    // Test 2: Ingest single log
    const log = {
        time: new Date().toISOString(),
        service: 'smoke-test',
        level: 'info',
        message: `Smoke test log ${Date.now()}`,
    };

    const ingestRes = http.post(
        `${BASE_URL}/api/v1/ingest`,
        JSON.stringify({ logs: [log] }),
        {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY,
            },
        }
    );
    check(ingestRes, {
        'ingest OK': (r) => r.status === 200,
        'received 1 log': (r) => {
            try {
                return JSON.parse(r.body).received === 1;
            } catch {
                return false;
            }
        },
    });

    // Test 3: Query logs
    const queryRes = http.get(
        `${BASE_URL}/api/v1/logs?limit=10`,
        {
            headers: {
                'x-api-key': API_KEY,
            },
        }
    );
    check(queryRes, {
        'query OK': (r) => r.status === 200,
        'has logs array': (r) => {
            try {
                return Array.isArray(JSON.parse(r.body).logs);
            } catch {
                return false;
            }
        },
    });

    // Test 4: Get stats
    const statsRes = http.get(
        `${BASE_URL}/api/v1/stats`,
        {
            headers: {
                'x-api-key': API_KEY,
            },
        }
    );
    check(statsRes, {
        'stats OK': (r) => r.status === 200,
    });

    sleep(1);
}

export function handleSummary(data) {
    const passed = data.metrics.checks?.values?.passes || 0;
    const failed = data.metrics.checks?.values?.fails || 0;
    const total = passed + failed;

    console.log('\n========== SMOKE TEST RESULTS ==========');
    console.log(`Checks: ${passed}/${total} passed`);
    console.log(`Avg Response Time: ${(data.metrics.http_req_duration?.values?.avg || 0).toFixed(2)}ms`);
    console.log(`Error Rate: ${((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%`);
    console.log('=========================================\n');

    return {};
}
