'use client';

import { ArrowUp, Square, KeyRound } from 'lucide-react';
import { useRef, useState, useEffect } from 'react';
import { useChatStore } from '@/store/chat';
import { useKeysStore } from '@/store/keys';
import { useUIStore } from '@/store/ui';

export function ChatInput() {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { streaming, sendMessage, stop } = useChatStore();
  const { keys, selectedKeyId, selectedModel } = useKeysStore();
  const { setSettingsOpen } = useUIStore();

  const hasKey = keys.length > 0 && Boolean(selectedKeyId);
  const hasModel = Boolean(selectedModel);
  const canSend = Boolean(value.trim()) && hasKey && hasModel && !streaming;

  const resetTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      // Max 6 lines: ~144-150px
      const maxHeight = 150;
      const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${nextHeight}px`;
    }
  };

  const handleSend = () => {
    if (!canSend) return;
    const textToSend = value;
    setValue('');
    resetTextareaHeight();
    sendMessage(textToSend);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Desktop: Enter sends, Shift+Enter newline
    // Mobile (<768px): Enter newline, send button sends
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;

    if (isDesktop && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Focus textarea when chat changes or streaming finishes
  useEffect(() => {
    if (!streaming && textareaRef.current && window.innerWidth >= 768) {
      textareaRef.current.focus();
    }
  }, [streaming]);

  return (
    <div className="shrink-0 w-full bg-gradient-to-t from-bg via-bg to-transparent pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] px-3 sm:px-4">
      <div className="max-w-3xl mx-auto w-full">
        {/* If no key exists, show friendly "Add an API key to start" card */}
        {!hasKey && (
          <div className="mb-2.5 p-3 rounded-2xl bg-surface border border-border shadow-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center text-accent shrink-0">
                <KeyRound className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-text truncate">
                  Add an API key to start
                </p>
                <p className="text-[11px] text-muted truncate">
                  Chatly uses BYOK (Bring Your Own Key) for private AI access.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-accent text-accent-fg text-xs font-semibold hover:opacity-90 transition-opacity shrink-0 cursor-pointer"
            >
              Add Key
            </button>
          </div>
        )}

        {/* Input box */}
        <div className="relative flex items-end gap-2 bg-surface border border-border rounded-[20px] px-3.5 py-2.5 shadow-xs focus-within:border-accent/60 transition-colors">
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={
              !hasKey
                ? 'Add an API key to start messaging...'
                : !hasModel
                ? 'Select a model from the top bar...'
                : 'Message Chatly...'
            }
            className="flex-1 max-h-[150px] min-h-[28px] resize-none bg-transparent py-0.5 text-sm sm:text-base text-text placeholder:text-muted focus:outline-none leading-relaxed"
          />

          {streaming ? (
            // Stop button while streaming
            <button
              type="button"
              onClick={stop}
              aria-label="Stop generating"
              title="Stop generation"
              className="w-8 h-8 rounded-full bg-surface2 hover:bg-border text-text flex items-center justify-center shrink-0 mb-0.5 transition-colors cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            // Send button
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Send message"
              className="w-8 h-8 rounded-full bg-accent text-accent-fg disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center shrink-0 mb-0.5 transition-opacity cursor-pointer"
            >
              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}
        </div>

        <p className="text-[11px] text-muted text-center mt-2 font-normal">
          Chatly streams directly to your selected model. Keys remain securely on your device.
        </p>
      </div>
    </div>
  );
}
