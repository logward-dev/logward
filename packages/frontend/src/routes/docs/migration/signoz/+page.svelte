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
    import { Check, X, AlertCircle, Clock, ArrowRight, Shield, Zap } from "lucide-svelte";
</script>

<div class="docs-content">
    <Breadcrumbs />

    <div class="flex items-center justify-between mb-4">
        <h1 class="text-3xl font-bold">Migrate from SigNoz</h1>
        <div class="flex items-center gap-2">
            <Badge variant="outline" class="bg-green-500/10 text-green-600 border-green-500/20">
                Easy
            </Badge>
            <Badge variant="secondary">
                <Clock class="w-3 h-3 mr-1" />
                2-4 hours
            </Badge>
        </div>
    </div>

    <p class="text-lg text-muted-foreground mb-8">
        Migrate from SigNoz to LogWard for enhanced security capabilities including
        Sigma detection rules, incident management, and MITRE ATT&CK mapping.
        Both platforms support OpenTelemetry, making the transition seamless.
    </p>

    <h2
        id="why-migrate"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Why Migrate from SigNoz?
    </h2>

    <div class="mb-8 grid md:grid-cols-2 gap-4">
        <Card>
            <CardContent class="pt-4">
                <div class="flex items-start gap-3">
                    <Shield class="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                        <h3 class="font-semibold mb-1">Built-in SIEM</h3>
                        <p class="text-sm text-muted-foreground">
                            LogWard includes Sigma detection rules, incident management, and
                            MITRE ATT&CK mapping. SigNoz focuses on observability, not security.
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>

        <Card>
            <CardContent class="pt-4">
                <div class="flex items-start gap-3">
                    <Zap class="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                        <h3 class="font-semibold mb-1">Simpler Architecture</h3>
                        <p class="text-sm text-muted-foreground">
                            SigNoz uses ClickHouse which requires tuning. LogWard uses
                            PostgreSQL/TimescaleDB for easier operations.
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
                        <h3 class="font-semibold mb-1">Native OpenTelemetry</h3>
                        <p class="text-sm text-muted-foreground">
                            Both platforms support OTLP natively. Your existing OTel
                            instrumentation works unchanged - just update the endpoint.
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
                        <h3 class="font-semibold mb-1">Threat Detection</h3>
                        <p class="text-sm text-muted-foreground">
                            Security-focused organizations need detection capabilities.
                            LogWard's Sigma rules provide enterprise-grade threat detection.
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
                    <th class="px-4 py-3 text-left border-b border-border">SigNoz</th>
                    <th class="px-4 py-3 text-left border-b border-border">LogWard</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">OpenTelemetry</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Native OTLP</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Native OTLP</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Logs</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Traces</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes (via OTLP)</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Metrics</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                    <td class="px-4 py-3 border-b border-border"><span class="text-yellow-600">Roadmap</span></td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Alerting</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Sigma Rules</td>
                    <td class="px-4 py-3 border-b border-border"><X class="w-4 h-4 text-red-500 inline" /> No</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Built-in</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Incident Management</td>
                    <td class="px-4 py-3 border-b border-border"><X class="w-4 h-4 text-red-500 inline" /> No</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Built-in</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">MITRE ATT&CK</td>
                    <td class="px-4 py-3 border-b border-border"><X class="w-4 h-4 text-red-500 inline" /> No</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Built-in</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Database</td>
                    <td class="px-4 py-3 border-b border-border">ClickHouse</td>
                    <td class="px-4 py-3 border-b border-border">TimescaleDB</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Custom SDKs</td>
                    <td class="px-4 py-3 border-b border-border"><X class="w-4 h-4 text-red-500 inline" /> OTel only</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> OTel + Custom</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 font-medium">Pricing</td>
                    <td class="px-4 py-3">Open-source</td>
                    <td class="px-4 py-3"><span class="text-green-600 font-medium">Open-source</span></td>
                </tr>
            </tbody>
        </table>
    </div>

    <h2
        id="step-1"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Step 1: Deploy LogWard
    </h2>

    <div class="mb-8">
        <p class="mb-4">
            See the <a href="/docs/deployment" class="text-primary hover:underline">Deployment Guide</a> for full instructions:
        </p>

        <CodeBlock
            lang="bash"
            code={`# Clone LogWard
git clone https://github.com/logward-dev/logward.git
cd logward/docker

# Configure
cp .env.example .env
# Edit .env with your settings

# Start
docker compose up -d

# Verify
curl http://localhost:8080/health`}
        />

        <p class="mt-4">
            Create your organization and project via the UI, then generate an API key.
        </p>
    </div>

    <h2
        id="step-2"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Step 2: Update OpenTelemetry Endpoint
    </h2>

    <div class="mb-8">
        <p class="mb-4">
            Since both platforms use OTLP, migration is straightforward - just update the endpoint URL:
        </p>

        <h3 class="text-lg font-semibold mb-3">Node.js (OpenTelemetry SDK)</h3>

        <div class="grid md:grid-cols-2 gap-4 mb-6">
            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">Before (SigNoz)</CardTitle>
                </CardHeader>
                <CardContent>
                    <CodeBlock
                        lang="typescript"
                        code={`const logExporter = new OTLPLogExporter({
  url: 'http://signoz:4318/v1/logs',
  headers: {},
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
                        code={`const logExporter = new OTLPLogExporter({
  url: 'http://logward:8080/api/v1/otlp/logs',
  headers: {
    'X-API-Key': 'lp_your_api_key'
  },
});`}
                    />
                </CardContent>
            </Card>
        </div>

        <h3 class="text-lg font-semibold mb-3">Python (OpenTelemetry SDK)</h3>

        <div class="grid md:grid-cols-2 gap-4 mb-6">
            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">Before (SigNoz)</CardTitle>
                </CardHeader>
                <CardContent>
                    <CodeBlock
                        lang="python"
                        code={`exporter = OTLPLogExporter(
    endpoint="http://signoz:4318/v1/logs",
)`}
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
                        code={`exporter = OTLPLogExporter(
    endpoint="http://logward:8080/api/v1/otlp/logs",
    headers={"X-API-Key": "lp_your_api_key"},
)`}
                    />
                </CardContent>
            </Card>
        </div>

        <h3 class="text-lg font-semibold mb-3">OpenTelemetry Collector</h3>

        <p class="mb-4">
            If you're using the OTel Collector, update the exporter configuration:
        </p>

        <div class="grid md:grid-cols-2 gap-4">
            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">Before (SigNoz)</CardTitle>
                </CardHeader>
                <CardContent>
                    <CodeBlock
                        lang="yaml"
                        code={`exporters:
  otlp:
    endpoint: signoz-otel-collector:4317
    tls:
      insecure: true

service:
  pipelines:
    logs:
      exporters: [otlp]`}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">After (LogWard)</CardTitle>
                </CardHeader>
                <CardContent>
                    <CodeBlock
                        lang="yaml"
                        code={`exporters:
  otlphttp/logward:
    endpoint: http://logward:8080
    headers:
      X-API-Key: lp_your_api_key

service:
  pipelines:
    logs:
      exporters: [otlphttp/logward]`}
                    />
                </CardContent>
            </Card>
        </div>
    </div>

    <h2
        id="step-3"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Step 3: Migrate Alerts
    </h2>

    <div class="mb-8">
        <p class="mb-4">
            SigNoz and LogWard have similar alert concepts. Convert your alert rules:
        </p>

        <div class="grid md:grid-cols-2 gap-4">
            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">SigNoz Alert</CardTitle>
                </CardHeader>
                <CardContent>
                    <CodeBlock
                        lang="yaml"
                        code={`name: High Error Rate
description: Errors exceeded threshold
severity: critical
rule:
  type: log_based
  query: level = "error"
  threshold: 100
  duration: 5m
notification:
  channels:
    - email
    - slack`}
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
  "level": ["error"],
  "threshold": 100,
  "timeWindow": 5,
  "emailRecipients": [
    "team@example.com"
  ],
  "webhookUrl": "https://hooks.slack.com/..."
}`}
                    />
                </CardContent>
            </Card>
        </div>
    </div>

    <h2
        id="step-4"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Step 4: Enable Security Features
    </h2>

    <div class="mb-8">
        <p class="mb-4">
            LogWard's key advantage over SigNoz is built-in security capabilities:
        </p>

        <Card class="mb-4">
            <CardContent class="pt-4">
                <h3 class="font-semibold mb-3">Enable Sigma Detection</h3>
                <ol class="space-y-2 text-sm">
                    <li class="flex items-start gap-2">
                        <span class="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">1</span>
                        <span>Navigate to <code>/dashboard/security/sigma</code></span>
                    </li>
                    <li class="flex items-start gap-2">
                        <span class="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">2</span>
                        <span>Import Sigma rules from YAML or sync from SigmaHQ</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <span class="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">3</span>
                        <span>Enable rules for your log sources</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <span class="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">4</span>
                        <span>Configure alert notifications for detections</span>
                    </li>
                </ol>
            </CardContent>
        </Card>

        <p class="mb-4">Example Sigma rule for detecting suspicious activity:</p>

        <CodeBlock
            lang="yaml"
            code={`title: Multiple Failed Login Attempts
status: stable
level: medium
logsource:
    category: authentication
    product: custom
detection:
    selection:
        message|contains: "login failed"
    timeframe: 5m
    condition: selection | count() > 10
tags:
    - attack.credential_access
    - attack.t1110`}
        />
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
                    <th class="px-4 py-2 text-left border-b border-border">SigNoz Term</th>
                    <th class="px-4 py-2 text-left border-b border-border">LogWard Equivalent</th>
                    <th class="px-4 py-2 text-left border-b border-border">Notes</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Service</td>
                    <td class="px-4 py-2 border-b border-border">Service</td>
                    <td class="px-4 py-2 border-b border-border">1:1 mapping (from OTel resource)</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Trace</td>
                    <td class="px-4 py-2 border-b border-border">trace_id</td>
                    <td class="px-4 py-2 border-b border-border">Indexed for correlation</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Span</td>
                    <td class="px-4 py-2 border-b border-border">span_id</td>
                    <td class="px-4 py-2 border-b border-border">Indexed for correlation</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Log attributes</td>
                    <td class="px-4 py-2 border-b border-border">metadata</td>
                    <td class="px-4 py-2 border-b border-border">Stored as JSON</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Alert</td>
                    <td class="px-4 py-2 border-b border-border">Alert Rule</td>
                    <td class="px-4 py-2 border-b border-border">Similar configuration</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Dashboard</td>
                    <td class="px-4 py-2 border-b border-border">SIEM Dashboard</td>
                    <td class="px-4 py-2 border-b border-border">Security-focused</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">N/A</td>
                    <td class="px-4 py-2 border-b border-border">Sigma Rules</td>
                    <td class="px-4 py-2 border-b border-border">LogWard exclusive</td>
                </tr>
                <tr>
                    <td class="px-4 py-2">N/A</td>
                    <td class="px-4 py-2">Incidents</td>
                    <td class="px-4 py-2">LogWard exclusive</td>
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
                    OTLP endpoint format
                </CardTitle>
            </CardHeader>
            <CardContent class="text-sm text-muted-foreground">
                SigNoz uses standard OTLP port 4317/4318. LogWard uses <code>/api/v1/otlp/logs</code>
                on the main API port (8080). Update your endpoint URLs accordingly.
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle class="text-base flex items-center gap-2">
                    <AlertCircle class="w-4 h-4 text-yellow-500" />
                    Authentication required
                </CardTitle>
            </CardHeader>
            <CardContent class="text-sm text-muted-foreground">
                Unlike SigNoz, LogWard requires an API key. Add <code>X-API-Key</code> header
                to all OTLP requests. The API key is project-scoped and starts with <code>lp_</code>.
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle class="text-base flex items-center gap-2">
                    <AlertCircle class="w-4 h-4 text-yellow-500" />
                    Missing metrics support
                </CardTitle>
            </CardHeader>
            <CardContent class="text-sm text-muted-foreground">
                LogWard currently focuses on logs. Metrics support is on the roadmap.
                Continue using your existing metrics solution (Prometheus, etc.) alongside LogWard.
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
            <a href="/docs/opentelemetry" class="block">
                <Card class="transition-all hover:border-primary/50">
                    <CardContent class="pt-4 flex items-center justify-between">
                        <span class="font-medium">OpenTelemetry Integration</span>
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
            <a href="/docs/sdks" class="block">
                <Card class="transition-all hover:border-primary/50">
                    <CardContent class="pt-4 flex items-center justify-between">
                        <span class="font-medium">Custom SDKs (Node.js, Python, etc.)</span>
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
