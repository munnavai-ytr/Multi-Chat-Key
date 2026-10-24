'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  Play,
  Code,
  Copy,
  Check,
  Download,
  RotateCw,
  Maximize2,
  Minimize2,
  ShieldAlert,
} from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { buildSrcDoc } from '@/lib/artifact';
import { saveFile } from '@/lib/save-file';

export function ArtifactPanel() {
  const { artifact, setArtifact } = useUIStore();
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [refreshKey, setRefreshKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const srcDoc = useMemo(() => {
    if (!artifact) return '';
    return buildSrcDoc(artifact.lang, artifact.code);
  }, [artifact]);

  if (!artifact) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const handleDownload = () => {
    const lang = (artifact.lang || '').toLowerCase();
    let ext = 'html';
    let mime = 'text/html';

    if (lang === 'svg') {
      ext = 'svg';
      mime = 'image/svg+xml';
    } else if (lang === 'jsx' || lang === 'tsx' || lang === 'react') {
      ext = lang === 'tsx' ? 'tsx' : 'jsx';
      mime = 'text/javascript';
    }

    const filename = `artifact-${Date.now()}.${ext}`;
    const blob = new Blob([artifact.code], { type: `${mime};charset=utf-8` });
    saveFile(blob, filename).catch((err) => console.error('Failed to save artifact', err));
  };

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  const handleClose = () => {
    setArtifact(null);
    setIsFullscreen(false);
  };

  const langLabel = (artifact.lang || 'html').toUpperCase();

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 flex flex-col bg-surface shadow-2xl overflow-hidden'
          : 'fixed inset-0 z-50 md:static md:z-auto md:w-1/2 h-full flex flex-col bg-surface border-l border-border shrink-0 shadow-2xl md:shadow-none overflow-hidden transition-transform duration-200'
      }
    >
      {/* Header bar */}
      <div className="h-12 border-b border-border px-3.5 flex items-center justify-between shrink-0 bg-surface select-none">
        {/* Left: Title & Language Badge */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-text truncate">
            {artifact.title || 'Artifact'}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-surface2 border border-border text-muted">
            {langLabel}
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          {/* Refresh button */}
          <button
            type="button"
            onClick={handleRefresh}
            title="Refresh preview"
            aria-label="Refresh preview"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          {/* Copy button */}
          <button
            type="button"
            onClick={handleCopy}
            title={copied ? 'Copied code' : 'Copy code'}
            aria-label="Copy code"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Download button */}
          <button
            type="button"
            onClick={handleDownload}
            title="Download file"
            aria-label="Download file"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Fullscreen toggle button */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Close button */}
          <button
            type="button"
            onClick={handleClose}
            title="Close artifact"
            aria-label="Close artifact"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs bar */}
      <div className="flex items-center justify-between border-b border-border px-3 bg-surface2/40 shrink-0">
        <div className="flex gap-1 py-1">
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'preview'
                ? 'bg-surface text-text shadow-xs border border-border/80'
                : 'text-muted hover:text-text hover:bg-surface/50'
            }`}
          >
            <Play className="w-3 h-3 fill-current text-accent" />
            <span>Preview</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('code')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'code'
                ? 'bg-surface text-text shadow-xs border border-border/80'
                : 'text-muted hover:text-text hover:bg-surface/50'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Code</span>
          </button>
        </div>
      </div>

      {/* Security sandbox explainer note */}
      <div className="px-3.5 py-1.5 bg-surface2/60 border-b border-border/70 flex items-center gap-1.5 text-[11px] text-muted shrink-0">
        <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <span className="leading-tight">
          Runs in a sandbox. Network access from generated code is not blocked, so do not paste secrets into previews.
        </span>
      </div>

      {/* Panel Body */}
      <div className="flex-1 min-h-0 relative overflow-hidden bg-bg">
        {activeTab === 'preview' ? (
          <iframe
            key={refreshKey}
            sandbox="allow-scripts"
            srcDoc={srcDoc}
            title="Artifact Preview"
            className="w-full h-full bg-white border-0"
          />
        ) : (
          <div className="w-full h-full overflow-auto p-4 font-mono text-xs text-text bg-surface/50 leading-relaxed select-text whitespace-pre-wrap break-words">
            <code>{artifact.code}</code>
          </div>
        )}
      </div>
    </div>
  );
}
