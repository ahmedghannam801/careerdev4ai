import React from 'react';

/**
 * The platform's tab buttons.
 *
 * A tab is an action, not a link: pressing one changes what the current screen
 * shows without changing where the reader is. That is why these are real
 * `<button role="tab">` elements and not styled text or spans.
 *
 * The active tab is the brand primary and the inactive ones are quiet
 * surfaces, so the current choice is visible at a glance without turning the
 * page into a wall of colour. Counts belong inside the tab they describe.
 *
 * The component is direction-agnostic: it uses logical spacing and flips the
 * arrow-key order in RTL, so Arabic and English behave the same way.
 */

export interface TabButtonItem<T extends string> {
  id: T;
  label: string;
  /** A number shown inside the tab, such as the items in a list. */
  count?: number;
  /** An optional icon, rendered before the label. */
  icon?: React.ElementType;
}

export type TabButtonSize = 'sm' | 'md';

export function tabButtonClassName(active: boolean, size: TabButtonSize = 'md'): string {
  const sizing =
    size === 'sm'
      ? 'min-h-9 px-3 text-xs'
      : 'min-h-10 px-3.5 text-xs sm:text-sm';

  return [
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border font-semibold',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]',
    'focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-main)]',
    sizing,
    active
      ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--color-on-primary)] shadow-sm'
      : 'border-transparent bg-transparent text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--surface-main)] hover:text-[var(--text-primary)]',
  ].join(' ');
}

export function tabCountClassName(active: boolean): string {
  return [
    'ms-0.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5',
    'font-mono text-[10px] leading-none tabular-nums',
    active
      ? 'bg-white/20 text-current'
      : 'bg-[var(--surface-secondary)] text-[var(--text-muted)]',
  ].join(' ');
}

/** The shared shell around a row of tab buttons. */
export const TabButtonsShell: React.FC<{
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
}> = ({ ariaLabel, children, className = '' }) => (
  <div
    role="tablist"
    aria-label={ariaLabel}
    className={`flex max-w-full flex-wrap items-center gap-1.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/60 p-1.5 ${className}`}
  >
    {children}
  </div>
);

export interface TabButtonsProps<T extends string> {
  tabs: readonly TabButtonItem<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  className?: string;
  size?: TabButtonSize;
  /** A stable prefix so the tab and its panel can find one another. */
  idPrefix?: string;
}

export function TabButtons<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  className,
  size = 'md',
  idPrefix = 'tab',
}: TabButtonsProps<T>) {
  const move = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const rtl =
      typeof document !== 'undefined' && document.documentElement.getAttribute('dir') === 'rtl';
    let nextIndex: number | null = null;

    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (event.key === 'ArrowRight') {
      nextIndex = rtl ? (index - 1 + tabs.length) % tabs.length : (index + 1) % tabs.length;
    }
    if (event.key === 'ArrowLeft') {
      nextIndex = rtl ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const next = tabs[nextIndex];
    if (!next) return;
    onChange(next.id);
    // The tab may not have re-rendered yet, so focus is moved on the next
    // frame rather than on a node that is about to be replaced.
    requestAnimationFrame(() => {
      document.getElementById(`${idPrefix}-${next.id}`)?.focus();
    });
  };

  return (
    <TabButtonsShell ariaLabel={ariaLabel} className={className}>
      {tabs.map((tab, index) => {
        const Icon = tab.icon;
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${idPrefix}-${tab.id}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => move(event, index)}
            className={tabButtonClassName(active, size)}
          >
            {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
            <span>{tab.label}</span>
            {typeof tab.count === 'number' ? (
              <span className={tabCountClassName(active)} aria-label={`${tab.count}`}>
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </TabButtonsShell>
  );
}

export default TabButtons;
