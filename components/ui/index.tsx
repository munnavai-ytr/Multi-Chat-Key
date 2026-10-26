'use client';

import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { haptic } from '@/lib/haptics';

/* -------------------------------------------------------------------------- */
/*                                SPARK LOADER                                */
/* -------------------------------------------------------------------------- */
export interface SparkLoaderProps {
  size?: number;
  className?: string;
}

export function SparkLoader({ size = 18, className = '' }: SparkLoaderProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`spark-spin shrink-0 ${className}`}
      style={{ willChange: 'transform, opacity' }}
    >
      <path
        d="M12 2C12 7.52285 16.4771 12 22 12C16.4771 12 12 16.4771 12 22C12 16.4771 7.52285 12 2 12C7.52285 12 12 7.52285 12 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   BUTTON                                   */
/* -------------------------------------------------------------------------- */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  haptics?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon,
  children,
  disabled,
  onClick,
  type = 'button',
  haptics = true,
  className = '',
  ...rest
}: ButtonProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || loading) return;
    if (haptics) haptic('light');
    if (onClick) onClick(e);
  };

  const variantStyles = {
    primary:
      'bg-[var(--grad)] text-[var(--accent-fg)] shadow-xs border border-white/10 hover:opacity-95 active:scale-[0.97]',
    secondary:
      'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)] active:scale-[0.98]',
    ghost:
      'bg-transparent text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] active:scale-[0.98]',
    danger:
      'bg-[var(--danger-soft)] text-[var(--danger)] border border-rose-500/20 hover:bg-rose-500/20 active:scale-[0.98]',
  };

  const sizeStyles = {
    sm: 'h-8 px-3 text-xs rounded-[var(--radius-sm)] gap-1.5 min-h-[36px]',
    md: 'min-h-[44px] px-4 py-2 text-xs sm:text-sm rounded-[var(--radius-md)] gap-2',
    lg: 'min-h-[48px] px-5 py-2.5 text-sm sm:text-base rounded-[var(--radius-lg)] gap-2.5',
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={handleClick}
      className={`inline-flex items-center justify-center font-medium transition-all duration-150 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 ${
        variantStyles[variant]
      } ${sizeStyles[size]} ${
        disabled || loading ? 'opacity-40 cursor-not-allowed active:scale-100' : ''
      } ${className}`}
      {...rest}
    >
      {loading ? (
        <SparkLoader size={16} />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      {children && <span>{children}</span>}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 ICON BUTTON                                */
/* -------------------------------------------------------------------------- */
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  haptics?: boolean;
  ariaLabel?: string;
}

export function IconButton({
  variant = 'ghost',
  size = 'md',
  loading,
  children,
  disabled,
  onClick,
  haptics = true,
  ariaLabel,
  'aria-label': ariaLabelHyphen,
  className = '',
  ...rest
}: IconButtonProps) {
  const computedAriaLabel = ariaLabel || ariaLabelHyphen;
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || loading) return;
    if (haptics) haptic('light');
    if (onClick) onClick(e);
  };

  const sizeStyles = {
    sm: 'w-8 h-8 text-xs rounded-[var(--radius-sm)]',
    md: 'w-11 h-11 text-sm rounded-[var(--radius-md)]',
    lg: 'w-12 h-12 text-base rounded-[var(--radius-lg)]',
  };

  const variantStyles = {
    primary:
      'bg-[var(--grad)] text-[var(--accent-fg)] border border-white/10 active:scale-[0.97]',
    secondary:
      'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--surface-3)] active:scale-[0.98]',
    ghost:
      'bg-transparent text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] active:scale-[0.98]',
    danger:
      'bg-[var(--danger-soft)] text-[var(--danger)] hover:bg-rose-500/20 active:scale-[0.98]',
  };

  return (
    <button
      type="button"
      aria-label={computedAriaLabel}
      disabled={disabled || loading}
      onClick={handleClick}
      className={`inline-flex items-center justify-center transition-all duration-150 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 ${
        variantStyles[variant]
      } ${sizeStyles[size]} ${
        disabled || loading ? 'opacity-40 cursor-not-allowed active:scale-100' : ''
      } ${className}`}
      {...rest}
    >
      {loading ? <SparkLoader size={16} /> : children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    CARD                                    */
/* -------------------------------------------------------------------------- */
export interface CardProps {
  children: React.ReactNode;
  glass?: boolean;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, glass = false, className = '', onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-[var(--radius-lg)] border border-[var(--border)] transition-all ${
        glass ? 'glass' : 'bg-[var(--surface)]'
      } ${onClick ? 'cursor-pointer hover:border-[var(--border-strong)] select-none' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    SHEET                                   */
/* -------------------------------------------------------------------------- */
export interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Sheet({ isOpen, onClose, title, children, className = '' }: SheetProps) {
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      setOffsetY(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePointerDown = (e: React.PointerEvent) => {
    startYRef.current = e.clientY;
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const deltaY = e.clientY - startYRef.current;
    if (deltaY > 0) {
      setOffsetY(deltaY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    if (offsetY > 100) {
      haptic('light');
      onClose();
    } else {
      setOffsetY(0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center">
      {/* Backdrop */}
      <div
        onClick={() => {
          haptic('light');
          onClose();
        }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fadeIn"
      />

      {/* Sheet Modal Body */}
      <div
        style={{
          transform: `translateY(${offsetY}px)`,
          transition: isDragging ? 'none' : 'transform 200ms cubic-bezier(.2,.8,.2,1)',
        }}
        className={`relative z-10 w-full sm:max-w-lg max-h-[90vh] flex flex-col rounded-t-[var(--radius-xl)] sm:rounded-[var(--radius-xl)] border border-[var(--border)] glass shadow-[var(--shadow-pop)] overflow-hidden ${className}`}
      >
        {/* Drag Handle */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="w-full py-3 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none shrink-0"
        >
          <div className="w-10 h-1 rounded-full bg-[var(--border-strong)]" />
          {title && (
            <h3 className="mt-2 text-sm font-semibold text-[var(--text)] tracking-tight">
              {title}
            </h3>
          )}
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   DIALOG                                   */
/* -------------------------------------------------------------------------- */
export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  className = '',
}: DialogProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fadeIn"
      />
      <div
        className={`relative z-10 w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--border)] glass shadow-[var(--shadow-pop)] p-5 sm:p-6 space-y-4 step-in ${className}`}
      >
        {(title || description) && (
          <div className="space-y-1">
            {title && (
              <h2 className="text-lg font-semibold text-[var(--text)] tracking-tight">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed">
                {description}
              </p>
            )}
          </div>
        )}

        <div>{children}</div>

        {footer && <div className="pt-2 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    TABS                                    */
/* -------------------------------------------------------------------------- */
export interface TabOption<T extends string> {
  id?: T;
  value?: T;
  label: string;
  icon?: React.ReactNode;
}

export interface TabsProps<T extends string> {
  activeTab?: T;
  value?: T;
  tabs?: TabOption<T>[];
  options?: TabOption<T>[];
  onChange: (id: T) => void;
  className?: string;
}

export function Tabs<T extends string>({
  activeTab,
  value,
  tabs,
  options,
  onChange,
  className = '',
}: TabsProps<T>) {
  const active = activeTab ?? value;
  const list = tabs ?? options ?? [];
  return (
    <div
      className={`flex items-center gap-1 p-1 bg-[var(--surface-2)] rounded-[var(--radius-md)] border border-[var(--border)] ${className}`}
    >
      {list.map((tab, idx) => {
        const tabId = (tab.id ?? tab.value) as T;
        const isActive = tabId === active;
        const itemKey = tabId ? `tab-${tabId}` : `tab-opt-${idx}`;
        return (
          <button
            key={itemKey}
            type="button"
            onClick={() => {
              haptic('light');
              onChange(tabId);
            }}
            className={`relative flex-1 py-1.5 px-3 min-h-[36px] text-xs sm:text-sm font-medium rounded-[var(--radius-sm)] transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 ${
              isActive ? 'text-[var(--text)] shadow-xs' : 'text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {isActive && (
              <span
                className="absolute inset-0 bg-[var(--surface)] rounded-[var(--radius-sm)] border border-[var(--border-strong)] z-0"
                style={{ transition: 'all 200ms cubic-bezier(.34,1.56,.64,1)' }}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {tab.icon}
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  SEGMENTED                                 */
/* -------------------------------------------------------------------------- */
export type SegmentedProps<T extends string> = TabsProps<T>;
export const Segmented = Tabs;

/* -------------------------------------------------------------------------- */
/*                                   SWITCH                                   */
/* -------------------------------------------------------------------------- */
export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  ariaLabel?: string;
  'aria-label'?: string;
}

export function Switch({ checked, onChange, disabled, label, ariaLabel, 'aria-label': ariaLabelHyphen }: SwitchProps) {
  const computedAriaLabel = ariaLabel || ariaLabelHyphen || label;
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    haptic('light');
    onChange(!checked);
  };

  return (
    <div className="inline-flex items-center gap-2.5 cursor-pointer select-none" onClick={handleClick}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={computedAriaLabel}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 ${
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--surface-3)] border border-[var(--border)]'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        <span
          style={{ transition: 'transform 200ms cubic-bezier(.34,1.56,.64,1)' }}
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-xs transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
      {label && <span className="text-xs sm:text-sm font-medium text-[var(--text)]">{label}</span>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                INPUT / TEXTAREA / SELECT                   */
/* -------------------------------------------------------------------------- */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  value: string;
  onChange: (val: string) => void;
  error?: string | null;
  helper?: React.ReactNode;
  trailing?: React.ReactNode;
}

export function Input({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
  required,
  error,
  helper,
  trailing,
  className = '',
  ...rest
}: InputProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-[var(--text)] tracking-tight">
          {label} {required && <span className="text-[var(--danger)]">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={`w-full min-h-[44px] px-3.5 py-2.5 bg-[var(--surface)] border rounded-[var(--radius-md)] text-xs sm:text-sm text-[var(--text)] placeholder:text-[var(--muted)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 ${
            error
              ? 'border-rose-500/50 focus-visible:ring-rose-500/30'
              : 'border-[var(--border)] focus:border-[var(--accent)]'
          } ${trailing ? 'pr-11' : ''} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
          {...rest}
        />
        {trailing && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
            {trailing}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-[var(--danger)] font-medium">{error}</p>}
      {!error && helper && <div className="text-xs text-[var(--muted)] leading-relaxed">{helper}</div>}
    </div>
  );
}

export interface TextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  label?: string;
  value: string;
  onChange: (val: string) => void;
  error?: string | null;
  helper?: React.ReactNode;
}

export function Textarea({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  required,
  error,
  helper,
  rows = 4,
  className = '',
  ...rest
}: TextareaProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-[var(--text)] tracking-tight">
          {label} {required && <span className="text-[var(--danger)]">*</span>}
        </label>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        rows={rows}
        className={`w-full p-3.5 bg-[var(--surface)] border rounded-[var(--radius-md)] text-xs sm:text-sm text-[var(--text)] placeholder:text-[var(--muted)] transition-all resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 ${
          error
            ? 'border-rose-500/50 focus-visible:ring-rose-500/30'
            : 'border-[var(--border)] focus:border-[var(--accent)]'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        {...rest}
      />
      {error && <p className="text-xs text-[var(--danger)] font-medium">{error}</p>}
      {!error && helper && <div className="text-xs text-[var(--muted)] leading-relaxed">{helper}</div>}
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label?: string;
  value: string;
  onChange: (val: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  helper?: React.ReactNode;
  className?: string;
}

export function Select({
  label,
  value,
  onChange,
  options,
  disabled,
  helper,
  className = '',
}: SelectProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && <label className="block text-xs font-semibold text-[var(--text)]">{label}</label>}
      <select
        value={value}
        onChange={(e) => {
          haptic('light');
          onChange(e.target.value);
        }}
        disabled={disabled}
        className="w-full min-h-[44px] px-3.5 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] text-xs sm:text-sm text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 transition-all cursor-pointer disabled:opacity-40"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {helper && <div className="text-xs text-[var(--muted)] leading-relaxed">{helper}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                TOAST SYSTEM                                */
/* -------------------------------------------------------------------------- */
export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastContextType {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType>({
  addToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    haptic(type === 'error' ? 'error' : type === 'success' ? 'success' : 'light');
    setToasts((prev) => [...prev, { id, type, message }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Toast Container Stacked at Top */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4 space-y-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            onClick={() => removeToast(toast.id)}
            className={`pointer-events-auto flex items-center gap-3 p-3.5 rounded-[var(--radius-md)] border glass shadow-pop step-in cursor-pointer select-none text-xs sm:text-sm ${
              toast.type === 'error'
                ? 'border-rose-500/30 text-rose-500 bg-[var(--danger-soft)]'
                : toast.type === 'success'
                ? 'border-emerald-500/30 text-emerald-500 bg-[var(--success-soft)]'
                : 'border-[var(--border)] text-[var(--text)] bg-[var(--surface-2)]'
            }`}
          >
            <span className="font-medium flex-1">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  SKELETON                                  */
/* -------------------------------------------------------------------------- */
export interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className = '', width, height }: SkeletonProps) {
  return (
    <div
      style={{ width, height }}
      className={`bg-[var(--surface-3)] animate-pulse rounded-[var(--radius-sm)] ${className}`}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                 BADGE / PILL                               */
/* -------------------------------------------------------------------------- */
export interface BadgeProps {
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';
  children: React.ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  const toneStyles = {
    success: 'bg-[var(--success-soft)] text-[var(--success)] border-emerald-500/20',
    warning: 'bg-[var(--warning-soft)] text-[var(--warning)] border-amber-500/20',
    danger: 'bg-[var(--danger-soft)] text-[var(--danger)] border-rose-500/20',
    info: 'bg-[var(--info-soft)] text-[var(--info)] border-sky-500/20',
    accent: 'bg-[var(--grad-soft)] text-[var(--accent)] border-[var(--accent)]/30',
    neutral: 'bg-[var(--surface-2)] text-[var(--muted)] border-[var(--border)]',
  };

  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border inline-flex items-center gap-1.5 shrink-0 select-none ${toneStyles[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
export const Pill = Badge;

/* -------------------------------------------------------------------------- */
/*                                   TOOLTIP                                  */
/* -------------------------------------------------------------------------- */
export interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="hidden sm:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 text-[11px] font-medium text-[var(--text)] bg-[var(--surface-3)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-xs whitespace-nowrap z-50 pointer-events-none animate-fadeIn">
          {content}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   AVATAR                                   */
/* -------------------------------------------------------------------------- */
export interface AvatarProps {
  name?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Avatar({ name, src, size = 'md', className = '' }: AvatarProps) {
  const dimensions = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-11 h-11 text-base',
  }[size];

  const initial = name ? name.charAt(0).toUpperCase() : 'U';

  return (
    <div
      className={`rounded-full bg-[var(--surface-3)] border border-[var(--border)] flex items-center justify-center font-semibold text-[var(--text)] shrink-0 overflow-hidden ${dimensions} ${className}`}
    >
      {src ? (
        <img src={src} alt={name || 'Avatar'} className="w-full h-full object-cover" />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                PROGRESS BAR                                */
/* -------------------------------------------------------------------------- */
export interface ProgressBarProps {
  progress: number; // 0 to 100
  className?: string;
}

export function ProgressBar({ progress, className = '' }: ProgressBarProps) {
  return (
    <div className={`w-full h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden ${className}`}>
      <div
        className="h-full bg-[var(--grad)] transition-all duration-300 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   DIVIDER                                  */
/* -------------------------------------------------------------------------- */
export function Divider({ className = '' }: { className?: string }) {
  return <div className={`w-full h-px bg-[var(--border)] my-4 ${className}`} />;
}

/* -------------------------------------------------------------------------- */
/*                                     KBD                                    */
/* -------------------------------------------------------------------------- */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-medium text-[var(--muted)] bg-[var(--surface-3)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-2xs">
      {children}
    </kbd>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 EMPTY STATE                                */
/* -------------------------------------------------------------------------- */
export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`p-8 text-center flex flex-col items-center justify-center space-y-4 rounded-[var(--radius-xl)] bg-[var(--surface-2)]/40 border border-dashed border-[var(--border)] ${className}`}
    >
      {icon ? (
        <div className="shrink-0 text-[var(--accent)]">{icon}</div>
      ) : (
        <div className="w-12 h-12 rounded-[var(--radius-lg)] bg-[var(--surface-3)] flex items-center justify-center text-[var(--accent)]">
          <SparkLoader size={24} />
        </div>
      )}
      <div className="space-y-1 max-w-sm">
        <h4 className="text-base font-semibold text-[var(--text)] tracking-tight">{title}</h4>
        {description && (
          <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
