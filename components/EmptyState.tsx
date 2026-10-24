'use client';

import { Sparkles, Compass, Lightbulb, Code2 } from 'lucide-react';
import { useChatStore } from '@/store/chat';
import { useKeysStore } from '@/store/keys';
import { useUIStore } from '@/store/ui';

const SUGGESTIONS = [
  {
    icon: Lightbulb,
    label: 'Brainstorm ideas',
    desc: 'Generate creative angles for a project',
    prompt: 'Brainstorm 5 innovative ideas for a modern web app with clean UX.',
  },
  {
    icon: Compass,
    label: 'Explain a concept',
    desc: 'Break down complex topics simply',
    prompt: 'Explain how large language models generate text step by step in simple terms.',
  },
  {
    icon: Sparkles,
    label: 'Draft a message',
    desc: 'Craft clear emails or announcements',
    prompt: 'Draft a friendly and concise team announcement celebrating a major project milestone.',
  },
  {
    icon: Code2,
    label: 'Write or review code',
    desc: 'Debug snippets or structure architecture',
    prompt: 'Write a TypeScript utility to debounce user input with clean cleanup.',
  },
];

export function EmptyState() {
  const { sendMessage, streaming } = useChatStore();
  const { keys, selectedKeyId, selectedModel } = useKeysStore();
  const { setSettingsOpen } = useUIStore();

  const handleChipClick = (prompt: string) => {
    if (streaming) return;
    const hasKey = keys.length > 0 && Boolean(selectedKeyId);
    if (!hasKey || !selectedModel) {
      setSettingsOpen(true);
      return;
    }
    sendMessage(prompt);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-2xl mx-auto w-full text-center">
      {/* Brand icon */}
      <div className="w-12 h-12 rounded-2xl bg-surface2 border border-border flex items-center justify-center mb-5 text-accent shadow-sm">
        <Sparkles className="w-6 h-6" />
      </div>

      {/* Greeting */}
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text mb-2">
        How can I help today?
      </h1>
      <p className="text-sm text-muted mb-8 max-w-md">
        Select a suggestion below or type your prompt to get started.
      </p>

      {/* 4 suggestion chips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl">
        {SUGGESTIONS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => handleChipClick(item.prompt)}
              className="group flex items-start gap-3 p-3.5 rounded-[14px] bg-surface border border-border hover:border-accent/40 hover:bg-surface2 text-left transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-surface2 group-hover:bg-accent/10 flex items-center justify-center shrink-0 text-muted group-hover:text-accent transition-colors">
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-text group-hover:text-accent transition-colors truncate">
                  {item.label}
                </div>
                <div className="text-xs text-muted truncate mt-0.5">
                  {item.desc}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
