/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MsgRow, FileRow } from '@/lib/db';
import { useChatStore } from '@/store/chat';
import { formatFileSize } from '@/lib/files';
import {
  Sparkles,
  AlertCircle,
  RotateCcw,
  Copy,
  Check,
  Pencil,
  GitBranch,
  FileText,
  FileCode,
  Download,
  X,
  ExternalLink,
  Globe,
  RotateCw,
  AppWindow,
} from 'lucide-react';
import { Markdown } from './Markdown';
import { useUIStore } from '@/store/ui';

function ToolChipsList({
  tools,
}: {
  tools?: {
    id: string;
    name: string;
    label: string;
    status: 'running' | 'done' | 'error';
    detail?: string;
  }[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (!tools || tools.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {tools.map((t) => {
        const isExpanded = expandedId === t.id;
        return (
          <div key={t.id} className="flex flex-col">
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : t.id)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface2 border border-border text-xs text-text hover:bg-border transition-colors cursor-pointer"
            >
              {t.status === 'running' ? (
                <RotateCw className="w-3 h-3 animate-spin text-accent" />
              ) : t.status === 'done' ? (
                <Check className="w-3 h-3 text-emerald-500" />
              ) : (
                <X className="w-3 h-3 text-rose-500" />
              )}
              <span className="font-medium truncate max-w-[200px]">{t.label}</span>
            </button>
            {isExpanded && t.detail && (
              <div className="mt-1 p-2.5 rounded-xl bg-bg border border-border text-[11px] font-mono whitespace-pre-wrap max-h-40 overflow-auto text-muted">
                {t.detail}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
const MemoToolChips = React.memo(ToolChipsList);

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

  // Lightbox / File modal states
  const [activeImage, setActiveImage] = useState<FileRow | null>(null);
  const [activeTextFile, setActiveTextFile] = useState<FileRow | null>(null);

  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Files attached to this message
  const files = useChatStore((s) => s.filesByMsgId[message.id]) || [];
  const isSearchingWeb = useChatStore((s) => s.isSearchingWeb && s.streamingMsgId === message.id);

  useEffect(() => {
    const timer = setTimeout(() => {
      setEditText(message.content);
    }, 0);
    return () => clearTimeout(timer);
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
    if (!trimmed && files.length === 0) return;
    setIsEditing(false);
    onEditAndResend?.(message.id, trimmed);
  };

  const downloadFile = (file: FileRow) => {
    if (file.kind === 'image' && file.b64) {
      const a = document.createElement('a');
      a.href = `data:${file.mime};base64,${file.b64}`;
      a.download = file.name;
      a.click();
    } else if (file.kind === 'pdf' && file.b64) {
      const a = document.createElement('a');
      a.href = `data:${file.mime};base64,${file.b64}`;
      a.download = file.name;
      a.click();
    } else if (file.kind === 'text' && file.text) {
      const blob = new Blob([file.text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const openPdfInNewTab = (file: FileRow) => {
    if (!file.b64) return;
    try {
      const byteCharacters = atob(file.b64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
    } catch {
      downloadFile(file);
    }
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
                disabled={!editText.trim() && files.length === 0}
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
        {/* Render files attached to this user message */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-end mb-2 max-w-[85%] sm:max-w-[75%]">
            {files.map((file) => {
              if (file.kind === 'image' && file.b64) {
                return (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => setActiveImage(file)}
                    className="relative group/img overflow-hidden rounded-xl border border-border bg-surface2/60 hover:opacity-95 transition-opacity cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <img
                      src={`data:${file.mime};base64,${file.b64}`}
                      alt={file.name}
                      loading="lazy"
                      className="w-24 h-24 sm:w-28 sm:h-28 object-cover rounded-xl"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-medium p-1 text-center truncate">
                      Click to view
                    </div>
                  </button>
                );
              }

              if (file.kind === 'pdf') {
                return (
                  <div
                    key={file.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-surface2 border border-border text-left shadow-xs hover:border-border/80 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 max-w-[150px] sm:max-w-[200px]">
                      <p className="text-xs font-medium text-text truncate">{file.name}</p>
                      <p className="text-[10px] text-muted">{formatFileSize(file.size)} &bull; PDF</p>
                    </div>
                    <div className="flex items-center gap-1 ml-1">
                      <button
                        type="button"
                        onClick={() => openPdfInNewTab(file)}
                        title="Open PDF"
                        className="p-1 rounded-md text-muted hover:text-text hover:bg-surface transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadFile(file)}
                        title="Download PDF"
                        className="p-1 rounded-md text-muted hover:text-text hover:bg-surface transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              }

              // Text / Code file
              return (
                <div
                  key={file.id}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-surface2 border border-border text-left shadow-xs hover:border-border/80 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                    <FileCode className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 max-w-[150px] sm:max-w-[200px]">
                    <p className="text-xs font-medium text-text truncate">{file.name}</p>
                    <p className="text-[10px] text-muted">{formatFileSize(file.size)}</p>
                  </div>
                  <div className="flex items-center gap-1 ml-1">
                    <button
                      type="button"
                      onClick={() => setActiveTextFile(file)}
                      title="View file content"
                      className="px-2 py-0.5 rounded text-[11px] font-medium text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadFile(file)}
                      title="Download file"
                      className="p-1 rounded-md text-muted hover:text-text hover:bg-surface transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* User text content */}
        {message.content && (
          <div className="max-w-[85%] sm:max-w-[75%] rounded-[18px] rounded-br-[4px] bg-surface2 px-4 py-2.5 text-text text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words select-text shadow-xs">
            {message.content}
          </div>
        )}

        {/* User message actions: Copy, Edit */}
        <div className="flex items-center gap-1 mt-1 justify-end opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          {message.content && (
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
          )}

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

        {/* Image Lightbox Modal */}
        {activeImage && activeImage.b64 && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={() => setActiveImage(null)}
          >
            <div
              className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-2 right-2 flex items-center gap-2 z-10 bg-black/60 rounded-full p-1 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => downloadFile(activeImage)}
                  title="Download image"
                  className="w-8 h-8 rounded-full text-white/80 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveImage(null)}
                  title="Close (Esc)"
                  className="w-8 h-8 rounded-full text-white/80 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <img
                src={`data:${activeImage.mime};base64,${activeImage.b64}`}
                alt={activeImage.name}
                className="max-h-[82vh] max-w-full rounded-2xl object-contain shadow-2xl"
              />
              <p className="mt-2 text-xs text-white/80 font-medium truncate max-w-md">
                {activeImage.name} ({formatFileSize(activeImage.size)})
              </p>
            </div>
          </div>
        )}

        {/* Text/Code Viewer Modal */}
        {activeTextFile && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={() => setActiveTextFile(null)}
          >
            <div
              className="bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileCode className="w-4 h-4 text-accent shrink-0" />
                  <span className="text-xs sm:text-sm font-semibold text-text truncate">
                    {activeTextFile.name}
                  </span>
                  <span className="text-[11px] text-muted shrink-0">
                    ({formatFileSize(activeTextFile.size)})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => downloadFile(activeTextFile)}
                    title="Download"
                    className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTextFile(null)}
                    title="Close"
                    className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4 bg-bg font-mono text-xs text-text leading-relaxed select-text whitespace-pre-wrap break-words">
                {activeTextFile.text || '(Empty file)'}
              </div>
            </div>
          </div>
        )}
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
        {/* Searching the web status */}
        {isSearchingWeb && (
          <div className="flex items-center gap-2 py-1 px-1 mb-2 text-xs text-muted">
            <Globe className="w-3.5 h-3.5 text-accent animate-spin" />
            <span className="font-medium text-text">Searching the web...</span>
          </div>
        )}

        {/* Search failure amber note */}
        {message.searchNotice && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs mb-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{message.searchNotice}</span>
          </div>
        )}

        {/* Waiting for first token typing indicator */}
        {isWaitingFirstToken && !isSearchingWeb && (
          <div className="flex items-center gap-1.5 py-1.5 px-1">
            <span className="w-2 h-2 rounded-full bg-muted/60 animate-pulse [animation-duration:900ms]" />
            <span className="w-2 h-2 rounded-full bg-muted/60 animate-pulse [animation-duration:900ms] [animation-delay:200ms]" />
            <span className="w-2 h-2 rounded-full bg-muted/60 animate-pulse [animation-duration:900ms] [animation-delay:400ms]" />
          </div>
        )}

        {/* Tool Chips */}
        <MemoToolChips tools={message.tools} />

        {/* Artifacts Cards */}
        {message.artifacts && message.artifacts.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {message.artifacts.map((art) => (
              <button
                key={art.id}
                type="button"
                onClick={() => useUIStore.getState().setArtifact({ lang: art.type, code: art.code, title: art.title })}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/10 border border-accent/30 text-xs font-semibold text-accent hover:bg-accent/20 transition-colors cursor-pointer"
              >
                <AppWindow className="w-4 h-4" />
                <span>Artifact: {art.title}</span>
              </button>
            ))}
          </div>
        )}

        {/* Rich Markdown content */}
        {hasContent && <Markdown content={message.content} isStreaming={isStreaming} />}

        {/* Web Search Sources Chips */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-border/50">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted mb-1.5">
              <Globe className="w-3 h-3 text-accent" />
              <span>Sources</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {message.sources.map((src, i) => {
                let domain = src.url;
                try {
                  domain = new URL(src.url).hostname.replace(/^www\./, '');
                } catch {
                  domain = src.url;
                }
                return (
                  <a
                    key={i}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={src.title || src.url}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface2/70 hover:bg-surface2 border border-border text-xs text-text hover:text-accent transition-colors max-w-[220px] truncate group/chip"
                  >
                    <span className="text-[10px] text-muted font-mono">[{i + 1}]</span>
                    <span className="truncate">{domain}</span>
                    <ExternalLink className="w-2.5 h-2.5 text-muted group-hover/chip:text-accent shrink-0" />
                  </a>
                );
              })}
            </div>
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
            
            {message.usage && (
              <span className="text-[10px] text-muted ml-2 px-1.5 py-0.5 rounded bg-surface2">
                {message.usage.in + message.usage.out} tokens
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
