'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

/* -------------------------------------------------------------------------- */
/*                                SETTINGS PAGE                               */
/* -------------------------------------------------------------------------- */
export interface SettingsPageProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function SettingsPage({ title, description, children, action }: SettingsPageProps) {
  return (
    <div className="space-y-6 animate-fadeIn transition-all duration-150">
      <div className="flex items-start justify-between gap-4 pb-1 border-b border-border/40">
        <div>
          <h1 className="text-xl sm:text-[22px] font-semibold text-text tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="text-xs sm:text-[13px] text-muted leading-relaxed mt-1">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="space-y-6">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  SECTION                                   */
/* -------------------------------------------------------------------------- */
export interface SectionProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  danger?: boolean;
  className?: string;
}

export function Section({ title, description, children, danger, className = '' }: SectionProps) {
  return (
    <div className={`space-y-2.5 ${className}`}>
      {(title || description) && (
        <div className="px-1 space-y-0.5">
          {title && (
            <h2
              className={`text-[15px] font-semibold tracking-tight ${
                danger ? 'text-rose-600 dark:text-rose-400' : 'text-text'
              }`}
            >
              {title}
            </h2>
          )}
          {description && (
            <p className="text-xs sm:text-[13px] text-muted leading-relaxed">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    CARD                                    */
/* -------------------------------------------------------------------------- */
export interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`bg-surface border border-border rounded-2xl overflow-hidden divide-y divide-border ${className}`}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                     ROW                                    */
/* -------------------------------------------------------------------------- */
export interface RowProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  control?: React.ReactNode;
  onClick?: () => void;
  stacked?: boolean;
  className?: string;
}

export function Row({
  icon,
  title,
  description,
  control,
  onClick,
  stacked = false,
  className = '',
}: RowProps) {
  const isClickable = Boolean(onClick);

  return (
    <div
      onClick={onClick}
      className={`min-h-[60px] px-4 py-3.5 flex ${
        stacked ? 'flex-col sm:flex-row sm:items-center' : 'items-center'
      } justify-between gap-3 sm:gap-4 transition-colors ${
        isClickable ? 'cursor-pointer hover:bg-surface2/50 select-none' : ''
      } ${className}`}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {icon && (
          <div className="w-8 h-8 rounded-xl bg-surface2 flex items-center justify-center text-text shrink-0 mt-0.5">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-xs sm:text-[14px] font-medium text-text leading-snug">
            {title}
          </div>
          {description && (
            <div className="text-[12px] sm:text-[13px] text-muted leading-normal mt-0.5 break-words">
              {description}
            </div>
          )}
        </div>
      </div>

      {control && (
        <div className={`shrink-0 ${stacked ? 'w-full sm:w-auto pt-2 sm:pt-0 flex justify-end' : ''}`}>
          {control}
        </div>
      )}
    </div>
  );
}

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
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={computedAriaLabel}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onChange(!checked);
        }}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
          checked ? 'bg-accent' : 'bg-border'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-xs transform transition-transform duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
      {label && <span className="text-xs sm:text-sm font-medium text-text">{label}</span>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  SEGMENTED                                 */
/* -------------------------------------------------------------------------- */
export interface SegmentedOption<T extends string> {
  value?: T;
  id?: T;
  label: string;
  icon?: React.ReactNode;
}

export interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}

export function Segmented<T extends string>({
  value,
  options = [],
  onChange,
  disabled,
  className = '',
}: SegmentedProps<T>) {
  return (
    <div
      className={`p-1 rounded-xl bg-surface2 border border-border flex items-center gap-1 w-full sm:w-auto ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      } ${className}`}
    >
      {(options || []).map((opt, idx) => {
        const optValue = (opt.value ?? opt.id) as T;
        const isSelected = optValue === value;
        const itemKey = optValue ? `seg-${optValue}` : `seg-opt-${idx}`;
        return (
          <button
            key={itemKey}
            type="button"
            disabled={disabled}
            onClick={() => onChange(optValue)}
            className={`flex-1 sm:flex-initial px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
              isSelected
                ? 'bg-surface text-text shadow-xs border border-border/60'
                : 'text-muted hover:text-text'
            }`}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 TEXTFIELD                                  */
/* -------------------------------------------------------------------------- */
export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  value: string;
  onChange: (val: string) => void;
  error?: string | null;
  helper?: React.ReactNode;
  trailing?: React.ReactNode;
  fontMono?: boolean;
  ariaLabel?: string;
}

export function TextField({
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
  fontMono,
  className = '',
  autoFocus,
  autoComplete,
  ariaLabel,
  'aria-label': ariaLabelHyphen,
  ...rest
}: TextFieldProps) {
  const computedAriaLabel = ariaLabel || ariaLabelHyphen || label;
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label className="block text-[13px] font-medium text-text">
          {label} {required && <span className="text-rose-500">*</span>}
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
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          aria-label={computedAriaLabel}
          className={`w-full min-h-[44px] px-3.5 py-2.5 bg-surface border rounded-xl text-xs sm:text-sm text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 transition-all ${
            fontMono ? 'font-mono' : ''
          } ${
            error
              ? 'border-rose-500/50 focus-visible:ring-rose-500/30'
              : 'border-border focus:border-accent'
          } ${trailing ? 'pr-11' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          {...rest}
        />
        {trailing && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
            {trailing}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
      {!error && helper && <div className="text-[12px] text-muted leading-relaxed">{helper}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  TEXTAREA                                  */
/* -------------------------------------------------------------------------- */
export interface TextAreaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  label?: string;
  value: string;
  onChange: (val: string) => void;
  error?: string | null;
  helper?: React.ReactNode;
  counter?: boolean;
  ariaLabel?: string;
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  required,
  error,
  helper,
  maxLength,
  counter,
  rows = 4,
  className = '',
  ariaLabel,
  'aria-label': ariaLabelHyphen,
  ...rest
}: TextAreaProps) {
  const computedAriaLabel = ariaLabel || ariaLabelHyphen || label;
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        {label && (
          <label className="block text-[13px] font-medium text-text">
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
        )}
        {counter && maxLength && (
          <span
            className={`text-xs ${
              value.length >= maxLength ? 'text-rose-500 font-semibold' : 'text-muted'
            }`}
          >
            {value.length} / {maxLength}
          </span>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        maxLength={maxLength}
        rows={rows}
        aria-label={computedAriaLabel}
        className={`w-full p-3.5 bg-surface border rounded-xl text-xs sm:text-sm text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 transition-all resize-y ${
          error
            ? 'border-rose-500/50 focus-visible:ring-rose-500/30'
            : 'border-border focus:border-accent'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        {...rest}
      />
      {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
      {!error && helper && <div className="text-[12px] text-muted leading-relaxed">{helper}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                SELECTFIELD                                 */
/* -------------------------------------------------------------------------- */
export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string;
  value: string;
  onChange: (val: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  helper?: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
  helper,
  className = '',
  ariaLabel,
  'aria-label': ariaLabelHyphen,
  ...rest
}: SelectFieldProps) {
  const computedAriaLabel = ariaLabel || ariaLabelHyphen || label;
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && <label className="block text-[13px] font-medium text-text">{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={computedAriaLabel}
        className="w-full min-h-[44px] px-3.5 bg-surface border border-border rounded-xl text-xs sm:text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 transition-all cursor-pointer disabled:opacity-50"
        {...rest}
      >
        {(options || []).map((opt, idx) => (
          <option key={opt.value || `opt-${idx}`} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {helper && <div className="text-[12px] text-muted leading-relaxed">{helper}</div>}
    </div>
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
  ariaLabel?: string;
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
  className = '',
  ariaLabel,
  'aria-label': ariaLabelHyphen,
  ...rest
}: ButtonProps) {
  const computedAriaLabel = ariaLabel || ariaLabelHyphen;
  const variantStyles = {
    primary: 'bg-accent text-accent-fg hover:opacity-95 shadow-xs border border-transparent',
    secondary:
      'bg-surface2 hover:bg-border text-text border border-border shadow-2xs',
    ghost: 'hover:bg-surface2 text-muted hover:text-text border border-transparent',
    danger:
      'bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 border border-rose-500/20',
  };

  const sizeStyles = {
    sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
    md: 'min-h-[44px] sm:min-h-[38px] px-4 py-2 text-xs sm:text-sm rounded-xl gap-2',
    lg: 'min-h-[48px] px-5 py-2.5 text-sm sm:text-base rounded-xl gap-2.5',
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`inline-flex items-center justify-center font-medium transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 active:scale-[0.98] ${
        variantStyles[variant]
      } ${sizeStyles[size]} ${
        disabled || loading ? 'opacity-40 cursor-not-allowed active:scale-100' : ''
      } ${className}`}
      {...rest}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      {children && <span>{children}</span>}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    PILL                                    */
/* -------------------------------------------------------------------------- */
export interface PillProps {
  tone?: 'success' | 'warning' | 'danger' | 'neutral' | 'accent';
  children: React.ReactNode;
  className?: string;
}

export function Pill({ tone = 'neutral', children, className = '' }: PillProps) {
  const toneStyles = {
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    danger: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    accent: 'bg-accent/10 text-accent border-accent/20',
    neutral: 'bg-surface2 text-muted border-border',
  };

  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border inline-flex items-center gap-1.5 shrink-0 ${toneStyles[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  CALLOUT                                   */
/* -------------------------------------------------------------------------- */
export interface CalloutProps {
  tone?: 'success' | 'warning' | 'danger' | 'neutral' | 'accent';
  icon?: React.ReactNode;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Callout({
  tone = 'neutral',
  icon,
  title,
  children,
  className = '',
}: CalloutProps) {
  const toneStyles = {
    success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300',
    warning: 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300',
    danger: 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300',
    accent: 'bg-accent/10 border-accent/20 text-text',
    neutral: 'bg-surface2/60 border-border text-text',
  };

  return (
    <div
      className={`p-4 rounded-2xl border flex items-start gap-3 text-xs leading-relaxed ${toneStyles[tone]} ${className}`}
    >
      {icon && <div className="shrink-0 mt-0.5">{icon}</div>}
      <div className="space-y-0.5 flex-1 min-w-0">
        {title && <div className="font-semibold text-xs sm:text-[13px] mb-0.5">{title}</div>}
        <div className="break-words">{children}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    STAT                                    */
/* -------------------------------------------------------------------------- */
export interface StatProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}

export function Stat({ label, value, hint, className = '' }: StatProps) {
  return (
    <div className={`p-4 rounded-2xl bg-surface border border-border space-y-1 ${className}`}>
      <div className="text-[12px] font-medium text-muted">{label}</div>
      <div className="text-xl sm:text-2xl font-semibold text-text tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 EMPTY HINT                                 */
/* -------------------------------------------------------------------------- */
export interface EmptyHintProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyHint({ icon, title, description, action, className = '' }: EmptyHintProps) {
  return (
    <div
      className={`p-8 text-center flex flex-col items-center justify-center space-y-3 rounded-2xl bg-surface2/30 border border-dashed border-border ${className}`}
    >
      {icon && <div className="w-10 h-10 rounded-2xl bg-surface2 flex items-center justify-center text-muted">{icon}</div>}
      <div className="space-y-1 max-w-sm">
        <h4 className="text-sm font-semibold text-text">{title}</h4>
        {description && <p className="text-xs text-muted leading-relaxed">{description}</p>}
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 DANGER ZONE                                */
/* -------------------------------------------------------------------------- */
export interface DangerZoneProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
}

export function DangerZone({ children, title = 'Danger zone', className = '' }: DangerZoneProps) {
  return (
    <div
      className={`p-4 sm:p-5 rounded-2xl bg-rose-500/5 border border-rose-500/20 space-y-3 ${className}`}
    >
      <div className="text-xs sm:text-[14px] font-semibold text-rose-600 dark:text-rose-400">
        {title}
      </div>
      {children}
    </div>
  );
}
