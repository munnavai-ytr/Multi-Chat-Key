/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MsgRow, FileRow, db } from '@/lib/db';
import { useChatStore } from '@/store/chat';
import { formatFileSize } from '@/lib/files';
import { saveFile } from '@/lib/save-file';
import {
  Sparkles,
  AlertCircle,
  RotateCcw,
  Play,
  Copy,
  Check,
  FileDown,
  Pencil,
  GitBranch,
  FileText,
  FileCode,
  FileSpreadsheet,
  Presentation,
  Table,
  Share2,
  Eye,
  Download,
  X,
  ExternalLink,
  Globe,
  RotateCw,
  AppWindow,
  Circle,
  CheckCircle2,
  ListTodo,
  Loader2,
  Square,
  Volume2,
} from 'lucide-react';
import { Markdown } from './Markdown';
import { ActivityStatus } from './ActivityStatus';
import { CouncilMessageView } from './council/CouncilMessageView';
import { detectLang } from '@/lib/activity';
import { speak, stopSpeaking } from '@/lib/voice';
import { useUIStore } from '@/store/ui';

interface ChatMessageItemProps {
  message: MsgRow;
  isStreaming: boolean;
  isLastAssistant?: boolean;
  onRetry: (messageId: string) => void;
  onResume?: (messageId: string) => void;
  onEditAndResend?: (userMsgId: string, newText: string) => void;
  onRegenerate?: () => void;
  onBranch?: (msgId: string) => void;
}

export const ChatMessageItem = React.memo(function ChatMessageItem({
  message,
  isStreaming,
  isLastAssistant = false,
  onRetry,
  onResume,
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
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [showReportMenu, setShowReportMenu] = useState(false);

  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Files attached to this message
  const files = useChatStore((s) => s.filesByMsgId[message.id]) || [];

  const [showActivity, setShowActivity] = useState(true);
  useEffect(() => {
    db.meta.get('showActivity').then((row) => {
      if (row && typeof row.value === 'boolean') {
        setShowActivity(row.value);
      }
    });
  }, []);

  const userLang = useChatStore((s) => {
    const lastUser = [...s.messages].reverse().find((m) => m.role === 'user')?.content || '';
    return detectLang(lastUser);
  });

  const currentlySpeakingMsgId = useUIStore((s) => s.currentlySpeakingMsgId);
  const setCurrentlySpeakingMsgId = useUIStore((s) => s.setCurrentlySpeakingMsgId);
  const isSpeaking = currentlySpeakingMsgId === message.id;

  const handleSaveReport = async (format: 'docx' | 'pdf') => {
    try {
      setIsSavingReport(true);
      setShowReportMenu(false);
      const { buildDocument } = await import('@/lib/doc-builders');
      const lines = message.content.split('\n').filter(Boolean);
      const titleCandidate = lines[0]?.replace(/^[#\s*]+/, '').slice(0, 50) || 'Research Report';
      const filename = `research-report-${Date.now()}`;

      const doc = await buildDocument({
        format,
        filename,
        title: titleCandidate,
        raw: message.content,
      });

      await saveFile(doc.blob || new Blob([doc.data], { type: doc.mime }), doc.name);
      useUIStore.getState().showToast(`Saved as ${doc.name}`, 3000);
    } catch (err: any) {
      console.error('Failed to export report', err);
      useUIStore.getState().showToast('Failed to export report: ' + String(err?.message || err), 4000);
    } finally {
      setIsSavingReport(false);
    }
  };

  const handleToggleSpeak = async () => {
    if (isSpeaking) {
      stopSpeaking();
      setCurrentlySpeakingMsgId(null);
      return;
    }
    stopSpeaking();
    setCurrentlySpeakingMsgId(message.id);
    try {
      const voiceLang = (await db.meta.get('voiceLang'))?.value || 'auto';
      const lang =
        voiceLang === 'auto'
          ? /[\u0980-\u09FF]/.test(message.content)
            ? 'bn-BD'
            : /[\u0900-\u097F]/.test(message.content)
            ? 'hi-IN'
            : 'en-US'
          : voiceLang;
      await speak(message.content, lang);
    } catch (err) {
      console.error('Speech error', err);
    } finally {
      if (useUIStore.getState().currentlySpeakingMsgId === message.id) {
        setCurrentlySpeakingMsgId(null);
      }
    }
  };

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

  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{
    id: string;
    name: string;
    format: string;
    size: number;
    content: string;
  } | null>(null);
  const [previewCopied, setPreviewCopied] = useState(false);

  const downloadFile = (file: FileRow) => {
    if ((file.kind === 'image' || file.kind === 'pdf') && file.b64) {
      try {
        const byteCharacters = atob(file.b64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: file.mime });
        saveFile(blob, file.name).catch((err) => console.error('Failed to save file', err));
      } catch (err) {
        console.error('Failed to decode base64 file', err);
      }
    } else if (file.kind === 'text' && file.text) {
      const blob = new Blob([file.text], { type: 'text/plain;charset=utf-8' });
      saveFile(blob, file.name).catch((err) => console.error('Failed to save file', err));
    }
  };

  const downloadDocument = async (doc: { id: string; name: string; format: string; size: number }) => {
    try {
      setDownloadingDocId(doc.id);
      const row = await db.docs.get(doc.id);
      if (!row) {
        useUIStore.getState().showToast('Document not found in database', 3000);
        return;
      }
      const blob = new Blob([row.data], { type: row.mime || 'application/octet-stream' });
      await saveFile(blob, row.name);
      useUIStore.getState().showToast(`Saved ${row.name}`, 2000);
    } catch (err: any) {
      console.error('Failed to download document', err);
      useUIStore.getState().showToast('Failed to save document: ' + String(err?.message || err), 3000);
    } finally {
      setDownloadingDocId(null);
    }
  };

  const shareDocument = async (doc: { id: string; name: string; format: string; size: number }) => {
    try {
      const row = await db.docs.get(doc.id);
      if (!row) {
        useUIStore.getState().showToast('Document not found in database', 3000);
        return;
      }
      const blob = new Blob([row.data], { type: row.mime || 'application/octet-stream' });
      await saveFile(blob, row.name);
    } catch (err: any) {
      console.error('Failed to share document', err);
      useUIStore.getState().showToast('Failed to share document', 3000);
    }
  };

  const previewDocument = async (doc: { id: string; name: string; format: string; size: number }) => {
    try {
      setLoadingPreviewId(doc.id);
      const row = await db.docs.get(doc.id);
      if (!row) {
        useUIStore.getState().showToast('Document not found in database', 3000);
        return;
      }
      const text = new TextDecoder('utf-8').decode(row.data);
      setPreviewDoc({
        id: doc.id,
        name: doc.name,
        format: (doc.format || '').toLowerCase(),
        size: doc.size,
        content: text,
      });
    } catch (err: any) {
      console.error('Failed to preview document', err);
      useUIStore.getState().showToast('Could not preview document: ' + String(err?.message || err), 3000);
    } finally {
      setLoadingPreviewId(null);
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

  return (
    <div className="group flex items-start gap-3 mb-6 px-3 sm:px-4 max-w-3xl mx-auto w-full">
      {/* Small avatar */}
      <div className="w-7 h-7 rounded-lg bg-surface2 border border-border flex items-center justify-center text-accent shrink-0 mt-0.5 select-none shadow-xs">
        <Sparkles className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        {/* Live Activity Status */}
        <ActivityStatus
          activity={message.activity}
          isStreaming={isStreaming}
          startedAt={message.createdAt}
          userLang={userLang}
          showActivity={showActivity}
        />

        {/* Model Council View */}
        {message.council && message.council.length > 0 && (
          <CouncilMessageView
            council={message.council}
            synthesisText={message.content}
            isSynthesizing={isStreaming && message.id === useChatStore.getState().streamingMsgId}
            onSynthesize={() => useChatStore.getState().synthesizeCouncil(message.id)}
          />
        )}

        {/* Search failure amber note */}
        {message.searchNotice && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs mb-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{message.searchNotice}</span>
          </div>
        )}

        {/* Citation failure amber note */}
        {message.citationNotice && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs mb-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{message.citationNotice}</span>
          </div>
        )}

        {/* Plan Checklist (static icons, no spinner) */}
        {message.plan && message.plan.length > 0 && (
          <div className="mb-3 p-3 rounded-xl bg-surface2/60 border border-border text-xs space-y-1.5">
            <div className="font-semibold text-text flex items-center gap-1.5 mb-1.5 text-[11px] uppercase tracking-wider text-muted">
              <ListTodo className="w-3.5 h-3.5 text-accent" />
              <span>Plan</span>
            </div>
            {message.plan.map((task, tIdx) => (
              <div key={tIdx} className="flex items-center gap-2">
                {task.status === 'done' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                ) : task.status === 'doing' ? (
                  <RotateCw className="w-3.5 h-3.5 text-accent shrink-0" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-muted shrink-0" />
                )}
                <span
                  className={
                    task.status === 'done'
                      ? 'text-muted line-through'
                      : task.status === 'doing'
                      ? 'text-text font-medium'
                      : 'text-muted'
                  }
                >
                  {task.title}
                </span>
              </div>
            ))}
          </div>
        )}

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

        {/* Generated Documents Cards */}
        {message.documents && message.documents.length > 0 && (
          <div className="mb-3 space-y-2">
            {message.documents.map((doc) => {
              const fmt = (doc.format || 'file').toLowerCase();
              const isXlsx = fmt === 'xlsx';
              const isCsv = fmt === 'csv';
              const isPptx = fmt === 'pptx';
              const isPdf = fmt === 'pdf';
              const isDocx = fmt === 'docx';
              const isMd = fmt === 'md';
              const isTxt = fmt === 'txt';
              const canPreview = isMd || isTxt || isCsv;

              let IconComponent = FileText;
              let badgeColor = 'bg-surface2 text-muted border-border';
              let iconColor = 'text-muted';

              if (isDocx) {
                IconComponent = FileText;
                badgeColor = 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30';
                iconColor = 'text-blue-600 dark:text-blue-400';
              } else if (isXlsx) {
                IconComponent = FileSpreadsheet;
                badgeColor = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
                iconColor = 'text-emerald-600 dark:text-emerald-400';
              } else if (isCsv) {
                IconComponent = Table;
                badgeColor = 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30';
                iconColor = 'text-teal-600 dark:text-teal-400';
              } else if (isPptx) {
                IconComponent = Presentation;
                badgeColor = 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
                iconColor = 'text-amber-600 dark:text-amber-400';
              } else if (isPdf) {
                IconComponent = FileText;
                badgeColor = 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30';
                iconColor = 'text-rose-600 dark:text-rose-400';
              } else if (isMd) {
                IconComponent = FileCode;
                badgeColor = 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30';
                iconColor = 'text-purple-600 dark:text-purple-400';
              } else if (isTxt) {
                IconComponent = FileText;
                badgeColor = 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30';
                iconColor = 'text-slate-500';
              }

              return (
                <div
                  key={doc.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-surface2/60 border border-border hover:border-accent/40 transition-all max-w-lg shadow-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-lg bg-surface border border-border/80 shrink-0 ${iconColor}`}>
                      <IconComponent className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase border shrink-0 ${badgeColor}`}>
                          {fmt}
                        </span>
                        <span className="text-xs font-semibold text-text truncate" title={doc.name}>
                          {doc.name}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted mt-0.5">
                        {formatFileSize(doc.size)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                    {canPreview && (
                      <button
                        type="button"
                        onClick={() => previewDocument(doc)}
                        disabled={loadingPreviewId === doc.id}
                        title="Preview file"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface2 text-text border border-border text-xs font-medium transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                      >
                        {loadingPreviewId === doc.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                        <span>Preview</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => downloadDocument(doc)}
                      disabled={downloadingDocId === doc.id}
                      title="Download or save file"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
                    >
                      {downloadingDocId === doc.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>Download</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => shareDocument(doc)}
                      title="Share file"
                      className="p-1.5 rounded-lg bg-surface hover:bg-surface2 text-muted hover:text-text border border-border text-xs transition-all cursor-pointer active:scale-95"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}


        {/* Rich Markdown content */}
        {hasContent && (
          <Markdown
            content={message.content}
            isStreaming={isStreaming}
            sources={message.sources}
          />
        )}

        {/* Continue Button if reached step limit */}
        {message.needsContinue && !isStreaming && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => useChatStore.getState().sendMessage('continue')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-accent text-white font-medium text-xs hover:bg-accent/90 transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Continue</span>
            </button>
          </div>
        )}

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
                    <span className="text-[10px] text-muted font-mono">{src.id ? `[S${src.id}]` : `[${i + 1}]`}</span>
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
          <div className="mt-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 text-xs sm:text-sm space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-start gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="break-words">
                  {message.error.toLowerCase().includes('typeerror') ||
                  message.error.toLowerCase().includes('failed to fetch') ||
                  message.error.toLowerCase().includes('networkerror')
                    ? 'No internet connection. Check your network and tap Retry.'
                    : message.error}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                {onResume && (
                  <button
                    type="button"
                    onClick={() => onResume(message.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent font-medium text-xs transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Resume</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRetry(message.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 font-medium text-xs transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </button>
              </div>
            </div>
            {message.rawError && (
              <details className="text-[11px] text-muted border-t border-rose-500/20 pt-1.5">
                <summary className="cursor-pointer hover:underline font-mono">Details</summary>
                <pre className="mt-1 p-2 rounded bg-surface2/60 font-mono text-[10px] max-h-32 overflow-y-auto whitespace-pre-wrap break-all text-muted">
                  {message.rawError}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Assistant message actions: Copy, Read Aloud, Regenerate (last message only), Branch */}
        {hasContent && !isStreaming && (
          <div className={`flex items-center gap-1 mt-2 transition-opacity ${isSpeaking ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'}`}>
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

            <button
              type="button"
              onClick={handleToggleSpeak}
              aria-label={isSpeaking ? 'Stop speaking' : 'Read aloud'}
              title={isSpeaking ? 'Stop speaking' : 'Read aloud'}
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                isSpeaking
                  ? 'text-rose-500 bg-rose-500/10 animate-pulse'
                  : 'text-muted hover:text-text hover:bg-surface2'
              }`}
            >
              {isSpeaking ? (
                <Square className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
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

            {(message.isResearchReport || message.sources?.some((s) => typeof s.id === 'number')) && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowReportMenu((prev) => !prev)}
                  disabled={isSavingReport}
                  aria-label="Save as report"
                  title="Save as formatted report (.docx / .pdf)"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-accent/10 hover:bg-accent/20 text-accent transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSavingReport ? (
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileDown className="w-3.5 h-3.5" />
                  )}
                  <span>Save report</span>
                </button>

                {showReportMenu && (
                  <div className="absolute left-0 bottom-full mb-1.5 z-30 w-36 rounded-xl bg-surface border border-border shadow-xl p-1 text-xs animate-in fade-in zoom-in-95">
                    <button
                      type="button"
                      onClick={() => handleSaveReport('docx')}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-surface2 text-text flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-500" />
                      <span>Word (.docx)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveReport('pdf')}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-surface2 text-text flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5 text-rose-500" />
                      <span>PDF (.pdf)</span>
                    </button>
                  </div>
                )}
              </div>
            )}
            
            {message.usage && (
              <span className="text-[10px] text-muted ml-2 px-1.5 py-0.5 rounded bg-surface2">
                {message.usage.in + message.usage.out} tokens
              </span>
            )}
          </div>
        )}

        {/* Document Preview Modal for md/txt/csv */}
        {previewDoc && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs"
            onClick={() => setPreviewDoc(null)}
          >
            <div
              className="w-full max-w-3xl max-h-[85vh] rounded-2xl bg-surface border border-border shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-border bg-surface2/40">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-accent/15 text-accent border border-accent/30">
                    {previewDoc.format}
                  </span>
                  <h3 className="text-sm font-semibold text-text truncate" title={previewDoc.name}>
                    {previewDoc.name}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(previewDoc.content);
                      setPreviewCopied(true);
                      setTimeout(() => setPreviewCopied(false), 2000);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface2 text-text border border-border text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    {previewCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{previewCopied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadDocument(previewDoc)}
                    className="px-2.5 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewDoc(null)}
                    className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-4 sm:p-5 overflow-y-auto flex-1 text-text">
                {previewDoc.format === 'csv' ? (
                  (() => {
                    const lines = previewDoc.content.trim().split(/\r?\n/);
                    if (!lines.length || !lines[0].trim()) {
                      return <p className="text-xs text-muted">Empty CSV</p>;
                    }
                    const parseLine = (l: string) => {
                      const row: string[] = [];
                      let c = '';
                      let inQ = false;
                      for (let i = 0; i < l.length; i++) {
                        const ch = l[i];
                        if (ch === '"') {
                          if (inQ && l[i + 1] === '"') {
                            c += '"';
                            i++;
                          } else {
                            inQ = !inQ;
                          }
                        } else if (ch === ',' && !inQ) {
                          row.push(c.trim());
                          c = '';
                        } else {
                          c += ch;
                        }
                      }
                      row.push(c.trim());
                      return row;
                    };
                    const headers = parseLine(lines[0]);
                    const rows = lines.slice(1).map(parseLine);
                    return (
                      <div className="overflow-x-auto border border-border rounded-xl">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead className="bg-surface2/80 text-text font-semibold sticky top-0 border-b border-border">
                            <tr>
                              {headers.map((h, i) => (
                                <th key={i} className="p-3 border-r border-border/50 last:border-r-0 whitespace-nowrap">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/50">
                            {rows.map((row, rIdx) => (
                              <tr key={rIdx} className={rIdx % 2 === 1 ? 'bg-surface2/30' : 'bg-surface'}>
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="p-2.5 border-r border-border/40 last:border-r-0 whitespace-nowrap">
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()
                ) : previewDoc.format === 'md' ? (
                  <div className="p-4 rounded-xl bg-surface2/30 border border-border">
                    <Markdown content={previewDoc.content} />
                  </div>
                ) : (
                  <pre className="p-4 rounded-xl bg-surface2/40 border border-border font-mono text-xs whitespace-pre-wrap leading-relaxed text-text">
                    {previewDoc.content}
                  </pre>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
