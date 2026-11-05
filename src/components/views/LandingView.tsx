import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, CheckCircle2, Sparkles, ArrowUpRight, Target, Route, GraduationCap, FileBadge2, Menu, X, Languages } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { TARGET_ROLES } from '../../data/rolesData';
import { SUPPORT_EMAIL, PUBLIC_PATHS, OPERATOR_LINKEDIN_URL } from '../../../shared/contact.ts';
import { Logo } from '../brand/Logo';
import { CareerJourneyVisual } from '../brand/CareerJourneyVisual';
import { HeroVisual3D } from '../landing/HeroVisual3D';
import { CareerImage } from '../ui/CareerImage';
import { ProductPreview } from '../landing/ProductPreview';
import { FeatureGrid } from '../landing/FeatureGrid';
import { TrustSection } from '../landing/TrustSection';
import { FaqSection } from '../landing/FaqSection';
import { ContactSection } from '../landing/ContactSection';
import { Reveal, Stagger, StaggerItem } from '../motion/Motion';

/**
 * The roles showcased on the landing page.
 *
 * One role per career domain, so the first thing a visitor sees is that
 * CareerPilot is not only for developers.
 */
const FEATURED_ROLES = (() => {
  const seen = new Set<string>();
  const featured: typeof TARGET_ROLES = [];
  for (const role of TARGET_ROLES) {
    if (seen.has(role.domainId)) continue;
    seen.add(role.domainId);
    featured.push(role);
    if (featured.length === 3) break;
  }
  return featured;
})();

interface LandingViewProps {
  onStartOnboarding: () => void;
  onExploreRoles: () => void;
  onOpenDashboard: () => void;
}

/** The product's promise, stated once. */
const HERO_HEADLINE = 'Turn Your Ambition Into a Career Plan.';

const HERO_SUPPORTING =
  'CareerDev4AI helps you discover where you\u2019re going, what you\u2019re missing, and what to do next \u2014 from your first skill to your next opportunity.';

/** The problems the platform exists to remove. */
const FRAGMENTATION_POINTS = [
  {
    title: 'Skills are scattered',
    body: 'A spreadsheet here, a course list there, and no honest picture of what is actually missing.',
  },
  {
    title: 'CVs go stale',
    body: 'The version you send is out of date before the interview, and it never speaks to the role in front of you.',
  },
  {
    title: 'Learning lacks direction',
    body: 'Endless courses with no link to the job you want, so effort turns into hours rather than progress.',
  },
  {
    title: 'Applications disconnect',
    body: 'Every opportunity tracked somewhere else, with no record of what you did, learned, or proved.',
  },
];

/** The chain the platform keeps connected. */
const CAREER_CHAIN = [
  'Goal',
  'Skills',
  'Roadmap',
  'Learning',
  'Projects',
  'Evidence',
  'CV',
  'Opportunities',
];

/** How it works, in the order a career actually unfolds. */
const HOW_IT_WORKS = [
  {
    icon: Target,
    title: 'Discover your direction',
    body: 'Set the role you are working towards and get a concrete picture of what that role demands.',
  },
  {
    icon: Sparkles,
    title: 'Identify your skill gaps',
    body: 'Compare where you are against the benchmark and see exactly which gaps will hold you back.',
  },
  {
    icon: Route,
    title: 'Follow your personalized roadmap',
    body: 'A phased plan that recalculates as you learn, so the next step is always the right one.',
  },
  {
    icon: GraduationCap,
    title: 'Build evidence and projects',
    body: 'Turn skills into finished work you can point a hiring manager at.',
  },
  {
    icon: FileBadge2,
    title: 'Strengthen your CV',
    body: 'Rewrite, version and target your CV against the role you are applying for.',
  },
  {
    icon: ArrowUpRight,
    title: 'Move toward real opportunities',
    body: 'Track applications, prepare for interviews, and keep your momentum visible.',
  },
];

/** What the AI actually does — and what it deliberately does not claim. */
const AI_PROMISES = [
  {
    title: 'Grounded in your records',
    body: 'Every recommendation is drawn from your own goals, skills, progress and learning journey.',
  },
  {
    title: 'Explains the reasoning',
    body: 'You see why a suggestion was made and which of your records it came from.',
  },
  {
    title: 'Updates as you progress',
    body: 'Complete a task, close a gap, and the next recommendation moves with you.',
  },
];

export const LandingView: React.FC<LandingViewProps> = ({ onStartOnboarding, onExploreRoles, onOpenDashboard }) => {
  const { profile, t, settings, updateSettings } = useCareer();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const reduced = useReducedMotion() ?? false;

  // The navigation labels are literal translation calls rather than plain
// strings: a plain label would render correctly in English and stay
// English in Arabic, and the localisation audit only reads literal calls,
// so the gap would never be reported.
const navLinks = [
    { href: '#how-it-works', label: t('How It Works') },
    { href: '#preview', label: t('Preview') },
    { href: '#features', label: t('Features') },
    { href: '#ai-guidance', label: t('AI Guidance') },
    { href: '#personas', label: t('Personas') },
    { href: '#roles', label: t('Target Roles') },
    { href: '#faq', label: t('FAQ') },
  ];

  const closeMobileNav = () => setMobileNavOpen(false);

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)]">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--surface-main)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <a href="#" className="flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-90" aria-label={t('CareerDev4AI')}>
            <Logo variant="icon" className="h-8 w-8 shrink-0" alt="" />
            <span className="hidden shrink-0 whitespace-nowrap text-base font-semibold tracking-tight text-[var(--text-primary)] sm:inline">
              {t('CareerDev4AI')}
            </span>
          </a>

          {/* The full navigation needs room. Below the large breakpoint the
              seven links do not fit beside the logo and the call to action,
              so the panel menu carries them instead. */}
          <nav className="hidden min-w-0 items-center gap-5 text-sm font-medium text-[var(--text-secondary)] lg:flex xl:gap-6">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="whitespace-nowrap transition-colors hover:text-[var(--text-primary)]"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setMobileNavOpen((open) => !open)}
              aria-expanded={mobileNavOpen}
              aria-controls="landing-mobile-nav"
              aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
              className="rounded-lg border border-[var(--color-border)] p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--color-surface-secondary)] hover:text-[var(--text-primary)] lg:hidden"
            >
              {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>

            <button
              onClick={profile.onboardingCompleted ? onOpenDashboard : onStartOnboarding}
              className="whitespace-nowrap rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-[var(--color-on-primary)] shadow-xs transition-[background-color,box-shadow,transform] hover:bg-[var(--color-primary-hover)] hover:shadow-sm"
            >
              {profile.onboardingCompleted ? 'Open Career Dashboard' : 'Start Your Journey'}
            </button>
          </div>
        </div>

        {/* Mobile navigation panel */}
        <AnimatePresence>
          {mobileNavOpen && (
            <motion.div
              id="landing-mobile-nav"
              initial={{ opacity: 0, y: reduced ? 0 : -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduced ? 0 : -8 }}
              transition={{ duration: reduced ? 0.01 : 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="border-t border-[var(--color-border)] bg-[var(--surface-main)] px-6 py-3 lg:hidden"
            >
              <nav className="flex flex-col">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={closeMobileNav}
                    className="rounded-lg px-2 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--color-surface-secondary)] hover:text-[var(--text-primary)]"
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-[var(--color-border)]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 cp-brand-wash" />

        <div className="relative mx-auto max-w-6xl px-6 pb-14 pt-12 sm:pb-18 sm:pt-16 lg:pb-20 lg:pt-20 xl:max-w-7xl">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12 xl:gap-14">
            {/* Copy column */}
            <div className="lg:col-span-6 xl:col-span-6">
              <Reveal>
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-3 py-1 text-xs font-medium text-[var(--color-primary-text)] backdrop-blur-sm">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{t('Your personal career operating system')}</span>
                </div>
              </Reveal>

              <Reveal delay={0.06}>
                <h1 className="mt-5 text-balance text-3xl font-bold leading-[1.12] tracking-tight text-[var(--text-primary)] sm:text-4xl md:text-5xl lg:text-[3.25rem]">
                  {HERO_HEADLINE}
                </h1>
              </Reveal>

              <Reveal delay={0.12}>
                <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
                  {HERO_SUPPORTING}
                </p>
              </Reveal>

              <Reveal delay={0.18}>
                <div className="mt-8 flex flex-wrap items-center gap-3 sm:gap-4">
                  <button
                    onClick={profile.onboardingCompleted ? onOpenDashboard : onStartOnboarding}
                    className="group inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-6 py-3.5 text-sm font-semibold text-[var(--color-on-primary)] shadow-sm transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-[var(--color-primary-hover)] hover:shadow-lg active:translate-y-0 active:scale-[0.98]"
                  >
                    <span>{profile.onboardingCompleted ? t('Open Career Dashboard') : t('Start Your Career Journey')}</span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
                  </button>

                  <a
                    href="#how-it-works"
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3.5 text-sm font-medium text-[var(--text-primary)] transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-secondary)] active:translate-y-0 active:scale-[0.98]"
                  >
                    {t('Explore How It Works')}
                  </a>
                </div>
              </Reveal>

              <Reveal delay={0.24}>
                <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[var(--text-secondary)]">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-[var(--color-success-strong)]" />
                    <span>{t('Zero fake metrics')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-[var(--color-success-strong)]" />
                    <span>{t('Bi-directional career graph')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-[var(--color-success-strong)]" />
                    <span>{t('Bilingual English & Arabic')}</span>
                  </div>
                </div>
              </Reveal>
            </div>

            {/* Hero visual — 3D card stack (desktop) / 2×2 grid (mobile) */}
            <div className="lg:col-span-6 xl:col-span-6">
              <Reveal delay={0.3} distance="soft">
                <HeroVisual3D />
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* Problem — career decisions are fragmented */}
      <section id="problem" className="scroll-mt-24 border-b border-[var(--color-border)] px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <div className="max-w-2xl">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
                {t('The problem')}
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                {t('Career decisions are fragmented.')}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                Everything that shapes your career lives somewhere different, so no single
                view ever tells you whether you are actually getting closer.
              </p>
            </div>
          </Reveal>

          <Stagger inView gap={0.08} className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FRAGMENTATION_POINTS.map((point) => (
              <StaggerItem key={point.title}>
                <div className="h-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:shadow-md">
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">{point.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{point.body}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Solution + How It Works */}
      <section id="how-it-works" className="scroll-mt-24 border-b border-[var(--color-border)] bg-[var(--color-surface-secondary)]/40 px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
                {t('How it works')}
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                {t('CareerDev4AI brings the journey together.')}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                {t('One connected path instead of eight disconnected tools.')}
              </p>
            </div>
          </Reveal>

          {/* The chain */}
          <Reveal delay={0.08}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-center">
              {CAREER_CHAIN.map((step, index) => (
                <React.Fragment key={step}>
                  <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)]">
                    {step}
                  </span>
                  {index < CAREER_CHAIN.length - 1 && (
                    <ArrowRight
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0 text-[var(--color-border-strong)] rtl:rotate-180"
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          </Reveal>

          <Stagger inView gap={0.09} className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {HOW_IT_WORKS.map((step, index) => {
              const Icon = step.icon;
              return (
                <StaggerItem key={step.title}>
                  <div className="group h-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:shadow-md">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-accent-surface)] text-[var(--color-primary-text)] transition-transform duration-200 group-hover:scale-105">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="font-mono text-[11px] font-bold text-[var(--text-muted)]">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <h3 className="mt-4 text-base font-bold text-[var(--text-primary)]">{step.title}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{step.body}</p>
                  </div>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>
      </section>

      {/* Career Journey Visual */}
      <section id="journey" className="scroll-mt-24 border-b border-[var(--color-border)] px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
                {t('Career Journey')}
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                {t('From direction to destination.')}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                {t('A step-by-step path that connects your ambition to concrete evidence and career momentum.')}
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.1} distance="soft">
            <div className="mx-auto mt-12 max-w-3xl">
              <CareerJourneyVisual />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Real Workplace & Learning Context — Authentic Industry Photography */}
      <section id="real-experience" className="scroll-mt-24 border-b border-[var(--color-border)] bg-[var(--color-surface-secondary)]/30 px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
                {t('Real Careers in Action')}
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                {t('Built for students, switchers, and rising leaders.')}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                {t('Whether preparing for your first internship, transitioning into tech, or managing a high-impact team.')}
              </p>
            </div>
          </Reveal>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* Card 1: Learning */}
            <div className="group overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-1 hover:border-[var(--color-border-strong)] hover:shadow-md">
              <div className="relative aspect-video w-full overflow-hidden bg-[var(--color-surface-secondary)]">
                <img
                  src="/images/showcase/learning.webp"
                  alt={t('University student studying with a laptop in a modern educational environment')}
                  width={800}
                  height={450}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <div className="p-5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
                  {t('Students & Fresh Grads')}
                </span>
                <h3 className="mt-1.5 text-sm font-bold text-[var(--text-primary)]">
                  {t('Academic Learning to Industry Readiness')}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {t('Turn semester coursework into targeted portfolios and resume-ready technical evidence.')}
                </p>
              </div>
            </div>

            {/* Card 2: Career Opportunities */}
            <div className="group overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-1 hover:border-[var(--color-border-strong)] hover:shadow-md">
              <div className="relative aspect-video w-full overflow-hidden bg-[var(--color-surface-secondary)]">
                <img
                  src="/images/showcase/career-opportunities.webp"
                  alt={t('Professional job interview and recruitment discussion in a modern office')}
                  width={800}
                  height={450}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <div className="p-5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
                  {t('Working Professionals')}
                </span>
                <h3 className="mt-1.5 text-sm font-bold text-[var(--text-primary)]">
                  {t('Measurable Impact & Skill Progression')}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {t('Benchmark existing proficiencies against senior and lead job specifications.')}
                </p>
              </div>
            </div>

            {/* Card 3: Professional Growth */}
            <div className="group overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-1 hover:border-[var(--color-border-strong)] hover:shadow-md sm:col-span-2 lg:col-span-1">
              <div className="relative aspect-video w-full overflow-hidden bg-[var(--color-surface-secondary)]">
                <img
                  src="/images/showcase/professional-growth.webp"
                  alt={t('Diverse professional team collaborating and problem-solving together')}
                  width={800}
                  height={450}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <div className="p-5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
                  {t('Career Switchers')}
                </span>
                <h3 className="mt-1.5 text-sm font-bold text-[var(--text-primary)]">
                  {t('Transferable Skills & Interview Mastery')}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {t('Practice behavioral and technical STAR responses tailored to your transition path.')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AI Intelligence */}
      <section id="ai-guidance" className="scroll-mt-24 border-b border-[var(--color-border)] px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Reveal>
                <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
                  {t('AI intelligence')}
                </div>
                <h2 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                  {t('Guidance grounded in your career, not generic advice.')}
                </h2>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
                  CareerDev4AI recommends based on the goals you set, the skills you have,
                  the progress you have made and the courses you have taken — and it shows
                  its reasoning, so you can judge the advice for yourself.
                </p>
              </Reveal>
            </div>

            <Stagger inView gap={0.1} className="grid grid-cols-1 gap-4 lg:col-span-7 sm:grid-cols-3">
              {AI_PROMISES.map((promise) => (
                <StaggerItem key={promise.title}>
                  <div className="h-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:shadow-md">
                    <div className="mb-3 h-1 w-8 rounded-full bg-[var(--color-ai)]" />
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">{promise.title}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{promise.body}</p>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </div>
      </section>

      {/* Personas Section */}
      <section id="personas" className="scroll-mt-24 border-b border-[var(--color-border)] bg-[var(--color-surface-secondary)]/40 px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
                {t('Built around your stage')}
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                {t('Tailored for every career stage')}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                CareerDev4AI adapts its priorities, recommendations and roadmaps to where
                you are starting from.
              </p>
            </div>
          </Reveal>

          <Stagger inView gap={0.07} className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {[
              {
                id: 'student',
                title: 'Student',
                category: 'students',
                focus: 'Fundamentals & Internships',
                desc: 'Foundational coursework, first GitHub repositories, internships, and portfolio development.',
              },
              {
                id: 'fresh_grad',
                title: 'Fresh Graduate',
                category: 'education',
                focus: 'Employability & Proof',
                desc: 'Bridging academic-to-industry gaps, CV optimization, targeted entry applications, and interview prep.',
              },
              {
                id: 'working_pro',
                title: 'Working Professional',
                category: 'professionals',
                focus: 'Progression & Promotion',
                desc: 'Advanced specialization, quantifiable achievements, leadership evidence, and market positioning.',
              },
              {
                id: 'career_switcher',
                title: 'Career Switcher',
                category: 'switchers',
                focus: 'Transferable Skills',
                desc: 'Identifying transferable strengths, targeted transition roadmaps, and proof-of-skill portfolio pieces.',
              },
              {
                id: 'exploring',
                title: 'Exploring',
                category: 'entrepreneurship',
                focus: 'Discovery & Fit',
                desc: 'Comparing emerging disciplines, understanding market compensations, and discovering your optimal path.',
              },
            ].map((persona) => (
              <StaggerItem key={persona.id}>
                <div className="flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:shadow-md">
                  <div>
                    <CareerImage
                      category={persona.category}
                      aspectRatio="16/10"
                      size="sm"
                      rounded="rounded-xl"
                      className="mb-3.5 h-28 w-full"
                    />
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-primary-text)]">
                        {persona.focus}
                      </div>
                      <h3 className="text-base font-bold text-[var(--text-primary)]">{persona.title}</h3>
                      <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{persona.desc}</p>
                    </div>
                  </div>
                  <button
                    onClick={onStartOnboarding}
                    className="group mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-3 text-xs font-medium text-[var(--color-primary-text)] transition-colors hover:text-[var(--text-primary)]"
                  >
                    <span>{t('Select Persona')}</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
                  </button>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Target Roles Preview */}
      <section id="roles" className="scroll-mt-24 border-b border-[var(--color-border)] px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
                  {t('Target roles')}
                </div>
                <h2 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                  {t('Structured role profiles')}
                </h2>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Explore comprehensive skill profiles, salary benchmarks, and interview
                  topics.
                </p>
              </div>
              <button
                onClick={onExploreRoles}
                className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--color-primary-text)] transition-colors hover:underline"
              >
                <span>View All {TARGET_ROLES.length} Roles</span>
                <ArrowUpRight className="h-3.5 w-3.5 rtl:-rotate-90" />
              </button>
            </div>
          </Reveal>

          <Stagger inView gap={0.09} className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURED_ROLES.map((role) => (
              <StaggerItem key={role.id}>
                <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:shadow-md">
                  <CareerImage
                    category={role.domainId || role.id}
                    aspectRatio="video"
                    size="sm"
                    rounded="rounded-xl"
                    className="mb-4 h-36 w-full"
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-[var(--text-primary)]">{role.title}</h3>
                      <div className="text-xs text-[var(--text-muted)]">
                        {role.category} · {role.level}
                      </div>
                    </div>
                    <span className="shrink-0 rounded bg-[var(--color-success-surface)] px-2 py-0.5 font-mono text-xs font-medium text-[var(--color-success-strong)]">
                      {role.salaryRange.startsWith('$') ? role.salaryRange.split(' ')[0] : 'Varies'}
                    </span>
                  </div>

                  <p className="mt-4 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                    {role.overview}
                  </p>

                  <div className="mt-auto space-y-2 border-t border-[var(--color-border)] pt-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {t('Required Skills')}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {role.requiredSkills.slice(0, 4).map((skill, idx) => (
                        <span
                          key={idx}
                          className="rounded bg-[var(--color-surface-secondary)] px-2 py-0.5 text-xs text-[var(--text-secondary)]"
                        >
                          {skill.name} (Lvl {skill.minLevel})
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={onExploreRoles}
                    className="mt-4 w-full rounded-lg bg-[var(--color-surface-secondary)] py-2 text-xs font-medium text-[var(--color-primary-text)] transition-colors hover:bg-[var(--color-accent-surface)]"
                  >
                    {t('View Role Breakdown →')}
                  </button>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Interactive product preview — the real planning engine, running live */}
      <section id="preview" className="scroll-mt-24 border-b border-[var(--color-border)] bg-[var(--color-surface-secondary)]/40 px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
                {t('Product preview')}
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                {t('Try it on a real role. Right now.')}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                {t(
                  'This is not a screenshot. Pick a role and the platform’s own planning engine builds the roadmap, the skill gaps and the next step in front of you.',
                )}
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.08} distance="soft">
            <div className="mx-auto mt-10 max-w-4xl">
              <ProductPreview />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Features — every capability named here is implemented */}
      <section id="features" className="scroll-mt-24 border-b border-[var(--color-border)] px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
                {t('What you get')}
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                {t('One workspace, ten connected capabilities.')}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                {t(
                  'Each one is a real part of the signed-in product, and each one feeds the next. Nothing here is a promise about a feature that does not exist.',
                )}
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.08} distance="soft">
            <div className="mt-10">
              <FeatureGrid />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Trust and transparency */}
      <section id="trust" className="scroll-mt-24 border-b border-[var(--color-border)] bg-[var(--color-surface-secondary)]/40 px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
                {t('Trust and transparency')}
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                {t('How the platform reaches its conclusions.')}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                {t(
                  'A platform that tells you what you are missing should be equally clear about how it knows, and honest about what it cannot know.',
                )}
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.08} distance="soft">
            <div className="mt-10">
              <TrustSection />
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-24 border-b border-[var(--color-border)] px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
                {t('Questions')}
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                {t('Frequently asked questions')}
              </h2>
            </div>
          </Reveal>

          <Reveal delay={0.08} distance="soft">
            <div className="mx-auto mt-10 max-w-3xl">
              <FaqSection />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Contact and legal */}
      <section id="contact" className="scroll-mt-24 border-b border-[var(--color-border)] bg-[var(--color-surface-secondary)]/40 px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
                {t('Contact')}
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                {t('Talk to the people who build it.')}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                {t('The same support address, the same published legal documents, and the same operator the Terms name.')}
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.08} distance="soft">
            <div className="mt-10">
              <ContactSection />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden px-6 py-20">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 cp-brand-wash-strong" />
        <div className="relative mx-auto max-w-3xl text-center">
          <Reveal>
            <h2 className="text-balance text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">
              {t('Your next career move starts here.')}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">
              One workspace that carries you from ambition to a direction, a roadmap, real
              evidence, a sharper CV and the opportunities that follow.
            </p>
            <div className="mt-8">
              <button
                onClick={onStartOnboarding}
                className="group inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-8 py-3.5 text-sm font-semibold text-[var(--color-on-primary)] shadow-sm transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-[var(--color-primary-hover)] hover:shadow-lg active:translate-y-0 active:scale-[0.98]"
              >
                <span>{t('Start Your Career Journey')}</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-[var(--color-border)] px-6 py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 text-xs text-[var(--text-muted)]">
          <Logo variant="full" className="h-10 w-auto self-start sm:h-12" />
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div>
              <span>© 2026 CareerDev4AI. Personal Career Operating System.</span>
              <span className="mx-2 text-[var(--border-subtle)]">·</span>
              <span>
                Developed by{' '}
                <a
                  href={OPERATOR_LINKEDIN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[var(--text-secondary)] hover:text-[var(--color-primary-text)] underline transition-colors"
                >
                  {t('Ahmed Ebrahim')}
                </a>
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 sm:justify-end">
              <a
                href={PUBLIC_PATHS.terms}
                className="font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--color-primary-text)] hover:underline"
              >
                {t('Terms')}
              </a>
              <a
                href={PUBLIC_PATHS.privacy}
                className="font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--color-primary-text)] hover:underline"
              >
                {t('Privacy')}
              </a>
              <a
                href={PUBLIC_PATHS.about}
                className="font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--color-primary-text)] hover:underline"
              >
                {t('About')}
              </a>
              <a
                href={PUBLIC_PATHS.careers}
                className="font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--color-primary-text)] hover:underline"
              >
                {t('Career roles')}
              </a>
              <a
                href={PUBLIC_PATHS.learning}
                className="font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--color-primary-text)] hover:underline"
              >
                {t('Learning')}
              </a>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--color-primary-text)] hover:underline"
              >
                {t('Contact')}
              </a>
              {/* The language switch is a real control, not a label. */}
              <button
                type="button"
                onClick={() => updateSettings({ language: settings.language === 'en' ? 'ar' : 'en' })}
                aria-label={t('Switch interface language')}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2 py-1 font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--text-primary)]"
              >
                <Languages className="h-3 w-3" />
                {settings.language === 'en' ? 'العربية' : 'English'}
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
