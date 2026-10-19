/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { CareerProvider, useCareer } from './context/CareerContext';
import { AppShell } from './components/layout/AppShell';
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
  const { profile, setActiveView } = useCareer();
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

  // Landing view
  if (currentView === 'landing') {
    return (
      <LandingView
        onStartOnboarding={() => navigateTo('onboarding')}
        onExploreRoles={() => navigateTo('roles')}
        onOpenDashboard={() => navigateTo('dashboard')}
      />
    );
  }

  // Progressive Onboarding
  if (currentView === 'onboarding') {
    return (
      <OnboardingView
        onComplete={() => navigateTo('dashboard')}
      />
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
        return <RoadmapView />;
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
    <AppShell currentView={currentView} onNavigate={navigateTo}>
      {renderView()}
    </AppShell>
  );
}

export default function App() {
  return (
    <CareerProvider>
      <AppContent />
    </CareerProvider>
  );
}
