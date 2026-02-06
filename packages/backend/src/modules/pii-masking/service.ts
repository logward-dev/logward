/**
 * PII Masking Service
 *
 * Provides:
 * - CRUD for masking rules (org-level + project-level)
 * - In-memory cached rule compilation
 * - Synchronous masking of log batches (message + metadata)
 * - Three masking strategies: mask, redact, hash
 */

import crypto from 'crypto';
import { db } from '../../database/index.js';
import type { PiiAction, PiiPatternType } from '../../database/types.js';
import type { LogInput } from '@logtide/shared';
import {
  BUILTIN_CONTENT_RULES,
  BUILTIN_FIELD_RULES,
} from './built-in-rules.js';
import isSafeRegex from 'safe-regex2';

// ============================================================================
// Types
// ============================================================================

export interface CompiledContentRule {
  name: string;
  regex: RegExp;
  action: PiiAction;
  redactLabel: string;
  maskFormatter: (match: string) => string;
}

export interface CompiledFieldRule {
  name: string;
  fieldNamesLower: Set<string>;
  action: PiiAction;
  redactLabel: string;
}

interface CompiledRuleSet {
  contentRules: CompiledContentRule[];
  fieldRules: CompiledFieldRule[];
  orgSalt: string | null;
}

interface CacheEntry {
  ruleSet: CompiledRuleSet;
  expiresAt: number;
}

export interface PiiRuleInput {
  name: string;
  displayName: string;
  description?: string;
  patternType: PiiPatternType;
  regexPattern?: string;
  fieldNames?: string[];
  action: PiiAction;
  enabled?: boolean;
  priority?: number;
  projectId?: string;
}

export interface PiiRuleUpdate {
  displayName?: string;
  description?: string;
  regexPattern?: string;
  fieldNames?: string[];
  action?: PiiAction;
  enabled?: boolean;
  priority?: number;
}

export interface PiiRuleResponse {
  id: string;
  organizationId: string;
  projectId: string | null;
  name: string;
  displayName: string;
  description: string | null;
  patternType: PiiPatternType;
  regexPattern: string | null;
  fieldNames: string[];
  action: PiiAction;
  enabled: boolean;
  priority: number;
  isBuiltIn: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestMaskingInput {
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface TestMaskingResult {
  message?: string;
  metadata?: Record<string, unknown>;
  maskedFields: string[];
}

// ============================================================================
// Service
// ============================================================================

export class PiiMaskingService {
  private cache = new Map<string, CacheEntry>();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  async getRulesForOrg(
    organizationId: string,
    projectId?: string
  ): Promise<PiiRuleResponse[]> {
    // Get DB rules
    const dbRules = await db
      .selectFrom('pii_masking_rules')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where((eb) =>
        projectId
          ? eb.or([eb('project_id', 'is', null), eb('project_id', '=', projectId)])
          : eb('project_id', 'is', null)
      )
      .orderBy('priority', 'asc')
      .execute();

    const dbRuleNames = new Set(dbRules.map((r) => r.name));

    const results: PiiRuleResponse[] = dbRules.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      projectId: r.project_id,
      name: r.name,
      displayName: r.display_name,
      description: r.description,
      patternType: r.pattern_type,
      regexPattern: r.regex_pattern,
      fieldNames: r.field_names || [],
      action: r.action,
      enabled: r.enabled,
      priority: r.priority,
      isBuiltIn: r.pattern_type === 'builtin' || r.pattern_type === 'field_name',
      createdAt: r.created_at as unknown as Date,
      updatedAt: r.updated_at as unknown as Date,
    }));

    // Add built-in content rules not overridden in DB
    for (const rule of BUILTIN_CONTENT_RULES) {
      if (!dbRuleNames.has(rule.name)) {
        results.push({
          id: `builtin:${rule.name}`,
          organizationId,
          projectId: null,
          name: rule.name,
          displayName: rule.displayName,
          description: rule.description,
          patternType: 'builtin',
          regexPattern: rule.pattern.source,
          fieldNames: [],
          action: rule.defaultAction,
          enabled: false, // built-ins are disabled by default until user enables
          priority: 50,
          isBuiltIn: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    // Add built-in field rules not overridden
    for (const rule of BUILTIN_FIELD_RULES) {
      if (!dbRuleNames.has(rule.name)) {
        results.push({
          id: `builtin:${rule.name}`,
          organizationId,
          projectId: null,
          name: rule.name,
          displayName: rule.displayName,
          description: rule.description,
          patternType: 'field_name',
          regexPattern: null,
          fieldNames: rule.fieldNames,
          action: rule.defaultAction,
          enabled: false,
          priority: 50,
          isBuiltIn: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    return results;
  }

  async createRule(
    organizationId: string,
    input: PiiRuleInput
  ): Promise<PiiRuleResponse> {
    // Validate regex only for custom rules (builtin patterns are already vetted)
    if (input.regexPattern && input.patternType === 'custom') {
      const validation = this.validateRegex(input.regexPattern);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
    }

    const row = await db
      .insertInto('pii_masking_rules')
      .values({
        organization_id: organizationId,
        project_id: input.projectId || null,
        name: input.name,
        display_name: input.displayName,
        description: input.description || null,
        pattern_type: input.patternType,
        regex_pattern: input.regexPattern || null,
        field_names: input.fieldNames || [],
        action: input.action,
        enabled: input.enabled ?? true,
        priority: input.priority ?? 50,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    this.invalidateCache(organizationId);

    return {
      id: row.id,
      organizationId: row.organization_id,
      projectId: row.project_id,
      name: row.name,
      displayName: row.display_name,
      description: row.description,
      patternType: row.pattern_type,
      regexPattern: row.regex_pattern,
      fieldNames: row.field_names || [],
      action: row.action,
      enabled: row.enabled,
      priority: row.priority,
      isBuiltIn: false,
      createdAt: row.created_at as unknown as Date,
      updatedAt: row.updated_at as unknown as Date,
    };
  }

  async updateRule(
    ruleId: string,
    organizationId: string,
    input: PiiRuleUpdate
  ): Promise<PiiRuleResponse> {
    // Validate regex only for custom rules (builtin patterns are already vetted)
    if (input.regexPattern) {
      const existing = await db
        .selectFrom('pii_masking_rules')
        .select(['pattern_type'])
        .where('id', '=', ruleId)
        .executeTakeFirst();

      if (existing?.pattern_type === 'custom') {
        const validation = this.validateRegex(input.regexPattern);
        if (!validation.valid) {
          throw new Error(validation.error);
        }
      }
    }

    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (input.displayName !== undefined) updates.display_name = input.displayName;
    if (input.description !== undefined) updates.description = input.description || null;
    if (input.regexPattern !== undefined) updates.regex_pattern = input.regexPattern;
    if (input.fieldNames !== undefined) updates.field_names = input.fieldNames;
    if (input.action !== undefined) updates.action = input.action;
    if (input.enabled !== undefined) updates.enabled = input.enabled;
    if (input.priority !== undefined) updates.priority = input.priority;

    const row = await db
      .updateTable('pii_masking_rules')
      .set(updates)
      .where('id', '=', ruleId)
      .where('organization_id', '=', organizationId)
      .returningAll()
      .executeTakeFirstOrThrow();

    this.invalidateCache(organizationId);

    return {
      id: row.id,
      organizationId: row.organization_id,
      projectId: row.project_id,
      name: row.name,
      displayName: row.display_name,
      description: row.description,
      patternType: row.pattern_type,
      regexPattern: row.regex_pattern,
      fieldNames: row.field_names || [],
      action: row.action,
      enabled: row.enabled,
      priority: row.priority,
      isBuiltIn: false,
      createdAt: row.created_at as unknown as Date,
      updatedAt: row.updated_at as unknown as Date,
    };
  }

  async deleteRule(ruleId: string, organizationId: string): Promise<void> {
    const existing = await db
      .selectFrom('pii_masking_rules')
      .select(['id', 'pattern_type'])
      .where('id', '=', ruleId)
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();

    if (!existing) {
      throw new Error('Rule not found');
    }

    await db
      .deleteFrom('pii_masking_rules')
      .where('id', '=', ruleId)
      .where('organization_id', '=', organizationId)
      .execute();

    this.invalidateCache(organizationId);
  }

  // -------------------------------------------------------------------------
  // Masking Engine (hot path)
  // -------------------------------------------------------------------------

  /**
   * Mask a batch of logs in-place.
   * Call this BEFORE creating dbLogs so all downstream consumers get masked data.
   */
  async maskLogBatch(
    logs: LogInput[],
    organizationId: string,
    projectId: string
  ): Promise<void> {
    const ruleSet = await this.getCompiledRules(organizationId, projectId);

    // Fast path: no enabled rules
    if (ruleSet.contentRules.length === 0 && ruleSet.fieldRules.length === 0) {
      return;
    }

    for (const log of logs) {
      // Mask message with content rules
      if (log.message) {
        log.message = this.maskText(log.message, ruleSet);
      }

      // Mask metadata recursively (field name rules + content rules)
      if (log.metadata && typeof log.metadata === 'object') {
        this.maskObject(log.metadata as Record<string, unknown>, ruleSet, '', false);
      }
    }
  }

  /**
   * Test masking on sample data (for the UI test panel).
   */
  async testMasking(
    organizationId: string,
    projectId: string | undefined,
    input: TestMaskingInput
  ): Promise<TestMaskingResult> {
    const ruleSet = await this.getCompiledRules(organizationId, projectId || null);
    const maskedFields: string[] = [];

    let maskedMessage = input.message;
    if (maskedMessage) {
      const result = this.maskText(maskedMessage, ruleSet);
      if (result !== maskedMessage) {
        maskedFields.push('message');
      }
      maskedMessage = result;
    }

    let maskedMetadata: Record<string, unknown> | undefined = input.metadata;
    if (maskedMetadata && typeof maskedMetadata === 'object') {
      const cloned: Record<string, unknown> = JSON.parse(JSON.stringify(maskedMetadata));
      const changedKeys = this.maskObject(cloned, ruleSet);
      maskedFields.push(...changedKeys);
      maskedMetadata = cloned;
    }

    return {
      message: maskedMessage,
      metadata: maskedMetadata,
      maskedFields,
    };
  }

  // -------------------------------------------------------------------------
  // Rule compilation & caching
  // -------------------------------------------------------------------------

  private async getCompiledRules(
    organizationId: string,
    projectId: string | null
  ): Promise<CompiledRuleSet> {
    const cacheKey = `${organizationId}:${projectId || ''}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.ruleSet;
    }

    const ruleSet = await this.compileRules(organizationId, projectId);

    this.cache.set(cacheKey, {
      ruleSet,
      expiresAt: Date.now() + this.cacheTTL,
    });

    return ruleSet;
  }

  private async compileRules(
    organizationId: string,
    projectId: string | null
  ): Promise<CompiledRuleSet> {
    // Load DB rules (org-wide + project-specific)
    const dbRules = await db
      .selectFrom('pii_masking_rules')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('enabled', '=', true)
      .where((eb) =>
        projectId
          ? eb.or([eb('project_id', 'is', null), eb('project_id', '=', projectId)])
          : eb('project_id', 'is', null)
      )
      .orderBy('priority', 'asc')
      .execute();

    // Build name -> rule map (project rules override org rules with same name)
    const ruleMap = new Map<string, (typeof dbRules)[number]>();
    // First add org-wide rules
    for (const r of dbRules) {
      if (r.project_id === null) {
        ruleMap.set(r.name, r);
      }
    }
    // Then project rules override
    for (const r of dbRules) {
      if (r.project_id !== null) {
        ruleMap.set(r.name, r);
      }
    }

    const contentRules: CompiledContentRule[] = [];
    const fieldRules: CompiledFieldRule[] = [];

    // Compile built-in content rules that are enabled
    for (const builtin of BUILTIN_CONTENT_RULES) {
      const dbRule = ruleMap.get(builtin.name);
      if (!dbRule) continue; // not enabled

      if (!dbRule.enabled) continue;

      contentRules.push({
        name: builtin.name,
        regex: new RegExp(builtin.pattern.source, builtin.pattern.flags),
        action: dbRule.action || builtin.defaultAction,
        redactLabel: builtin.redactLabel,
        maskFormatter: builtin.maskFormatter,
      });
    }

    // Compile built-in field rules that are enabled
    for (const builtin of BUILTIN_FIELD_RULES) {
      const dbRule = ruleMap.get(builtin.name);
      if (!dbRule) continue;

      if (!dbRule.enabled) continue;

      const fieldNames = dbRule.field_names?.length > 0
        ? dbRule.field_names
        : builtin.fieldNames;

      fieldRules.push({
        name: builtin.name,
        fieldNamesLower: new Set(fieldNames.map((f) => f.toLowerCase())),
        action: dbRule.action || builtin.defaultAction,
        redactLabel: builtin.redactLabel,
      });
    }

    // Compile custom content rules
    for (const [name, dbRule] of ruleMap) {
      if (dbRule.pattern_type !== 'custom') continue;
      if (!dbRule.regex_pattern) continue;

      try {
        const regex = new RegExp(dbRule.regex_pattern, 'gi');
        contentRules.push({
          name,
          regex,
          action: dbRule.action,
          redactLabel: `[REDACTED_${name.toUpperCase()}]`,
          maskFormatter: () => `[REDACTED_${name.toUpperCase()}]`,
        });
      } catch {
        console.warn(`[PiiMasking] Invalid regex for custom rule "${name}", skipping`);
      }
    }

    // Compile custom field-name rules
    for (const [name, dbRule] of ruleMap) {
      if (dbRule.pattern_type !== 'field_name') continue;
      // Skip built-in field rules (already handled above)
      if (BUILTIN_FIELD_RULES.some((b) => b.name === name)) continue;
      if (!dbRule.field_names || dbRule.field_names.length === 0) continue;

      fieldRules.push({
        name,
        fieldNamesLower: new Set(dbRule.field_names.map((f) => f.toLowerCase())),
        action: dbRule.action,
        redactLabel: `[REDACTED_${name.toUpperCase()}]`,
      });
    }

    // Load org salt for hash action
    let orgSalt: string | null = null;
    const needsHash =
      contentRules.some((r) => r.action === 'hash') ||
      fieldRules.some((r) => r.action === 'hash');

    if (needsHash) {
      orgSalt = await this.getOrCreateSalt(organizationId);
    }

    return { contentRules, fieldRules, orgSalt };
  }

  private async getOrCreateSalt(organizationId: string): Promise<string> {
    const existing = await db
      .selectFrom('organization_pii_salts')
      .select(['salt'])
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();

    if (existing) return existing.salt;

    const salt = crypto.randomBytes(32).toString('hex');
    try {
      await db
        .insertInto('organization_pii_salts')
        .values({ organization_id: organizationId, salt })
        .execute();
    } catch {
      // race condition — another worker inserted first
      const retry = await db
        .selectFrom('organization_pii_salts')
        .select(['salt'])
        .where('organization_id', '=', organizationId)
        .executeTakeFirst();
      if (retry) return retry.salt;
    }

    return salt;
  }

  // -------------------------------------------------------------------------
  // Masking helpers
  // -------------------------------------------------------------------------

  private maskText(text: string, ruleSet: CompiledRuleSet): string {
    // Early exit: very short strings or pure alphanumeric won't contain PII
    if (text.length < 6 || /^[a-zA-Z0-9 _]+$/.test(text)) {
      return text;
    }

    let result = text;
    for (const rule of ruleSet.contentRules) {
      // Reuse compiled regex — just reset lastIndex for global regexes
      rule.regex.lastIndex = 0;
      result = result.replace(rule.regex, (match) => {
        return this.applyAction(match, rule.action, rule.redactLabel, rule.maskFormatter, ruleSet.orgSalt);
      });
    }
    return result;
  }

  /**
   * Recursively mask object values.
   * @param trackPaths When true, builds and returns an array of masked key paths (for test UI).
   *                   When false (ingestion hot path), skips all path/array allocations.
   */
  private maskObject(
    obj: Record<string, unknown>,
    ruleSet: CompiledRuleSet,
    prefix = '',
    trackPaths = true
  ): string[] {
    const maskedKeys: string[] | null = trackPaths ? [] : null;
    const keys = Object.keys(obj);

    for (let k = 0; k < keys.length; k++) {
      const key = keys[k];
      const value = obj[key];

      // Check field name rules
      const keyLower = key.toLowerCase();
      let fieldMasked = false;
      for (const rule of ruleSet.fieldRules) {
        if (rule.fieldNamesLower.has(keyLower) && value !== null && value !== undefined) {
          if (typeof value === 'string') {
            obj[key] = this.applyAction(value, rule.action, rule.redactLabel, () => rule.redactLabel, ruleSet.orgSalt);
          } else {
            obj[key] = rule.redactLabel;
          }
          if (maskedKeys) maskedKeys.push(prefix ? `${prefix}.${key}` : key);
          fieldMasked = true;
          break;
        }
      }

      if (fieldMasked) continue;

      // Recurse into nested objects
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nested = this.maskObject(
          value as Record<string, unknown>,
          ruleSet,
          trackPaths ? (prefix ? `${prefix}.${key}` : key) : '',
          trackPaths
        );
        if (maskedKeys) maskedKeys.push(...nested);
        continue;
      }

      // Apply content regex rules to string values
      if (typeof value === 'string') {
        const masked = this.maskText(value, ruleSet);
        if (masked !== value) {
          obj[key] = masked;
          if (maskedKeys) maskedKeys.push(prefix ? `${prefix}.${key}` : key);
        }
      }

      // Handle arrays
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          if (typeof item === 'string') {
            const masked = this.maskText(item, ruleSet);
            if (masked !== item) {
              value[i] = masked;
              if (maskedKeys) maskedKeys.push(`${prefix ? `${prefix}.${key}` : key}[${i}]`);
            }
          } else if (item && typeof item === 'object') {
            const nested = this.maskObject(
              item as Record<string, unknown>,
              ruleSet,
              trackPaths ? `${prefix ? `${prefix}.${key}` : key}[${i}]` : '',
              trackPaths
            );
            if (maskedKeys) maskedKeys.push(...nested);
          }
        }
      }
    }

    return maskedKeys || [];
  }

  private applyAction(
    value: string,
    action: PiiAction,
    redactLabel: string,
    maskFormatter: (match: string) => string,
    orgSalt: string | null
  ): string {
    switch (action) {
      case 'redact':
        return redactLabel;
      case 'mask':
        return maskFormatter(value);
      case 'hash': {
        const salt = orgSalt || 'default';
        const hash = crypto
          .createHash('sha256')
          .update(salt + value)
          .digest('hex')
          .slice(0, 16);
        return `[HASH:${hash}]`;
      }
      default:
        return redactLabel;
    }
  }

  // -------------------------------------------------------------------------
  // Regex validation (ReDoS protection)
  // -------------------------------------------------------------------------

  validateRegex(pattern: string): { valid: true } | { valid: false; error: string } {
    if (pattern.length > 500) {
      return { valid: false, error: 'Pattern too long (max 500 characters)' };
    }

    if (/\(\?[=!<]/.test(pattern)) {
      return { valid: false, error: 'Lookahead/lookbehind assertions are not allowed' };
    }

    const quantifierMatch = pattern.match(/\{(\d+)(?:,(\d*))?\}/g);
    if (quantifierMatch) {
      for (const q of quantifierMatch) {
        const nums = q.match(/\{(\d+)(?:,(\d*))?\}/);
        if (nums) {
          const min = parseInt(nums[1], 10);
          // {n,} (unbounded upper) is safe — equivalent to + with a minimum
          const hasComma = nums[2] !== undefined;
          const max = hasComma ? (nums[2] === '' ? min : parseInt(nums[2], 10)) : min;
          if (min > 100 || max > 100) {
            return { valid: false, error: 'Quantifier range too large (max 100)' };
          }
        }
      }
    }

    if (!isSafeRegex(pattern)) {
      return { valid: false, error: 'Regex pattern is vulnerable to ReDoS attacks' };
    }

    try {
      new RegExp(pattern, 'gi');
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid regex syntax' };
    }
  }

  // -------------------------------------------------------------------------
  // Cache management
  // -------------------------------------------------------------------------

  invalidateCache(organizationId: string): void {
    // Invalidate all entries for this org (any projectId)
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${organizationId}:`)) {
        this.cache.delete(key);
      }
    }
  }
}

export const piiMaskingService = new PiiMaskingService();
