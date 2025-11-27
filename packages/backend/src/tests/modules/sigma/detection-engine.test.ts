import { describe, it, expect, beforeEach } from 'vitest';
import { SigmaDetectionEngine } from '../../../modules/sigma/detection-engine.js';
import { createTestSigmaRule, createTestContext } from '../../helpers/factories.js';
import { db } from '../../../database/index.js';

describe('Sigma Detection Engine', () => {
    beforeEach(async () => {
        // Clean up rules before each test
        await db.deleteFrom('sigma_rules').execute();
    });

    describe('evaluateLog', () => {
        it('should match a simple rule', async () => {
            const { organization, project } = await createTestContext();

            // Create a rule
            await createTestSigmaRule({
                organizationId: organization.id,
                projectId: project.id,
                title: 'Test Rule',
                level: 'high',
                logsource: {}, // Match any logsource
            });

            // Create a matching log
            const log = {
                service: 'test-service',
                message: 'This is a test message',
                level: 'info',
                time: new Date(),
            };

            const result = await SigmaDetectionEngine.evaluateLog(
                log,
                organization.id,
                project.id
            );

            expect(result.matched).toBe(true);
            expect(result.matchedRules).toHaveLength(1);
            expect(result.matchedRules[0].ruleTitle).toBe('Test Rule');
            expect(result.matchedRules[0].ruleLevel).toBe('high');
        });

        it('should not match when condition is not met', async () => {
            const { organization, project } = await createTestContext();

            await createTestSigmaRule({
                organizationId: organization.id,
                projectId: project.id,
                title: 'Test Rule',
                logsource: {}, // Match any logsource
            });

            const log = {
                service: 'test-service',
                message: 'No match here', // Does not contain "test"
                level: 'info',
                time: new Date(),
            };

            const result = await SigmaDetectionEngine.evaluateLog(
                log,
                organization.id,
                project.id
            );

            expect(result.matched).toBe(false);
            expect(result.matchedRules).toHaveLength(0);
        });

        it('should filter by logsource (service)', async () => {
            const { organization, project } = await createTestContext();

            // Create rule with specific service requirement
            const rule = await createTestSigmaRule({
                organizationId: organization.id,
                projectId: project.id,
                title: 'Service Specific Rule',
                logsource: { service: 'sshd' },
            });

            // Log with wrong service
            const log1 = {
                service: 'httpd',
                message: 'test message',
                level: 'info',
            };

            const result1 = await SigmaDetectionEngine.evaluateLog(
                log1,
                organization.id,
                project.id
            );
            expect(result1.matched).toBe(false);

            // Log with correct service
            const log2 = {
                service: 'sshd',
                message: 'test message',
                level: 'info',
            };

            const result2 = await SigmaDetectionEngine.evaluateLog(
                log2,
                organization.id,
                project.id
            );
            expect(result2.matched).toBe(true);
        });

        it('should handle multiple matching rules', async () => {
            const { organization, project } = await createTestContext();

            // Rule 1
            await createTestSigmaRule({
                organizationId: organization.id,
                projectId: project.id,
                title: 'Rule 1',
                logsource: {},
            });

            // Rule 2
            await createTestSigmaRule({
                organizationId: organization.id,
                projectId: project.id,
                title: 'Rule 2',
                logsource: {},
            });

            const log = {
                service: 'test-service',
                message: 'test message', // Matches both (default factory rule matches "test")
                level: 'info',
            };

            const result = await SigmaDetectionEngine.evaluateLog(
                log,
                organization.id,
                project.id
            );

            expect(result.matched).toBe(true);
            expect(result.matchedRules).toHaveLength(2);
            const titles = result.matchedRules.map((r) => r.ruleTitle).sort();
            expect(titles).toEqual(['Rule 1', 'Rule 2']);
        });
    });

    describe('evaluateBatch', () => {
        it('should evaluate multiple logs efficiently', async () => {
            const { organization, project } = await createTestContext();

            await createTestSigmaRule({
                organizationId: organization.id,
                projectId: project.id,
                title: 'Batch Rule',
                logsource: {},
            });

            const logs = [
                { message: 'test match 1', service: 's1' },
                { message: 'no match', service: 's1' },
                { message: 'test match 2', service: 's1' },
            ];

            const results = await SigmaDetectionEngine.evaluateBatch(
                logs,
                organization.id,
                project.id
            );

            expect(results.size).toBe(3);
            expect(results.get(0)?.matched).toBe(true);
            expect(results.get(1)?.matched).toBe(false);
            expect(results.get(2)?.matched).toBe(true);
        });

        it('should handle empty rules', async () => {
            const { organization, project } = await createTestContext();

            const logs = [{ message: 'test', service: 's1' }];

            const results = await SigmaDetectionEngine.evaluateBatch(
                logs,
                organization.id,
                project.id
            );

            expect(results.get(0)?.matched).toBe(false);
        });
    });
});
