# Changelog

All notable changes to LogTide will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.1] - 2026-02-14

### Added

- **ClickHouse Storage Engine**: Full ClickHouse support as an alternative to TimescaleDB
  - New `@logtide/reservoir` package — pluggable storage abstraction with a unified API for both engines
  - Factory pattern: `StorageEngineFactory.create('timescale'|'clickhouse', config)` for engine selection
  - Engine configured via `STORAGE_ENGINE` environment variable (`timescale` or `clickhouse`)
  - ClickHouse-specific optimizations: `PREWHERE` clauses, `async_insert`, `ngrambf_v1` indexes for full-text search
  - TimescaleDB-specific optimizations: `UNNEST` batch inserts, `pg_trgm` trigram indexes, connection pool error handling
  - Span and trace ingestion support on both engines
  - 26 integration tests running against both engines via Docker

- **Full Log Query Migration to Reservoir**: All log operations now go through the storage abstraction layer
  - Migrated: query, alerts, dashboard, admin, retention, baseline calculator, ingestion, correlation
  - Engine-type branching for continuous aggregates (TimescaleDB fast path, ClickHouse raw fallback)
  - Added `topValues`, `fromExclusive`/`toExclusive` bounds, and `getEngineType()` to reservoir API
  - Conditional `drop_chunks` for retention (TimescaleDB only)

### Fixed

- **Log Context upper bound**: `getLogContext` "after" query was using `new Date()` as upper bound, which excluded future-timestamped logs

### Performance

- **Slow admin queries on large datasets**: Removed `COUNT(*)` full scans, switched to continuous aggregates, reduced default time windows, added caching
- **ClickHouse query engine**: DateTime64(3) handling for correct millisecond precision, `hasToken()` fallback to `positionCaseInsensitive()` for needles with special characters
- **TimescaleDB engine**: Removed redundant `idx_project_time` index, added `span_id` index, UNNEST-based batch inserts
- **ClickHouse engine**: Removed `LowCardinality` on `project_id`, added `span_id` index, `IS NOT NULL` parity with TimescaleDB, empty array validation guards

### Tests

- Added platform timeline and active issues endpoint tests
- Added reservoir integration tests: `topValues`, exclusive bounds, span/trace operations (both engines)

---

## [0.6.0] - 2026-02-12

### Added

- **Host Security Detection Packs**: 3 new pre-built detection packs for host-based security monitoring (15 rules total, all MITRE ATT&CK mapped)
  - **Antivirus & Malware Pack** (`antivirus-malware`): Malware detection (ClamAV FOUND patterns), AV scan failures, webshell in web directories (compound condition), outdated virus signatures, quarantine/removal failures
  - **Rootkit Detection Pack** (`rootkit-detection`): Rootkit identification (rkhunter/chkrootkit), hidden processes, system binary tampering (checksum mismatch), suspicious kernel modules, promiscuous network interfaces
  - **File Integrity Monitoring Pack** (`file-integrity`): Critical system file changes (/etc/passwd, /etc/shadow, /boot), SSH config modifications, web directory file changes, cron job tampering, mass file changes (ransomware indicator)
  - All rules use `logsource.product: linux` for proper scoping
  - Compound conditions (`selection_malware and selection_path`) on webshell and FIM rules to reduce false positives
  - Integration test script (`testing-scripts/host-security-packs-test.ts`) with 28 assertions covering enable/disable lifecycle, sigma rule generation, MITRE mapping, log ingestion, and cleanup

### Fixed

- **Sigma API missing tags and MITRE fields**: `getSigmaRules` (list) and `getSigmaRuleById` (detail) were not including `tags`, `mitreTactics`, and `mitreTechniques` in the camelCase response transformation — fields were stored correctly in the DB but silently dropped from API responses. Also fixed the same gap in `importSigmaRule` return value.

- **Keyboard Shortcuts for Power Users** (#42): Comprehensive keyboard shortcuts system for faster navigation and actions
  - **Command Palette** (`Ctrl/Cmd+K`): Fuzzy search over pages and quick actions (toggle sidebar, reload, toggle theme, show shortcuts). Search trigger button with shortcut hint in the header
  - **Help Modal** (`?`): Grouped list of all available shortcuts with platform-aware key display (⌘ on Mac, Ctrl on Windows)
  - **Sequence Navigation** (`G then D/S/A/P/T/E/R/X`): GitHub-style two-key navigation to Dashboard, Logs, Alerts, Projects, Traces, Security, Errors, Settings
  - **Search Page Shortcuts**: `/` focus search input, `J/K` navigate logs with visual highlight, `Enter` expand/collapse selected log, `R` refresh results
  - **Dashboard Shortcuts**: `R` refresh dashboard data
  - **Global Shortcuts**: `Ctrl/Cmd+/` go to search / focus search input, `Ctrl/Cmd+B` toggle sidebar, `Escape` close modals
  - **Discoverability**: First-time toast notification, shortcut hints in command palette items, `⌘K`/`Ctrl+K` badge in header
  - Input-aware: shortcuts suppressed when typing in inputs, textareas, or comboboxes

- **Admin Dashboard Revision**: Complete redesign of the admin panel for platform-level observability
  - **Dashboard home**: 4 health status cards (system health, ingestion rate, active issues, total logs), platform activity chart (24h timeline of logs/detections/spans), 8 stat cards (users, orgs, projects, ingestion, alerts, queues, database, redis), top organizations and projects tables
  - **System Health page** (`/dashboard/admin/system-health`): Database/connection pool/Redis diagnostics, database tables overview, TimescaleDB compression stats with progress bars, continuous aggregates health with staleness indicators, storage & performance metrics, worker queue details
  - **Slow queries monitoring**: Active running queries table (from `pg_stat_activity`) with duration color-coding, historical slowest queries table (from `pg_stat_statements` when available)
  - **Platform timeline chart**: ECharts area chart with 3 series (logs, detections, spans) using continuous aggregates for fast queries
  - 5 new backend endpoints: `platform-timeline`, `active-issues`, `compression`, `continuous-aggregates`, `slow-queries`

- **PII Masking at Ingestion**: Automatic detection and masking of sensitive data in log entries before storage (GDPR-compliant, data never touches disk unmasked)
  - **Phase 1 — Content patterns**: Built-in regex rules for email, credit card, phone (US), SSN, IPv4, API keys/secrets
  - **Phase 2 — Field name masking**: Scans metadata JSON keys (`password`, `token`, `secret`, `authorization`, etc.) and masks their values
  - **Phase 3 — Custom rules**: Users can define org-level or project-level regex patterns and field name lists
  - Three masking strategies: `mask` (partial — `u***@domain.com`), `redact` (full — `[REDACTED_EMAIL]`), `hash` (SHA-256 with per-org salt — `[HASH:abc123...]`)
  - REST API: `GET/POST/PUT/DELETE /api/v1/pii-masking/rules` + `POST /api/v1/pii-masking/test`
  - Settings UI at `/dashboard/settings/pii-masking` with rule management, enable/disable switches, action dropdowns, and live test panel (before/after preview)
  - Built-in rules disabled by default — users opt-in per rule from the UI
  - Project-level rules override org-level rules with the same name
  - Database migration `021_add_pii_masking` (`pii_masking_rules` + `organization_pii_salts` tables)

- **Timeline Event Markers**: Visual indicators on the Logs Timeline chart showing when alerts or security detections occurred
  - Scatter circle markers overlaid on the existing chart at matching hourly buckets
  - Red circles for alert triggers, purple for security detections, larger when both in same hour
  - Hover tooltip shows alert rule names, log counts, and detection severity breakdown
  - "Events" toggle in legend to show/hide markers
  - Backend endpoint `GET /api/v1/dashboard/timeline-events` queries `alert_history` + `detection_events_hourly_stats` (with raw fallback)
  - Graceful degradation: chart unchanged when no events exist

- **Rate-of-Change Alerts**: Baseline-based anomaly detection that compares current log volume against historical patterns, triggering when deviation exceeds a configurable multiplier
  - **4 baseline methods**: `same_time_yesterday`, `same_day_last_week`, `rolling_7d_avg` (default), `percentile_p95` — all computed on-the-fly from `logs_hourly_stats` continuous aggregate
  - **Anti-spam**: Sustained check (configurable minutes before firing), cooldown period (default 60min), minimum baseline value guard (ignores low-traffic noise)
  - **Smart defaults**: 3x deviation multiplier, 10 min baseline, 60min cooldown, 5min sustained check
  - Frontend: Alert type toggle (Threshold / Rate of Change), baseline method picker with descriptions, deviation multiplier slider, collapsible advanced settings (min baseline, cooldown, sustained)
  - History display: "Anomaly" badge for rate-of-change alerts, baseline metadata (current rate vs baseline, deviation ratio, method used)
  - Email subject line: `[Anomaly] rule — Nx above baseline` (vs `[Alert]` for threshold)
  - Webhook payload includes `baseline_metadata` and `event_type: "anomaly"` for rate-of-change alerts
  - Zod validation: rate-of-change requires `baselineType` + `deviationMultiplier`, multiplier range 1.5–20
  - Database migration `022_add_rate_of_change_alerts` (adds columns to `alert_rules` + `baseline_metadata` JSONB to `alert_history`)
  - 19 new tests (routes, baseline calculator, service dispatching, validation) — 105 total alert tests passing

- **Version Update Notifications**: Admin dashboard banner that checks GitHub releases for new versions
  - Backend endpoint `GET /api/v1/admin/version-check` proxies GitHub Releases API with 6-hour cache (via CacheManager)
  - Compares current `package.json` version against latest stable and beta releases using semver
  - Release channel setting (`stable` / `beta`) configurable from Admin Settings page, persisted as `updates.channel` in `system_settings`
  - Blue "Update available" banner with version comparison and direct link to release, or green "Up to date" indicator
  - Dynamic version in `/health` endpoint (replaced hardcoded string with `package.json` read)

### Fixed

- **UI layout fixes**: Fixed Badge components stretching to fill container width in alert history detection cards and other grid layouts

- **Client errors returning 500 instead of 4xx**: Multiple API routes were returning Internal Server Error for invalid client input
  - Global error handler now detects Fastify validation errors (`FST_ERR_VALIDATION`) as 400 even when `statusCode` is missing
  - SIEM routes (10 endpoints): `z.parse()` failures were caught as 500 — now return 400 with validation details
  - Exceptions routes (8 endpoints): same `z.parse()` pattern — now return 400
  - OTLP content-type parsers: gzip decompression errors now set `statusCode: 400` instead of falling through to 500
  - Retention route: fixed `error.name === 'ZodError'` check to use `instanceof` for reliability

- **Log Context metadata expanding dialog infinitely**: Opening metadata in the Log Context dialog caused horizontal overflow, stretching the dialog indefinitely. Added `max-w-full` to `<pre>` blocks and `overflow-hidden` to log entry containers so metadata scrolls within its bounds

- **Email logo not rendering in some clients**: Switched logo URLs from `.svg` to `.png` — many email clients (Outlook, Gmail) don't support SVG in `<img>` tags

- **Client errors (4xx) logged as ERROR**: The `onError` hook in the internal logging plugin was logging all errors at `error` level regardless of status code — a 415 Unsupported Media Type would appear as a critical error in the dashboard. Now 4xx errors are logged as `warn`, 5xx as `error`. Also added `skipPaths` to the `onError` hook to avoid logging noise from ingestion endpoints.

- **Continuous Aggregates showing "Refresh: unknown"**: Fixed backend query reading `schedule_interval` from JSONB `config` field instead of the direct column on `timescaledb_information.jobs`

- **HealthStats type mismatch**: Frontend had `'up'|'down'` status values while backend uses `'healthy'|'degraded'|'down'`; also missing `pool` property and `'not_configured'` redis status

- **Admin panel consistency fixes**:
  - Added admin guard (`is_admin` check + redirect) to Users, Organizations, and Auth Providers pages — previously only checked server-side
  - Replaced unsafe click-to-confirm delete patterns (3-5s timeout) with proper `AlertDialog` confirmation modals on Projects list, Project detail, and Organization detail pages
  - Replaced browser `confirm()` in Auth Providers with `AlertDialog`
  - Replaced custom overlay modal in Organization detail with standard `AlertDialog` component
  - Fixed `window.location.href` navigation (full page reload) with SvelteKit `goto()` in Organization detail and Project detail pages
  - Fixed Svelte 4 `authStore.subscribe()` pattern in Auth Providers to use reactive `$authStore`

- **Charts not resizing on sidebar toggle**: ECharts instances (LogsChart, TimelineWidget, SeverityPieChart, MitreHeatmap, ServiceMap, PreviewTimeline) stayed at previous size when toggling the sidebar or changing content density — replaced `window.resize` listener with `ResizeObserver` on chart containers

- **Notification click navigating to wrong organization**: Clicking a notification while viewing a different organization led to "not found" errors — now auto-switches to the notification's organization before navigating

### Performance

- **PII masking zero-cost when disabled**: Cache hit is a single `Map.get()` + timestamp check (~0.001ms), returns immediately when no rules are enabled
- **Compiled regex reuse**: Content rules use `lastIndex = 0` reset instead of `new RegExp()` per string — eliminates ~6000 object allocations per 1000-log batch
- **Hot path allocation reduction**: Ingestion path skips path-tracking arrays and template string building (`trackPaths=false`), uses `Object.keys()` instead of `Object.entries()`
- **Credit card regex rewrite**: Replaced greedy `(?:\d[ -]*?){13,19}` (backtracking-prone, false positives on any 13+ digit sequence) with specific pattern matching `XXXX-XXXX-XXXX-XXXX` format or known issuer prefixes (Visa/MC/Amex/Discover)
- **Early exit for simple messages**: Skips all regex evaluation for strings <6 chars or containing only `[a-zA-Z0-9 _-]`
- **In-memory rule cache**: 5-min TTL per org+project combination, invalidated on CRUD operations
- **ReDoS protection**: Custom regex patterns validated with `safe-regex2`, lookahead/lookbehind blocked, quantifiers capped at 100

---

## [0.5.5] - 2026-02-06

### Fixed

- **Detection Category Filter Validation Error**: Fixed `querystring/category must match exactly one schema in oneOf` on `/api/v1/siem/detections`
  - Replaced `oneOf` schema (string | array) with simple `type: array` — Fastify auto-coerces single values to arrays
  - Aligned Zod validation schema to match

### Performance

- **Admin Dashboard 31s → ~1s**: Fixed all admin stats endpoints causing dashboard timeout on 50M+ logs
  - `/api/v1/admin/stats/logs`: Switched to `logs_daily_stats` continuous aggregate for top orgs/projects/per-day (37s → 31ms), `approximate_row_count()` for total (677ms → 56ms)
  - `/api/v1/admin/stats/database`: Replaced 2x `COUNT(*)` full scans with `approximate_row_count()` + `pg_class.reltuples`, single parallel batch (1.4s → 180ms)
  - `/api/v1/admin/stats/performance`: Changed `created_at` filter to `time` for chunk pruning (793ms → 160ms), parallelized all queries
  - All 6 queries per endpoint now run via `Promise.all()` instead of sequentially

- **Error Group Logs Timeout**: Fixed `/api/v1/error-groups/:id/logs` statement timeout on large datasets
  - Added `logs.time` bounds (`firstSeen`/`lastSeen`) to enable TimescaleDB chunk pruning on the hypertable JOIN
  - Removed expensive `COUNT(*)` query — uses `error_groups.occurrence_count` (maintained by trigger) instead
  - Eliminated redundant group fetch (reuses data already loaded for authorization check)

---

## [0.5.4] - 2026-02-06

### Added

- **Detection Pack Category Routing**: Detection pack results now appear in the correct UI section based on category
  - `security` packs → Security/SIEM dashboard (unchanged)
  - `reliability` / `database` packs → Errors page, new "Detections" tab
  - `business` packs → Alerts page, new "Detections" tab
  - Manual/SigmaHQ Sigma rules default to `security` category
  - Added `category` column to `sigma_rules` and `detection_events` tables (migration 020)
  - Security dashboard and incident auto-grouping now scoped to `category = 'security'` only
  - API supports filtering detection events by category

### Fixed

- **Exception Detection for `metadata.error`**: Errors serialized as `{ name, message, stack }` in log metadata are now detected and parsed
  - Previously only `metadata.exception` (structured format) was checked
  - Common Node.js error serialization pattern (`metadata.error.stack`) was being missed entirely
  - Falls back through: `metadata.exception` → `metadata.error.stack` → message text parsing

- **Exception Details Dialog `[object Object]`**: Fixed fallback view rendering `[object Object]` instead of error message
  - When `metadata.error` is a nested object (e.g. `{ name, message, stack }`), the dialog now flattens it
  - Correctly extracts and displays `message`, `stack`, and `name` from nested error objects

- **Onboarding Race Condition**: Fixed `duplicate key` crash when two concurrent requests create onboarding state
  - `getOnboardingState` now uses `INSERT ... ON CONFLICT DO NOTHING` to handle concurrent inserts
  - Re-fetches state after conflict to return the existing record

- **Internal Org Missing Members**: Fixed `@logtide-internal` organization not assigning admin users as members
  - `bootstrapInternalLogging` now inserts owner into `organization_members` when creating the org
  - On every startup, ensures all admin users are members of the internal org

- **Unwanted Email/Webhook Notifications**: Fixed notifications being sent even when no notification channels are configured
  - Legacy `email_recipients` and `webhook_url` fields on alert rules were still being used at dispatch time
  - Notification job now only uses the notification channels system (`notification_channels` table) to determine recipients
  - Legacy fields remain in the database schema but are no longer read during notification processing

- **Email Logo Not Rendering**: Replaced broken base64-encoded logo with hosted SVG URLs
  - Email clients were not displaying the embedded base64 image
  - Logo now served from `https://logtide.dev/logo/dark.svg` (light backgrounds)
  - Removed `logo-base64.txt` and simplified logo module

- **Ingestion JSON Parse Errors Returning 500**: Malformed JSON in ingestion requests now correctly returns 400 Bad Request
  - Added global error handler to propagate `statusCode` from content type parser errors
  - Invalid JSON/NDJSON payloads no longer cause Internal Server Error responses

---

## [0.5.3]  - 2026-02-04

### Added

- **Hostname Filter for Syslog Sources**: See which machine each log comes from (#80)
  - Hostname automatically extracted from `hostname`, `host`, `_HOSTNAME` (journald), or `kubernetes.host`
  - New **Hostnames** filter dropdown in log search page
  - Hostname displayed in log table under service badge (e.g., `nginx @proxmox-node-1`)
  - Click hostname to filter logs from that specific machine
  - New `/api/v1/logs/hostnames` endpoint for distinct hostnames

### Fixed

- **Log Retention on Compressed Chunks**: Fixed retention cleanup not deleting logs from TimescaleDB compressed chunks
  - Retention service now automatically decompresses chunks before deleting old logs
  - Identifies only chunks containing data for the specific organization (not all chunks)
  - Compressed chunks are re-compressed automatically by TimescaleDB's compression policy
  - Fixes issue where per-org retention settings were ignored for data older than `compress_after` interval

- **Fluent Bit Kubernetes Metadata**: Fixed service showing as "unknown" when using Fluent Bit DaemonSet in Kubernetes (#118)
  - Service name now correctly extracted from nested `kubernetes.container_name`
  - Falls back to `kubernetes.labels.app` or `kubernetes.labels['app.kubernetes.io/name']`
  - Full Kubernetes metadata (pod_name, namespace_name, labels) preserved in log metadata
  - No Fluent Bit config changes required - works out of the box

### Performance

- **Database Performance Monitoring**: Major optimizations for large-scale deployments (30M+ logs)
  - **log_identifiers table optimization** (Migration 018):
    - Converted to TimescaleDB hypertable with daily partitioning
    - Enabled automatic compression (80%+ space reduction)
    - Removed 5+ GB of unused indexes (0 scans in production)
    - Filtered out redundant org_id/project_id identifiers (~31% space savings)
    - Expected: 10 GB → 1-2 GB storage, 2-5x faster queries
  - **Continuous aggregates for spans and detection events** (Migration 019):
    - `spans_hourly_stats` / `spans_daily_stats`: Pre-computed P50/P95/P99 latency, error rates per service
    - `detection_events_hourly_stats` / `detection_events_daily_stats`: SIEM dashboard metrics
    - `detection_events_rule_stats`: Top threats query optimization
    - 15 new indexes for aggregate tables
    - Dashboard queries: 10-50x faster (seconds → milliseconds)
  - **Hybrid query architecture**:
    - Uses aggregates for historical data (>1 hour old)
    - Queries raw tables for recent data (real-time accuracy)
    - Parallel query execution with `Promise.all()`
  - **Admin monitoring endpoints**:
    - `getCompressionStats()`: Per-hypertable compression metrics
    - `getAggregateStats()`: Continuous aggregate health monitoring
  - **Massive data seeding script** (`npm run seed:massive`):
    - Generates 30M logs, 1M spans, 100K detection events
    - Uses PostgreSQL `generate_series` for maximum performance
    - Useful for performance testing and benchmarking

---

## [0.5.2] - 2026-02-03

### Security

- **Fastify Security Vulnerabilities**: Upgraded Fastify from 4.x to 5.7.3+ to fix critical CVEs
  - CVE: Content-Type header tab character allows body validation bypass (fixed in 5.7.2)
  - CVE: DoS via Unbounded Memory Allocation in sendWebStream (fixed in 5.7.3)
  - Updated all @fastify/* plugins to compatible v5 versions

### Fixed

- **API Batch Request Limit**: Fixed `logIds must NOT have more than 100 items` error in log search tail mode
  - `getLogIdentifiersBatch` now automatically splits requests into batches of 100
  - Supports up to 1000 logs in tail mode without errors
  - Batches executed in parallel for performance

- **Unicode Escape Sequences**: Fixed `unsupported Unicode escape sequence` error during log ingestion
  - Sanitizes `\u0000` (null characters) from log data before PostgreSQL insertion
  - Affects message, service, metadata, trace_id, and span_id fields

- **POST Requests Without Body**: Fixed CDN/proxy compatibility issues with empty POST requests
  - `disablePack`: Now sends `organizationId` in request body instead of query string
  - `notification-channels/test`: Now sends `organizationId` in request body
  - `resendInvitation`, `testConnection`, `leaveOrganization`: Now send empty `{}` body
  - Backend routes accept `organizationId` from body or query for backwards compatibility

---

## [0.5.1] - 2026-02-01

### Added

- **Notification Channels**: Configurable notification destinations for alerts and Sigma rules
  - Create and manage multiple notification channels per organization
  - Support for Email (SMTP) and Webhook channel types
  - Link channels to alert rules and Sigma rules
  - Channel testing before saving
  - UI for channel management in settings

### Changed

- **UI Space Optimization**: Maximize content area for better log visibility (#108)
  - Reduced excessive margins and padding around main content
  - Log lines wrap less frequently on standard screens
  - Better use of available screen real estate

### Fixed

- **Invitation Email Resend**: Fixed SMTP invitation resend functionality (#111)
  - Updated invitation API endpoints structure
  - Refactored email generation for invitations

---

## [0.5.0] - 2026-01-31

### Added

- **Terminal Log View**: Alternative terminal-style visualization for logs
  - Toggle between Table and Terminal views in the search page
  - Monospace font with ANSI-style color coding by log level
  - Format: `[timestamp] [LEVEL] [service] message`
  - Full light/dark mode support
  - Auto-scroll with Live Tail integration
  - Text selectable for easy copy/paste
  - View preference persisted in session storage
  - Accessible with ARIA attributes for screen readers

- **Detection Packs**: Pre-configured Sigma rule bundles for common use cases (#88)
  - Gallery dialog to browse and enable detection packs
  - One-click deployment of curated security rules
  - Customization options for pack rules
  - Logsource product set to 'any' for broader applicability

- **Event Correlation**: Link related logs by identifier (#89)
  - Correlate events by `request_id`, `trace_id`, `user_id`, or custom fields
  - Automatic identifier extraction from log metadata
  - UI with loading states and configuration links
  - Click any identifier to find all related logs

- **Alert Preview "Would Have Fired"**: Test alerts before enabling (#91)
  - Preview which logs would trigger an alert rule
  - Analyze historical data to validate alert conditions
  - Dark mode support for preview UI

- **Optional Redis Dependency**: Redis is now optional for simpler deployments (#90)
  - PostgreSQL-based job queues using `graphile-worker` when Redis is unavailable
  - PostgreSQL `LISTEN/NOTIFY` for real-time log streaming (live tail)
  - In-memory rate limiting fallback when Redis is not configured
  - Queue abstraction layer with adapter pattern (BullMQ for Redis, graphile-worker for PostgreSQL)
  - New `docker-compose.simple.yml` for Redis-free deployments
  - Automatic backend selection based on `REDIS_URL` environment variable
  - Graceful degradation: caching disabled, rate limiting in-memory, jobs via PostgreSQL

- **Queue System Architecture**: Unified queue interface supporting multiple backends
  - `IQueueAdapter` and `IWorkerAdapter` interfaces for queue operations
  - `QueueSystemManager` singleton with queue/worker instance caching
  - Proper resource cleanup on shutdown (closes all cached queue/worker instances)
  - Type-safe job processors with `IJob<T>` generic interface

### Changed

- **Configuration**: `REDIS_URL` is now optional
  - If not set, backend automatically uses PostgreSQL alternatives
  - Existing deployments with Redis continue to work unchanged
  - Health check endpoint reports Redis as `not_configured` when unavailable

- **Cache System**: Graceful handling of missing Redis
  - All cache operations return `null` when Redis unavailable
  - No errors thrown, application continues without caching
  - SigmaHQ GitHub client works without Redis (skips caching)

- **Authentication**: Token retrieval refactored to use localStorage

### Fixed

- **Log Context Modal Reopening**: Fixed modal reopening after close when opened via URL params
  - Closing the modal now clears `logId` and `projectId` from URL
  - Prevents effect from re-triggering and reopening the dialog

- **Exception Details from Metadata**: Error info in log metadata now displayed in Exception Details dialog
  - Previously showed "No exception found" when error data was in metadata field
  - Now extracts and displays `stack`, `reason`, `message`, `error` fields from metadata
  - Shows context fields (`env`, `service`, `version`, `hostname`) in a grid
  - Copy button for stack trace
  - Fallback view when no parsed exception exists in database

- **WebSocket Memory Leak**: Fixed potential memory leak in live tail WebSocket handler
  - Added proper socket cleanup in error handler
  - `safeSend` helper prevents sending to closed sockets
  - Race condition fix with `isSocketOpen` tracking

- **SQL Injection Prevention**: Fixed potential SQL injection in notification publisher
  - Removed manual quote escaping, using Kysely parameterized queries

### Documentation

- Updated deployment docs for Redis-optional configuration
- Added `docker-compose.simple.yml` example for minimal deployments

---

## [0.4.2] - 2026-01-15

### Added

- **Clipboard Utility**: Centralized `copyToClipboard` function (#102)
  - Unified copy behavior across all components
  - Proper fallback for older browsers
  - Updated copy functions in API key, log detail, and trace components

- **Config Validation Tests**: Added test coverage for configuration validation

### Fixed

- **Documentation**: Fixed `api_key_secret` in `.env.example`
- **Documentation**: Added `map_syslog_level.lua` download command to README (#96)
- **Documentation**: Fixed OTLP endpoint URLs in docs (#87)
- **Docker**: Added more configuration info in `docker-compose.yml`

---

## [0.4.1] - 2026-01-10

### Added

- **Exception Parsers**: Multi-language stack trace parsing (#84)
  - PHP exception parser with frame extraction
  - Go panic/stack trace parser
  - Node.js Error parser with V8 stack format
  - Python traceback parser
  - Java exception parser with cause chain support
  - Comprehensive test coverage for all parsers

### Changed

- **Dependencies**: Bump @sveltejs/kit (#86)

### Fixed

- **Dependencies**: Update devalue package to 5.6.2
- **OTLP URLs**: Fixed endpoint URLs in ApiKeyStep, EmptyDashboard, and EmptyTraces components

---

## [0.4.0]

### Added

- **Substring Search Mode**: Find text anywhere in log messages (#68)
  - New search mode dropdown in the Logs Search page
  - **Full-text** mode: Word-based search with stemming (default, existing behavior)
  - **Substring** mode: Find partial matches anywhere in messages (e.g., "bluez" in "spa.bluez5.native")
  - Powered by PostgreSQL `pg_trgm` extension with GIN trigram index for fast performance
  - Admin settings to configure default search mode system-wide
  - Search mode preference saved per-session in browser
  - 10 new integration tests for substring search

- **Clickable Dashboard Elements**: Interactive navigation from dashboard (#67)
  - Recent errors, top services, and other dashboard items are now clickable
  - Clicking an item navigates to the corresponding search page with pre-applied filters
  - Improved discoverability and workflow efficiency

- **Enhanced Exception & Stack Trace Visualization**: Better debugging experience (#23)
  - Auto-detect stack traces from multiple languages (Node.js, Python, Java, Go, PHP)
  - Parse traces into structured frames with file, line, function, and column information
  - Syntax highlighting for better readability
  - Exception type badges (e.g., "TypeError", "ValueError")
  - Collapsible frames showing top 3-5 by default
  - Copy functionality for traces and individual frames
  - Error grouping by stack trace fingerprint with frequency tracking

- **Customizable Log Retention Policy**: Per-organization retention settings
  - Configure retention period per organization
  - Admin UI for managing retention policies
  - Background worker for automatic log cleanup

### Changed

- **Project Rebranding**: LogWard renamed to LogTide ([discussion](https://github.com/orgs/logtide-dev/discussions/81))
  - Name change due to trademark conflict with a European supply chain software company
  - New name reflects the platform's mission: "Log" for what we manage, "Tide" for the continuous flow of observability data
  - All references updated across codebase, documentation, and UI

- **Improved Custom Time Range Picker**: Stateful time selection (#72)
  - Custom time range fields now pre-populated with values from recently used presets
  - Previously entered date/time values preserved when switching between preset and custom modes
  - Quick adjustments without complete re-entry of time ranges
  - Better UX for power users who frequently adjust time windows

### Fixed

- **Export All Pages**: Log export now includes all matching logs (#71)
  - CSV and JSON exports previously only captured logs from the current visible page (~25 entries)
  - Export now retrieves all logs matching the current filters across all pages
  - No more manual merging of multiple exports required

### BREAKING CHANGES

Due to the rebrand from LogWard to LogTide, the following changes require action when upgrading:

**Environment Variables (rename in your `.env` file):**
| Old Variable | New Variable |
|-------------|--------------|
| `LOGWARD_PORT` | `LOGTIDE_PORT` |
| `LOGWARD_BACKEND_IMAGE` | `LOGTIDE_BACKEND_IMAGE` |
| `LOGWARD_FRONTEND_IMAGE` | `LOGTIDE_FRONTEND_IMAGE` |

**Fluent Bit Configuration (if using custom config):**
- Internal variables in `fluent-bit.conf` renamed: `${LOGWARD_API_KEY}` → `${LOGTIDE_API_KEY}`, `${LOGWARD_API_HOST}` → `${LOGTIDE_API_HOST}`
- If you're using the default config from the repo, just pull the new version
- The `.env` variable `FLUENT_BIT_API_KEY` remains unchanged

**Database Defaults (only affects new installations):**
- Default database name: `logward` → `logtide`
- Default database user: `logward` → `logtide`
- Existing installations can keep the old names by setting `DB_NAME` and `DB_USER` explicitly

**Docker (update your docker-compose overrides if any):**
- Container names: `logward-*` → `logtide-*` (e.g., `logward-backend` → `logtide-backend`)
- Network name: `logward-network` → `logtide-network`
- Default images: `logward/backend` → `logtide/backend`, `logward/frontend` → `logtide/frontend`
- GHCR images: `ghcr.io/logward-dev/logward-*` → `ghcr.io/logtide-dev/logtide-*`

**Service Names:**
- Internal service names changed from `logward-backend`/`logward-worker` to `logtide-backend`/`logtide-worker`
- This affects logs if you filter by service name

**SMTP Default:**
- Default sender: `noreply@logward.local` → `noreply@logtide.local`
- Override with `SMTP_FROM` if you have a custom sender

**Migration Guide:**
1. Stop your containers: `docker compose down`
2. Update your `.env` file with renamed variables
3. Pull new images: `docker compose pull`
4. Start containers: `docker compose up -d`
5. Data is preserved - no database migration needed

- **Website Separation**: Homepage and documentation moved to dedicated website
  - Landing page and all documentation pages moved to [logtide.dev](https://logtide.dev)
  - App homepage now redirects to `/dashboard` (authenticated) or `/login` (unauthenticated)
  - All internal `/docs` links updated to external `https://logtide.dev/docs`
  - Navbar, Footer, and empty state components updated with external documentation links
  - Cleaner separation between marketing website and application

### Removed

- **Documentation Pages**: Removed 24 documentation pages from the app
  - Getting Started, API Reference, SDK docs (Node.js, Python, Go, PHP, Kotlin, C#)
  - Migration guides (Datadog, Splunk, ELK, Loki, SigNoz)
  - Authentication, Deployment, Architecture, Contributing guides
  - All documentation now available at [logtide.dev/docs](https://logtide.dev/docs)

- **Documentation Components**: Removed docs-specific UI components
  - DocsSidebar, DocsTableOfContents, CodeBlock, Breadcrumbs components removed
  - These components are now part of the dedicated website project

## [0.3.3] - 2026-01-02

### Added

- **LDAP Authentication**: Enterprise directory integration for user authentication (#58)
  - LDAP/Active Directory server configuration via environment variables
  - Bind DN and search filter customization
  - Automatic user provisioning on first login
  - Secure LDAPS (SSL/TLS) support

- **OpenID Connect (OIDC)**: SSO integration with identity providers (#58)
  - Support for any OIDC-compliant provider (Authentik, Keycloak, Okta, Auth0, etc.)
  - Automatic discovery via `.well-known/openid-configuration`
  - Configurable scopes and claims mapping
  - Silent token refresh for seamless sessions

- **Initial Admin via Environment Variables**: Bootstrap admin account on first deployment (#58, #57)
  - Set `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`, `INITIAL_ADMIN_NAME` in `.env`
  - Auto-generates secure password if not provided (displayed in logs)
  - Only creates admin if no users with login credentials exist
  - Safe to leave configured - ignored after first user creation

- **Disable Sign-ups**: Control user registration for private deployments (#58)
  - Set `DISABLE_SIGNUPS=true` to prevent new user registration
  - Existing users and external auth (LDAP/OIDC) unaffected
  - Useful for invitation-only or enterprise deployments

- **Auth-free Mode for Home Labs**: Simplified single-user access (#58)
  - Set `AUTH_FREE_MODE=true` to bypass authentication entirely
  - Automatically uses first available organization
  - Perfect for home lab and development environments
  - Warning displayed in UI when enabled

- **ARM64 / Raspberry Pi Support**: Full support for ARM-based deployments (#58)
  - LogTide images built for both `linux/amd64` and `linux/arm64`
  - Native support for Raspberry Pi 3/4/5 (64-bit OS)
  - Configurable Fluent Bit image via `FLUENT_BIT_IMAGE` environment variable
  - Documentation for ARM64-specific Fluent Bit registry (`cr.fluentbit.io`)

### Changed

- **Fluent Bit**: Updated default version from `latest` to `4.2.2`
  - All documentation updated with pinned version
  - ARM64 alternative documented in all code examples

### Fixed

- **Mobile Navigation Menu**: Fixed hamburger menu button not working on mobile devices (#69)
  - Added `mobileMenuOpen` state to track menu visibility
  - Hamburger button now opens a sliding drawer with full navigation
  - Mobile menu includes all navigation items, organization switcher, and onboarding checklist
  - Smooth slide-in animation with backdrop overlay
  - Menu closes when clicking outside, pressing Escape, or navigating to a new page
  - Added mobile sidebar for documentation pages with "Menu" button

- **Services Dropdown in Log Search**: Fixed services combo box only showing services from current page (#66)
  - New `GET /api/v1/logs/services` endpoint returns all distinct services within the time range
  - Services dropdown now loads from API instead of deriving from current page logs
  - Services remain visible when applying filters (no more disappearing options)
  - Services list sorted alphabetically for easier navigation
  - Auto-refresh when changing time range or project selection
  - Loading indicator while fetching services
  - Selected services persist when changing time range (shows "no logs" indicator if empty)
  - Reset filters correctly when switching organization

- **Journald Log Format Detection**: Automatic parsing of systemd-journald logs (#60)
  - Auto-detects journald format (`_SYSTEMD_UNIT`, `SYSLOG_IDENTIFIER`, `MESSAGE`, `PRIORITY`, etc.)
  - Extracts service name from `SYSLOG_IDENTIFIER` → `_SYSTEMD_UNIT` → `_COMM` → `_EXE`
  - Extracts actual message from `MESSAGE` field instead of showing raw JSON
  - Maps `PRIORITY` (0-7) to LogTide levels (critical/error/warn/info/debug)
  - Uses journald timestamp (`__REALTIME_TIMESTAMP`) when present (already UTC)

- **Syslog Level Mapping**: Improved handling of syslog severity levels (#60)
  - Automatic mapping of syslog levels (notice, alert, emerg) to LogTide levels
  - Case-insensitive level normalization
  - Fixes logs appearing as "unknown" level

- **OTLP Protobuf Parsing**: Proper binary protobuf support for OpenTelemetry (#60)
  - Added `@opentelemetry/otlp-transformer` for correct protobuf decoding
  - Fixes "Request body size did not match Content-Length" errors
  - JSON and Protobuf formats both fully supported

---

## [0.3.2] - 2025-12-22

### Fixed

- **SvelteKit 2 Compatibility**: Updated imports from `$app/stores` to `$app/state` and adjusted event handlers (#55)
  - Migrated deprecated `$app/stores` imports to the new `$app/state` module
  - Updated event handlers to use the new SvelteKit 2 patterns
  - Ensures compatibility with latest SvelteKit versions

- **Traces Page Navigation**: Fixed "Get API Key" button on empty traces page leading to 404 (#53)
  - Corrected navigation path from `/projects` to `/dashboard/projects`
  - Fixed navigation buttons on the 404 error page
  - Fixed feature tour links missing `/dashboard` prefix (search, alerts, traces, projects)
  - Fixed trace detail page "Back to Traces" navigation

- **Registration Error**: Fixed "Failed to fetch" error during user registration (#54, fixes #52)
  - Resolved network error that prevented new users from completing registration
  - Improved error handling in the registration flow

---

## [0.3.1] - 2025-12-19

### Changed

- **Security Policy**: Updated supported versions in SECURITY.md

---

## [0.3.0] - 2025-12-10

### Added

- **SIEM Dashboard**: Full-featured Security Information and Event Management interface
  - Security Dashboard with 6 real-time widgets:
    - Summary stats (total detections, incidents, open, critical)
    - Top threats chart (Sigma rules ranked by detection count)
    - Detection timeline (time-series visualization)
    - Affected services list
    - Severity distribution pie chart
    - MITRE ATT&CK heatmap (techniques across tactics matrix)
  - Incident List page with filtering (status, severity) and pagination
  - Incident Detail page with three tabs:
    - Detections: matched log events with field details
    - Comments: collaboration thread for incident response
    - History: full activity timeline of status changes
  - Incident status workflow (Open → Investigating → Resolved → False Positive)
  - Assignee management for incident ownership
  - PDF export for incident reports (print-based generation)
  - Real-time updates via SSE (Server-Sent Events)

- **C# / .NET SDK**: Official SDK for .NET 6/7/8 applications
  - Full documentation at `/docs/sdks/csharp`
  - Automatic batching with configurable size and interval
  - Retry logic with exponential backoff
  - Circuit breaker pattern for fault tolerance
  - Query API for searching and filtering logs
  - Trace ID context for distributed tracing
  - ASP.NET Core middleware for auto-logging HTTP requests
  - Dependency injection support
  - Thread-safe, full async/await support

- **IP Reputation & GeoIP Enrichment** (Backend ready, UI in incident detail)
  - IP reputation lookup integration
  - GeoIP data display with map visualization
  - Enrichment cards in incident detail view

- **Organization Invitations**: Invite users to join your organization
  - Send email invitations to new team members
  - Pending invitations management (view, resend, revoke)
  - Role assignment on invite (admin, member)
  - Invitation acceptance flow with automatic org membership
  - Invitation expiration handling

- **Horizontal Scaling Documentation**: Guide for scaling LogTide across multiple instances
  - Traefik reverse proxy configuration with load balancing
  - Docker Compose overlay for scaled deployments
  - Sticky sessions for SSE connections
  - Health check configuration for backend instances
  - Environment variables for scaling configuration

### Changed

- **Homepage**: Added Go and C# to "Works with your stack" section
- **SDK Overview**: Added C# SDK card with installation and features
- **Sidebar Navigation**: Added C# / .NET link to SDKs section
- **README**:
  - Added SIEM Dashboard screenshot
  - Added SIEM feature to Alpha features list
  - New dedicated section for SIEM Dashboard & Incident Management
  - Added C# SDK to SDKs table
  - Updated Kotlin SDK link to GitHub repository

### Fixed

- PDF export now properly connected in incident detail page (was missing `onExportPdf` prop)

---

## [0.2.4] - 2025-12-04

### Added

- **Syslog Integration Documentation**: New guide for collecting logs from infrastructure
  - Fluent Bit configuration for syslog UDP/TCP on port 514
  - Parsers for RFC 3164 (traditional) and RFC 5424 (modern) syslog formats
  - Lua script for mapping syslog severity to log levels
  - Device-specific guides: Proxmox VE, VMware ESXi, UniFi, pfSense, Synology
  - Credit to Brandon Lee / VirtualizationHowto for inspiration

- **Go SDK Documentation**: Official SDK docs at `/docs/sdks/go`
  - Installation, quick start, configuration options
  - Logging methods, error handling, OpenTelemetry integration
  - HTTP middleware examples (standard library, Gin)

- **Documentation Restructure**
  - New "Integrations" section in docs sidebar (Syslog, OpenTelemetry)
  - Go SDK added to SDK overview and sidebar

### Changed

- **Docker Compose**: Improved container orchestration
  - Worker now depends on backend health (fixes migration race condition)
  - Redis healthcheck fixed with proper authentication
  - Updated all docker-compose files (production, dev, README, docs)

- **Onboarding Flow**: Fixed "Skip tutorial" behavior
  - Skip now goes to organization creation (required step)
  - After creating org, redirects to dashboard instead of continuing tutorial
  - Added `skipAfterOrgCreation` flag to onboarding store

- **Runtime Configuration**: Fixed PUBLIC_API_URL build-time vs runtime issue
  - Components now use `getApiUrl()` for runtime configuration
  - API URL can be changed via environment variables without rebuild
  - Affected: ApiKeyStep, FirstLogStep, EmptyLogs, EmptyTraces, EmptyDashboard

### Fixed

- "Sign Up Free" link on landing page pointing to non-existent `/signup` (now `/register`)
- Skip tutorial redirect loop to `/onboarding`
- API URL in code examples showing localhost instead of configured URL

## [0.2.3] - 2025-12-03

### Added

- **Docker Image Publishing**: Automated CI/CD for container distribution
  - GitHub Actions workflow (`publish-images.yml`) for building and pushing images
  - Multi-platform builds (linux/amd64, linux/arm64)
  - Automatic semantic versioning tags (e.g., 0.2.3, 0.2, 0, latest)
  - **Docker Hub**: `logtide/backend`, `logtide/frontend`
  - **GitHub Container Registry**: `ghcr.io/logtide-dev/logtide-backend`, `ghcr.io/logtide-dev/logtide-frontend`
  - Triggered on git tags (`v*.*.*`) or manual workflow dispatch

- **Self-Hosting Documentation**: Comprehensive deployment guides
  - Updated README with inline `docker-compose.yml` example
  - New deployment docs with pre-built images as recommended method
  - Environment variables reference table
  - Production tips (version pinning, SSL, backups)

### Changed

- **docker-compose.yml**: Now uses pre-built images from Docker Hub by default
  - Configurable via `LOGTIDE_BACKEND_IMAGE` and `LOGTIDE_FRONTEND_IMAGE` environment variables
  - No local build required for self-hosting

- **Documentation**: Updated all docs pages
  - `/docs` - Quick start with full docker-compose.yml inline
  - `/docs/getting-started` - Installation with pre-built images
  - `/docs/deployment` - Removed install.sh references, added image registry info

## [0.2.2] - 2025-12-02

### Added

- **Onboarding Tutorial**: Comprehensive guided setup for new users
  - Multi-step wizard with progress tracking:
    - Welcome step with personalized greeting
    - Organization creation with validation
    - Project creation with environment presets (Production, Staging, Development, Testing)
    - API key generation with code examples (cURL, Node.js, Python, PHP, Kotlin)
    - First log verification with real-time detection
    - Feature tour highlighting key capabilities
  - Skip and resume functionality (persisted to localStorage)
  - Mobile responsive design
  - Full keyboard accessibility (ARIA labels, focus management)
  - Backend API: `GET/POST /api/v1/onboarding/state`

- **Empty State Components**: Helpful guidance when no data exists
  - `EmptyLogs`: Guidance for log search with quick actions
  - `EmptyTraces`: Trace collection setup instructions
  - `EmptyDashboard`: Getting started checklist for new users

- **User Onboarding Checklist**: Persistent progress tracking
  - Sidebar widget showing setup completion status
  - Automatic detection of completed steps
  - Quick navigation to incomplete tasks
  - Dismissible after completion

- **UI Enhancements**
  - `HelpTooltip` component for contextual help
  - `FeatureBadge` component for feature highlighting
  - `Progress` component for visual progress bars
  - `UserSettingsDialog` with tutorial restart option

### Changed

- **Testing Infrastructure**: Significantly expanded test coverage
  - Backend: 897 tests (up from 563), **77.34% coverage** (up from 71%)
  - E2E: ~70 Playwright tests across 10 test files
  - New E2E journeys: onboarding flow, empty states, accessibility
  - Mobile responsive testing with viewport simulation

### Fixed

- Improved organization context handling in dashboard navigation
- Better error states and loading indicators throughout the app

## [0.2.1] - 2025-12-01

### Added

- **Redis Caching Layer**: Comprehensive caching to minimize database load
  - CacheManager utility with type-safe keys and configurable TTLs
  - Session validation caching (30 min TTL, invalidated on logout)
  - API key verification caching (60 sec TTL, async last_used updates)
  - Query result caching with deterministic keys (60 sec TTL)
  - Trace and aggregation caching (5 min TTL)
  - Automatic cache invalidation on log ingestion
  - Admin API endpoints for cache management:
    - `GET /api/v1/admin/cache/stats` - Cache hit/miss statistics
    - `POST /api/v1/admin/cache/clear` - Clear all cache
    - `POST /api/v1/admin/cache/invalidate/:projectId` - Invalidate project cache
  - Configuration via `CACHE_ENABLED` and `CACHE_TTL` environment variables

- **Landing Page**: New public index page for the application

### Changed

- **Database Optimization**: Comprehensive optimizations for sub-100ms query latency
  - New composite indexes for common query patterns:
    - `idx_logs_project_level_time` (project + level filtering)
    - `idx_logs_project_service_time` (project + service filtering)
    - `idx_logs_project_service_level_time` (combined filtering)
    - `idx_logs_project_errors` (partial index for error logs)
  - TimescaleDB Continuous Aggregates:
    - `logs_hourly_stats` for dashboard timeseries (10-50x faster)
    - `logs_daily_stats` for historical analytics
  - Compression policy changed from 7 days to 1 day (90% storage reduction)
  - PostgreSQL tuning (parallel queries, shared_buffers, work_mem, WAL)
  - Connection pooling with environment-based sizing (5/10/20 connections)
  - Statement timeout protection (30s prod, 60s dev)
  - Admin health endpoint with pool statistics

### Performance

- Session validation: ~30x faster (cache hit)
- API key verification: ~20x faster (cache hit)
- Query results: ~10x faster (cache hit)
- Aggregations: ~50x faster (cache hit)
- Verified: 722,890 logs ingested at 7.40ms P95, 0% errors

### Fixed

- **Admin Panel**: Fixed double sidebar and footer issue (layout inheritance reset)
- **Admin Routes**: Fixed incorrect navigation paths (missing `/dashboard` prefix)
  - User Management links now correctly navigate to user details
  - Organization Management links now correctly navigate to organization details
  - Projects Management links now correctly navigate to project details

## [0.2.0] - 2025-11-29

### Added

- **OpenTelemetry Support**: Full OTLP (OpenTelemetry Protocol) integration
  - `POST /v1/otlp/logs` endpoint for log ingestion (protobuf + JSON)
  - `POST /v1/otlp/traces` endpoint for trace ingestion
  - Automatic trace_id and span_id extraction
  - Resource attributes mapping to metadata
  - Severity number to log level conversion

- **Distributed Tracing**
  - Traces API with full CRUD operations
  - Span timeline visualization (Gantt chart)
  - Trace-to-logs correlation (click span to see related logs)
  - Service dependencies graph visualization
  - Keyboard accessibility for span selection

- **Testing Infrastructure**
  - 563+ backend tests with 71% coverage
  - 60 E2E tests with Playwright
  - Test factories for spans and traces
  - Load testing scripts with k6

### Changed

- Optimized OTLP ingestion performance for high-throughput scenarios
- Enhanced span selection UX with keyboard navigation
- Optimized service dependencies query performance

### Fixed

- Frontend UX issues during OTLP data display
- Trace_id handling now accepts any string format

## [0.1.0] - 2025-11-01

### Added

- Initial public alpha release
- Multi-organization architecture with data isolation
- High-performance batch log ingestion API
- Real-time log streaming via Server-Sent Events (SSE)
- Advanced search and filtering (service, level, time, full-text, trace_id)
- TimescaleDB compression and automatic retention policies
- Dashboard with organization-wide statistics
- Alert system with threshold-based rules
- Email and webhook notifications
- Sigma detection engine for security rules
- Official SDKs: Node.js, Python, PHP, Kotlin
- Docker Compose deployment support
