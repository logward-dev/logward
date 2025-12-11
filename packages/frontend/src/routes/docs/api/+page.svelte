<script lang="ts">
    import Breadcrumbs from "$lib/components/docs/Breadcrumbs.svelte";
    import CodeBlock from "$lib/components/docs/CodeBlock.svelte";
    import { Badge } from "$lib/components/ui/badge";
</script>

<div class="docs-content">
    <Breadcrumbs />

    <h1 class="text-3xl font-bold mb-4">API Reference</h1>
    <p class="text-lg text-muted-foreground mb-4">
        Complete API documentation for LogWard.
    </p>
    <div class="mb-8 text-sm">
        <p class="font-semibold mb-2">Base URL:</p>
        <ul class="space-y-1 ml-4">
            <li><strong>Cloud:</strong> <code class="px-1.5 py-0.5 bg-muted rounded">https://api.logward.dev/api/v1</code></li>
            <li><strong>Self-Hosted:</strong> <code class="px-1.5 py-0.5 bg-muted rounded">http://localhost:8080/api/v1</code> (or your domain)</li>
        </ul>
    </div>

    <h2
        id="authentication"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Authentication
    </h2>

    <div class="mb-8 space-y-4">
        <p>LogWard uses two authentication methods:</p>

        <div class="space-y-6">
            <div>
                <h3 class="text-lg font-semibold mb-2 flex items-center gap-2">
                    1. Session-based Authentication (Bearer Token)
                    <Badge variant="secondary">Dashboard</Badge>
                </h3>
                <p class="text-muted-foreground mb-4">
                    For dashboard and user-facing endpoints (organizations,
                    projects, alerts).
                </p>

                <CodeBlock
                    lang="bash"
                    code={`# Login to get token
curl -X POST http://localhost:8080/api/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "user@example.com",
    "password": "your_password"
  }'

# Use token in requests
curl http://localhost:8080/api/v1/organizations \\
  -H "Authorization: Bearer your_token_here"`}
                />
            </div>

            <div>
                <h3 class="text-lg font-semibold mb-2 flex items-center gap-2">
                    2. API Key Authentication
                    <Badge variant="secondary">Logs</Badge>
                </h3>
                <p class="text-muted-foreground mb-4">
                    For log ingestion and query endpoints. API keys are
                    project-scoped and prefixed with <code>lp_</code>.
                </p>

                <CodeBlock
                    lang="bash"
                    code={`curl -X POST http://localhost:8080/api/v1/ingest \\
  -H "X-API-Key: lp_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"logs": [...]}'`}
                />
            </div>
        </div>
    </div>

    <h2
        id="ingestion"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Log Ingestion
    </h2>

    <div class="mb-8">
        <h3 id="post-ingest" class="text-lg font-semibold mb-3 scroll-mt-20">
            <Badge>POST</Badge> <code class="ml-2">/api/v1/ingest</code>
        </h3>
        <p class="text-muted-foreground mb-4">
            Ingest logs in batch (max 1000 logs per request).
        </p>

        <div class="mb-4">
            <h4 class="font-semibold mb-2">Request Body</h4>
            <CodeBlock
                lang="json"
                code={`{
  "logs": [
    {
      "time": "2025-01-15T10:30:00Z",
      "service": "api-gateway",
      "level": "error",
      "message": "Database connection timeout",
      "metadata": {
        "user_id": 123,
        "endpoint": "/api/users",
        "duration_ms": 5000
      },
      "trace_id": "550e8400-e29b-41d4-a716-446655440000"
    }
  ]
}`}
            />
        </div>

        <div class="mb-4">
            <h4 class="font-semibold mb-2">Schema</h4>
            <ul class="space-y-1 ml-6 text-sm text-muted-foreground">
                <li>
                    <code>time</code> (string, required) - ISO 8601 timestamp
                </li>
                <li>
                    <code>service</code> (string, required) - Service name (max 100
                    chars)
                </li>
                <li>
                    <code>level</code> (string, required) - Log level: debug, info,
                    warn, error, critical
                </li>
                <li><code>message</code> (string, required) - Log message</li>
                <li>
                    <code>metadata</code> (object, optional) - Additional structured
                    data (JSON)
                </li>
                <li>
                    <code>trace_id</code> (string, optional) - Distributed tracing
                    ID (UUID format)
                </li>
            </ul>
        </div>

        <div>
            <h4 class="font-semibold mb-2">Response (200 OK)</h4>
            <CodeBlock
                lang="json"
                code={`{
  "received": 1,
  "timestamp": "2025-01-15T10:30:02Z"
}`}
            />
        </div>
    </div>

    <h2
        id="query"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Log Query
    </h2>

    <div class="mb-8">
        <h3 id="get-logs" class="text-lg font-semibold mb-3 scroll-mt-20">
            <Badge variant="outline">GET</Badge>
            <code class="ml-2">/api/v1/logs</code>
        </h3>
        <p class="text-muted-foreground mb-4">
            Search and filter logs with various parameters.
        </p>

        <div class="mb-4">
            <h4 class="font-semibold mb-2">Query Parameters</h4>
            <ul class="space-y-1 ml-6 text-sm text-muted-foreground">
                <li>
                    <code>service</code> (optional) - Filter by service name
                </li>
                <li>
                    <code>level</code> (optional) - Filter by level (debug, info,
                    warn, error, critical)
                </li>
                <li><code>from</code> (optional) - Start time (ISO 8601)</li>
                <li><code>to</code> (optional) - End time (ISO 8601)</li>
                <li><code>q</code> (optional) - Full-text search on message</li>
                <li>
                    <code>limit</code> (optional) - Results per page (default: 100,
                    max: 1000)
                </li>
                <li>
                    <code>offset</code> (optional) - Pagination offset (default:
                    0)
                </li>
            </ul>
        </div>

        <div class="mb-4">
            <h4 class="font-semibold mb-2">Examples</h4>
            <CodeBlock
                lang="bash"
                code={`# Get all error logs
curl "http://localhost:8080/api/v1/logs?level=error&limit=50" \\
  -H "X-API-Key: lp_your_api_key_here"

# Filter by service and time range
curl "http://localhost:8080/api/v1/logs?service=api-gateway&from=2025-01-15T00:00:00Z&to=2025-01-15T23:59:59Z" \\
  -H "X-API-Key: lp_your_api_key_here"

# Full-text search
curl "http://localhost:8080/api/v1/logs?q=timeout&limit=20" \\
  -H "X-API-Key: lp_your_api_key_here"`}
            />
        </div>
    </div>

    <h2
        id="stream"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Live Streaming
    </h2>

    <div class="mb-8">
        <h3 id="get-stream" class="text-lg font-semibold mb-3 scroll-mt-20">
            <Badge variant="outline">GET</Badge>
            <code class="ml-2">/api/v1/logs/stream</code>
        </h3>
        <p class="text-muted-foreground mb-4">
            Live tail logs via Server-Sent Events (SSE).
        </p>

        <div class="mb-4">
            <h4 class="font-semibold mb-2">cURL Example</h4>
            <CodeBlock
                lang="bash"
                code={`curl -N "http://localhost:8080/api/v1/logs/stream?service=api-gateway" \\
  -H "X-API-Key: lp_your_api_key_here"`}
            />
        </div>

        <div>
            <h4 class="font-semibold mb-2">JavaScript Example</h4>
            <CodeBlock
                lang="javascript"
                code={`const eventSource = new EventSource(
  'http://localhost:8080/api/v1/logs/stream?service=api-gateway',
  {
    headers: {
      'X-API-Key': 'lp_your_api_key_here'
    }
  }
);

eventSource.addEventListener('log', (event) => {
  const log = JSON.parse(event.data);
  console.log('New log:', log);
});

eventSource.onerror = (error) => {
  console.error('SSE error:', error);
};`}
            />
        </div>
    </div>

    <h2
        id="alerts"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Alerts
    </h2>

    <div class="mb-8">
        <h3 id="get-alerts" class="text-lg font-semibold mb-3 scroll-mt-20">
            <Badge variant="outline">GET</Badge>
            <code class="ml-2">/api/v1/projects/:projectId/alerts</code>
        </h3>
        <p class="text-muted-foreground mb-4">
            List all alert rules for a project.
        </p>

        <div class="mb-6">
            <h4 class="font-semibold mb-2">Example</h4>
            <CodeBlock
                lang="bash"
                code={`curl http://localhost:8080/api/v1/projects/project-uuid/alerts \\
  -H "Authorization: Bearer your_token_here"`}
            />
        </div>

        <h3 id="post-alert" class="text-lg font-semibold mb-3 scroll-mt-20">
            <Badge>POST</Badge>
            <code class="ml-2">/api/v1/projects/:projectId/alerts</code>
        </h3>
        <p class="text-muted-foreground mb-4">Create a new alert rule.</p>

        <div>
            <h4 class="font-semibold mb-2">Example</h4>
            <CodeBlock
                lang="bash"
                code={`curl -X POST http://localhost:8080/api/v1/projects/project-uuid/alerts \\
  -H "Authorization: Bearer your_token_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "High Error Rate Alert",
    "condition": {
      "field": "level",
      "operator": "equals",
      "value": "error",
      "threshold": 100,
      "timeWindow": "5m"
    },
    "notifications": [
      {
        "type": "email",
        "config": {
          "recipients": ["ops@example.com"]
        }
      }
    ],
    "enabled": true
  }'`}
            />
        </div>
    </div>

    <h2
        id="error-handling"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Error Handling
    </h2>

    <div class="mb-8">
        <p class="mb-4">All errors follow this format:</p>

        <CodeBlock
            lang="json"
            code={`{
  "error": "Error message description",
  "code": "ERROR_CODE",
  "statusCode": 400
}`}
        />

        <div class="mt-4">
            <h4 class="font-semibold mb-2">Common HTTP Status Codes</h4>
            <ul class="space-y-1 ml-6 text-sm text-muted-foreground">
                <li><code>200 OK</code> - Success</li>
                <li><code>201 Created</code> - Resource created</li>
                <li><code>400 Bad Request</code> - Invalid input</li>
                <li>
                    <code>401 Unauthorized</code> - Missing or invalid authentication
                </li>
                <li><code>403 Forbidden</code> - Not authorized</li>
                <li><code>404 Not Found</code> - Resource not found</li>
                <li>
                    <code>429 Too Many Requests</code> - Rate limit exceeded
                </li>
                <li><code>500 Internal Server Error</code> - Server error</li>
            </ul>
        </div>
    </div>
</div>

<style>
    .docs-content :global(code:not(pre code)) {
        @apply px-1.5 py-0.5 bg-muted rounded text-sm font-mono;
    }
</style>
