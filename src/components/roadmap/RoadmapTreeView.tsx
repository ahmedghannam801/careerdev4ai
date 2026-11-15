import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  CircleDot,
  Compass,
  GitBranch,
  Target,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import type { RoadmapJourneyStage } from '../../../shared/roadmapJourney';
import { AnimatedProgress } from '../motion/AnimatedProgress';
import { AnimatedCounter, AnimatedList, SpotlightCard } from '../react-bits';
import {
  buildRoadmapTree,
  connectorStyle,
  findNode,
  summarizeTree,
  type RoadmapBranchStyle,
  type RoadmapNodeOverrides,
  type RoadmapNodeState,
  type RoadmapTree,
  type RoadmapTreeNode,
  type RoadmapTreeProgress,
  type RoadmapTreeStage,
} from '../../../shared/roadmapTree';
import { RoadmapNodeDrawer, type RoadmapDrawerTarget } from './RoadmapNodeDrawer';
import './roadmapTree.css';

/**
 * The roadmap as a node tree.
 *
 * The card journey answers "which stage am I in". The tree answers the
 * question behind it: "what exactly is this stage made of, how deep does it
 * go, and what do I do first". It is the same journey — the five stages come
 * from the shared journey — opened up into the topics each stage is really
 * built from.
 *
 * The colours carry the meaning, exactly as they do in the roadmap.sh style
 * trees people already read: green for a finished topic, a pulsing accent
 * for the one in hand, the loudest card for the one to pick up next, and a
 * dashed border for an alternative path. The state is read from the
 * candidate's own progress, never invented.
 */

/** Where the hand-made changes to the tree are kept between visits. */
const ROADMAP_TREE_STORAGE_KEY = 'careerdev4ai.roadmap.nodes';

/** Prevents one signed-in candidate's local progress from appearing for another. */
export function roadmapTreeStorageKey(email: string): string {
  const scope = email.trim().toLowerCase() || 'anonymous';
  return `${ROADMAP_TREE_STORAGE_KEY}.${encodeURIComponent(scope)}`;
}

/**
 * Reads the saved changes.
 *
 * The storage is wrapped because a browser in private mode, a sandboxed
 * frame or a test runner without a window can refuse it — and a tree that
 * cannot be saved is still a tree that works.
 */
function readStoredOverrides(storageKey: string): RoadmapNodeOverrides {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as RoadmapNodeOverrides;
  } catch {
    return {};
  }
}

function writeStoredOverrides(storageKey: string, overrides: RoadmapNodeOverrides): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(overrides));
  } catch {
    // A browser that refuses storage still gets a working tree.
  }
}

/** The label and the icon of a node state. */
const STATE_ICON: Record<RoadmapNodeState, React.ReactNode> = {
  done: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />,
  inProgress: <CircleDot className="h-3.5 w-3.5" aria-hidden="true" />,
  recommended: <Circle className="h-3.5 w-3.5" aria-hidden="true" />,
  optional: <Circle className="h-3.5 w-3.5" aria-hidden="true" />,
};

const STATE_LABEL: Record<RoadmapNodeState, string> = {
  done: 'Done',
  inProgress: 'In progress',
  recommended: 'Recommended',
  optional: 'Optional',
};

/**
 * The class that carries the state to the stylesheet.
 *
 * The state name is camel case in the model and kebab case in the stylesheet,
 * so the mapping lives in one place instead of being spelled out on every node.
 */
const STATE_CLASS: Record<RoadmapNodeState, string> = {
  done: 'rdm-node--done',
  inProgress: 'rdm-node--in-progress',
  recommended: 'rdm-node--recommended',
  optional: 'rdm-node--optional',
};

const STATE_BADGE_CLASS: Record<RoadmapNodeState, string> = {
  done: 'bg-[var(--color-success-surface)] text-[var(--color-success-strong)]',
  inProgress: 'bg-[var(--accent-surface)] text-[var(--color-primary-text)]',
  recommended: 'bg-[var(--accent-primary)] text-[var(--color-on-primary)]',
  optional: 'bg-[var(--surface-secondary)] text-[var(--text-secondary)]',
};

interface RoadmapTreeViewProps {
  /** The journey stages, in order. */
  stages: readonly RoadmapJourneyStage[];
  /** What the product knows about the candidate's progress. */
  progress: RoadmapTreeProgress;
  /** Opens another view of the application. */
  onNavigate?: (view: string) => void;
}

/**
 * The connector between a branch and the spine.
 *
 * The rail is drawn taller than the row it belongs to, so the segments of
 * consecutive branches overlap and read as one line down the side of the
 * spine. A required topic is solid; an alternative path is dashed.
 */
const Connector: React.FC<{ side: 'start' | 'end'; style: RoadmapBranchStyle }> = ({
  side,
  style,
}) => (
  <svg
    className={`rdm-connector ${style === 'dashed' ? 'rdm-connector--dashed' : ''}`}
    viewBox="0 0 48 100"
    preserveAspectRatio="none"
    aria-hidden="true"
    focusable="false"
  >
    {side === 'start' ? (
      <>
        <path d="M48 0 V100" />
        <path d="M48 50 H0" />
      </>
    ) : (
      <>
        <path d="M0 0 V100" />
        <path d="M0 50 H48" />
      </>
    )}
  </svg>
);

/** A topic that branches off the spine. */
const BranchNode: React.FC<{
  node: RoadmapTreeNode;
  selected: boolean;
  onOpen: (node: RoadmapTreeNode) => void;
}> = ({ node, selected, onOpen }) => {
  const { t } = useCareer();
  const style = connectorStyle(node);
  const stateLabel = t(STATE_LABEL[node.state]);

  const card = (
    <button
      type="button"
      onClick={() => onOpen(node)}
      aria-expanded={selected}
      aria-label={`${t('Open the topic details')}: ${t(node.title)}`}
      className={`rdm-node ${STATE_CLASS[node.state]} block p-3`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${STATE_BADGE_CLASS[node.state]}`}>
          {STATE_ICON[node.state]}
          {stateLabel}
        </span>
        {node.currentLevel > 0 ? (
          <span className="font-mono text-[10px] font-bold tabular-nums text-[var(--text-muted)]">
            {node.currentLevel}/{node.targetLevel}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 text-start text-xs font-bold leading-snug text-[var(--text-primary)]">
        {t(node.title)}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {node.skillName ? (
          <span className="rounded-full bg-[var(--accent-surface)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-primary-text)]">
            {node.skillName}
          </span>
        ) : null}
        <span className="rounded-full border border-[var(--border-subtle)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--text-muted)]">
          {node.required ? t('Required') : t('Optional path')}
        </span>
      </div>
    </button>
  );

  return (
    <div className="rdm-branch" data-side={node.side}>
      {node.side === 'start' ? (
        <>
          <div className="rdm-branch__card">
            <SpotlightCard className="rounded-2xl">{card}</SpotlightCard>
          </div>
          <Connector side="start" style={style} />
        </>
      ) : (
        <>
          <Connector side="end" style={style} />
          <div className="rdm-branch__card">
            <SpotlightCard className="rounded-2xl">{card}</SpotlightCard>
          </div>
        </>
      )}
    </div>
  );
};

/** A stage on the spine. */
const SpineNode: React.FC<{
  stage: RoadmapTreeStage;
  selected: boolean;
  onOpen: (stage: RoadmapTreeStage) => void;
}> = ({ stage, selected, onOpen }) => {
  const { t } = useCareer();
  const stateLabel = t(STATE_LABEL[stage.state]);

  return (
    <button
      type="button"
      onClick={() => onOpen(stage)}
      aria-expanded={selected}
      aria-label={`${t('Open the stage details')}: ${t(stage.title)}`}
      className={`rdm-node ${STATE_CLASS[stage.state]} relative z-10 block p-4`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${STATE_BADGE_CLASS[stage.state]}`}>
          {STATE_ICON[stage.state]}
          {stateLabel}
        </span>
        <span className="font-mono text-[10px] font-bold tabular-nums text-[var(--text-muted)]">
          {stage.order}
        </span>
      </div>
      <div className="mt-1.5 text-start text-sm font-bold leading-snug text-[var(--text-primary)]">
        {t(stage.title)}
      </div>
      <p className="mt-1 text-start text-[11px] leading-relaxed text-[var(--text-secondary)]">
        {t(stage.objective)}
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        <AnimatedProgress
          value={stage.progress}
          label={`${t(stage.title)} progress`}
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-secondary)]"
          fillClassName={
            stage.state === 'done' ? 'bg-[var(--color-success-strong)]' : 'bg-[var(--accent-primary)]'
          }
        />
        <span className="font-mono text-[10px] font-bold tabular-nums text-[var(--text-muted)]">
          {stage.progress}%
        </span>
      </div>
    </button>
  );
};

export const RoadmapTreeView: React.FC<RoadmapTreeViewProps> = ({ stages, progress, onNavigate }) => {
  const { t, settings, profile, skills, updateSkillLevel } = useCareer();
  const storageKey = roadmapTreeStorageKey(profile.email);
  const [scopedOverrides, setScopedOverrides] = useState<{
    storageKey: string;
    values: RoadmapNodeOverrides;
  }>(() => ({ storageKey, values: readStoredOverrides(storageKey) }));
  const overrides = scopedOverrides.storageKey === storageKey ? scopedOverrides.values : {};
  const [target, setTarget] = useState<RoadmapDrawerTarget | null>(null);
  const closeDrawer = useCallback(() => setTarget(null), []);

  // The changes are kept between visits and scoped to the signed-in candidate.
  // If the account changes, hide the old values before loading the new scope.
  useEffect(() => {
    setScopedOverrides((previous) =>
      previous.storageKey === storageKey
        ? previous
        : { storageKey, values: readStoredOverrides(storageKey) }
    );
  }, [storageKey]);

  useEffect(() => {
    if (scopedOverrides.storageKey === storageKey) {
      writeStoredOverrides(storageKey, scopedOverrides.values);
    }
  }, [scopedOverrides, storageKey]);

  const tree: RoadmapTree = useMemo(
    () => buildRoadmapTree(stages, { progress, overrides }),
    [stages, progress, overrides]
  );
  const summary = useMemo(() => summarizeTree(tree), [tree]);
  // The selected item comes from the newly built tree, not from the snapshot
  // captured when the drawer first opened, so a level or done update is visible
  // without closing and reopening the dialog.
  const drawerTarget: RoadmapDrawerTarget | null = target
    ? target.kind === 'node'
      ? { kind: 'node', node: findNode(tree, target.node.id) ?? target.node }
      : { kind: 'stage', stage: tree.stages.find((stage) => stage.id === target.stage.id) ?? target.stage }
    : null;

  const handleMarkDone = (nodeId: string, done: boolean) => {
    if (!nodeId) return;
    setScopedOverrides((previous) => {
      const current = previous.storageKey === storageKey
        ? previous.values
        : readStoredOverrides(storageKey);
      return {
        storageKey,
        values: { ...current, [nodeId]: { ...current[nodeId], done } },
      };
    });
  };

  const handleLevelChange = (nodeId: string, level: number) => {
    if (!nodeId) return;
    const node = findNode(tree, nodeId);
    const linkedSkill = node?.skillName
      ? skills.find(
          (skill) => skill.name.trim().toLowerCase() === node.skillName?.trim().toLowerCase()
        )
      : undefined;

    if (linkedSkill) {
      setScopedOverrides((previous) => {
        const current = previous.storageKey === storageKey
          ? previous.values
          : readStoredOverrides(storageKey);
        return {
          storageKey,
          values: { ...current, [nodeId]: { ...current[nodeId], done: undefined, level: undefined } },
        };
      });
      void updateSkillLevel(linkedSkill.id, level);
      return;
    }

    setScopedOverrides((previous) => {
      const current = previous.storageKey === storageKey
        ? previous.values
        : readStoredOverrides(storageKey);
      return {
        storageKey,
        values: { ...current, [nodeId]: { ...current[nodeId], done: undefined, level } },
      };
    });
  };

  const openNode = (node: RoadmapTreeNode) => setTarget({ kind: 'node', node });
  const openStage = (stage: RoadmapTreeStage) => setTarget({ kind: 'stage', stage });

  const isSelected = (id: string) =>
    target?.kind === 'node' ? target.node.id === id : target?.kind === 'stage' && target.stage.id === id;

  return (
    <div dir={settings.language === 'ar' ? 'rtl' : 'ltr'} className="space-y-6">
      {/* What the tree says about the candidate, in numbers. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            {t('Done')}
          </div>
          <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--color-success-strong)]">
            <AnimatedCounter value={summary.done} />
            <span className="text-xs text-[var(--text-muted)]">/{summary.total}</span>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <CircleDot className="h-3 w-3" aria-hidden="true" />
            {t('In progress')}
          </div>
          <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--color-primary-text)]">
            <AnimatedCounter value={summary.inProgress} />
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <Target className="h-3 w-3" aria-hidden="true" />
            {t('Recommended')}
          </div>
          <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--text-primary)]">
            <AnimatedCounter value={summary.recommended} />
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <GitBranch className="h-3 w-3" aria-hidden="true" />
            {t('Optional')}
          </div>
          <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--text-secondary)]">
            <AnimatedCounter value={summary.optional} />
          </div>
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
        <Compass className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{t('Click any node to open its details, its learning links and the level controls.')}</span>
      </p>

      {/* The tree itself: a spine with the topics branching off it. */}
      <div className="relative">
        <div className="rdm-tree__spine-line" aria-hidden="true" />
        <div className="space-y-10">
          {tree.stages.map((stage) => (
            <section key={stage.id} className="rdm-tree__stage">
              <div className="rdm-tree__grid">
                <AnimatedList className="rdm-tree__side">
                  {stage.children
                    .filter((node) => node.side === 'start')
                    .map((node) => (
                      <BranchNode
                        key={node.id}
                        node={node}
                        selected={isSelected(node.id)}
                        onOpen={openNode}
                      />
                    ))}
                </AnimatedList>

                <div className="rdm-tree__spine">
                  <SpotlightCard className="w-full rounded-2xl">
                    <SpineNode
                      stage={stage}
                      selected={isSelected(stage.id)}
                      onOpen={openStage}
                    />
                  </SpotlightCard>
                </div>

                <AnimatedList className="rdm-tree__side">
                  {stage.children
                    .filter((node) => node.side === 'end')
                    .map((node) => (
                      <BranchNode
                        key={node.id}
                        node={node}
                        selected={isSelected(node.id)}
                        onOpen={openNode}
                      />
                    ))}
                </AnimatedList>
              </div>
            </section>
          ))}
        </div>
      </div>

      <RoadmapNodeDrawer
        target={drawerTarget}
        onClose={closeDrawer}
        onMarkDone={handleMarkDone}
        onLevelChange={handleLevelChange}
        onNavigate={(view) => {
          setTarget(null);
          onNavigate?.(view);
        }}
      />
    </div>
  );
};

export default RoadmapTreeView;
