import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db } from '../../../database/index.js';
import { sql } from 'kysely';
import { createTestContext, createTestLog } from '../../helpers/factories.js';

/**
 * Tests for RetentionService with mocked TimescaleDB functions.
 * These tests cover the compressed chunk handling code paths that
 * cannot be tested without a real TimescaleDB with compression enabled.
 */

// We need to test the class directly with mocked internals
// Import the class, not the singleton
import { RetentionService } from '../../../modules/retention/service.js';

describe('RetentionService - Mocked TimescaleDB', () => {
    let service: RetentionService;

    beforeEach(() => {
        service = new RetentionService();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('executeRetentionForOrganization - with compressed chunks', () => {
        it('should decompress chunks and delete old logs', async () => {
            const ctx = await createTestContext();

            // Set retention to 1 day
            await db
                .updateTable('organizations')
                .set({ retention_days: 1 })
                .where('id', '=', ctx.organization.id)
                .execute();

            // Create old logs
            const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
            await createTestLog({ projectId: ctx.project.id, time: threeDaysAgo });

            // Mock findCompressedChunksToDecompress to return fake chunks
            const mockChunks = [
                {
                    chunk_schema: '_timescaledb_internal',
                    chunk_name: '_hyper_1_1_chunk',
                    range_start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    range_end: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
                },
            ];

            // Spy on private method using prototype
            const findChunksSpy = vi.spyOn(service as any, 'findCompressedChunksToDecompress')
                .mockResolvedValue(mockChunks);

            // Mock decompressChunk to succeed
            const decompressSpy = vi.spyOn(service as any, 'decompressChunk')
                .mockResolvedValue(undefined);

            const result = await service.executeRetentionForOrganization(
                ctx.organization.id,
                1,
                ctx.organization.name
            );

            expect(findChunksSpy).toHaveBeenCalled();
            expect(decompressSpy).toHaveBeenCalledWith(mockChunks[0]);
            expect(result.chunksDecompressed).toBe(1);
            expect(result.logsDeleted).toBeGreaterThanOrEqual(1);
            expect(result.error).toBeUndefined();
        });

        it('should handle decompression failure gracefully', async () => {
            const ctx = await createTestContext();

            // Create old logs
            const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
            await createTestLog({ projectId: ctx.project.id, time: threeDaysAgo });

            // Mock chunks
            const mockChunks = [
                {
                    chunk_schema: '_timescaledb_internal',
                    chunk_name: '_hyper_1_1_chunk',
                    range_start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    range_end: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
                },
                {
                    chunk_schema: '_timescaledb_internal',
                    chunk_name: '_hyper_1_2_chunk',
                    range_start: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
                    range_end: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                },
            ];

            vi.spyOn(service as any, 'findCompressedChunksToDecompress')
                .mockResolvedValue(mockChunks);

            // First chunk fails, second succeeds
            const decompressSpy = vi.spyOn(service as any, 'decompressChunk')
                .mockRejectedValueOnce(new Error('Chunk already decompressed'))
                .mockResolvedValueOnce(undefined);

            const result = await service.executeRetentionForOrganization(
                ctx.organization.id,
                1,
                ctx.organization.name
            );

            expect(decompressSpy).toHaveBeenCalledTimes(2);
            // Only second chunk was successfully decompressed
            expect(result.chunksDecompressed).toBe(1);
            expect(result.error).toBeUndefined();
        });

        it('should log decompression progress', async () => {
            const ctx = await createTestContext();

            const mockChunks = [
                {
                    chunk_schema: '_timescaledb_internal',
                    chunk_name: '_hyper_1_1_chunk',
                    range_start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    range_end: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
                },
            ];

            vi.spyOn(service as any, 'findCompressedChunksToDecompress')
                .mockResolvedValue(mockChunks);

            vi.spyOn(service as any, 'decompressChunk')
                .mockResolvedValue(undefined);

            const result = await service.executeRetentionForOrganization(
                ctx.organization.id,
                30,
                ctx.organization.name
            );

            expect(result.chunksDecompressed).toBe(1);
        });

        it('should handle multiple chunks decompression', async () => {
            const ctx = await createTestContext();

            const mockChunks = [
                {
                    chunk_schema: '_timescaledb_internal',
                    chunk_name: '_hyper_1_1_chunk',
                    range_start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    range_end: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
                },
                {
                    chunk_schema: '_timescaledb_internal',
                    chunk_name: '_hyper_1_2_chunk',
                    range_start: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
                    range_end: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                },
                {
                    chunk_schema: '_timescaledb_internal',
                    chunk_name: '_hyper_1_3_chunk',
                    range_start: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
                    range_end: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
                },
            ];

            vi.spyOn(service as any, 'findCompressedChunksToDecompress')
                .mockResolvedValue(mockChunks);

            vi.spyOn(service as any, 'decompressChunk')
                .mockResolvedValue(undefined);

            const result = await service.executeRetentionForOrganization(
                ctx.organization.id,
                1,
                ctx.organization.name
            );

            expect(result.chunksDecompressed).toBe(3);
        });

        it('should handle error during chunk finding', async () => {
            const ctx = await createTestContext();

            vi.spyOn(service as any, 'findCompressedChunksToDecompress')
                .mockRejectedValue(new Error('TimescaleDB not available'));

            const result = await service.executeRetentionForOrganization(
                ctx.organization.id,
                30,
                ctx.organization.name
            );

            expect(result.error).toBe('TimescaleDB not available');
            expect(result.logsDeleted).toBe(0);
            expect(result.chunksDecompressed).toBe(0);
        });

        it('should handle non-Error exceptions during decompression', async () => {
            const ctx = await createTestContext();

            const mockChunks = [
                {
                    chunk_schema: '_timescaledb_internal',
                    chunk_name: '_hyper_1_1_chunk',
                    range_start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    range_end: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
                },
            ];

            vi.spyOn(service as any, 'findCompressedChunksToDecompress')
                .mockResolvedValue(mockChunks);

            // Throw a string instead of Error
            vi.spyOn(service as any, 'decompressChunk')
                .mockRejectedValue('String error message');

            const result = await service.executeRetentionForOrganization(
                ctx.organization.id,
                30,
                ctx.organization.name
            );

            // Should continue without error
            expect(result.error).toBeUndefined();
            expect(result.chunksDecompressed).toBe(0);
        });
    });

    describe('executeRetentionForOrganization - error handling', () => {
        it('should return error result when main execution fails', async () => {
            const ctx = await createTestContext();

            // Mock to throw during project fetching
            vi.spyOn(db, 'selectFrom').mockImplementationOnce(() => {
                throw new Error('Database connection lost');
            });

            const result = await service.executeRetentionForOrganization(
                ctx.organization.id,
                30,
                ctx.organization.name
            );

            expect(result.error).toBe('Database connection lost');
            expect(result.logsDeleted).toBe(0);
        });

        it('should handle non-Error thrown during execution', async () => {
            const ctx = await createTestContext();

            vi.spyOn(db, 'selectFrom').mockImplementationOnce(() => {
                throw 'Raw string error';
            });

            const result = await service.executeRetentionForOrganization(
                ctx.organization.id,
                30,
                ctx.organization.name
            );

            expect(result.error).toBe('Raw string error');
        });
    });

    describe('executeRetentionForAllOrganizations - with chunk decompression', () => {
        it('should aggregate chunks decompressed across organizations', async () => {
            const ctx1 = await createTestContext();
            const ctx2 = await createTestContext();

            // Mock chunks for each org
            const mockChunks = [
                {
                    chunk_schema: '_timescaledb_internal',
                    chunk_name: '_hyper_1_1_chunk',
                    range_start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    range_end: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
                },
            ];

            vi.spyOn(service as any, 'findCompressedChunksToDecompress')
                .mockResolvedValue(mockChunks);

            vi.spyOn(service as any, 'decompressChunk')
                .mockResolvedValue(undefined);

            const summary = await service.executeRetentionForAllOrganizations();

            expect(summary.totalChunksDecompressed).toBeGreaterThanOrEqual(2);
        });
    });
});
