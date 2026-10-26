/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from './db';
import { setHapticsEnabled } from './haptics';

export type ThemeMode = 'system' | 'dark' | 'light';
export type AccentPalette = 'aurora' | 'ember' | 'forest' | 'ocean' | 'mono';
export type DensityMode = 'comfortable' | 'compact';
export type TextSize = 'S' | 'M' | 'L';
export type ReduceMotionMode = 'system' | 'on' | 'off';

export interface AppearanceSettings {
  theme: ThemeMode;
  accent: AccentPalette;
  density: DensityMode;
  textSize: TextSize;
  haptics: boolean;
  reduceMotion: ReduceMotionMode;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: 'system',
  accent: 'aurora',
  density: 'comfortable',
  textSize: 'M',
  haptics: true,
  reduceMotion: 'system',
};

export function applyAppearanceToDOM(settings: Partial<AppearanceSettings>) {
  if (typeof window === 'undefined') return;

  const doc = document.documentElement;

  // 1. Theme
  if (settings.theme) {
    const isDark =
      settings.theme === 'dark' ||
      (settings.theme === 'system' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      doc.classList.add('dark');
      doc.setAttribute('data-theme', 'dark');
    } else {
      doc.classList.remove('dark');
      doc.setAttribute('data-theme', 'light');
    }
  }

  // 2. Accent Palette
  if (settings.accent) {
    doc.setAttribute('data-accent', settings.accent);
  }

  // 3. Density
  if (settings.density) {
    doc.setAttribute('data-density', settings.density);
  }

  // 4. Text Size
  if (settings.textSize) {
    doc.setAttribute('data-text-size', settings.textSize);
  }

  // 5. Reduce Motion Override
  if (settings.reduceMotion) {
    doc.setAttribute('data-reduce-motion', settings.reduceMotion);
  }

  // 6. Haptics
  if (typeof settings.haptics === 'boolean') {
    setHapticsEnabled(settings.haptics);
  }
}

export async function saveAppearanceSettings(
  updated: Partial<AppearanceSettings>
): Promise<AppearanceSettings> {
  const current = await loadAppearanceSettings();
  const next = { ...current, ...updated };

  // Apply to DOM
  applyAppearanceToDOM(next);

  // Sync to localStorage for fast inline head script execution
  try {
    localStorage.setItem('chatly_appearance', JSON.stringify(next));
  } catch {}

  // Save to IndexedDB (db.meta)
  try {
    await db.meta.put({ key: 'appearance', value: next });
    await db.meta.put({ key: 'haptics', value: next.haptics });
  } catch {}

  return next;
}

export async function loadAppearanceSettings(): Promise<AppearanceSettings> {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE;

  try {
    const row = await db.meta.get('appearance');
    if (row && row.value) {
      return { ...DEFAULT_APPEARANCE, ...row.value };
    }
    const local = localStorage.getItem('chatly_appearance');
    if (local) {
      return { ...DEFAULT_APPEARANCE, ...JSON.parse(local) };
    }
  } catch {}

  return DEFAULT_APPEARANCE;
}
