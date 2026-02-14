import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../../database/index.js';
import { queryService } from '../../../modules/query/service.js';
import { createTestContext, createTestLog } from '../../helpers/factories.js';

describe('QueryService - Additional Coverage', () => {
  beforeEach(async () => {
    await db.deleteFrom('log_identifiers').execute();
    await db.deleteFrom('logs').execute();
    await db.deleteFrom('alert_history').execute();
    await db.deleteFrom('sigma_rules').execute();
    await db.deleteFrom('alert_rules').execute();
    await db.deleteFrom('api_keys').execute();
    await db.deleteFrom('notifications').execute();
    await db.deleteFrom('organization_members').execute();
    await db.deleteFrom('projects').execute();
    await db.deleteFrom('organizations').execute();
    await db.deleteFrom('sessions').execute();
    await db.deleteFrom('users').execute();
  });

  describe('getDistinctHostnames', () => {
    it('should return empty array when no logs with hostname', async () => {
      const { project } = await createTestContext();
      const hostnames = await queryService.getDistinctHostnames(project.id);
      expect(hostnames).toEqual([]);
    });

    it('should return hostnames from metadata', async () => {
      const { project } = await createTestContext();

      await db
        .insertInto('logs')
        .values({
          project_id: project.id,
          service: 'test',
          level: 'info',
          message: 'test',
          time: new Date(),
          metadata: { hostname: 'server-1' },
        })
        .execute();

      await db
        .insertInto('logs')
        .values({
          project_id: project.id,
          service: 'test',
          level: 'info',
          message: 'test',
          time: new Date(),
          metadata: { hostname: 'server-2' },
        })
        .execute();

      const hostnames = await queryService.getDistinctHostnames(project.id);
      expect(hostnames).toContain('server-1');
      expect(hostnames).toContain('server-2');
    });

    it('should accept array of project IDs', async () => {
      const { project } = await createTestContext();
      const hostnames = await queryService.getDistinctHostnames([project.id]);
      expect(Array.isArray(hostnames)).toBe(true);
    });

    it('should accept custom time range', async () => {
      const { project } = await createTestContext();
      const from = new Date(Date.now() - 60 * 60 * 1000);
      const to = new Date();
      const hostnames = await queryService.getDistinctHostnames(project.id, from, to);
      expect(Array.isArray(hostnames)).toBe(true);
    });
  });

  describe('getTopErrors', () => {
    it('should return empty array when no errors', async () => {
      const { project } = await createTestContext();
      const errors = await queryService.getTopErrors(project.id);
      expect(errors).toEqual([]);
    });

    it('should return top error messages', async () => {
      const { project } = await createTestContext();

      for (let i = 0; i < 5; i++) {
        await createTestLog({
          projectId: project.id,
          level: 'error',
          message: 'Connection refused',
        });
      }
      for (let i = 0; i < 3; i++) {
        await createTestLog({
          projectId: project.id,
          level: 'error',
          message: 'Timeout error',
        });
      }

      const errors = await queryService.getTopErrors(project.id, 10);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors[0]).toHaveProperty('message');
      expect(errors[0]).toHaveProperty('count');
    });

    it('should respect limit parameter', async () => {
      const { project } = await createTestContext();

      for (let i = 0; i < 5; i++) {
        await createTestLog({
          projectId: project.id,
          level: 'error',
          message: `Error type ${i}`,
        });
      }

      const errors = await queryService.getTopErrors(project.id, 2);
      expect(errors.length).toBeLessThanOrEqual(2);
    });

    it('should only include error and critical levels', async () => {
      const { project } = await createTestContext();

      await createTestLog({ projectId: project.id, level: 'info', message: 'Not an error' });
      await createTestLog({ projectId: project.id, level: 'error', message: 'Real error' });
      await createTestLog({ projectId: project.id, level: 'critical', message: 'Critical issue' });

      const errors = await queryService.getTopErrors(project.id);
      // info messages should not appear
      expect(errors.every((e: { message: string }) => e.message !== 'Not an error')).toBe(true);
    });

    it('should accept custom time range', async () => {
      const { project } = await createTestContext();
      const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const to = new Date();
      const errors = await queryService.getTopErrors(project.id, 10, from, to);
      expect(Array.isArray(errors)).toBe(true);
    });
  });

  describe('getDistinctServices', () => {
    it('should return distinct services', async () => {
      const { project } = await createTestContext();

      await createTestLog({ projectId: project.id, service: 'api' });
      await createTestLog({ projectId: project.id, service: 'worker' });
      await createTestLog({ projectId: project.id, service: 'api' }); // duplicate

      const services = await queryService.getDistinctServices(project.id);
      expect(services).toContain('api');
      expect(services).toContain('worker');
    });

    it('should accept array of project IDs', async () => {
      const { project } = await createTestContext();
      await createTestLog({ projectId: project.id, service: 'test-svc' });

      const services = await queryService.getDistinctServices([project.id]);
      expect(Array.isArray(services)).toBe(true);
    });

    it('should accept custom time range', async () => {
      const { project } = await createTestContext();
      const from = new Date(Date.now() - 60 * 60 * 1000);
      const to = new Date();
      const services = await queryService.getDistinctServices(project.id, from, to);
      expect(Array.isArray(services)).toBe(true);
    });
  });

  describe('getLogContext', () => {
    it('should return before, current, and after logs', async () => {
      const { project } = await createTestContext();

      const now = new Date();
      const before1 = new Date(now.getTime() - 2000);
      const before2 = new Date(now.getTime() - 1000);
      const after1 = new Date(now.getTime() + 1000);
      const after2 = new Date(now.getTime() + 2000);

      await db
        .insertInto('logs')
        .values([
          { project_id: project.id, service: 'test', level: 'info', message: 'before1', time: before1 },
          { project_id: project.id, service: 'test', level: 'info', message: 'before2', time: before2 },
          { project_id: project.id, service: 'test', level: 'info', message: 'current', time: now },
          { project_id: project.id, service: 'test', level: 'info', message: 'after1', time: after1 },
          { project_id: project.id, service: 'test', level: 'info', message: 'after2', time: after2 },
        ])
        .execute();

      const context = await queryService.getLogContext({
        projectId: project.id,
        time: now,
        before: 5,
        after: 5,
      });

      expect(context).toHaveProperty('before');
      expect(context).toHaveProperty('current');
      expect(context).toHaveProperty('after');
      expect(Array.isArray(context.before)).toBe(true);
      expect(Array.isArray(context.after)).toBe(true);
    });

    it('should use default before/after counts', async () => {
      const { project } = await createTestContext();

      const context = await queryService.getLogContext({
        projectId: project.id,
        time: new Date(),
      });

      expect(context).toHaveProperty('before');
      expect(context).toHaveProperty('current');
      expect(context).toHaveProperty('after');
    });
  });

  describe('getAggregatedStats', () => {
    it('should return timeseries with buckets', async () => {
      const { project } = await createTestContext();

      await createTestLog({ projectId: project.id, level: 'info' });
      await createTestLog({ projectId: project.id, level: 'error' });

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const result = await queryService.getAggregatedStats({
        projectId: project.id,
        from: oneHourAgo,
        to: new Date(now.getTime() + 60 * 1000),
        interval: '1h',
      });

      expect(result).toHaveProperty('timeseries');
      expect(Array.isArray(result.timeseries)).toBe(true);
    });

    it('should support different intervals', async () => {
      const { project } = await createTestContext();
      const now = new Date();
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      for (const interval of ['1m', '5m', '1h', '1d'] as const) {
        const result = await queryService.getAggregatedStats({
          projectId: project.id,
          from: dayAgo,
          to: now,
          interval,
        });
        expect(result).toHaveProperty('timeseries');
      }
    });

    it('should filter by service', async () => {
      const { project } = await createTestContext();
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const result = await queryService.getAggregatedStats({
        projectId: project.id,
        service: 'specific-service',
        from: oneHourAgo,
        to: now,
        interval: '1h',
      });

      expect(result).toHaveProperty('timeseries');
    });
  });
});
