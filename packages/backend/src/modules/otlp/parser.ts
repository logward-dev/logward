/**
 * OTLP Parser
 *
 * Parses OpenTelemetry Protocol messages in both JSON and Protobuf formats.
 *
 * JSON format: Standard JSON encoding of OTLP messages
 * Protobuf format: Binary protocol buffer encoding
 *
 * @see https://opentelemetry.io/docs/specs/otlp/
 */

import type { OtlpExportLogsRequest } from './transformer.js';

// ============================================================================
// JSON Parser
// ============================================================================

/**
 * Parse OTLP JSON request body.
 * OTLP JSON uses camelCase field names per the specification.
 *
 * @param body - Raw request body (string or object)
 * @returns Parsed OTLP request
 * @throws Error if parsing fails
 */
export function parseOtlpJson(body: unknown): OtlpExportLogsRequest {
  if (!body) {
    return { resourceLogs: [] };
  }

  // If already an object, use directly
  if (typeof body === 'object') {
    return normalizeOtlpRequest(body as Record<string, unknown>);
  }

  // If string, parse as JSON
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      return normalizeOtlpRequest(parsed);
    } catch (error) {
      throw new Error(`Invalid OTLP JSON: ${(error as Error).message}`);
    }
  }

  throw new Error('Invalid OTLP request body type');
}

/**
 * Normalize OTLP request to handle both camelCase and snake_case field names.
 * Some OTLP exporters use snake_case instead of camelCase.
 */
function normalizeOtlpRequest(data: Record<string, unknown>): OtlpExportLogsRequest {
  // Handle both resourceLogs and resource_logs
  const resourceLogs = (data.resourceLogs ?? data.resource_logs) as unknown[];

  if (!Array.isArray(resourceLogs)) {
    return { resourceLogs: [] };
  }

  return {
    resourceLogs: resourceLogs.map(normalizeResourceLogs),
  };
}

function normalizeResourceLogs(rl: unknown): Record<string, unknown> {
  if (!rl || typeof rl !== 'object') return {};

  const data = rl as Record<string, unknown>;

  return {
    resource: data.resource,
    scopeLogs: normalizeScopeLogs(data.scopeLogs ?? data.scope_logs),
    schemaUrl: data.schemaUrl ?? data.schema_url,
  };
}

function normalizeScopeLogs(sl: unknown): unknown[] {
  if (!Array.isArray(sl)) return [];

  return sl.map((s) => {
    if (!s || typeof s !== 'object') return {};
    const data = s as Record<string, unknown>;

    return {
      scope: data.scope,
      logRecords: normalizeLogRecords(data.logRecords ?? data.log_records),
      schemaUrl: data.schemaUrl ?? data.schema_url,
    };
  });
}

function normalizeLogRecords(lr: unknown): unknown[] {
  if (!Array.isArray(lr)) return [];

  return lr.map((l) => {
    if (!l || typeof l !== 'object') return {};
    const data = l as Record<string, unknown>;

    return {
      timeUnixNano: data.timeUnixNano ?? data.time_unix_nano,
      observedTimeUnixNano: data.observedTimeUnixNano ?? data.observed_time_unix_nano,
      severityNumber: data.severityNumber ?? data.severity_number,
      severityText: data.severityText ?? data.severity_text,
      body: data.body,
      attributes: data.attributes,
      droppedAttributesCount: data.droppedAttributesCount ?? data.dropped_attributes_count,
      flags: data.flags,
      traceId: data.traceId ?? data.trace_id,
      spanId: data.spanId ?? data.span_id,
    };
  });
}

// ============================================================================
// Protobuf Parser
// ============================================================================

/**
 * Parse OTLP Protobuf request body.
 *
 * Note: Full protobuf support requires the OpenTelemetry proto definitions.
 * This implementation provides a basic parser using protobufjs.
 *
 * For production use, consider using @opentelemetry/otlp-transformer or
 * generating TypeScript bindings from the official proto files.
 *
 * @param buffer - Raw protobuf buffer
 * @returns Parsed OTLP request
 * @throws Error if parsing fails
 */
export async function parseOtlpProtobuf(buffer: Buffer): Promise<OtlpExportLogsRequest> {
  // For now, we'll use a simplified approach
  // Full protobuf support would require loading the proto definitions

  try {
    // Try to parse as JSON first (some clients send JSON with protobuf content-type)
    const jsonString = buffer.toString('utf-8');
    if (jsonString.startsWith('{') || jsonString.startsWith('[')) {
      return parseOtlpJson(jsonString);
    }
  } catch {
    // Not JSON, continue to protobuf parsing
  }

  // For protobuf, we need the proto definitions
  // This requires setting up protobufjs with the OpenTelemetry proto files
  //
  // Implementation options:
  // 1. Use pre-compiled proto definitions (recommended)
  // 2. Load proto files at runtime
  // 3. Use @opentelemetry/otlp-proto-exporter-base
  //
  // For now, throw an error indicating protobuf support needs setup

  throw new Error(
    'Protobuf parsing requires proto definitions. ' +
    'Please use application/json content-type or configure protobuf support.'
  );
}

// ============================================================================
// Content-Type Detection
// ============================================================================

export type OtlpContentType = 'json' | 'protobuf' | 'unknown';

/**
 * Detect OTLP content type from Content-Type header.
 *
 * @param contentType - Content-Type header value
 * @returns Detected content type
 */
export function detectContentType(contentType?: string): OtlpContentType {
  if (!contentType) return 'unknown';

  const normalized = contentType.toLowerCase();

  if (normalized.includes('application/json')) {
    return 'json';
  }

  if (
    normalized.includes('application/x-protobuf') ||
    normalized.includes('application/protobuf')
  ) {
    return 'protobuf';
  }

  return 'unknown';
}

/**
 * Parse OTLP request based on content type.
 *
 * @param body - Request body (Buffer for protobuf, object/string for JSON)
 * @param contentType - Content-Type header value
 * @returns Parsed OTLP request
 */
export async function parseOtlpRequest(
  body: unknown,
  contentType?: string
): Promise<OtlpExportLogsRequest> {
  const type = detectContentType(contentType);

  switch (type) {
    case 'json':
      return parseOtlpJson(body);

    case 'protobuf':
      if (!Buffer.isBuffer(body)) {
        throw new Error('Protobuf content-type requires Buffer body');
      }
      return parseOtlpProtobuf(body);

    default:
      // Try JSON as fallback
      return parseOtlpJson(body);
  }
}
