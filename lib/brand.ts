/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const BRAND = {
  name: 'Chatly',
  tagline: 'Describe it. Build it. Ship it.',
  description: 'A mobile-first AI chat web app with clean, fast performance and zero layout jank.',
  version: '1.0.0',
} as const;

export type Brand = typeof BRAND;
