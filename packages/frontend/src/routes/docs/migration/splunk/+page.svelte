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
    import { Check, X, AlertCircle, DollarSign, Clock, ArrowRight, Shield } from "lucide-svelte";
</script>

<div class="docs-content">
    <Breadcrumbs />

    <div class="flex items-center justify-between mb-4">
        <h1 class="text-3xl font-bold">Migrate from Splunk</h1>
        <div class="flex items-center gap-2">
            <Badge variant="outline" class="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                Medium
            </Badge>
            <Badge variant="secondary">
                <Clock class="w-3 h-3 mr-1" />
                6-12 hours
            </Badge>
        </div>
    </div>

    <p class="text-lg text-muted-foreground mb-8">
        Replace Splunk's expensive licensing model with LogWard's self-hosted solution.
        Get native Sigma rules support for security detection without vendor lock-in.
    </p>

    <h2
        id="why-migrate"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Why Migrate from Splunk?
    </h2>

    <div class="mb-8 grid md:grid-cols-2 gap-4">
        <Card>
            <CardContent class="pt-4">
                <div class="flex items-start gap-3">
                    <DollarSign class="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                        <h3 class="font-semibold mb-1">Eliminate License Costs</h3>
                        <p class="text-sm text-muted-foreground">
                            Splunk charges per GB/day indexed. Enterprise customers often pay
                            $50K-$500K+/year. LogWard is open-source with only infrastructure costs.
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>

        <Card>
            <CardContent class="pt-4">
                <div class="flex items-start gap-3">
                    <Shield class="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                        <h3 class="font-semibold mb-1">Sigma Rules (Industry Standard)</h3>
                        <p class="text-sm text-muted-foreground">
                            Replace Splunk's proprietary SPL with standard Sigma detection rules.
                            Access 2000+ community rules from SigmaHQ.
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
                        <h3 class="font-semibold mb-1">Simpler Architecture</h3>
                        <p class="text-sm text-muted-foreground">
                            No more indexer clusters, search heads, or deployment servers.
                            LogWard runs as a single Docker Compose stack.
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
                        <h3 class="font-semibold mb-1">No Data Limits</h3>
                        <p class="text-sm text-muted-foreground">
                            No daily indexing limits. Ingest as much data as your infrastructure
                            can handle without worrying about license overages.
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
                    <th class="px-4 py-3 text-left border-b border-border">Splunk</th>
                    <th class="px-4 py-3 text-left border-b border-border">LogWard</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Log Ingestion</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> HEC, Forwarders</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> HTTP API, SDKs, OTLP</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Query Language</td>
                    <td class="px-4 py-3 border-b border-border">SPL (proprietary)</td>
                    <td class="px-4 py-3 border-b border-border">REST API + Full-text</td>
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
                    <td class="px-4 py-3 border-b border-border font-medium">Alerts</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Detection Rules</td>
                    <td class="px-4 py-3 border-b border-border">Splunk ES (extra license)</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Sigma (included)</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">MITRE ATT&CK</td>
                    <td class="px-4 py-3 border-b border-border">Splunk ES</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Included</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Incident Management</td>
                    <td class="px-4 py-3 border-b border-border">Splunk ES / SOAR</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Included</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">OpenTelemetry</td>
                    <td class="px-4 py-3 border-b border-border"><span class="text-yellow-600">Partial</span></td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Native OTLP</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Self-hosted</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes (licensed)</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes (free)</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 font-medium">Pricing</td>
                    <td class="px-4 py-3">$150-$1800/GB/day</td>
                    <td class="px-4 py-3"><span class="text-green-600 font-medium">Infrastructure only</span></td>
                </tr>
            </tbody>
        </table>
    </div>

    <h2
        id="step-1"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Step 1: Inventory Your Splunk Setup
    </h2>

    <div class="mb-8">
        <p class="mb-4">Document your existing Splunk configuration:</p>

        <Card class="mb-4">
            <CardContent class="pt-4">
                <h3 class="font-semibold mb-3">What to Document</h3>
                <ul class="space-y-2 text-sm">
                    <li class="flex items-start gap-2">
                        <Check class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>Data inputs:</strong> Universal Forwarders, HEC endpoints, scripted inputs</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <Check class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>Indexes:</strong> List all indexes and their retention settings</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <Check class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>Saved searches:</strong> Export scheduled searches and alerts</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <Check class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>Dashboards:</strong> Document key dashboards and visualizations</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <Check class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>Props/transforms:</strong> Document field extractions and parsing rules</span>
                    </li>
                </ul>
            </CardContent>
        </Card>

        <p class="mb-4">Export Splunk configuration using the REST API:</p>

        <CodeBlock
            lang="bash"
            code={`# Export saved searches (alerts)
curl -k -u admin:password \\
  "https://splunk:8089/servicesNS/-/-/saved/searches?output_mode=json" \\
  > saved_searches.json

# Export dashboards
curl -k -u admin:password \\
  "https://splunk:8089/servicesNS/-/-/data/ui/views?output_mode=json" \\
  > dashboards.json

# List all indexes
curl -k -u admin:password \\
  "https://splunk:8089/services/data/indexes?output_mode=json"`}
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
            See the <a href="/docs/deployment" class="text-primary hover:underline">Deployment Guide</a> for full instructions.
            Quick start:
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
        id="step-3"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Step 3: Replace Universal Forwarder
    </h2>

    <div class="mb-8">
        <p class="mb-4">
            Replace Splunk Universal Forwarder with Fluent Bit to send logs to LogWard.
        </p>

        <div class="grid md:grid-cols-2 gap-4 mb-6">
            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">Before (Splunk)</CardTitle>
                </CardHeader>
                <CardContent>
                    <CodeBlock
                        lang="ini"
                        code={`# inputs.conf
[monitor:///var/log/app/*.log]
index = main
sourcetype = app_logs

# outputs.conf
[tcpout]
defaultGroup = splunk_indexers

[tcpout:splunk_indexers]
server = splunk-indexer:9997`}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">After (Fluent Bit)</CardTitle>
                </CardHeader>
                <CardContent>
                    <CodeBlock
                        lang="ini"
                        code={`[SERVICE]
    Flush         1
    Log_Level     info

[INPUT]
    Name          tail
    Path          /var/log/app/*.log
    Tag           app.*

[OUTPUT]
    Name          http
    Match         *
    Host          logward.internal
    Port          8080
    URI           /api/v1/ingest
    Format        json
    Header        X-API-Key lp_xxx`}
                    />
                </CardContent>
            </Card>
        </div>

        <h3 class="text-lg font-semibold mb-3">HEC Migration</h3>
        <p class="mb-4">
            If you're using Splunk HTTP Event Collector, migrate to LogWard's HTTP API:
        </p>

        <div class="grid md:grid-cols-2 gap-4">
            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">Before (Splunk HEC)</CardTitle>
                </CardHeader>
                <CardContent>
                    <CodeBlock
                        lang="bash"
                        code={`curl -X POST \\
  "https://splunk:8088/services/collector" \\
  -H "Authorization: Splunk HEC_TOKEN" \\
  -d '{
    "event": "User logged in",
    "sourcetype": "app_logs",
    "index": "main"
  }'`}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">After (LogWard API)</CardTitle>
                </CardHeader>
                <CardContent>
                    <CodeBlock
                        lang="bash"
                        code={`curl -X POST \\
  "http://logward:8080/api/v1/ingest" \\
  -H "X-API-Key: lp_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "logs": [{
      "service": "app",
      "level": "info",
      "message": "User logged in"
    }]
  }'`}
                    />
                </CardContent>
            </Card>
        </div>
    </div>

    <h2
        id="step-4"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Step 4: Query Migration (SPL to LogWard)
    </h2>

    <div class="mb-8">
        <p class="mb-4">
            Splunk uses SPL (Search Processing Language). LogWard uses REST API parameters.
            Here's how to translate common SPL queries:
        </p>

        <div class="overflow-x-auto mb-6">
            <table class="w-full text-sm border border-border rounded-lg">
                <thead class="bg-muted">
                    <tr>
                        <th class="px-4 py-2 text-left border-b border-border">SPL Query</th>
                        <th class="px-4 py-2 text-left border-b border-border">LogWard API</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">index=main sourcetype=app_logs</td>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">GET /api/v1/logs?service=app</td>
                    </tr>
                    <tr>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">index=main level=ERROR</td>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">GET /api/v1/logs?level=error</td>
                    </tr>
                    <tr>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">index=main "connection failed"</td>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">GET /api/v1/logs?q=connection%20failed</td>
                    </tr>
                    <tr>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">index=main earliest=-1h</td>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">GET /api/v1/logs?from=2025-01-15T11:00:00Z</td>
                    </tr>
                    <tr>
                        <td class="px-4 py-2 font-mono text-xs">index=main | stats count by host</td>
                        <td class="px-4 py-2 font-mono text-xs">GET /api/v1/logs/aggregated?interval=1h</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <h2
        id="step-5"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Step 5: Alert Migration
    </h2>

    <div class="mb-8">
        <p class="mb-4">
            Convert Splunk saved searches (alerts) to LogWard alert rules:
        </p>

        <div class="grid md:grid-cols-2 gap-4 mb-6">
            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">Splunk Alert</CardTitle>
                </CardHeader>
                <CardContent>
                    <CodeBlock
                        lang="ini"
                        code={`# savedsearches.conf
[High Error Rate]
search = index=main level=ERROR
  | stats count
  | where count > 100
cron_schedule = */5 * * * *
alert_type = number of events
alert_threshold = 100
action.email.to = team@example.com`}
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
  ]
}`}
                    />
                </CardContent>
            </Card>
        </div>
    </div>

    <h2
        id="step-6"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Step 6: Security Detection Migration
    </h2>

    <div class="mb-8">
        <p class="mb-4">
            If you're using Splunk Enterprise Security, migrate to LogWard's Sigma-based detection:
        </p>

        <Card class="mb-4">
            <CardContent class="pt-4">
                <h3 class="font-semibold mb-3">Benefits of Sigma Rules</h3>
                <ul class="space-y-2 text-sm">
                    <li class="flex items-center gap-2">
                        <Check class="w-4 h-4 text-green-500" />
                        <span>Industry standard format (not vendor-locked)</span>
                    </li>
                    <li class="flex items-center gap-2">
                        <Check class="w-4 h-4 text-green-500" />
                        <span>2000+ community rules from SigmaHQ</span>
                    </li>
                    <li class="flex items-center gap-2">
                        <Check class="w-4 h-4 text-green-500" />
                        <span>MITRE ATT&CK mapping included</span>
                    </li>
                    <li class="flex items-center gap-2">
                        <Check class="w-4 h-4 text-green-500" />
                        <span>No additional licensing required</span>
                    </li>
                </ul>
            </CardContent>
        </Card>

        <p class="mb-4">Example Sigma rule for detecting suspicious PowerShell:</p>

        <CodeBlock
            lang="yaml"
            code={`title: Suspicious PowerShell Command
status: stable
level: high
logsource:
    category: process_creation
    product: windows
detection:
    selection:
        CommandLine|contains:
            - '-enc'
            - '-EncodedCommand'
            - 'IEX'
            - 'Invoke-Expression'
    condition: selection
tags:
    - attack.execution
    - attack.t1059.001`}
        />

        <p class="mt-4">
            Import Sigma rules via the LogWard UI at <code>/dashboard/security/sigma</code>.
        </p>
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
                    <th class="px-4 py-2 text-left border-b border-border">Splunk Term</th>
                    <th class="px-4 py-2 text-left border-b border-border">LogWard Equivalent</th>
                    <th class="px-4 py-2 text-left border-b border-border">Notes</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Index</td>
                    <td class="px-4 py-2 border-b border-border">Project</td>
                    <td class="px-4 py-2 border-b border-border">One Splunk index = One LogWard project</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Sourcetype</td>
                    <td class="px-4 py-2 border-b border-border">Service</td>
                    <td class="px-4 py-2 border-b border-border">Use service field to differentiate log sources</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Host</td>
                    <td class="px-4 py-2 border-b border-border">metadata.host</td>
                    <td class="px-4 py-2 border-b border-border">Store in metadata JSON field</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Source</td>
                    <td class="px-4 py-2 border-b border-border">metadata.source</td>
                    <td class="px-4 py-2 border-b border-border">Store in metadata JSON field</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Universal Forwarder</td>
                    <td class="px-4 py-2 border-b border-border">Fluent Bit / SDK</td>
                    <td class="px-4 py-2 border-b border-border">Use Fluent Bit or application SDK</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">HEC</td>
                    <td class="px-4 py-2 border-b border-border">POST /api/v1/ingest</td>
                    <td class="px-4 py-2 border-b border-border">HTTP API endpoint</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Saved Search</td>
                    <td class="px-4 py-2 border-b border-border">Alert Rule</td>
                    <td class="px-4 py-2 border-b border-border">Threshold-based alerts</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Enterprise Security</td>
                    <td class="px-4 py-2 border-b border-border">Sigma Rules + SIEM</td>
                    <td class="px-4 py-2 border-b border-border">Built-in, no extra license</td>
                </tr>
                <tr>
                    <td class="px-4 py-2">props.conf / transforms.conf</td>
                    <td class="px-4 py-2">N/A (auto JSON parsing)</td>
                    <td class="px-4 py-2">Send structured JSON logs</td>
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
                    Field extraction differences
                </CardTitle>
            </CardHeader>
            <CardContent class="text-sm text-muted-foreground">
                Splunk auto-extracts fields with props.conf. LogWard expects JSON logs.
                Use Fluent Bit parsers to structure logs before sending, or update your
                application to emit JSON.
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle class="text-base flex items-center gap-2">
                    <AlertCircle class="w-4 h-4 text-yellow-500" />
                    SPL queries don't translate directly
                </CardTitle>
            </CardHeader>
            <CardContent class="text-sm text-muted-foreground">
                Complex SPL with pipes, stats, and evals need to be rethought.
                Use LogWard's aggregation API for time-series stats. For complex
                transformations, consider processing in your application.
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle class="text-base flex items-center gap-2">
                    <AlertCircle class="w-4 h-4 text-yellow-500" />
                    Missing _time field
                </CardTitle>
            </CardHeader>
            <CardContent class="text-sm text-muted-foreground">
                LogWard uses <code>time</code> field (ISO 8601 format), not <code>_time</code>.
                Ensure your log shipper sets the correct timestamp field.
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
            <a href="/docs/api" class="block">
                <Card class="transition-all hover:border-primary/50">
                    <CardContent class="pt-4 flex items-center justify-between">
                        <span class="font-medium">API Reference</span>
                        <ArrowRight class="w-4 h-4" />
                    </CardContent>
                </Card>
            </a>
            <a href="/docs/syslog" class="block">
                <Card class="transition-all hover:border-primary/50">
                    <CardContent class="pt-4 flex items-center justify-between">
                        <span class="font-medium">Syslog Integration</span>
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
