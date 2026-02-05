import { db } from '../../database/connection.js';
import { sql } from 'kysely';
import { getInternalLogger } from '../../utils/internal-logger.js';

// ============================================================================
// Types
// ============================================================================

interface CompressedChunkInfo {
  chunk_schema: string;
  chunk_name: string;
  range_start: Date;
  range_end: Date;
}

export interface RetentionExecutionResult {
  organizationId: string;
  organizationName: string;
  retentionDays: number;
  logsDeleted: number;
  chunksDecompressed: number;
  executionTimeMs: number;
  error?: string;
}

export interface RetentionExecutionSummary {
  totalOrganizations: number;
  successfulOrganizations: number;
  failedOrganizations: number;
  totalLogsDeleted: number;
  totalChunksDecompressed: number;
  totalExecutionTimeMs: number;
  results: RetentionExecutionResult[];
}

export interface OrganizationRetentionStatus {
  organizationId: string;
  organizationName: string;
  retentionDays: number;
  oldestLogTime: Date | null;
  totalLogs: number;
  logsToDelete: number;
  estimatedDeletionDate: Date | null;
}

// ============================================================================
// Retention Service
// ============================================================================

export class RetentionService {
  /**
   * Find compressed chunks that contain data older than cutoffDate for given projects
   */
  private async findCompressedChunksToDecompress(
    projectIds: string[],
    cutoffDate: Date
  ): Promise<CompressedChunkInfo[]> {
    // Find compressed chunks where range_start < cutoffDate
    // (these chunks might contain data that needs to be deleted)
    const result = await sql<CompressedChunkInfo>`
      SELECT DISTINCT
        c.chunk_schema,
        c.chunk_name,
        c.range_start,
        c.range_end
      FROM timescaledb_information.chunks c
      WHERE c.hypertable_name = 'logs'
        AND c.is_compressed = true
        AND c.range_start < ${cutoffDate}
      ORDER BY c.range_start ASC
    `.execute(db);

    // Filter to only chunks that actually contain data for these projects
    const chunksWithData: CompressedChunkInfo[] = [];

    for (const chunk of result.rows) {
      const hasData = await sql<{ exists: boolean }>`
        SELECT EXISTS (
          SELECT 1 FROM logs
          WHERE project_id = ANY(${sql.raw(`ARRAY[${projectIds.map(id => `'${id}'::uuid`).join(',')}]`)})
            AND time >= ${chunk.range_start}
            AND time < ${chunk.range_end}
            AND time < ${cutoffDate}
          LIMIT 1
        ) as exists
      `.execute(db);

      if (hasData.rows[0]?.exists) {
        chunksWithData.push(chunk);
      }
    }

    return chunksWithData;
  }

  /**
   * Decompress a specific chunk
   */
  private async decompressChunk(chunk: CompressedChunkInfo): Promise<void> {
    const chunkFullName = `${chunk.chunk_schema}.${chunk.chunk_name}`;
    await sql`SELECT decompress_chunk(${chunkFullName}::regclass)`.execute(db);
  }

  /**
   * Validate retention days value
   */
  validateRetentionDays(days: number): { valid: boolean; error?: string } {
    if (!Number.isInteger(days)) {
      return { valid: false, error: 'Retention days must be an integer' };
    }
    if (days < 1) {
      return { valid: false, error: 'Retention days must be at least 1' };
    }
    if (days > 365) {
      return { valid: false, error: 'Retention days cannot exceed 365' };
    }
    return { valid: true };
  }

  /**
   * Update retention days for an organization (admin only)
   */
  async updateOrganizationRetention(
    organizationId: string,
    retentionDays: number
  ): Promise<{ success: boolean; retentionDays: number }> {
    const validation = this.validateRetentionDays(retentionDays);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const logger = getInternalLogger();

    // Get current value for audit logging
    const currentOrg = await db
      .selectFrom('organizations')
      .select(['name', 'retention_days'])
      .where('id', '=', organizationId)
      .executeTakeFirst();

    if (!currentOrg) {
      throw new Error('Organization not found');
    }

    const oldValue = currentOrg.retention_days;

    // Update retention days
    await db
      .updateTable('organizations')
      .set({
        retention_days: retentionDays,
        updated_at: new Date(),
      })
      .where('id', '=', organizationId)
      .execute();

    // Audit log
    if (logger && oldValue !== retentionDays) {
      logger.info('retention-policy-changed', `Retention policy changed for ${currentOrg.name}`, {
        organizationId,
        organizationName: currentOrg.name,
        oldRetentionDays: oldValue,
        newRetentionDays: retentionDays,
      });
    }

    return { success: true, retentionDays };
  }

  /**
   * Get retention status for an organization
   */
  async getOrganizationRetentionStatus(organizationId: string): Promise<OrganizationRetentionStatus> {
    // Get organization info
    const org = await db
      .selectFrom('organizations')
      .select(['id', 'name', 'retention_days'])
      .where('id', '=', organizationId)
      .executeTakeFirst();

    if (!org) {
      throw new Error('Organization not found');
    }

    // Get project IDs for this organization
    const projects = await db
      .selectFrom('projects')
      .select('id')
      .where('organization_id', '=', organizationId)
      .execute();

    const projectIds = projects.map((p) => p.id);

    if (projectIds.length === 0) {
      return {
        organizationId: org.id,
        organizationName: org.name,
        retentionDays: org.retention_days,
        oldestLogTime: null,
        totalLogs: 0,
        logsToDelete: 0,
        estimatedDeletionDate: null,
      };
    }

    // Get oldest log time
    const oldestLog = await db
      .selectFrom('logs')
      .select('time')
      .where('project_id', 'in', projectIds)
      .orderBy('time', 'asc')
      .limit(1)
      .executeTakeFirst();

    // Get total logs count
    const totalLogsResult = await db
      .selectFrom('logs')
      .select(sql<number>`COUNT(*)::int`.as('count'))
      .where('project_id', 'in', projectIds)
      .executeTakeFirst();

    // Get count of logs that would be deleted
    const cutoffDate = new Date(Date.now() - org.retention_days * 24 * 60 * 60 * 1000);
    const toDeleteResult = await db
      .selectFrom('logs')
      .select(sql<number>`COUNT(*)::int`.as('count'))
      .where('project_id', 'in', projectIds)
      .where('time', '<', cutoffDate)
      .executeTakeFirst();

    // Calculate when logs will start being deleted (oldest log time + retention days)
    let estimatedDeletionDate: Date | null = null;
    if (oldestLog?.time) {
      const oldestTime = new Date(oldestLog.time);
      estimatedDeletionDate = new Date(oldestTime.getTime() + org.retention_days * 24 * 60 * 60 * 1000);
      // If the deletion date is in the past, logs would be deleted on next cleanup
      if (estimatedDeletionDate < new Date()) {
        estimatedDeletionDate = new Date(); // Next cleanup
      }
    }

    return {
      organizationId: org.id,
      organizationName: org.name,
      retentionDays: org.retention_days,
      oldestLogTime: oldestLog?.time ? new Date(oldestLog.time) : null,
      totalLogs: totalLogsResult?.count || 0,
      logsToDelete: toDeleteResult?.count || 0,
      estimatedDeletionDate,
    };
  }

  /**
   * Execute retention cleanup for a single organization
   * Handles TimescaleDB compressed chunks by decompressing them first
   */
  async executeRetentionForOrganization(
    organizationId: string,
    retentionDays: number,
    organizationName: string
  ): Promise<RetentionExecutionResult> {
    const startTime = Date.now();
    const logger = getInternalLogger();

    try {
      // Get project IDs for this organization
      const projects = await db
        .selectFrom('projects')
        .select('id')
        .where('organization_id', '=', organizationId)
        .execute();

      const projectIds = projects.map((p) => p.id);

      if (projectIds.length === 0) {
        return {
          organizationId,
          organizationName,
          retentionDays,
          logsDeleted: 0,
          chunksDecompressed: 0,
          executionTimeMs: Date.now() - startTime,
        };
      }

      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      let totalDeleted = 0;
      let chunksDecompressed = 0;

      // Find and decompress chunks that contain data to delete
      const compressedChunks = await this.findCompressedChunksToDecompress(projectIds, cutoffDate);

      if (compressedChunks.length > 0) {
        if (logger) {
          logger.info('retention-decompressing', `Decompressing ${compressedChunks.length} chunks for ${organizationName}`, {
            organizationId,
            organizationName,
            chunksToDecompress: compressedChunks.length,
            chunks: compressedChunks.map(c => c.chunk_name),
          });
        }

        // Decompress each chunk
        for (const chunk of compressedChunks) {
          try {
            await this.decompressChunk(chunk);
            chunksDecompressed++;

            if (logger) {
              logger.debug('retention-chunk-decompressed', `Decompressed chunk ${chunk.chunk_name}`, {
                organizationId,
                chunkName: chunk.chunk_name,
                rangeStart: chunk.range_start,
                rangeEnd: chunk.range_end,
              });
            }
          } catch (decompressError) {
            // Log but continue - chunk might already be decompressed by another process
            const errMsg = decompressError instanceof Error ? decompressError.message : String(decompressError);
            if (logger) {
              logger.warn('retention-decompress-failed', `Failed to decompress chunk ${chunk.chunk_name}: ${errMsg}`, {
                organizationId,
                chunkName: chunk.chunk_name,
                error: errMsg,
              });
            }
          }
        }
      }

      // Now delete the logs (chunks are decompressed)
      const result = await db
        .deleteFrom('logs')
        .where('project_id', 'in', projectIds)
        .where('time', '<', cutoffDate)
        .executeTakeFirst();

      totalDeleted = Number(result.numDeletedRows || 0);

      const executionTimeMs = Date.now() - startTime;

      // Log results
      if ((totalDeleted > 0 || chunksDecompressed > 0) && logger) {
        logger.info('retention-cleanup-org', `Deleted ${totalDeleted} logs for ${organizationName}`, {
          organizationId,
          organizationName,
          retentionDays,
          logsDeleted: totalDeleted,
          chunksDecompressed,
          executionTimeMs,
        });
      }

      return {
        organizationId,
        organizationName,
        retentionDays,
        logsDeleted: totalDeleted,
        chunksDecompressed,
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (logger) {
        logger.error('retention-cleanup-org-error', `Failed to cleanup logs for ${organizationName}: ${errorMessage}`, {
          organizationId,
          organizationName,
          retentionDays,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }

      return {
        organizationId,
        organizationName,
        retentionDays,
        logsDeleted: 0,
        chunksDecompressed: 0,
        executionTimeMs,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute retention cleanup for all organizations
   */
  async executeRetentionForAllOrganizations(): Promise<RetentionExecutionSummary> {
    const startTime = Date.now();
    const logger = getInternalLogger();

    // Get all organizations with their retention settings
    const organizations = await db
      .selectFrom('organizations')
      .select(['id', 'name', 'retention_days'])
      .execute();

    const results: RetentionExecutionResult[] = [];
    let successCount = 0;
    let failedCount = 0;
    let totalDeleted = 0;
    let totalChunksDecompressed = 0;

    for (const org of organizations) {
      const result = await this.executeRetentionForOrganization(
        org.id,
        org.retention_days,
        org.name
      );

      results.push(result);

      if (result.error) {
        failedCount++;
      } else {
        successCount++;
        totalDeleted += result.logsDeleted;
        totalChunksDecompressed += result.chunksDecompressed;
      }
    }

    const totalExecutionTimeMs = Date.now() - startTime;

    // Log summary
    if (logger) {
      logger.info('retention-cleanup-complete', 'Retention cleanup completed', {
        totalOrganizations: organizations.length,
        successfulOrganizations: successCount,
        failedOrganizations: failedCount,
        totalLogsDeleted: totalDeleted,
        totalChunksDecompressed,
        totalExecutionTimeMs,
      });
    }

    return {
      totalOrganizations: organizations.length,
      successfulOrganizations: successCount,
      failedOrganizations: failedCount,
      totalLogsDeleted: totalDeleted,
      totalChunksDecompressed,
      totalExecutionTimeMs,
      results,
    };
  }
}

export const retentionService = new RetentionService();
