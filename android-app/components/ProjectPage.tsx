'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Folder,
  Plus,
  Trash2,
  FileText,
  FileCode,
  MessageSquare,
  Upload,
  Clock,
  Sparkles,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { useProjectsStore } from '@/store/projects';
import { useChatStore } from '@/store/chat';
import { useUIStore } from '@/store/ui';
import { formatFileSize } from '@/lib/files';

interface ProjectPageProps {
  projectId: string;
}

export function ProjectPage({ projectId }: ProjectPageProps) {
  const {
    projects,
    projectFiles,
    updateProject,
    deleteProject,
    loadProjectFiles,
    addKnowledgeFile,
    deleteKnowledgeFile,
    selectProject,
  } = useProjectsStore();

  const { chats, newChat, selectChat } = useChatStore();
  const { setActiveView } = useUIStore();

  const project = projects.find((p) => p.id === projectId);

  const [name, setName] = useState(project?.name || '');
  const [instructions, setInstructions] = useState(project?.instructions || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProjectFiles(projectId);
  }, [projectId, loadProjectFiles]);

  if (!project) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <Folder className="w-12 h-12 text-muted mb-3 opacity-40" />
        <h2 className="text-lg font-semibold text-text">Project not found</h2>
        <button
          type="button"
          onClick={() => {
            selectProject(null);
            setActiveView('chat');
          }}
          className="mt-4 px-4 py-2 rounded-xl bg-surface2 hover:bg-border text-xs font-medium text-text transition-colors"
        >
          Back to chats
        </button>
      </div>
    );
  }

  const projectChats = chats.filter((c) => c.projectId === projectId);

  const handleNameBlur = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== project.name) {
      updateProject(projectId, { name: trimmed });
    } else {
      setName(project.name);
    }
  };

  const handleInstructionsChange = (val: string) => {
    setInstructions(val);
    updateProject(projectId, { instructions: val });
  };

  const handleStartNewChat = () => {
    newChat(projectId);
    setActiveView('chat');
  };

  const handleSelectChat = (chatId: string) => {
    selectChat(chatId);
    setActiveView('chat');
  };

  const handleDeleteProject = async () => {
    await deleteProject(projectId);
    setActiveView('chat');
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const text = await file.text();
        await addKnowledgeFile(projectId, {
          name: file.name,
          text: text.slice(0, 100000), // budget cap per file
        });
      }
    } catch {
      // ignore
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFileSelect(e.dataTransfer.files);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className="flex-1 overflow-y-auto p-4 sm:p-8 max-w-4xl mx-auto w-full space-y-8"
    >
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0 mt-0.5">
            <Folder className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              placeholder="Project name"
              className="w-full text-xl sm:text-2xl font-bold text-text bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none transition-colors py-0.5"
            />
            <p className="text-xs text-muted mt-1 flex items-center gap-1.5">
              <span>{projectChats.length} chats</span>
              <span>•</span>
              <span>{projectFiles.length} knowledge files</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleStartNewChat}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-accent text-accent-fg hover:opacity-90 transition-opacity font-medium text-xs sm:text-sm cursor-pointer shadow-sm active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>New chat in this project</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            aria-label="Delete project"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-muted hover:text-rose-500 hover:bg-rose-500/10 border border-border transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-surface border border-border p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-text">Delete project?</h3>
                <p className="text-xs text-muted">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-text/80 leading-relaxed">
              Deleting <strong>&quot;{project.name}&quot;</strong> will permanently remove all of its knowledge files. Its chats will remain saved and will become normal chats.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-xl bg-surface2 hover:bg-border text-xs font-medium text-text transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteProject}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-xs font-semibold text-white transition-colors"
              >
                Delete project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instructions Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              <span>Project instructions</span>
            </h3>
            <p className="text-xs text-muted">
              Appended to the system prompt for all chats created inside this project
            </p>
          </div>
        </div>
        <textarea
          value={instructions}
          onChange={(e) => handleInstructionsChange(e.target.value)}
          placeholder="e.g. You are helping develop a Next.js application. Always prefer TypeScript, explain code decisions clearly, and format answers concisely."
          rows={5}
          className="w-full bg-surface border border-border focus:border-accent rounded-xl p-3.5 text-xs sm:text-sm text-text placeholder:text-muted focus:outline-none transition-colors resize-y min-h-[120px]"
        />
      </div>

      {/* Knowledge Files Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text">Knowledge files</h3>
            <p className="text-xs text-muted">
              Text, markdown, and code files loaded into context as reference knowledge
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface2 hover:bg-border text-xs font-medium text-text transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{isUploading ? 'Uploading...' : 'Add files'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.json,.csv,.js,.ts,.tsx,.py,.html,.css,.json5,.yaml,.yml"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
          />
        </div>

        {projectFiles.length === 0 ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`p-8 text-center rounded-2xl border-2 border-dashed transition-colors cursor-pointer ${
              isDragOver
                ? 'border-accent bg-accent/5'
                : 'border-border/80 bg-surface/40 hover:border-accent/40 hover:bg-surface2/30'
            }`}
          >
            <Upload className="w-8 h-8 text-muted mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium text-text">No knowledge files yet</p>
            <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
              Click or drag &amp; drop text, markdown, CSV, or code files here to give the model context.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {projectFiles.map((file) => {
              const isCode =
                file.name.endsWith('.ts') ||
                file.name.endsWith('.tsx') ||
                file.name.endsWith('.js') ||
                file.name.endsWith('.py') ||
                file.name.endsWith('.json');
              const Icon = isCode ? FileCode : FileText;
              return (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-surface border border-border group hover:border-accent/40 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg bg-surface2 flex items-center justify-center shrink-0 text-muted">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-text truncate">{file.name}</p>
                      <p className="text-[11px] text-muted">
                        {formatFileSize(file.text.length)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteKnowledgeFile(file.id)}
                    aria-label={`Delete ${file.name}`}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Project Chats Section */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text">
              Project chats ({projectChats.length})
            </h3>
            <p className="text-xs text-muted">
              Conversations associated with this project
            </p>
          </div>
          <button
            type="button"
            onClick={handleStartNewChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent text-accent-fg hover:opacity-90 text-xs font-medium transition-opacity cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New chat</span>
          </button>
        </div>

        {projectChats.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-dashed border-border bg-surface/40">
            <MessageSquare className="w-8 h-8 text-muted mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium text-text">No chats in this project yet</p>
            <p className="text-xs text-muted mt-1 max-w-xs mx-auto">
              Start your first conversation using this project&apos;s instructions and knowledge files.
            </p>
            <button
              type="button"
              onClick={handleStartNewChat}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-accent-fg text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              <span>Start project chat</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {projectChats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => handleSelectChat(chat.id)}
                className="flex items-center justify-between p-3.5 rounded-xl bg-surface border border-border hover:border-accent/40 hover:bg-surface2/50 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-lg bg-surface2 group-hover:bg-accent/10 flex items-center justify-center shrink-0 text-muted group-hover:text-accent transition-colors">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text truncate">
                      {chat.title || 'Untitled chat'}
                    </p>
                    <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>Updated {new Date(chat.updatedAt).toLocaleDateString()}</span>
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted group-hover:text-accent group-hover:translate-x-0.5 transition-all shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
