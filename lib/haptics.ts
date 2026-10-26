/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from './db';

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

let hapticsEnabled = true;

// Load initial setting from db.meta
if (typeof window !== 'undefined') {
  db.meta.get('haptics').then((row) => {
    if (row && typeof row.value === 'boolean') {
      hapticsEnabled = row.value;
    }
  }).catch(() => {});
}

export function setHapticsEnabled(enabled: boolean) {
  hapticsEnabled = enabled;
  if (typeof window !== 'undefined') {
    db.meta.put({ key: 'haptics', value: enabled }).catch(() => {});
  }
}

export function getHapticsEnabled(): boolean {
  return hapticsEnabled;
}

export async function haptic(style: HapticStyle = 'light') {
  if (!hapticsEnabled || typeof window === 'undefined') return;

  try {
    // 1. Try Capacitor Haptics if running natively
    if ((window as any).Capacitor?.isNativePlatform?.()) {
      const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
      if (style === 'success' || style === 'warning' || style === 'error') {
        const typeMap = {
          success: NotificationType.Success,
          warning: NotificationType.Warning,
          error: NotificationType.Error,
        };
        await Haptics.notification({ type: typeMap[style] });
      } else {
        const impactMap = {
          light: ImpactStyle.Light,
          medium: ImpactStyle.Medium,
          heavy: ImpactStyle.Heavy,
        };
        await Haptics.impact({ style: impactMap[style] });
      }
      return;
    }

    // 2. Fallback to standard Web Vibration API
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      const patterns: Record<HapticStyle, number | number[]> = {
        light: 10,
        medium: 20,
        heavy: 35,
        success: [10, 30, 15],
        warning: [20, 40, 20],
        error: [35, 50, 35, 50, 35],
      };
      navigator.vibrate(patterns[style]);
    }
  } catch {
    // Silently ignore haptic failures
  }
}
