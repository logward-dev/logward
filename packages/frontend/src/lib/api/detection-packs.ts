import { getApiUrl } from '$lib/config';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';
export type PackCategory = 'reliability' | 'security' | 'database' | 'business';

export interface DetectionPackRule {
  id: string;
  name: string;
  description: string;
  service: string | null;
  level: LogLevel[];
  threshold: number;
  timeWindow: number;
}

export interface DetectionPack {
  id: string;
  name: string;
  description: string;
  category: PackCategory;
  icon: string;
  rules: DetectionPackRule[];
}

export interface ThresholdOverride {
  threshold?: number;
  timeWindow?: number;
}

export type ThresholdMap = Record<string, ThresholdOverride>;

export interface DetectionPackWithStatus extends DetectionPack {
  enabled: boolean;
  activatedAt: string | null;
  customThresholds: ThresholdMap | null;
  generatedRulesCount: number;
}

export interface EnablePackInput {
  organizationId: string;
  customThresholds?: ThresholdMap;
  emailRecipients?: string[];
  webhookUrl?: string | null;
}

export interface UpdateThresholdsInput {
  organizationId: string;
  customThresholds: ThresholdMap;
}

export class DetectionPacksAPI {
  private getToken: () => string | null;

  constructor(getToken: () => string | null) {
    this.getToken = getToken;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const token = this.getToken();

    const response = await fetch(`${getApiUrl()}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || error.message || `HTTP ${response.status}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  /**
   * List all available detection packs with status for organization
   */
  async listPacks(organizationId: string): Promise<{ packs: DetectionPackWithStatus[] }> {
    return this.request(`/api/v1/detection-packs?organizationId=${organizationId}`);
  }

  /**
   * Get single pack details with status
   */
  async getPack(
    packId: string,
    organizationId: string
  ): Promise<{ pack: DetectionPackWithStatus }> {
    return this.request(`/api/v1/detection-packs/${packId}?organizationId=${organizationId}`);
  }

  /**
   * Enable a detection pack
   */
  async enablePack(
    packId: string,
    input: EnablePackInput
  ): Promise<{ pack: DetectionPackWithStatus }> {
    return this.request(`/api/v1/detection-packs/${packId}/enable`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * Disable a detection pack
   */
  async disablePack(packId: string, organizationId: string): Promise<void> {
    return this.request(
      `/api/v1/detection-packs/${packId}/disable?organizationId=${organizationId}`,
      { method: 'POST' }
    );
  }

  /**
   * Update thresholds for an enabled pack
   */
  async updateThresholds(
    packId: string,
    input: UpdateThresholdsInput
  ): Promise<{ pack: DetectionPackWithStatus }> {
    return this.request(`/api/v1/detection-packs/${packId}/thresholds`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }
}

// Singleton instance
export const detectionPacksAPI = new DetectionPacksAPI(() => {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('logtide_auth');
      if (stored) {
        const data = JSON.parse(stored);
        return data.token;
      }
    } catch (e) {
      console.error('Failed to get token:', e);
    }
  }
  return null;
});
