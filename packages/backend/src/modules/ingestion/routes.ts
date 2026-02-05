import type { FastifyPluginAsync } from 'fastify';
import { ingestRequestSchema, logSchema } from '@logtide/shared';
import { ingestionService } from './service.js';
import { config } from '../../config/index.js';

// Parse NDJSON body into array of log objects
const parseNdjson = (body: string): object[] => {
  const lines = body.toString().trim().split('\n').filter(line => line.trim());
  return lines.map(line => JSON.parse(line));
};

// Detect if this is a systemd-journald formatted log
const isJournaldFormat = (data: any): boolean => {
  return data._SYSTEMD_UNIT || data._COMM || data._EXE ||
         data.SYSLOG_IDENTIFIER || data.MESSAGE !== undefined ||
         data.PRIORITY !== undefined || data._HOSTNAME;
};

// Extract service name from journald fields
const extractJournaldService = (data: any): string => {
  if (data.SYSLOG_IDENTIFIER) return data.SYSLOG_IDENTIFIER;
  if (data._SYSTEMD_UNIT) {
    return data._SYSTEMD_UNIT.replace(/\.service$/, '');
  }
  if (data._COMM) return data._COMM;
  if (data._EXE) {
    const parts = data._EXE.split('/');
    return parts[parts.length - 1];
  }
  return 'unknown';
};

// Extract message from journald format
const extractJournaldMessage = (data: any): string => {
  if (data.MESSAGE) return data.MESSAGE;
  if (data.message) return data.message;
  if (data.log) return data.log;
  return '';
};

// Convert syslog PRIORITY (0-7) to LogTide level
const priorityToLevel = (priority: number | string): string => {
  const p = typeof priority === 'string' ? parseInt(priority, 10) : priority;
  if (p <= 2) return 'critical';
  if (p === 3) return 'error';
  if (p === 4) return 'warn';
  if (p <= 6) return 'info';
  return 'debug';
};

// Extract hostname from various log formats
const extractHostname = (data: any): string | undefined => {
  // Direct hostname field (most explicit)
  if (data.hostname) return data.hostname;
  // Journald format
  if (data._HOSTNAME) return data._HOSTNAME;
  // Syslog/Fluent Bit format
  if (data.host) return data.host;
  // Kubernetes metadata
  if (data.kubernetes?.host) return data.kubernetes.host;
  // Nested metadata
  if (data.metadata?.hostname) return data.metadata.hostname;
  if (data.metadata?.host) return data.metadata.host;
  return undefined;
};

// Extract journald metadata fields
const extractJournaldMetadata = (data: any): Record<string, unknown> => {
  const metadata: Record<string, unknown> = {};
  const journaldFields = [
    '_HOSTNAME', '_MACHINE_ID', '_BOOT_ID', '_PID', '_UID', '_GID',
    '_COMM', '_EXE', '_CMDLINE', '_SYSTEMD_CGROUP', '_SYSTEMD_UNIT',
    '_SYSTEMD_SLICE', '_SYSTEMD_USER_UNIT', '_STREAM_ID', '_TRANSPORT',
    'SYSLOG_FACILITY', 'SYSLOG_IDENTIFIER', 'SYSLOG_PID',
    '_SELINUX_CONTEXT', '_RUNTIME_SCOPE'
  ];
  for (const field of journaldFields) {
    if (data[field] !== undefined) {
      metadata[field] = data[field];
    }
  }
  return metadata;
};

// Extract timestamp from journald fields (microseconds epoch)
const extractJournaldTimestamp = (data: any): string | null => {
  const realtimeTs = data.__REALTIME_TIMESTAMP || data._SOURCE_REALTIME_TIMESTAMP;
  if (realtimeTs) {
    try {
      const microseconds = typeof realtimeTs === 'string' ? parseInt(realtimeTs, 10) : realtimeTs;
      const milliseconds = Math.floor(microseconds / 1000);
      return new Date(milliseconds).toISOString();
    } catch {
      // Invalid timestamp
    }
  }
  return null;
};

// Normalize log level from various formats
const normalizeLevel = (level: any): string => {
  if (typeof level === 'number' || !isNaN(Number(level))) {
    const numLevel = Number(level);
    if (numLevel >= 60) return 'critical';
    if (numLevel >= 50) return 'error';
    if (numLevel >= 40) return 'warn';
    if (numLevel >= 30) return 'info';
    return 'debug';
  }

  if (typeof level === 'string') {
    const lowerLevel = level.toLowerCase().trim();
    switch (lowerLevel) {
      case 'emergency': case 'emerg': case 'alert': case 'crit': case 'critical': case 'fatal':
        return 'critical';
      case 'error': case 'err':
        return 'error';
      case 'warning': case 'warn':
        return 'warn';
      case 'notice': case 'info': case 'information':
        return 'info';
      case 'debug': case 'trace': case 'verbose':
        return 'debug';
      default:
        if (['debug', 'info', 'warn', 'error', 'critical'].includes(lowerLevel)) {
          return lowerLevel;
        }
        return 'info';
    }
  }
  return 'info';
};

// Normalize raw log data from Fluent Bit to LogTide format
const normalizeLogData = (logData: any) => {
  if (isJournaldFormat(logData)) {
    const journaldMetadata = extractJournaldMetadata(logData);
    const level = logData.PRIORITY !== undefined
      ? priorityToLevel(logData.PRIORITY)
      : normalizeLevel(logData.level);
    const journaldTime = extractJournaldTimestamp(logData);
    const time = journaldTime
      || logData.time
      || (logData.date ? new Date(logData.date * 1000).toISOString() : new Date().toISOString());
    const hostname = extractHostname(logData);

    return {
      time,
      service: logData.service || extractJournaldService(logData),
      level,
      message: extractJournaldMessage(logData),
      metadata: {
        ...logData.metadata,
        ...journaldMetadata,
        ...(hostname && { hostname }),
        container_id: logData.container_id,
        container_short_id: logData.container_short_id,
        source: 'journald',
      },
    };
  }

  // Standard Fluent Bit format
  // Extract service from various sources (top-level or nested kubernetes metadata)
  const k8s = logData.kubernetes || {};
  const service = logData.service
    || logData.container_name
    || k8s.container_name
    || k8s.labels?.app
    || k8s.labels?.['app.kubernetes.io/name']
    || 'unknown';
  const hostname = extractHostname(logData);

  return {
    time: logData.time || (logData.date ? new Date(logData.date * 1000).toISOString() : new Date().toISOString()),
    service,
    level: normalizeLevel(logData.level),
    message: logData.message || logData.log || '',
    metadata: {
      ...logData.metadata,
      ...(hostname && { hostname }),
      container_id: logData.container_id || k8s.container_id,
      container_short_id: logData.container_short_id,
      // Include k8s metadata if present
      ...(Object.keys(k8s).length > 0 && {
        kubernetes: {
          pod_name: k8s.pod_name,
          namespace_name: k8s.namespace_name,
          container_name: k8s.container_name,
          pod_id: k8s.pod_id,
          host: k8s.host,
          labels: k8s.labels,
        },
      }),
    },
  };
};

const ingestionRoutes: FastifyPluginAsync = async (fastify) => {
  // Add parser for Fluent Bit's NDJSON format (application/x-ndjson)
  fastify.addContentTypeParser('application/x-ndjson', { parseAs: 'string' }, (_req, body, done) => {
    try {
      const logs = parseNdjson(body.toString());
      done(null, { _ndjsonLogs: logs });
    } catch (err: any) {
      const error = new Error(`Invalid NDJSON: ${err.message}`);
      (error as any).statusCode = 400;
      done(error, undefined);
    }
  });

  // Override default JSON parser to handle NDJSON disguised as application/json
  // Fluent Bit sometimes sends json_lines with application/json content-type
  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    try {
      const bodyStr = body?.toString()?.trim() || '';
      if (!bodyStr) {
        // Empty body - return empty object (Fastify 5 compatibility)
        done(null, {});
        return;
      }
      // Check if it looks like NDJSON (multiple lines, each starting with {)
      const lines = bodyStr.split('\n').filter(line => line.trim());
      if (lines.length > 1 && lines.every(line => line.trim().startsWith('{'))) {
        // It's NDJSON disguised as JSON
        const logs = lines.map(line => JSON.parse(line));
        done(null, { _ndjsonLogs: logs });
      } else {
        // Regular JSON
        done(null, JSON.parse(bodyStr));
      }
    } catch (err: any) {
      const error = new Error(`Invalid JSON: ${err.message}`);
      (error as any).statusCode = 400;
      done(error, undefined);
    }
  });

  // POST /api/v1/ingest/single - Ingest logs from Fluent Bit (supports single or batch via NDJSON)
  fastify.post('/api/v1/ingest/single', {
    config: {
      rateLimit: {
        max: config.RATE_LIMIT_MAX, // configurable via RATE_LIMIT_MAX env var
        timeWindow: config.RATE_LIMIT_WINDOW
      }
    },
    schema: {
      description: 'Ingest a single log entry (optimized for Fluent Bit)',
      tags: ['ingestion'],
      body: {
        type: 'object',
        properties: {
          time: { type: 'string' },
          date: { type: 'number' },
          service: { type: 'string' },
          container_name: { type: 'string' },
          level: { type: 'string' },
          message: { type: 'string' },
          log: { type: 'string' },
          metadata: { type: 'object' },
          trace_id: { type: 'string' },
        },
        additionalProperties: true,
      },
      response: {
        200: {
          type: 'object',
          properties: {
            received: { type: 'number' },
            timestamp: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'object' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
    handler: async (request: any, reply) => {
      // Get projectId from authenticated request (set by auth plugin)
      const projectId = request.projectId;

      if (!projectId) {
        return reply.code(401).send({
          error: 'Project context missing',
        });
      }

      // Check if this is a batch from NDJSON parsing
      const rawLogs: any[] = request.body._ndjsonLogs
        ? request.body._ndjsonLogs
        : [request.body];

      // Process all logs
      const validLogs = [];
      const errors = [];

      for (const logData of rawLogs) {
        const log = normalizeLogData(logData);
        const parseResult = logSchema.safeParse(log);

        if (parseResult.success) {
          validLogs.push(parseResult.data);
        } else {
          errors.push({ log: logData, error: parseResult.error.format() });
        }
      }

      if (validLogs.length === 0 && errors.length > 0) {
        return reply.code(400).send({
          error: 'Validation error',
          details: errors[0].error,
        });
      }

      // Ingest all valid logs
      const received = await ingestionService.ingestLogs(validLogs, projectId);

      return {
        received,
        timestamp: new Date().toISOString(),
      };
    },
  });

  // POST /api/v1/ingest - Ingest logs
  fastify.post('/api/v1/ingest', {
    bodyLimit: 50 * 1024 * 1024, // 50MB for large batches
    config: {
      rateLimit: {
        max: config.RATE_LIMIT_MAX, // configurable via RATE_LIMIT_MAX env var
        timeWindow: config.RATE_LIMIT_WINDOW
      }
    },
    schema: {
      description: 'Ingest logs in batch',
      tags: ['ingestion'],
      body: {
        type: 'object',
        properties: {
          logs: {
            type: 'array',
            items: {
              type: 'object',
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            received: { type: 'number' },
            timestamp: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'object' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
    handler: async (request: any, reply) => {
      // Validate request body
      const parseResult = ingestRequestSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.code(400).send({
          error: 'Validation error',
          details: parseResult.error.format(),
        });
      }

      const { logs } = parseResult.data;

      // Get projectId from authenticated request (set by auth plugin)
      const projectId = request.projectId;

      if (!projectId) {
        return reply.code(401).send({
          error: 'Project context missing',
        });
      }

      // Ingest logs
      const received = await ingestionService.ingestLogs(logs, projectId);

      return {
        received,
        timestamp: new Date().toISOString(),
      };
    },
  });

  // GET /api/v1/stats - Get log statistics
  fastify.get('/api/v1/stats', {
    schema: {
      description: 'Get log statistics',
      tags: ['ingestion'],
      querystring: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
        },
      },
    },
    handler: async (request: any, reply) => {
      const { from, to } = request.query as { from?: string; to?: string };

      // Get projectId from authenticated request (set by auth plugin)
      const projectId = request.projectId;

      if (!projectId) {
        return reply.code(401).send({
          error: 'Project context missing',
        });
      }

      const stats = await ingestionService.getStats(
        projectId,
        from ? new Date(from) : undefined,
        to ? new Date(to) : undefined
      );

      return stats;
    },
  });
};

export default ingestionRoutes;
