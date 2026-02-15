import { describe, it, expect } from 'vitest';
import { ExceptionService } from '../../../modules/exceptions/service.js';
import { db } from '../../../database/index.js';
import { createTestContext, createTestLog } from '../../helpers/factories.js';

describe('ExceptionService - Coverage', () => {
  const service = new ExceptionService(db);

  describe('getLogsForErrorGroup', () => {
    it('should return logs matching fingerprint', async () => {
      const ctx = await createTestContext();
      const log = await createTestLog({
        projectId: ctx.project.id,
        level: 'error',
        message: 'Test error for logs lookup',
      });

      await service.createException({
        organizationId: ctx.organization.id,
        projectId: ctx.project.id,
        logId: log.id,
        fingerprint: 'logs-test-fp',
        parsedData: {
          exceptionType: 'Error',
          exceptionMessage: 'Test',
          language: 'nodejs',
          rawStackTrace: '',
          frames: [],
        },
      });

      const result = await service.getLogsForErrorGroup({
        groupId: 'any',
        fingerprint: 'logs-test-fp',
        organizationId: ctx.organization.id,
        projectId: ctx.project.id,
        firstSeen: new Date('2020-01-01'),
        lastSeen: new Date(),
        occurrenceCount: 1,
      });

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].id).toBe(log.id);
      expect(result.total).toBe(1);
    });

    it('should respect limit and offset', async () => {
      const ctx = await createTestContext();

      // Create 5 exceptions with same fingerprint
      for (let i = 0; i < 5; i++) {
        const log = await createTestLog({
          projectId: ctx.project.id,
          level: 'error',
          message: `Error ${i}`,
        });
        await service.createException({
          organizationId: ctx.organization.id,
          projectId: ctx.project.id,
          logId: log.id,
          fingerprint: 'paginate-logs-fp',
          parsedData: {
            exceptionType: 'Error',
            exceptionMessage: `Error ${i}`,
            language: 'nodejs',
            rawStackTrace: '',
            frames: [],
          },
        });
      }

      const page1 = await service.getLogsForErrorGroup({
        groupId: 'any',
        fingerprint: 'paginate-logs-fp',
        organizationId: ctx.organization.id,
        projectId: ctx.project.id,
        firstSeen: new Date('2020-01-01'),
        lastSeen: new Date(),
        occurrenceCount: 5,
        limit: 2,
        offset: 0,
      });

      expect(page1.logs).toHaveLength(2);
      expect(page1.total).toBe(5);
    });

    it('should filter by projectId when provided', async () => {
      const ctx = await createTestContext();
      const log = await createTestLog({
        projectId: ctx.project.id,
        level: 'error',
      });

      await service.createException({
        organizationId: ctx.organization.id,
        projectId: ctx.project.id,
        logId: log.id,
        fingerprint: 'project-filter-fp',
        parsedData: {
          exceptionType: 'Error',
          exceptionMessage: 'Test',
          language: 'nodejs',
          rawStackTrace: '',
          frames: [],
        },
      });

      // Query with wrong project should return empty
      const result = await service.getLogsForErrorGroup({
        groupId: 'any',
        fingerprint: 'project-filter-fp',
        organizationId: ctx.organization.id,
        projectId: '00000000-0000-0000-0000-000000000000',
        firstSeen: new Date('2020-01-01'),
        lastSeen: new Date(),
        occurrenceCount: 1,
      });

      expect(result.logs).toHaveLength(0);
    });

    it('should return offset page with different logs', async () => {
      const ctx = await createTestContext();

      // Create 5 exceptions with same fingerprint
      for (let i = 0; i < 5; i++) {
        const log = await createTestLog({
          projectId: ctx.project.id,
          level: 'error',
          message: `Offset error ${i}`,
        });
        await service.createException({
          organizationId: ctx.organization.id,
          projectId: ctx.project.id,
          logId: log.id,
          fingerprint: 'offset-test-fp',
          parsedData: {
            exceptionType: 'Error',
            exceptionMessage: `Offset error ${i}`,
            language: 'nodejs',
            rawStackTrace: '',
            frames: [],
          },
        });
      }

      const page1 = await service.getLogsForErrorGroup({
        groupId: 'any',
        fingerprint: 'offset-test-fp',
        organizationId: ctx.organization.id,
        projectId: ctx.project.id,
        firstSeen: new Date('2020-01-01'),
        lastSeen: new Date(),
        occurrenceCount: 5,
        limit: 2,
        offset: 0,
      });

      const page2 = await service.getLogsForErrorGroup({
        groupId: 'any',
        fingerprint: 'offset-test-fp',
        organizationId: ctx.organization.id,
        projectId: ctx.project.id,
        firstSeen: new Date('2020-01-01'),
        lastSeen: new Date(),
        occurrenceCount: 5,
        limit: 2,
        offset: 2,
      });

      expect(page1.logs).toHaveLength(2);
      expect(page2.logs).toHaveLength(2);
      // Pages should have different log IDs
      const page1Ids = page1.logs.map(l => l.id);
      const page2Ids = page2.logs.map(l => l.id);
      expect(page1Ids.every(id => !page2Ids.includes(id))).toBe(true);
    });
  });

  describe('getErrorGroupTrend', () => {
    it('should return trend data for existing group', async () => {
      const ctx = await createTestContext();
      const log = await createTestLog({
        projectId: ctx.project.id,
        level: 'error',
      });

      const group = await db
        .insertInto('error_groups')
        .values({
          organization_id: ctx.organization.id,
          project_id: ctx.project.id,
          fingerprint: 'trend-test-fp',
          exception_type: 'Error',
          exception_message: 'Test',
          language: 'nodejs',
          occurrence_count: 1,
          first_seen: new Date(),
          last_seen: new Date(),
          status: 'open',
          sample_log_id: null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      await service.createException({
        organizationId: ctx.organization.id,
        projectId: ctx.project.id,
        logId: log.id,
        fingerprint: 'trend-test-fp',
        parsedData: {
          exceptionType: 'Error',
          exceptionMessage: 'Test',
          language: 'nodejs',
          rawStackTrace: '',
          frames: [],
        },
      });

      const trend = await service.getErrorGroupTrend(group.id, '1d', 7);

      expect(Array.isArray(trend)).toBe(true);
      expect(trend.length).toBeGreaterThanOrEqual(1);
      expect(trend[0]).toHaveProperty('timestamp');
      expect(trend[0]).toHaveProperty('count');
    });

    it('should support hourly interval', async () => {
      const ctx = await createTestContext();
      const log = await createTestLog({
        projectId: ctx.project.id,
        level: 'error',
      });

      const group = await db
        .insertInto('error_groups')
        .values({
          organization_id: ctx.organization.id,
          project_id: ctx.project.id,
          fingerprint: 'hourly-trend-fp',
          exception_type: 'Error',
          exception_message: 'Test',
          language: 'nodejs',
          occurrence_count: 1,
          first_seen: new Date(),
          last_seen: new Date(),
          status: 'open',
          sample_log_id: null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      await service.createException({
        organizationId: ctx.organization.id,
        projectId: ctx.project.id,
        logId: log.id,
        fingerprint: 'hourly-trend-fp',
        parsedData: {
          exceptionType: 'Error',
          exceptionMessage: 'Test',
          language: 'nodejs',
          rawStackTrace: '',
          frames: [],
        },
      });

      const trend = await service.getErrorGroupTrend(group.id, '1h', 1);

      expect(Array.isArray(trend)).toBe(true);
      expect(trend.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by project_id when set on group', async () => {
      const ctx = await createTestContext();
      const log = await createTestLog({
        projectId: ctx.project.id,
        level: 'error',
      });

      const group = await db
        .insertInto('error_groups')
        .values({
          organization_id: ctx.organization.id,
          project_id: ctx.project.id,
          fingerprint: 'project-trend-fp',
          exception_type: 'Error',
          exception_message: 'Test',
          language: 'nodejs',
          occurrence_count: 1,
          first_seen: new Date(),
          last_seen: new Date(),
          status: 'open',
          sample_log_id: null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      await service.createException({
        organizationId: ctx.organization.id,
        projectId: ctx.project.id,
        logId: log.id,
        fingerprint: 'project-trend-fp',
        parsedData: {
          exceptionType: 'Error',
          exceptionMessage: 'Test',
          language: 'nodejs',
          rawStackTrace: '',
          frames: [],
        },
      });

      const trend = await service.getErrorGroupTrend(group.id);
      expect(Array.isArray(trend)).toBe(true);
    });

    it('should use default parameters when not provided', async () => {
      const ctx = await createTestContext();
      const log = await createTestLog({
        projectId: ctx.project.id,
        level: 'error',
      });

      const group = await db
        .insertInto('error_groups')
        .values({
          organization_id: ctx.organization.id,
          project_id: ctx.project.id,
          fingerprint: 'defaults-trend-fp',
          exception_type: 'Error',
          exception_message: 'Test',
          language: 'nodejs',
          occurrence_count: 1,
          first_seen: new Date(),
          last_seen: new Date(),
          status: 'open',
          sample_log_id: null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      await service.createException({
        organizationId: ctx.organization.id,
        projectId: ctx.project.id,
        logId: log.id,
        fingerprint: 'defaults-trend-fp',
        parsedData: {
          exceptionType: 'Error',
          exceptionMessage: 'Test',
          language: 'nodejs',
          rawStackTrace: '',
          frames: [],
        },
      });

      // Call with no interval/days args - uses defaults (1d, 7)
      const trend = await service.getErrorGroupTrend(group.id);
      expect(Array.isArray(trend)).toBe(true);
      expect(trend.length).toBeGreaterThanOrEqual(1);
      expect(trend[0]).toHaveProperty('timestamp');
      expect(trend[0]).toHaveProperty('count');
    });
  });
});
