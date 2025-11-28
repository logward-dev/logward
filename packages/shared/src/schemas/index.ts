import { z } from 'zod';

export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error', 'critical']);

export const logSchema = z.object({
  time: z.string().datetime().or(z.date()),
  service: z.string().min(1).max(100),
  level: logLevelSchema,
  message: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  trace_id: z.string().uuid().optional(),
  span_id: z.string().regex(/^[a-f0-9]{16}$/i).optional(),
});

export const ingestRequestSchema = z.object({
  logs: z.array(logSchema).min(1).max(1000),
});

export const alertRuleSchema = z.object({
  name: z.string().min(1).max(200),
  enabled: z.boolean().default(true),
  service: z.string().max(100).optional(),
  level: z.array(logLevelSchema),
  threshold: z.number().int().positive(),
  time_window: z.number().int().positive(),
  email_recipients: z.array(z.string().email()),
  webhook_url: z.string().url().optional(),
});

export type LogLevel = z.infer<typeof logLevelSchema>;
export type LogInput = z.infer<typeof logSchema>;
export type IngestRequest = z.infer<typeof ingestRequestSchema>;
export type AlertRuleInput = z.infer<typeof alertRuleSchema>;
