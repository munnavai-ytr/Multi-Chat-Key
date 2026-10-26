export function redactSecrets(text: string): string {
  if (!text) return '';

  let redacted = text;

  // OpenAI keys (sk-...)
  redacted = redacted.replace(/\bsk-[a-zA-Z0-9T3BlbkFJ]{20,}\b/g, '[redacted]');

  // Anthropic keys (sk-ant-...)
  redacted = redacted.replace(/\bsk-ant-[a-zA-Z0-9\-_]{20,}\b/g, '[redacted]');

  // Google Gemini API keys (AIza...)
  redacted = redacted.replace(/\bAIza[0-9A-Za-z\-_]{35}\b/g, '[redacted]');

  // Groq keys (gsk_...)
  redacted = redacted.replace(/\bgsk_[a-zA-Z0-9]{20,}\b/g, '[redacted]');

  // OpenRouter keys (sk-or-...)
  redacted = redacted.replace(/\bsk-or-v1-[a-zA-Z0-9]{64}\b/g, '[redacted]');

  // GitHub tokens (ghp_..., github_pat_...)
  redacted = redacted.replace(/\b(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{22,})\b/g, '[redacted]');

  // Slack tokens (xox[baprs]-...)
  redacted = redacted.replace(/\bxox[baprs]-[a-zA-Z0-9\-]{10,}\b/g, '[redacted]');

  // AWS Access Keys (AKIA...)
  redacted = redacted.replace(/\bAKIA[0-9A-Z]{16}\b/g, '[redacted]');

  // Bearer tokens
  redacted = redacted.replace(/Bearer\s+[a-zA-Z0-9\-_\.=]+/g, 'Bearer [redacted]');

  // JWT tokens (eyJ...)
  redacted = redacted.replace(/\beyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, '[redacted]');

  // Key/Token/Secret/Password patterns with assignments
  redacted = redacted.replace(
    /((?:key|token|secret|password|api_key|auth_token)\s*[:=]\s*["']?)([a-zA-Z0-9_\-\.]{8,})(["']?)/gi,
    '$1[redacted]$3'
  );

  return redacted;
}

export function limitOutput(
  text: string,
  max: number = 12000
): { output: string; truncated: boolean } {
  if (!text) return { output: '', truncated: false };
  if (text.length <= max) return { output: text, truncated: false };

  const half = Math.floor(max / 2);
  const head = text.slice(0, half);
  const tail = text.slice(-half);
  const omitted = text.length - max;

  const marker = `\n\n[... ${omitted} characters omitted ...]\n\n`;
  return {
    output: head + marker + tail,
    truncated: true,
  };
}
