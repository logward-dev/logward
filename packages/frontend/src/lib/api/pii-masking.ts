import { getApiBaseUrl } from '$lib/config';
import { getAuthToken } from '$lib/utils/auth';

export type PiiAction = 'mask' | 'redact' | 'hash';
export type PiiPatternType = 'builtin' | 'field_name' | 'custom';

export interface PiiMaskingRule {
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
  createdAt: string;
  updatedAt: string;
}

export interface CreatePiiRuleInput {
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

export interface UpdatePiiRuleInput {
  displayName?: string;
  description?: string;
  regexPattern?: string;
  fieldNames?: string[];
  action?: PiiAction;
  enabled?: boolean;
  priority?: number;
}

export interface TestMaskingResult {
  message?: string;
  metadata?: Record<string, unknown>;
  maskedFields: string[];
}

class PiiMaskingAPI {
  private async fetch<T>(url: string, options: RequestInit = {}): Promise<T> {
    const token = getAuthToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async listRules(projectId?: string): Promise<PiiMaskingRule[]> {
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    const qs = params.toString();
    const url = `${getApiBaseUrl()}/pii-masking/rules${qs ? `?${qs}` : ''}`;
    const response = await this.fetch<{ success: boolean; data: PiiMaskingRule[] }>(url);
    return response.data;
  }

  async createRule(input: CreatePiiRuleInput): Promise<PiiMaskingRule> {
    const url = `${getApiBaseUrl()}/pii-masking/rules`;
    const response = await this.fetch<{ success: boolean; data: PiiMaskingRule }>(url, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return response.data;
  }

  async updateRule(id: string, input: UpdatePiiRuleInput): Promise<PiiMaskingRule> {
    const url = `${getApiBaseUrl()}/pii-masking/rules/${id}`;
    const response = await this.fetch<{ success: boolean; data: PiiMaskingRule }>(url, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    return response.data;
  }

  async deleteRule(id: string): Promise<void> {
    const url = `${getApiBaseUrl()}/pii-masking/rules/${id}`;
    await this.fetch<{ success: boolean }>(url, {
      method: 'DELETE',
    });
  }

  async testMasking(
    message?: string,
    metadata?: Record<string, unknown>,
    projectId?: string
  ): Promise<TestMaskingResult> {
    const url = `${getApiBaseUrl()}/pii-masking/test`;
    const response = await this.fetch<{ success: boolean; data: TestMaskingResult }>(url, {
      method: 'POST',
      body: JSON.stringify({ message, metadata, projectId }),
    });
    return response.data;
  }
}

export const piiMaskingAPI = new PiiMaskingAPI();
