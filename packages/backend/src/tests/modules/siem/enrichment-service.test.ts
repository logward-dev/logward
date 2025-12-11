import { describe, it, expect, beforeEach, vi } from 'vitest';

// Use vi.hoisted to create mocks that work with hoisted vi.mock calls
const { mockGeoLite2, mockIpsum } = vi.hoisted(() => {
    return {
        mockGeoLite2: {
            initialize: vi.fn(() => Promise.resolve(true)),
            isReady: vi.fn(() => true),
            needsUpdate: vi.fn(() => false),
            downloadDatabase: vi.fn(() => Promise.resolve(true)),
            lookup: vi.fn((ip: string) => {
                // Return mock data for known IPs
                if (ip === '8.8.8.8') {
                    return {
                        ip: '8.8.8.8',
                        country: 'United States',
                        countryCode: 'US',
                        city: 'Mountain View',
                        latitude: 37.386,
                        longitude: -122.0838,
                        timezone: 'America/Los_Angeles',
                        accuracy: 1000,
                        subdivision: 'California',
                        postalCode: '94035',
                    };
                }
                return null;
            }),
            getInfo: vi.fn(() => ({
                ready: true,
                lastUpdate: new Date(),
                path: '/test/path',
            })),
        },
        mockIpsum: {
            initialize: vi.fn(() => Promise.resolve(true)),
            ready: vi.fn(() => true),
            needsUpdate: vi.fn(() => false),
            downloadDatabase: vi.fn(() => Promise.resolve(true)),
            checkIp: vi.fn((ip: string) => {
                // Return mock data for known IPs
                if (ip === '1.2.3.4') {
                    return {
                        ip: '1.2.3.4',
                        reputation: 'malicious' as const,
                        score: 5,
                        source: 'IPsum' as const,
                        lastChecked: new Date(),
                    };
                }
                return {
                    ip,
                    reputation: 'clean' as const,
                    score: 0,
                    source: 'IPsum' as const,
                    lastChecked: new Date(),
                };
            }),
            getInfo: vi.fn(() => ({
                ready: true,
                lastUpdate: new Date(),
                totalIps: 100000,
                path: '/test/path',
            })),
        },
    };
});

// Mock the modules BEFORE importing
vi.mock('../../../modules/siem/geolite2-service.js', () => ({
    geoLite2Service: mockGeoLite2,
}));

vi.mock('../../../modules/siem/ipsum-service.js', () => ({
    ipsumService: mockIpsum,
}));

// Import AFTER mocks are set up
import { EnrichmentService } from '../../../modules/siem/enrichment-service.js';

describe('EnrichmentService', () => {
    let service: EnrichmentService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new EnrichmentService();
    });

    describe('initialize', () => {
        it('should initialize both GeoLite2 and IPsum services', async () => {
            await service.initialize();

            expect(mockGeoLite2.initialize).toHaveBeenCalled();
            expect(mockIpsum.initialize).toHaveBeenCalled();
        });
    });

    describe('updateDatabasesIfNeeded', () => {
        it('should update databases when they need updates', async () => {
            mockGeoLite2.needsUpdate.mockReturnValueOnce(true);
            mockIpsum.needsUpdate.mockReturnValueOnce(true);

            const result = await service.updateDatabasesIfNeeded();

            expect(mockGeoLite2.downloadDatabase).toHaveBeenCalled();
            expect(mockIpsum.downloadDatabase).toHaveBeenCalled();
            expect(result.geoLite2).toBe(true);
            expect(result.ipsum).toBe(true);
        });

        it('should not update databases when they are current', async () => {
            mockGeoLite2.needsUpdate.mockReturnValueOnce(false);
            mockIpsum.needsUpdate.mockReturnValueOnce(false);

            const result = await service.updateDatabasesIfNeeded();

            expect(mockGeoLite2.downloadDatabase).not.toHaveBeenCalled();
            expect(mockIpsum.downloadDatabase).not.toHaveBeenCalled();
            expect(result.geoLite2).toBe(false);
            expect(result.ipsum).toBe(false);
        });
    });

    describe('checkIpReputation', () => {
        it('should return reputation data for known malicious IP', () => {
            const result = service.checkIpReputation('1.2.3.4');

            expect(result).not.toBeNull();
            expect(result?.reputation).toBe('malicious');
            expect(result?.source).toBe('IPsum');
        });

        it('should return clean reputation for unknown IP', () => {
            const result = service.checkIpReputation('5.6.7.8');

            expect(result).not.toBeNull();
            expect(result?.reputation).toBe('clean');
        });

        it('should return null when IPsum is not ready', () => {
            mockIpsum.ready.mockReturnValueOnce(false);

            const result = service.checkIpReputation('1.2.3.4');

            expect(result).toBeNull();
        });
    });

    describe('checkIpReputationBatch', () => {
        it('should check multiple IPs at once', () => {
            const results = service.checkIpReputationBatch(['1.2.3.4', '5.6.7.8']);

            expect(results['1.2.3.4']).not.toBeNull();
            expect(results['5.6.7.8']).not.toBeNull();
        });

        it('should return empty object for empty array', () => {
            const results = service.checkIpReputationBatch([]);

            expect(Object.keys(results)).toHaveLength(0);
        });
    });

    describe('getGeoIpData', () => {
        it('should return geo data for known IP', () => {
            const result = service.getGeoIpData('8.8.8.8');

            expect(result).not.toBeNull();
            expect(result?.country).toBe('United States');
            expect(result?.countryCode).toBe('US');
            expect(result?.city).toBe('Mountain View');
            expect(result?.source).toBe('GeoLite2');
        });

        it('should return null for unknown IP', () => {
            const result = service.getGeoIpData('192.168.1.1');

            expect(result).toBeNull();
        });
    });

    describe('getGeoIpDataBatch', () => {
        it('should lookup multiple IPs at once', () => {
            const results = service.getGeoIpDataBatch(['8.8.8.8', '192.168.1.1']);

            expect(results['8.8.8.8']).not.toBeNull();
            expect(results['192.168.1.1']).toBeNull();
        });

        it('should return empty object for empty array', () => {
            const results = service.getGeoIpDataBatch([]);

            expect(Object.keys(results)).toHaveLength(0);
        });
    });

    describe('enrichIp', () => {
        it('should return both reputation and geo data', () => {
            const result = service.enrichIp('8.8.8.8');

            expect(result.reputation).not.toBeNull();
            expect(result.geo).not.toBeNull();
            expect(result.geo?.country).toBe('United States');
        });

        it('should handle IP with only reputation data', () => {
            mockGeoLite2.lookup.mockReturnValueOnce(null);

            const result = service.enrichIp('1.2.3.4');

            expect(result.reputation).not.toBeNull();
            expect(result.geo).toBeNull();
        });
    });

    describe('extractIpAddresses', () => {
        it('should extract valid IPv4 addresses from text', () => {
            const text = 'Connection from 203.0.113.42 to 192.0.2.1 failed';
            const results = service.extractIpAddresses(text);

            expect(results).toContain('203.0.113.42');
            expect(results).toContain('192.0.2.1');
        });

        it('should filter out private IP addresses', () => {
            const text = 'Internal: 192.168.1.1, 10.0.0.1, 172.16.0.1, External: 8.8.8.8';
            const results = service.extractIpAddresses(text);

            // Should only contain the public IP
            expect(results).toContain('8.8.8.8');
            expect(results).not.toContain('192.168.1.1');
            expect(results).not.toContain('10.0.0.1');
            expect(results).not.toContain('172.16.0.1');
        });

        it('should filter out localhost', () => {
            const text = 'Request from 127.0.0.1 and 203.0.113.1';
            const results = service.extractIpAddresses(text);

            expect(results).toContain('203.0.113.1');
            expect(results).not.toContain('127.0.0.1');
        });

        it('should return empty array for text without IPs', () => {
            const text = 'No IP addresses here';
            const results = service.extractIpAddresses(text);

            expect(results).toHaveLength(0);
        });

        it('should deduplicate IPs', () => {
            const text = 'IP 8.8.8.8 appeared twice 8.8.8.8';
            const results = service.extractIpAddresses(text);

            expect(results).toHaveLength(1);
            expect(results).toContain('8.8.8.8');
        });

        it('should filter out link-local addresses', () => {
            const text = 'Link local: 169.254.1.1, Public: 1.1.1.1';
            const results = service.extractIpAddresses(text);

            expect(results).toContain('1.1.1.1');
            expect(results).not.toContain('169.254.1.1');
        });

        it('should filter out zero address', () => {
            const text = 'Zero: 0.0.0.0, Public: 1.1.1.1';
            const results = service.extractIpAddresses(text);

            expect(results).toContain('1.1.1.1');
            expect(results).not.toContain('0.0.0.0');
        });
    });

    describe('isConfigured', () => {
        it('should return configuration status', () => {
            const result = service.isConfigured();

            expect(result).toHaveProperty('ipReputation');
            expect(result).toHaveProperty('geoIp');
            expect(result.ipReputation).toBe(true);
            expect(result.geoIp).toBe(true);
        });

        it('should reflect when services are not ready', () => {
            mockIpsum.ready.mockReturnValueOnce(false);
            mockGeoLite2.isReady.mockReturnValueOnce(false);

            const result = service.isConfigured();

            expect(result.ipReputation).toBe(false);
            expect(result.geoIp).toBe(false);
        });
    });

    describe('getStatus', () => {
        it('should return detailed status of all services', () => {
            const result = service.getStatus();

            expect(result.ipReputation).toHaveProperty('configured');
            expect(result.ipReputation).toHaveProperty('ready');
            expect(result.ipReputation).toHaveProperty('totalIps');
            expect(result.ipReputation).toHaveProperty('lastUpdate');
            expect(result.ipReputation).toHaveProperty('source');

            expect(result.geoIp).toHaveProperty('configured');
            expect(result.geoIp).toHaveProperty('ready');
            expect(result.geoIp).toHaveProperty('lastUpdate');
            expect(result.geoIp).toHaveProperty('source');
        });

        it('should have correct source names', () => {
            const result = service.getStatus();

            expect(result.ipReputation.source).toContain('IPsum');
            expect(result.geoIp.source).toBe('GeoLite2');
        });
    });
});
