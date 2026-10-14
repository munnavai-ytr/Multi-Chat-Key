'use client';

import { useEffect } from 'react';
import { Menu } from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { useKeysStore } from '@/store/keys';
import { useChatStore } from '@/store/chat';
import { Sidebar } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';
import { ChatMessagesList } from './ChatMessagesList';
import { ChatInput } from './ChatInput';
import { SettingsModal } from './SettingsModal';
import { ModelPicker, ModelPickerTrigger } from './ModelPicker';

export function AppShell() {
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const { loadKeys, checkKeysHealth } = useKeysStore();
  const { loadChats } = useChatStore();

  useEffect(() => {
    // Load keys and chats on app open
    Promise.all([loadKeys(), loadChats()]).then(() => {
      // Silently re-validate keys older than 6 hours sequentially
      checkKeysHealth();
    });
  }, [loadKeys, loadChats, checkKeysHealth]);

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

          <div className="shrink-0">
            <ThemeToggle />
          </div>
        </header>

        {/* Desktop Top Bar (>=768px) */}
        <header className="hidden md:flex h-14 border-b border-border bg-surface/50 backdrop-blur-xs px-4 items-center justify-between shrink-0 z-10">
          <ModelPickerTrigger />
          <ThemeToggle />
        </header>

        {/* Main Content Area: Chat Messages or Empty State */}
        <ChatMessagesList />

        {/* Fixed Bottom Input Bar */}
        <ChatInput />
      </main>

      {/* Settings Modal (API Keys Management) */}
      <SettingsModal />

      {/* Searchable Model Picker (Bottom Sheet on Mobile, Modal on Desktop) */}
      <ModelPicker />
    </div>
  );
}
