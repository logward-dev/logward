import { describe, it, expect } from 'vitest';
import { SigmaFieldMatcher } from '../../../modules/sigma/field-matcher.js';

// Note: These are unit tests that don't require database
// They test pure field matching logic

describe('Sigma Field Matcher', () => {
    describe('Basic Matching', () => {
        it('should match exact strings', () => {
            expect(SigmaFieldMatcher.match('hello', 'hello')).toBe(true);
            expect(SigmaFieldMatcher.match('hello', 'world')).toBe(false);
        });

        it('should be case-insensitive by default', () => {
            expect(SigmaFieldMatcher.match('Hello', 'hello')).toBe(true);
            expect(SigmaFieldMatcher.match('HELLO', 'hello')).toBe(true);
        });

        it('should respect case-sensitive flag', () => {
            expect(SigmaFieldMatcher.match('Hello', 'hello', { caseSensitive: true })).toBe(false);
            expect(SigmaFieldMatcher.match('Hello', 'Hello', { caseSensitive: true })).toBe(true);
        });

        it('should convert numbers to strings for matching', () => {
            expect(SigmaFieldMatcher.match(123, '123')).toBe(true);
            expect(SigmaFieldMatcher.match(456, '123')).toBe(false);
        });

        it('should return false for null/undefined values', () => {
            expect(SigmaFieldMatcher.match(null, 'test')).toBe(false);
            expect(SigmaFieldMatcher.match(undefined, 'test')).toBe(false);
        });
    });

    describe('Wildcard Matching', () => {
        it('should match * wildcard (any characters)', () => {
            expect(SigmaFieldMatcher.match('hello world', 'hello*')).toBe(true);
            expect(SigmaFieldMatcher.match('hello world', '*world')).toBe(true);
            expect(SigmaFieldMatcher.match('hello world', 'hello*world')).toBe(true);
            expect(SigmaFieldMatcher.match('hello world', '*')).toBe(true);
        });

        it('should match ? wildcard (single character)', () => {
            expect(SigmaFieldMatcher.match('cat', 'c?t')).toBe(true);
            expect(SigmaFieldMatcher.match('cut', 'c?t')).toBe(true);
            expect(SigmaFieldMatcher.match('caat', 'c?t')).toBe(false);
        });

        it('should combine * and ? wildcards', () => {
            expect(SigmaFieldMatcher.match('test-123.log', 'test-*.log')).toBe(true);
            expect(SigmaFieldMatcher.match('test-456.log', 'test-???.log')).toBe(true);
            expect(SigmaFieldMatcher.match('test-1.log', 'test-?.log')).toBe(true);
        });

        it('should handle complex wildcard patterns', () => {
            expect(SigmaFieldMatcher.match('C:\\Windows\\System32\\cmd.exe', '*cmd.exe')).toBe(true);
            expect(SigmaFieldMatcher.match('/usr/bin/bash', '/usr/bin/*')).toBe(true);
        });
    });

    describe('Array Patterns (OR Logic)', () => {
        it('should match if ANY pattern in array matches', () => {
            const pattern = ['cat', 'dog', 'bird'];
            expect(SigmaFieldMatcher.match('dog', pattern)).toBe(true);
            expect(SigmaFieldMatcher.match('fish', pattern)).toBe(false);
        });

        it('should support wildcards in array patterns', () => {
            const pattern = ['test-*.log', '*.txt', 'data-?'];
            expect(SigmaFieldMatcher.match('test-123.log', pattern)).toBe(true);
            expect(SigmaFieldMatcher.match('readme.txt', pattern)).toBe(true);
            expect(SigmaFieldMatcher.match('data-5', pattern)).toBe(true);
            expect(SigmaFieldMatcher.match('other.pdf', pattern)).toBe(false);
        });
    });

    describe('Modifier: contains', () => {
        it('should match if value contains pattern', () => {
            expect(SigmaFieldMatcher.match('hello world', 'world', { modifier: 'contains' })).toBe(true);
            expect(SigmaFieldMatcher.match('hello world', 'test', { modifier: 'contains' })).toBe(false);
        });

        it('should be case-insensitive by default', () => {
            expect(SigmaFieldMatcher.match('Hello World', 'WORLD', { modifier: 'contains' })).toBe(true);
        });

        it('should respect case-sensitive flag', () => {
            expect(SigmaFieldMatcher.match('Hello World', 'WORLD', { modifier: 'contains', caseSensitive: true })).toBe(false);
            expect(SigmaFieldMatcher.match('Hello World', 'World', { modifier: 'contains', caseSensitive: true })).toBe(true);
        });
    });

    describe('Modifier: startswith', () => {
        it('should match if value starts with pattern', () => {
            expect(SigmaFieldMatcher.match('hello world', 'hello', { modifier: 'startswith' })).toBe(true);
            expect(SigmaFieldMatcher.match('hello world', 'world', { modifier: 'startswith' })).toBe(false);
        });

        it('should be case-insensitive by default', () => {
            expect(SigmaFieldMatcher.match('Hello World', 'HELLO', { modifier: 'startswith' })).toBe(true);
        });
    });

    describe('Modifier: endswith', () => {
        it('should match if value ends with pattern', () => {
            expect(SigmaFieldMatcher.match('test.log', '.log', { modifier: 'endswith' })).toBe(true);
            expect(SigmaFieldMatcher.match('test.log', '.txt', { modifier: 'endswith' })).toBe(false);
        });

        it('should be case-insensitive by default', () => {
            expect(SigmaFieldMatcher.match('Test.LOG', '.log', { modifier: 'endswith' })).toBe(true);
        });
    });

    describe('Modifier: re (regex)', () => {
        it('should match with regex pattern', () => {
            expect(SigmaFieldMatcher.match('test123', '\\d+', { modifier: 're' })).toBe(true);
            expect(SigmaFieldMatcher.match('test', '\\d+', { modifier: 're' })).toBe(false);
        });

        it('should match email pattern', () => {
            const emailPattern = '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}';
            expect(SigmaFieldMatcher.match('test@example.com', emailPattern, { modifier: 're' })).toBe(true);
            expect(SigmaFieldMatcher.match('invalid-email', emailPattern, { modifier: 're' })).toBe(false);
        });

        it('should match IP address pattern', () => {
            const ipPattern = '\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b';
            expect(SigmaFieldMatcher.match('Server: 192.168.1.1', ipPattern, { modifier: 're' })).toBe(true);
            expect(SigmaFieldMatcher.match('No IP here', ipPattern, { modifier: 're' })).toBe(false);
        });

        it('should handle invalid regex gracefully', () => {
            expect(SigmaFieldMatcher.match('test', '[invalid(', { modifier: 're' })).toBe(false);
        });
    });

    describe('Modifier: base64', () => {
        it('should match base64-encoded content', () => {
            const base64 = Buffer.from('malicious code').toString('base64');
            expect(SigmaFieldMatcher.match(base64, 'malicious', { modifier: 'base64' })).toBe(true);
            expect(SigmaFieldMatcher.match(base64, 'benign', { modifier: 'base64' })).toBe(false);
        });

        it('should handle invalid base64 gracefully', () => {
            expect(SigmaFieldMatcher.match('not-base64!!!', 'test', { modifier: 'base64' })).toBe(false);
        });
    });

    describe('Modifier: all (all words)', () => {
        it('should match if all words present in any order', () => {
            expect(SigmaFieldMatcher.match('hello world test', 'hello test', { modifier: 'all' })).toBe(true);
            expect(SigmaFieldMatcher.match('test hello world', 'hello test', { modifier: 'all' })).toBe(true);
            expect(SigmaFieldMatcher.match('hello world', 'hello test', { modifier: 'all' })).toBe(false);
        });
    });

    describe('Selection Matching', () => {
        it('should match selection with all fields matching (AND logic)', () => {
            const logData = {
                service: 'sshd',
                level: 'error',
                message: 'Failed password for user',
            };

            const selection = {
                service: 'sshd',
                message: '*Failed password*',
            };

            expect(SigmaFieldMatcher.matchSelection(logData, selection)).toBe(true);
        });

        it('should not match if any field does not match', () => {
            const logData = {
                service: 'sshd',
                level: 'error',
                message: 'Connection established',
            };

            const selection = {
                service: 'sshd',
                message: '*Failed password*',
            };

            expect(SigmaFieldMatcher.matchSelection(logData, selection)).toBe(false);
        });

        it('should support field modifiers in selection', () => {
            const logData = {
                command: 'rm -rf /tmp/test',
            };

            const selection = {
                'command|contains': 'rm -rf',
            };

            expect(SigmaFieldMatcher.matchSelection(logData, selection)).toBe(true);
        });

        it('should support nested field access with dot notation', () => {
            const logData = {
                metadata: {
                    user: {
                        id: '123',
                        name: 'admin',
                    },
                },
            };

            const selection = {
                'metadata.user.name': 'admin',
            };

            expect(SigmaFieldMatcher.matchSelection(logData, selection)).toBe(true);
        });

        it('should return false for empty selection', () => {
            const logData = { service: 'test' };
            expect(SigmaFieldMatcher.matchSelection(logData, {})).toBe(false);
        });

        it('should handle array patterns in selection (OR logic for values)', () => {
            const logData = {
                command: 'history -c',
            };

            const selection = {
                command: ['history -c', 'cat /dev/null > ~/.bash_history', 'rm ~/.bash_history'],
            };

            expect(SigmaFieldMatcher.matchSelection(logData, selection)).toBe(true);
        });
    });

    describe('Real-World Sigma Rule Patterns', () => {
        it('should match SSH brute force pattern', () => {
            const logEntry = {
                service: 'sshd',
                message: 'Failed password for invalid user admin from 192.168.1.100 port 22 ssh2',
            };

            const selection = {
                service: 'sshd',
                'message|contains': 'Failed password',
            };

            expect(SigmaFieldMatcher.matchSelection(logEntry, selection)).toBe(true);
        });

        it('should match command execution pattern', () => {
            const logEntry = {
                command: 'powershell.exe -enc SGVsbG8gV29ybGQ=',
            };

            const selection1 = {
                'command|contains': 'powershell',
            };

            const selection2 = {
                'command|contains': '-enc',
            };

            expect(SigmaFieldMatcher.matchSelection(logEntry, selection1)).toBe(true);
            expect(SigmaFieldMatcher.matchSelection(logEntry, selection2)).toBe(true);
        });

        it('should match file path pattern', () => {
            const logEntry = {
                path: 'C:\\Windows\\System32\\cmd.exe',
            };

            const selection = {
                path: '*System32*cmd.exe',
            };

            expect(SigmaFieldMatcher.matchSelection(logEntry, selection)).toBe(true);
        });
    });
});
