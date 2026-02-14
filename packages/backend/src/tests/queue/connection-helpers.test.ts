import { describe, it, expect } from 'vitest';
import {
  isRedisAvailable,
  getConnection,
  getPublisher,
  getQueueBackend,
  getQueueSystemStatus,
  createQueue,
  createWorker,
} from '../../queue/connection.js';

describe('Queue Connection Helpers', () => {
  describe('isRedisAvailable', () => {
    it('should return a boolean', () => {
      const result = isRedisAvailable();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getConnection', () => {
    it('should return Redis instance or null based on availability', () => {
      const conn = getConnection();
      if (isRedisAvailable()) {
        expect(conn).not.toBeNull();
      } else {
        expect(conn).toBeNull();
      }
    });

    it('should return same instance on repeated calls', () => {
      const conn1 = getConnection();
      const conn2 = getConnection();
      expect(conn1).toBe(conn2);
    });
  });

  describe('getPublisher', () => {
    it('should return Redis instance or null based on availability', () => {
      const pub = getPublisher();
      if (isRedisAvailable()) {
        expect(pub).not.toBeNull();
      } else {
        expect(pub).toBeNull();
      }
    });

    it('should return same instance on repeated calls', () => {
      const pub1 = getPublisher();
      const pub2 = getPublisher();
      expect(pub1).toBe(pub2);
    });
  });

  describe('getQueueBackend', () => {
    it('should return bullmq or graphile', () => {
      const backend = getQueueBackend();
      expect(['bullmq', 'graphile']).toContain(backend);
    });
  });

  describe('getQueueSystemStatus', () => {
    it('should return status object with backend field', () => {
      const status = getQueueSystemStatus();
      expect(status).toBeDefined();
      expect(status).toHaveProperty('backend');
      expect(['bullmq', 'graphile']).toContain(status.backend);
    });

    it('should return status object with connected field', () => {
      const status = getQueueSystemStatus();
      expect(status).toHaveProperty('connected');
      expect(typeof status.connected).toBe('boolean');
    });

    it('should return status object with workerCount field', () => {
      const status = getQueueSystemStatus();
      expect(status).toHaveProperty('workerCount');
      expect(typeof status.workerCount).toBe('number');
    });
  });

  describe('createQueue', () => {
    it('should return a queue adapter', () => {
      const queue = createQueue('test-queue-helpers');
      expect(queue).toBeDefined();
    });
  });

  describe('createWorker', () => {
    it('should return a worker adapter', () => {
      const worker = createWorker('test-worker-helpers', async () => {});
      expect(worker).toBeDefined();
    });
  });
});
