'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChatRow } from '@/lib/db';
import {
  MessageSquare,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react';

interface SidebarChatItemProps {
  chat: ChatRow;
  isActive: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onTogglePin: (id: string) => void;
  onDelete: (id: string) => void;
}

export const SidebarChatItem = React.memo(function SidebarChatItem({
  chat,
  isActive,
  onSelect,
  onRename,
  onTogglePin,
  onDelete,
}: SidebarChatItemProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [editTitle, setEditTitle] = useState(chat.title);
  const [menuOpen, setMenuOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync edit title if chat title changes externally
  useEffect(() => {
    setEditTitle(chat.title);
  }, [chat.title]);

  // Focus input on rename mode
  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isRenaming]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [menuOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = editTitle.trim();
      if (trimmed) {
        onRename(chat.id, trimmed);
      }
      setIsRenaming(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditTitle(chat.title);
      setIsRenaming(false);
    }
  };

  const handleBlur = () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== chat.title) {
      onRename(chat.id, trimmed);
    } else {
      setEditTitle(chat.title);
    }
    setIsRenaming(false);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (window.confirm('Delete this chat?')) {
      onDelete(chat.id);
    }
  };

  return (
    <div
      className={`group relative flex items-center gap-2 px-2.5 py-1.5 rounded-[12px] transition-colors cursor-pointer select-none ${
        isActive
          ? 'bg-surface2 text-text font-medium'
          : 'text-muted hover:text-text hover:bg-surface2/60'
      }`}
      onClick={() => {
        if (!isRenaming) {
          onSelect(chat.id);
        }
      }}
    >
      {/* Icon: Pin icon if pinned, otherwise MessageSquare */}
      {chat.pinned ? (
        <Pin className="w-3.5 h-3.5 shrink-0 text-accent rotate-45" />
      ) : (
        <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-70" />
      )}

      {/* Title or inline rename input */}
      <div className="flex-1 min-w-0 pr-6">
        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-surface border border-accent rounded-md px-1.5 py-0.5 text-xs text-text focus:outline-none"
          />
        ) : (
          <span className="block text-xs sm:text-sm truncate">
            {chat.title || 'Untitled chat'}
          </span>
        )}
      </div>

      {/* "..." menu button */}
      {!isRenaming && (
        <div
          ref={menuRef}
          className="absolute right-1.5 top-1/2 -translate-y-1/2"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((prev) => !prev);
            }}
            aria-label="Chat options"
            className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-text hover:bg-surface border border-transparent hover:border-border transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          {/* Dropdown Menu */}
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-32 rounded-xl bg-surface border border-border shadow-lg p-1 z-30 space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  setIsRenaming(true);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-text hover:bg-surface2 transition-colors text-left"
              >
                <Pencil className="w-3.5 h-3.5 text-muted" />
                <span>Rename</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onTogglePin(chat.id);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-text hover:bg-surface2 transition-colors text-left"
              >
                {chat.pinned ? (
                  <>
                    <PinOff className="w-3.5 h-3.5 text-muted" />
                    <span>Unpin</span>
                  </>
                ) : (
                  <>
                    <Pin className="w-3.5 h-3.5 text-muted" />
                    <span>Pin</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDelete}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-rose-500 hover:bg-rose-500/10 transition-colors text-left"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
