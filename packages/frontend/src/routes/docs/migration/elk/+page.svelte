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
    import { Check, X, AlertCircle, Clock, ArrowRight, Zap, Server } from "lucide-svelte";
</script>

<div class="docs-content">
    <Breadcrumbs />

    <div class="flex items-center justify-between mb-4">
        <h1 class="text-3xl font-bold">Migrate from ELK Stack</h1>
        <div class="flex items-center gap-2">
            <Badge variant="outline" class="bg-green-500/10 text-green-600 border-green-500/20">
                Easy
            </Badge>
            <Badge variant="secondary">
                <Clock class="w-3 h-3 mr-1" />
                3-6 hours
            </Badge>
        </div>
    </div>

    <p class="text-lg text-muted-foreground mb-8">
        Simplify your logging infrastructure by replacing the complex ELK (Elasticsearch, Logstash, Kibana)
        stack with LogWard's all-in-one solution. No more cluster management or version compatibility issues.
    </p>

    <h2
        id="why-migrate"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Why Migrate from ELK?
    </h2>

    <div class="mb-8 grid md:grid-cols-2 gap-4">
        <Card>
            <CardContent class="pt-4">
                <div class="flex items-start gap-3">
                    <Zap class="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                        <h3 class="font-semibold mb-1">Dramatically Simpler</h3>
                        <p class="text-sm text-muted-foreground">
                            No more managing Elasticsearch clusters, Logstash pipelines, and Kibana.
                            LogWard is a single Docker Compose deployment.
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>

        <Card>
            <CardContent class="pt-4">
                <div class="flex items-start gap-3">
                    <Server class="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                        <h3 class="font-semibold mb-1">Lower Resource Usage</h3>
                        <p class="text-sm text-muted-foreground">
                            Elasticsearch requires significant RAM (heap size). LogWard with TimescaleDB
                            uses resources more efficiently with better compression.
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
                            ELK requires additional components (SIEM, Security) for threat detection.
                            LogWard includes Sigma rules and incident management.
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
                        <h3 class="font-semibold mb-1">No Version Headaches</h3>
                        <p class="text-sm text-muted-foreground">
                            ELK components must be version-matched. LogWard is a single versioned
                            release with all components guaranteed compatible.
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
                    <th class="px-4 py-3 text-left border-b border-border">ELK Stack</th>
                    <th class="px-4 py-3 text-left border-b border-border">LogWard</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Components</td>
                    <td class="px-4 py-3 border-b border-border">3+ (ES, Logstash, Kibana)</td>
                    <td class="px-4 py-3 border-b border-border">Single stack</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Log Ingestion</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Beats, Logstash</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> HTTP API, SDKs, OTLP</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Query Language</td>
                    <td class="px-4 py-3 border-b border-border">Lucene / KQL</td>
                    <td class="px-4 py-3 border-b border-border">REST API + Full-text</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Full-text Search</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Yes</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Real-time Streaming</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Kibana Discover</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> SSE</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Alerting</td>
                    <td class="px-4 py-3 border-b border-border">Watcher / ElastAlert</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Built-in</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Security Detection</td>
                    <td class="px-4 py-3 border-b border-border">Elastic SIEM (paid)</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Sigma (included)</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">OpenTelemetry</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> APM Server</td>
                    <td class="px-4 py-3 border-b border-border"><Check class="w-4 h-4 text-green-500 inline" /> Native OTLP</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Cluster Management</td>
                    <td class="px-4 py-3 border-b border-border">Complex (shards, replicas)</td>
                    <td class="px-4 py-3 border-b border-border">Simple (PostgreSQL)</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 border-b border-border font-medium">Memory Requirements</td>
                    <td class="px-4 py-3 border-b border-border">High (ES heap: 16-32GB)</td>
                    <td class="px-4 py-3 border-b border-border">Moderate (4-8GB)</td>
                </tr>
                <tr>
                    <td class="px-4 py-3 font-medium">Pricing</td>
                    <td class="px-4 py-3">Open-source + paid features</td>
                    <td class="px-4 py-3"><span class="text-green-600 font-medium">Fully open-source</span></td>
                </tr>
            </tbody>
        </table>
    </div>

    <h2
        id="step-1"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Step 1: Inventory Your ELK Setup
    </h2>

    <div class="mb-8">
        <p class="mb-4">Document your existing ELK configuration:</p>

        <Card class="mb-4">
            <CardContent class="pt-4">
                <h3 class="font-semibold mb-3">What to Document</h3>
                <ul class="space-y-2 text-sm">
                    <li class="flex items-start gap-2">
                        <Check class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>Data shippers:</strong> Filebeat, Metricbeat, Logstash pipelines</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <Check class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>Indices:</strong> List indices and their mappings</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <Check class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>Logstash pipelines:</strong> Document filter/output configs</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <Check class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>Kibana dashboards:</strong> Export saved objects</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <Check class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>Watcher/alerts:</strong> Document alert configurations</span>
                    </li>
                </ul>
            </CardContent>
        </Card>

        <p class="mb-4">Export Kibana saved objects:</p>

        <CodeBlock
            lang="bash"
            code={`# Export all saved objects from Kibana
curl -X POST "http://kibana:5601/api/saved_objects/_export" \\
  -H "kbn-xsrf: true" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": ["dashboard", "visualization", "search"],
    "includeReferencesDeep": true
  }' > kibana_export.ndjson`}
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
            See the <a href="/docs/deployment" class="text-primary hover:underline">Deployment Guide</a>.
            LogWard requires far fewer resources than ELK:
        </p>

        <div class="grid md:grid-cols-2 gap-4 mb-6">
            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">ELK Stack Requirements</CardTitle>
                </CardHeader>
                <CardContent class="text-sm">
                    <ul class="space-y-1">
                        <li>Elasticsearch: 16-32 GB RAM (heap)</li>
                        <li>Logstash: 4-8 GB RAM</li>
                        <li>Kibana: 2-4 GB RAM</li>
                        <li>Total: 22-44 GB RAM minimum</li>
                    </ul>
                </CardContent>
            </Card>

            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">LogWard Requirements</CardTitle>
                </CardHeader>
                <CardContent class="text-sm">
                    <ul class="space-y-1">
                        <li>Backend: 2-4 GB RAM</li>
                        <li>TimescaleDB: 4-8 GB RAM</li>
                        <li>Redis: 1 GB RAM</li>
                        <li>Total: 7-13 GB RAM</li>
                    </ul>
                </CardContent>
            </Card>
        </div>

        <CodeBlock
            lang="bash"
            code={`# Clone and start LogWard
git clone https://github.com/logward-dev/logward.git
cd logward/docker
cp .env.example .env
docker compose up -d

# Verify
curl http://localhost:8080/health`}
        />
    </div>

    <h2
        id="step-3"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Step 3: Replace Beats/Logstash
    </h2>

    <div class="mb-8">
        <p class="mb-4">
            Replace Filebeat/Logstash with Fluent Bit or direct SDK integration:
        </p>

        <h3 class="text-lg font-semibold mb-3">Filebeat to Fluent Bit</h3>

        <div class="grid md:grid-cols-2 gap-4 mb-6">
            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">Before (Filebeat)</CardTitle>
                </CardHeader>
                <CardContent>
                    <CodeBlock
                        lang="yaml"
                        code={`# filebeat.yml
filebeat.inputs:
  - type: log
    paths:
      - /var/log/app/*.log

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
  index: "app-logs-%{+yyyy.MM.dd}"`}
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
                        code={`# fluent-bit.conf
[INPUT]
    Name tail
    Path /var/log/app/*.log
    Tag app

[OUTPUT]
    Name http
    Match *
    Host logward.internal
    Port 8080
    URI /api/v1/ingest
    Format json
    Header X-API-Key lp_xxx`}
                    />
                </CardContent>
            </Card>
        </div>

        <h3 class="text-lg font-semibold mb-3">Logstash Pipeline to Fluent Bit</h3>

        <div class="grid md:grid-cols-2 gap-4">
            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">Before (Logstash)</CardTitle>
                </CardHeader>
                <CardContent>
                    <CodeBlock
                        lang="ruby"
                        code={`# logstash.conf
input {
  beats { port => 5044 }
}

filter {
  grok {
    match => { "message" => "%{TIMESTAMP_ISO8601:time} %{LOGLEVEL:level} %{GREEDYDATA:msg}" }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "app-%{+YYYY.MM.dd}"
  }
}`}
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
                        code={`# fluent-bit.conf
[INPUT]
    Name forward
    Listen 0.0.0.0
    Port 24224

[FILTER]
    Name parser
    Match *
    Key_Name message
    Parser app_log

[OUTPUT]
    Name http
    Match *
    Host logward.internal
    Port 8080
    URI /api/v1/ingest
    Format json
    Header X-API-Key lp_xxx`}
                    />
                </CardContent>
            </Card>
        </div>
    </div>

    <h2
        id="step-4"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Step 4: Query Migration (Elasticsearch to LogWard)
    </h2>

    <div class="mb-8">
        <p class="mb-4">
            Elasticsearch Query DSL translates to LogWard REST API parameters:
        </p>

        <div class="overflow-x-auto mb-6">
            <table class="w-full text-sm border border-border rounded-lg">
                <thead class="bg-muted">
                    <tr>
                        <th class="px-4 py-2 text-left border-b border-border">Elasticsearch Query</th>
                        <th class="px-4 py-2 text-left border-b border-border">LogWard API</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs"><code>{'{"match": {"service": "api"}}'}</code></td>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">GET /api/v1/logs?service=api</td>
                    </tr>
                    <tr>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs"><code>{'{"match": {"level": "error"}}'}</code></td>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">GET /api/v1/logs?level=error</td>
                    </tr>
                    <tr>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs"><code>{'{"query_string": {"query": "timeout"}}'}</code></td>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">GET /api/v1/logs?q=timeout</td>
                    </tr>
                    <tr>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs"><code>{'{"range": {"@timestamp": {"gte": "now-1h"}}}'}</code></td>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">GET /api/v1/logs?from=2025-01-15T11:00:00Z</td>
                    </tr>
                    <tr>
                        <td class="px-4 py-2 font-mono text-xs"><code>{'{"aggs": {"by_service": {"terms": {"field": "service"}}}}'}</code></td>
                        <td class="px-4 py-2 font-mono text-xs">GET /api/v1/logs/aggregated?interval=1h</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <h3 class="text-lg font-semibold mb-3">KQL (Kibana Query Language) Translation</h3>

        <div class="overflow-x-auto">
            <table class="w-full text-sm border border-border rounded-lg">
                <thead class="bg-muted">
                    <tr>
                        <th class="px-4 py-2 text-left border-b border-border">KQL</th>
                        <th class="px-4 py-2 text-left border-b border-border">LogWard</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">service: api</td>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">?service=api</td>
                    </tr>
                    <tr>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">level: error OR level: critical</td>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">?level=error&level=critical</td>
                    </tr>
                    <tr>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">"connection timeout"</td>
                        <td class="px-4 py-2 border-b border-border font-mono text-xs">?q=connection%20timeout</td>
                    </tr>
                    <tr>
                        <td class="px-4 py-2 font-mono text-xs">service: api AND level: error</td>
                        <td class="px-4 py-2 font-mono text-xs">?service=api&level=error</td>
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
            Convert Elasticsearch Watcher or ElastAlert rules to LogWard alert rules:
        </p>

        <div class="grid md:grid-cols-2 gap-4">
            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">Elasticsearch Watcher</CardTitle>
                </CardHeader>
                <CardContent>
                    <CodeBlock
                        lang="json"
                        code={`{
  "trigger": {
    "schedule": { "interval": "5m" }
  },
  "input": {
    "search": {
      "request": {
        "indices": ["app-*"],
        "body": {
          "query": {
            "match": { "level": "error" }
          }
        }
      }
    }
  },
  "condition": {
    "compare": {
      "ctx.payload.hits.total": { "gt": 100 }
    }
  },
  "actions": {
    "email_admin": {
      "email": {
        "to": "admin@example.com"
      }
    }
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
  "level": ["error"],
  "threshold": 100,
  "timeWindow": 5,
  "emailRecipients": [
    "admin@example.com"
  ]
}`}
                    />
                </CardContent>
            </Card>
        </div>
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
                    <th class="px-4 py-2 text-left border-b border-border">ELK Term</th>
                    <th class="px-4 py-2 text-left border-b border-border">LogWard Equivalent</th>
                    <th class="px-4 py-2 text-left border-b border-border">Notes</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Index</td>
                    <td class="px-4 py-2 border-b border-border">Project</td>
                    <td class="px-4 py-2 border-b border-border">One index pattern = One project</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Document</td>
                    <td class="px-4 py-2 border-b border-border">Log entry</td>
                    <td class="px-4 py-2 border-b border-border">1:1 mapping</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Field</td>
                    <td class="px-4 py-2 border-b border-border">metadata key</td>
                    <td class="px-4 py-2 border-b border-border">Store custom fields in metadata JSON</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">@timestamp</td>
                    <td class="px-4 py-2 border-b border-border">time</td>
                    <td class="px-4 py-2 border-b border-border">ISO 8601 format</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Filebeat</td>
                    <td class="px-4 py-2 border-b border-border">Fluent Bit / SDK</td>
                    <td class="px-4 py-2 border-b border-border">Use Fluent Bit for file tailing</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Logstash</td>
                    <td class="px-4 py-2 border-b border-border">Fluent Bit / SDK</td>
                    <td class="px-4 py-2 border-b border-border">Use Fluent Bit filters or preprocess in app</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Kibana</td>
                    <td class="px-4 py-2 border-b border-border">LogWard UI</td>
                    <td class="px-4 py-2 border-b border-border">Built-in web interface</td>
                </tr>
                <tr>
                    <td class="px-4 py-2 border-b border-border">Watcher</td>
                    <td class="px-4 py-2 border-b border-border">Alert Rules</td>
                    <td class="px-4 py-2 border-b border-border">Simpler configuration</td>
                </tr>
                <tr>
                    <td class="px-4 py-2">Elastic SIEM</td>
                    <td class="px-4 py-2">Sigma Rules + SIEM Dashboard</td>
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
                    Complex Logstash filters
                </CardTitle>
            </CardHeader>
            <CardContent class="text-sm text-muted-foreground">
                If you have complex grok patterns or ruby filters, consider:
                <ul class="list-disc pl-4 mt-2 space-y-1">
                    <li>Moving parsing to your application (emit structured JSON)</li>
                    <li>Using Fluent Bit parsers for simple patterns</li>
                    <li>Using OpenTelemetry Collector for advanced transformations</li>
                </ul>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle class="text-base flex items-center gap-2">
                    <AlertCircle class="w-4 h-4 text-yellow-500" />
                    Kibana dashboard recreation
                </CardTitle>
            </CardHeader>
            <CardContent class="text-sm text-muted-foreground">
                LogWard doesn't have Kibana-style drag-and-drop dashboards yet.
                Use the SIEM dashboard for security metrics, and the Query API
                for custom integrations with tools like Grafana.
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle class="text-base flex items-center gap-2">
                    <AlertCircle class="w-4 h-4 text-yellow-500" />
                    Index lifecycle management
                </CardTitle>
            </CardHeader>
            <CardContent class="text-sm text-muted-foreground">
                Elasticsearch ILM is replaced by TimescaleDB retention policies.
                Configure retention per-project in LogWard settings. Compression
                is automatic.
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
            <a href="/docs/opentelemetry" class="block">
                <Card class="transition-all hover:border-primary/50">
                    <CardContent class="pt-4 flex items-center justify-between">
                        <span class="font-medium">OpenTelemetry Integration</span>
                        <ArrowRight class="w-4 h-4" />
                    </CardContent>
                </Card>
            </a>
            <a href="/docs/deployment" class="block">
                <Card class="transition-all hover:border-primary/50">
                    <CardContent class="pt-4 flex items-center justify-between">
                        <span class="font-medium">Deployment Guide</span>
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
