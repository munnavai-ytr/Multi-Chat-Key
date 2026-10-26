'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, Check, X, ChevronDown, ChevronUp, Loader2, RotateCw } from 'lucide-react';
import { ActivityStep, SupportedLang, t } from '@/lib/activity';

interface ActivityStatusProps {
  activity?: ActivityStep[];
  isStreaming: boolean;
  startedAt?: number;
  userLang?: SupportedLang;
  showActivity?: boolean;
}

export const ActivityStatus = React.memo(function ActivityStatus({
  activity,
  isStreaming,
  startedAt,
  userLang = 'en',
  showActivity = true,
}: ActivityStatusProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState<number>(1);

  const steps = activity || [];
  const workSteps = steps.filter((s) => s.kind === 'think' || s.kind === 'tool');
  const count = workSteps.length;

  // Running steps (prefer the latest running step)
  const runningSteps = steps.filter((s) => s.status === 'running');
  const latestRunningStep = runningSteps[runningSteps.length - 1];

  // Elapsed time ticker during streaming
  useEffect(() => {
    if (!isStreaming) return;
    const start = startedAt || Date.now();
    const updateElapsed = () => {
      const sec = Math.max(1, Math.floor((Date.now() - start) / 1000));
      setElapsedSec(sec);
    };
    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [isStreaming, startedAt]);

  // If activity status is disabled in Settings, show nothing
  if (!showActivity) return null;

  // Finished state: If there are zero work steps (e.g. plain "hi"), render nothing
  if (!isStreaming && count === 0) {
    return null;
  }

  // Calculate total duration for finished state
  const firstStart = steps[0]?.startedAt || startedAt || Date.now();
  const lastEnd = steps.reduce((max, s) => Math.max(max, s.endedAt || s.startedAt), firstStart);
  const finalSec = Math.max(1, Math.round((lastEnd - firstStart) / 1000));

  const secWord = t(userLang, 'sec');
  const stepWord = t(userLang, count === 1 ? 'step' : 'steps');
  const finishedSummary = `${count} ${stepWord} · ${finalSec}${secWord}`;

  const currentTitle = latestRunningStep
    ? latestRunningStep.title
    : steps.length > 0 && steps[steps.length - 1].kind === 'write'
    ? t(userLang, 'writing')
    : t(userLang, 'working');

  return (
    <div className="mb-3 select-none">
      {/* Header bar */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl bg-surface2/70 border border-border/80 hover:bg-surface2 hover:border-accent/30 transition-all text-xs cursor-pointer group"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isStreaming ? (
            <Sparkles className="w-4 h-4 text-accent spark-spin shrink-0" />
          ) : (
            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          )}

          {isStreaming ? (
            <div
              key={latestRunningStep?.id || 'working'}
              className="step-in min-w-0 truncate"
            >
              <span className="shimmer-text font-medium text-xs truncate block">
                {currentTitle}
              </span>
            </div>
          ) : (
            <span className="font-medium text-text text-xs">
              {finishedSummary}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 text-muted">
          {isStreaming && (
            <span className="tabular-nums font-mono text-[11px]">
              {elapsedSec}{secWord}
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 group-hover:text-text transition-colors" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 group-hover:text-text transition-colors" />
          )}
        </div>
      </button>

      {/* Expanded Step List */}
      {isExpanded && steps.length > 0 && (
        <div className="mt-1.5 p-2 rounded-xl bg-surface border border-border divide-y divide-border/60 text-xs shadow-2xs">
          {steps.map((step) => {
            const isStepExpanded = expandedStepId === step.id;
            const stepDurationSec = Math.max(
              1,
              Math.round(((step.endedAt || Date.now()) - step.startedAt) / 1000)
            );
            const hasDetail = Boolean(step.detail);

            return (
              <div key={step.id} className="py-2 first:pt-1 last:pb-1">
                <div
                  onClick={() => hasDetail && setExpandedStepId(isStepExpanded ? null : step.id)}
                  className={`flex items-center justify-between gap-2 ${
                    hasDetail ? 'cursor-pointer hover:bg-surface2/40 px-1 py-0.5 rounded-lg' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {step.status === 'running' ? (
                      <Loader2 className="w-3.5 h-3.5 text-accent spark-spin shrink-0" />
                    ) : step.status === 'done' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    )}

                    <span
                      className={`truncate font-medium text-xs ${
                        step.status === 'error'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-text'
                      }`}
                    >
                      {step.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 text-muted text-[11px] tabular-nums font-mono">
                    {step.route && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface2 border border-border text-muted font-mono">
                        {step.route}
                      </span>
                    )}
                    <span>
                      {stepDurationSec}{secWord}
                    </span>
                    {hasDetail && (
                      <ChevronDown
                        className={`w-3 h-3 text-muted transition-transform ${
                          isStepExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {isStepExpanded && (step.detail || step.estimatedTokens) && (
                  <div className="mt-1.5 p-2.5 rounded-lg bg-surface2/60 border border-border/70 text-[11px] font-mono whitespace-pre-wrap max-h-48 overflow-auto text-muted leading-relaxed space-y-1">
                    {step.estimatedTokens && (
                      <div className="text-[10px] text-accent font-medium">
                        Payload size: ~{Math.round(step.estimatedTokens / 1000)}k tokens
                      </div>
                    )}
                    {step.detail && <div>{step.detail}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
