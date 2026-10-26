'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Download,
  FolderCode,
  Search,
  FileCode,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  Plus,
  Maximize2,
  Minimize2,
  History,
  Folder,
  ArrowLeft,
  Check,
  FilePlus,
  FileX,
  FileEdit,
} from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { useWorkspacesStore } from '@/store/workspaces';
import { db, WSCheckpointRow } from '@/lib/db';
import { exportZip, undoCheckpoint } from '@/lib/workspace';
import { lineDiff, DiffOp } from '@/lib/diff';

export function WorkspacePanel() {
  const { workspacePanelOpen, setWorkspacePanelOpen, activeWorkspaceId } = useUIStore();
  const { workspaces, filePaths, loadFilePaths, addFiles } = useWorkspacesStore();

  const [activeTab, setActiveTab] = useState<'files' | 'changes'>('files');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileContent, setSelectedFileContent] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [checkpoints, setCheckpoints] = useState<WSCheckpointRow[]>([]);
  const [expandedCheckpoints, setExpandedCheckpoints] = useState<Record<string, boolean>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentWorkspace = useMemo(() => {
    return workspaces.find((w) => w.id === activeWorkspaceId);
  }, [workspaces, activeWorkspaceId]);

  // Load checkpoints when changes tab is opened or panel opens
  const refreshCheckpoints = async () => {
    if (!activeWorkspaceId) return;
    try {
      const cps = await db.wscheckpoints
        .where('wsId')
        .equals(activeWorkspaceId)
        .reverse()
        .sortBy('createdAt');
      setCheckpoints(cps);
    } catch {
      setCheckpoints([]);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (activeWorkspaceId && workspacePanelOpen) {
      loadFilePaths(activeWorkspaceId);
      db.wscheckpoints
        .where('wsId')
        .equals(activeWorkspaceId)
        .reverse()
        .sortBy('createdAt')
        .then((cps) => {
          if (!cancelled) setCheckpoints(cps);
        })
        .catch(() => {
          if (!cancelled) setCheckpoints([]);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, workspacePanelOpen, loadFilePaths]);

  useEffect(() => {
    let cancelled = false;
    if (activeTab === 'changes' && activeWorkspaceId) {
      db.wscheckpoints
        .where('wsId')
        .equals(activeWorkspaceId)
        .reverse()
        .sortBy('createdAt')
        .then((cps) => {
          if (!cancelled) setCheckpoints(cps);
        })
        .catch(() => {
          if (!cancelled) setCheckpoints([]);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [activeTab, activeWorkspaceId]);

  // Load file content on demand
  const handleSelectFile = async (path: string) => {
    if (!activeWorkspaceId) return;
    setSelectedFilePath(path);
    setIsLoadingFile(true);
    try {
      const row = await db.wsfiles.get({ wsId: activeWorkspaceId, path });
      setSelectedFileContent(row ? row.content : '');
    } catch {
      setSelectedFileContent('Error loading file content.');
    } finally {
      setIsLoadingFile(false);
    }
  };

  // Undo checkpoint handler
  const handleUndo = async (cpId: string) => {
    if (!activeWorkspaceId) return;
    try {
      await undoCheckpoint(cpId);
      await refreshCheckpoints();
      await loadFilePaths(activeWorkspaceId);
      if (selectedFilePath) {
        await handleSelectFile(selectedFilePath);
      }
      useUIStore.getState().showToast('Changes undone', 2000);
    } catch (e: any) {
      useUIStore.getState().showToast('Failed to undo: ' + (e?.message || 'Error'), 3000);
    }
  };

  // Upload additional files
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeWorkspaceId) return;
    setIsUploading(true);
    try {
      const count = await addFiles(activeWorkspaceId, files);
      useUIStore.getState().showToast(`Added ${count} file${count === 1 ? '' : 's'}`, 2000);
    } catch (err: any) {
      useUIStore.getState().showToast('Upload failed: ' + err.message, 3000);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = () => {
    if (!activeWorkspaceId) return;
    exportZip(activeWorkspaceId).catch((err) => {
      useUIStore.getState().showToast('Export failed: ' + err.message, 3000);
    });
  };

  // Filtered files
  const filteredPaths = useMemo(() => {
    if (!searchQuery.trim()) return filePaths;
    const q = searchQuery.toLowerCase();
    return filePaths.filter((p) => p.toLowerCase().includes(q));
  }, [filePaths, searchQuery]);

  if (!workspacePanelOpen || !activeWorkspaceId) return null;

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 flex flex-col bg-surface shadow-2xl overflow-hidden'
          : 'fixed inset-0 z-50 md:static md:z-auto md:w-1/2 h-full flex flex-col bg-surface border-l border-border shrink-0 shadow-2xl md:shadow-none overflow-hidden transition-transform duration-200'
      }
    >
      {/* Top Header */}
      <div className="h-12 border-b border-border px-3.5 flex items-center justify-between shrink-0 bg-surface select-none">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-accent/15 text-accent shrink-0">
            <FolderCode className="w-4 h-4" />
          </div>
          <span className="text-xs font-semibold text-text truncate">
            {currentWorkspace?.name || 'Workspace'}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface2 text-muted border border-border">
            {filePaths.length} files
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Add file button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            title="Add files to workspace"
            aria-label="Add files"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* Download Zip */}
          <button
            type="button"
            onClick={handleDownload}
            title="Download workspace as zip"
            aria-label="Download zip"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Fullscreen toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Close panel */}
          <button
            type="button"
            onClick={() => {
              setWorkspacePanelOpen(false);
              setIsFullscreen(false);
            }}
            title="Close workspace panel"
            aria-label="Close panel"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-border px-3 bg-surface2/40 shrink-0 gap-1 py-1">
        <button
          type="button"
          onClick={() => {
            setActiveTab('files');
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'files'
              ? 'bg-surface text-text shadow-xs border border-border/80'
              : 'text-muted hover:text-text hover:bg-surface/50'
          }`}
        >
          <Folder className="w-3.5 h-3.5 text-accent" />
          <span>Files</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('changes');
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'changes'
              ? 'bg-surface text-text shadow-xs border border-border/80'
              : 'text-muted hover:text-text hover:bg-surface/50'
          }`}
        >
          <History className="w-3.5 h-3.5 text-accent" />
          <span>Changes ({checkpoints.length})</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-bg/40">
        {activeTab === 'files' ? (
          selectedFilePath ? (
            /* File Viewer */
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="h-10 px-3 border-b border-border bg-surface2/60 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedFilePath(null)}
                  className="flex items-center gap-1 text-xs text-accent hover:underline font-medium cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Files</span>
                </button>
                <span className="text-xs font-mono font-medium text-text truncate max-w-[240px]">
                  {selectedFilePath}
                </span>
              </div>
              <div className="flex-1 overflow-auto p-3 font-mono text-xs select-text">
                {isLoadingFile ? (
                  <div className="p-4 text-center text-muted">Loading file content...</div>
                ) : (
                  <div className="divide-y divide-border/10">
                    {(selectedFileContent || '').split('\n').map((line, idx) => (
                      <div key={idx} className="flex leading-5 hover:bg-surface2/30">
                        <span className="w-10 shrink-0 text-muted/50 select-none text-right pr-3 font-mono text-[11px]">
                          {idx + 1}
                        </span>
                        <span className="flex-1 whitespace-pre font-mono">{line || ' '}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* File Tree / List */
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-3">
              {/* Search Bar */}
              <div className="relative mb-2 shrink-0">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-border bg-surface text-xs text-text placeholder:text-muted focus:outline-hidden focus:border-accent"
                />
              </div>

              {/* Files list */}
              <div className="flex-1 overflow-y-auto rounded-xl border border-border bg-surface divide-y divide-border/30">
                {filteredPaths.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted">
                    {searchQuery ? 'No matching files found.' : 'No files in this workspace.'}
                  </div>
                ) : (
                  filteredPaths.map((path) => (
                    <button
                      key={path}
                      type="button"
                      onClick={() => handleSelectFile(path)}
                      className="w-full px-3 py-2 text-left flex items-center justify-between text-xs hover:bg-surface2/50 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileCode className="w-3.5 h-3.5 text-muted group-hover:text-accent shrink-0" />
                        <span className="font-mono text-text truncate">{path}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-muted/40 group-hover:text-muted shrink-0" />
                    </button>
                  ))
                )}
              </div>
            </div>
          )
        ) : (
          /* Changes Tab */
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {checkpoints.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted rounded-xl border border-border bg-surface">
                No checkpoints recorded yet. Changes made by AI edits will appear here.
              </div>
            ) : (
              checkpoints.map((cp) => {
                const isExpanded = Boolean(expandedCheckpoints[cp.id]);
                const isUndone = cp.label.includes('(undone)');
                return (
                  <div
                    key={cp.id}
                    className="rounded-xl border border-border bg-surface overflow-hidden shadow-xs"
                  >
                    {/* Checkpoint Header */}
                    <div className="px-3.5 py-2.5 flex items-center justify-between bg-surface2/30 border-b border-border/60">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCheckpoints((prev) => ({
                            ...prev,
                            [cp.id]: !prev[cp.id],
                          }))
                        }
                        className="flex items-center gap-2 min-w-0 text-left cursor-pointer flex-1"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-muted shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-text truncate">{cp.label}</p>
                          <p className="text-[10px] text-muted">
                            {new Date(cp.createdAt).toLocaleTimeString()} • {cp.changes?.length || 0}{' '}
                            change{(cp.changes?.length || 0) === 1 ? '' : 's'}
                          </p>
                        </div>
                      </button>

                      {!isUndone && (
                        <button
                          type="button"
                          onClick={() => handleUndo(cp.id)}
                          title="Undo this checkpoint"
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium border border-border bg-surface hover:bg-surface2 text-muted hover:text-text transition-colors flex items-center gap-1 cursor-pointer shrink-0 ml-2"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Undo</span>
                        </button>
                      )}
                    </div>

                    {/* Diff viewer inside expanded checkpoint */}
                    {isExpanded && (
                      <div className="p-3 space-y-2.5 bg-bg/40">
                        {(!cp.changes || cp.changes.length === 0) ? (
                          <div className="text-[11px] text-muted italic">No file changes recorded.</div>
                        ) : (
                          cp.changes.map((change, cIdx) => {
                            const isNew = change.before === null;
                            const isDel = change.after === null;
                            const diff = isNew
                              ? (change.after || '').split('\n').map((s) => ({ t: '+' as const, s }))
                              : isDel
                              ? (change.before || '').split('\n').map((s) => ({ t: '-' as const, s }))
                              : lineDiff(change.before || '', change.after || '');
                            return (
                              <div
                                key={cIdx}
                                className="rounded-lg border border-border bg-surface overflow-hidden text-xs font-mono"
                              >
                                <div className="px-3 py-1.5 bg-surface2/60 border-b border-border flex items-center justify-between text-[11px]">
                                  <div className="flex items-center gap-2 truncate">
                                    <span className="font-semibold text-text truncate">
                                      {change.path}
                                    </span>
                                    {isNew && (
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-sans">
                                        new
                                      </span>
                                    )}
                                    {isDel && (
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 font-sans">
                                        deleted
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="max-h-56 overflow-auto divide-y divide-border/20 p-2 font-mono text-[11px]">
                                  {diff.map((op, opIdx) => {
                                    const isAdd = op.t === '+';
                                    const isRemove = op.t === '-';
                                    return (
                                      <div
                                        key={opIdx}
                                        className={`flex items-start px-2 py-0.5 leading-4 whitespace-pre font-mono ${
                                          isAdd
                                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                            : isRemove
                                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                            : 'text-muted'
                                        }`}
                                      >
                                        <span className="w-3 shrink-0 select-none font-bold">
                                          {op.t}
                                        </span>
                                        <span className="flex-1">{op.s || ' '}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
