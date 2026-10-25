import { Capacitor } from '@capacitor/core';

export function stripMarkdown(s: string) {
  return s
    .replace(/```[\s\S]*?```/g, ' code block. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>~|-]{1,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function startListening(o: {
  lang: string;
  onPartial: (t: string) => void;
  onFinal: (t: string) => void;
  onError: (m: string) => void;
}): Promise<() => Promise<void> | void> {
  let sent = false;
  const finish = (t: string) => {
    if (!sent && t && t.trim()) {
      sent = true;
      o.onFinal(t.trim());
    }
  };

  if (Capacitor.isNativePlatform()) {
    const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
    const perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== 'granted') {
      o.onError('Microphone permission denied');
      return () => {};
    }
    let last = '';
    await SpeechRecognition.addListener('partialResults', (d: any) => {
      last = d.matches?.[0] ?? '';
      o.onPartial(last);
    });
    await SpeechRecognition.addListener('listeningState', (s: any) => {
      if (s.status === 'stopped') finish(last);
    });
    await SpeechRecognition.start({ language: o.lang, partialResults: true, popup: false });
    return async () => {
      try {
        await SpeechRecognition.stop();
      } catch {}
      finish(last);
      await SpeechRecognition.removeAllListeners();
    };
  }

  const SR =
    typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;

  if (!SR) {
    o.onError('Speech recognition is not supported in this browser. Try Chrome.');
    return () => {};
  }

  const r = new SR();
  r.lang = o.lang;
  r.interimResults = true;
  r.continuous = false;
  let last = '';

  r.onresult = (e: any) => {
    let t = '';
    for (let i = 0; i < e.results.length; i++) {
      t += e.results[i][0].transcript;
    }
    last = t;
    o.onPartial(t);
  };

  r.onerror = (e: any) => {
    o.onError(e.error || 'Speech error');
  };

  r.onend = () => {
    finish(last);
  };

  try {
    r.start();
  } catch (err: any) {
    o.onError(err?.message || 'Could not start speech recognition');
  }

  return () => {
    try {
      r.stop();
    } catch {}
  };
}

export async function speak(text: string, lang: string): Promise<void> {
  const clean = stripMarkdown(text).slice(0, 4000);
  if (!clean) return;

  if (Capacitor.isNativePlatform()) {
    const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
    await TextToSpeech.speak({ text: clean, lang, rate: 1.0 });
    return;
  }

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  await new Promise<void>((res) => {
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = lang;
    u.onend = () => res();
    u.onerror = () => res();
    try {
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch {
      res();
    }
  });
}

export function stopSpeaking() {
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
  } catch {}

  if (Capacitor.isNativePlatform()) {
    import('@capacitor-community/text-to-speech')
      .then((m) => m.TextToSpeech.stop())
      .catch(() => {});
  }
}
