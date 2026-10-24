import React from 'react';

/**
 * CareerPilot AI — skeleton placeholder.
 *
 * Shown while a panel's content is still arriving. A skeleton keeps the
 * layout stable, so nothing jumps when the real content replaces it, and it
 * carries a slow branded shimmer instead of a distracting spinner.
 *
 * The shimmer is disabled under reduced motion; the placeholder stays visible
 * so the visitor still sees that something is loading.
 */

interface SkeletonProps {
  /** Height class, e.g. `h-4`, `h-32`. */
  className?: string;
  /** Width class, e.g. `w-full`, `w-24`. */
  widthClassName?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = 'h-4', widthClassName = 'w-full' }) => (
  <div className={`cp-skeleton ${className} ${widthClassName}`} aria-hidden="true" />
);

interface SkeletonTextProps {
  /** How many text lines to reserve. */
  lines?: number;
  className?: string;
}

/**
 * A block of reserved text lines.
 */
export const SkeletonText: React.FC<SkeletonTextProps> = ({ lines = 3, className = '' }) => (
  <div className={`space-y-2 ${className}`} aria-hidden="true">
    {Array.from({ length: lines }).map((_, index) => (
      <Skeleton
        key={index}
        className="h-3"
        widthClassName={index === lines - 1 ? 'w-2/3' : 'w-full'}
      />
    ))}
  </div>
);

/**
 * A reserved panel that mirrors the shape of a card.
 */
export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 ${className}`}
    aria-hidden="true"
  >
    <Skeleton className="h-3 w-24" widthClassName="w-24" />
    <Skeleton className="mt-3 h-5 w-3/4" widthClassName="w-3/4" />
    <SkeletonText lines={2} className="mt-3" />
  </div>
);

export default Skeleton;
