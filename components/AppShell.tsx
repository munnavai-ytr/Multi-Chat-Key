'use client';

import { useEffect } from 'react';
import { Menu, Folder, Ghost, Sparkles } from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { useKeysStore } from '@/store/keys';
import { useChatStore } from '@/store/chat';
import { useProjectsStore } from '@/store/projects';
import { Sidebar } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';
import { ChatMessagesList } from './ChatMessagesList';
import { ChatInput } from './ChatInput';
import { SettingsModal } from './SettingsModal';
import { ModelPicker, ModelPickerTrigger } from './ModelPicker';
import { ProjectPage } from './ProjectPage';

export function AppShell() {
  const { sidebarOpen, setSidebarOpen, activeView, setActiveView, toastMessage } = useUIStore();
  const { loadKeys, checkKeysHealth } = useKeysStore();
  const {
    loadChats,
    chats,
    activeChatId,
    draftProjectId,
    draftIncognito,
    toggleIncognito,
    setDraftIncognito,
  } = useChatStore();
  const { activeProjectId, projects, selectProject, loadProjects } = useProjectsStore();

  useEffect(() => {
    // Load keys, chats, and projects on app open
    Promise.all([loadKeys(), loadChats(), loadProjects()]).then(() => {
      // Silently re-validate keys older than 6 hours sequentially
      checkKeysHealth();
    });
  }, [loadKeys, loadChats, loadProjects, checkKeysHealth]);

  // Global shortcuts: Ctrl/Cmd+K (search), Ctrl/Cmd+Shift+O (new chat)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && e.shiftKey && (e.key === 'O' || e.key === 'o')) {
        e.preventDefault();
        useChatStore.getState().newChat();
        useUIStore.getState().setSidebarOpen(false);
        return;
      }
      if (isCmdOrCtrl && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        useUIStore.getState().setSidebarOpen(true);
        setTimeout(() => {
          const el = document.getElementById('chat-search-input') as HTMLInputElement | null;
          el?.focus();
        }, 50);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const currentChat = chats.find((c) => c.id === activeChatId);
  const isIncognito = currentChat ? Boolean(currentChat.incognito) : draftIncognito;

  const handleToggleIncognito = () => {
    if (activeChatId) {
      toggleIncognito(activeChatId);
    } else {
      setDraftIncognito(!draftIncognito);
    }
  };

  const associatedProjectId = currentChat?.projectId || draftProjectId;
  const associatedProject = associatedProjectId
    ? projects.find((p) => p.id === associatedProjectId)
    : null;

  return (
    <div className="flex h-dvh w-screen overflow-hidden bg-bg text-text">
      {/* Mobile Drawer Backdrop (animates opacity only: 180ms) */}
      <div
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/45 md:hidden transition-opacity duration-[180ms] ease-out ${
          sidebarOpen
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Mobile Slide-in Left Drawer (animates transform: translateX only: 180ms) */}
      <aside
        aria-label="Navigation drawer"
        className={`fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] border-r border-border bg-surface md:hidden transition-transform duration-[180ms] ease-out will-change-transform shadow-xl ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
      >
        <Sidebar isMobileDrawer />
      </aside>

      {/* Desktop Permanent 280px Left Sidebar */}
      <aside className="hidden md:flex w-[280px] shrink-0 border-r border-border bg-surface flex-col h-full">
        <Sidebar isMobileDrawer={false} />
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
        {/* Mobile Top Bar (<768px) */}
        <header className="md:hidden h-14 border-b border-border bg-surface/95 backdrop-blur-sm px-3 flex items-center justify-between shrink-0 z-20 gap-2">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface2 transition-colors active:scale-95 shrink-0 cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex-1 flex justify-center min-w-0">
            <ModelPickerTrigger />
          </div>

          <div className="shrink-0 flex items-center gap-1">
            <button
              type="button"
              onClick={handleToggleIncognito}
              aria-label={isIncognito ? 'Incognito mode on (memory paused)' : 'Turn on incognito mode'}
              title={isIncognito ? 'Incognito mode on (memory paused)' : 'Turn on incognito mode'}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                isIncognito
                  ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30'
                  : 'text-muted hover:text-text hover:bg-surface2'
              }`}
            >
              <Ghost className="w-4 h-4" />
            </button>
            <ThemeToggle />
          </div>
        </header>

        {/* Desktop Top Bar (>=768px) */}
        <header className="hidden md:flex h-14 border-b border-border bg-surface/50 backdrop-blur-xs px-4 items-center justify-between shrink-0 z-10">
          <ModelPickerTrigger />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleIncognito}
              aria-label={isIncognito ? 'Incognito mode on (memory paused)' : 'Turn on incognito mode'}
              title={isIncognito ? 'Incognito mode on (memory paused)' : 'Turn on incognito mode'}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer border ${
                isIncognito
                  ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30'
                  : 'border-transparent text-muted hover:text-text hover:bg-surface2'
              }`}
            >
              <Ghost className="w-4 h-4" />
              <span>{isIncognito ? 'Incognito On' : 'Incognito'}</span>
            </button>
            <ThemeToggle />
          </div>
        </header>

        {/* Incognito Notice Banner if active */}
        {isIncognito && (
          <div className="bg-purple-500/10 border-b border-purple-500/20 px-4 py-1.5 flex items-center justify-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 shrink-0">
            <Ghost className="w-3.5 h-3.5" />
            <span className="font-medium">Incognito mode — this chat neither reads nor writes memory</span>
          </div>
        )}

        {/* Main Content Area: Project Page OR Chat View */}
        {activeView === 'project' && activeProjectId ? (
          <ProjectPage key={activeProjectId} projectId={activeProjectId} />
        ) : (
          <>
            {/* Project association indicator if chat belongs to a project */}
            {associatedProject && (
              <div className="bg-surface2/60 border-b border-border/80 px-4 py-1.5 flex items-center justify-between text-xs shrink-0">
                <div className="flex items-center gap-1.5 text-muted truncate">
                  <Folder className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span className="font-medium text-text truncate">
                    Project: {associatedProject.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    selectProject(associatedProject.id);
                    setActiveView('project');
                  }}
                  className="text-accent hover:underline text-xs font-medium cursor-pointer shrink-0 ml-2"
                >
                  View project
                </button>
              </div>
            )}

            {/* Chat Messages or Empty State */}
            <ChatMessagesList />

            {/* Fixed Bottom Input Bar */}
            <ChatInput />
          </>
        )}
      </main>

      {/* Subtle Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-3.5 py-1.5 rounded-full bg-surface2/95 border border-border text-xs font-medium text-text shadow-xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Settings Modal (API Keys Management & Long-term Memory) */}
      <SettingsModal />

      {/* Searchable Model Picker (Bottom Sheet on Mobile, Modal on Desktop) */}
      <ModelPicker />
    </div>
  );
}
