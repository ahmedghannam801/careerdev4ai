/**
 * The toast layer.
 * ---------------------------------------------------------------------------
 * A short, non-blocking message that confirms something happened.
 *
 * WHY THIS EXISTS
 * The application had no toast layer at all. Every confirmation was either
 * invisible (a state change the candidate had to notice on their own) or a
 * modal (a dialog for a message that deserves a line, not a question). The
 * daily token claim needed the first kind: a confirmation that arrives where
 * the candidate is already looking, celebrates the reward, and gets out of
 * the way.
 *
 * THE CONTRACT
 *   * `showToast` is safe to call from anywhere, including outside the
 *     provider — it simply does nothing there, exactly as `useProcessing`
 *     does. A component that is used on its own still works.
 *   * A toast never blocks. There is no modal behind it and no focus trap.
 *   * The strings are the caller's, already translated. The layer does not
 *     translate: it has no business knowing the application's vocabulary, and
 *     keeping it that way means the layer has no dependency on the career
 *     context and can be mounted anywhere.
 *   * A toast that reports a FAILURE says so. The layer never dresses an
 *     error up as a success.
 *
 * THE CELEBRATION VARIANT
 * `celebration` is the one that announces a reward. It is used when the
 * candidate's daily tokens arrive. It carries a burst of particles and a
 * token glyph that pop in once, and it respects `prefers-reduced-motion`: the
 * movement is removed, the message and the token count are not.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, PartyPopper, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info' | 'celebration';

export interface ToastOptions {
  /** The headline. Shown in bold. */
  title: string;
  /** The supporting line under the headline. */
  description?: string;
  /** The kind of message. Defaults to `success`. */
  variant?: ToastVariant;
  /** How long the toast stays, in milliseconds. Defaults to 4500. */
  duration?: number;
  /**
   * A glyph shown in the toast's leading slot. Used by the celebration
   * variant to show the token itself.
   */
  glyph?: ReactNode;
}

interface ToastRecord extends ToastOptions {
  id: number;
  variant: ToastVariant;
  duration: number;
}

interface ToastContextValue {
  /** Shows a toast and returns its id. */
  showToast: (options: ToastOptions) => number;
  /** Removes a toast before its time is up. */
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const DEFAULT_DURATION = 4500;

/** Longer for a celebration: the candidate may be reading the number. */
const CELEBRATION_DURATION = 6000;

export interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (options: ToastOptions): number => {
      const id = nextId.current;
      nextId.current += 1;

      const variant = options.variant ?? 'success';
      const duration = options.duration ?? (variant === 'celebration' ? CELEBRATION_DURATION : DEFAULT_DURATION);

      setToasts((previous) => [
        ...previous.slice(-3),
        { ...options, id, variant, duration },
      ]);

      const timer = setTimeout(() => dismissToast(id), duration);
      timers.current.set(id, timer);

      return id;
    },
    [dismissToast]
  );

  // Every pending timer is cleared when the layer goes away, so a toast
  // scheduled during teardown cannot try to update an unmounted component.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ showToast, dismissToast }),
    [showToast, dismissToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};

/**
 * The stack of visible toasts.
 *
 * It is rendered in the document flow at the end of the provider, fixed to the
 * bottom of the viewport, and it is the only part of the layer that paints.
 */
const ToastViewport: React.FC<{
  toasts: ToastRecord[];
  onDismiss: (id: number) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[120] flex flex-col items-center gap-2 px-4 sm:bottom-6"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastCard: React.FC<{ toast: ToastRecord; onDismiss: (id: number) => void }> = ({
  toast,
  onDismiss,
}) => {
  const celebration = toast.variant === 'celebration';

  const tone =
    toast.variant === 'error'
      ? 'border-[var(--color-danger)]/30 bg-[var(--danger-surface)] text-[var(--text-primary)]'
      : toast.variant === 'info'
        ? 'border-[var(--color-border)] bg-[var(--surface-main)] text-[var(--text-primary)]'
        : celebration
          ? 'border-[var(--color-success-strong)]/30 bg-[var(--color-success-surface)] text-[var(--text-primary)]'
          : 'border-[var(--color-success-strong)]/25 bg-[var(--surface-main)] text-[var(--text-primary)]';

  const Icon =
    toast.variant === 'error'
      ? AlertTriangle
      : toast.variant === 'info'
        ? Info
        : celebration
          ? PartyPopper
          : CheckCircle2;

  const iconTone =
    toast.variant === 'error'
      ? 'text-[var(--color-danger)]'
      : celebration
        ? 'text-[var(--color-success-strong)]'
        : 'text-[var(--color-success-strong)]';

  return (
    <div
      className={`cp-toast pointer-events-auto relative flex w-full max-w-md items-start gap-3 overflow-hidden rounded-2xl border px-4 py-3 shadow-[var(--shadow-overlay)] ${tone}`}
      role="status"
      aria-live="polite"
    >
      {celebration ? <CelebrationBurst /> : null}

      <span className={`relative mt-0.5 shrink-0 ${iconTone}`}>
        {toast.glyph ?? <Icon className="h-5 w-5" aria-hidden="true" />}
      </span>

      <div className="relative min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]">
            {toast.description}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="relative -mr-1 -mt-1 shrink-0 rounded-lg p-1 text-[var(--text-muted)] transition-colors hover:bg-black/5 hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] dark:hover:bg-white/10"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};

/**
 * The burst that plays once when a reward arrives.
 *
 * It is pure decoration: it carries no information that the message does not
 * already carry, and it is removed entirely when the candidate prefers
 * reduced motion.
 */
const CelebrationBurst: React.FC = () => (
  <span className="cp-celebration pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
    {Array.from({ length: 10 }, (_, index) => (
      <span
        key={index}
        className="cp-celebration-particle absolute h-1.5 w-1.5 rounded-full"
        style={{
          left: `${12 + index * 7.5}%`,
          animationDelay: `${(index % 5) * 90}ms`,
          backgroundColor:
            index % 3 === 0
              ? 'var(--color-accent-strong)'
              : index % 3 === 1
                ? 'var(--color-success-strong)'
                : 'var(--color-primary)',
        }}
      />
    ))}
  </span>
);

/**
 * The toast layer.
 *
 * Outside the provider it returns a layer that does nothing, exactly as
 * `useProcessing` does. A component that is rendered on its own — a story, a
 * test, an isolated screen — still works; it simply shows no toast.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  const fallback = useMemo<ToastContextValue>(
    () => ({
      showToast: () => -1,
      dismissToast: () => undefined,
    }),
    []
  );

  return context ?? fallback;
}

export default ToastProvider;
