import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

/**
 * The state the mark is drawn in.
 *
 * `composing` is the candidate writing, `thinking` is the assistant working.
 * Both are states of the same character: it leans in when it is listening and
 * looks around while it is thinking.
 */
export type CopilotRobotState = 'idle' | 'composing' | 'thinking';

interface CopilotRobotProps {
  state?: CopilotRobotState;
  className?: string;
  /** Give the mark a name when it carries meaning; leave empty when decorative. */
  title?: string;
}

/* The palette is the mascot's own, so the small mark and the large artwork
   read as the same character instead of two drawings of a robot. */
const CREAM = '#FFF4E9';
const VISOR = '#3B322E';
const GLOW = '#FFAE7E';
const CHEEK = '#E9A183';

export const CopilotRobot: React.FC<CopilotRobotProps> = ({
  state = 'idle',
  className,
  title,
}) => {
  const reduced = useReducedMotion() ?? false;
  const moving = !reduced;

  /*
   * Three loops, one per state. They are deliberately slow: the mark sits
   * beside a text field, and anything faster would compete with the candidate
   * typing rather than reassure them that the assistant is there.
   */
  const body =
    !moving || state === 'idle'
      ? { y: 0, rotate: 0 }
      : state === 'composing'
        ? { y: [0, -0.7, 0], rotate: [0, -1.6, 0] }
        : { y: [0, -0.9, 0], rotate: [0, -4.5, 3.5, 0] };

  const eyes =
    !moving
      ? { x: 0, scaleY: 1 }
      : state === 'thinking'
        ? { x: [-1.1, 1.1, -1.1], scaleY: 1 }
        : state === 'composing'
          ? { x: 0, scaleY: [1, 1.12, 1] }
          : { x: 0, scaleY: [1, 1, 0.12, 1] };

  const glow =
    !moving
      ? { opacity: 0.55 }
      : state === 'thinking'
        ? { opacity: [0.35, 0.9, 0.35] }
        : { opacity: [0.45, 0.7, 0.45] };

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      data-copilot-robot={state}
    >
      {title ? <title>{title}</title> : null}

      {/* The ear pads stay still: they are the part that makes the head
          readable at 16px, so they carry the silhouette while the head
          itself moves inside them. */}
      <rect x="1.7" y="9.5" width="2.4" height="5.2" rx="1.2" fill={CHEEK} />
      <rect x="19.9" y="9.5" width="2.4" height="5.2" rx="1.2" fill={CHEEK} />

      <motion.g
        animate={body}
        transition={{
          duration: state === 'thinking' ? 1.7 : state === 'composing' ? 1.1 : 4.2,
          repeat: moving && state !== 'idle' ? Infinity : 0,
          ease: 'easeInOut',
        }}
        style={{ transformOrigin: '12px 12px' }}
      >
        {/* The antenna is what still says "robot" when the mark is only
            sixteen pixels wide, so it is drawn first and steps outside the
            head's silhouette. */}
        <rect x="11.55" y="2.4" width="0.9" height="2.6" rx="0.45" fill={VISOR} opacity="0.55" />
        <circle cx="12" cy="2.2" r="1.35" fill={CHEEK} />

        <rect x="4.1" y="4.9" width="15.8" height="14.2" rx="4.9" fill={CREAM} />
        <rect
          x="4.1"
          y="4.9"
          width="15.8"
          height="14.2"
          rx="4.9"
          fill="none"
          stroke="rgba(59, 50, 46, 0.10)"
          strokeWidth="0.9"
        />

        {/* The visor, and the two lit eyes inside it. The eyes sit well apart
            so they never merge into one bright blob. */}
        <rect x="6.1" y="7.9" width="11.8" height="7" rx="3.4" fill={VISOR} />
        <motion.g
          animate={glow}
          transition={{
            duration: state === 'thinking' ? 1.7 : 2.6,
            repeat: moving ? Infinity : 0,
            ease: 'easeInOut',
          }}
        >
          <circle cx="9.6" cy="11.4" r="2.1" fill={GLOW} opacity="0.2" />
          <circle cx="14.4" cy="11.4" r="2.1" fill={GLOW} opacity="0.2" />
        </motion.g>
        <motion.g
          animate={eyes}
          transition={{
            duration: state === 'thinking' ? 1.7 : state === 'composing' ? 1.1 : 5.6,
            repeat: moving && state !== 'composing' ? Infinity : 0,
            times: state === 'idle' ? [0, 0.9, 0.95, 1] : undefined,
            ease: 'easeInOut',
          }}
        >
          <circle cx="9.6" cy="11.4" r="1.5" fill={GLOW} />
          <circle cx="14.4" cy="11.4" r="1.5" fill={GLOW} />
        </motion.g>
      </motion.g>
    </svg>
  );
};
