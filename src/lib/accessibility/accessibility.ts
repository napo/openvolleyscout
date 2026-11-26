// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Accessibility options of the app: bigger text, wider spacing, a font made for easy reading,
 * colour palettes for colour blindness, higher contrast and less motion. The choices are kept in
 * this browser and written on <html> as data attributes, where the stylesheets read them.
 */
import { setEvaluationPalette, type EvaluationPalette } from '../../domain/touch/evaluation-scale';

export type TextScale = 100 | 115 | 130 | 150;
export type ColorVision = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';

export interface AccessibilitySettings {
  textScale: TextScale;
  spacing: boolean;
  legibleFont: boolean;
  colorVision: ColorVision;
  highContrast: boolean;
  reduceMotion: boolean;
}

export const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
  textScale: 100,
  spacing: false,
  legibleFont: false,
  colorVision: 'normal',
  highContrast: false,
  reduceMotion: false,
};

export const TEXT_SCALES: readonly TextScale[] = [100, 115, 130, 150];
export const COLOR_VISIONS: readonly ColorVision[] = ['normal', 'protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];

const STORAGE_KEY = 'openvolleyscout.accessibility';

export function sanitizeAccessibility(raw: unknown): AccessibilitySettings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    textScale: TEXT_SCALES.includes(value.textScale as TextScale) ? (value.textScale as TextScale) : 100,
    spacing: value.spacing === true,
    legibleFont: value.legibleFont === true,
    colorVision: COLOR_VISIONS.includes(value.colorVision as ColorVision) ? (value.colorVision as ColorVision) : 'normal',
    highContrast: value.highContrast === true,
    reduceMotion: value.reduceMotion === true,
  };
}

let current: AccessibilitySettings | null = null;
const listeners = new Set<() => void>();

export function readAccessibility(): AccessibilitySettings {
  if (current) return current;
  try {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    current = sanitizeAccessibility(stored ? JSON.parse(stored) : null);
  } catch {
    current = { ...DEFAULT_ACCESSIBILITY };
  }
  return current;
}

export function paletteFor(vision: ColorVision): EvaluationPalette {
  if (vision === 'normal') return 'default';
  return vision === 'achromatopsia' ? 'grayscale' : 'colorblind';
}

export function applyAccessibility(settings: AccessibilitySettings): void {
  setEvaluationPalette(paletteFor(settings.colorVision));
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const set = (name: string, on: boolean) => {
    if (on) root.setAttribute(name, ''); else root.removeAttribute(name);
  };
  root.style.setProperty('--a11y-text-scale', String(settings.textScale / 100));
  set('data-a11y-text', settings.textScale !== 100);
  set('data-a11y-spacing', settings.spacing);
  set('data-a11y-font', settings.legibleFont);
  set('data-a11y-contrast', settings.highContrast);
  set('data-a11y-motion', settings.reduceMotion);
  if (settings.colorVision === 'normal') root.removeAttribute('data-a11y-color');
  else root.setAttribute('data-a11y-color', settings.colorVision);
}

export function saveAccessibility(next: AccessibilitySettings): void {
  current = next;
  try {
    const isDefault = JSON.stringify(next) === JSON.stringify(DEFAULT_ACCESSIBILITY);
    if (isDefault) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
  applyAccessibility(next);
  listeners.forEach((listener) => listener());
}

export function subscribeAccessibility(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function initAccessibility(): void {
  applyAccessibility(readAccessibility());
}
