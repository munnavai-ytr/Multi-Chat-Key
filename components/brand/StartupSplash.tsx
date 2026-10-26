'use client';

import React, { useState, useEffect } from 'react';
import { Logo } from './Logo';

export function StartupSplash() {
  const [visible, setVisible] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasShown = sessionStorage.getItem('chatly_splash_shown');

    if (hasShown || prefersReducedMotion) {
      return;
    }

    setVisible(true);

    const fadeTimer = setTimeout(() => {
      setFadingOut(true);
    }, 450);

    const removeTimer = setTimeout(() => {
      setVisible(false);
      sessionStorage.setItem('chatly_splash_shown', 'true');
    }, 650);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  const dismiss = () => {
    setFadingOut(true);
    setTimeout(() => {
      setVisible(false);
      sessionStorage.setItem('chatly_splash_shown', 'true');
    }, 150);
  };

  if (!visible) return null;

  return (
    <div
      onClick={dismiss}
      style={{
        transition: 'opacity 200ms cubic-bezier(.2,.8,.2,1)',
        opacity: fadingOut ? 0 : 1,
      }}
      className="fixed inset-0 z-[100] bg-[var(--bg)] flex items-center justify-center cursor-pointer select-none"
    >
      <div className="relative flex flex-col items-center justify-center space-y-3 step-in">
        <Logo size="lg" sparkle showWordmark={true} />
      </div>
    </div>
  );
}
