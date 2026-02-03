import type { FastifyRequest, FastifyReply, FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';
import { getInternalLogger, isInternalLoggingEnabled } from '../utils/internal-logger.js';

/**
 * Internal logging plugin for Fastify
 * Logs all requests/responses except ingestion endpoints to avoid infinite loops
 */
const internalLoggingPlugin: FastifyPluginCallback = (fastify, _options, done) => {
  // Skip paths that would create logging loops
  const skipPaths = [
    '/api/v1/ingest', // Log ingestion endpoint
    '/api/v1/logs', // Log query endpoints
    '/api/v1/logs/stream', // SSE streaming
    '/api/v1/logs/trace', // Trace lookup
    '/api/v1/logs/aggregated', // Aggregated stats
    '/api/v1/stats', // Stats endpoint
    '/health', // Health check
    '/healthz', // Alternative health check
  ];

  // Request hook - log incoming requests
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    if (!isInternalLoggingEnabled()) return;

    // Skip logging for certain paths
    if (skipPaths.some((path) => request.url.startsWith(path))) {
      return;
    }

    const logger = getInternalLogger();
    if (!logger) return;

    // Store start time for duration calculation
    (request as any).startTime = Date.now();

    // Extract user context from session or API key
    const userId = (request as any).user?.id;
    const organizationId = (request as any).organizationId;
    const projectId = (request as any).projectId;

    // Log incoming request
    logger.info('http-request', `${request.method} ${request.url}`, {
      method: request.method,
      url: request.url,
      query: request.query,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      userId,
      organizationId,
      projectId,
    });
  });

  // Response hook - log responses
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isInternalLoggingEnabled()) return;

    // Skip logging for certain paths
    if (skipPaths.some((path) => request.url.startsWith(path))) {
      return;
    }

    const logger = getInternalLogger();
    if (!logger) return;

    const startTime = (request as any).startTime || Date.now();
    const duration = Date.now() - startTime;

    // Determine log level based on status code
    const level = reply.statusCode >= 500 ? 'error' : reply.statusCode >= 400 ? 'warn' : 'info';

    // Extract user context
    const userId = (request as any).user?.id;
    const organizationId = (request as any).organizationId;
    const projectId = (request as any).projectId;

    // Log response
    logger.log({
      service: 'http-response',
      level,
      message: `${request.method} ${request.url} ${reply.statusCode} (${duration}ms)`,
      metadata: {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        duration_ms: duration,
        userId,
        organizationId,
        projectId,
      },
    });
  });

  // Error hook - log errors
  fastify.addHook('onError', async (request: FastifyRequest, _reply: FastifyReply, error: Error) => {
    if (!isInternalLoggingEnabled()) return;

    const logger = getInternalLogger();
    if (!logger) return;

    // Extract user context
    const userId = (request as any).user?.id;
    const organizationId = (request as any).organizationId;
    const projectId = (request as any).projectId;

    // Log error with full stack trace
    logger.error('http-error', `Request error: ${error.message}`, {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      request: {
        method: request.method,
        url: request.url,
        userId,
        organizationId,
        projectId,
      },
    });
  });

  done();
};

export default fp(internalLoggingPlugin, {
  fastify: '5.x',
  name: 'internal-logging-plugin',
});
