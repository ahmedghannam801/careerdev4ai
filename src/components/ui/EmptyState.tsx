import React from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * CareerPilot AI — shared empty state.
 *
 * An empty state should read as an intentional part of the product rather
 * than a failure to load data. Every empty state names what is missing and
 * says what happens next, and it can offer the one action that fills it.
 *
 * The visuals use the same tokens as the rest of the interface: the surface,
 * the hairline border and the terracotta accent.
 */

interface EmptyStateProps {
  /** A short, concrete title: what is missing. */
  title: string;
  /** One sentence explaining what this area is for and what to do next. */
  description?: string;
  /** A muted icon that hints at the kind of content that belongs here. */
  icon?: LucideIcon;
  /** Optional label for the action that resolves the empty state. */
  actionLabel?: string;
  /** Invoked when the action is chosen. */
  onAction?: () => void;
  /** Tighten the padding for use inside a small panel. */
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon: Icon,
  actionLabel,
  onAction,
  compact = false,
}) => (
  <div
    className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-main)] text-center ${
      compact ? 'px-4 py-6' : 'px-6 py-10'
    }`}
  >
    {Icon && (
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-surface)] text-[var(--color-primary-text)]">
        <Icon className="h-5 w-5" />
      </span>
    )}

    <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>

    {description && (
      <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-[var(--text-secondary)]">
        {description}
      </p>
    )}

    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="mt-4 rounded-lg bg-[var(--accent-primary)] px-3.5 py-2 text-xs font-semibold text-[var(--color-on-primary)] transition-[background-color,box-shadow,transform] hover:bg-[var(--accent-secondary)] hover:shadow-sm active:scale-[0.98]"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

export default EmptyState;
