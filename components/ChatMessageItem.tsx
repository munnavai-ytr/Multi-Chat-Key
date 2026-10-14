'use client';

import React from 'react';
import { MsgRow } from '@/lib/db';
import { Sparkles, AlertCircle, RotateCcw } from 'lucide-react';

interface ChatMessageItemProps {
  message: MsgRow;
  isStreaming: boolean;
  onRetry: (messageId: string) => void;
}

export const ChatMessageItem = React.memo(function ChatMessageItem({
  message,
  isStreaming,
  onRetry,
}: ChatMessageItemProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end mb-4 px-3 sm:px-4 max-w-3xl mx-auto w-full">
        <div className="max-w-[85%] sm:max-w-[75%] rounded-[18px] rounded-br-[4px] bg-surface2 px-4 py-2.5 text-text text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words select-text shadow-xs">
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant message
  const hasContent = Boolean(message.content);
  const isWaitingFirstToken = isStreaming && !hasContent && !message.error;

  return (
    <div className="flex items-start gap-3 mb-6 px-3 sm:px-4 max-w-3xl mx-auto w-full">
      {/* Small avatar */}
      <div className="w-7 h-7 rounded-lg bg-surface2 border border-border flex items-center justify-center text-accent shrink-0 mt-0.5 select-none shadow-xs">
        <Sparkles className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        {/* Waiting for first token typing indicator */}
        {isWaitingFirstToken && (
          <div className="flex items-center gap-1.5 py-1.5 px-1">
            <span className="w-2 h-2 rounded-full bg-muted/60 animate-pulse [animation-duration:900ms]" />
            <span className="w-2 h-2 rounded-full bg-muted/60 animate-pulse [animation-duration:900ms] [animation-delay:200ms]" />
            <span className="w-2 h-2 rounded-full bg-muted/60 animate-pulse [animation-duration:900ms] [animation-delay:400ms]" />
          </div>
        )}

        {/* Text content */}
        {hasContent && (
          <div className="text-text text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words select-text">
            {message.content}
          </div>
        )}

        {/* Error inline card */}
        {message.error && (
          <div className="mt-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-start gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="break-words">{message.error}</span>
            </div>
            <button
              type="button"
              onClick={() => onRetry(message.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 font-medium text-xs transition-colors shrink-0 self-start sm:self-auto cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
