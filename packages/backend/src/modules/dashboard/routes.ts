import type { FastifyPluginAsync } from 'fastify';
import { dashboardService } from './service.js';
import { db } from '../../database/index.js';


async function verifyOrganizationAccess(organizationId: string, userId: string): Promise<boolean> {
  const result = await db
    .selectFrom('organization_members')
    .select(['organization_id'])
    .where('organization_id', '=', organizationId)
    .where('user_id', '=', userId)
    .executeTakeFirst();

  return !!result;
}

const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/dashboard/stats - Get dashboard statistics
  fastify.get('/api/v1/dashboard/stats', {
    schema: {
      description: 'Get dashboard statistics for organization',
      tags: ['dashboard'],
      querystring: {
        type: 'object',
        properties: {
          organizationId: { type: 'string', format: 'uuid' },
        },
        required: ['organizationId'],
      },
    },
    handler: async (request: any, reply) => {
      const { organizationId } = request.query as { organizationId: string };

      if (!organizationId) {
        return reply.code(400).send({
          error: 'organizationId is required',
        });
      }

      // SECURITY: Verify user is member of this organization (if using session auth)
      if (request.user?.id) {
        const hasAccess = await verifyOrganizationAccess(organizationId, request.user.id);

        if (!hasAccess) {
          return reply.code(403).send({
            error: 'Access denied - you are not a member of this organization',
          });
        }
      }

      const stats = await dashboardService.getStats(organizationId);
      return stats;
    },
  });

  // GET /api/v1/dashboard/timeseries - Get timeseries data for chart
  fastify.get('/api/v1/dashboard/timeseries', {
    schema: {
      description: 'Get timeseries data for dashboard chart (last 24 hours)',
      tags: ['dashboard'],
      querystring: {
        type: 'object',
        properties: {
          organizationId: { type: 'string', format: 'uuid' },
        },
        required: ['organizationId'],
      },
    },
    handler: async (request: any, reply) => {
      const { organizationId } = request.query as { organizationId: string };

      if (!organizationId) {
        return reply.code(400).send({
          error: 'organizationId is required',
        });
      }

      // SECURITY: Verify user is member of this organization (if using session auth)
      if (request.user?.id) {
        const hasAccess = await verifyOrganizationAccess(organizationId, request.user.id);

        if (!hasAccess) {
          return reply.code(403).send({
            error: 'Access denied - you are not a member of this organization',
          });
        }
      }

      const timeseries = await dashboardService.getTimeseries(organizationId);
      return { timeseries };
    },
  });

  // GET /api/v1/dashboard/top-services - Get top services
  fastify.get('/api/v1/dashboard/top-services', {
    schema: {
      description: 'Get top services by log count for organization',
      tags: ['dashboard'],
      querystring: {
        type: 'object',
        properties: {
          organizationId: { type: 'string', format: 'uuid' },
          limit: { type: 'number', minimum: 1, maximum: 20, default: 5 },
        },
        required: ['organizationId'],
      },
    },
    handler: async (request: any, reply) => {
      const { organizationId, limit } = request.query as { organizationId: string; limit?: number };

      if (!organizationId) {
        return reply.code(400).send({
          error: 'organizationId is required',
        });
      }

      // SECURITY: Verify user is member of this organization (if using session auth)
      if (request.user?.id) {
        const hasAccess = await verifyOrganizationAccess(organizationId, request.user.id);

        if (!hasAccess) {
          return reply.code(403).send({
            error: 'Access denied - you are not a member of this organization',
          });
        }
      }

      const services = await dashboardService.getTopServices(organizationId, limit || 5);
      return { services };
    },
  });

  // GET /api/v1/dashboard/timeline-events - Get alert/detection events for chart markers
  fastify.get('/api/v1/dashboard/timeline-events', {
    schema: {
      description: 'Get timeline events (alerts + detections) for last 24 hours',
      tags: ['dashboard'],
      querystring: {
        type: 'object',
        properties: {
          organizationId: { type: 'string', format: 'uuid' },
        },
        required: ['organizationId'],
      },
    },
    handler: async (request: any, reply) => {
      const { organizationId } = request.query as { organizationId: string };

      if (!organizationId) {
        return reply.code(400).send({
          error: 'organizationId is required',
        });
      }

      if (request.user?.id) {
        const hasAccess = await verifyOrganizationAccess(organizationId, request.user.id);

        if (!hasAccess) {
          return reply.code(403).send({
            error: 'Access denied - you are not a member of this organization',
          });
        }
      }

      const events = await dashboardService.getTimelineEvents(organizationId);
      return { events };
    },
  });

  // GET /api/v1/dashboard/recent-errors - Get recent errors
  fastify.get('/api/v1/dashboard/recent-errors', {
    schema: {
      description: 'Get recent error logs for organization',
      tags: ['dashboard'],
      querystring: {
        type: 'object',
        properties: {
          organizationId: { type: 'string', format: 'uuid' },
        },
        required: ['organizationId'],
      },
    },
    handler: async (request: any, reply) => {
      const { organizationId } = request.query as { organizationId: string };

      if (!organizationId) {
        return reply.code(400).send({
          error: 'organizationId is required',
        });
      }

      // SECURITY: Verify user is member of this organization (if using session auth)
      if (request.user?.id) {
        const hasAccess = await verifyOrganizationAccess(organizationId, request.user.id);

        if (!hasAccess) {
          return reply.code(403).send({
            error: 'Access denied - you are not a member of this organization',
          });
        }
      }

      const errors = await dashboardService.getRecentErrors(organizationId);
      return { errors };
    },
  });
};

export default dashboardRoutes;
