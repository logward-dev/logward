import { describe, it, expect } from 'vitest';
import { SigmaConditionEvaluator } from '../../../modules/sigma/condition-evaluator.js';

describe('Sigma Condition Evaluator', () => {
    describe('Simple Identifiers', () => {
        it('should evaluate single selection', () => {
            const detectionBlock = {
                selection: {
                    service: 'sshd',
                },
                condition: 'selection',
            };

            const logData = { service: 'sshd' };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(true);
        });

        it('should return false when selection does not match', () => {
            const detectionBlock = {
                selection: {
                    service: 'httpd',
                },
                condition: 'selection',
            };

            const logData = { service: 'sshd' };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(false);
        });

        it('should handle non-existent selection', () => {
            const detectionBlock = {
                selection: {
                    service: 'sshd',
                },
                condition: 'nonexistent',
            };

            const logData = { service: 'sshd' };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(false);
        });
    });

    describe('AND Operator', () => {
        it('should evaluate AND condition (both match)', () => {
            const detectionBlock = {
                selection: {
                    service: 'sshd',
                },
                keywords: {
                    'message|contains': 'Failed password',
                },
                condition: 'selection and keywords',
            };

            const logData = {
                service: 'sshd',
                message: 'Failed password for user',
            };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(true);
        });

        it('should return false when one selection does not match', () => {
            const detectionBlock = {
                selection: {
                    service: 'sshd',
                },
                keywords: {
                    'message|contains': 'connection established',
                },
                condition: 'selection and keywords',
            };

            const logData = {
                service: 'sshd',
                message: 'Failed password for user',
            };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(false);
        });

        it('should handle multiple AND operators', () => {
            const detectionBlock = {
                sel1: { service: 'sshd' },
                sel2: { level: 'error' },
                sel3: { 'message|contains': 'Failed' },
                condition: 'sel1 and sel2 and sel3',
            };

            const logData = {
                service: 'sshd',
                level: 'error',
                message: 'Failed password',
            };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(true);
        });
    });

    describe('OR Operator', () => {
        it('should evaluate OR condition (first matches)', () => {
            const detectionBlock = {
                selection1: {
                    service: 'sshd',
                },
                selection2: {
                    service: 'httpd',
                },
                condition: 'selection1 or selection2',
            };

            const logData = { service: 'sshd' };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(true);
        });

        it('should evaluate OR condition (second matches)', () => {
            const detectionBlock = {
                selection1: {
                    service: 'sshd',
                },
                selection2: {
                    service: 'httpd',
                },
                condition: 'selection1 or selection2',
            };

            const logData = { service: 'httpd' };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(true);
        });

        it('should return false when neither matches', () => {
            const detectionBlock = {
                selection1: {
                    service: 'sshd',
                },
                selection2: {
                    service: 'httpd',
                },
                condition: 'selection1 or selection2',
            };

            const logData = { service: 'nginx' };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(false);
        });
    });

    describe('NOT Operator', () => {
        it('should evaluate NOT condition (negates match)', () => {
            const detectionBlock = {
                selection: {
                    service: 'sshd',
                },
                condition: 'not selection',
            };

            const logData = { service: 'httpd' };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(true);
        });

        it('should return false when NOT negates true', () => {
            const detectionBlock = {
                selection: {
                    service: 'sshd',
                },
                condition: 'not selection',
            };

            const logData = { service: 'sshd' };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(false);
        });

        it('should handle NOT with AND', () => {
            const detectionBlock = {
                selection: {
                    service: 'sshd',
                },
                filter: {
                    level: 'debug',
                },
                condition: 'selection and not filter',
            };

            const logData = {
                service: 'sshd',
                level: 'error',
            };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(true);
        });
    });

    describe('Parentheses Grouping', () => {
        it('should respect parentheses grouping', () => {
            const detectionBlock = {
                sel1: { service: 'sshd' },
                sel2: { level: 'error' },
                sel3: { level: 'warning' },
                condition: 'sel1 and (sel2 or sel3)',
            };

            const logDataError = {
                service: 'sshd',
                level: 'error',
            };

            const logDataWarning = {
                service: 'sshd',
                level: 'warning',
            };

            const logDataInfo = {
                service: 'sshd',
                level: 'info',
            };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logDataError)).toBe(true);
            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logDataWarning)).toBe(true);
            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logDataInfo)).toBe(false);
        });

        it('should handle nested parentheses', () => {
            const detectionBlock = {
                sel1: { service: 'sshd' },
                sel2: { level: 'error' },
                sel3: { 'message|contains': 'Failed' },
                sel4: { port: '22' },
                condition: 'sel1 and (sel2 or (sel3 and sel4))',
            };

            const logData = {
                service: 'sshd',
                level: 'info',
                message: 'Failed connection',
                port: '22',
            };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(true);
        });
    });

    describe('Quantifier: "1 of"', () => {
        it('should match when at least 1 selection matches', () => {
            const detectionBlock = {
                selection_1: { service: 'sshd' },
                selection_2: { service: 'httpd' },
                selection_3: { service: 'nginx' },
                condition: '1 of selection_*',
            };

            const logData = { service: 'sshd' };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(true);
        });

        it('should return false when no selections match', () => {
            const detectionBlock = {
                selection_1: { service: 'sshd' },
                selection_2: { service: 'httpd' },
                selection_3: { service: 'nginx' },
                condition: '1 of selection_*',
            };

            const logData = { service: 'mysql' };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(false);
        });

        it('should handle "2 of" quantifier', () => {
            const detectionBlock = {
                sel1: { service: 'sshd' },
                sel2: { level: 'error' },
                sel3: { 'message|contains': 'Failed' },
                condition: '2 of sel*',
            };

            const logDataMatch = {
                service: 'sshd',
                level: 'error',
                message: 'Connection refused',
            };

            const logDataNoMatch = {
                service: 'sshd',
                level: 'info',
                message: 'Connection refused',
            };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logDataMatch)).toBe(true);
            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logDataNoMatch)).toBe(false);
        });
    });

    describe('Quantifier: "all of"', () => {
        it('should match when all selections match', () => {
            const detectionBlock = {
                selection_1: { service: 'sshd' },
                selection_2: { level: 'error' },
                condition: 'all of selection_*',
            };

            const logData = {
                service: 'sshd',
                level: 'error',
            };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(true);
        });

        it('should return false when not all selections match', () => {
            const detectionBlock = {
                selection_1: { service: 'sshd' },
                selection_2: { level: 'error' },
                selection_3: { 'message|contains': 'Failed' },
                condition: 'all of selection_*',
            };

            const logData = {
                service: 'sshd',
                level: 'error',
                message: 'Connection established',
            };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(false);
        });

        it('should handle "all of them"', () => {
            const detectionBlock = {
                selection: { service: 'sshd' },
                keywords: { 'message|contains': 'Failed' },
                timeframe: { level: 'error' },
                condition: 'all of them',
            };

            const logData = {
                service: 'sshd',
                level: 'error',
                message: 'Failed password',
            };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(true);
        });
    });

    describe('Keyword Arrays', () => {
        it('should match keyword array (any keyword in any field)', () => {
            const detectionBlock = {
                keywords: ['password', 'authentication', 'login'],
                condition: 'keywords',
            };

            const logData = {
                service: 'sshd',
                message: 'Failed password for user admin',
            };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(true);
        });

        it('should be case-insensitive by default for keywords', () => {
            const detectionBlock = {
                keywords: ['PASSWORD'],
                condition: 'keywords',
            };

            const logData = {
                message: 'failed password',
            };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(true);
        });

        it('should return false when no keywords match', () => {
            const detectionBlock = {
                keywords: ['password', 'authentication'],
                condition: 'keywords',
            };

            const logData = {
                message: 'Connection established',
            };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(false);
        });
    });

    describe('Complex Conditions', () => {
        it('should evaluate complex real-world Sigma rule', () => {
            const detectionBlock = {
                selection_process: {
                    'process|contains': 'powershell',
                },
                selection_cmdline: {
                    'cmdline|contains': '-enc',
                },
                filter_legitim: {
                    user: 'admin',
                },
                condition: '(selection_process and selection_cmdline) and not filter_legitim',
            };

            const maliciousLog = {
                process: 'powershell.exe',
                cmdline: 'powershell -enc SGVsbG8=',
                user: 'hacker',
            };

            const legitimateLog = {
                process: 'powershell.exe',
                cmdline: 'powershell -enc SGVsbG8=',
                user: 'admin',
            };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, maliciousLog)).toBe(true);
            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, legitimateLog)).toBe(false);
        });

        it('should handle complex condition with quantifiers and operators', () => {
            const detectionBlock = {
                proc_1: { 'process|contains': 'cmd.exe' },
                proc_2: { 'process|contains': 'powershell' },
                proc_3: { 'process|contains': 'wscript' },
                keywords: ['malicious', 'suspicious'],
                condition: '1 of proc_* and keywords',
            };

            const logData = {
                process: 'cmd.exe /c whoami',
                output: 'suspicious activity detected',
            };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(true);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty detection block', () => {
            const detectionBlock = {
                condition: 'selection',
            };

            const logData = { service: 'sshd' };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(false);
        });

        it('should handle missing condition', () => {
            const detectionBlock = {
                selection: { service: 'sshd' },
            };

            const logData = { service: 'sshd' };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(false);
        });

        it('should handle empty log data', () => {
            const detectionBlock = {
                selection: { service: 'sshd' },
                condition: 'selection',
            };

            const logData = {};

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(false);
        });

        it('should handle wildcard pattern with no matches', () => {
            const detectionBlock = {
                selection: { service: 'sshd' },
                condition: '1 of nonexistent_*',
            };

            const logData = { service: 'sshd' };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData)).toBe(false);
        });
    });

    describe('Case Sensitivity', () => {
        it('should respect case-sensitive flag', () => {
            const detectionBlock = {
                selection: {
                    service: 'SSHD',
                },
                condition: 'selection',
            };

            const logData = { service: 'sshd' };

            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData, true)).toBe(false);
            expect(SigmaConditionEvaluator.evaluateDetection(detectionBlock, logData, false)).toBe(true);
        });
    });
});
