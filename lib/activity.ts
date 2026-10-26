import { toolLabel } from './agent-config';

export type ActivityKind = 'think' | 'tool' | 'write';
export type ActivityStatusType = 'running' | 'done' | 'error';

export interface ActivityStep {
  id: string;
  kind: ActivityKind;
  title: string;
  status: ActivityStatusType;
  startedAt: number;
  endedAt?: number;
  detail?: string;
  route?: 'direct' | 'via server';
  estimatedTokens?: number;
  remainingSec?: number;
}

export type SupportedLang = 'bn' | 'hi' | 'ar' | 'en';

export function detectLang(text: string): SupportedLang {
  if (/[\u0980-\u09FF]/.test(text)) return 'bn';
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  return 'en';
}

const L = {
  en: { thinking: 'Thinking', writing: 'Writing the answer', working: 'Working', steps: 'steps', step: 'step', done: 'Done', sec: 's', waiting: 'Waiting for rate limit', retrying: 'Retrying', pacing: 'Pacing to stay under rate limit' },
  bn: { thinking: 'ভাবছি', writing: 'উত্তর লিখছি', working: 'কাজ করছি', steps: 'ধাপ', step: 'ধাপ', done: 'শেষ', sec: 'সে', waiting: 'রেট লিমিটের জন্য অপেক্ষা করা হচ্ছে', retrying: 'পুনরায় চেষ্টা করা হচ্ছে', pacing: 'পেস নিয়ন্ত্রণ করা হচ্ছে' },
  hi: { thinking: 'सोच रहा हूँ', writing: 'उत्तर लिख रहा हूँ', working: 'काम कर रहा हूँ', steps: 'चरण', step: 'चरण', done: 'पूरा', sec: 'से', waiting: 'रेट लिमिट का इंतज़ार किया जा रहा है', retrying: 'पुनः प्रयास कर रहा हूँ', pacing: 'पेसिंग नियंत्रण जारी है' },
  ar: { thinking: 'أفكر', writing: 'أكتب الإجابة', working: 'أعمل', steps: 'خطوات', step: 'خطوة', done: 'تم', sec: 'ث', waiting: 'انتظار حد المعدل', retrying: 'إعادة المحاولة', pacing: 'ضبط سرعة الطلبات' },
};

export const t = (lang: SupportedLang, key: keyof typeof L.en) => (L[lang] ?? L.en)[key];

export function fallbackTitle(call: { name: string; args?: any }, _lang?: SupportedLang): string {
  return toolLabel({ name: call.name, args: call.args || {} });
}

export function stepTitle(call: { name: string; args?: any }, lang: SupportedLang): string {
  const s = typeof call.args?.status === 'string' ? call.args.status.trim().slice(0, 80) : '';
  return s || fallbackTitle(call, lang);
}

export function extractThoughtHeading(thoughtText: string, lang: SupportedLang): string {
  const regex = /\*\*([^*\n]{3,80})\*\*/g;
  let lastMatch = '';
  let m: RegExpExecArray | null;
  while ((m = regex.exec(thoughtText)) !== null) {
    if (m[1] && m[1].trim()) {
      lastMatch = m[1].trim();
    }
  }
  return lastMatch || t(lang, 'thinking');
}
