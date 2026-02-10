import { browser } from '$app/environment';

export interface PlatformInfo {
  isMac: boolean;
  modKey: 'meta' | 'ctrl';
  modSymbol: string; // '⌘' or 'Ctrl'
}

let _platform: PlatformInfo | null = null;

export function getPlatform(): PlatformInfo {
  if (_platform) return _platform;
  if (!browser) return { isMac: false, modKey: 'ctrl', modSymbol: 'Ctrl' };

  const isMac = /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
  _platform = {
    isMac,
    modKey: isMac ? 'meta' : 'ctrl',
    modSymbol: isMac ? '⌘' : 'Ctrl',
  };
  return _platform;
}

/**
 * Check if the event target is an input-like element where
 * single-key shortcuts should be suppressed.
 */
export function isTypingTarget(event: KeyboardEvent): boolean {
  const el = event.target as HTMLElement | null;
  if (!el) return false;

  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  // Inside dialogs or combobox dropdowns that may capture typing
  if (el.closest('[role="combobox"]')) return true;
  return false;
}

/**
 * Format a shortcut for display.
 * e.g. formatKey('mod+k') => '⌘K' on Mac, 'Ctrl+K' on Windows
 * e.g. formatKey('?') => '?'
 * e.g. formatKey('g d') => 'G then D'
 */
export function formatKey(combo: string): string {
  const platform = getPlatform();

  // Sequence shortcut like "g d"
  if (combo.includes(' ')) {
    return combo
      .split(' ')
      .map((k) => formatKey(k))
      .join(' then ');
  }

  const parts = combo.split('+');
  const display: string[] = [];

  for (const part of parts) {
    switch (part) {
      case 'mod':
        display.push(platform.modSymbol);
        break;
      case 'shift':
        display.push(platform.isMac ? '⇧' : 'Shift');
        break;
      case 'alt':
        display.push(platform.isMac ? '⌥' : 'Alt');
        break;
      case 'escape':
        display.push('Esc');
        break;
      default:
        display.push(part.length === 1 ? part.toUpperCase() : part);
    }
  }

  return platform.isMac ? display.join('') : display.join('+');
}

/**
 * Check if a KeyboardEvent matches a shortcut combo string.
 *
 * Combos:
 *   'mod+k'    — Cmd+K on Mac, Ctrl+K on Windows
 *   'shift+?'  — Shift + ? (i.e., the "?" key)
 *   'j'        — just the J key
 *   '/'        — just the "/" key
 *   '1'        — just the "1" key
 */
export function matchesCombo(event: KeyboardEvent, combo: string): boolean {
  const platform = getPlatform();
  const parts = combo.split('+');
  const key = parts[parts.length - 1].toLowerCase();
  const modifiers = parts.slice(0, -1);

  // Key match (case-insensitive for letters, exact for symbols)
  const eventKey = event.key.toLowerCase();
  if (eventKey !== key && event.key !== key) return false;

  const needsMod = modifiers.includes('mod');
  const needsShift = modifiers.includes('shift');
  const needsAlt = modifiers.includes('alt');

  // mod = metaKey on Mac, ctrlKey on Windows
  const hasMod = platform.isMac ? event.metaKey : event.ctrlKey;

  if (needsMod !== hasMod) return false;

  // On Mac, we don't care about ctrlKey when checking 'mod'.
  // On Windows, we don't care about metaKey.
  // But if mod is not needed, ensure no stray modifier keys.
  if (!needsMod) {
    if (event.ctrlKey || event.metaKey) return false;
  } else {
    // When mod is needed, check for extra modifiers we don't want
    if (platform.isMac && event.ctrlKey) return false;
    if (!platform.isMac && event.metaKey) return false;
  }

  // Shift handling:
  // - For letter keys (a-z), enforce shift matching strictly
  // - For symbol keys (?, /, 1, etc.), don't enforce shift unless combo says 'shift'
  //   because event.key already reflects the character produced
  const isLetterKey = /^[a-z]$/.test(key);
  if (isLetterKey) {
    if (needsShift !== event.shiftKey) return false;
  } else {
    // Symbol/number key: only fail if combo needs shift but shift isn't pressed
    if (needsShift && !event.shiftKey) return false;
  }

  if (needsAlt !== event.altKey) return false;

  return true;
}
