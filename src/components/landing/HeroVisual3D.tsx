import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

/**
 * HeroVisual3D — Premium CSS 3D card-stack visual for the landing hero.
 *
 * Four feature cards arranged in a staggered 3D stack using CSS perspective
 * transforms. Each card shows a live product capability with micro-animations:
 * progress bars, circular progress, pulsing live indicator, and typing dots.
 *
 * Design constraints:
 * - CSS-only 3D (no Three.js / WebGL)
 * - will-change: transform only on animating elements
 * - prefers-reduced-motion respected — all CSS keyframes stop, motion/react
 *   entrance collapses to instant
 * - No external images or icon library beyond what's already in the bundle
 * - Mobile: collapses to a simple 2×2 grid (no 3D)
 * - Total added CSS: < 2 KB
 */

/* ------------------------------------------------------------------ */
/* Card data                                                            */
/* ------------------------------------------------------------------ */

interface FeatureCard {
  id: string;
  label: string;
  sub: string;
  accentVar: string; // CSS variable string for the accent stripe colour
  content: 'roadmap' | 'skill' | 'jobs' | 'ai';
}

const CARDS: FeatureCard[] = [
  {
    id: 'roadmap',
    label: 'Career Roadmap',
    sub: 'Personalized phases',
    accentVar: 'var(--color-primary)',
    content: 'roadmap',
  },
  {
    id: 'skill',
    label: 'Skill Match',
    sub: 'Gap analysis',
    accentVar: 'var(--color-ai)',
    content: 'skill',
  },
  {
    id: 'jobs',
    label: 'Live Jobs',
    sub: 'Curated matches',
    accentVar: 'var(--color-success-strong)',
    content: 'jobs',
  },
  {
    id: 'ai',
    label: 'AI Mentor',
    sub: 'Grounded guidance',
    accentVar: 'var(--color-ai)',
    content: 'ai',
  },
];

/* ------------------------------------------------------------------ */
/* Sub-components for each card's inner content                         */
/* ------------------------------------------------------------------ */

/** Card 1 — Career Roadmap: animated progress bar */
const RoadmapContent: React.FC<{ reduced: boolean }> = ({ reduced }) => {
  const phases = [
    { label: 'Foundation', pct: 85 },
    { label: 'Specialise', pct: 52 },
    { label: 'Portfolio', pct: 28 },
  ];
  return (
    <div className="mt-3 space-y-2.5">
      {phases.map((p) => (
        <div key={p.label}>
          <div className="mb-1 flex items-center justify-between">
            <span
              style={{ fontSize: '10px', color: 'var(--color-text-secondary)', fontWeight: 500 }}
            >
              {p.label}
            </span>
            <span
              style={{
                fontSize: '10px',
                color: 'var(--color-primary-text)',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {p.pct}%
            </span>
          </div>
          <div
            style={{
              height: '5px',
              borderRadius: '999px',
              background: 'var(--color-border)',
              overflow: 'hidden',
            }}
          >
            <motion.div
              initial={{ width: reduced ? `${p.pct}%` : '0%' }}
              animate={{ width: `${p.pct}%` }}
              transition={
                reduced ? { duration: 0.01 } : { duration: 1.0, ease: [0.16, 1, 0.3, 1], delay: 0.5 }
              }
              style={{
                height: '100%',
                borderRadius: '999px',
                background: 'var(--color-primary)',
                willChange: 'width',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

/** Card 2 — Skill Match: CSS-only circular progress ring */
const SkillContent: React.FC<{ reduced: boolean }> = ({ reduced }) => {
  const pct = 73;
  const r = 20;
  const circ = 2 * Math.PI * r;
  const dash = circ * (pct / 100);

  return (
    <div className="mt-3 flex items-center gap-4">
      {/* Circular ring */}
      <svg
        width="56"
        height="56"
        viewBox="0 0 56 56"
        aria-label={`${pct}% skill match`}
        style={{ flexShrink: 0 }}
      >
        {/* track */}
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="5"
        />
        {/* progress */}
        <motion.circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke="var(--color-ai)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: reduced ? circ - dash : circ }}
          animate={{ strokeDashoffset: circ - dash }}
          transform="rotate(-90 28 28)"
          transition={
            reduced ? { duration: 0.01 } : { duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.6 }
          }
          style={{ willChange: 'stroke-dashoffset' }}
        />
        <text
          x="28"
          y="33"
          textAnchor="middle"
          style={{
            fontSize: '12px',
            fontWeight: 700,
            fill: 'var(--color-ai-text)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {pct}%
        </text>
      </svg>
      {/* Legend */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text)' }}>
          Match Score
        </div>
        <div
          style={{
            fontSize: '10px',
            color: 'var(--color-text-secondary)',
            marginTop: '2px',
            lineHeight: 1.4,
          }}
        >
          7 of 9 required
          <br />
          skills covered
        </div>
      </div>
    </div>
  );
};

/** Card 3 — Live Jobs: pulsing green indicator + job pills */
const JobsContent: React.FC = () => {
  const jobs = ['Senior UX Designer', 'Product Manager', 'Data Analyst'];
  return (
    <div className="mt-3">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '8px',
        }}
      >
        {/* Pulsing dot */}
        <span className="hero3d-pulse-dot" aria-hidden="true" />
        <span style={{ fontSize: '10px', color: 'var(--color-success-strong)', fontWeight: 600 }}>
          247 live openings
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {jobs.map((j) => (
          <div
            key={j}
            style={{
              fontSize: '10px',
              padding: '4px 8px',
              borderRadius: '6px',
              background: 'var(--color-success-surface)',
              color: 'var(--color-text)',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {j}
          </div>
        ))}
      </div>
    </div>
  );
};

/** Card 4 — AI Mentor: typing dots animation */
const AiContent: React.FC<{ reduced: boolean }> = ({ reduced }) => {
  return (
    <div className="mt-3">
      {/* Simulated chat bubble */}
      <div
        style={{
          background: 'var(--color-ai-surface)',
          border: '1px solid var(--color-ai-border)',
          borderRadius: '8px',
          padding: '8px 10px',
          fontSize: '10px',
          lineHeight: 1.5,
          color: 'var(--color-text-secondary)',
        }}
      >
        Based on your roadmap, I'd suggest focusing on system design fundamentals next.
      </div>
      {/* Typing indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          marginTop: '8px',
        }}
      >
        <span
          style={{
            fontSize: '9px',
            color: 'var(--color-ai-text)',
            fontWeight: 600,
          }}
        >
          AI Mentor
        </span>
        {!reduced && (
          <span
            style={{ display: 'flex', gap: '3px', alignItems: 'center' }}
            aria-label="Typing"
          >
            <span className="hero3d-dot hero3d-dot-1" />
            <span className="hero3d-dot hero3d-dot-2" />
            <span className="hero3d-dot hero3d-dot-3" />
          </span>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 3D stack layout config                                               */
/* ------------------------------------------------------------------ */

/**
 * Each card's 3D transform in the stack. Cards are layered front-to-back
 * with modest X/Y rotations — professional, NOT flashy.
 */
const STACK_TRANSFORMS = [
  // Card 0 (front) — Career Roadmap
  { rotateX: 6, rotateY: -10, translateZ: 60, translateX: 0, translateY: 0 },
  // Card 1 — Skill Match
  { rotateX: 5, rotateY: -8, translateZ: 30, translateX: 50, translateY: 20 },
  // Card 2 — Live Jobs
  { rotateX: 4, rotateY: -6, translateZ: 10, translateX: 30, translateY: 50 },
  // Card 3 (back) — AI Mentor
  { rotateX: 3, rotateY: -4, translateZ: -20, translateX: 60, translateY: 80 },
];

/* ------------------------------------------------------------------ */
/* Main component                                                       */
/* ------------------------------------------------------------------ */

export const HeroVisual3D: React.FC = () => {
  const reduced = useReducedMotion() ?? false;

  return (
    <>
      {/* Inject keyframes as a style tag — keeps CSS under 2 KB, no new files */}
      <style>{`
        /* Floating keyframe for each card */
        @keyframes hero3d-float-0 {
          0%, 100% { transform: translateY(0px); }
          50%        { transform: translateY(-6px); }
        }
        @keyframes hero3d-float-1 {
          0%, 100% { transform: translateY(0px); }
          50%        { transform: translateY(-5px); }
        }
        @keyframes hero3d-float-2 {
          0%, 100% { transform: translateY(0px); }
          50%        { transform: translateY(-4px); }
        }
        @keyframes hero3d-float-3 {
          0%, 100% { transform: translateY(0px); }
          50%        { transform: translateY(-3px); }
        }

        /* Pulsing live-jobs dot */
        @keyframes hero3d-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.6; transform: scale(1.4); }
        }

        /* AI typing dots */
        @keyframes hero3d-blink {
          0%, 80%, 100% { opacity: 0.2; transform: translateY(0); }
          40%            { opacity: 1;   transform: translateY(-3px); }
        }

        .hero3d-pulse-dot {
          display: inline-block;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--color-success-strong);
          animation: hero3d-pulse 1.6s ease-in-out infinite;
          will-change: transform;
          flex-shrink: 0;
        }

        .hero3d-dot {
          display: inline-block;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--color-ai);
          animation: hero3d-blink 1.4s ease-in-out infinite;
          will-change: transform;
        }
        .hero3d-dot-1 { animation-delay: 0s; }
        .hero3d-dot-2 { animation-delay: 0.2s; }
        .hero3d-dot-3 { animation-delay: 0.4s; }

        /* Respect reduced motion — kill all hero3d animations */
        @media (prefers-reduced-motion: reduce) {
          .hero3d-pulse-dot,
          .hero3d-dot {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>

      {/*
        Desktop: perspective scene with absolute-positioned cards
        Mobile: simple 2×2 grid (no 3D)
      */}

      {/* Mobile layout — simple grid, no 3D */}
      <div
        className="grid grid-cols-2 gap-3 lg:hidden"
        aria-label="Platform features"
      >
        {CARDS.map((card) => (
          <div
            key={card.id}
            style={{
              borderRadius: '14px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              padding: '14px',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            {/* Accent stripe */}
            <div
              aria-hidden="true"
              style={{
                width: '28px',
                height: '3px',
                borderRadius: '99px',
                background: card.accentVar,
                marginBottom: '8px',
              }}
            />
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text)' }}>
              {card.label}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              {card.sub}
            </div>
            {card.content === 'roadmap' && <RoadmapContent reduced={reduced} />}
            {card.content === 'skill' && <SkillContent reduced={reduced} />}
            {card.content === 'jobs' && <JobsContent />}
            {card.content === 'ai' && <AiContent reduced={reduced} />}
          </div>
        ))}
      </div>

      {/* Desktop layout — CSS 3D perspective stack */}
      <div
        className="relative hidden lg:block"
        style={{
          /*
           * Explicit height prevents layout shift (CLS). The stack spans
           * ~400px vertically before the perspective offset.
           */
          height: '420px',
          width: '100%',
        }}
        aria-label="Platform features"
      >
        {CARDS.map((card, i) => {
          const t = STACK_TRANSFORMS[i];

          return (
            <motion.div
              key={card.id}
              initial={{
                opacity: 0,
                y: reduced ? 0 : 24,
              }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                reduced
                  ? { duration: 0.01 }
                  : { duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.3 + i * 0.1 }
              }
              style={{
                position: 'absolute',
                top: `${t.translateY}px`,
                left: `${t.translateX}px`,
                width: '240px',
                /*
                 * Explicit width+height prevents layout shift and allows
                 * will-change to work without reflow.
                 */
                zIndex: CARDS.length - i,
                /*
                 * The perspective is on the individual card, not the container,
                 * so each card's depth is self-contained and stacking context
                 * is preserved for z-index ordering.
                 */
                transform: `perspective(900px) rotateX(${t.rotateX}deg) rotateY(${t.rotateY}deg) translateZ(${t.translateZ}px)`,
                willChange: 'transform',
                /*
                 * Float animation wraps the perspective transform so the
                 * rotation is not disturbed by the float offset.
                 */
                animation: reduced
                  ? 'none'
                  : `hero3d-float-${i} ${3.6 + i * 0.4}s ease-in-out infinite`,
                animationDelay: `${i * 0.5}s`,
              }}
            >
              {/* Card shell */}
              <div
                style={{
                  borderRadius: '16px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  padding: '16px',
                  boxShadow: `
                    0 1px 2px color-mix(in srgb, var(--color-text) 6%, transparent),
                    0 ${8 + i * 4}px ${24 + i * 8}px -8px color-mix(in srgb, var(--color-text) ${20 - i * 3}%, transparent)
                  `,
                  /*
                   * Subtle glow behind the front card using the brand primary.
                   * The glow fades for deeper cards to reinforce the depth cue.
                   */
                  ...(i === 0
                    ? {
                        boxShadow: `
                          0 1px 2px color-mix(in srgb, var(--color-text) 6%, transparent),
                          0 12px 32px -8px color-mix(in srgb, var(--color-text) 18%, transparent),
                          0 0 0 1px color-mix(in srgb, var(--color-primary) 20%, transparent)
                        `,
                      }
                    : {}),
                }}
              >
                {/* Accent stripe */}
                <div
                  aria-hidden="true"
                  style={{
                    width: '32px',
                    height: '3px',
                    borderRadius: '99px',
                    background: card.accentVar,
                    marginBottom: '10px',
                  }}
                />

                {/* Header */}
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--color-text)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {card.label}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: 'var(--color-text-secondary)',
                    marginTop: '2px',
                  }}
                >
                  {card.sub}
                </div>

                {/* Per-card content */}
                {card.content === 'roadmap' && <RoadmapContent reduced={reduced} />}
                {card.content === 'skill' && <SkillContent reduced={reduced} />}
                {card.content === 'jobs' && <JobsContent />}
                {card.content === 'ai' && <AiContent reduced={reduced} />}
              </div>
            </motion.div>
          );
        })}
      </div>
    </>
  );
};

export default HeroVisual3D;
