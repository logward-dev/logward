/**
 * Built-in PII Detection Patterns
 *
 * Phase 1: Content patterns (regex-based detection in message/metadata values)
 * Phase 2: Field name patterns (detect sensitive keys in metadata)
 */

import type { PiiAction } from '../../database/types.js';

export interface BuiltInContentRule {
  name: string;
  displayName: string;
  description: string;
  pattern: RegExp;
  defaultAction: PiiAction;
  redactLabel: string;
  maskFormatter: (match: string) => string;
}

export interface BuiltInFieldRule {
  name: string;
  displayName: string;
  description: string;
  fieldNames: string[];
  defaultAction: PiiAction;
  redactLabel: string;
}

// Phase 1: Content regex patterns
export const BUILTIN_CONTENT_RULES: BuiltInContentRule[] = [
  {
    name: 'email',
    displayName: 'Email Address',
    description: 'Detects email addresses (user@domain.tld)',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    defaultAction: 'mask',
    redactLabel: '[REDACTED_EMAIL]',
    maskFormatter: (match: string) => {
      const [local, domain] = match.split('@');
      if (!domain) return '[REDACTED_EMAIL]';
      return `${local[0]}***@${domain}`;
    },
  },
  {
    name: 'credit_card',
    displayName: 'Credit Card Number',
    description: 'Detects credit card numbers with separators (4111-1111-1111-1111) or known prefixes (Visa/MC/Amex/Discover)',
    // Matches 4 groups of 4 digits separated by dashes/spaces, or known issuer prefixes followed by 12-15 digits
    pattern: /\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b|\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))\d{8,12}\b/g,
    defaultAction: 'redact',
    redactLabel: '[REDACTED_CC]',
    maskFormatter: (match: string) => {
      const digits = match.replace(/[\s-]/g, '');
      return `****-****-****-${digits.slice(-4)}`;
    },
  },
  {
    name: 'phone_us',
    displayName: 'Phone Number (US)',
    description: 'Detects US phone numbers in common formats',
    pattern: /(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    defaultAction: 'mask',
    redactLabel: '[REDACTED_PHONE]',
    maskFormatter: (match: string) => {
      const digits = match.replace(/\D/g, '');
      return `***-***-${digits.slice(-4)}`;
    },
  },
  {
    name: 'ssn',
    displayName: 'Social Security Number',
    description: 'Detects US SSN patterns (XXX-XX-XXXX)',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    defaultAction: 'redact',
    redactLabel: '[REDACTED_SSN]',
    maskFormatter: (match: string) => {
      return `***-**-${match.slice(-4)}`;
    },
  },
  {
    name: 'ip_address',
    displayName: 'IP Address (v4)',
    description: 'Detects IPv4 addresses',
    pattern: /\b(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    defaultAction: 'mask',
    redactLabel: '[REDACTED_IP]',
    maskFormatter: (match: string) => {
      const parts = match.split('.');
      return `${parts[0]}.${parts[1]}.***.***`;
    },
  },
  {
    name: 'api_key',
    displayName: 'API Key / Secret',
    description: 'Detects common API key patterns (long hex/base64 strings preceded by key-like labels)',
    pattern: /(?:api[_-]?key|api[_-]?secret|access[_-]?token|secret[_-]?key|auth[_-]?token)[\s:=]+["']?([A-Za-z0-9+/=_-]{20,})["']?/gi,
    defaultAction: 'redact',
    redactLabel: '[REDACTED_KEY]',
    maskFormatter: () => {
      return '[REDACTED_KEY]';
    },
  },
];

// Phase 2: Sensitive field name patterns
export const BUILTIN_FIELD_RULES: BuiltInFieldRule[] = [
  {
    name: 'sensitive_fields',
    displayName: 'Sensitive Field Names',
    description: 'Masks values of fields with sensitive names (password, token, secret, etc.)',
    fieldNames: [
      'password',
      'passwd',
      'pass',
      'secret',
      'token',
      'access_token',
      'accessToken',
      'refresh_token',
      'refreshToken',
      'api_key',
      'apiKey',
      'api_secret',
      'apiSecret',
      'private_key',
      'privateKey',
      'ssn',
      'social_security',
      'credit_card',
      'creditCard',
      'card_number',
      'cardNumber',
      'cvv',
      'cvc',
      'authorization',
    ],
    defaultAction: 'redact',
    redactLabel: '[REDACTED]',
  },
];
