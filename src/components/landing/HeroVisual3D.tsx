import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Route, Sparkles, CheckCircle2, Eye, ShieldCheck } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';

/**
 * HeroVisual3D — Premium Balanced Hero Visual with Genuine Photography & Floating Product Previews.
 *
 * Visual hierarchy:
 * 1. Dominant focal point: High-resolution authentic photograph of a tech professional
 *    collaborating and reviewing career milestones on a laptop (Unsplash / Christina @ wocintechchat).
 * 2. Card 1 (Floating Upper-Left on desktop): Real-time illustrative roadmap pathway.
 *    Explicitly labeled "Illustrative Preview" with authentic phase milestones (NO fake percentages).
 * 3. Card 2 (Floating Lower-Right on desktop): AI Career Intelligence & Market Benchmark pill.
 * 4. Responsive presentation:
 *    - Desktop (>= 1024px): Perspective-balanced floating cards positioned around the image perimeter
 *      without obscuring the subject's face or workstation.
 *    - Tablet & Mobile (< 1024px): Seamlessly reflows into a clean inline 2-column/1-column stack below
 *      the photograph, eliminating collisions, clipping, and horizontal overflow.
 * 5. Full accessibility & reduced-motion support.
 */

export const HeroVisual3D: React.FC = () => {
  const { t } = useCareer();
  const reduced = useReducedMotion() ?? false;

  return (
    <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
      {/* Decorative ambient backlight wash */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-2 rounded-3xl bg-gradient-to-tr from-[var(--color-primary)]/15 via-transparent to-[var(--color-ai)]/15 blur-2xl opacity-75"
      />

      {/* Main Photographic Image Frame */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl lg:rounded-3xl">
        <picture>
          <source
            srcSet="/images/hero-professional-1200.webp 1200w, /images/hero-professional-800.webp 800w"
            sizes="(min-width: 1024px) 560px, (min-width: 640px) 600px, 92vw"
            type="image/webp"
          />
          <img
            src="/images/hero-professional.jpg"
            alt={t('Professional reviewing career roadmap and learning path on laptop in modern workspace')}
            width={1200}
            height={900}
            fetchPriority="high"
            loading="eager"
            decoding="async"
            className="aspect-[4/3] w-full object-cover transition-transform duration-500 hover:scale-[1.01]"
          />
        </picture>

        {/* Ethical source attribution pill */}
        <div className="absolute bottom-3 end-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-medium text-white/95 backdrop-blur-md shadow-sm">
          <span>Unsplash / Christina @ wocintechchat</span>
        </div>
      </div>

      {/* ============================================================== */}
      {/* DESKTOP FLOATING CARDS (>= lg)                                 */}
      {/* Anchored with precision to avoid obscuring the photograph      */}
      {/* ============================================================== */}

      {/* Card 1: Illustrative Pathway Preview (Floating Top-Left) */}
      <motion.div
        initial={{ opacity: 0, y: reduced ? 0 : 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduced ? { duration: 0.01 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        className="absolute -top-6 -left-6 z-20 hidden w-64 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 p-4 shadow-xl backdrop-blur-md lg:block xl:-left-8 xl:w-72"
        style={{
          boxShadow: '0 12px 32px -8px color-mix(in srgb, var(--color-text) 16%, transparent), 0 0 0 1px color-mix(in srgb, var(--color-primary) 15%, transparent)',
        }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)]/60 pb-2.5">
          <div className="flex items-center gap-1.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--color-primary)] text-white">
              <Route className="h-3 w-3" />
            </div>
            <span className="text-xs font-bold tracking-tight text-[var(--text-primary)]">
              {t('Full-Stack Engineer')}
            </span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary-surface)] px-2 py-0.5 text-[9px] font-semibold text-[var(--color-primary-text)] uppercase tracking-wider">
            <Eye className="h-2.5 w-2.5" />
            {t('Illustrative Preview')}
          </span>
        </div>

        <div className="mt-2.5 space-y-2">
          <div>
            <div className="text-[10px] font-medium text-[var(--text-secondary)]">
              {t('Next: System Architecture & APIs')}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-[var(--color-surface-secondary)]/70 px-2.5 py-1.5 text-[10px]">
            <span className="font-medium text-[var(--text-primary)]">{t('Core Fundamentals')}</span>
            <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-success-strong)]">
              <CheckCircle2 className="h-3 w-3" />
              {t('Verified')}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-[var(--color-surface-secondary)]/70 px-2.5 py-1.5 text-[10px]">
            <span className="font-medium text-[var(--text-primary)]">{t('Architecture & APIs')}</span>
            <span className="font-semibold text-[var(--color-primary-text)]">
              {t('In Progress')}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Card 2: AI Career Intelligence (Floating Bottom-Right) */}
      <motion.div
        initial={{ opacity: 0, y: reduced ? 0 : 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduced ? { duration: 0.01 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.35 }}
        className="absolute -bottom-6 -right-4 z-20 hidden w-60 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 p-3.5 shadow-xl backdrop-blur-md lg:block xl:-right-6 xl:w-64"
        style={{
          boxShadow: '0 12px 32px -8px color-mix(in srgb, var(--color-text) 16%, transparent), 0 0 0 1px color-mix(in srgb, var(--color-ai) 20%, transparent)',
        }}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--color-ai)] text-white">
            <Sparkles className="h-3 w-3" />
          </div>
          <div>
            <div className="text-xs font-bold text-[var(--text-primary)]">
              {t('Career Intelligence')}
            </div>
            <div className="text-[10px] text-[var(--text-secondary)]">
              {t('Market Skill Benchmark')}
            </div>
          </div>
        </div>

        <div className="mt-2 text-[10px] leading-relaxed text-[var(--text-secondary)]">
          {t('Grounded in verified requirements')}
        </div>

        <div className="mt-2.5 flex items-center gap-1.5 border-t border-[var(--color-border)]/60 pt-2 text-[10px] font-semibold text-[var(--color-success-strong)]">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          <span>{t('100% Free & Open Access')}</span>
        </div>
      </motion.div>

      {/* ============================================================== */}
      {/* MOBILE / TABLET INLINE PREVIEW (< lg)                           */}
      {/* Clean grid directly beneath photograph without any collisions  */}
      {/* ============================================================== */}
      <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:hidden">
        {/* Mobile Item 1 */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Route className="h-3.5 w-3.5 text-[var(--color-primary)]" />
              <span className="text-xs font-bold text-[var(--text-primary)]">{t('Full-Stack Engineer')}</span>
            </div>
            <span className="text-[9px] font-semibold text-[var(--color-primary-text)] uppercase">
              {t('Illustrative Preview')}
            </span>
          </div>
          <div className="mt-1.5 text-[11px] text-[var(--text-secondary)]">
            {t('Next: System Architecture & APIs')}
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px]">
            <span className="text-[var(--text-primary)]">{t('Core Fundamentals')}</span>
            <span className="font-semibold text-[var(--color-success-strong)]">{t('Verified')}</span>
          </div>
        </div>

        {/* Mobile Item 2 */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[var(--color-ai)]" />
              <span className="text-xs font-bold text-[var(--text-primary)]">{t('Career Intelligence')}</span>
            </div>
            <span className="text-[10px] font-semibold text-[var(--color-success-strong)]">
              {t('100% Free & Open Access')}
            </span>
          </div>
          <div className="mt-1.5 text-[11px] text-[var(--text-secondary)]">
            {t('Grounded in verified requirements')}
          </div>
          <div className="mt-2 text-[10px] text-[var(--text-secondary)]">
            {t('Market Skill Benchmark')}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeroVisual3D;
