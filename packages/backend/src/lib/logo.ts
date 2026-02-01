/**
 * Logo module for email templates
 *
 * Exports the LogTide logo as a base64 data URI for embedding in emails.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let logoBase64: string | null = null;

export function getLogoDataUri(): string {
  if (logoBase64) {
    return logoBase64;
  }

  try {
    const logoPath = join(__dirname, 'logo-base64.txt');
    const base64Content = readFileSync(logoPath, 'utf-8').trim();
    logoBase64 = `data:image/png;base64,${base64Content}`;
    return logoBase64;
  } catch (error) {
    console.warn('[Logo] Could not load logo file, using fallback');
    // Return a simple 1x1 transparent pixel as fallback
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  }
}
