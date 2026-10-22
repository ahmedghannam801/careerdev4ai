/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { CareerProvider, useCareer } from './context/CareerContext';
import { AppShell } from './components/layout/AppShell';
import { AuthModal } from './components/auth/AuthModal';
import { LandingView } from './components/views/LandingView';
import { OnboardingView } from './components/views/OnboardingView';
import { DashboardView } from './components/views/DashboardView';
import { MyCareerView } from './components/views/MyCareerView';
import { CareerSetupView } from './components/views/CareerSetupView';
import { CareerAnalysisView } from './components/views/CareerAnalysisView';
import { CareerPlanView } from './components/views/CareerPlanView';
import { SkillsCenterView } from './components/views/SkillsCenterView';
import { RoadmapView } from './components/views/RoadmapView';
import { LearningCenterView } from './components/views/LearningCenterView';
import { ProjectsView } from './components/views/ProjectsView';
import { EvidenceView } from './components/views/EvidenceView';
import { CVStudioView } from './components/views/CVStudioView';
import { JobsView } from './components/views/JobsView';
import { ApplicationsView } from './components/views/ApplicationsView';
import { InterviewsView } from './components/views/InterviewsView';
import { ProgressView } from './components/views/ProgressView';
import { SettingsView } from './components/views/SettingsView';
import { ProfileView } from './components/views/ProfileView';
import { DocumentsView } from './components/views/DocumentsView';
import { ActivityView } from './components/views/ActivityView';

function AppContent() {
  const {
    profile,
    setActiveView,
    currentUser,
    isAuthReady,
    hydrationError,
    isHydrated,
    setAuthModalOpen,
  } = useCareer();
  const [currentView, setCurrentView] = useState<string>(() => {
    // Check hash for direct view or public profile
    const hash = window.location.hash.replace('#/', '');
    if (hash === 'profile') return 'profile';
    if (hash === 'my-career') return 'my-career';
    if (hash === 'documents') return 'documents';
    return profile.onboardingCompleted ? 'dashboard' : 'landing';
  });

  const navigateTo = (view: string) => {
    setCurrentView(view);
    setActiveView(view);
    window.location.hash = `#/${view}`;
  };

  // Sync hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#/', '');
      if (hash && hash !== currentView) {
        if (hash.startsWith('profile/')) {
          setCurrentView('profile');
          setActiveView('profile');
        } else {
          setCurrentView(hash);
          setActiveView(hash);
        }
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
  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[var(--accent-primary)] text-white flex items-center justify-center font-bold text-sm">
            CP
          </div>
          <div className="text-xs text-[var(--text-muted)]">Restoring your session…</div>
        </div>
      </div>
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
        <OnboardingView
          onComplete={() => navigateTo('dashboard')}
        />
        <AuthModal />
      </>
    );
  }

  // Authenticated In-App Experience
  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView onNavigate={navigateTo} onOpenCopilot={() => {}} />;
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
        return <DashboardView onNavigate={navigateTo} onOpenCopilot={() => {}} />;
    }
  };

  return (
    <>
      <AppShell currentView={currentView} onNavigate={navigateTo}>
        {hydrationError && (
          <div
            role="alert"
            className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"
          >
            <span className="flex-1">
              Some of your career data could not be loaded. Nothing was changed. Check your
              connection and try again.
            </span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-semibold hover:bg-amber-500/10"
            >
              Retry
            </button>
          </div>
        )}
        {renderView()}
      </AppShell>
      {/* B.4 finding C-2: the AuthModal existed and was fully functional but
          was never mounted, so there was no way to sign in or sign up. */}
      <AuthModal />
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
