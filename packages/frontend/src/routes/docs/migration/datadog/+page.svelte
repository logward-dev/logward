<script lang="ts">
    import Breadcrumbs from "$lib/components/docs/Breadcrumbs.svelte";
    import CodeBlock from "$lib/components/docs/CodeBlock.svelte";
    import {
        Card,
        CardContent,
        CardHeader,
        CardTitle,
    } from "$lib/components/ui/card";
    import { Badge } from "$lib/components/ui/badge";
    import { Check, X, AlertCircle, DollarSign, Clock, ArrowRight } from "lucide-svelte";
</script>

<div class="docs-content">
    <Breadcrumbs />

    <div class="flex items-center justify-between mb-4">
        <h1 class="text-3xl font-bold">Migrate from Datadog</h1>
        <div class="flex items-center gap-2">
            <Badge variant="outline" class="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                Medium
            </Badge>
            <Badge variant="secondary">
                <Clock class="w-3 h-3 mr-1" />
                4-8 hours
            </Badge>
        </div>
    </div>

    <p class="text-lg text-muted-foreground mb-8">
        Migrate from Datadog's proprietary platform to LogWard and save up to 90% on log management costs
        while gaining full data ownership and built-in SIEM capabilities.
    </p>

    <h2
        id="why-migrate"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Why Migrate from Datadog?
    </h2>

    <div class="mb-8 grid md:grid-cols-2 gap-4">
        <Card>
            <CardContent class="pt-4">
                <div class="flex items-start gap-3">
                    <DollarSign class="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                        <h3 class="font-semibold mb-1">Massive Cost Savings</h3>
                        <p class="text-sm text-muted-foreground">
                            Datadog charges $0.10-$1.70/GB for log ingestion. A 500 GB/day deployment
                            can cost $15,000+/month. LogWard is self-hosted with zero per-GB fees.
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>

        <Card>
            <CardContent class="pt-4">
                <div class="flex items-start gap-3">
                    <Check class="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                        <h3 class="font-semibold mb-1">Full Data Ownership</h3>
                        <p class="text-sm text-muted-foreground">
                            Your logs never leave your infrastructure. No data sent to third parties.
                            Full GDPR compliance with EU data sovereignty.
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>

        <Card>
            <CardContent class="pt-4">
                <div class="flex items-start gap-3">
                    <Check class="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                        <h3 class="font-semibold mb-1">Built-in SIEM</h3>
                        <p class="text-sm text-muted-foreground">
                            Sigma detection rules, threat detection, and incident management included.
                            Datadog Cloud SIEM costs extra ($0.20/GB on top of log costs).
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>

        <Card>
            <CardContent class="pt-4">
                <div class="flex items-start gap-3">
                    <Check class="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                        <h3 class="font-semibold mb-1">Unlimited Users</h3>
                        <p class="text-sm text-muted-foreground">
                            No per-seat licensing. Add your entire team without worrying about
                            per-user costs or role-based pricing tiers.
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    </div>

    <h2
        id="feature-comparison"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Feature Comparison
    </h2>

    <div class="mb-8 overflow-x-auto">
        <table class="w-full text-sm border border-border rounded-lg">
            <thead class="bg-muted">
                <tr>
                    <th class="px-4 py-3 text-left border-b border-border">Feature</th>
                    <th class="px-4 py-3 text-left border-b border-border">Datadog</th>
                    <th class="px-4 py-3 text-left border-b border-border">LogWard</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Log Ingestion (HTTP API)</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">SDKs (Node.js, Python, etc.)</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">OpenTelemetry Support</td>
                    <td class="px-4 py-3 border-b border-border"><span class="text-yellow-600">Partial</span> (Logs only)</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Native OTLP</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Full-text Search</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Real-time Streaming</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> SSE</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Alert Rules</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Email/Webhook Notifications</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Trace Correlation</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Sigma Rules (SIEM)</td>
                    <td class="px-4 py-3 border-b border-border"><X class="w-4 h-4 text-red-500 inline" /> No</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Built-in</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Incident Management</td>
                    <td class="px-4 py-3 border-b border-border"><span class="text-yellow-600">Cloud SIEM</span> ($0.20/GB)</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Included</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">MITRE ATT&CK Mapping</td>
                    <td class="px-4 py-3 border-b border-border"><span class="text-yellow-600">Cloud SIEM</span></td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Included</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Self-hosted Option</td>
                    <td class="px-4 py-3 border-b border-border"><X class="w-4 h-4 text-red-500 inline" /> No</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 font-medium">Pricing</td>
                    <td class="px-4 py-3">$0.10-$1.70/GB + per-user</td>
                    <td class="px-4 py-3"><span class="text-green-600 font-medium">Infrastructure only</span></td>
                </tr>
            </tbody>
        </table>
    </div>

    <h2
        id="step-1"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Step 1: Inventory Your Datadog Setup
    </h2>

    <div class="mb-8">
        <p class="mb-4">
            Before migrating, document your existing Datadog configuration:
        </p>

        <Card class="mb-4">
            <CardContent class="pt-4">
                <h3 class="font-semibold mb-3">What to Document</h3>
                <ul class="space-y-2 text-sm">
                    <li class="flex items-start gap-2">
                        <Check class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>Log sources:</strong> List all services/hosts sending logs to Datadog</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <Check class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>Log volume:</strong> Check your usage dashboard for average GB/day</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <Check class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>Active monitors:</strong> Export all log-based monitors via API</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <Check class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>Dashboards:</strong> Screenshot or export critical dashboards</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <Check class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>Log pipelines:</strong> Document parsing rules and processors</span>
                    </li>
                </ul>
            </CardContent>
        </Card>

        <p class="mb-4">Export your Datadog configuration using the API:</p>

        <CodeBlock
            lang="bash"
            code={`# Export all log monitors
curl -X GET "https://api.datadoghq.com/api/v1/monitor" \\
  -H "DD-API-KEY: \${DD_API_KEY}" \\
  -H "DD-APPLICATION-KEY: \${DD_APP_KEY}" > monitors.json

# Export all dashboards
curl -X GET "https://api.datadoghq.com/api/v1/dashboard" \\
  -H "DD-API-KEY: \${DD_API_KEY}" \\
  -H "DD-APPLICATION-KEY: \${DD_APP_KEY}" > dashboards.json`}
        />
    </div>

    <h2
        id="step-2"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Step 2: Deploy LogWard
    </h2>

    <div class="mb-8">
        <p class="mb-4">
            Follow the <a href="/docs/deployment" class="text-primary hover:underline">Deployment Guide</a> to set up LogWard.
            Here's a quick start:
        </p>

        <CodeBlock
            lang="bash"
            code={`# Clone and configure
git clone https://github.com/logward-dev/logward.git
cd logward/docker

# Copy and edit environment
cp .env.example .env
# Edit .env: Set PUBLIC_API_URL, database passwords, etc.

# Start LogWard
docker compose up -d

# Verify deployment
curl http://localhost:8080/health`}
        />

        <Card class="mt-4">
            <CardContent class="pt-4">
                <h3 class="font-semibold mb-2">Recommended Specs (for 500 GB/day)</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                        <span class="text-muted-foreground">CPU:</span>
                        <span class="font-medium ml-2">8 cores</span>
                    </div>
                    <div>
                        <span class="text-muted-foreground">RAM:</span>
                        <span class="font-medium ml-2">32 GB</span>
                    </div>
                    <div>
                        <span class="text-muted-foreground">Disk:</span>
                        <span class="font-medium ml-2">2 TB SSD</span>
                    </div>
                    <div>
                        <span class="text-muted-foreground">Network:</span>
                        <span class="font-medium ml-2">1 Gbps</span>
                    </div>
                </div>
            </CardContent>
        </Card>

        <p class="mt-4 mb-4">
            After deployment, create your organization and project via the UI at <code>http://localhost:3000</code>,
            then generate an API key from the project settings.
        </p>
    </div>

    <h2
        id="step-3"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Step 3: SDK Migration
    </h2>

    <div class="mb-8">
        <p class="mb-4">
            Replace Datadog SDK with LogWard SDK. The API is similar, making migration straightforward.
        </p>

        <h3 class="text-lg font-semibold mb-3">Node.js Migration</h3>

        <div class="grid md:grid-cols-2 gap-4 mb-6">
            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">Before (Datadog)</CardTitle>
                </CardHeader>
                <CardContent>
                    <CodeBlock
                        lang="typescript"
                        code={`import { datadogLogs } from '@datadog/browser-logs';

datadogLogs.init({
  clientToken: 'pub_xxx',
  site: 'datadoghq.com',
  service: 'my-app',
  env: 'production',
});

datadogLogs.logger.info('User logged in', {
  userId: 123,
  email: 'user@example.com'
});`}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">After (LogWard)</CardTitle>
                </CardHeader>
                <CardContent>
                    <CodeBlock
                        lang="typescript"
                        code={`import { LogWardClient } from '@logward-dev/sdk-node';

const client = new LogWardClient({
  apiUrl: 'http://logward.internal:8080',
  apiKey: 'lp_xxx',
  globalMetadata: { env: 'production' }
});

client.info('my-app', 'User logged in', {
  userId: 123,
  email: 'user@example.com'
});`}
                    />
                </CardContent>
            </Card>
        </div>

        <h3 class="text-lg font-semibold mb-3">Python Migration</h3>

        <div class="grid md:grid-cols-2 gap-4 mb-6">
            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">Before (Datadog)</CardTitle>
                </CardHeader>
                <CardContent>
                    <CodeBlock
                        lang="python"
                        code={`from datadog import initialize, statsd
from ddtrace import tracer

initialize(api_key='xxx', app_key='yyy')

@tracer.wrap()
def process_request():
    statsd.increment('requests')
    # Datadog auto-instruments logs`}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">After (LogWard)</CardTitle>
                </CardHeader>
                <CardContent>
                    <CodeBlock
                        lang="python"
                        code={`from logward_sdk import LogWardClient

client = LogWardClient(
    api_url='http://logward.internal:8080',
    api_key='lp_xxx',
    global_metadata={'env': 'production'}
)

def process_request():
    client.info('api', 'Processing request')
    # Your business logic`}
                    />
                </CardContent>
            </Card>
        </div>

        <h3 class="text-lg font-semibold mb-3">Method Mapping</h3>

        <div class="overflow-x-auto">
            <table class="w-full text-sm border border-border rounded-lg">
                <thead class="bg-muted">
                    <tr>
                        <th class="px-4 py-2 text-left border-b border-border">Datadog</th>
                        <th class="px-4 py-2 text-left border-b border-border">LogWard</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">logger.debug(message, context)</td>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">client.debug(service, message, metadata)</td>
                    </tr>
                    <tr>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">logger.info(message, context)</td>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">client.info(service, message, metadata)</td>
                    </tr>
                    <tr>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">logger.warn(message, context)</td>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">client.warn(service, message, metadata)</td>
                    </tr>
                    <tr>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">logger.error(message, context)</td>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">client.error(service, message, metadata)</td>
                    </tr>
                    <tr>
                        <td class="px-4 py-2 font-mono text-xs">N/A</td>
                        <td class="px-4 py-2 font-mono text-xs">client.critical(service, message, metadata)</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <h2
        id="step-4"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Step 4: Alert Migration
    </h2>

    <div class="mb-8">
        <p class="mb-4">
            Convert your Datadog monitors to LogWard alert rules. Here's how the formats map:
        </p>

        <div class="grid md:grid-cols-2 gap-4 mb-6">
            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">Datadog Monitor</CardTitle>
                </CardHeader>
                <CardContent>
                    <CodeBlock
                        lang="json"
                        code={`{
  "name": "High Error Rate",
  "type": "log alert",
  "query": "status:error service:api",
  "message": "Error rate exceeded",
  "options": {
    "thresholds": { "critical": 100 },
    "evaluation_delay": 60
  }
}`}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">LogWard Alert Rule</CardTitle>
                </CardHeader>
                <CardContent>
                    <CodeBlock
                        lang="json"
                        code={`{
  "name": "High Error Rate",
  "enabled": true,
  "service": "api",
  "level": ["error"],
  "threshold": 100,
  "timeWindow": 5,
  "emailRecipients": ["team@example.com"],
  "webhookUrl": "https://hooks.slack.com/..."
}`}
                    />
                </CardContent>
            </Card>
        </div>

        <p class="mb-4">Create alert rules via the LogWard API:</p>

        <CodeBlock
            lang="bash"
            code={`curl -X POST "http://logward.internal:8080/api/v1/alerts" \\
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "organizationId": "your-org-id",
    "projectId": "your-project-id",
    "name": "High Error Rate",
    "enabled": true,
    "service": "api",
    "level": ["error"],
    "threshold": 100,
    "timeWindow": 5,
    "emailRecipients": ["team@example.com"]
  }'`}
        />
    </div>

    <h2
        id="step-5"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Step 5: Parallel Ingestion (Validation)
    </h2>

    <div class="mb-8">
        <p class="mb-4">
            Run both platforms in parallel for 24-48 hours to validate data consistency before cutover.
        </p>

        <Card class="mb-4">
            <CardHeader class="pb-2">
                <CardTitle class="text-base">Dual Ingestion Example</CardTitle>
            </CardHeader>
            <CardContent>
                <CodeBlock
                    lang="typescript"
                    code={`import { datadogLogs } from '@datadog/browser-logs';
import { LogWardClient } from '@logward-dev/sdk-node';

// Initialize both
datadogLogs.init({ clientToken: 'xxx', site: 'datadoghq.com' });
const logward = new LogWardClient({
  apiUrl: 'http://logward.internal:8080',
  apiKey: 'lp_xxx'
});

// Wrapper to send to both
function log(level: string, service: string, message: string, meta?: object) {
  // Send to Datadog
  datadogLogs.logger[level](message, { service, ...meta });

  // Send to LogWard
  logward[level](service, message, meta);
}

// Usage
log('info', 'api', 'Request processed', { userId: 123 });`}
                />
            </CardContent>
        </Card>

        <h3 class="text-lg font-semibold mb-3">Validation Checklist</h3>
        <ul class="space-y-2 text-sm mb-4">
            <li class="flex items-center gap-2">
                <Check class="w-4 h-4 text-muted-foreground" />
                Compare log counts in both platforms (should match within 1%)
            </li>
            <li class="flex items-center gap-2">
                <Check class="w-4 h-4 text-muted-foreground" />
                Verify search results return the same logs
            </li>
            <li class="flex items-center gap-2">
                <Check class="w-4 h-4 text-muted-foreground" />
                Test alert triggers on both platforms
            </li>
            <li class="flex items-center gap-2">
                <Check class="w-4 h-4 text-muted-foreground" />
                Confirm notification delivery (email, Slack, webhooks)
            </li>
        </ul>
    </div>

    <h2
        id="step-6"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Step 6: Cutover & Cleanup
    </h2>

    <div class="mb-8">
        <p class="mb-4">
            Once validated, complete the migration:
        </p>

        <ol class="space-y-3 text-sm mb-4">
            <li class="flex items-start gap-3">
                <span class="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">1</span>
                <span>Update production configs to use LogWard SDK only (remove Datadog SDK)</span>
            </li>
            <li class="flex items-start gap-3">
                <span class="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">2</span>
                <span>Remove Datadog Agent from all hosts (if using infrastructure monitoring, consider alternatives)</span>
            </li>
            <li class="flex items-start gap-3">
                <span class="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">3</span>
                <span>Update team runbooks and documentation to reference LogWard URLs</span>
            </li>
            <li class="flex items-start gap-3">
                <span class="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">4</span>
                <span>Cancel Datadog subscription after retention period expires</span>
            </li>
        </ol>
    </div>

    <h2
        id="concept-mapping"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Concept Mapping
    </h2>

    <div class="mb-8 overflow-x-auto">
        <table class="w-full text-sm border border-border rounded-lg">
            <thead class="bg-muted">
                <tr>
                    <th class="px-4 py-2 text-left border-b border-border">Datadog Term</th>
                    <th class="px-4 py-2 text-left border-b border-border">LogWard Equivalent</th>
                    <th class="px-4 py-2 text-left border-b border-border">Notes</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Organization</td>
                    <td class="px-4 py-2 border-b border-border">Organization</td>
                    <td class="px-4 py-2 border-b border-border">1:1 mapping</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Index</td>
                    <td class="px-4 py-2 border-b border-border">Project</td>
                    <td class="px-4 py-2 border-b border-border">Logs are scoped to projects</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Service</td>
                    <td class="px-4 py-2 border-b border-border">Service</td>
                    <td class="px-4 py-2 border-b border-border">1:1 mapping</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Log Pipeline</td>
                    <td class="px-4 py-2 border-b border-border">N/A (automatic)</td>
                    <td class="px-4 py-2 border-b border-border">LogWard auto-parses JSON</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Monitor</td>
                    <td class="px-4 py-2 border-b border-border">Alert Rule</td>
                    <td class="px-4 py-2 border-b border-border">Similar functionality</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Dashboard</td>
                    <td class="px-4 py-2 border-b border-border">SIEM Dashboard</td>
                    <td class="px-4 py-2 border-b border-border">Security-focused dashboards</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">API Key</td>
                    <td class="px-4 py-2 border-b border-border">API Key (per project)</td>
                    <td class="px-4 py-2 border-b border-border">Prefix: lp_</td>
                </tr>
                <tr>
                    <td class="px-4 py-2">Cloud SIEM</td>
                    <td class="px-4 py-2">Sigma Rules + Incidents</td>
                    <td class="px-4 py-2">Included at no extra cost</td>
                </tr>
            </tbody>
        </table>
    </div>

    <h2
        id="troubleshooting"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Common Issues
    </h2>

    <div class="mb-8 space-y-4">
        <Card>
            <CardHeader>
                <CardTitle class="text-base flex items-center gap-2">
                    <AlertCircle class="w-4 h-4 text-yellow-500" />
                    Logs not appearing in LogWard
                </CardTitle>
            </CardHeader>
            <CardContent class="text-sm text-muted-foreground">
                <ul class="list-disc pl-4 space-y-1">
                    <li>Verify API key is valid and has write permissions</li>
                    <li>Check API URL is accessible from your application</li>
                    <li>Ensure Content-Type header is <code>application/json</code></li>
                    <li>Check rate limits (default: 200 req/min per API key)</li>
                </ul>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle class="text-base flex items-center gap-2">
                    <AlertCircle class="w-4 h-4 text-yellow-500" />
                    Timestamp mismatch
                </CardTitle>
            </CardHeader>
            <CardContent class="text-sm text-muted-foreground">
                LogWard expects ISO 8601 timestamps in UTC. Datadog may use Unix epoch.
                Ensure your SDK is sending ISO format: <code>2025-01-15T12:00:00Z</code>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle class="text-base flex items-center gap-2">
                    <AlertCircle class="w-4 h-4 text-yellow-500" />
                    Missing service name
                </CardTitle>
            </CardHeader>
            <CardContent class="text-sm text-muted-foreground">
                In Datadog, service is often auto-detected. In LogWard, you must explicitly
                pass the service name as the first argument: <code>client.info('my-service', 'message')</code>
            </CardContent>
        </Card>
    </div>

    <h2
        id="next-steps"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Next Steps
    </h2>

    <div class="mb-8">
        <div class="grid gap-3">
            <a href="/docs/sdks/nodejs" class="block">
                <Card class="transition-all hover:border-primary/50">
                    <CardContent class="pt-4 flex items-center justify-between">
                        <span class="font-medium">Node.js SDK Documentation</span>
                        <ArrowRight class="w-4 h-4" />
                    </CardContent>
                </Card>
            </a>
            <a href="/docs/api" class="block">
                <Card class="transition-all hover:border-primary/50">
                    <CardContent class="pt-4 flex items-center justify-between">
                        <span class="font-medium">API Reference</span>
                        <ArrowRight class="w-4 h-4" />
                    </CardContent>
                </Card>
            </a>
            <a href="/docs/opentelemetry" class="block">
                <Card class="transition-all hover:border-primary/50">
                    <CardContent class="pt-4 flex items-center justify-between">
                        <span class="font-medium">OpenTelemetry Integration</span>
                        <ArrowRight class="w-4 h-4" />
                    </CardContent>
                </Card>
            </a>
        </div>
    </div>
</div>

<style>
    .docs-content :global(code:not(pre code)) {
        @apply px-1.5 py-0.5 bg-muted rounded text-sm font-mono;
    }
</style>
