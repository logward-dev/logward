<script lang="ts">
    import Breadcrumbs from "$lib/components/docs/Breadcrumbs.svelte";
    import CodeBlock from "$lib/components/docs/CodeBlock.svelte";
    import {
        Card,
        CardContent,
        CardHeader,
        CardTitle,
    } from "$lib/components/ui/card";
    import { ExternalLink } from "lucide-svelte";
</script>

<div class="docs-content">
    <Breadcrumbs />

    <div class="flex items-center justify-between mb-4">
        <h1 class="text-3xl font-bold">C# / .NET SDK</h1>
        <a
            href="https://github.com/logward-dev/lgoward-sdk-csharp"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
            <ExternalLink class="w-4 h-4" />
            GitHub
        </a>
    </div>

    <p class="text-lg text-muted-foreground mb-8">
        Official .NET SDK for LogWard with automatic batching, retry logic with
        exponential backoff, circuit breaker pattern, query API, distributed
        tracing, and ASP.NET Core middleware support.
    </p>

    <h2
        id="installation"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Installation
    </h2>

    <div class="mb-8 space-y-6">
        <div>
            <h3 class="text-lg font-semibold mb-3">.NET CLI</h3>
            <CodeBlock
                lang="bash"
                code={`dotnet add package LogWard.SDK`}
            />
        </div>

        <div>
            <h3 class="text-lg font-semibold mb-3">Package Manager</h3>
            <CodeBlock
                lang="powershell"
                code={`Install-Package LogWard.SDK`}
            />
        </div>
    </div>

    <h2
        id="quick-start"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Quick Start
    </h2>

    <div class="mb-8">
        <CodeBlock
            lang="csharp"
            code={`using LogWard.SDK;
using LogWard.SDK.Models;

var client = new LogWardClient(new ClientOptions
{
    ApiUrl = "http://localhost:8080",
    ApiKey = "lp_your_api_key_here"
});

// Send logs
client.Info("api-gateway", "Server started", new() { ["port"] = 3000 });
client.Error("database", "Connection failed", new Exception("Timeout"));

// Graceful shutdown
await client.DisposeAsync();`}
        />
    </div>

    <h2
        id="features"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Features
    </h2>

    <div class="mb-8 grid gap-3">
        <Card>
            <CardContent class="pt-4 text-sm">
                <ul class="space-y-2">
                    <li>
                        ✅ Automatic batching with configurable size and
                        interval
                    </li>
                    <li>✅ Retry logic with exponential backoff</li>
                    <li>✅ Circuit breaker pattern for fault tolerance</li>
                    <li>
                        ✅ Max buffer size with drop policy to prevent memory
                        leaks
                    </li>
                    <li>✅ Query API for searching and filtering logs</li>
                    <li>✅ Trace ID context for distributed tracing</li>
                    <li>✅ Global metadata added to all logs</li>
                    <li>✅ Structured error serialization</li>
                    <li>✅ Internal metrics (logs sent, errors, latency)</li>
                    <li>✅ ASP.NET Core middleware for auto-logging HTTP requests</li>
                    <li>✅ Dependency injection support</li>
                    <li>✅ Full async/await support</li>
                    <li>✅ Thread-safe</li>
                </ul>
            </CardContent>
        </Card>
    </div>

    <h2
        id="configuration"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Configuration
    </h2>

    <div class="mb-8">
        <CodeBlock
            lang="csharp"
            code={`var client = new LogWardClient(new ClientOptions
{
    // Required
    ApiUrl = "http://localhost:8080",
    ApiKey = "lp_your_api_key_here",

    // Batching
    BatchSize = 100,              // Max logs per batch (default: 100)
    FlushIntervalMs = 5000,       // Flush interval in ms (default: 5000)

    // Buffer management
    MaxBufferSize = 10000,        // Max logs in buffer (default: 10000)

    // Retry with exponential backoff (1s → 2s → 4s)
    MaxRetries = 3,               // Max retry attempts (default: 3)
    RetryDelayMs = 1000,          // Initial retry delay (default: 1000)

    // Circuit breaker
    CircuitBreakerThreshold = 5,  // Failures before circuit opens (default: 5)
    CircuitBreakerResetMs = 30000, // Circuit reset timeout (default: 30000)

    // Metrics & debugging
    EnableMetrics = true,         // Enable metrics collection (default: true)
    Debug = false,                // Enable debug logging (default: false)

    // Global context
    GlobalMetadata = new()
    {
        ["env"] = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT"),
        ["version"] = "1.0.0",
        ["hostname"] = Environment.MachineName
    },

    // Auto trace IDs
    AutoTraceId = false,          // Auto-generate trace IDs (default: false)

    // HTTP settings
    HttpTimeoutSeconds = 30       // HTTP request timeout (default: 30)
});`}
        />
    </div>

    <h2
        id="logging"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Logging Methods
    </h2>

    <div class="mb-8 space-y-6">
        <div>
            <h3 class="text-lg font-semibold mb-3">Basic Logging</h3>
            <CodeBlock
                lang="csharp"
                code={`// Log levels: debug, info, warn, error, critical
client.Debug("service-name", "Debug message");
client.Info("service-name", "Info message", new() { ["userId"] = 123 });
client.Warn("service-name", "Warning message");
client.Error("service-name", "Error message", new() { ["custom"] = "data" });
client.Critical("service-name", "Critical message");`}
            />
        </div>

        <div>
            <h3 class="text-lg font-semibold mb-3">
                Error Logging with Auto-Serialization
            </h3>
            <p class="text-sm text-muted-foreground mb-3">
                The SDK automatically serializes exceptions with full stack traces:
            </p>
            <CodeBlock
                lang="csharp"
                code={`try
{
    throw new InvalidOperationException("Database timeout");
}
catch (Exception ex)
{
    // Automatically serializes error with stack trace
    client.Error("database", "Query failed", ex);
}

// Generated metadata:
// {
//   "error": {
//     "name": "InvalidOperationException",
//     "message": "Database timeout",
//     "stack": "at Program.Main() in ..."
//   }
// }`}
            />
        </div>

        <div>
            <h3 class="text-lg font-semibold mb-3">Custom Log Entry</h3>
            <CodeBlock
                lang="csharp"
                code={`client.Log(new LogEntry
{
    Service = "custom-service",
    Level = LogLevel.Info,
    Message = "Custom log",
    Time = DateTime.UtcNow.ToString("O"),
    Metadata = new() { ["key"] = "value" },
    TraceId = "custom-trace-id"
});`}
            />
        </div>
    </div>

    <h2
        id="trace-context"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Trace ID Context
    </h2>

    <div class="mb-8 space-y-6">
        <p class="text-muted-foreground">
            Track requests across services with trace IDs for distributed tracing.
        </p>

        <div>
            <h3 class="text-lg font-semibold mb-3">Manual Trace ID</h3>
            <CodeBlock
                lang="csharp"
                code={`client.SetTraceId("request-123");

client.Info("api", "Request received");
client.Info("database", "Querying users");
client.Info("api", "Response sent");

client.SetTraceId(null); // Clear context`}
            />
        </div>

        <div>
            <h3 class="text-lg font-semibold mb-3">Scoped Trace ID</h3>
            <CodeBlock
                lang="csharp"
                code={`client.WithTraceId("request-456", () =>
{
    client.Info("api", "Processing in context");
    client.Warn("cache", "Cache miss");
});
// Trace ID automatically restored after block`}
            />
        </div>

        <div>
            <h3 class="text-lg font-semibold mb-3">Auto-Generated Trace ID</h3>
            <CodeBlock
                lang="csharp"
                code={`client.WithNewTraceId(() =>
{
    client.Info("worker", "Background job started");
    client.Info("worker", "Job completed");
});`}
            />
        </div>
    </div>

    <h2
        id="query-api"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Query API
    </h2>

    <div class="mb-8 space-y-6">
        <p class="text-muted-foreground">
            Search and retrieve logs programmatically.
        </p>

        <div>
            <h3 class="text-lg font-semibold mb-3">Basic Query</h3>
            <CodeBlock
                lang="csharp"
                code={`var result = await client.QueryAsync(new QueryOptions
{
    Service = "api-gateway",
    Level = LogLevel.Error,
    From = DateTime.UtcNow.AddDays(-1),
    To = DateTime.UtcNow,
    Limit = 100,
    Offset = 0
});

Console.WriteLine($"Found {result.Total} logs");
foreach (var log in result.Logs)
{
    Console.WriteLine($"{log.Time}: {log.Message}");
}`}
            />
        </div>

        <div>
            <h3 class="text-lg font-semibold mb-3">Full-Text Search</h3>
            <CodeBlock
                lang="csharp"
                code={`var result = await client.QueryAsync(new QueryOptions
{
    Query = "timeout",
    Limit = 50
});`}
            />
        </div>

        <div>
            <h3 class="text-lg font-semibold mb-3">Get Logs by Trace ID</h3>
            <CodeBlock
                lang="csharp"
                code={`var logs = await client.GetByTraceIdAsync("trace-123");
Console.WriteLine($"Trace has {logs.Count} logs");`}
            />
        </div>

        <div>
            <h3 class="text-lg font-semibold mb-3">Aggregated Statistics</h3>
            <CodeBlock
                lang="csharp"
                code={`var stats = await client.GetAggregatedStatsAsync(new AggregatedStatsOptions
{
    From = DateTime.UtcNow.AddDays(-7),
    To = DateTime.UtcNow,
    Interval = "1h", // "1m" | "5m" | "1h" | "1d"
    Service = "api-gateway" // Optional
});

Console.WriteLine("Time series:");
foreach (var entry in stats.Timeseries)
{
    Console.WriteLine($"  {entry.Bucket}: {entry.Total} logs");
}`}
            />
        </div>
    </div>

    <h2
        id="metrics"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Metrics
    </h2>

    <div class="mb-8">
        <p class="text-muted-foreground mb-3">
            Track SDK performance and health with built-in metrics.
        </p>
        <CodeBlock
            lang="csharp"
            code={`var metrics = client.GetMetrics();

Console.WriteLine($"Logs sent: {metrics.LogsSent}");
Console.WriteLine($"Logs dropped: {metrics.LogsDropped}");
Console.WriteLine($"Errors: {metrics.Errors}");
Console.WriteLine($"Retries: {metrics.Retries}");
Console.WriteLine($"Avg latency: {metrics.AvgLatencyMs}ms");
Console.WriteLine($"Circuit breaker trips: {metrics.CircuitBreakerTrips}");

// Get circuit breaker state
Console.WriteLine($"Circuit state: {client.GetCircuitBreakerState()}"); // Closed | Open | HalfOpen

// Reset metrics
client.ResetMetrics();`}
        />
    </div>

    <h2
        id="middleware"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        ASP.NET Core Integration
    </h2>

    <div class="mb-8 space-y-6">
        <div>
            <h3 class="text-lg font-semibold mb-3">Setup with Dependency Injection</h3>
            <p class="text-sm text-muted-foreground mb-3">
                Add LogWard to your ASP.NET Core application with full middleware support:
            </p>
            <CodeBlock
                lang="csharp"
                code={`// Program.cs
using LogWard.SDK;
using LogWard.SDK.Middleware;
using LogWard.SDK.Models;

var builder = WebApplication.CreateBuilder(args);

// Add LogWard
builder.Services.AddLogWard(new ClientOptions
{
    ApiUrl = builder.Configuration["LogWard:ApiUrl"]!,
    ApiKey = builder.Configuration["LogWard:ApiKey"]!,
    GlobalMetadata = new()
    {
        ["env"] = builder.Environment.EnvironmentName
    }
});

var app = builder.Build();

// Add middleware for auto-logging HTTP requests
app.UseLogWard(options =>
{
    options.ServiceName = "my-api";
    options.LogRequests = true;
    options.LogResponses = true;
    options.LogErrors = true;
    options.SkipHealthCheck = true;
    options.SkipPaths.Add("/metrics");
});

app.MapGet("/", () => "Hello World!");

app.Run();`}
            />
        </div>

        <div>
            <h3 class="text-lg font-semibold mb-3">Middleware Options</h3>
            <div class="overflow-x-auto">
                <table class="w-full text-sm border border-border rounded-lg">
                    <thead class="bg-muted">
                        <tr>
                            <th class="text-left p-3 border-b border-border">Option</th>
                            <th class="text-left p-3 border-b border-border">Type</th>
                            <th class="text-left p-3 border-b border-border">Default</th>
                            <th class="text-left p-3 border-b border-border">Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="p-3 border-b border-border"><code>ServiceName</code></td>
                            <td class="p-3 border-b border-border">string</td>
                            <td class="p-3 border-b border-border">"aspnet-api"</td>
                            <td class="p-3 border-b border-border">Service name in logs</td>
                        </tr>
                        <tr>
                            <td class="p-3 border-b border-border"><code>LogRequests</code></td>
                            <td class="p-3 border-b border-border">bool</td>
                            <td class="p-3 border-b border-border">true</td>
                            <td class="p-3 border-b border-border">Log incoming requests</td>
                        </tr>
                        <tr>
                            <td class="p-3 border-b border-border"><code>LogResponses</code></td>
                            <td class="p-3 border-b border-border">bool</td>
                            <td class="p-3 border-b border-border">true</td>
                            <td class="p-3 border-b border-border">Log outgoing responses</td>
                        </tr>
                        <tr>
                            <td class="p-3 border-b border-border"><code>LogErrors</code></td>
                            <td class="p-3 border-b border-border">bool</td>
                            <td class="p-3 border-b border-border">true</td>
                            <td class="p-3 border-b border-border">Log unhandled exceptions</td>
                        </tr>
                        <tr>
                            <td class="p-3 border-b border-border"><code>IncludeHeaders</code></td>
                            <td class="p-3 border-b border-border">bool</td>
                            <td class="p-3 border-b border-border">false</td>
                            <td class="p-3 border-b border-border">Include request headers</td>
                        </tr>
                        <tr>
                            <td class="p-3 border-b border-border"><code>SkipHealthCheck</code></td>
                            <td class="p-3 border-b border-border">bool</td>
                            <td class="p-3 border-b border-border">true</td>
                            <td class="p-3 border-b border-border">Skip /health endpoints</td>
                        </tr>
                        <tr>
                            <td class="p-3 border-b border-border"><code>SkipPaths</code></td>
                            <td class="p-3 border-b border-border">HashSet&lt;string&gt;</td>
                            <td class="p-3 border-b border-border">{}</td>
                            <td class="p-3 border-b border-border">Paths to skip</td>
                        </tr>
                        <tr>
                            <td class="p-3"><code>TraceIdHeader</code></td>
                            <td class="p-3">string</td>
                            <td class="p-3">"X-Trace-Id"</td>
                            <td class="p-3">Header for trace ID</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div>
            <h3 class="text-lg font-semibold mb-3">Using LogWard in Controllers</h3>
            <CodeBlock
                lang="csharp"
                code={`[ApiController]
[Route("[controller]")]
public class WeatherController : ControllerBase
{
    private readonly LogWardClient _logger;

    public WeatherController(LogWardClient logger)
    {
        _logger = logger;
    }

    [HttpGet]
    public IActionResult Get()
    {
        _logger.Info("weather-api", "Fetching weather data");

        try
        {
            // ... business logic
            return Ok(new { Temperature = 25 });
        }
        catch (Exception ex)
        {
            _logger.Error("weather-api", "Failed to fetch weather", ex);
            throw;
        }
    }
}`}
            />
        </div>
    </div>

    <h2
        id="best-practices"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Best Practices
    </h2>

    <div class="space-y-4 mb-8">
        <Card>
            <CardHeader>
                <CardTitle class="text-base"
                    >1. Always Dispose on Shutdown</CardTitle
                >
            </CardHeader>
            <CardContent class="text-sm text-muted-foreground">
                Always call <code>client.DisposeAsync()</code> on shutdown to ensure
                buffered logs are flushed. With ASP.NET Core, register a shutdown handler:
                <CodeBlock
                    lang="csharp"
                    code={`app.Lifetime.ApplicationStopping.Register(async () =>
{
    var logger = app.Services.GetRequiredService<LogWardClient>();
    await logger.FlushAsync();
});`}
                />
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle class="text-base"
                    >2. Use Global Metadata</CardTitle
                >
            </CardHeader>
            <CardContent class="text-sm text-muted-foreground">
                Set global metadata (environment, version, hostname) at initialization
                to avoid repeating it in every log call.
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle class="text-base"
                    >3. Enable Debug Mode in Development</CardTitle
                >
            </CardHeader>
            <CardContent class="text-sm text-muted-foreground">
                <CodeBlock
                    lang="csharp"
                    code={`var client = new LogWardClient(new ClientOptions
{
    ApiUrl = "...",
    ApiKey = "...",
    Debug = builder.Environment.IsDevelopment()
});`}
                />
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle class="text-base"
                    >4. Monitor Metrics in Production</CardTitle
                >
            </CardHeader>
            <CardContent class="text-sm text-muted-foreground">
                <CodeBlock
                    lang="csharp"
                    code={`// Periodic health check
_ = Task.Run(async () =>
{
    while (true)
    {
        await Task.Delay(TimeSpan.FromMinutes(1));

        var metrics = client.GetMetrics();

        if (metrics.LogsDropped > 0)
        {
            Console.WriteLine($"Warning: {metrics.LogsDropped} logs dropped");
        }

        if (client.GetCircuitBreakerState() == CircuitState.Open)
        {
            Console.WriteLine("Error: Circuit breaker is OPEN!");
        }
    }
});`}
                />
            </CardContent>
        </Card>
    </div>

    <h2
        id="supported-frameworks"
        class="text-2xl font-semibold mb-4 scroll-mt-20 border-b border-border pb-2"
    >
        Supported Frameworks
    </h2>

    <div class="mb-8">
        <ul class="list-disc ml-6 text-muted-foreground space-y-1">
            <li>.NET 6.0</li>
            <li>.NET 7.0</li>
            <li>.NET 8.0</li>
        </ul>
    </div>
</div>

<style>
    .docs-content :global(code:not(pre code)) {
        padding-left: 0.375rem;
        padding-right: 0.375rem;
        padding-top: 0.125rem;
        padding-bottom: 0.125rem;
        background-color: hsl(var(--muted));
        border-radius: 0.25rem;
        font-size: 0.875rem;
        font-family: ui-monospace, monospace;
    }
</style>
