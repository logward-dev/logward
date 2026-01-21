import { sql } from 'kysely';
import { db } from '../../database/connection.js';
import { DETECTION_PACKS, getPackById } from './pack-definitions.js';
import type {
  DetectionPackWithStatus,
  PackActivation,
  ThresholdMap,
} from './types.js';

export class DetectionPacksService {
  /**
   * Get all available packs with their activation status for an organization
   */
  async listPacksWithStatus(organizationId: string): Promise<DetectionPackWithStatus[]> {
    // Get all activations for this org
    const activations = await db
      .selectFrom('detection_pack_activations')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .execute();

    const activationMap = new Map(
      activations.map((a) => [a.pack_id, a])
    );

    // Get count of generated rules per pack
    const alertRules = await db
      .selectFrom('alert_rules')
      .select(['metadata'])
      .where('organization_id', '=', organizationId)
      .execute();

    const ruleCountByPack = new Map<string, number>();
    for (const rule of alertRules) {
      const packId = (rule.metadata as Record<string, unknown> | null)?.packId as string | undefined;
      if (packId) {
        ruleCountByPack.set(packId, (ruleCountByPack.get(packId) || 0) + 1);
      }
    }

    return DETECTION_PACKS.map((pack): DetectionPackWithStatus => {
      const activation = activationMap.get(pack.id);
      return {
        ...pack,
        enabled: activation?.enabled ?? false,
        activatedAt: activation?.activated_at ? new Date(activation.activated_at).toISOString() : null,
        customThresholds: (activation?.custom_thresholds as ThresholdMap | null) ?? null,
        generatedRulesCount: ruleCountByPack.get(pack.id) || 0,
      };
    });
  }

  /**
   * Get a single pack with status
   */
  async getPackWithStatus(
    organizationId: string,
    packId: string
  ): Promise<DetectionPackWithStatus | null> {
    const pack = getPackById(packId);
    if (!pack) return null;

    const activation = await db
      .selectFrom('detection_pack_activations')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('pack_id', '=', packId)
      .executeTakeFirst();

    // Count generated rules
    const result = await db
      .selectFrom('alert_rules')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('organization_id', '=', organizationId)
      .where(sql<boolean>`metadata @> ${JSON.stringify({ packId })}::jsonb`)
      .executeTakeFirst();

    return {
      ...pack,
      enabled: activation?.enabled ?? false,
      activatedAt: activation?.activated_at ? new Date(activation.activated_at).toISOString() : null,
      customThresholds: (activation?.custom_thresholds as ThresholdMap | null) ?? null,
      generatedRulesCount: Number(result?.count || 0),
    };
  }

  /**
   * Enable a pack for an organization
   * Creates alert rules from pack definition with optional custom thresholds
   */
  async enablePack(
    organizationId: string,
    packId: string,
    customThresholds?: ThresholdMap,
    emailRecipients?: string[],
    webhookUrl?: string | null
  ): Promise<void> {
    const pack = getPackById(packId);
    if (!pack) {
      throw new Error(`Pack not found: ${packId}`);
    }

    // Check if already enabled
    const existing = await db
      .selectFrom('detection_pack_activations')
      .select(['id', 'enabled'])
      .where('organization_id', '=', organizationId)
      .where('pack_id', '=', packId)
      .executeTakeFirst();

    if (existing?.enabled) {
      throw new Error(`Pack already enabled: ${packId}`);
    }

    // Default email to empty array if not provided (user can add later)
    const recipients = emailRecipients ?? [];

    // Start transaction
    await db.transaction().execute(async (trx) => {
      // Upsert activation record
      if (existing) {
        await trx
          .updateTable('detection_pack_activations')
          .set({
            enabled: true,
            custom_thresholds: customThresholds ?? null,
            updated_at: new Date(),
          })
          .where('id', '=', existing.id)
          .execute();
      } else {
        await trx
          .insertInto('detection_pack_activations')
          .values({
            organization_id: organizationId,
            pack_id: packId,
            enabled: true,
            custom_thresholds: customThresholds ?? null,
          })
          .execute();
      }

      // Create alert rules for each rule in the pack
      for (const rule of pack.rules) {
        const override = customThresholds?.[rule.id];
        const threshold = override?.threshold ?? rule.threshold;
        const timeWindow = override?.timeWindow ?? rule.timeWindow;

        await trx
          .insertInto('alert_rules')
          .values({
            organization_id: organizationId,
            project_id: null, // Pack rules are org-wide
            name: `[${pack.name}] ${rule.name}`,
            enabled: true,
            service: rule.service,
            level: rule.level,
            threshold,
            time_window: timeWindow,
            email_recipients: recipients,
            webhook_url: webhookUrl ?? null,
            metadata: {
              packId: pack.id,
              packRuleId: rule.id,
              packName: pack.name,
              originalThreshold: rule.threshold,
              originalTimeWindow: rule.timeWindow,
            },
          })
          .execute();
      }
    });
  }

  /**
   * Disable a pack for an organization
   * Deletes all generated alert rules
   */
  async disablePack(organizationId: string, packId: string): Promise<void> {
    const pack = getPackById(packId);
    if (!pack) {
      throw new Error(`Pack not found: ${packId}`);
    }

    // Check if pack is actually enabled
    const existing = await db
      .selectFrom('detection_pack_activations')
      .select(['id', 'enabled'])
      .where('organization_id', '=', organizationId)
      .where('pack_id', '=', packId)
      .executeTakeFirst();

    if (!existing || !existing.enabled) {
      throw new Error(`Pack is not enabled: ${packId}`);
    }

    await db.transaction().execute(async (trx) => {
      // Update activation record
      await trx
        .updateTable('detection_pack_activations')
        .set({
          enabled: false,
          updated_at: new Date(),
        })
        .where('organization_id', '=', organizationId)
        .where('pack_id', '=', packId)
        .execute();

      // Delete all alert rules for this pack
      await trx
        .deleteFrom('alert_rules')
        .where('organization_id', '=', organizationId)
        .where(sql<boolean>`metadata @> ${JSON.stringify({ packId })}::jsonb`)
        .execute();
    });
  }

  /**
   * Update thresholds for an enabled pack
   */
  async updatePackThresholds(
    organizationId: string,
    packId: string,
    customThresholds: ThresholdMap
  ): Promise<void> {
    const pack = getPackById(packId);
    if (!pack) {
      throw new Error(`Pack not found: ${packId}`);
    }

    await db.transaction().execute(async (trx) => {
      // Update activation record with new thresholds
      await trx
        .updateTable('detection_pack_activations')
        .set({
          custom_thresholds: customThresholds,
          updated_at: new Date(),
        })
        .where('organization_id', '=', organizationId)
        .where('pack_id', '=', packId)
        .execute();

      // Update each alert rule with new thresholds
      for (const rule of pack.rules) {
        const override = customThresholds[rule.id];
        if (!override) continue;

        const updates: Record<string, unknown> = { updated_at: new Date() };
        if (override.threshold !== undefined) updates.threshold = override.threshold;
        if (override.timeWindow !== undefined) updates.time_window = override.timeWindow;

        await trx
          .updateTable('alert_rules')
          .set(updates)
          .where('organization_id', '=', organizationId)
          .where(sql<boolean>`metadata @> ${JSON.stringify({ packId, packRuleId: rule.id })}::jsonb`)
          .execute();
      }
    });
  }

  /**
   * Get activation record
   */
  async getActivation(
    organizationId: string,
    packId: string
  ): Promise<PackActivation | null> {
    const row = await db
      .selectFrom('detection_pack_activations')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('pack_id', '=', packId)
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: row.id,
      organizationId: row.organization_id,
      packId: row.pack_id,
      enabled: row.enabled,
      customThresholds: (row.custom_thresholds as ThresholdMap | null) ?? null,
      activatedAt: new Date(row.activated_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

export const detectionPacksService = new DetectionPacksService();
