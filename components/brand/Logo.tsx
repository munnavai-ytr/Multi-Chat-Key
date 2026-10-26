'use client';

import React from 'react';
import { BRAND } from '@/lib/brand';

export interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  className?: string;
  sparkle?: boolean;
}

export function Logo({
  size = 'md',
  showWordmark = true,
  className = '',
  sparkle = false,
}: LogoProps) {
  const dimensions: Record<'sm' | 'md' | 'lg', { box: number; text: string; gap: string }> = {
    sm: { box: 24, text: 'text-base', gap: 'gap-2' },
    md: { box: 32, text: 'text-xl', gap: 'gap-2.5' },
    lg: { box: 44, text: 'text-2xl sm:text-3xl', gap: 'gap-3' },
  };

  const dim = dimensions[size];

  return (
    <div className={`inline-flex items-center ${dim.gap} select-none ${className}`}>
      <div
        className="relative shrink-0 flex items-center justify-center"
        style={{ width: dim.box, height: dim.box }}
      >
        <svg
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`w-full h-full ${sparkle ? 'animate-pulse' : ''}`}
        >
          <defs>
            <linearGradient id="chatly-mark-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--accent-a, #7C5CFF)" />
              <stop offset="100%" stopColor="var(--accent-b, #22D3EE)" />
            </linearGradient>
            <linearGradient id="chatly-fill-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--accent-a, #7C5CFF)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="var(--accent-b, #22D3EE)" stopOpacity="0.15" />
            </linearGradient>
          </defs>

          {/* Speech bubble body */}
          <path
            d="M7 10C7 7.23858 9.23858 5 12 5H24C26.7614 5 29 7.23858 29 10V20C29 22.7614 26.7614 25 24 25H16.8284L11.4142 30.4142C10.6332 31.1953 9.3 30.642 9.3 29.5355V25H12"
            fill="url(#chatly-fill-grad)"
            stroke="url(#chatly-mark-grad)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Spark / Star tail element embedded near top right */}
          <path
            d="M21 11C21 12.6569 22.3431 14 24 14C22.3431 14 21 15.3431 21 17C21 15.3431 19.6569 14 18 14C19.6569 14 21 12.6569 21 11Z"
            fill="url(#chatly-mark-grad)"
          />
        </svg>
      </div>

      {showWordmark && (
        <span
          className={`font-display font-bold tracking-tight text-text ${dim.text}`}
        >
          {BRAND.name}
        </span>
      )}
    </div>
  );
}
