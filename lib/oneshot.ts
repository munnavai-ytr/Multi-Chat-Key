/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProviderId } from './providers';
import { streamResilient } from './resilience';

export async function oneShot(o: {
  keyId?: string;
  provider: ProviderId;
  baseUrl?: string;
  apiKey: string;
  model: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string> {
  let result = '';
  try {
    const generator = streamResilient({
      keyId: o.keyId,
      provider: o.provider,
      baseUrl: o.baseUrl,
      apiKey: o.apiKey,
      model: o.model,
      messages: [{ role: 'user', content: o.prompt }],
    });

    for await (const ev of generator) {
      if (ev.type === 'text') {
        result += ev.text;
      }
    }
  } catch (err) {
    console.error('oneShot execution error:', err);
  }
  return result;
}
