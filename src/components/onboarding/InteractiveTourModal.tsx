import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  Sparkles, 
  Lightbulb, 
  Compass, 
  Layers, 
  BookOpen, 
  Award, 
  FolderGit2, 
  Briefcase, 
  FileText, 
  User, 
  Home, 
  ListOrdered,
  RotateCcw,
  FastForward,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { TOUR_CHAPTERS, TOTAL_TOUR_STEPS } from './tourData';
import { dismissGuide, resetAllGuidesApi } from '../../lib/personalizationApi';
import { placeTooltip } from './useSpotlight';

const STORAGE_KEY = 'careerdev4ai_product_tour_state';

interface TourPersistedState {
  completedChapters: string[];
  activeChapterId: string;
  activeStepIndex: number;
  tourDismissed: boolean;
  tourCompleted: boolean;
}

const getPersistedState = (): TourPersistedState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          completedChapters: Array.isArray(parsed.completedChapters) ? parsed.completedChapters : [],
          activeChapterId: typeof parsed.activeChapterId === 'string' ? parsed.activeChapterId : 'welcome',
          activeStepIndex: typeof parsed.activeStepIndex === 'number' ? parsed.activeStepIndex : 0,
          tourDismissed: Boolean(parsed.tourDismissed),
          tourCompleted: Boolean(parsed.tourCompleted),
        };
      }
    }
  } catch {}
  return {
    completedChapters: [],
    activeChapterId: 'welcome',
    activeStepIndex: 0,
    tourDismissed: false,
    tourCompleted: false,
  };
};

const savePersistedState = (state: Partial<TourPersistedState>) => {
  try {
    const current = getPersistedState();
    const updated = { ...current, ...state };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {}
};

interface InteractiveTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentView: string;
  onNavigate: (view: string) => void;
}

interface SpotlightPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

const CHAPTER_ICONS: Record<string, React.FC<{ className?: string }>> = {
  Sparkles,
  Home,
  Compass,
  Layers,
  BookOpen,
  Award,
  FolderGit2,
  Briefcase,
  FileText,
  User,
};

export const InteractiveTourModal: React.FC<InteractiveTourModalProps> = ({
  isOpen,
  onClose,
  currentView,
  onNavigate,
}) => {
  const { t, settings, targetRole, skills, projects } = useCareer();
  const isRtl = settings.language === 'ar';

  const [persisted, setPersisted] = useState<TourPersistedState>(getPersistedState);
  const [chapterId, setChapterId] = useState<string>(persisted.activeChapterId || 'welcome');
  const [stepIndex, setStepIndex] = useState<number>(persisted.activeStepIndex || 0);
  const [chapterDrawerOpen, setChapterDrawerOpen] = useState(false);
  const [position, setPosition] = useState<SpotlightPosition | null>(null);
  const [targetMissing, setTargetMissing] = useState(false);

  // The viewport size, kept live. The card is placed against it, and a
  // window that is resized while the tour is open has to move the card
  // rather than leave it hanging off the screen.
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  }));
  const viewportWidth = viewport.width;
  const viewportHeight = viewport.height;

  useEffect(() => {
    const onResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Sync state changes to storage
  useEffect(() => {
    savePersistedState({
      activeChapterId: chapterId,
      activeStepIndex: stepIndex,
      completedChapters: persisted.completedChapters,
      tourDismissed: persisted.tourDismissed,
      tourCompleted: persisted.tourCompleted,
    });
  }, [chapterId, stepIndex, persisted]);

  // Current active chapter and step
  const currentChapterIndex = useMemo(
    () => Math.max(0, TOUR_CHAPTERS.findIndex((c) => c.id === chapterId)),
    [chapterId]
  );
  const currentChapter = TOUR_CHAPTERS[currentChapterIndex] || TOUR_CHAPTERS[0];
  const steps = currentChapter.steps;
  const currentStep = steps[stepIndex] || steps[0];

  // Calculate overall step index across the whole tour (0 to 46)
  const overallStepNumber = useMemo(() => {
    let count = 0;
    for (let i = 0; i < currentChapterIndex; i++) {
      count += TOUR_CHAPTERS[i].steps.length;
    }
    return count + stepIndex + 1;
  }, [currentChapterIndex, stepIndex]);

  const overallProgressPct = Math.round((overallStepNumber / TOTAL_TOUR_STEPS) * 100);

  // Navigate view automatically when required by the step
  useEffect(() => {
    if (!isOpen || !currentStep) return;
    if (currentStep.view && currentStep.view !== currentView) {
      onNavigate(currentStep.view);
    }
  }, [isOpen, currentStep, currentView, onNavigate]);

  // Spotlight position updater
  useLayoutEffect(() => {
    if (!isOpen || !currentStep) {
      setPosition(null);
      return;
    }

    let isMounted = true;

    const findTarget = () => {
      let el = document.querySelector(currentStep.target);
      if (!el && currentStep.fallbackTarget) {
        el = document.querySelector(currentStep.fallbackTarget);
      }
      return el as HTMLElement | null;
    };

    const updatePosition = () => {
      const el = findTarget();
      if (!el) {
        if (isMounted) {
          setTargetMissing(true);
          setPosition(null);
        }
        return;
      }

      const rect = el.getBoundingClientRect();
      if (isMounted) {
        setTargetMissing(false);
        setPosition({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      }
    };

    // Give DOM time to settle if view transitioned
    const timer = setTimeout(() => {
      const el = findTarget();
      if (el) {
        try {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch {}
      }
      updatePosition();
    }, 280);

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, currentStep, currentView]);

  // Actions
  const handleExit = useCallback(() => {
    savePersistedState({ tourDismissed: true });
    setPersisted((prev) => ({ ...prev, tourDismissed: true }));
    void dismissGuide('product_tour').catch(() => {});
    onClose();
  }, [onClose]);

  const handleNextStep = useCallback(() => {
    if (stepIndex < steps.length - 1) {
      setStepIndex((prev) => prev + 1);
    } else {
      // Mark current chapter as completed
      const nextCompleted = Array.from(new Set([...persisted.completedChapters, currentChapter.id]));
      setPersisted((prev) => ({ ...prev, completedChapters: nextCompleted }));
      void dismissGuide(`tour_${currentChapter.id}`).catch(() => {});

      if (currentChapterIndex < TOUR_CHAPTERS.length - 1) {
        // Move to next chapter
        const nextChap = TOUR_CHAPTERS[currentChapterIndex + 1];
        setChapterId(nextChap.id);
        setStepIndex(0);
      } else {
        // Tour Finished!
        setPersisted((prev) => ({ ...prev, tourCompleted: true, tourDismissed: true }));
        void dismissGuide('product_tour').catch(() => {});
        onClose();
      }
    }
  }, [stepIndex, steps.length, persisted.completedChapters, currentChapter.id, currentChapterIndex, onClose]);

  const handlePrevStep = useCallback(() => {
    if (stepIndex > 0) {
      setStepIndex((prev) => prev - 1);
    } else if (currentChapterIndex > 0) {
      const prevChap = TOUR_CHAPTERS[currentChapterIndex - 1];
      setChapterId(prevChap.id);
      setStepIndex(prevChap.steps.length - 1);
    }
  }, [stepIndex, currentChapterIndex]);

  const handleSkipChapter = useCallback(() => {
    if (currentChapterIndex < TOUR_CHAPTERS.length - 1) {
      const nextChap = TOUR_CHAPTERS[currentChapterIndex + 1];
      setChapterId(nextChap.id);
      setStepIndex(0);
    } else {
      handleExit();
    }
  }, [currentChapterIndex, handleExit]);

  const handleSelectChapter = (cId: string) => {
    setChapterId(cId);
    setStepIndex(0);
    setChapterDrawerOpen(false);
  };

  const handleRestartTour = useCallback(() => {
    setChapterId('welcome');
    setStepIndex(0);
    setPersisted({
      completedChapters: [],
      activeChapterId: 'welcome',
      activeStepIndex: 0,
      tourDismissed: false,
      tourCompleted: false,
    });
    setChapterDrawerOpen(false);
    void resetAllGuidesApi().catch(() => {});
  }, []);

  // Event listener for opening or restarting tour
  useEffect(() => {
    const handleTourEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ restart?: boolean; chapterId?: string }>).detail;
      if (detail?.restart) {
        handleRestartTour();
      } else if (detail?.chapterId) {
        handleSelectChapter(detail.chapterId);
      }
    };
    window.addEventListener('careerdev4ai:open-tour', handleTourEvent);
    return () => window.removeEventListener('careerdev4ai:open-tour', handleTourEvent);
  }, [handleRestartTour]);

  // Keyboard controls
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleExit();
      } else if (e.key === 'ArrowRight') {
        if (isRtl) handlePrevStep();
        else handleNextStep();
      } else if (e.key === 'ArrowLeft') {
        if (isRtl) handleNextStep();
        else handlePrevStep();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, handleExit, handleNextStep, handlePrevStep, isRtl]);

  if (!isOpen) return null;

  // Popover positioning logic.
  //
  // The card is never allowed to sit on top of the element the step is
  // describing: `placeTooltip` tries every side and rejects any placement
  // that would overlap the target. On a phone the card becomes a sheet at
  // the bottom of the screen, which is the only place it can go without
  // covering the subject.
  const isMobile = viewportWidth < 768;
  const cardWidth = 380;
  const cardHeight = 300;
  const margin = 16;

  const placement = placeTooltip({
    rect: position && !targetMissing ? position : null,
    cardWidth,
    cardHeight,
    margin,
    gap: 12,
    viewportWidth,
    viewportHeight,
    isRtl,
  });

  const cardTop = placement.top;
  const cardLeft = placement.left;

  const IconComponent = CHAPTER_ICONS[currentChapter.icon] || Sparkles;
  const isLastStepOfChapter = stepIndex === steps.length - 1;
  const isLastStepOfTour = isLastStepOfChapter && currentChapterIndex === TOUR_CHAPTERS.length - 1;

  // Intelligent Contextual Hint (grounded in user's profile state)
  const contextualHint = (() => {
    if (currentChapter.id === 'career-planning' && !targetRole.title) {
      return t('You have not selected a target role yet. Use the catalog to choose your goal!');
    }
    if (currentChapter.id === 'skills' && skills.length === 0) {
      return t('You have no skills rated yet. Rate your proficiencies to generate accurate gaps.');
    }
    if (currentChapter.id === 'projects' && projects.length === 0) {
      return t('Add your first portfolio project to make your CV stand out to recruiters.');
    }
    return null;
  })();

  return (
    <div
      className="fixed inset-0 z-[120] select-none"
      role="dialog"
      aria-modal="true"
      aria-label={t('Interactive Product Tour')}
    >
      {/*
        The backdrop.

        When the step has a target, the dimming is drawn by the spotlight
        below as a RING, so the element the instruction is talking about stays
        fully visible. Painting a full-screen scrim here as well would put a
        dark veil over that element — the one thing the candidate is being
        asked to look at — and the spotlight ring underneath it could not
        undo it.

        So the backdrop is transparent while a spotlight is showing, and it
        only dims the page when the step has nothing to point at.
      */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${
          position && !targetMissing ? 'bg-transparent' : 'bg-black/60'
        }`}
        onClick={handleExit}
        aria-hidden="true"
      />

      {/* Spotlight cutout around the target element */}
      {position && !targetMissing && (
        <div
          className="pointer-events-none absolute rounded-xl border-2 border-[var(--color-primary)] transition-all duration-300"
          style={{
            top: position.top - 6,
            left: position.left - 6,
            width: position.width + 12,
            height: position.height + 12,
            // The ring is the dimming. The element's own box is left
            // uncovered, so it is the brightest thing on the screen.
            boxShadow: '0 0 0 9999px rgba(8, 11, 18, 0.68), 0 0 24px var(--color-primary)',
          }}
          aria-hidden="true"
        />
      )}

      {/* Main Tour Guidance Card */}
      <div
        className={`z-[130] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 shadow-2xl transition-all duration-200 ${
          isMobile
            ? 'fixed inset-x-3 bottom-4 max-h-[85vh] overflow-y-auto'
            : 'absolute'
        }`}
        style={
          isMobile
            ? undefined
            : {
                top: cardTop,
                left: cardLeft,
                width: cardWidth,
              }
        }
      >
        {/* Top Header: Chapter badge, step counter & action menu */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
          <button
            type="button"
            onClick={() => setChapterDrawerOpen((prev) => !prev)}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--surface-secondary)] px-2.5 py-1 text-xs font-semibold text-[var(--color-primary-text)] transition-colors hover:bg-[var(--accent-surface)]"
            title={t('Jump to Chapter')}
          >
            <IconComponent className="h-3.5 w-3.5" />
            <span className="truncate max-w-[170px]">
              {t(currentChapter.title)}
            </span>
            <ListOrdered className="h-3 w-3 opacity-70" />
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-[var(--text-muted)]">
              {stepIndex + 1}/{steps.length}
            </span>
            <button
              type="button"
              onClick={handleExit}
              className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
              title={t('Exit Tour')}
              aria-label={t('Exit Tour')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Overall Journey Progress Bar */}
        <div className="mt-2.5 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
          <span>{t('Overall Progress')}</span>
          <span className="font-mono font-bold text-[var(--color-primary-text)]">
            {overallStepNumber} / {TOTAL_TOUR_STEPS} ({overallProgressPct}%)
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-ai)] transition-all duration-300"
            style={{ width: `${overallProgressPct}%` }}
          />
        </div>

        {/* Content Body */}
        <div className="mt-4 space-y-2.5">
          <h3 className="text-base font-bold tracking-tight text-[var(--text-primary)]">
            {t(currentStep.title)}
          </h3>

          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
            {t(currentStep.body)}
          </p>

          {/* Practical tip box */}
          {currentStep.example && (
            <div className="flex items-start gap-2 rounded-xl border border-[var(--color-ai)]/20 bg-[var(--color-ai)]/5 p-2.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
              <Lightbulb className="h-3.5 w-3.5 shrink-0 text-[var(--color-ai)] mt-0.5" />
              <div>
                <span className="font-semibold text-[var(--text-primary)]">{t('Practical Tip')}: </span>
                {t(currentStep.example)}
              </div>
            </div>
          )}

          {/* Dynamic intelligent account notice */}
          {contextualHint && (
            <div className="flex items-start gap-2 rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-2 text-[11px] text-[var(--text-primary)]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[var(--color-warning)] mt-0.5" />
              <span>{contextualHint}</span>
            </div>
          )}
        </div>

        {/* Tour Control Actions */}
        <div className="mt-5 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrevStep}
              disabled={stepIndex === 0 && currentChapterIndex === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:pointer-events-none"
              title={t('Previous Step')}
            >
              {isRtl ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
              <span>{t('Back')}</span>
            </button>

            <button
              type="button"
              onClick={handleExit}
              className="text-[11px] text-[var(--text-muted)] underline-offset-2 hover:underline hover:text-[var(--text-primary)] px-1"
              title={t('End the tour now. You can start it again from Settings.')}
            >
              {t('Skip Tour')}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!isLastStepOfTour && (
              <button
                type="button"
                onClick={handleSkipChapter}
                className="hidden sm:inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                title={t('Skip Chapter')}
              >
                <FastForward className="h-3 w-3" />
                <span>{t('Skip Chapter')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleNextStep}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-transform hover:scale-[1.02] active:scale-95"
            >
              <span>
                {isLastStepOfTour
                  ? t('Finish Tour')
                  : isLastStepOfChapter
                  ? t('Finish Chapter')
                  : t('Next')}
              </span>
              {isLastStepOfTour ? (
                <Check className="h-3.5 w-3.5" />
              ) : isRtl ? (
                <ChevronLeft className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Chapters Selector Drawer / Overlay */}
      {chapterDrawerOpen && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setChapterDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2">
                <ListOrdered className="h-4 w-4 text-[var(--color-primary-text)]" />
                <h4 className="text-sm font-bold text-[var(--text-primary)]">
                  {t('All Chapters')}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setChapterDrawerOpen(false)}
                className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-secondary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 max-h-[60vh] space-y-1.5 overflow-y-auto pe-1">
              {TOUR_CHAPTERS.map((ch, idx) => {
                const ChIcon = CHAPTER_ICONS[ch.icon] || Sparkles;
                const isCurrent = ch.id === currentChapter.id;
                const isCompleted = persisted.completedChapters.includes(ch.id);

                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => handleSelectChapter(ch.id)}
                    className={`w-full flex items-center justify-between rounded-xl p-3 text-start transition-colors ${
                      isCurrent
                        ? 'border border-[var(--color-primary)] bg-[var(--accent-surface)] text-[var(--color-primary-text)] font-semibold'
                        : 'border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                        isCurrent ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--surface-main)] text-[var(--text-muted)]'
                      }`}>
                        <ChIcon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs truncate">
                          {idx + 1}. {t(ch.title)}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)]">
                          {ch.steps.length} {t('Steps')}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 ps-2">
                      {isCompleted ? (
                        <CheckCircle2 className="h-4 w-4 text-[var(--color-success-strong)]" />
                      ) : isCurrent ? (
                        <span className="text-[10px] font-bold text-[var(--color-primary-text)] uppercase">
                          {t('Active')}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 text-xs">
              <button
                type="button"
                onClick={handleRestartTour}
                className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{t('Restart Tour')}</span>
              </button>

              <button
                type="button"
                onClick={() => setChapterDrawerOpen(false)}
                className="rounded-lg bg-[var(--surface-secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--border-subtle)]"
              >
                {t('Close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
