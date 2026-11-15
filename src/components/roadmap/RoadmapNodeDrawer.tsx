import React, { useEffect, useRef } from 'react';
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  Circle,
  CircleDot,
  PlayCircle,
  X,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import type { RoadmapNodeState, RoadmapTreeNode, RoadmapTreeStage } from '../../../shared/roadmapTree';

/**
 * The topic drawer.
 *
 * A node on the tree is a title and a colour, which is enough to recognise a
 * topic but not enough to act on it. The drawer is where the topic becomes
 * work: what it really is, how far the candidate has come, the exact links
 * that teach it, and the two controls that make the tree honest again — a
 * level and a done mark.
 *
 * It is a modal dialog on purpose: it covers the tree, the escape key closes
 * it, and the focus moves into it and comes back out again. The panel carries
 * `data-lenis-prevent` so the smooth scroller does not swallow the scroll of
 * a long topic, and `role="dialog"` so the smooth scroll provider stops the
 * page behind it while it is open.
 */

/** What the drawer is showing. */
export type RoadmapDrawerTarget =
  | { kind: 'node'; node: RoadmapTreeNode }
  | { kind: 'stage'; stage: RoadmapTreeStage };

interface RoadmapNodeDrawerProps {
  target: RoadmapDrawerTarget | null;
  onClose: () => void;
  /** Marks the node as finished, or takes the mark back. */
  onMarkDone: (nodeId: string, done: boolean) => void;
  /** Sets the level the candidate has reached. */
  onLevelChange: (nodeId: string, level: number) => void;
  /** Opens another view of the application. */
  onNavigate?: (view: string) => void;
}

/** The label and the icon of a node state. */
const STATE_PRESENTATION: Record<
  RoadmapNodeState,
  { label: string; icon: React.ReactNode; className: string }
> = {
  done: {
    label: 'Done',
    icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />,
    className: 'border-[var(--color-success-strong)]/40 bg-[var(--color-success-surface)] text-[var(--color-success-strong)]',
  },
  inProgress: {
    label: 'In progress',
    icon: <CircleDot className="h-3.5 w-3.5" aria-hidden="true" />,
    className: 'border-[var(--accent-primary)]/40 bg-[var(--accent-surface)] text-[var(--color-primary-text)]',
  },
  recommended: {
    label: 'Recommended',
    icon: <Circle className="h-3.5 w-3.5" aria-hidden="true" />,
    className: 'border-[var(--accent-primary)]/40 bg-[var(--accent-surface)] text-[var(--color-primary-text)]',
  },
  optional: {
    label: 'Optional',
    icon: <Circle className="h-3.5 w-3.5" aria-hidden="true" />,
    className: 'border-[var(--border-subtle)] bg-[var(--surface-secondary)] text-[var(--text-secondary)]',
  },
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

export const RoadmapNodeDrawer: React.FC<RoadmapNodeDrawerProps> = ({
  target,
  onClose,
  onMarkDone,
  onLevelChange,
  onNavigate,
}) => {
  const { t, settings } = useCareer();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // The element that opened the drawer gets the focus back when it closes.
  const openerRef = useRef<HTMLElement | null>(null);

  const isOpen = Boolean(target);

  useEffect(() => {
    if (!isOpen) return undefined;

    openerRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      // The dialog is modal, so the focus stays inside it.
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      openerRef.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!target) return null;

  const isNode = target.kind === 'node';
  const node = isNode ? target.node : null;
  const stage = !isNode ? target.stage : null;

  // The topic content is translated through the application's own catalogue,
  // in the same way the journey's stages are. The stage already arrives
  // translated; the topic's own wording is looked up here.
  const title = node ? t(node.title) : stage ? t(stage.title) : '';
  const description = node
    ? t(node.description)
    : stage
      ? stage.description.split(' → ').map((action) => t(action)).join(' → ')
      : '';
  const state: RoadmapNodeState = node ? node.state : stage ? stage.state : 'recommended';
  const presentation = STATE_PRESENTATION[state];
  const isDone = state === 'done';

  const resources = node?.resources ?? stage?.resources ?? [];
  const practice = node?.practice ?? stage?.practice ?? null;

  return (
    <div className="fixed inset-0 z-[60]" dir={settings.language === 'ar' ? 'rtl' : 'ltr'}>
      {/* The backdrop closes the drawer, and it is not part of the dialog. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="roadmap-drawer-title"
        data-lenis-prevent
        className="rdm-drawer"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] p-5">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {isNode ? t('Topic details') : t('Stage details')}
            </div>
            <h2 id="roadmap-drawer-title" className="mt-1 text-lg font-bold leading-snug text-[var(--text-primary)]">
              {title}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${presentation.className}`}
              >
                {presentation.icon}
                {t(presentation.label)}
              </span>
              {node ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                  {node.required ? t('Required') : t('Optional path')}
                </span>
              ) : null}
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('Close')}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="rdm-drawer__body p-5">
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{description}</p>

          {/* The criteria of a stage: what has to be true for it to count. */}
          {stage && stage.criteria.length > 0 ? (
            <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {t('What has to be true for this stage')}
              </div>
              <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                {stage.criteria.map((criterion) => (
                  <li key={criterion} className="flex items-start gap-1.5">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-[var(--color-success-strong)]" aria-hidden="true" />
                    <span>{t(criterion)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* The level: where the candidate is, and where the role expects
              them to be. */}
          {node ? (
            <div className="mt-4 rounded-xl border border-[var(--border-subtle)] p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {t('Current level')}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">
                  {node.currentLevel > 0 ? `${node.currentLevel}/5` : t('Not rated yet')}
                </span>
                <span className="text-[var(--text-muted)]">→</span>
                <span className="font-mono font-bold tabular-nums text-[var(--color-primary-text)]">
                  {node.targetLevel}/5
                </span>
              </div>
              {node.skillName ? (
                <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                  {t('Linked skill')}: {node.skillName}
                </div>
              ) : null}

              <div className="mt-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {t('Update Level')}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => onLevelChange(node.id, level)}
                      aria-pressed={node.currentLevel === level}
                      aria-label={`${t('Update Level')} ${level}`}
                      className={`min-h-[36px] w-10 rounded-lg border text-xs font-semibold transition-colors ${
                        node.currentLevel === level
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
                          : 'border-[var(--border-subtle)] bg-[var(--surface-main)] text-[var(--text-secondary)] hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {/* A spine node has a 0–5 level derived from its plan progress, so
              the same control can mark a stage as done or set it back to a
              concrete point in the journey. */}
          {stage ? (
            <div className="mt-4 rounded-xl border border-[var(--border-subtle)] p-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    {t('Current level')}
                  </div>
                  <div className="mt-1 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                    {stage.currentLevel > 0 ? `${stage.currentLevel}/5` : t('Not rated yet')}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    {t('Target level')}
                  </div>
                  <div className="mt-1 font-mono text-sm font-bold tabular-nums text-[var(--color-primary-text)]">
                    {stage.targetLevel}/5
                  </div>
                </div>
              </div>
              <div
                role="progressbar"
                aria-label={t('Progress')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={stage.progress}
                className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-secondary)]"
              >
                <div
                  className="h-full rounded-full bg-[var(--accent-primary)]"
                  style={{ width: `${stage.progress}%` }}
                />
              </div>
              <div className="mt-1 text-[10px] text-[var(--text-muted)]">
                {t('Progress')}: {stage.progress}%
              </div>
              <div className="mt-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {t('Update Level')}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => onLevelChange(stage.id, level)}
                      aria-pressed={stage.currentLevel === level}
                      aria-label={`${t('Update Level')} ${level}`}
                      className={`min-h-[36px] w-10 rounded-lg border text-xs font-semibold transition-colors ${
                        stage.currentLevel === level
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
                          : 'border-[var(--border-subtle)] bg-[var(--surface-main)] text-[var(--text-secondary)] hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {/* What the candidate does to prove the topic is learned. */}
          {practice ? (
            <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {t('Practice target')}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{t(practice.target)}</p>
            </div>
          ) : null}

          {/* The learning links, free ones first. */}
          {resources.length > 0 ? (
            <div className="mt-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {t('Learning resources')}
              </div>
              <ul className="mt-2 space-y-1.5">
                {resources.map((resource) => (
                  <li key={resource.url}>
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-2 transition-colors hover:border-[var(--accent-primary)]"
                    >
                      <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-primary-text)]" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold leading-snug text-[var(--text-primary)]">
                          {resource.title}
                        </span>
                        <span className="mt-0.5 inline-flex items-center rounded-full bg-[var(--surface-secondary)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                          {resource.kind === 'free' ? t('Free') : t('Paid')}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* The two actions: finish the topic, and practise it. */}
        <div className="flex flex-col gap-2 border-t border-[var(--border-subtle)] p-5">
          <button
            type="button"
            onClick={() => onMarkDone(node ? node.id : (stage?.id ?? ''), !isDone)}
            className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold transition-opacity hover:opacity-90 ${
              isDone
                ? 'border border-[var(--color-success-strong)]/40 bg-[var(--color-success-surface)] text-[var(--color-success-strong)]'
                : 'bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
            }`}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {isDone ? t('Mark as not done') : t('Mark as Done')}
          </button>

          {practice && onNavigate ? (
            <button
              type="button"
              onClick={() => onNavigate(practice.view)}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] px-4 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent-primary)]"
            >
              <PlayCircle className="h-4 w-4" aria-hidden="true" />
              {t('Practice / Take Quiz')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default RoadmapNodeDrawer;
