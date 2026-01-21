export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export type PackCategory = 'reliability' | 'security' | 'database' | 'business';

export interface DetectionPackRule {
  id: string;
  name: string;
  description: string;
  service: string | null; // null = all services
  level: LogLevel[];
  threshold: number;
  timeWindow: number; // minutes
}

export interface DetectionPack {
  id: string;
  name: string;
  description: string;
  category: PackCategory;
  icon: string; // lucide icon name
  rules: DetectionPackRule[];
}

export interface ThresholdOverride {
  threshold?: number;
  timeWindow?: number;
}

export type ThresholdMap = Record<string, ThresholdOverride>;

export interface PackActivation {
  id: string;
  organizationId: string;
  packId: string;
  enabled: boolean;
  customThresholds: ThresholdMap | null;
  activatedAt: Date;
  updatedAt: Date;
}

export interface DetectionPackWithStatus extends DetectionPack {
  enabled: boolean;
  activatedAt: string | null; // ISO string for JSON serialization
  customThresholds: ThresholdMap | null;
  generatedRulesCount: number;
}
