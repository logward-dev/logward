# Changelog

All notable changes to LogWard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
