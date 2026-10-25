'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';

interface ThinkingBlockProps {
  thinking?: string;
  thinkingMs?: number;
  isStreaming?: boolean;
  hasContent?: boolean;
}

export const ThinkingBlock = React.memo(function ThinkingBlock({
  thinking,
  thinkingMs,
  isStreaming = false,
  hasContent = false,
}: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef<number>(Date.now());

  // Live timer while streaming and no answer text has appeared yet
  useEffect(() => {
    if (!isStreaming || hasContent) return;
    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsedSeconds(Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [isStreaming, hasContent]);

  if (!thinking) return null;

  const isLiveThinking = isStreaming && !hasContent;

  if (isLiveThinking) {
    const lines = thinking.trim().split(/\r?\n/).filter(Boolean);
    const lastLines = lines.slice(-3).join('\n');

    return (
      <div className="mb-3 p-3 rounded-xl bg-surface2/40 border border-border/80 space-y-2 animate-in fade-in duration-200">
        <div className="flex items-center gap-2 text-xs font-medium text-accent">
          <Sparkles className="w-3.5 h-3.5 animate-spin" />
          <span>Thinking ({elapsedSeconds || 1}s)...</span>
        </div>
        {lastLines && (
          <div className="text-xs text-muted/90 leading-relaxed italic line-clamp-3 whitespace-pre-wrap pl-2 border-l-2 border-accent/40">
            {lastLines}
          </div>
        )}
      </div>
    );
  }

  // After thinking finished (or once answer text begins streaming)
  const durationSec = thinkingMs
    ? Math.max(1, Math.round(thinkingMs / 1000))
    : elapsedSeconds > 0
    ? elapsedSeconds
    : 1;

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface2/60 hover:bg-surface2 text-xs font-medium text-muted hover:text-text border border-border/60 transition-all cursor-pointer select-none"
      >
        <Sparkles className="w-3 h-3 text-accent" />
        <span>Thought for {durationSec}s</span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {expanded && (
        <div className="mt-2.5 p-3 rounded-xl bg-surface2/30 border border-border/60 text-xs text-muted leading-relaxed whitespace-pre-wrap pl-3.5 border-l-2 border-accent/40 animate-in fade-in duration-150">
          {thinking}
        </div>
      )}
    </div>
  );
});
