import React, { useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { HTMLMotionProps, Transition } from 'motion/react';
import { AlertCircle, Check, Loader2 } from 'lucide-react';

/**
 * Careerra — shape morphing through UI states.
 * ---------------------------------------------------------------------------
 * The rest of the motion system moves content around. This file changes the
 * SHAPE of a thing while it changes state: a disc becomes a pill, a rounded
 * square becomes a circle, a ring fills in.
 *
 * The rules that make a shape morph worth doing:
 *
 *   * The morph always reports a state the product is really in. Nothing here
 *     invents a success. A component that shows "saved" is showing a state its
 *     caller read from the real product, never a timer that says so.
 *   * The footprint never moves. A button that becomes a circle does not push
 *     its neighbours aside: the space is reserved up front, and only the shape
 *     inside it changes. The same holds for labels — every label a control
 *     can show is laid out at once, and the visible one fades over the others,
 *     so the control's width is decided by the widest label and never again.
 *   * The morph is short. A shape that takes longer than a quarter of a second
 *     to settle feels like the interface is thinking rather than answering.
 *   * Reduced motion removes the morph entirely and leaves the state change
 *     instant. The state is still announced; only the travel is taken away.
 *
 * The spring below is deliberately close to critically damped. A shape that
 * overshoots its target looks like it bounced, which is exactly the wrong
 * reading for something that is reporting the truth about a document or an
 * application.
 */

/** The spring a shape morph settles on. */
const SHAPE_SPRING: Transition = {
  type: 'spring',
  stiffness: 340,
  damping: 30,
  mass: 0.7,
};

/** How long a label takes to cross over to the next one. */
const LABEL_DURATION = 0.16;

/**
 * The transition a shape morph uses, honouring the visitor's preference.
 *
 * When motion is reduced the state change is instant: the shape is already in
 * its new form on the first frame, and nothing travels.
 */
const useShapeTransition = (): Transition => {
  const reduced = useReducedMotion() ?? false;
  return useMemo(
    () => (reduced ? { duration: 0 } : SHAPE_SPRING),
    [reduced]
  );
};

/* -------------------------------------------------------------------------- */
/* The low-level shape                                                         */
/* -------------------------------------------------------------------------- */

/** The shape a morph box takes. */
export interface MorphShape {
  /** The width of the box, in pixels. */
  width: number;
  /** The height of the box, in pixels. */
  height: number;
  /** The corner radius, in pixels. Use half the width for a circle. */
  borderRadius: number;
  /** The fill of the box. */
  backgroundColor?: string;
  /** The colour of the box's border. */
  borderColor?: string;
  /** The border width, in pixels. */
  borderWidth?: number;
  /** How opaque the box is. */
  opacity?: number;
}

export interface MorphBoxProps extends Omit<HTMLMotionProps<'span'>, 'children'> {
  /** The shape to hold. */
  shape: MorphShape;
  /** The content of the box. */
  children?: React.ReactNode;
  /**
   * Whether the box is hidden from assistive technology.
   *
   * A purely decorative shape is hidden. A shape that carries meaning of its
   * own — a tick inside a disc, say — is not, and the caller sets this to
   * false and gives the box a name of its own.
   */
  hidden?: boolean;
}

/**
 * A box whose shape is held by a spring.
 *
 * The box is `position: relative` and its content is centred, so the content
 * stays put while the shape around it changes. Width and height are animated
 * rather than scaled, because a scaled box distorts the corner radius and the
 * border — and these boxes are small enough that the layout cost of the
 * animation is not measurable.
 */
export const MorphBox: React.FC<MorphBoxProps> = ({
  shape,
  children,
  style,
  hidden = true,
  ...rest
}) => {
  const transition = useShapeTransition();

  return (
    <motion.span
      {...rest}
      aria-hidden={hidden ? 'true' : undefined}
      initial={false}
      animate={{
        width: shape.width,
        height: shape.height,
        borderRadius: shape.borderRadius,
        backgroundColor: shape.backgroundColor ?? 'transparent',
        borderColor: shape.borderColor ?? 'transparent',
        borderWidth: shape.borderWidth ?? 0,
        opacity: shape.opacity ?? 1,
      }}
      transition={transition}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        borderStyle: 'solid',
        ...style,
      }}
    >
      {children}
    </motion.span>
  );
};

/* -------------------------------------------------------------------------- */
/* The morphing button                                                        */
/* -------------------------------------------------------------------------- */

/** The states a control that performs an operation can be in. */
export type MorphButtonState = 'idle' | 'loading' | 'success' | 'error';

export interface MorphingButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  /**
   * The state of the operation the button stands for.
   *
   * This is read from the product, not invented by the button. A button that
   * says "saved" says it because the document was written.
   */
  state: MorphButtonState;
  /** The label of the resting state. */
  label: string;
  /** The mark shown at the front of the button while it rests. */
  icon?: React.ReactNode;
  /** The label shown while the operation runs. Defaults to the label. */
  loadingLabel?: string;
  /** The label shown once the operation has genuinely succeeded. */
  successLabel?: string;
  /** The label shown when the operation has genuinely failed. */
  errorLabel?: string;
  /** How the button is drawn. */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Hides the label and leaves only the shape, for an icon-only control. */
  iconOnly?: boolean;
}

/**
 * A button whose shape reports what the button is doing.
 *
 * The resting button is a pill. While the operation runs, the leading
 * indicator opens out of a small square into a ring, and the label slides
 * across to say what is happening. When it succeeds, the ring closes into a
 * disc with a tick in it, and the surface takes the success colour. When it
 * fails, the same disc takes the danger colour and the tick becomes a mark.
 *
 * The control never changes size. Every label it can show is laid out in the
 * same grid cell, so the widest one decides the width and the button does not
 * move when the state changes. The indicator keeps its slot whether or not it
 * is showing anything.
 */
export const MorphingButton: React.FC<MorphingButtonProps> = ({
  state,
  label,
  icon,
  loadingLabel,
  successLabel,
  errorLabel,
  variant = 'primary',
  iconOnly = false,
  disabled,
  className = '',
  type = 'button',
  ...rest
}) => {
  const reduced = useReducedMotion() ?? false;
  const transition = useShapeTransition();

  const labels = useMemo(() => {
    const entries: { key: MorphButtonState; text: string }[] = [
      { key: 'idle', text: label },
    ];
    if (loadingLabel) entries.push({ key: 'loading', text: loadingLabel });
    if (successLabel) entries.push({ key: 'success', text: successLabel });
    if (errorLabel) entries.push({ key: 'error', text: errorLabel });
    return entries;
  }, [label, loadingLabel, successLabel, errorLabel]);

  const activeText = labels.find((entry) => entry.key === state)?.text ?? label;

  /**
   * The surface behind the content. It is a separate layer so that the
   * colour and the radius of the control can change without the content
   * having to be re-rendered on top of a moving target.
   */
  const surface = useMemo(() => {
    if (variant === 'primary') {
      if (state === 'success') {
        return { backgroundColor: 'var(--color-success-strong)', borderRadius: 14 };
      }
      if (state === 'error') {
        return { backgroundColor: 'var(--color-danger)', borderRadius: 14 };
      }
      if (state === 'loading') {
        return { backgroundColor: 'var(--accent-secondary)', borderRadius: 14 };
      }
      return { backgroundColor: 'var(--accent-primary)', borderRadius: 14 };
    }
    if (variant === 'secondary') {
      if (state === 'success') {
        return { backgroundColor: 'var(--color-success-surface)', borderRadius: 14 };
      }
      if (state === 'error') {
        return { backgroundColor: 'var(--color-danger)/12', borderRadius: 14 };
      }
      if (state === 'loading') {
        return { backgroundColor: 'var(--surface-secondary)', borderRadius: 14 };
      }
      return { backgroundColor: 'var(--surface-main)', borderRadius: 14 };
    }
    if (state === 'success') {
      return { backgroundColor: 'var(--color-success-surface)', borderRadius: 14 };
    }
    if (state === 'error') {
      return { backgroundColor: 'var(--color-danger)/12', borderRadius: 14 };
    }
    return { backgroundColor: 'rgba(0,0,0,0)', borderRadius: 14 };
  }, [variant, state]);

  /**
   * The leading indicator.
   *
   * At rest it is a small square — a quiet, square placeholder. Under load
   * it opens into a ring. Done, it closes into a disc. It is the shape that
   * carries the change, and it is the reason this control reads at a glance
   * without its label being read at all.
   */
  const indicator = useMemo<MorphShape>(() => {
    if (state === 'loading') {
      return { width: 14, height: 14, borderRadius: 7, backgroundColor: 'transparent' };
    }
    if (state === 'success') {
      return { width: 16, height: 16, borderRadius: 8, backgroundColor: 'var(--color-on-primary)' };
    }
    if (state === 'error') {
      return { width: 16, height: 16, borderRadius: 8, backgroundColor: 'var(--color-on-primary)' };
    }
    // At rest the mark, if there is one, holds its own place; without a mark
    // the slot closes down to nothing.
    if (icon) {
      return { width: 16, height: 16, borderRadius: 5, backgroundColor: 'transparent' };
    }
    return { width: 0, height: 0, borderRadius: 0, backgroundColor: 'transparent', opacity: 0 };
  }, [state, icon]);

  const contentColor =
    variant === 'primary'
      ? 'text-[var(--color-on-primary)]'
      : state === 'success'
        ? 'text-[var(--color-success-strong)]'
        : state === 'error'
          ? 'text-[var(--color-danger)]'
          : 'text-[var(--text-primary)]';

  return (
    <motion.button
      type={type}
      disabled={disabled || state === 'loading'}
      aria-busy={state === 'loading'}
      aria-label={label}
      whileTap={reduced ? undefined : { scale: 0.97 }}
      className={`relative isolate inline-flex items-center justify-center gap-2 overflow-hidden ${iconOnly ? 'px-2' : 'px-3.5'} py-2 text-xs font-semibold transition-[opacity] duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${contentColor} ${className}`}
      {...rest}
    >
      {/*
        The morphing surface.

        The hover and press treatments live here, on the surface rather than
        on the button, so that a control which is working does not also
        brighten under the pointer: a button that is loading is busy, and a
        busy button that keeps inviting a second click is lying about itself.
      */}
      <motion.span
        aria-hidden="true"
        className="absolute inset-0 -z-10 border border-[var(--border-subtle)]"
        initial={false}
        animate={{
          backgroundColor: surface.backgroundColor,
          borderRadius: surface.borderRadius,
          borderColor:
            variant === 'primary' ? 'rgba(0,0,0,0)' : 'var(--border-subtle)',
        }}
        whileHover={
          state !== 'idle'
            ? undefined
            : variant === 'primary'
              ? { backgroundColor: 'var(--accent-secondary)' }
              : variant === 'secondary'
                ? { backgroundColor: 'var(--accent-surface)' }
                : undefined
        }
        transition={transition}
      />

      {/* The whole control answers a press. */}

      {/* The indicator slot. It is always here, so the label never moves. */}
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        <MorphBox shape={indicator}>
          {state === 'idle' && icon}
          {state === 'loading' && (
            <Loader2
              className="h-3.5 w-3.5 animate-spin"
              strokeWidth={2.5}
              style={{ color: variant === 'primary' ? 'var(--color-on-primary)' : 'var(--color-primary-text)' }}
            />
          )}
          {state === 'success' && (
            <Check className="h-3 w-3" strokeWidth={3} style={{ color: 'var(--color-success-strong)' }} />
          )}
          {state === 'error' && (
            <AlertCircle className="h-3 w-3" strokeWidth={3} style={{ color: 'var(--color-danger)' }} />
          )}
        </MorphBox>
      </span>

      {/* The labels, all laid out at once. The visible one fades over the rest. */}
      {!iconOnly && (
        <span className="relative grid shrink-0">
          {labels.map((entry) => {
            const active = entry.key === state;
            return (
              <span
                key={entry.key}
                aria-hidden="true"
                className={`col-start-1 row-start-1 whitespace-nowrap ${active ? '' : 'pointer-events-none invisible'}`}
              >
                <motion.span
                  className="block"
                  initial={false}
                  animate={{ opacity: active ? 1 : 0, y: active ? 0 : reduced ? 0 : 4 }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { duration: LABEL_DURATION, ease: [0.16, 1, 0.3, 1] }
                  }
                >
                  {entry.text}
                </motion.span>
              </span>
            );
          })}
        </span>
      )}

      {/*
        The state, spoken. A sighted user sees the shape change; a screen
        reader user is told what happened, in the same words the sighted user
        reads. The button's own name stays the action it performs, so a
        reader is told what the control does and then what just happened to
        it.
      */}
      <span role="status" aria-live="polite" className="sr-only">
        {state === 'idle' ? '' : activeText}
      </span>
    </motion.button>
  );
};

/* -------------------------------------------------------------------------- */
/* The morphing chip                                                          */
/* -------------------------------------------------------------------------- */

/** How a chip is coloured. */
export type MorphChipTone = 'neutral' | 'accent' | 'success' | 'danger';

/** The states a chip can report. */
export type MorphChipState = 'idle' | 'working' | 'done' | 'failed';

export interface MorphingChipProps {
  /** The state the chip is reporting. */
  state: MorphChipState;
  /** The text of each state. The chip shows the one for the current state. */
  labels: Partial<Record<MorphChipState, string>>;
  /** The mark shown in the chip, before the text. */
  icon?: React.ReactNode;
  /** How the chip is coloured. */
  tone?: MorphChipTone;
  /** The size of the chip, in pixels. */
  size?: number;
  /** The classes of the chip's root element. */
  className?: string;
  /** The content of the chip, when it is not an icon and a set of labels. */
  children?: React.ReactNode;
}

/**
 * A chip that changes shape rather than merely changing colour.
 *
 * It is a pill whose corner radius travels — a rounded rectangle while
 * something is happening, a full pill once the thing has happened — and
 * whose mark opens out of a ring into a filled disc. The state is carried by
 * the shape, so it can be read from the corner of the eye.
 *
 * The chip never changes size. Every label it can show is laid out at once,
 * in the same grid cell, and the visible one fades over the others, so the
 * widest label decides the width and the chip is that wide from the first
 * frame. Nothing beside it moves when the state changes.
 */
export const MorphingChip: React.FC<MorphingChipProps> = ({
  state,
  labels,
  icon,
  tone = 'neutral',
  size = 26,
  className = '',
  children,
}) => {
  const reduced = useReducedMotion() ?? false;
  const transition = useShapeTransition();

  const palette = useMemo(() => {
    switch (tone) {
      case 'accent':
        return {
          background: 'var(--color-accent-surface)',
          foreground: 'var(--color-primary-text)',
          border: 'var(--color-ai-border)',
        };
      case 'success':
        return {
          background: 'var(--color-success-surface)',
          foreground: 'var(--color-success-strong)',
          border: 'var(--color-success-strong)',
        };
      case 'danger':
        return {
          background: 'var(--color-danger)/12',
          foreground: 'var(--color-danger)',
          border: 'var(--color-danger)',
        };
      default:
        return {
          background: 'var(--surface-secondary)',
          foreground: 'var(--text-secondary)',
          border: 'var(--border-subtle)',
        };
    }
  }, [tone]);

  /**
   * The labels, all laid out at once.
   *
   * They share one grid cell, so the chip is as wide as the widest of them
   * whichever one happens to be showing.
   */
  const entries = useMemo(
    () =>
      (Object.keys(labels) as MorphChipState[])
        .filter((key) => Boolean(labels[key]))
        .map((key) => ({ key, text: labels[key] as string })),
    [labels]
  );

  /**
   * The corner radius of the pill.
   *
   * A rounded rectangle while the work is running, a full pill once it is
   * done. The travel is short, so the chip reads as settling rather than as
   * turning.
   */
  const radius = state === 'idle' ? size * 0.3 : state === 'done' ? size / 2 : size * 0.34;

  return (
    <span
      className={`relative inline-flex items-center ${className}`}
      style={{ height: size }}
    >
      <motion.span
        className="absolute inset-y-0 start-0 flex items-center gap-1.5 border px-2"
        initial={false}
        animate={{
          borderRadius: radius,
          backgroundColor: palette.background,
          borderColor: palette.border,
        }}
        transition={transition}
        style={{ color: palette.foreground }}
      >
        <span
          className="flex shrink-0 items-center justify-center"
          style={{ width: size - 8, height: size - 8 }}
        >
          {icon}
        </span>

        {/*
          The labels. Every one of them is in the layout, so the chip is
          already the right width before the first one is read.
        */}
        <span className="relative grid shrink-0">
          {entries.map((entry) => {
            const active = entry.key === state;
            return (
              <span
                key={entry.key}
                /*
                 * The label that is showing is read. The ones that are not
                 * are hidden, because they are decoration: a reader should
                 * hear what the chip says now, not every label it could say.
                 */
                aria-hidden={active ? undefined : 'true'}
                className={`col-start-1 row-start-1 whitespace-nowrap text-[11px] font-semibold leading-none ${
                  active ? '' : 'pointer-events-none invisible'
                }`}
              >
                <motion.span
                  className="block"
                  initial={false}
                  animate={{ opacity: active ? 1 : 0, y: active ? 0 : reduced ? 0 : 3 }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { duration: LABEL_DURATION, ease: [0.16, 1, 0.3, 1] }
                  }
                >
                  {entry.text}
                </motion.span>
              </span>
            );
          })}
          {children}
        </span>
      </motion.span>
    </span>
  );
};

/* -------------------------------------------------------------------------- */
/* The morphing mark                                                          */
/* -------------------------------------------------------------------------- */

export interface MorphingMarkProps {
  /** The state the mark is reporting. */
  state: MorphChipState;
  /** The size of the mark, in pixels. */
  size?: number;
}

/**
 * The mark that sits at the front of a chip.
 *
 * At rest it is an open ring. While the work is running the ring turns. When
 * the work is done the ring closes into a filled disc and a tick opens out of
 * its centre; when it has failed, the same disc takes the danger colour and
 * a mark appears instead of the tick.
 *
 * The disc is what makes the change readable at a glance: a tick drawn on a
 * transparent background is a small detail, and a tick inside a disc that has
 * just filled is not.
 */
export const MorphingMark: React.FC<MorphingMarkProps> = ({ state, size = 16 }) => {
  const reduced = useReducedMotion() ?? false;

  const shape = useMemo<MorphShape>(() => {
    if (state === 'done') {
      return {
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: 'var(--color-success-strong)',
      };
    }
    if (state === 'failed') {
      return {
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: 'var(--color-danger)',
      };
    }
    if (state === 'working') {
      return {
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: 'transparent',
        borderColor: 'var(--color-border-strong)',
        borderWidth: 1.5,
      };
    }
    return {
      width: size * 0.7,
      height: size * 0.7,
      borderRadius: size / 2,
      backgroundColor: 'var(--surface-secondary)',
    };
  }, [state, size]);

  return (
    <MorphBox shape={shape}>
      <AnimatePresence initial={false} mode="wait">
        {state === 'working' && (
          <motion.span
            key="working"
            className="flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.12 }}
          >
            <Loader2
              className="h-3 w-3 animate-spin text-[var(--color-primary-text)]"
              strokeWidth={2.5}
            />
          </motion.span>
        )}
        {state === 'done' && (
          <motion.span
            key="done"
            className="flex items-center justify-center"
            initial={{ opacity: 0, scale: reduced ? 1 : 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <Check className="h-3 w-3" strokeWidth={3} style={{ color: 'var(--color-on-primary)' }} />
          </motion.span>
        )}
        {state === 'failed' && (
          <motion.span
            key="failed"
            className="flex items-center justify-center"
            initial={{ opacity: 0, scale: reduced ? 1 : 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <AlertCircle className="h-3 w-3" strokeWidth={3} style={{ color: 'var(--color-on-primary)' }} />
          </motion.span>
        )}
      </AnimatePresence>
    </MorphBox>
  );
};

/* -------------------------------------------------------------------------- */
/* The morphing assistant                                                     */
/* -------------------------------------------------------------------------- */

/** The states the assistant can be in. */
export type AssistantState = 'idle' | 'listening' | 'thinking' | 'responding';

export interface MorphingOrbProps {
  /** The state the assistant is in. */
  state: AssistantState;
  /** The size of the orb, in pixels. */
  size?: number;
  /** The classes of the orb's root element. */
  className?: string;
}

/**
 * The assistant's identity, as a shape.
 *
 * At rest it is a rounded square — the mascot's own shape. While it is
 * thinking it opens into a circle and its edge starts to travel, the way
 * something that is working looks different from something that is idle.
 * While it is responding it is a circle again, holding still.
 *
 * It is an identity, not a spinner: it is always present, it never takes the
 * place of the words, and it never pretends to be working when it is not.
 */
export const MorphingOrb: React.FC<MorphingOrbProps> = ({
  state,
  size = 36,
  className = '',
}) => {
  const reduced = useReducedMotion() ?? false;

  const shape = useMemo<MorphShape>(() => {
    if (state === 'listening' || state === 'responding') {
      return { width: size, height: size, borderRadius: size / 2 };
    }
    if (state === 'thinking') {
      return { width: size, height: size, borderRadius: size / 2 };
    }
    return { width: size * 0.86, height: size * 0.86, borderRadius: size * 0.28 };
  }, [state, size]);

  const active = state === 'listening' || state === 'thinking' || state === 'responding';

  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {/* The pulse that travels out while the assistant is working. */}
      {active && (
        <motion.span
          className="absolute inset-0 rounded-full border border-[var(--color-primary)]/40"
          initial={{ opacity: 0.5, scale: 0.8 }}
          animate={reduced ? { opacity: 0.3, scale: 1 } : { opacity: [0.5, 0], scale: [0.8, 1.45] }}
          transition={
            reduced
              ? { duration: 0 }
              : { duration: 1.8, repeat: Infinity, ease: 'easeOut' }
          }
        />
      )}

      <MorphBox
        shape={{
          ...shape,
          backgroundColor: active
            ? 'var(--color-primary)'
            : 'var(--color-accent-surface)',
        }}
      >
        <motion.span
          className="block rounded-full"
          style={{
            width: size * 0.32,
            height: size * 0.32,
            backgroundColor: active ? 'var(--color-on-primary)' : 'var(--color-primary)',
          }}
          animate={
            reduced || !active
              ? { scale: 1 }
              : state === 'thinking'
                ? { scale: [1, 1.35, 0.85, 1.15, 1], opacity: [0.7, 1, 0.7, 1, 0.7] }
                : { scale: [1, 1.2, 1], opacity: [0.75, 1, 0.75] }
          }
          transition={
            reduced
              ? { duration: 0 }
              : { duration: state === 'thinking' ? 1.4 : 2.2, repeat: Infinity, ease: 'easeInOut' }
          }
        />
      </MorphBox>
    </span>
  );
};

/* -------------------------------------------------------------------------- */
/* The morphing milestone                                                     */
/* -------------------------------------------------------------------------- */

/** The states a step of a plan can be in. */
export type MilestoneMorphState = 'locked' | 'available' | 'in_progress' | 'completed';

export interface MorphingMilestoneProps {
  /** The state of the step. */
  state: MilestoneMorphState;
  /** The size of the node, in pixels. */
  size?: number;
  /** The mark shown in the middle of the node. */
  children?: React.ReactNode;
  /** The classes of the node's root element. */
  className?: string;
}

/**
 * A step of a plan, drawn as a shape that carries its state.
 *
 * Locked, it is a small square with nothing in it — a shape that reads as
 * closed. Available, it opens into a ring. In progress, it fills and starts
 * to breathe. Done, it is a closed disc with the mark in it.
 *
 * The shape is the state. Nothing here has to be read to know where a plan
 * has got to, which is the whole point of a roadmap.
 */
export const MorphingMilestone: React.FC<MorphingMilestoneProps> = ({
  state,
  size = 26,
  children,
  className = '',
}) => {
  const reduced = useReducedMotion() ?? false;

  const shape = useMemo<MorphShape>(() => {
    switch (state) {
      case 'locked':
        return {
          width: size * 0.66,
          height: size * 0.66,
          borderRadius: size * 0.18,
          backgroundColor: 'var(--surface-secondary)',
          borderColor: 'var(--border-subtle)',
          borderWidth: 1,
        };
      case 'available':
        return {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: 'var(--surface-main)',
          borderColor: 'var(--border-strong, var(--border-subtle))',
          borderWidth: 2,
        };
      case 'in_progress':
        return {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: 'var(--accent-primary)',
          borderColor: 'var(--accent-primary)',
          borderWidth: 2,
        };
      default:
        return {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: 'var(--color-success-strong)',
          borderColor: 'var(--color-success-strong)',
          borderWidth: 2,
        };
    }
  }, [state, size]);

  const foreground =
    state === 'in_progress'
      ? 'var(--color-on-primary)'
      : state === 'completed'
        ? 'var(--color-on-primary)'
        : state === 'available'
          ? 'var(--text-secondary)'
          : 'var(--text-muted)';

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {/* The breath of a step that is under way. */}
      {state === 'in_progress' && (
        <motion.span
          className="absolute inset-0 rounded-full border border-[var(--accent-primary)]/40"
          initial={{ opacity: 0.5, scale: 0.85 }}
          animate={reduced ? { opacity: 0.25, scale: 1 } : { opacity: [0.5, 0], scale: [0.85, 1.4] }}
          transition={reduced ? { duration: 0 } : { duration: 1.9, repeat: Infinity, ease: 'easeOut' }}
        />
      )}

      <MorphBox shape={shape}>
        <span
          className="flex items-center justify-center"
          style={{ color: foreground, minHeight: size * 0.5 }}
        >
          {children}
        </span>
      </MorphBox>
    </span>
  );
};
