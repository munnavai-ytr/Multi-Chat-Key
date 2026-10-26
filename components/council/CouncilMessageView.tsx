'use client';

import React, { useState } from 'react';
import { Users, Sparkles, Clock, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Markdown } from '@/components/Markdown';
import { Button, Badge, Card, SparkLoader } from '@/components/ui';
import { haptic } from '@/lib/haptics';

export interface CouncilMemberResult {
  model: string;
  content: string;
  ms: number;
}

export interface CouncilMessageViewProps {
  council: CouncilMemberResult[];
  synthesisText?: string;
  isSynthesizing?: boolean;
  onSynthesize: () => void;
}

export function CouncilMessageView({
  council,
  synthesisText,
  isSynthesizing,
  onSynthesize,
}: CouncilMessageViewProps) {
  const [activeMobileTab, setActiveMobileTab] = useState(0);

  const handleSynthesizeClick = () => {
    haptic('light');
    onSynthesize();
  };

  return (
    <div className="space-y-4 my-3">
      {/* Header Badge */}
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
        <div className="flex items-center gap-2">
          <Badge tone="accent">
            <Users className="w-3 h-3 mr-1" />
            Model Council ({council.length} Members)
          </Badge>
        </div>
      </div>

      {/* Desktop Column Grid / Mobile Tab View */}
      <div className="block md:grid md:grid-cols-3 gap-3 space-y-3 md:space-y-0">
        {/* Mobile Swipe Navigation Buttons */}
        <div className="flex md:hidden items-center justify-between bg-[var(--surface-2)] p-1.5 rounded-[var(--radius-md)]">
          <button
            type="button"
            disabled={activeMobileTab === 0}
            onClick={() => {
              haptic('light');
              setActiveMobileTab((prev) => Math.max(0, prev - 1));
            }}
            className="p-1 text-[var(--muted)] disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="text-xs font-semibold text-[var(--text)]">
            Member {activeMobileTab + 1} of {council.length}: {council[activeMobileTab]?.model}
          </span>

          <button
            type="button"
            disabled={activeMobileTab >= council.length - 1}
            onClick={() => {
              haptic('light');
              setActiveMobileTab((prev) => Math.min(council.length - 1, prev + 1));
            }}
            className="p-1 text-[var(--muted)] disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Member Answer Cards */}
        {council.map((member, index) => {
          const isHiddenMobile = index !== activeMobileTab;
          return (
            <Card
              key={index}
              className={`p-3.5 flex flex-col space-y-2.5 max-h-[500px] overflow-y-auto ${
                isHiddenMobile ? 'hidden md:flex' : 'flex'
              }`}
            >
              {/* Member Card Header */}
              <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-2 shrink-0">
                <span className="text-xs font-semibold text-[var(--text)] font-mono truncate">
                  {member.model}
                </span>
                <span className="text-[10px] text-[var(--muted)] font-mono flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3" />
                  {member.ms ? `${(member.ms / 1000).toFixed(1)}s` : 'streaming...'}
                </span>
              </div>

              {/* Member Answer Body */}
              <div className="text-xs text-[var(--text)] leading-relaxed flex-1 overflow-y-auto">
                {member.content ? (
                  <Markdown content={member.content} />
                ) : (
                  <div className="flex items-center gap-2 py-4 text-[var(--muted)]">
                    <SparkLoader size={14} />
                    <span>Evaluating query...</span>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Synthesis Section */}
      <div className="pt-2 border-t border-[var(--border)]">
        {!synthesisText && !isSynthesizing && (
          <div className="flex justify-center">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSynthesizeClick}
              icon={<Sparkles className="w-4 h-4" />}
            >
              Synthesize Final Answer
            </Button>
          </div>
        )}

        {isSynthesizing && (
          <div className="flex items-center justify-center gap-2 py-3 text-xs text-[var(--accent)] font-medium">
            <SparkLoader size={16} />
            <span>Synthesizing council consensus and key disagreements...</span>
          </div>
        )}

        {synthesisText && (
          <Card className="p-4 bg-[var(--surface-2)]/60 border-[var(--accent)]/30 space-y-2 mt-2 step-in">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--accent)]">
              <Sparkles className="w-4 h-4" />
              <span>Council Consensus & Synthesis</span>
            </div>
            <div className="text-xs sm:text-sm leading-relaxed text-[var(--text)]">
              <Markdown content={synthesisText} />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
