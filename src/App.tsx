/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, lazy, Suspense } from 'react';
import { CareerProvider, useCareer } from './context/CareerContext';
import { AppShell } from './components/layout/AppShell';
import { AuthModal } from './components/auth/AuthModal';
import { PasswordRecoveryModal } from './components/auth/PasswordRecoveryModal';
import { LandingView } from './components/views/LandingView';
import { Logo } from './components/brand/Logo';
import { Skeleton } from './components/ui/Skeleton';

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
const RoadmapView = lazy(() => import('./components/views/RoadmapView').then((m) => ({ default: m.RoadmapView })));
const LearningCenterView = lazy(() => import('./components/views/LearningCenterView').then((m) => ({ default: m.LearningCenterView })));
const ProjectsView = lazy(() => import('./components/views/ProjectsView').then((m) => ({ default: m.ProjectsView })));
const VolunteerView = lazy(() => import('./components/views/VolunteerView').then((m) => ({ default: m.VolunteerView })));
const EvidenceView = lazy(() => import('./components/views/EvidenceView').then((m) => ({ default: m.EvidenceView })));
const CVStudioView = lazy(() => import('./components/views/CVStudioView').then((m) => ({ default: m.CVStudioView })));
const JobsView = lazy(() => import('./components/views/JobsView').then((m) => ({ default: m.JobsView })));
const ApplicationsView = lazy(() => import('./components/views/ApplicationsView').then((m) => ({ default: m.ApplicationsView })));
const InterviewsView = lazy(() => import('./components/views/InterviewsView').then((m) => ({ default: m.InterviewsView })));
const ProgressView = lazy(() => import('./components/views/ProgressView').then((m) => ({ default: m.ProgressView })));
const SettingsView = lazy(() => import('./components/views/SettingsView').then((m) => ({ default: m.SettingsView })));
const PublicProfileView = lazy(() => import('./components/views/PublicProfileView').then((m) => ({ default: m.PublicProfileView })));
const ProfileView = lazy(() => import('./components/views/ProfileView').then((m) => ({ default: m.ProfileView })));
const DocumentsView = lazy(() => import('./components/views/DocumentsView').then((m) => ({ default: m.DocumentsView })));
const ActivityView = lazy(() => import('./components/views/ActivityView').then((m) => ({ default: m.ActivityView })));

/**
 * Extracts the username from `#/profile/<username>`. A plain `#/profile` is
 * the signed-in user's own profile and therefore not a public link.
 */
const readPublicProfileUsername = (): string | null => {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const match = hash.match(/^profile\/([^/?#]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
};

/**
 * The placeholder shown while a view chunk is being fetched.
 *
 * It reserves the shape of the panel that is about to arrive, so the layout
 * settles into place instead of jumping, and it uses a calm branded shimmer
 * rather than a spinner.
 */
function ViewFallback() {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
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
    setAuthModalOpen,
    setCopilotOpen,
  } = useCareer();
  const [currentView, setCurrentView] = useState<string>(() => {
    // Check hash for direct view or public profile
    const hash = window.location.hash.replace('#/', '');
    if (hash === 'profile') return 'profile';
    if (hash === 'my-career') return 'my-career';
    if (hash === 'documents') return 'documents';
    return profile.onboardingCompleted ? 'dashboard' : 'landing';
  });
  const [publicUsername, setPublicUsername] = useState<string | null>(
    readPublicProfileUsername
  );

  const navigateTo = (view: string) => {
    setCurrentView(view);
    setActiveView(view);
    window.location.hash = `#/${view}`;
  };

  // Sync hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#/', '');
      const publicName = readPublicProfileUsername();
      setPublicUsername(publicName);

      if (publicName) {
        setCurrentView('profile');
        setActiveView('profile');
        return;
      }

      if (hash && hash !== currentView) {
        setCurrentView(hash);
        setActiveView(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentView, setActiveView]);

  // Once a session exists, `landing` is no longer a valid in-app view. Leaving
  // it in place made the shell breadcrumb read "Landing" over the dashboard and
  // stranded new users on the dashboard instead of the onboarding flow.
  //
  // The onboarding decision waits for hydration: the pre-hydration profile is
  // empty, so acting on `onboardingCompleted` immediately would flash the
  // onboarding wizard in front of an existing user.
  useEffect(() => {
    if (!currentUser || currentView === 'onboarding') return;

    if (!isHydrated) {
      if (currentView === 'landing') {
        setCurrentView('dashboard');
        setActiveView('dashboard');
        window.location.hash = '#/dashboard';
      }
      return;
    }

    if (!profile.onboardingCompleted) {
      setCurrentView('onboarding');
      setActiveView('onboarding');
      window.location.hash = '#/onboarding';
    } else if (currentView === 'landing') {
      setCurrentView('dashboard');
      setActiveView('dashboard');
      window.location.hash = '#/dashboard';
    }
  }, [currentUser, isHydrated, profile.onboardingCompleted, currentView, setActiveView]);

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
          <div className="text-xs text-[var(--text-muted)]">Restoring your session…</div>
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
            window.location.hash = '';
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
      case 'learning':
        return <LearningCenterView />;
      case 'projects':
        return <ProjectsView />;
      case 'volunteer':
        return <VolunteerView onNavigate={navigateTo} />;
      case 'evidence':
        return <EvidenceView />;
      case 'cv-studio':
        return <CVStudioView />;
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
              Retry
            </button>
          </div>
        )}
        <Suspense fallback={<ViewFallback />}>
          {renderView()}
        </Suspense>
      </AppShell>      {/* B.4 finding C-2: the AuthModal existed and was fully functional but
          was never mounted, so there was no way to sign in or sign up. */}
      <AuthModal />
    </>
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
      <AppContent />
    </CareerProvider>
  );
}
