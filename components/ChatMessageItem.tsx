'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MsgRow } from '@/lib/db';
import {
  Sparkles,
  AlertCircle,
  RotateCcw,
  Copy,
  Check,
  Pencil,
  GitBranch,
} from 'lucide-react';
import { Markdown } from './Markdown';

interface ChatMessageItemProps {
  message: MsgRow;
  isStreaming: boolean;
  isLastAssistant?: boolean;
  onRetry: (messageId: string) => void;
  onEditAndResend?: (userMsgId: string, newText: string) => void;
  onRegenerate?: () => void;
  onBranch?: (msgId: string) => void;
}

export const ChatMessageItem = React.memo(function ChatMessageItem({
  message,
  isStreaming,
  isLastAssistant = false,
  onRetry,
  onEditAndResend,
  onRegenerate,
  onBranch,
}: ChatMessageItemProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);

  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditText(message.content);
  }, [message.content]);

  useEffect(() => {
    if (isEditing && editTextareaRef.current) {
      const el = editTextareaRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
    }
  }, [isEditing]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
    }
  };

  const handleSaveEdit = () => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    setIsEditing(false);
    onEditAndResend?.(message.id, trimmed);
  };

  if (isUser) {
    if (isEditing) {
      return (
        <div className="flex flex-col items-end mb-4 px-3 sm:px-4 max-w-3xl mx-auto w-full">
          <div className="w-full max-w-[90%] sm:max-w-[80%] rounded-[18px] bg-surface border border-accent/70 p-3 shadow-md space-y-2">
            <textarea
              ref={editTextareaRef}
              value={editText}
              onChange={(e) => {
                setEditText(e.target.value);
                const el = editTextareaRef.current;
                if (el) {
                  el.style.height = 'auto';
                  el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsEditing(false);
                  setEditText(message.content);
                } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSaveEdit();
                }
              }}
              rows={2}
              className="w-full bg-transparent resize-none text-text text-sm sm:text-base leading-relaxed focus:outline-none"
            />
            <div className="flex items-center justify-end gap-2 pt-1 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setEditText(message.content);
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-medium text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={!editText.trim()}
                className="px-3 py-1 rounded-lg bg-accent text-accent-fg text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
              >
                Save &amp; Send
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="group flex flex-col items-end mb-4 px-3 sm:px-4 max-w-3xl mx-auto w-full">
        <div className="max-w-[85%] sm:max-w-[75%] rounded-[18px] rounded-br-[4px] bg-surface2 px-4 py-2.5 text-text text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words select-text shadow-xs">
          {message.content}
        </div>

        {/* User message actions: Copy, Edit */}
        <div className="flex items-center gap-1 mt-1 justify-end opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy message"
            title={copied ? 'Copied' : 'Copy'}
            className="p-1 rounded-md text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsEditing(true)}
            aria-label="Edit message"
            title="Edit"
            className="p-1 rounded-md text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // Assistant message
  const hasContent = Boolean(message.content);
  const isWaitingFirstToken = isStreaming && !hasContent && !message.error;

  return (
    <div className="group flex items-start gap-3 mb-6 px-3 sm:px-4 max-w-3xl mx-auto w-full">
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

        {/* Rich Markdown content */}
        {hasContent && <Markdown content={message.content} />}

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

        {/* Assistant message actions: Copy, Regenerate (last message only), Branch */}
        {hasContent && !isStreaming && (
          <div className="flex items-center gap-1 mt-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy response"
              title={copied ? 'Copied' : 'Copy'}
              className="p-1 rounded-md text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>

            {isLastAssistant && onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                aria-label="Regenerate response"
                title="Regenerate"
                className="p-1 rounded-md text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}

            {onBranch && (
              <button
                type="button"
                onClick={() => onBranch(message.id)}
                aria-label="Branch conversation from here"
                title="Branch conversation"
                className="p-1 rounded-md text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer"
              >
                <GitBranch className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
