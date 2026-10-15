/* eslint-disable @next/next/no-img-element */
'use client';

import {
  ArrowUp,
  Square,
  KeyRound,
  Paperclip,
  Camera,
  X,
  FileText,
  FileCode,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import React, { useRef, useState, useEffect } from 'react';
import { useChatStore } from '@/store/chat';
import { useKeysStore } from '@/store/keys';
import { useUIStore } from '@/store/ui';
import {
  ProcessedFile,
  processFile,
  validateFile,
  formatFileSize,
  MAX_FILES_PER_MSG,
  ACCEPTED_EXTENSIONS,
} from '@/lib/files';

export function ChatInput() {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<ProcessedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [compatDismissed, setCompatDismissed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const { streaming, sendMessage, stop } = useChatStore();
  const { keys, selectedKeyId, selectedModel } = useKeysStore();
  const { setSettingsOpen } = useUIStore();

  const currentKey = keys.find((k) => k.id === selectedKeyId);
  const currentProvider = currentKey?.provider;
  const hasUnsupportedFileType =
    (currentProvider === 'groq' || currentProvider === 'custom') &&
    attachments.some((f) => f.kind === 'pdf' || f.kind === 'image');
  const showCompatWarning = hasUnsupportedFileType && !compatDismissed;

  useEffect(() => {
    if (!hasUnsupportedFileType) {
      setCompatDismissed(false);
    }
  }, [hasUnsupportedFileType]);

  const totalAttachmentSize = attachments.reduce((s, f) => s + f.size, 0);
  const showLargeFileHint = totalAttachmentSize > 3 * 1024 * 1024;

  const hasKey = keys.length > 0 && Boolean(selectedKeyId);
  const hasModel = Boolean(selectedModel);
  const hasInput = Boolean(value.trim()) || attachments.length > 0;
  const canSend = hasInput && hasKey && hasModel && !streaming && !isProcessing;

  const showWarning = (msg: string) => {
    setWarning(msg);
    setTimeout(() => {
      setWarning((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const handleFiles = async (files: FileList | File[]) => {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    if (attachments.length + fileList.length > MAX_FILES_PER_MSG) {
      showWarning(`You can attach a maximum of ${MAX_FILES_PER_MSG} files per message.`);
      return;
    }

    setIsProcessing(true);
    const newProcessed: ProcessedFile[] = [];

    for (const file of fileList) {
      const err = validateFile(file);
      if (err) {
        showWarning(err);
        continue;
      }
      try {
        const processed = await processFile(file);
        newProcessed.push(processed);
      } catch (err: any) {
        showWarning(`Failed to process ${file.name}: ${err?.message || 'unknown error'}`);
      }
    }

    if (newProcessed.length > 0) {
      setAttachments((prev) => [...prev, ...newProcessed].slice(0, MAX_FILES_PER_MSG));
    }
    setIsProcessing(false);
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

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
      const maxHeight = 150;
      const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${nextHeight}px`;
    }
  };

  const handleSend = () => {
    if (!canSend) return;
    const textToSend = value;
    const filesToSend = [...attachments];
    setValue('');
    setAttachments([]);
    resetTextareaHeight();
    sendMessage(textToSend, filesToSend);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
    if (isDesktop && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const f = items[i].getAsFile();
        if (f) files.push(f);
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      handleFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  useEffect(() => {
    if (!streaming && textareaRef.current && window.innerWidth >= 768) {
      textareaRef.current.focus();
    }
  }, [streaming]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative shrink-0 w-full bg-gradient-to-t from-bg via-bg to-transparent pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] px-3 sm:px-4"
    >
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

        {/* Warning notification */}
        {warning && (
          <div className="mb-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-center justify-between gap-2 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="truncate">{warning}</span>
            </div>
            <button
              type="button"
              onClick={() => setWarning(null)}
              className="p-0.5 hover:opacity-70 cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Compatibility warning for groq/custom with PDF/images */}
        {showCompatWarning && (
          <div className="mb-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-center justify-between gap-2 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>This provider may not support this file type. You can still send.</span>
            </div>
            <button
              type="button"
              onClick={() => setCompatDismissed(true)}
              aria-label="Dismiss warning"
              className="p-0.5 hover:opacity-70 cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS}
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = '';
          }}
          className="hidden"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = '';
          }}
          className="hidden"
        />

        {/* Input box */}
        <div
          className={`relative flex flex-col bg-surface border rounded-[22px] p-2.5 shadow-xs transition-all ${
            isDragging
              ? 'border-accent ring-2 ring-accent/20 bg-accent/5'
              : 'border-border focus-within:border-accent/60'
          }`}
        >
          {/* Attached Files Thumbnail Chips */}
          {attachments.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2 px-1 scrollbar-none">
              {attachments.map((file, idx) => (
                <div
                  key={idx}
                  className="group relative flex items-center gap-2 bg-surface2 border border-border rounded-xl p-1.5 pr-2.5 max-w-[200px] shrink-0 text-xs shadow-xs"
                >
                  {file.kind === 'image' && file.b64 ? (
                    <img
                      src={`data:${file.mime};base64,${file.b64}`}
                      alt={file.name}
                      className="w-8 h-8 rounded-lg object-cover shrink-0 border border-border"
                    />
                  ) : file.kind === 'pdf' ? (
                    <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                      <FileCode className="w-4 h-4" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-text truncate leading-tight">
                      {file.name}
                    </p>
                    <p className="text-[10px] text-muted leading-tight">
                      {formatFileSize(file.size)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(idx)}
                    aria-label={`Remove ${file.name}`}
                    title="Remove attachment"
                    className="w-5 h-5 rounded-full bg-border/80 hover:bg-rose-500 hover:text-white text-muted flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {isProcessing && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface2 border border-border text-xs text-muted">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing...</span>
                </div>
              )}
            </div>
          )}

          {/* FIX 6: Big attachments hint on serverless hosts */}
          {showLargeFileHint && (
            <p className="text-[11px] text-muted px-2 pb-1.5">
              Large files may fail on some hosting platforms.
            </p>
          )}

          <div className="flex items-end gap-1.5">
            {/* Paperclip attachment button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming || attachments.length >= MAX_FILES_PER_MSG}
              aria-label="Attach file"
              title={
                attachments.length >= MAX_FILES_PER_MSG
                  ? `Max ${MAX_FILES_PER_MSG} files attached`
                  : 'Attach file (images, PDFs, code, docs)'
              }
              className="w-8 h-8 rounded-full text-muted hover:text-text hover:bg-surface2 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center shrink-0 mb-0.5 transition-colors cursor-pointer"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Mobile camera button */}
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={streaming || attachments.length >= MAX_FILES_PER_MSG}
              aria-label="Take photo with camera"
              title="Camera capture"
              className="sm:hidden w-8 h-8 rounded-full text-muted hover:text-text hover:bg-surface2 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center shrink-0 mb-0.5 transition-colors cursor-pointer"
            >
              <Camera className="w-4 h-4" />
            </button>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={value}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                !hasKey
                  ? 'Add an API key to start messaging...'
                  : !hasModel
                  ? 'Select a model from the top bar...'
                  : attachments.length > 0
                  ? 'Add a message or send attachments...'
                  : 'Message Chatly (drag or paste files)...'
              }
              className="flex-1 max-h-[150px] min-h-[28px] resize-none bg-transparent py-1 px-1 text-sm sm:text-base text-text placeholder:text-muted focus:outline-none leading-relaxed"
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
                className="w-8 h-8 rounded-full bg-accent text-accent-fg disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center shrink-0 mb-0.5 transition-opacity cursor-pointer shadow-xs"
              >
                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>

        <p className="text-[11px] text-muted text-center mt-2 font-normal">
          Chatly streams directly to your selected model. Files and keys remain securely on your device.
        </p>
      </div>
    </div>
  );
}
