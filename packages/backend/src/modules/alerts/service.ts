import { db } from '../../database/connection.js';

export interface AlertRule {
  id: string;
  organizationId: string;
  projectId: string | null;
  name: string;
  enabled: boolean;
  service: string | null;
  level: ('debug' | 'info' | 'warn' | 'error' | 'critical')[];
  threshold: number;
  timeWindow: number;
  emailRecipients: string[];
  webhookUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAlertRuleInput {
  organizationId: string;
  projectId?: string | null;
  name: string;
  enabled?: boolean;
  service?: string | null;
  level: ('debug' | 'info' | 'warn' | 'error' | 'critical')[];
  threshold: number;
  timeWindow: number;
  emailRecipients: string[];
  webhookUrl?: string | null;
}

export interface UpdateAlertRuleInput {
  name?: string;
  enabled?: boolean;
  service?: string | null;
  level?: ('debug' | 'info' | 'warn' | 'error' | 'critical')[];
  threshold?: number;
  timeWindow?: number;
  emailRecipients?: string[];
  webhookUrl?: string | null;
}

export class AlertsService {
  /**
   * Create a new alert rule
   */
  async createAlertRule(input: CreateAlertRuleInput): Promise<AlertRule> {
    const alertRule = await db
      .insertInto('alert_rules')
      .values({
        organization_id: input.organizationId,
        project_id: input.projectId || null,
        name: input.name,
        enabled: input.enabled ?? true,
        service: input.service || null,
        level: input.level,
        threshold: input.threshold,
        time_window: input.timeWindow,
        email_recipients: input.emailRecipients,
        webhook_url: input.webhookUrl || null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapAlertRule(alertRule);
  }

  /**
   * Get all alert rules for an organization
   */
  async getAlertRules(
    organizationId: string,
    options?: { projectId?: string | null; enabledOnly?: boolean }
  ): Promise<AlertRule[]> {
    let query = db
      .selectFrom('alert_rules')
      .selectAll()
      .where('organization_id', '=', organizationId);

    if (options?.projectId !== undefined) {
      if (options.projectId === null) {
        // Get only org-level alerts (projectId is null)
        query = query.where('project_id', 'is', null);
      } else {
        // Get alerts for specific project OR org-level alerts
        query = query.where((eb) =>
          eb.or([
            eb('project_id', '=', options.projectId!),
            eb('project_id', 'is', null),
          ])
        );
      }
    }

    if (options?.enabledOnly) {
      query = query.where('enabled', '=', true);
    }

    const rules = await query.orderBy('created_at', 'desc').execute();

    return rules.map(this.mapAlertRule);
  }

  /**
   * Get alert rule by ID
   */
  async getAlertRule(id: string, organizationId: string): Promise<AlertRule | null> {
    const rule = await db
      .selectFrom('alert_rules')
      .selectAll()
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();

    return rule ? this.mapAlertRule(rule) : null;
  }

  /**
   * Update alert rule
   */
  async updateAlertRule(
    id: string,
    organizationId: string,
    input: UpdateAlertRuleInput
  ): Promise<AlertRule | null> {
    const updateData: any = {
      updated_at: new Date(),
    };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.enabled !== undefined) updateData.enabled = input.enabled;
    if (input.service !== undefined) updateData.service = input.service;
    if (input.level !== undefined) updateData.level = input.level;
    if (input.threshold !== undefined) updateData.threshold = input.threshold;
    if (input.timeWindow !== undefined) updateData.time_window = input.timeWindow;
    if (input.emailRecipients !== undefined) updateData.email_recipients = input.emailRecipients;
    if (input.webhookUrl !== undefined) updateData.webhook_url = input.webhookUrl;

    const rule = await db
      .updateTable('alert_rules')
      .set(updateData)
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .returningAll()
      .executeTakeFirst();

    return rule ? this.mapAlertRule(rule) : null;
  }

  /**
   * Delete alert rule
   */
  async deleteAlertRule(id: string, organizationId: string): Promise<boolean> {
    const result = await db
      .deleteFrom('alert_rules')
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();

    return Number(result.numDeletedRows || 0) > 0;
  }

  /**
   * Check alert rules and trigger if threshold is met
   */
  async checkAlertRules() {
    const rules = await db
      .selectFrom('alert_rules')
      .selectAll()
      .where('enabled', '=', true)
      .execute();

    const triggeredAlerts = [];

    for (const rule of rules) {
      const triggered = await this.checkRule(rule);
      if (triggered) {
        triggeredAlerts.push(triggered);
      }
    }

    return triggeredAlerts;
  }

  /**
   * Check a single rule
   */
  private async checkRule(rule: any) {
    // Get the last trigger time for this rule
    const lastTrigger = await db
      .selectFrom('alert_history')
      .select(['triggered_at'])
      .where('rule_id', '=', rule.id)
      .orderBy('triggered_at', 'desc')
      .executeTakeFirst();

    // Determine the time window for counting logs
    const timeWindow = new Date(Date.now() - rule.time_window * 60 * 1000);

    // If there's a last trigger, only count logs AFTER it
    // This prevents re-triggering on the same logs
    const fromTime = lastTrigger
      ? new Date(Math.max(new Date(lastTrigger.triggered_at).getTime(), timeWindow.getTime()))
      : timeWindow;

    // Count NEW logs (after last trigger or within time window)
    let query = db
      .selectFrom('logs')
      .select((eb) => eb.fn.count('time').as('count'))
      .where('time', '>', fromTime) // Use > to exclude the exact trigger time
      .where('level', 'in', rule.level);

    // Service filter: treat "unknown" as wildcard (matches any service filter)
    if (rule.service) {
      query = query.where((eb) =>
        eb.or([
          eb('service', '=', rule.service),
          eb('service', '=', 'unknown'),
        ])
      );
    }

    // Filter logs by project_id if rule is project-scoped
    if (rule.project_id) {
      query = query.where('project_id', '=', rule.project_id);
    } else {
      // Security: For organization-wide rules, filter by organization's projects
      // Get all project IDs for this organization
      const orgProjects = await db
        .selectFrom('projects')
        .select(['id'])
        .where('organization_id', '=', rule.organization_id)
        .execute();

      const projectIds = orgProjects.map((p) => p.id);

      if (projectIds.length > 0) {
        query = query.where('project_id', 'in', projectIds);
      } else {
        // No projects in organization, skip
        return null;
      }
    }

    const result = await query.executeTakeFirst();
    const count = Number(result?.count || 0);

    if (count >= rule.threshold) {
      // Record alert trigger
      const historyRecord = await db
        .insertInto('alert_history')
        .values({
          rule_id: rule.id,
          triggered_at: new Date(),
          log_count: count,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      return {
        historyId: historyRecord.id,
        rule_id: rule.id,
        rule_name: rule.name,
        organization_id: rule.organization_id,
        project_id: rule.project_id,
        log_count: count,
        threshold: rule.threshold,
        time_window: rule.time_window,
        email_recipients: rule.email_recipients,
        webhook_url: rule.webhook_url,
      };
    }

    return null;
  }

  /**
   * Get alert history for an organization
   */
  async getAlertHistory(
    organizationId: string,
    options?: { projectId?: string; limit?: number; offset?: number }
  ) {
    let query = db
      .selectFrom('alert_history')
      .innerJoin('alert_rules', 'alert_rules.id', 'alert_history.rule_id')
      .leftJoin('projects', 'projects.id', 'alert_rules.project_id')
      .select([
        'alert_history.id',
        'alert_history.rule_id',
        'alert_rules.name as rule_name',
        'alert_rules.project_id',
        'projects.name as project_name',
        'alert_history.triggered_at',
        'alert_history.log_count',
        'alert_history.notified',
        'alert_history.error',
        // Alert rule details
        'alert_rules.threshold',
        'alert_rules.time_window',
        'alert_rules.service',
        'alert_rules.level',
      ])
      .where('alert_rules.organization_id', '=', organizationId);

    if (options?.projectId) {
      query = query.where((eb) =>
        eb.or([
          eb('alert_rules.project_id', '=', options.projectId!),
          eb('alert_rules.project_id', 'is', null),
        ])
      );
    }

    const results = await query
      .orderBy('alert_history.triggered_at', 'desc')
      .limit(options?.limit ?? 100)
      .offset(options?.offset ?? 0)
      .execute();

    let totalQuery = db
      .selectFrom('alert_history')
      .innerJoin('alert_rules', 'alert_rules.id', 'alert_history.rule_id')
      .select((eb) => eb.fn.count('alert_history.id').as('count'))
      .where('alert_rules.organization_id', '=', organizationId);

    if (options?.projectId) {
      totalQuery = totalQuery.where((eb) =>
        eb.or([
          eb('alert_rules.project_id', '=', options.projectId!),
          eb('alert_rules.project_id', 'is', null),
        ])
      );
    }

    const total = await totalQuery.executeTakeFirst();

    return {
      history: results.map((row) => ({
        id: row.id,
        ruleId: row.rule_id,
        ruleName: row.rule_name,
        projectId: row.project_id,
        projectName: row.project_name,
        triggeredAt: row.triggered_at,
        logCount: row.log_count,
        notified: row.notified,
        error: row.error,
        threshold: row.threshold,
        timeWindow: row.time_window,
        service: row.service,
        level: row.level,
      })),
      total: Number(total?.count || 0),
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
    };
  }

  /**
   * Mark alert as notified
   */
  async markAsNotified(historyId: string, error?: string) {
    await db
      .updateTable('alert_history')
      .set({
        notified: error ? false : true,
        error: error || null,
      })
      .where('id', '=', historyId)
      .execute();
  }

  private mapAlertRule(row: any): AlertRule {
    return {
      id: row.id,
      organizationId: row.organization_id,
      projectId: row.project_id,
      name: row.name,
      enabled: row.enabled,
      service: row.service,
      level: row.level,
      threshold: row.threshold,
      timeWindow: row.time_window,
      emailRecipients: row.email_recipients,
      webhookUrl: row.webhook_url,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

export const alertsService = new AlertsService();
