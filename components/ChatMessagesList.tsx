'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useChatStore } from '@/store/chat';
import { ChatMessageItem } from './ChatMessageItem';
import { EmptyState } from './EmptyState';
import { ChevronDown } from 'lucide-react';

export function ChatMessagesList() {
  const { messages, streaming, streamingMsgId, retryMessage } = useChatStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const checkScrollPosition = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distanceToBottom < 100;
    isNearBottomRef.current = near;
    setShowScrollBottom(!near && el.scrollHeight > el.clientHeight);
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
    isNearBottomRef.current = true;
    setShowScrollBottom(false);
  }, []);

  // When messages update or streaming tokens arrive:
  // Auto-scroll ONLY if user is already near bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      const el = containerRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [messages]);

  // When active chat switches or messages length changes, check scroll
  useEffect(() => {
    checkScrollPosition();
  }, [messages.length, checkScrollPosition]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto flex flex-col">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden relative flex flex-col">
      <div
        ref={containerRef}
        onScroll={checkScrollPosition}
        className="flex-1 overflow-y-auto pt-4 pb-6"
      >
        {messages.map((msg) => (
          <ChatMessageItem
            key={msg.id}
            message={msg}
            isStreaming={streaming && streamingMsgId === msg.id}
            onRetry={retryMessage}
          />
        ))}
      </div>

      {/* Floating scroll to bottom button */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          aria-label="Scroll to bottom"
          className="absolute bottom-3 right-4 sm:right-8 z-10 w-9 h-9 rounded-full bg-surface border border-border shadow-md text-muted hover:text-text flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
