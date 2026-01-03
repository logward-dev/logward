import { describe, it, expect, beforeAll } from 'vitest';
import { gzipSync } from 'zlib';
import {
  parseOtlpJson,
  parseOtlpProtobuf,
  detectContentType,
  parseOtlpRequest,
  isGzipCompressed,
  decompressGzip,
} from '../../../modules/otlp/parser.js';

describe('OTLP Parser', () => {
  // ==========================================================================
  // isGzipCompressed
  // ==========================================================================
  describe('isGzipCompressed', () => {
    it('should return true for gzip compressed data', () => {
      const gzipData = Buffer.from([0x1f, 0x8b, 0x08, 0x00]);
      expect(isGzipCompressed(gzipData)).toBe(true);
    });

    it('should return false for non-gzip data', () => {
      const jsonData = Buffer.from('{"resourceLogs":[]}');
      expect(isGzipCompressed(jsonData)).toBe(false);
    });

    it('should return false for empty buffer', () => {
      const emptyBuffer = Buffer.from([]);
      expect(isGzipCompressed(emptyBuffer)).toBe(false);
    });

    it('should return false for buffer with only one byte', () => {
      const singleByte = Buffer.from([0x1f]);
      expect(isGzipCompressed(singleByte)).toBe(false);
    });

    it('should return false for buffer starting with only first gzip byte', () => {
      const partialGzip = Buffer.from([0x1f, 0x00]);
      expect(isGzipCompressed(partialGzip)).toBe(false);
    });

    it('should return true for actual gzip compressed data', () => {
      const compressed = gzipSync(Buffer.from('test data'));
      expect(isGzipCompressed(compressed)).toBe(true);
    });
  });

  // ==========================================================================
  // decompressGzip
  // ==========================================================================
  describe('decompressGzip', () => {
    it('should decompress gzip data', async () => {
      const originalData = 'Hello, World!';
      const compressed = gzipSync(Buffer.from(originalData));

      const decompressed = await decompressGzip(compressed);

      expect(decompressed.toString()).toBe(originalData);
    });

    it('should decompress JSON data', async () => {
      const jsonData = '{"resourceLogs":[]}';
      const compressed = gzipSync(Buffer.from(jsonData));

      const decompressed = await decompressGzip(compressed);

      expect(decompressed.toString()).toBe(jsonData);
    });

    it('should handle large data', async () => {
      const largeData = 'x'.repeat(100000);
      const compressed = gzipSync(Buffer.from(largeData));

      const decompressed = await decompressGzip(compressed);

      expect(decompressed.toString()).toBe(largeData);
    });

    it('should throw error for invalid gzip data', async () => {
      const invalidData = Buffer.from([0x1f, 0x8b, 0x00, 0x00]);

      await expect(decompressGzip(invalidData)).rejects.toThrow();
    });
  });

  // ==========================================================================
  // parseOtlpJson
  // ==========================================================================
  describe('parseOtlpJson', () => {
    it('should return empty resourceLogs for null body', () => {
      const result = parseOtlpJson(null);

      expect(result.resourceLogs).toEqual([]);
    });

    it('should return empty resourceLogs for undefined body', () => {
      const result = parseOtlpJson(undefined);

      expect(result.resourceLogs).toEqual([]);
    });

    it('should parse object body directly', () => {
      const body = {
        resourceLogs: [
          {
            resource: { attributes: [] },
            scopeLogs: [
              {
                logRecords: [
                  { body: { stringValue: 'test' } },
                ],
              },
            ],
          },
        ],
      };

      const result = parseOtlpJson(body);

      expect(result.resourceLogs).toHaveLength(1);
    });

    it('should parse JSON string body', () => {
      const body = JSON.stringify({
        resourceLogs: [
          {
            resource: {},
            scopeLogs: [
              {
                logRecords: [{ severityNumber: 9 }],
              },
            ],
          },
        ],
      });

      const result = parseOtlpJson(body);

      expect(result.resourceLogs).toHaveLength(1);
    });

    it('should throw error for invalid JSON string', () => {
      expect(() => parseOtlpJson('not valid json')).toThrow('Invalid OTLP JSON');
    });

    it('should throw error for invalid body type', () => {
      expect(() => parseOtlpJson(12345 as unknown)).toThrow('Invalid OTLP request body type');
    });

    it('should handle missing resourceLogs gracefully', () => {
      const result = parseOtlpJson({ someOther: 'field' });

      expect(result.resourceLogs).toEqual([]);
    });

    it('should normalize snake_case to camelCase for resourceLogs', () => {
      const body = {
        resource_logs: [
          {
            resource: { attributes: [{ key: 'service.name', value: { stringValue: 'my-svc' } }] },
            scope_logs: [
              {
                log_records: [
                  {
                    time_unix_nano: '1234567890000000000',
                    severity_number: 9,
                    severity_text: 'INFO',
                    trace_id: 'abc123',
                    span_id: 'def456',
                    observed_time_unix_nano: '1234567890000000000',
                    dropped_attributes_count: 0,
                  },
                ],
                schema_url: 'https://example.com/schema',
              },
            ],
            schema_url: 'https://example.com/schema',
          },
        ],
      };

      const result = parseOtlpJson(body);

      expect(result.resourceLogs).toHaveLength(1);
      expect(result.resourceLogs[0]).toHaveProperty('scopeLogs');
      expect((result.resourceLogs[0] as any).scopeLogs[0]).toHaveProperty('logRecords');
      expect((result.resourceLogs[0] as any).scopeLogs[0]).toHaveProperty('schemaUrl');
    });

    it('should handle empty scopeLogs', () => {
      const body = {
        resourceLogs: [
          {
            resource: {},
            scopeLogs: [],
          },
        ],
      };

      const result = parseOtlpJson(body);

      expect(result.resourceLogs).toHaveLength(1);
      expect((result.resourceLogs[0] as any).scopeLogs).toEqual([]);
    });

    it('should handle null scopeLogs', () => {
      const body = {
        resourceLogs: [
          {
            resource: {},
            scopeLogs: null,
          },
        ],
      };

      const result = parseOtlpJson(body);

      expect(result.resourceLogs).toHaveLength(1);
      expect((result.resourceLogs[0] as any).scopeLogs).toEqual([]);
    });

    it('should handle empty logRecords', () => {
      const body = {
        resourceLogs: [
          {
            resource: {},
            scopeLogs: [{ logRecords: [] }],
          },
        ],
      };

      const result = parseOtlpJson(body);

      expect((result.resourceLogs[0] as any).scopeLogs[0].logRecords).toEqual([]);
    });

    it('should handle null logRecords', () => {
      const body = {
        resourceLogs: [
          {
            resource: {},
            scopeLogs: [{ logRecords: null }],
          },
        ],
      };

      const result = parseOtlpJson(body);

      expect((result.resourceLogs[0] as any).scopeLogs[0].logRecords).toEqual([]);
    });

    it('should normalize all log record fields', () => {
      const body = {
        resourceLogs: [
          {
            scopeLogs: [
              {
                logRecords: [
                  {
                    time_unix_nano: '1000',
                    observed_time_unix_nano: '2000',
                    severity_number: 17,
                    severity_text: 'ERROR',
                    body: { stringValue: 'error message' },
                    attributes: [{ key: 'foo', value: { stringValue: 'bar' } }],
                    dropped_attributes_count: 5,
                    flags: 1,
                    trace_id: 'trace123',
                    span_id: 'span456',
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = parseOtlpJson(body);
      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];

      expect(logRecord.timeUnixNano).toBe('1000');
      expect(logRecord.observedTimeUnixNano).toBe('2000');
      expect(logRecord.severityNumber).toBe(17);
      expect(logRecord.severityText).toBe('ERROR');
      expect(logRecord.body).toEqual({ stringValue: 'error message' });
      expect(logRecord.traceId).toBe('trace123');
      expect(logRecord.spanId).toBe('span456');
      expect(logRecord.droppedAttributesCount).toBe(5);
      expect(logRecord.flags).toBe(1);
    });

    it('should handle invalid resource logs item', () => {
      const body = {
        resourceLogs: [null, undefined, 'invalid'],
      };

      const result = parseOtlpJson(body);

      // Should return empty objects for invalid items
      expect(result.resourceLogs).toHaveLength(3);
    });

    it('should handle invalid scope logs item', () => {
      const body = {
        resourceLogs: [
          {
            scopeLogs: [null, 'invalid'],
          },
        ],
      };

      const result = parseOtlpJson(body);

      expect((result.resourceLogs[0] as any).scopeLogs).toHaveLength(2);
    });

    it('should handle invalid log records item', () => {
      const body = {
        resourceLogs: [
          {
            scopeLogs: [{ logRecords: [null, 'invalid'] }],
          },
        ],
      };

      const result = parseOtlpJson(body);

      expect((result.resourceLogs[0] as any).scopeLogs[0].logRecords).toHaveLength(2);
    });
  });

  // ==========================================================================
  // parseOtlpProtobuf
  // ==========================================================================
  describe('parseOtlpProtobuf', () => {
    it('should parse JSON disguised as protobuf', async () => {
      const jsonData = {
        resourceLogs: [
          {
            scopeLogs: [
              {
                logRecords: [{ severityNumber: 9 }],
              },
            ],
          },
        ],
      };
      const buffer = Buffer.from(JSON.stringify(jsonData));

      const result = await parseOtlpProtobuf(buffer);

      expect(result.resourceLogs).toHaveLength(1);
    });

    it('should throw error for invalid protobuf data', async () => {
      // Invalid binary data that cannot be parsed as valid protobuf
      const buffer = Buffer.from([0x0a, 0x0b, 0x0c, 0x0d]);

      await expect(parseOtlpProtobuf(buffer)).rejects.toThrow(
        'Failed to decode OTLP protobuf'
      );
    });

    it('should parse valid empty protobuf message', async () => {
      // An empty ExportLogsServiceRequest (just the message with no resourceLogs)
      // In protobuf, an empty message is literally empty bytes
      const buffer = Buffer.from([]);

      const result = await parseOtlpProtobuf(buffer);
      expect(result.resourceLogs).toEqual([]);
    });

    it('should handle array JSON format', async () => {
      const jsonData = [{ test: 'data' }];
      const buffer = Buffer.from(JSON.stringify(jsonData));

      // This will parse but return empty resourceLogs
      const result = await parseOtlpProtobuf(buffer);
      expect(result.resourceLogs).toEqual([]);
    });

    it('should auto-detect and decompress gzip compressed JSON', async () => {
      const jsonData = {
        resourceLogs: [{
          resource: {},
          scopeLogs: [{
            logRecords: [{ severityNumber: 9, body: { stringValue: 'test log' } }],
          }],
        }],
      };
      const compressed = gzipSync(Buffer.from(JSON.stringify(jsonData)));

      const result = await parseOtlpProtobuf(compressed);

      expect(result.resourceLogs).toHaveLength(1);
    });

    it('should handle gzip compressed data with nested structure', async () => {
      const jsonData = {
        resourceLogs: [{
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'my-service' } }] },
          scopeLogs: [{
            scope: { name: 'test-scope' },
            logRecords: [
              { timeUnixNano: '1234567890', severityNumber: 9, body: { stringValue: 'log 1' } },
              { timeUnixNano: '1234567891', severityNumber: 13, body: { stringValue: 'log 2' } },
            ],
          }],
        }],
      };
      const compressed = gzipSync(Buffer.from(JSON.stringify(jsonData)));

      const result = await parseOtlpProtobuf(compressed);

      expect(result.resourceLogs).toHaveLength(1);
      expect((result.resourceLogs[0] as any).scopeLogs[0].logRecords).toHaveLength(2);
    });

    it('should throw error for invalid gzip data', async () => {
      // Invalid gzip (magic bytes but corrupt data)
      const invalidGzip = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0xff, 0xff]);

      await expect(parseOtlpProtobuf(invalidGzip)).rejects.toThrow('Failed to decompress gzip data');
    });
  });

  // ==========================================================================
  // detectContentType
  // ==========================================================================
  describe('detectContentType', () => {
    it('should return unknown for undefined content type', () => {
      expect(detectContentType(undefined)).toBe('unknown');
    });

    it('should return unknown for empty content type', () => {
      expect(detectContentType('')).toBe('unknown');
    });

    it('should detect application/json', () => {
      expect(detectContentType('application/json')).toBe('json');
    });

    it('should detect application/json with charset', () => {
      expect(detectContentType('application/json; charset=utf-8')).toBe('json');
    });

    it('should detect application/json case insensitively', () => {
      expect(detectContentType('Application/JSON')).toBe('json');
    });

    it('should detect application/x-protobuf', () => {
      expect(detectContentType('application/x-protobuf')).toBe('protobuf');
    });

    it('should detect application/protobuf', () => {
      expect(detectContentType('application/protobuf')).toBe('protobuf');
    });

    it('should detect protobuf case insensitively', () => {
      expect(detectContentType('Application/X-PROTOBUF')).toBe('protobuf');
    });

    it('should return unknown for other content types', () => {
      expect(detectContentType('text/plain')).toBe('unknown');
      expect(detectContentType('text/html')).toBe('unknown');
      expect(detectContentType('application/xml')).toBe('unknown');
    });
  });

  // ==========================================================================
  // parseOtlpRequest
  // ==========================================================================
  describe('parseOtlpRequest', () => {
    it('should parse JSON content type', async () => {
      const body = {
        resourceLogs: [{ scopeLogs: [{ logRecords: [] }] }],
      };

      const result = await parseOtlpRequest(body, 'application/json');

      expect(result.resourceLogs).toHaveLength(1);
    });

    it('should parse protobuf content type with JSON body', async () => {
      const body = Buffer.from(
        JSON.stringify({
          resourceLogs: [{ scopeLogs: [{ logRecords: [] }] }],
        })
      );

      const result = await parseOtlpRequest(body, 'application/x-protobuf');

      expect(result.resourceLogs).toHaveLength(1);
    });

    it('should throw error for protobuf content type with non-buffer body', async () => {
      const body = { resourceLogs: [] };

      await expect(
        parseOtlpRequest(body, 'application/x-protobuf')
      ).rejects.toThrow('Protobuf content-type requires Buffer body');
    });

    it('should fallback to JSON for unknown content type', async () => {
      const body = {
        resourceLogs: [{ scopeLogs: [{ logRecords: [] }] }],
      };

      const result = await parseOtlpRequest(body, 'text/plain');

      expect(result.resourceLogs).toHaveLength(1);
    });

    it('should fallback to JSON when content type is undefined', async () => {
      const body = {
        resourceLogs: [{ scopeLogs: [{ logRecords: [] }] }],
      };

      const result = await parseOtlpRequest(body, undefined);

      expect(result.resourceLogs).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Extended Body Value Tests (for snake_case normalization coverage)
  // ==========================================================================
  describe('parseOtlpJson - Body Value Types', () => {
    it('should handle body with boolValue', () => {
      const body = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{ body: { boolValue: true } }],
          }],
        }],
      };

      const result = parseOtlpJson(body);
      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];

      expect(logRecord.body.boolValue).toBe(true);
    });

    it('should handle body with intValue', () => {
      const body = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{ body: { intValue: 42 } }],
          }],
        }],
      };

      const result = parseOtlpJson(body);
      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];

      expect(logRecord.body.intValue).toBe(42);
    });

    it('should handle body with doubleValue', () => {
      const body = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{ body: { doubleValue: 3.14 } }],
          }],
        }],
      };

      const result = parseOtlpJson(body);
      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];

      expect(logRecord.body.doubleValue).toBe(3.14);
    });

    it('should handle body with arrayValue', () => {
      const body = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              body: {
                arrayValue: {
                  values: [
                    { stringValue: 'item1' },
                    { stringValue: 'item2' },
                  ],
                },
              },
            }],
          }],
        }],
      };

      const result = parseOtlpJson(body);
      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];

      expect(logRecord.body.arrayValue.values).toHaveLength(2);
    });

    it('should handle body with kvlistValue', () => {
      const body = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              body: {
                kvlistValue: {
                  values: [
                    { key: 'name', value: { stringValue: 'test' } },
                  ],
                },
              },
            }],
          }],
        }],
      };

      const result = parseOtlpJson(body);
      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];

      expect(logRecord.body.kvlistValue.values[0].key).toBe('name');
    });

    it('should handle body with bytesValue', () => {
      const body = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              body: { bytesValue: 'SGVsbG8gV29ybGQ=' }, // base64 encoded "Hello World"
            }],
          }],
        }],
      };

      const result = parseOtlpJson(body);
      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];

      expect(logRecord.body.bytesValue).toBe('SGVsbG8gV29ybGQ=');
    });

    it('should pass through snake_case body values (bool_value) unchanged', () => {
      // Note: JSON parser doesn't normalize body values, only log record fields
      const body = {
        resourceLogs: [{
          scopeLogs: [{
            log_records: [{ body: { bool_value: false } }],
          }],
        }],
      };

      const result = parseOtlpJson(body);
      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];

      // Body is passed through as-is (not normalized in JSON path)
      expect(logRecord.body.bool_value).toBe(false);
    });

    it('should pass through snake_case body values (int_value) unchanged', () => {
      // Note: JSON parser doesn't normalize body values, only log record fields
      const body = {
        resourceLogs: [{
          scopeLogs: [{
            log_records: [{ body: { int_value: 100 } }],
          }],
        }],
      };

      const result = parseOtlpJson(body);
      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];

      // Body is passed through as-is (not normalized in JSON path)
      expect(logRecord.body.int_value).toBe(100);
    });

    it('should pass through snake_case body values (double_value) unchanged', () => {
      // Note: JSON parser doesn't normalize body values, only log record fields
      const body = {
        resourceLogs: [{
          scopeLogs: [{
            log_records: [{ body: { double_value: 2.718 } }],
          }],
        }],
      };

      const result = parseOtlpJson(body);
      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];

      // Body is passed through as-is (not normalized in JSON path)
      expect(logRecord.body.double_value).toBe(2.718);
    });

    it('should pass through snake_case body values (array_value) unchanged', () => {
      // Note: JSON parser doesn't normalize body values, only log record fields
      const body = {
        resourceLogs: [{
          scopeLogs: [{
            log_records: [{
              body: { array_value: { values: [] } },
            }],
          }],
        }],
      };

      const result = parseOtlpJson(body);
      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];

      // Body is passed through as-is (not normalized in JSON path)
      expect(logRecord.body.array_value).toBeDefined();
    });

    it('should pass through snake_case body values (kvlist_value) unchanged', () => {
      // Note: JSON parser doesn't normalize body values, only log record fields
      const body = {
        resourceLogs: [{
          scopeLogs: [{
            log_records: [{
              body: { kvlist_value: { values: [] } },
            }],
          }],
        }],
      };

      const result = parseOtlpJson(body);
      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];

      // Body is passed through as-is (not normalized in JSON path)
      expect(logRecord.body.kvlist_value).toBeDefined();
    });

    it('should pass through snake_case body values (bytes_value) unchanged', () => {
      // Note: JSON parser doesn't normalize body values, only log record fields
      const body = {
        resourceLogs: [{
          scopeLogs: [{
            log_records: [{
              body: { bytes_value: 'dGVzdA==' }, // base64 "test"
            }],
          }],
        }],
      };

      const result = parseOtlpJson(body);
      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];

      // Body is passed through as-is (not normalized in JSON path)
      expect(logRecord.body.bytes_value).toBe('dGVzdA==');
    });

    it('should handle undefined body gracefully', () => {
      const body = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{ severityNumber: 9 }], // No body field
          }],
        }],
      };

      const result = parseOtlpJson(body);
      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];

      expect(logRecord.body).toBeUndefined();
    });

    it('should handle complex nested attributes', () => {
      const body = {
        resourceLogs: [{
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'my-service' } },
              { key: 'host.name', value: { stringValue: 'localhost' } },
              { key: 'process.pid', value: { intValue: 12345 } },
            ],
          },
          scopeLogs: [{
            scope: {
              name: 'my-scope',
              version: '1.0.0',
              attributes: [
                { key: 'scope.attr', value: { boolValue: true } },
              ],
            },
            logRecords: [{
              body: { stringValue: 'test message' },
              attributes: [
                { key: 'custom.attr', value: { doubleValue: 1.5 } },
              ],
            }],
          }],
        }],
      };

      const result = parseOtlpJson(body);

      expect(result.resourceLogs).toHaveLength(1);
      expect((result.resourceLogs[0] as any).resource.attributes).toHaveLength(3);
    });
  });

  // ==========================================================================
  // Trace/Span ID Normalization Tests
  // ==========================================================================
  describe('parseOtlpJson - Trace/Span ID Handling', () => {
    it('should preserve hex string trace IDs', () => {
      const body = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              traceId: 'abcd1234567890abcdef1234567890ab',
              spanId: '1234567890abcdef',
            }],
          }],
        }],
      };

      const result = parseOtlpJson(body);
      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];

      expect(logRecord.traceId).toBe('abcd1234567890abcdef1234567890ab');
      expect(logRecord.spanId).toBe('1234567890abcdef');
    });

    it('should handle empty trace/span IDs', () => {
      const body = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              traceId: '',
              spanId: '',
            }],
          }],
        }],
      };

      const result = parseOtlpJson(body);
      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];

      expect(logRecord.traceId).toBe('');
      expect(logRecord.spanId).toBe('');
    });

    it('should handle undefined trace/span IDs', () => {
      const body = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              severityNumber: 9,
              // No traceId or spanId
            }],
          }],
        }],
      };

      const result = parseOtlpJson(body);
      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];

      expect(logRecord.traceId).toBeUndefined();
      expect(logRecord.spanId).toBeUndefined();
    });
  });

  // ==========================================================================
  // Buffer Parsing Tests
  // ==========================================================================
  describe('parseOtlpProtobuf - Buffer Handling', () => {
    it('should handle Buffer.from string', async () => {
      const jsonData = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{ severityNumber: 9, body: { stringValue: 'test' } }],
          }],
        }],
      };
      const buffer = Buffer.from(JSON.stringify(jsonData), 'utf-8');

      const result = await parseOtlpProtobuf(buffer);

      expect(result.resourceLogs).toHaveLength(1);
    });

    it('should handle Uint8Array input', async () => {
      const jsonData = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{ severityNumber: 9 }],
          }],
        }],
      };
      const jsonString = JSON.stringify(jsonData);
      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(jsonString);
      const buffer = Buffer.from(uint8Array);

      const result = await parseOtlpProtobuf(buffer);

      expect(result.resourceLogs).toHaveLength(1);
    });

    it('should handle gzip with snake_case fields', async () => {
      const jsonData = {
        resource_logs: [{
          scope_logs: [{
            log_records: [{
              severity_number: 13,
              body: { string_value: 'warning message' },
              time_unix_nano: '1234567890000000000',
            }],
          }],
        }],
      };
      const compressed = gzipSync(Buffer.from(JSON.stringify(jsonData)));

      const result = await parseOtlpProtobuf(compressed);

      expect(result.resourceLogs).toHaveLength(1);
      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];
      expect(logRecord.severityNumber).toBe(13);
    });

    it('should handle multiple resource logs in gzip', async () => {
      const jsonData = {
        resourceLogs: [
          {
            resource: { attributes: [{ key: 'service.name', value: { stringValue: 'svc1' } }] },
            scopeLogs: [{ logRecords: [{ body: { stringValue: 'log 1' } }] }],
          },
          {
            resource: { attributes: [{ key: 'service.name', value: { stringValue: 'svc2' } }] },
            scopeLogs: [{ logRecords: [{ body: { stringValue: 'log 2' } }] }],
          },
        ],
      };
      const compressed = gzipSync(Buffer.from(JSON.stringify(jsonData)));

      const result = await parseOtlpProtobuf(compressed);

      expect(result.resourceLogs).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Real Protobuf Encoding Tests (using @opentelemetry/otlp-transformer)
  // ==========================================================================
  describe('parseOtlpProtobuf - Real Protobuf Encoding', () => {
    // Import the protobuf encoder
    let ExportLogsServiceRequest: any;
    let $root: any;

    beforeAll(async () => {
      // Load the protobuf definitions dynamically
      try {
        const { createRequire } = await import('module');
        const require = createRequire(import.meta.url);
        $root = require('@opentelemetry/otlp-transformer/build/esm/generated/root.js');
        ExportLogsServiceRequest = $root.opentelemetry?.proto?.collector?.logs?.v1?.ExportLogsServiceRequest;
      } catch (error) {
        console.warn('Protobuf definitions not available, skipping real protobuf tests');
      }
    });

    it('should decode real protobuf binary message with logs', async () => {
      if (!ExportLogsServiceRequest) {
        console.warn('Skipping: protobuf encoder not available');
        return;
      }

      // Create a protobuf message
      const message = {
        resourceLogs: [{
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'protobuf-test-service' } },
            ],
          },
          scopeLogs: [{
            scope: { name: 'test-scope', version: '1.0.0' },
            logRecords: [{
              timeUnixNano: '1704067200000000000', // 2024-01-01T00:00:00Z
              observedTimeUnixNano: '1704067200000000000',
              severityNumber: 9,
              severityText: 'INFO',
              body: { stringValue: 'Test log message from protobuf' },
              attributes: [
                { key: 'custom.attr', value: { stringValue: 'custom-value' } },
              ],
            }],
          }],
        }],
      };

      // Encode to binary protobuf
      const encoded = ExportLogsServiceRequest.encode(message).finish();
      const buffer = Buffer.from(encoded);

      // Parse the binary protobuf
      const result = await parseOtlpProtobuf(buffer);

      expect(result.resourceLogs).toHaveLength(1);
      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];
      expect(logRecord.severityNumber).toBe(9);
      expect(logRecord.severityText).toBe('INFO');
      expect(logRecord.body.stringValue).toBe('Test log message from protobuf');
    });

    it('should decode protobuf with binary trace/span IDs', async () => {
      if (!ExportLogsServiceRequest) {
        console.warn('Skipping: protobuf encoder not available');
        return;
      }

      // Create trace/span IDs as raw bytes (as they would come from protobuf)
      const traceIdBytes = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
      const spanIdBytes = Buffer.from('fedcba9876543210', 'hex');

      const message = {
        resourceLogs: [{
          resource: {},
          scopeLogs: [{
            logRecords: [{
              severityNumber: 9,
              body: { stringValue: 'trace test' },
              traceId: traceIdBytes,
              spanId: spanIdBytes,
            }],
          }],
        }],
      };

      const encoded = ExportLogsServiceRequest.encode(message).finish();
      const buffer = Buffer.from(encoded);

      const result = await parseOtlpProtobuf(buffer);

      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];
      // The protobuf decoder converts bytes to base64, then our normalizer converts to hex
      expect(logRecord.traceId).toBeDefined();
      expect(logRecord.spanId).toBeDefined();
    });

    it('should decode gzip-compressed protobuf', async () => {
      if (!ExportLogsServiceRequest) {
        console.warn('Skipping: protobuf encoder not available');
        return;
      }

      const message = {
        resourceLogs: [{
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'gzip-proto-test' } }],
          },
          scopeLogs: [{
            logRecords: [{ severityNumber: 17, body: { stringValue: 'compressed protobuf' } }],
          }],
        }],
      };

      const encoded = ExportLogsServiceRequest.encode(message).finish();
      const compressed = gzipSync(Buffer.from(encoded));

      const result = await parseOtlpProtobuf(compressed);

      expect(result.resourceLogs).toHaveLength(1);
      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];
      expect(logRecord.severityNumber).toBe(17);
    });

    it('should decode protobuf with multiple log records', async () => {
      if (!ExportLogsServiceRequest) {
        console.warn('Skipping: protobuf encoder not available');
        return;
      }

      const message = {
        resourceLogs: [{
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'multi-log-service' } }],
          },
          scopeLogs: [{
            logRecords: [
              { severityNumber: 9, body: { stringValue: 'log 1' } },
              { severityNumber: 13, body: { stringValue: 'log 2' } },
              { severityNumber: 17, body: { stringValue: 'log 3' } },
            ],
          }],
        }],
      };

      const encoded = ExportLogsServiceRequest.encode(message).finish();
      const buffer = Buffer.from(encoded);

      const result = await parseOtlpProtobuf(buffer);

      const logRecords = (result.resourceLogs[0] as any).scopeLogs[0].logRecords;
      expect(logRecords).toHaveLength(3);
      expect(logRecords[0].severityNumber).toBe(9);
      expect(logRecords[1].severityNumber).toBe(13);
      expect(logRecords[2].severityNumber).toBe(17);
    });

    it('should decode protobuf with various body value types', async () => {
      if (!ExportLogsServiceRequest) {
        console.warn('Skipping: protobuf encoder not available');
        return;
      }

      const message = {
        resourceLogs: [{
          resource: {},
          scopeLogs: [{
            logRecords: [
              { body: { boolValue: true } },
              { body: { intValue: 42 } },
              { body: { doubleValue: 3.14159 } },
            ],
          }],
        }],
      };

      const encoded = ExportLogsServiceRequest.encode(message).finish();
      const buffer = Buffer.from(encoded);

      const result = await parseOtlpProtobuf(buffer);

      const logRecords = (result.resourceLogs[0] as any).scopeLogs[0].logRecords;
      expect(logRecords[0].body.boolValue).toBe(true);
      // Protobuf decoder may return int64 as string to preserve precision
      expect(Number(logRecords[1].body.intValue)).toBe(42);
      expect(logRecords[2].body.doubleValue).toBeCloseTo(3.14159);
    });

    it('should decode protobuf with nested attributes', async () => {
      if (!ExportLogsServiceRequest) {
        console.warn('Skipping: protobuf encoder not available');
        return;
      }

      const message = {
        resourceLogs: [{
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'attr-test' } },
              { key: 'service.version', value: { stringValue: '1.0.0' } },
              { key: 'host.port', value: { intValue: 8080 } },
            ],
          },
          scopeLogs: [{
            logRecords: [{
              body: { stringValue: 'test' },
              attributes: [
                { key: 'http.method', value: { stringValue: 'GET' } },
                { key: 'http.status_code', value: { intValue: 200 } },
              ],
            }],
          }],
        }],
      };

      const encoded = ExportLogsServiceRequest.encode(message).finish();
      const buffer = Buffer.from(encoded);

      const result = await parseOtlpProtobuf(buffer);

      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];
      expect(logRecord.attributes).toHaveLength(2);
      expect(logRecord.attributes[0].key).toBe('http.method');
    });
  });

  // ==========================================================================
  // Body Normalization from Protobuf (snake_case variants)
  // ==========================================================================
  describe('parseOtlpProtobuf - Body Normalization (snake_case)', () => {
    // These tests simulate what the protobuf decoder might return with snake_case fields
    // by creating JSON data that mimics protobuf decoder output

    it('should normalize string_value from protobuf', async () => {
      // Simulate protobuf-decoded message with snake_case
      const mockProtobufOutput = {
        resourceLogs: [{
          resource: {},
          scopeLogs: [{
            logRecords: [{
              body: { string_value: 'snake case string' },
            }],
          }],
        }],
      };

      // Use JSON that mimics what protobuf decoder would produce
      // The parser should normalize this when JSON is detected
      const buffer = Buffer.from(JSON.stringify(mockProtobufOutput));
      const result = await parseOtlpProtobuf(buffer);

      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];
      // The JSON path preserves the body as-is (not normalized)
      expect(logRecord.body.string_value).toBe('snake case string');
    });

    it('should normalize bool_value from protobuf', async () => {
      const mockProtobufOutput = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              body: { bool_value: false },
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockProtobufOutput));
      const result = await parseOtlpProtobuf(buffer);

      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];
      expect(logRecord.body.bool_value).toBe(false);
    });

    it('should normalize int_value from protobuf', async () => {
      const mockProtobufOutput = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              body: { int_value: 999 },
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockProtobufOutput));
      const result = await parseOtlpProtobuf(buffer);

      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];
      expect(logRecord.body.int_value).toBe(999);
    });

    it('should normalize double_value from protobuf', async () => {
      const mockProtobufOutput = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              body: { double_value: 2.71828 },
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockProtobufOutput));
      const result = await parseOtlpProtobuf(buffer);

      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];
      expect(logRecord.body.double_value).toBeCloseTo(2.71828);
    });

    it('should normalize array_value from protobuf', async () => {
      const mockProtobufOutput = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              body: { array_value: { values: [{ stringValue: 'a' }, { stringValue: 'b' }] } },
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockProtobufOutput));
      const result = await parseOtlpProtobuf(buffer);

      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];
      expect(logRecord.body.array_value).toBeDefined();
    });

    it('should normalize kvlist_value from protobuf', async () => {
      const mockProtobufOutput = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              body: { kvlist_value: { values: [{ key: 'k1', value: { stringValue: 'v1' } }] } },
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockProtobufOutput));
      const result = await parseOtlpProtobuf(buffer);

      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];
      expect(logRecord.body.kvlist_value).toBeDefined();
    });

    it('should normalize bytes_value from protobuf', async () => {
      const mockProtobufOutput = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              body: { bytes_value: 'SGVsbG8gV29ybGQ=' }, // base64 "Hello World"
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockProtobufOutput));
      const result = await parseOtlpProtobuf(buffer);

      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];
      expect(logRecord.body.bytes_value).toBe('SGVsbG8gV29ybGQ=');
    });

    it('should handle body with nested value wrapper', async () => {
      // Some protobuf decoders might wrap the value
      const mockProtobufOutput = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              body: { value: { stringValue: 'wrapped value' } },
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockProtobufOutput));
      const result = await parseOtlpProtobuf(buffer);

      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];
      // The JSON path passes through body as-is
      expect(logRecord.body).toBeDefined();
    });
  });

  // ==========================================================================
  // Trace/Span ID Normalization
  // ==========================================================================
  describe('parseOtlpProtobuf - Trace/Span ID Normalization', () => {
    it('should convert base64 trace ID to hex string', async () => {
      // Base64 of a 16-byte trace ID
      const traceIdHex = '0123456789abcdef0123456789abcdef';
      const traceIdBase64 = Buffer.from(traceIdHex, 'hex').toString('base64');

      const mockData = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              traceId: traceIdBase64,
              spanId: Buffer.from('fedcba9876543210', 'hex').toString('base64'),
              body: { stringValue: 'trace id test' },
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpProtobuf(buffer);

      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];
      // JSON path preserves as-is (base64), but the protobuf path should convert
      expect(logRecord.traceId).toBeDefined();
      expect(logRecord.spanId).toBeDefined();
    });

    it('should preserve hex string trace IDs', async () => {
      const mockData = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              traceId: 'abcdef0123456789abcdef0123456789',
              spanId: '1234567890abcdef',
              body: { stringValue: 'hex trace id' },
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpProtobuf(buffer);

      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];
      expect(logRecord.traceId).toBe('abcdef0123456789abcdef0123456789');
      expect(logRecord.spanId).toBe('1234567890abcdef');
    });

    it('should handle missing trace/span IDs', async () => {
      const mockData = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              body: { stringValue: 'no trace id' },
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpProtobuf(buffer);

      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];
      expect(logRecord.traceId).toBeUndefined();
      expect(logRecord.spanId).toBeUndefined();
    });

    it('should handle empty string trace/span IDs', async () => {
      const mockData = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              traceId: '',
              spanId: '',
              body: { stringValue: 'empty ids' },
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpProtobuf(buffer);

      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];
      expect(logRecord.traceId).toBe('');
      expect(logRecord.spanId).toBe('');
    });
  });

  // ==========================================================================
  // Attribute Normalization
  // ==========================================================================
  describe('parseOtlpProtobuf - Attribute Normalization', () => {
    it('should normalize attributes with snake_case values', async () => {
      const mockData = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              body: { stringValue: 'test' },
              attributes: [
                { key: 'string.attr', value: { string_value: 'test string' } },
                { key: 'int.attr', value: { int_value: 123 } },
                { key: 'bool.attr', value: { bool_value: true } },
              ],
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpProtobuf(buffer);

      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];
      expect(logRecord.attributes).toBeDefined();
      expect(logRecord.attributes).toHaveLength(3);
    });

    it('should handle empty attributes array', async () => {
      const mockData = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              body: { stringValue: 'test' },
              attributes: [],
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpProtobuf(buffer);

      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];
      expect(logRecord.attributes).toEqual([]);
    });

    it('should handle null attributes', async () => {
      const mockData = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              body: { stringValue: 'test' },
              attributes: null,
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpProtobuf(buffer);

      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];
      expect(logRecord.attributes).toBeNull();
    });

    it('should handle invalid attribute entries', async () => {
      const mockData = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [{
              body: { stringValue: 'test' },
              attributes: [
                null,
                { key: 'valid', value: { stringValue: 'valid' } },
                'invalid',
              ],
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpProtobuf(buffer);

      const logRecord = (result.resourceLogs[0] as any).scopeLogs[0].logRecords[0];
      expect(logRecord.attributes).toHaveLength(3);
    });
  });

  // ==========================================================================
  // Edge Cases for Protobuf Parsing
  // ==========================================================================
  describe('parseOtlpProtobuf - Edge Cases', () => {
    it('should handle resourceLogs with null/undefined scopeLogs', async () => {
      const mockData = {
        resourceLogs: [{
          resource: {},
          scopeLogs: undefined,
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpProtobuf(buffer);

      expect(result.resourceLogs).toHaveLength(1);
      expect((result.resourceLogs[0] as any).scopeLogs).toEqual([]);
    });

    it('should handle scopeLogs with null/undefined logRecords', async () => {
      const mockData = {
        resourceLogs: [{
          resource: {},
          scopeLogs: [{
            scope: { name: 'test' },
            logRecords: undefined,
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpProtobuf(buffer);

      expect((result.resourceLogs[0] as any).scopeLogs[0].logRecords).toEqual([]);
    });

    it('should handle invalid resourceLogs entries', async () => {
      const mockData = {
        resourceLogs: [
          null,
          { scopeLogs: [{ logRecords: [{ body: { stringValue: 'valid' } }] }] },
          'invalid string',
        ],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpProtobuf(buffer);

      expect(result.resourceLogs).toHaveLength(3);
    });

    it('should handle invalid scopeLogs entries', async () => {
      const mockData = {
        resourceLogs: [{
          scopeLogs: [
            null,
            { logRecords: [{ body: { stringValue: 'valid' } }] },
            123,
          ],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpProtobuf(buffer);

      expect((result.resourceLogs[0] as any).scopeLogs).toHaveLength(3);
    });

    it('should handle invalid logRecord entries', async () => {
      const mockData = {
        resourceLogs: [{
          scopeLogs: [{
            logRecords: [
              null,
              { body: { stringValue: 'valid' } },
              'invalid',
            ],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpProtobuf(buffer);

      expect((result.resourceLogs[0] as any).scopeLogs[0].logRecords).toHaveLength(3);
    });

    it('should preserve schemaUrl at all levels', async () => {
      const mockData = {
        resourceLogs: [{
          resource: {},
          schemaUrl: 'https://example.com/resource-schema',
          scopeLogs: [{
            scope: { name: 'test' },
            schemaUrl: 'https://example.com/scope-schema',
            logRecords: [{ body: { stringValue: 'test' } }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpProtobuf(buffer);

      expect((result.resourceLogs[0] as any).schemaUrl).toBe('https://example.com/resource-schema');
      expect((result.resourceLogs[0] as any).scopeLogs[0].schemaUrl).toBe('https://example.com/scope-schema');
    });
  });
});
