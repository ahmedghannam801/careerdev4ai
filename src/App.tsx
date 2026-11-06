/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, lazy, Suspense } from 'react';
import { CareerProvider, useCareer } from './context/CareerContext';
import { FeedbackProvider } from './context/FeedbackContext';
import { FeedbackInvitationHost } from './components/feedback/FeedbackInvitationHost';
import { AppShell } from './components/layout/AppShell';
import { AuthModal } from './components/auth/AuthModal';
import { ConsentGate } from './components/auth/ConsentGate';
import { PasswordRecoveryModal } from './components/auth/PasswordRecoveryModal';
import { LandingView } from './components/views/LandingView';
import { Logo } from './components/brand/Logo';
import { Skeleton } from './components/ui/Skeleton';
import { GuidedTour, GUIDES, type GuideDefinition, type GuideKey } from './components/onboarding/GuidedTour';
import { InteractiveTourModal } from './components/onboarding/InteractiveTourModal';
import { fetchDismissedGuides } from './lib/personalizationApi';
import { buildRouteHash, isKnownRoute, parseRouteHash, resolveRouteId } from './lib/routing';
import { analyticsPathForRoute, trackPageView } from './lib/analytics';
import { applyRouteMeta, routeMetaFor } from './lib/seo';
import { shouldForceOnboarding } from '../shared/onboarding';

/**
 * The authenticated experience is loaded on demand.
 *
 * A visitor who only sees the landing page should not download the CV studio,
 * the interview trainer and the settings screens to look at a headline. Each
 * view is a separate chunk that is fetched the first time it is opened, and
 * the hashed chunks are served with a one-year immutable cache header.
 */
const OnboardingView = lazy(() => import('./components/views/OnboardingView').then((m) => ({ default: m.OnboardingView })));
const DashboardView = lazy(() => import('./components/views/DashboardView').then((m) => ({ default: m.DashboardView })));
const MyCareerView = lazy(() => import('./components/views/MyCareerView').then((m) => ({ default: m.MyCareerView })));
const CareerSetupView = lazy(() => import('./components/views/CareerSetupView').then((m) => ({ default: m.CareerSetupView })));
const CareerAnalysisView = lazy(() => import('./components/views/CareerAnalysisView').then((m) => ({ default: m.CareerAnalysisView })));
const CareerPlanView = lazy(() => import('./components/views/CareerPlanView').then((m) => ({ default: m.CareerPlanView })));
const SkillsCenterView = lazy(() => import('./components/views/SkillsCenterView').then((m) => ({ default: m.SkillsCenterView })));
const SkillAssessmentView = lazy(() => import('./components/views/SkillAssessmentView').then((m) => ({ default: m.SkillAssessmentView })));
const RoadmapView = lazy(() => import('./components/views/RoadmapView').then((m) => ({ default: m.RoadmapView })));
const LearningCenterView = lazy(() => import('./components/views/LearningCenterView').then((m) => ({ default: m.LearningCenterView })));
const ProjectsView = lazy(() => import('./components/views/ProjectsView').then((m) => ({ default: m.ProjectsView })));
const VolunteerView = lazy(() => import('./components/views/VolunteerView').then((m) => ({ default: m.VolunteerView })));
const EvidenceView = lazy(() => import('./components/views/EvidenceView').then((m) => ({ default: m.EvidenceView })));
const CVStudioView = lazy(() => import('./components/views/CVStudioView').then((m) => ({ default: m.CVStudioView })));
const CvAnalyzerView = lazy(() => import('./components/views/CvAnalyzerView').then((m) => ({ default: m.CvAnalyzerView })));
const JobsView = lazy(() => import('./components/views/JobsView').then((m) => ({ default: m.JobsView })));
const ApplicationsView = lazy(() => import('./components/views/ApplicationsView').then((m) => ({ default: m.ApplicationsView })));
const InterviewsView = lazy(() => import('./components/views/InterviewsView').then((m) => ({ default: m.InterviewsView })));
const ProgressView = lazy(() => import('./components/views/ProgressView').then((m) => ({ default: m.ProgressView })));
const SettingsView = lazy(() => import('./components/views/SettingsView').then((m) => ({ default: m.SettingsView })));
const PublicProfileView = lazy(() => import('./components/views/PublicProfileView').then((m) => ({ default: m.PublicProfileView })));
const ProfileView = lazy(() => import('./components/views/ProfileView').then((m) => ({ default: m.ProfileView })));
const DocumentsView = lazy(() => import('./components/views/DocumentsView').then((m) => ({ default: m.DocumentsView })));
const ActivityView = lazy(() => import('./components/views/ActivityView').then((m) => ({ default: m.ActivityView })));
const AdminCenterView = lazy(() => import('./components/views/AdminCenterView').then((m) => ({ default: m.AdminCenterView })));
const PricingView = lazy(() => import('./components/views/PricingView').then((m) => ({ default: m.PricingView })));

/**
 * Extracts the username from `#/profile/<username>`. A plain `#/profile` is
 * the signed-in user's own profile and therefore not a public link.
 */
const readPublicProfileUsername = (): string | null =>
  parseRouteHash(window.location.hash).publicUsername;

/**
 * The placeholder shown while a view chunk is being fetched.
 *
 * It reserves the shape of the panel that is about to arrive, so the layout
 * settles into place instead of jumping, and it uses a calm branded shimmer
 * rather than a spinner.
 */
function ViewFallback() {
  const { t } = useCareer();
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <span className="sr-only">{t('Loading…')}</span>
      <Skeleton className="h-8 w-64" widthClassName="w-64" />
      <Skeleton className="h-40 w-full" widthClassName="w-full" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" widthClassName="w-full" />
        ))}
      </div>
    </div>
  );
}

function AppRoutes() {
  const {
    profile,
    setActiveView,
    currentUser,
    isAuthReady,
    hydrationError,
    isHydrated,
    consentRequired,
    consentError,
    setAuthModalOpen,
    setCopilotOpen, t,} = useCareer();
  const [currentView, setCurrentView] = useState<string>(() => {
    // A deep link has to survive a refresh, so the hash is resolved against
    // the known routes on the very first render — before the session has
    // even been restored. A hash that names nothing falls back to the
    // landing page until hydration says otherwise.
    const resolved = resolveRouteId(window.location.hash, '');
    if (resolved) return resolved;
    return profile.onboardingCompleted ? 'dashboard' : 'landing';
  });
  const [publicUsername, setPublicUsername] = useState<string | null>(
    readPublicProfileUsername
  );
  const [tourOpen, setTourOpen] = useState(false);

  const navigateTo = (view: string) => {
    setCurrentView(view);
    setActiveView(view);
    window.location.hash = buildRouteHash(view);
  };

  // Sync hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const parsed = parseRouteHash(window.location.hash);
      const publicName = parsed.publicUsername;
      setPublicUsername(publicName);

      if (publicName) {
        setCurrentView('profile');
        setActiveView('profile');
        return;
      }

      // A hash the application does not recognise falls back to the
      // dashboard, and the URL is corrected so it says what is on screen.
      if (!isKnownRoute(parsed.route)) {
        if (parsed.route) {
          window.history.replaceState(null, '', buildRouteHash('dashboard'));
        }
        if (currentView !== 'dashboard') {
          setCurrentView('dashboard');
          setActiveView('dashboard');
        }
        return;
      }

      if (parsed.route !== currentView) {
        setCurrentView(parsed.route);
        setActiveView(parsed.route);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentView, setActiveView]);

  // Document metadata and the page view of the current route.
  //
  // The application is one document served from one address, so the metadata
  // is written by the client as the route changes: the landing page may be
  // indexed, every signed-in view is marked `noindex, nofollow`, and the
  // canonical link always points at the home page.
  //
  // The page view is reported here rather than by the tag's automatic
  // behaviour, so that exactly one page view is sent per view the visitor
  // actually opens. The reported path is built from the route, so a public
  // profile's username never reaches the analytics property.
  useEffect(() => {
    const isPublicProfile = Boolean(publicUsername);
    const meta = routeMetaFor(currentView, { isPublicProfile });
    applyRouteMeta(meta);
    trackPageView(analyticsPathForRoute(currentView, publicUsername), meta.title);
  }, [currentView, publicUsername]);

  // Once a session exists, `landing` is no longer a valid in-app view. Leaving
  // it in place made the shell breadcrumb read "Landing" over the dashboard and
  // stranded new users on the dashboard instead of the onboarding flow.
  //
  // The onboarding decision waits for hydration: the pre-hydration profile is
  // empty, so acting on `onboardingCompleted` immediately would flash the
  // onboarding wizard in front of an existing user.
  //
  // The status, not the legacy boolean, decides. A skipped tour stores
  // `onboarding_completed = false` on purpose, because skipping is not
  // completion; using the boolean here would drag the user back into the tour
  // on every sign-in. `shouldForceOnboarding` treats completed and skipped as
  // "do not force", and started or never-started as "resume".
  const forceOnboarding = shouldForceOnboarding({
    status: profile.onboardingStatus,
    completed: profile.onboardingCompleted,
  });

  useEffect(() => {
    if (!currentUser || currentView === 'onboarding') return;

    if (!isHydrated) {
      if (currentView === 'landing') {
        setCurrentView('dashboard');
        setActiveView('dashboard');
        window.location.hash = buildRouteHash('dashboard');
      }
      return;
    }

    if (forceOnboarding) {
      setCurrentView('onboarding');
      setActiveView('onboarding');
      window.location.hash = buildRouteHash('onboarding');
    } else if (currentView === 'landing') {
      setCurrentView('dashboard');
      setActiveView('dashboard');
      window.location.hash = buildRouteHash('dashboard');
    }
  }, [currentUser, isHydrated, forceOnboarding, currentView, setActiveView]);

  useEffect(() => {
    let cancelled = false;
    const checkTourState = async () => {
      try {
        const dismissed = await fetchDismissedGuides();
        if (cancelled) return;
        const local = localStorage.getItem('careerdev4ai_product_tour_state');
        let localDismissed = false;
        if (local) {
          try {
            localDismissed = Boolean(JSON.parse(local)?.tourDismissed);
          } catch {}
        }
        if (!dismissed.includes('product_tour') && !localDismissed && currentUser && !forceOnboarding && currentView === 'dashboard') {
          setTourOpen(true);
        }
      } catch {}
    };

    void checkTourState();

    const handleOpenTourEvent = () => {
      setTourOpen(true);
    };

    window.addEventListener('careerdev4ai:open-tour', handleOpenTourEvent);
    return () => {
      cancelled = true;
      window.removeEventListener('careerdev4ai:open-tour', handleOpenTourEvent);
    };
  }, [currentUser, forceOnboarding, currentView]);

  // B.4 finding C-1 (session gate).
  //
  // The application used to render the authenticated AppShell for any
  // visitor. An anonymous user therefore saw the whole dashboard — a demo
  // persona, a demo roadmap, demo applications — and could browse every
  // authenticated view without a session.
  //
  // The gate has three states:
  //   * the session is still being restored -> a neutral loader;
  //   * there is no session                -> the landing page only, with the
  //                                            sign-in dialog offered;
  //   * there is a session                 -> the authenticated experience.
  if (!isAuthReady && !publicUsername) {
    return (
      <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Logo variant="icon" className="h-9 w-9" alt="" />
          <div className="text-xs text-[var(--text-muted)]">{t('Restoring your session…')}</div>
        </div>
      </div>
    );
  }

  // Public profile share link. It is intentionally checked before the auth
  // gate because the link is meant for people without an account.
  if (publicUsername) {
    return (
      <Suspense fallback={<ViewFallback />}>
        <PublicProfileView
          username={publicUsername}
          onBack={() => {
            window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
            setPublicUsername(null);
            const nextView = currentUser ? 'dashboard' : 'landing';
            setCurrentView(nextView);
            setActiveView(nextView);
          }}
        />
      </Suspense>
    );
  }

  // Landing view
  if (!currentUser) {
    return (
      <>
        <LandingView
          onStartOnboarding={() => setAuthModalOpen(true)}
          onExploreRoles={() => setAuthModalOpen(true)}
          onOpenDashboard={() => setAuthModalOpen(true)}
        />
        <AuthModal />
      </>
    );
  }

  // The consent gate.
  //
  // The server refuses every protected route until the user has accepted the
  // current Terms & Conditions and Privacy Policy, so there is nothing behind
  // this screen that could work. It replaces the application rather than
  // sitting over it, and it is shown before the onboarding flow, because
  // onboarding is a protected screen too.
  if (consentRequired || consentError) {
    return (
      <>
        <ConsentGate />
        <AuthModal />
      </>
    );
  }

  // Progressive Onboarding
  if (currentView === 'onboarding') {
    return (
      <>
        <Suspense fallback={<ViewFallback />}>
          <OnboardingView
            onComplete={() => navigateTo('dashboard')}
          />
        </Suspense>
        <AuthModal />
      </>
    );
  }

  // Authenticated In-App Experience
  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView onNavigate={navigateTo} onOpenCopilot={() => setCopilotOpen(true)} />;
      case 'my-career':
        return <MyCareerView onNavigate={navigateTo} />;
      case 'roles':
        return <CareerSetupView onNavigate={navigateTo} />;
      case 'analysis':
        return <CareerAnalysisView onNavigate={navigateTo} />;
      case 'plan':
        return <CareerPlanView onNavigate={navigateTo} />;
      case 'roadmap':
        return <RoadmapView onNavigate={navigateTo} />;
      case 'skills':
        return <SkillsCenterView />;
      case 'assessment':
        return <SkillAssessmentView onNavigate={navigateTo} />;
      case 'learning':
        return <LearningCenterView />;
      case 'projects':
        return <ProjectsView />;
      case 'volunteer':
        return <VolunteerView onNavigate={navigateTo} />;
      case 'evidence':
        return <EvidenceView />;
      case 'cv-studio':
        return <CVStudioView onNavigate={navigateTo} />;
      case 'cv-analyzer':
        return <CvAnalyzerView onNavigate={navigateTo} />;
      case 'documents':
        return <DocumentsView onNavigate={navigateTo} />;
      case 'jobs':
        return <JobsView onNavigate={navigateTo} />;
      case 'applications':
        return <ApplicationsView />;
      case 'interviews':
        return <InterviewsView />;
      case 'profile':
        return <ProfileView onNavigate={navigateTo} />;
      case 'activity':
        return <ActivityView onNavigate={navigateTo} />;
      case 'progress':
        return <ProgressView />;
      case 'settings':
        return <SettingsView />;
      case 'admin':
        return <AdminCenterView />;
      case 'pricing':
        return <PricingView />;
      default:
        return <DashboardView onNavigate={navigateTo} onOpenCopilot={() => setCopilotOpen(true)} />;
    }
  };

  return (
    <>
      <AppShell currentView={currentView} onNavigate={navigateTo}>
        {hydrationError && (
          <div
            role="alert"
            className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 p-3 text-sm text-[var(--color-warning)]"
          >
            <span className="flex-1">
              Some of your career data could not be loaded. Nothing was changed. Check your
              connection and try again.
            </span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg border border-[var(--color-warning)]/30 px-3 py-1.5 text-xs font-semibold hover:bg-[var(--color-warning)]/10"
            >
              {t('Retry')}
            </button>
          </div>
        )}
        <Suspense fallback={<ViewFallback />}>
          {renderView()}
        </Suspense>
      </AppShell>
      {/* The first-use tour. It is mounted outside the shell so it can sit
          over the whole application, and it remembers that it has been
          seen on the server. */}
      <GuidedTourHost currentView={currentView} />
      {/* The contextual feedback invitation. It decides for itself whether
          this view and this account are eligible, and it never opens over a
          dialog. */}
      <FeedbackInvitationHost currentView={currentView} />
      <InteractiveTourModal
        isOpen={tourOpen}
        onClose={() => setTourOpen(false)}
        currentView={currentView}
        onNavigate={navigateTo}
      />
      {/* B.4 finding C-2: the AuthModal existed and was fully functional but
          was never mounted, so there was no way to sign in or sign up. */}
      <AuthModal />
    </>
  );
}

/**
 * Shows the guided tour for the screen the user is on, once.
 *
 * The dismissal is stored on the server, so a tour does not reappear on the
 * next device, and a tour that has already been seen is never shown again.
 */
function GuidedTourHost({ currentView }: { currentView: string }) {
  const { settings, t } = useCareer();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [activeGuide, setActiveGuide] = useState<GuideDefinition | null>(null);

  // Which screen each tour belongs to.
  const VIEW_TO_GUIDE: Record<string, GuideKey> = {
    dashboard: 'dashboard',
    roadmap: 'roadmap',
    learning: 'learning',
    projects: 'projects',
    volunteer: 'volunteer',
    'cv-studio': 'cv',
    skills: 'skills',
  };

  useEffect(() => {
    let cancelled = false;
    fetchDismissedGuides()
      .then((keys) => {
        if (!cancelled) setDismissed(keys);
      })
      .catch(() => {
        // A failure here only means the tour may be offered again.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const guideKey = VIEW_TO_GUIDE[currentView];
    if (!guideKey) {
      setActiveGuide(null);
      return;
    }
    if (dismissed.includes(guideKey)) {
      setActiveGuide(null);
      return;
    }
    const definition = GUIDES.find((guide) => guide.key === guideKey) ?? null;
    setActiveGuide(definition);
  }, [currentView, dismissed]);

  const close = () => {
    setActiveGuide(null);
    setDismissed((current) => [...new Set([...current, activeGuide?.key ?? ''])]);
  };

  return (
    <GuidedTour
      guide={activeGuide}
      onClose={close}
      language={settings.language}
      labels={{
        next: t('Next'),
        back: t('Back'),
        done: t('Done'),
        close: t('Close'),
        step: t('Step'),
      }}
    />
  );
}

function AppContent() {
  return (
    <>
      <AppRoutes />
      {/* The recovery modal is outside the route tree so it can appear over
          the landing page, onboarding, or the authenticated shell. */}
      <PasswordRecoveryModal />
    </>
  );
}

export default function App() {
  return (
    <CareerProvider>
      <FeedbackProvider>
        <AppContent />
      </FeedbackProvider>
    </CareerProvider>
  );
}
