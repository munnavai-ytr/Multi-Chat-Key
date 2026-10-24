import { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Settings,
  MessageSquare,
  X,
  Search,
  Folder,
  ChevronDown,
  ChevronRight,
  FolderCode,
  Upload,
  Loader2,
  Edit2,
  Trash2,
  Download,
} from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { useChatStore } from '@/store/chat';
import { useProjectsStore } from '@/store/projects';
import { useWorkspacesStore } from '@/store/workspaces';
import { groupChats, searchChats } from '@/lib/history';
import { SidebarChatItem } from './SidebarChatItem';
import { ThemeToggle } from './ThemeToggle';
import { ChatRow } from '@/lib/db';

interface SidebarProps {
  isMobileDrawer?: boolean;
}

export function Sidebar({ isMobileDrawer = false }: SidebarProps) {
  const {
    setSidebarOpen,
    setSettingsOpen,
    activeView,
    setActiveView,
    setWorkspacePanelOpen,
    activeWorkspaceId,
    setActiveWorkspaceId,
  } = useUIStore();
  const {
    chats,
    activeChatId,
    selectChat,
    newChat,
    deleteChat,
    renameChat,
    togglePin,
  } = useChatStore();

  const {
    projects,
    activeProjectId,
    isProjectsOpen,
    toggleProjectsOpen,
    selectProject,
    createProject,
  } = useProjectsStore();

  const {
    workspaces,
    isWorkspacesOpen,
    toggleWorkspacesOpen,
    loadWorkspaces,
    selectWorkspace,
    createEmpty,
    importZipFile,
    exportZipFile,
    rename: renameWs,
    remove: removeWs,
  } = useWorkspacesStore();

  const [isImportingZip, setIsImportingZip] = useState(false);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [editingWsId, setEditingWsId] = useState<string | null>(null);
  const [editingWsName, setEditingWsName] = useState('');

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ChatRow[] | null>(null);
  const [displayLimit, setDisplayLimit] = useState(200);

  // Input ref for direct focus
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounced search (200ms)
  useEffect(() => {
    let active = true;
    const q = searchQuery.trim();

    const timer = setTimeout(() => {
      if (!q) {
        if (active) setSearchResults(null);
        return;
      }
      searchChats(q).then((results) => {
        if (active) {
          setSearchResults(results);
        }
      });
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const handleSelectChat = (chatId: string) => {
    selectChat(chatId);
    setActiveView('chat');
    if (isMobileDrawer) {
      setSidebarOpen(false);
    }
  };

  const handleNewChat = () => {
    newChat();
    setActiveView('chat');
    setSearchQuery('');
    if (isMobileDrawer) {
      setSidebarOpen(false);
    }
  };

  const handleSelectProject = (projectId: string) => {
    selectProject(projectId);
    setActiveView('project');
    if (isMobileDrawer) {
      setSidebarOpen(false);
    }
  };

  const handleCreateProject = async () => {
    const newId = await createProject('New Project');
    selectProject(newId);
    setActiveView('project');
    if (isMobileDrawer) {
      setSidebarOpen(false);
    }
  };

  const isSearchActive = Boolean(searchQuery.trim());
  const currentChatList = isSearchActive ? searchResults || [] : chats;
  const slicedChats = currentChatList.slice(0, displayLimit);
  const hasMore = currentChatList.length > displayLimit;

  const grouped = !isSearchActive ? groupChats(slicedChats) : [];

  return (
    <div className="flex flex-col h-full bg-surface select-none">
      {/* Top Header / Brand */}
      <div className="p-3 border-b border-border flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-accent-fg font-semibold text-sm shrink-0">
            C
          </div>
          <span className="font-semibold text-base text-text tracking-tight truncate">
            Chatly
          </span>
        </div>

        {isMobileDrawer ? (
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <ThemeToggle />
        )}
      </div>

      {/* New chat button */}
      <div className="p-3 pb-2 shrink-0 space-y-2">
        <button
          type="button"
          onClick={handleNewChat}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-[12px] bg-surface2 hover:bg-border/60 text-text font-medium text-sm transition-colors active:scale-[0.99] cursor-pointer"
        >
          <Plus className="w-4 h-4 text-muted" />
          <span>New chat</span>
        </button>

        {/* Search input under New chat */}
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2.5 text-muted pointer-events-none" />
          <input
            id="chat-search-input"
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats... (Cmd+K)"
            className="w-full bg-surface2/70 hover:bg-surface2 focus:bg-surface border border-border/70 focus:border-accent rounded-[10px] pl-8 pr-7 py-1.5 text-xs text-text placeholder:text-muted focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-2 text-muted hover:text-text p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Projects section */}
      {!isSearchActive && (
        <div className="px-3 pb-2 shrink-0 border-b border-border/60">
          <div className="flex items-center justify-between py-1">
            <button
              type="button"
              onClick={toggleProjectsOpen}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-muted uppercase tracking-wider hover:text-text transition-colors cursor-pointer"
            >
              {isProjectsOpen ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              <span>Projects ({projects.length})</span>
            </button>

            <button
              type="button"
              onClick={handleCreateProject}
              title="New project"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>New</span>
            </button>
          </div>

          {isProjectsOpen && (
            <div className="mt-1 space-y-0.5">
              {projects.length === 0 ? (
                <p className="px-2 py-1 text-[11px] text-muted/70 italic">
                  No projects yet
                </p>
              ) : (
                projects.map((proj) => {
                  const isProjectSelected =
                    activeView === 'project' && activeProjectId === proj.id;
                  return (
                    <button
                      key={proj.id}
                      type="button"
                      onClick={() => handleSelectProject(proj.id)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[10px] text-xs transition-colors cursor-pointer text-left truncate ${
                        isProjectSelected
                          ? 'bg-surface2 text-text font-medium'
                          : 'text-muted hover:text-text hover:bg-surface2/60'
                      }`}
                    >
                      <Folder className="w-3.5 h-3.5 shrink-0 text-accent/80" />
                      <span className="truncate">{proj.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* Collapsible Workspaces section */}
      {!isSearchActive && (
        <div className="px-3 pb-2 shrink-0 border-b border-border/60">
          <div className="flex items-center justify-between py-1">
            <button
              type="button"
              onClick={toggleWorkspacesOpen}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-muted uppercase tracking-wider hover:text-text transition-colors cursor-pointer"
            >
              {isWorkspacesOpen ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              <span>Workspaces ({workspaces.length})</span>
            </button>

            <div className="flex items-center gap-1">
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setIsImportingZip(true);
                  try {
                    const id = await importZipFile(file);
                    selectWorkspace(id);
                    setActiveWorkspaceId(id);
                    setWorkspacePanelOpen(true);
                    newChat(undefined, id);
                    setActiveView('chat');
                    if (isMobileDrawer) setSidebarOpen(false);
                    useUIStore.getState().showToast('Workspace imported', 2000);
                  } catch (err: any) {
                    useUIStore
                      .getState()
                      .showToast('Import failed: ' + (err.message || 'Error'), 4000);
                  } finally {
                    setIsImportingZip(false);
                    if (zipInputRef.current) zipInputRef.current.value = '';
                  }
                }}
                className="hidden"
              />

              <button
                type="button"
                disabled={isImportingZip}
                onClick={() => zipInputRef.current?.click()}
                title="Import workspace zip"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer"
              >
                {isImportingZip ? (
                  <Loader2 className="w-3 h-3 animate-spin text-accent" />
                ) : (
                  <Upload className="w-3 h-3" />
                )}
                <span>Import</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  const id = await createEmpty('New Workspace');
                  selectWorkspace(id);
                  setActiveWorkspaceId(id);
                  setWorkspacePanelOpen(true);
                  newChat(undefined, id);
                  setActiveView('chat');
                  if (isMobileDrawer) setSidebarOpen(false);
                }}
                title="New empty workspace"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Empty</span>
              </button>
            </div>
          </div>

          {isWorkspacesOpen && (
            <div className="mt-1 space-y-0.5">
              {workspaces.length === 0 ? (
                <p className="px-2 py-1 text-[11px] text-muted/70 italic">
                  No workspaces yet
                </p>
              ) : (
                workspaces.map((ws) => {
                  const isSelected = activeWorkspaceId === ws.id;
                  const isRenaming = editingWsId === ws.id;

                  return (
                    <div
                      key={ws.id}
                      className={`group flex items-center justify-between px-2 py-1 rounded-[10px] text-xs transition-colors ${
                        isSelected
                          ? 'bg-surface2 text-text font-medium'
                          : 'text-muted hover:text-text hover:bg-surface2/60'
                      }`}
                    >
                      {isRenaming ? (
                        <input
                          autoFocus
                          type="text"
                          value={editingWsName}
                          onChange={(e) => setEditingWsName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const trimmed = editingWsName.trim();
                              if (trimmed && trimmed !== ws.name) {
                                renameWs(ws.id, trimmed);
                              }
                              setEditingWsId(null);
                            } else if (e.key === 'Escape') {
                              setEditingWsId(null);
                            }
                          }}
                          onBlur={() => {
                            const trimmed = editingWsName.trim();
                            if (trimmed && trimmed !== ws.name) {
                              renameWs(ws.id, trimmed);
                            }
                            setEditingWsId(null);
                          }}
                          className="bg-surface border border-accent rounded px-1.5 py-0.5 text-xs text-text w-full focus:outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            selectWorkspace(ws.id);
                            setActiveWorkspaceId(ws.id);
                            setWorkspacePanelOpen(true);
                            newChat(undefined, ws.id);
                            setActiveView('chat');
                            if (isMobileDrawer) setSidebarOpen(false);
                          }}
                          className="flex items-center gap-2 min-w-0 text-left flex-1 cursor-pointer truncate"
                        >
                          <FolderCode className="w-3.5 h-3.5 shrink-0 text-accent/80" />
                          <span className="truncate">{ws.name}</span>
                        </button>
                      )}

                      {!isRenaming && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              exportZipFile(ws.id);
                            }}
                            title="Download zip"
                            aria-label="Download zip"
                            className="p-1 hover:text-text text-muted rounded cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingWsId(ws.id);
                              setEditingWsName(ws.name);
                            }}
                            title="Rename"
                            aria-label="Rename workspace"
                            className="p-1 hover:text-text text-muted rounded cursor-pointer"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeWs(ws.id);
                              useUIStore.getState().showToast(`Deleted workspace "${ws.name}"`, 3000);
                            }}
                            title="Delete"
                            aria-label="Delete workspace"
                            className="p-1 hover:text-rose-500 text-muted rounded cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* Chat list area */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
        {chats.length === 0 ? (
          <div className="h-full px-3 py-8 flex flex-col items-center justify-center text-center">
            <div className="w-10 h-10 rounded-full bg-surface2 flex items-center justify-center text-muted mb-2.5">
              <MessageSquare className="w-4 h-4 text-muted" />
            </div>
            <p className="text-sm font-medium text-text">No chats yet</p>
            <p className="text-xs text-muted mt-1 max-w-[200px]">
              Your conversations will appear here
            </p>
          </div>
        ) : isSearchActive ? (
          // While searching: flat list or "No results"
          currentChatList.length === 0 ? (
            <div className="py-8 px-3 text-center">
              <p className="text-xs font-medium text-text">No results found</p>
              <p className="text-[11px] text-muted mt-1">
                No chats or messages match &quot;{searchQuery}&quot;
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="px-2 pt-1 pb-1 text-[11px] font-semibold text-muted uppercase tracking-wider">
                Search Results ({currentChatList.length})
              </div>
              {slicedChats.map((chat) => (
                <SidebarChatItem
                  key={chat.id}
                  chat={chat}
                  isActive={activeChatId === chat.id}
                  onSelect={handleSelectChat}
                  onRename={renameChat}
                  onTogglePin={togglePin}
                  onDelete={deleteChat}
                />
              ))}
            </div>
          )
        ) : (
          // Normal mode: groupChats sections with small uppercase muted headings
          <div className="space-y-3">
            {grouped.map((group) => (
              <div key={group.label} className="space-y-0.5">
                <div className="px-2 text-[10px] sm:text-[11px] font-semibold text-muted uppercase tracking-wider">
                  {group.label}
                </div>
                {group.items.map((chat) => (
                  <SidebarChatItem
                    key={chat.id}
                    chat={chat}
                    isActive={activeChatId === chat.id}
                    onSelect={handleSelectChat}
                    onRename={renameChat}
                    onTogglePin={togglePin}
                    onDelete={deleteChat}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Max 200 rows pagination: Show more button */}
        {hasMore && (
          <div className="p-2 text-center">
            <button
              type="button"
              onClick={() => setDisplayLimit((prev) => prev + 100)}
              className="text-xs text-accent hover:underline font-medium cursor-pointer"
            >
              Show more ({currentChatList.length - displayLimit} remaining)
            </button>
          </div>
        )}
      </div>

      {/* Settings button at the bottom */}
      <div className="p-3 border-t border-border shrink-0 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            if (isMobileDrawer) setSidebarOpen(false);
            setSettingsOpen(true);
          }}
          className="flex-1 flex items-center gap-2.5 px-3 py-2 rounded-[12px] text-muted hover:text-text hover:bg-surface2 transition-colors text-sm font-medium text-left cursor-pointer"
        >
          <Settings className="w-4 h-4 text-muted shrink-0" />
          <span>Settings</span>
        </button>
        {isMobileDrawer && (
          <div className="shrink-0 pl-1">
            <ThemeToggle />
          </div>
        )}
      </div>
    </div>
  );
}
