import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../../database/index.js';
import { createTestContext, createTestAlertRule } from '../../helpers/factories.js';
import { alertsService } from '../../../modules/alerts/service.js';

describe('Alert History', () => {
    beforeEach(async () => {
        await db.deleteFrom('alert_history').execute();
        await db.deleteFrom('alert_rules').execute();
    });

    it('should retrieve alert history for an organization', async () => {
        const { organization, project } = await createTestContext();

        // Create rule
        const rule = await createTestAlertRule({
            organizationId: organization.id,
            projectId: project.id,
            name: 'Test Rule',
        });

        // Create history entry manually
        await db
            .insertInto('alert_history')
            .values({
                rule_id: rule.id,
                triggered_at: new Date(),
                log_count: 10,
                notified: true,
            })
            .returningAll()
            .execute();

        const history = await alertsService.getAlertHistory(organization.id);

        expect(history.total).toBe(1);
        expect(history.history).toHaveLength(1);
        expect(history.history[0].ruleName).toBe('Test Rule');
        expect(history.history[0].logCount).toBe(10);
    });

    it('should filter history by project', async () => {
        const { organization, project } = await createTestContext();

        // Rule for Project 1
        const rule1 = await createTestAlertRule({
            organizationId: organization.id,
            projectId: project.id,
            name: 'Project 1 Rule',
        });

        // Rule for Project 2 (same org)
        const project2 = await db
            .insertInto('projects')
            .values({
                organization_id: organization.id,
                name: 'Project 2',
                user_id: organization.owner_id, // Required field
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        const rule2 = await createTestAlertRule({
            organizationId: organization.id,
            projectId: project2.id,
            name: 'Project 2 Rule',
        });

        // Insert history for both
        await db
            .insertInto('alert_history')
            .values([
                {
                    rule_id: rule1.id,
                    triggered_at: new Date(),
                    log_count: 5,
                },
                {
                    rule_id: rule2.id,
                    triggered_at: new Date(),
                    log_count: 8,
                },
            ])
            .returningAll()
            .execute();

        // Filter for Project 1
        const history1 = await alertsService.getAlertHistory(organization.id, {
            projectId: project.id,
        });
        expect(history1.total).toBe(1);
        expect(history1.history[0].ruleName).toBe('Project 1 Rule');

        // Filter for Project 2
        const history2 = await alertsService.getAlertHistory(organization.id, {
            projectId: project2.id,
        });
        expect(history2.total).toBe(1);
        expect(history2.history[0].ruleName).toBe('Project 2 Rule');
    });

    it('should paginate results', async () => {
        const { organization, project } = await createTestContext();

        const rule = await createTestAlertRule({
            organizationId: organization.id,
            projectId: project.id,
            name: 'Pagination Rule',
        });

        // Insert 15 entries
        const entries = Array.from({ length: 15 }).map((_, i) => ({
            rule_id: rule.id,
            triggered_at: new Date(Date.now() - i * 1000), // Different times
            log_count: i,
        }));

        await db.insertInto('alert_history').values(entries).returningAll().execute();

        // Page 1 (limit 10)
        const page1 = await alertsService.getAlertHistory(organization.id, {
            limit: 10,
            offset: 0,
        });
        expect(page1.history).toHaveLength(10);
        expect(page1.total).toBe(15);

        // Page 2 (limit 10, offset 10)
        const page2 = await alertsService.getAlertHistory(organization.id, {
            limit: 10,
            offset: 10,
        });
        expect(page2.history).toHaveLength(5);
        expect(page2.total).toBe(15);
    });
});
