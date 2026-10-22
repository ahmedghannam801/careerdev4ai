import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import {
  CareerState,
  CareerGoal,
  TargetRole,
  UserSkill,
  SkillCategory,
  CareerAnalysis,
  RoadmapPhase,
  RoadmapTask,
  RoadmapTaskStatus,
  CareerProject,
  EvidenceItem,
  CVProfile,
  CVVersion,
  JobListing,
  JobApplication,
  ApplicationStage,
  MockInterviewSession,
  UserNotification,
  UserSettings,
  CopilotMessage,
  UserAccount,
  DailyCareerAction,
  WeeklyCareerReview,
  CareerHealthDimensions,
  AiProposedAction,
  UserEducationEntry,
  UserExperienceEntry,
  UserCertificationEntry,
  UserLanguageEntry,
  ProfessionalLinks,
  CareerMilestoneItem,
  SecondaryCareerGoal,
  UserActivityItem,
  CoverLetter,
  CareerDocument,
  AiPreferences,
  NotificationPreferences,
  PrivacyPreferences,
  CareerBlocker,
  ProfileCompletenessBreakdown
} from '../types/career';
import { TARGET_ROLES } from '../data/rolesData';
import { PROJECTS_CATALOG } from '../data/projectsCatalog';
import { JOBS_CATALOG } from '../data/jobsData';
import { translations, Language } from '../translations';
import { getBrowserSupabase, getAccessToken, isSupabaseConfigured } from '../lib/supabase';
import {
  fetchActivities,
  postActivity,
  fetchSecondaryGoals,
  postSecondaryGoal,
  patchSecondaryGoal,
  deleteSecondaryGoal as deleteSecondaryGoalApi,
  fetchCareerMilestones,
  postCareerMilestone,
  patchCareerMilestone,
  deleteCareerMilestone,
  fetchCoverLetters,
  postCoverLetter,
  patchCoverLetter,
  deleteCoverLetter as deleteCoverLetterApi,
  type ActivityDTO,
  type SecondaryGoalDTO,
  type CareerMilestoneDTO,
  type CoverLetterDTO,
} from '../lib/domainApi';
import {
  fetchCvs,
  postCv,
  patchCv,
  deleteCv,
  fetchCvVersions,
  postCvVersion,
  patchCvVersion,
  deleteCvVersion,
  fetchProjects,
  postProject,
  patchProject,
  deleteProject as deleteProjectApi,
  fetchEvidence,
  postEvidence,
  patchEvidence,
  deleteEvidence as deleteEvidenceApi,
  fetchCertifications,
  postCertification,
  patchCertification,
  deleteCertification,
  fetchLanguages,
  postLanguage,
  patchLanguage,
  deleteLanguage,
  fetchProfileLinks,
  postProfileLink,
  patchProfileLink,
  deleteProfileLink,
  fetchCareerIdentity,
  putCareerIdentity,
  fetchSavedRoles,
  postSavedRole,
  deleteSavedRole,
  fetchJobApplications,
  postJobApplication,
  patchJobApplication,
  deleteJobApplication,
  fetchInterviewSessions,
  postInterviewSession,
  patchInterviewSession,
  deleteInterviewSession,
  type CvDTO,
  type CvVersionDTO,
  type ProjectDTO,
  type EvidenceDTO,
  type CertificationDTO,
  type LanguageDTO,
  type ProfileLinkDTO,
  type CareerIdentityDTO,
  type SavedRoleDTO,
  type JobApplicationDTO,
  type InterviewSessionDTO,
} from '../lib/coreApi';
import {
  fetchRoadmap,
  createRoadmap as createRoadmapApi,
  deleteRoadmap as deleteRoadmapApi,
  patchRoadmapTaskStatus,
  enrollInRoadmap as enrollInRoadmapApi,
  addRoadmapTask,
  fetchProfile,
  patchProfile,
  type RoadmapDTO,
  type ProfileDTO,
} from '../lib/roadmapApi';
import {
  fetchExperiences,
  postExperience,
  patchExperience,
  deleteExperience as deleteExperienceApi,
  fetchEducations,
  postEducation,
  patchEducation,
  deleteEducation as deleteEducationApi,
  fetchUserSkills,
  postUserSkill,
  deleteUserSkill as deleteUserSkillApi,
  type ExperienceDTO,
  type EducationDTO,
  type UserSkillDTO,
} from '../lib/careerHistoryApi';
import {
  fetchNotifications,
  markNotificationRead as markNotificationReadApi,
  clearNotifications as clearNotificationsApi,
  type NotificationDTO,
} from '../lib/notificationsApi';
import {
  fetchPreferences,
  patchPreferences,
  type PreferencesDTO,
} from '../lib/preferencesApi';
import { fetchBookmarks, createBookmark, deleteBookmark } from '../lib/bookmarksApi';
import {
  fetchLearningCatalog,
  fetchLearningItems,
  fetchLearningRecommendations,
  saveLearningItem as saveLearningItemApi,
  patchLearningItem as patchLearningItemApi,
  deleteLearningItem as deleteLearningItemApi,
} from '../lib/learningApi';
import type {
  LearningCourse,
  LearningItem,
  LearningRecommendation,
  RecommendationResult,
  LearningPreferences,
  LearningStatus,
  CourseFormat,
} from '../types/learning';

export interface UserProfile {
  name: string;
  preferredName?: string;
  email: string;
  phone?: string;
  avatarUrl: string;
  currentTitle: string;
  currentPosition?: string;
  currentCompany?: string;
  yearsOfExperience?: string;
  industry?: string;
  location: string;
  country?: string;
  city?: string;
  timezone?: string;
  preferredLanguage?: 'en' | 'ar';
  headline?: string;
  bio: string;
  professionalSummary?: string;
  username?: string;
  isPublic?: boolean;
  careerState: CareerState;
  careerGoal: CareerGoal;
  customGoalText?: string;
  onboardingCompleted: boolean;
  education: UserEducationEntry[];
  experiences: UserExperienceEntry[];
  certifications: UserCertificationEntry[];
  languages: UserLanguageEntry[];
  links: ProfessionalLinks;
  careerIdentity?: {
    whoYouAre: string;
    whereYoureGoing: string;
    why: string;
    whatYoureMissing: string;
    whatYoureBuilding: string;
    howYourePresenting: string;
    whereApplying: string;
  };
}

/**
 * The starting shape of a signed-in user's profile.
 *
 * Every field is empty: the values come from PostgreSQL once the session
 * hydrates. A user with no profile row yet therefore sees blank fields
 * instead of a demo persona (B.4 finding C-5).
 */
const emptyProfile: UserProfile = {
  name: '',
  email: '',
  avatarUrl: '',
  currentTitle: '',
  location: '',
  bio: '',
  careerState: 'working_professional',
  careerGoal: 'get_promoted',
  onboardingCompleted: false,
  education: [],
  experiences: [],
  certifications: [],
  languages: [],
  links: {},
};

interface CareerContextType {
  // Authentication
  currentUser: UserAccount | null;
  authToken: string | null;
  /**
   * True once the session restore has finished — either a session was found
   * or none exists. The app must not decide whether to show the
   * authenticated experience before this is true (B.4 finding C-1).
   */
  isAuthReady: boolean;
  /** True when the authenticated data load failed; the UI must say so. */
  hydrationError: boolean;
  /**
   * True once the authenticated data load has completed successfully. Routing
   * decisions that depend on persisted profile fields (for example whether to
   * show onboarding) must wait for this flag, otherwise they act on the empty
   * pre-hydration profile.
   */
  isHydrated: boolean;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;

  // Profile & Persona
  profile: UserProfile;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  setCareerState: (state: CareerState) => void;
  setCareerGoal: (goal: CareerGoal, customText?: string) => void;
  completeOnboarding: () => void;
  suggestAiSummary: () => Promise<string>;
  validateUsername: (username: string) => Promise<{ available: boolean; message: string }>;
  profileCompleteness: ProfileCompletenessBreakdown;

  // Active View for Contextual Copilot
  activeView: string;
  setActiveView: (view: string) => void;

  // Target Roles & Comparison
  targetRole: TargetRole;
  savedRoles: TargetRole[];
  setPrimaryTargetRole: (roleId: string) => void;
  saveRole: (role: TargetRole) => void;
  removeSavedRole: (roleId: string) => void;

  // Secondary Goals
  secondaryGoals: SecondaryCareerGoal[];
  addSecondaryGoal: (goal: Omit<SecondaryCareerGoal, 'id'>) => void;
  updateSecondaryGoal: (id: string, updates: Partial<SecondaryCareerGoal>) => void;
  deleteSecondaryGoal: (id: string) => void;

  // Milestones & Timeline
  milestones: CareerMilestoneItem[];
  addMilestone: (milestone: Omit<CareerMilestoneItem, 'id'>) => void;
  deleteMilestone: (id: string) => void;

  // Activity Center
  activities: UserActivityItem[];
  logActivity: (activity: Omit<UserActivityItem, 'id' | 'timestamp'>) => void;

  // Documents & Cover Letters
  documents: CareerDocument[];
  addDocument: (doc: Omit<CareerDocument, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  coverLetters: CoverLetter[];
  saveCoverLetter: (cl: Omit<CoverLetter, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  deleteCoverLetter: (id: string) => void;
  generateAiCoverLetter: (company: string, jobTitle: string, jobDesc: string, tone?: string) => Promise<{ coverLetter: string; keyHighlights: string[] }>;

  // Skills
  skills: UserSkill[];
  updateSkillLevel: (skillId: string, currentLevel: number) => void;
  addCustomSkill: (skill: Omit<UserSkill, 'id' | 'gap' | 'lastUpdated'>) => void;
  removeSkill: (skillId: string) => void;

  // Analysis, Plan, Health, Blockers
  analysis: CareerAnalysis;
  careerHealth: CareerHealthDimensions;
  careerBlockers: CareerBlocker[];
  dailyActions: DailyCareerAction[];
  toggleDailyAction: (actionId: string) => void;
  weeklyReview: WeeklyCareerReview;
  refreshAiAnalysis: () => Promise<void>;
  isAnalyzing: boolean;

  // Roadmap
  roadmapPhases: RoadmapPhase[];
  updateTaskStatus: (taskId: string, status: RoadmapTaskStatus) => void;
  addTask: (phaseId: string, milestoneId: string, task: Omit<RoadmapTask, 'id'>) => void;
  isEnrolledInRoadmap: boolean;
  enrollInRoadmap: () => void;

  // Learning Hub (B.5)
  learningCatalog: LearningCourse[];
  learningItems: LearningItem[];
  learningRecommendations: LearningRecommendation[];
  learningRecommendationMeta: {
    aiUsed: boolean;
    aiFallbackReason: string | null;
    generatedAt: string | null;
    targetRoleTitle: string | null;
    weeklyHours: number;
    budget: 'free_only' | 'low' | 'any';
    preferredFormat: CourseFormat | 'any';
    skillGapCount: number;
    roadmapSkillCount: number;
  };
  isLearningLoading: boolean;
  learningError: string | null;
  refreshLearningRecommendations: (preferences?: LearningPreferences) => Promise<void>;
  getLearningItem: (courseId: string) => LearningItem | undefined;
  saveLearningCourse: (courseId: string, reason?: string) => Promise<void>;
  dismissLearningCourse: (courseId: string, reason?: string) => Promise<void>;
  startLearningCourse: (courseId: string, reason?: string) => Promise<void>;
  completeLearningCourse: (courseId: string) => Promise<void>;
  updateLearningProgress: (courseId: string, percent: number) => Promise<void>;
  removeLearningCourse: (courseId: string) => Promise<void>;

  // Projects & Evidence
  projects: CareerProject[];
  addProject: (project: Omit<CareerProject, 'id' | 'createdAt'>) => void;
  updateProject: (projectId: string, updates: Partial<CareerProject>) => void;
  deleteProject: (projectId: string) => void;
  evidenceItems: EvidenceItem[];
  addEvidence: (evidence: Omit<EvidenceItem, 'id' | 'dateAdded'>) => void;
  deleteEvidence: (evidenceId: string) => void;

  // CV Studio & Upload Pipeline
  activeCV: CVProfile;
  cvVersions: CVVersion[];
  updateCV: (updates: Partial<CVProfile>) => void;
  saveCVVersion: (name: string) => void;
  duplicateCVVersion: (versionId: string) => void;
  renameCVVersion: (versionId: string, newName: string) => void;
  deleteCVVersion: (versionId: string) => void;
  runAiCvOptimization: () => Promise<void>;
  isOptimizingCV: boolean;
  uploadCvFile: (file: File) => Promise<{ success: boolean; error?: string }>;
  isUploadingCv: boolean;

  // Jobs & Applications
  jobs: JobListing[];
  bookmarkedJobIds: string[];
  toggleBookmarkJob: (jobId: string) => void;
  applications: JobApplication[];
  addApplication: (application: Omit<JobApplication, 'id' | 'lastUpdated'>) => void;
  updateApplicationStage: (id: string, stage: ApplicationStage) => void;
  updateApplicationNotes: (id: string, notes: string, nextAction?: string, nextActionDate?: string) => void;
  deleteApplication: (id: string) => void;

  // Interviews
  interviewSessions: MockInterviewSession[];
  saveInterviewSession: (session: Omit<MockInterviewSession, 'id' | 'createdAt'>) => void;

  // Copilot & AI Proposals
  copilotMessages: CopilotMessage[];
  sendCopilotMessage: (text: string) => Promise<void>;
  isCopilotTyping: boolean;
  pendingAiAction: AiProposedAction | null;
  confirmAiAction: (actionId: string, accept: boolean) => void;

  // Notifications
  notifications: UserNotification[];
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;

  // Preferences & Settings
  settings: UserSettings;
  updateSettings: (updates: Partial<UserSettings>) => void;
  aiPreferences: AiPreferences;
  updateAiPreferences: (updates: Partial<AiPreferences>) => void;
  notificationPreferences: NotificationPreferences;
  updateNotificationPreferences: (updates: Partial<NotificationPreferences>) => void;
  privacyPreferences: PrivacyPreferences;
  updatePrivacyPreferences: (updates: Partial<PrivacyPreferences>) => void;
  t: (key: keyof typeof translations.en) => string;
  exportDataJson: () => void;
  resetAllData: () => void;
}

const CareerContext = createContext<CareerContextType | undefined>(undefined);

const DEFAULT_INITIAL_SKILLS: UserSkill[] = [
  { id: 'sk-1', name: 'React', category: 'technical', currentLevel: 3, targetLevel: 4, gap: 1, source: 'self_reported', evidenceIds: ['ev-1'], lastUpdated: '2026-10-18' },
  { id: 'sk-2', name: 'TypeScript', category: 'technical', currentLevel: 3, targetLevel: 4, gap: 1, source: 'self_reported', evidenceIds: [], lastUpdated: '2026-10-18' },
  { id: 'sk-3', name: 'JavaScript (ES6+)', category: 'technical', currentLevel: 4, targetLevel: 4, gap: 0, source: 'experience', evidenceIds: [], lastUpdated: '2026-10-18' },
  { id: 'sk-4', name: 'HTML5 & Modern CSS', category: 'technical', currentLevel: 4, targetLevel: 4, gap: 0, source: 'experience', evidenceIds: [], lastUpdated: '2026-10-18' },
  { id: 'sk-5', name: 'State Management', category: 'technical', currentLevel: 2, targetLevel: 3, gap: 1, source: 'ai_estimated', evidenceIds: [], lastUpdated: '2026-10-18' },
  { id: 'sk-6', name: 'Web Performance Optimization', category: 'analytical', currentLevel: 2, targetLevel: 3, gap: 1, source: 'ai_estimated', evidenceIds: [], lastUpdated: '2026-10-18' },
  { id: 'sk-7', name: 'Git & Version Control', category: 'tools', currentLevel: 4, targetLevel: 4, gap: 0, source: 'project_evidence', evidenceIds: ['ev-1'], lastUpdated: '2026-10-18' },
  { id: 'sk-8', name: 'REST & GraphQL APIs', category: 'technical', currentLevel: 3, targetLevel: 3, gap: 0, source: 'self_reported', evidenceIds: [], lastUpdated: '2026-10-18' },
  { id: 'sk-9', name: 'Accessibility (a11y)', category: 'domain', currentLevel: 2, targetLevel: 3, gap: 1, source: 'self_reported', evidenceIds: [], lastUpdated: '2026-10-18' },
  { id: 'sk-10', name: 'Testing (Jest/Playwright)', category: 'tools', currentLevel: 1, targetLevel: 3, gap: 2, source: 'self_reported', evidenceIds: [], lastUpdated: '2026-10-18' },
];

function generateInitialRoadmap(role: TargetRole): RoadmapPhase[] {
  return [
    {
      id: 'phase-1',
      phaseNumber: 1,
      title: 'Phase 1: Foundations & Architecture Mastery',
      description: 'Strengthen fundamental syntax, typing patterns, and core component lifecycle principles.',
      isUnlocked: true,
      milestones: [
        {
          id: 'ms-1-1',
          title: 'Advanced Type Safety & Generics',
          description: 'Achieve strict TypeScript confidence across complex interfaces and utility types.',
          completedTasksCount: 1,
          tasks: [
            { id: 't-1', title: 'Complete TypeScript Handbook section on Generics and Discriminated Unions', description: 'Review official Microsoft documentation and complete interactive playground drills.', status: 'completed', skillName: 'TypeScript', estimatedHours: 8 },
            { id: 't-2', title: 'Refactor component props to strict Readonly and generic payload types', description: 'Eliminate any remaining any types and implement strict narrowing.', status: 'in_progress', skillName: 'TypeScript', deadline: '2026-10-25', estimatedHours: 6 },
          ]
        },
        {
          id: 'ms-1-2',
          title: 'Core Rendering Lifecycle & Purity',
          description: 'Master React 19 reconciliation, hook dependency arrays, and server components.',
          completedTasksCount: 0,
          tasks: [
            { id: 't-3', title: 'Benchmark virtual DOM re-renders using Chrome DevTools Flamechart', description: 'Identify unnecessary re-render triggers across nested child trees.', status: 'not_started', skillName: 'Web Performance Optimization', deadline: '2026-10-30', estimatedHours: 5 }
          ]
        }
      ]
    },
    {
      id: 'phase-2',
      phaseNumber: 2,
      title: 'Phase 2: Target Skill Development & Gaps',
      description: 'Systematically close the critical gaps identified between your current proficiency and role requirements.',
      isUnlocked: true,
      milestones: [
        {
          id: 'ms-2-1',
          title: 'Automated Testing Infrastructure',
          description: 'Close your testing gap (Current: 1/5 -> Target: 3/5) with unit, integration, and E2E suites.',
          completedTasksCount: 0,
          tasks: [
            { id: 't-4', title: 'Write comprehensive Jest unit tests for core state reducers', description: 'Ensure 90%+ branch coverage for mission-critical logic.', status: 'in_progress', skillName: 'Testing (Jest/Playwright)', deadline: '2026-11-05', estimatedHours: 12 },
            { id: 't-5', title: 'Build Playwright E2E test workflow simulating user onboarding', description: 'Run cross-browser tests on Chromium, Firefox, and WebKit.', status: 'not_started', skillName: 'Testing (Jest/Playwright)', estimatedHours: 10 }
          ]
        },
        {
          id: 'ms-2-2',
          title: 'Accessibility & Keyboard Governance',
          description: 'Bring accessibility up to WCAG 2.1 AA production standards.',
          completedTasksCount: 0,
          tasks: [
            { id: 't-6', title: 'Audit navigation with NVDA / VoiceOver screen reader', description: 'Verify ARIA live regions, focus trapping on modals, and semantic landmarks.', status: 'not_started', skillName: 'Accessibility (a11y)', estimatedHours: 6 }
          ]
        }
      ]
    },
    {
      id: 'phase-3',
      phaseNumber: 3,
      title: 'Phase 3: Proof of Skill & Portfolio Evidence',
      description: 'Ship tangible, verifiable artifacts that showcase your capabilities directly to engineering managers.',
      isUnlocked: false,
      milestones: [
        {
          id: 'ms-3-1',
          title: 'Flagship Portfolio Production Release',
          description: 'Deploy an accessible Design System or Full-Stack solution with automated CI/CD.',
          completedTasksCount: 0,
          tasks: [
            { id: 't-7', title: 'Publish documentation site and storybook for Accessible UI System', description: 'Host live on custom domain with public GitHub repository.', status: 'not_started', deadline: '2026-11-20', estimatedHours: 20 },
            { id: 't-8', title: 'Attach live project URL as verifiable evidence in CareerPilot Evidence Hub', description: 'Connect Project -> Skill -> Evidence -> CV.', status: 'not_started', estimatedHours: 2 }
          ]
        }
      ]
    },
    {
      id: 'phase-4',
      phaseNumber: 4,
      title: 'Phase 4: Market Preparation & CV Optimization',
      description: 'Reposition your CV, optimize for ATS keyword parsing, and curate evidence bullets.',
      isUnlocked: false,
      milestones: [
        {
          id: 'ms-4-1',
          title: 'ATS-Aligned CV Studio Polish',
          description: 'Tune CV bullet points using Google X-Y-Z formula and achieve 85%+ ATS match score.',
          completedTasksCount: 0,
          tasks: [
            { id: 't-9', title: 'Run CV ATS optimization analysis against primary target role', description: 'Incorporate missing keywords and impact metrics.', status: 'not_started', estimatedHours: 4 },
            { id: 't-10', title: 'Export clean PDF and align LinkedIn profile headline and experience', description: 'Ensure consistency across all public applicant profiles.', status: 'not_started', estimatedHours: 3 }
          ]
        }
      ]
    },
    {
      id: 'phase-5',
      phaseNumber: 5,
      title: 'Phase 5: Targeted Job Applications',
      description: 'Target high-fit opportunities with customized applications and disciplined pipeline tracking.',
      isUnlocked: false,
      milestones: [
        {
          id: 'ms-5-1',
          title: 'Application Pipeline Execution',
          description: 'Submit 5-10 targeted high-match applications with tracked interview stages.',
          completedTasksCount: 0,
          tasks: [
            { id: 't-11', title: 'Filter jobs for >75% skill match and save top 5 positions', description: 'Review job requirements and customize cover letter notes.', status: 'not_started', estimatedHours: 4 }
          ]
        }
      ]
    },
    {
      id: 'phase-6',
      phaseNumber: 6,
      title: 'Phase 6: Interview Mastery & Negotiation',
      description: 'Simulate technical deep dives, master the STAR behavioral framework, and secure top-tier offers.',
      isUnlocked: false,
      milestones: [
        {
          id: 'ms-6-1',
          title: 'Mock Interview Simulator Drills',
          description: 'Complete 3 AI mock interview drills covering behavioral and technical questions.',
          completedTasksCount: 0,
          tasks: [
            { id: 't-12', title: 'Practice STAR story for unexpected technical roadblock', description: 'Receive AI scoring and refine response.', status: 'not_started', estimatedHours: 3 }
          ]
        }
      ]
    }
  ];
}

// Maps a Supabase Auth user to the application's account shape.
// The id is always auth.users.id — the same value as public.profiles.id.
function toUserAccount(
  user: { id: string; email?: string; user_metadata?: Record<string, any> },
  token?: string
): UserAccount {
  const meta = user.user_metadata || {};
  return {
    id: user.id,
    email: user.email || '',
    name: meta.name || meta.full_name || (user.email ? user.email.split('@')[0] : 'User'),
    avatarUrl: meta.avatar_url || undefined,
    token,
    createdAt: meta.created_at || new Date().toISOString(),
  };
}

// ---- DTO -> local domain type mappers (B.3.6) ----

function toSecondaryGoal(dto: SecondaryGoalDTO): SecondaryCareerGoal {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description ?? '',
    priority: dto.priority,
    deadline: dto.deadline ?? '',
    status: dto.status,
    progressPercent: dto.progressPercent,
  };
}

function toCareerMilestone(dto: CareerMilestoneDTO): CareerMilestoneItem {
  return {
    id: dto.id,
    title: dto.title,
    category: dto.category as CareerMilestoneItem['category'],
    dateAchieved: dto.dateAchieved,
    notes: dto.notes ?? undefined,
    verified: dto.verified,
  };
}

function toCoverLetter(dto: CoverLetterDTO): CoverLetter {
  return {
    id: dto.id,
    title: dto.title,
    company: dto.company,
    role: dto.role,
    jobDescription: dto.jobDescription ?? undefined,
    content: dto.content,
    keyHighlights: dto.keyHighlights,
    targetJobId: dto.targetJobId ?? undefined,
    applicationId: dto.applicationId ?? undefined,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

/** Derives the human-readable activity timestamp from the real DB timestamp. */
function formatActivityTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return `Today, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function toActivity(dto: ActivityDTO): UserActivityItem {
  return {
    id: dto.id,
    timestamp: formatActivityTimestamp(dto.createdAt),
    actionType: dto.actionType as UserActivityItem['actionType'],
    title: dto.title,
    subtitle: dto.subtitle ?? '',
    relatedObject: dto.relatedObject ?? undefined,
    linkView: dto.linkView ?? undefined,
  };
}

const emptyCVProfile: CVProfile = {
  fullName: '',
  email: '',
  phone: '',
  location: '',
  title: '',
  summary: '',
  experiences: [],
  education: [],
  projects: [],
  skillsList: [],
  certifications: [],
};

// ---- DTO -> local roadmap shape (B.3.7.1) ----

function toRoadmapPhases(dto: RoadmapDTO | null): RoadmapPhase[] {
  if (!dto) return [];
  return dto.phases.map((phase) => ({
    id: phase.id,
    phaseNumber: phase.phaseNumber,
    title: phase.title,
    description: phase.description ?? '',
    isUnlocked: phase.isUnlocked,
    milestones: phase.milestones.map((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      description: milestone.description ?? '',
      completedTasksCount: milestone.completedTasksCount,
      tasks: milestone.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description ?? '',
        status: task.status,
        skillId: task.skillId ?? undefined,
        skillName: task.skillName ?? '',
        deadline: task.deadline ?? undefined,
        resourceId: task.resourceId ?? undefined,
        resourceTitle: task.resourceTitle ?? undefined,
        evidenceId: task.evidenceId ?? undefined,
        estimatedHours: task.estimatedHours ?? 0,
      })),
    })),
  }));
}

// ---- DTO -> local domain type mappers (B.3.7) ----

function toCareerProject(dto: ProjectDTO): CareerProject {
  return {
    id: dto.id,
    title: dto.title,
    goal: dto.goal ?? '',
    description: dto.description ?? '',
    difficulty: (dto.difficulty as CareerProject['difficulty']) ?? 'Intermediate',
    skills: dto.skills,
    tasks: dto.tasks,
    deliverables: dto.deliverables,
    status: (dto.status as CareerProject['status']) ?? 'idea',
    repositoryUrl: dto.repositoryUrl ?? undefined,
    demoUrl: dto.demoUrl ?? undefined,
    documentation: dto.documentation ?? undefined,
    createdAt: dto.createdAt,
    completedAt: dto.completedAt ?? undefined,
  };
}

function toEvidenceItem(dto: EvidenceDTO): EvidenceItem {
  return {
    id: dto.id,
    title: dto.title,
    type: (dto.type as EvidenceItem['type']) ?? 'project',
    description: dto.description ?? '',
    url: dto.url ?? undefined,
    skillNames: dto.skillNames,
    projectId: dto.projectId ?? undefined,
    verified: dto.verified,
    dateAdded: dto.dateAdded ?? new Date().toISOString().split('T')[0],
  };
}

/**
 * Maps an experience row to the frontend's view-model.
 *
 * The `description` column carries the role description and the achievements
 * newline-joined (that is how the server stores the extra frontend fields).
 */
function toUserExperience(dto: ExperienceDTO): UserExperienceEntry {
  const lines = (dto.description ?? '').split('\n');
  const description = lines[0] ?? '';
  const achievements = lines.slice(1).filter((line) => line.trim().length > 0);
  return {
    id: dto.id,
    role: dto.role,
    company: dto.company,
    employmentType:
      (dto.employmentType as UserExperienceEntry['employmentType']) ?? 'Full-time',
    location: dto.location ?? '',
    startDate: dto.startDate ?? '',
    endDate: dto.endDate ?? '',
    isCurrent: dto.isCurrent,
    description,
    achievements,
    skillsUsed: [],
  };
}

/**
 * Maps an education row to the frontend's view-model.
 *
 * The `description` column carries the notes and the "GPA: ..." line.
 */
function toUserEducation(dto: EducationDTO): UserEducationEntry {
  const lines = (dto.description ?? '').split('\n');
  const gpaLine = lines.find((line) => line.startsWith('GPA: '));
  const notes = lines.filter(
    (line) => line.trim().length > 0 && !line.startsWith('GPA: ')
  );
  return {
    id: dto.id,
    institution: dto.institution,
    degree: dto.degree ?? '',
    field: dto.field ?? '',
    startDate: dto.startDate ?? '',
    endDate: dto.endDate ?? '',
    current: dto.isCurrent,
    gpa: gpaLine ? gpaLine.slice('GPA: '.length) : undefined,
    coursework: notes.length > 0 ? notes : undefined,
  };
}

/**
 * Maps a notification row to the frontend's view-model.
 *
 * The database stores a `read_at` timestamp (NULL = unread); the frontend
 * model is a boolean plus a human-readable timestamp.
 */
function toUserNotification(dto: NotificationDTO): UserNotification {
  return {
    id: dto.id,
    title: dto.title,
    message: dto.message ?? '',
    type: dto.type as UserNotification['type'],
    read: dto.read,
    timestamp: dto.createdAt,
    linkAction: dto.linkView ?? undefined,
  };
}

function toCVVersion(dto: CvVersionDTO): CVVersion {  return {
    id: dto.id,
    // The owning CV. Without it a version cannot be duplicated: the copy
    // needs the cv_id to post a new snapshot against.
    cvId: dto.cvId,
    name: dto.name,
    targetRoleTitle: dto.targetRoleTitle ?? '',
    createdAt: dto.createdAt,
    profile: (dto.profileJson as CVProfile) ?? emptyCVProfile,
    atsAnalysis: dto.atsAnalysis as CVVersion['atsAnalysis'],
  };
}

function toTargetRole(dto: SavedRoleDTO): TargetRole {
  const payload = (dto.payload as TargetRole | null) ?? null;
  return (
    payload ?? {
      id: dto.roleId,
      title: dto.title,
      category: dto.category ?? '',
      level: (dto.level as TargetRole['level']) ?? 'Mid',
      overview: '',
      responsibilities: [],
      requiredSkills: [],
      preferredSkills: [],
      tools: [],
      experienceExpectation: '',
      salaryRange: '',
      typicalProjects: [],
      certifications: [],
      interviewTopics: [],
      careerProgression: [],
      relatedRoles: [],
    }
  );
}

function toJobApplication(dto: JobApplicationDTO): JobApplication {
  return {
    id: dto.id,
    jobId: dto.jobId ?? undefined,
    company: dto.company,
    role: dto.role,
    location: dto.location ?? '',
    workMode: dto.workMode ?? '',
    stage: (dto.stage as ApplicationStage) ?? 'saved',
    appliedDate: dto.appliedDate ?? undefined,
    lastUpdated: dto.lastUpdated ?? dto.createdAt,
    nextAction: dto.nextAction ?? undefined,
    nextActionDate: dto.nextActionDate ?? undefined,
    notes: dto.notes ?? '',
    salaryDiscussed: dto.salaryDiscussed ?? undefined,
    interviewStageDetails: dto.interviewStageDetails ?? undefined,
  };
}

function toInterviewSession(dto: InterviewSessionDTO): MockInterviewSession {
  return {
    id: dto.id,
    roleTitle: dto.roleTitle ?? '',
    type: (dto.type as MockInterviewSession['type']) ?? 'behavioral',
    question: dto.question,
    userAnswer: dto.userAnswer ?? '',
    aiFeedback: dto.aiFeedback as MockInterviewSession['aiFeedback'],
    createdAt: dto.createdAt,
  };
}

function toCertification(dto: CertificationDTO): UserCertificationEntry {
  return {
    id: dto.id,
    name: dto.name,
    provider: dto.issuer ?? '',
    issueDate: dto.issueDate ?? '',
    expiryDate: dto.expiryDate ?? undefined,
    credentialId: dto.credentialId ?? undefined,
    credentialUrl: dto.url ?? undefined,
  };
}

function toLanguage(dto: LanguageDTO): UserLanguageEntry {
  return {
    id: dto.id,
    language: dto.name,
    proficiency: (dto.proficiency as UserLanguageEntry['proficiency']) ?? 'Professional',
  };
}

function toProfessionalLinks(links: ProfileLinkDTO[]): ProfessionalLinks {
  const map: Record<string, string> = {};
  for (const link of links) map[link.kind] = link.url;
  return {
    linkedin: map['linkedin'],
    github: map['github'],
    portfolio: map['portfolio'],
    personalWebsite: map['personalWebsite'],
    behance: map['behance'],
    dribbble: map['dribbble'],
    twitter: map['twitter'],
  };
}

export const CareerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Authentication State — Supabase Auth is the only identity source.
  // No demo fallback: an unauthenticated visitor has no session and no user.
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);

  // Session restoration + automatic token refresh.
  // Supabase persists the session and refreshes it on expiry; this listener
  // keeps the in-memory token and user in sync with it.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsAuthReady(true);
      return;
    }
    const supabase = getBrowserSupabase();

    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      if (session) {
        setAuthToken(session.access_token);
        setCurrentUser(toUserAccount(session.user, session.access_token));
      } else {
        setAuthToken(null);
        setCurrentUser(null);
      }
      setIsAuthReady(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          setAuthToken(session.access_token);
          setCurrentUser(toUserAccount(session.user, session.access_token));
        } else {
          setAuthToken(null);
          setCurrentUser(null);
        }
        setIsAuthReady(true);
      }
    );

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  // B.3.6 — Backend hydration for the persisted domains.
  // Runs whenever an authenticated session is present. The database is the
  // source of truth; localStorage is not consulted for these domains.
  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;

    const hydrate = async () => {
      setHydrationError(false);
      try {
        const [
          roadmapRecord,
          profileRecord,
          goalList,
          milestoneList,
          activityList,
          coverLetterList,
          projectList,
          evidenceList,
          cvList,
          cvVersionList,
          certificationList,
          languageList,
          linkList,
          identityRecord,
          savedRoleList,
          applicationList,
          interviewList,
          experienceList,
          educationList,
          userSkillList,
          notificationList,
          preferencesRecord,
          bookmarkList,
          learningCatalogList,
          learningItemList,
          learningRecommendationResult,
        ] = await Promise.all([
          fetchRoadmap(),
          fetchProfile(),
          fetchSecondaryGoals(),
          fetchCareerMilestones(),
          fetchActivities(),
          fetchCoverLetters(),
          fetchProjects(),
          fetchEvidence(),
          fetchCvs(),
          fetchCvVersions(),
          fetchCertifications(),
          fetchLanguages(),
          fetchProfileLinks(),
          fetchCareerIdentity(),
          fetchSavedRoles(),
          fetchJobApplications(),
          fetchInterviewSessions(),
          fetchExperiences(),
          fetchEducations(),
          fetchUserSkills(),
          fetchNotifications(),
          fetchPreferences(),
          fetchBookmarks(),
          // A learning-catalogue failure must never block the B.4 hydration.
          fetchLearningCatalog().catch(() => []),
          fetchLearningItems().catch(() => []),
          fetchLearningRecommendations({ ai: false }).catch(() => ({
            recommendations: [],
            aiUsed: false,
            aiFallbackReason: 'Learning recommendations could not be loaded.',
            generatedAt: new Date().toISOString(),
            context: undefined,
          })),
        ]);
        if (cancelled) return;
        // The roadmap tables and the profile tables are the source of truth for
        // those two domains (not the aggregate /api/state payload).
        if (roadmapRecord) {
          setRoadmapPhases(toRoadmapPhases(roadmapRecord));
          setIsEnrolledInRoadmap(roadmapRecord.isEnrolled);
        }
        if (profileRecord) {
          setProfile(prev => ({
            ...prev,
            name: profileRecord.fullName ?? prev.name,
            preferredName: profileRecord.preferredName ?? undefined,
            phone: profileRecord.phone ?? prev.phone,
            avatarUrl: profileRecord.avatarUrl ?? prev.avatarUrl,
            location: profileRecord.location ?? prev.location,
            city: profileRecord.city ?? prev.city,
            country: profileRecord.country ?? prev.country,
            timezone: profileRecord.timezone ?? prev.timezone,
            currentTitle: profileRecord.currentTitle ?? prev.currentTitle,
            currentPosition: profileRecord.currentPosition ?? prev.currentPosition,
            currentCompany: profileRecord.currentCompany ?? prev.currentCompany,
            headline: profileRecord.headline ?? prev.headline,
            bio: profileRecord.bio ?? prev.bio,
            professionalSummary: profileRecord.professionalSummary ?? prev.professionalSummary,
            // The address belongs to the auth identity, not to the profile
            // row, so it comes from the session rather than from the DTO.
            email: currentUser?.email ?? prev.email,
            careerGoal: (profileRecord.careerGoal as UserProfile['careerGoal']) ?? prev.careerGoal,
            customGoalText: profileRecord.customGoalText ?? prev.customGoalText,
            industry: profileRecord.targetIndustry ?? prev.industry,
            username: profileRecord.username ?? prev.username,
            // The column is `user_type`; the domain field is `careerState`.
            // Writing it to `userType` left the persona at its default, so
            // every user saw "Working Professional" whatever they chose.
            careerState: (profileRecord.userType as UserProfile['careerState']) ?? prev.careerState,
            yearsOfExperience: profileRecord.yearsOfExperience ?? prev.yearsOfExperience,
            onboardingCompleted: profileRecord.onboardingCompleted,
            certifications: profileRecord.certifications.map(c => ({
              id: c.id,
              name: c.name,
              provider: c.issuer ?? '',
              issueDate: c.issueDate ?? '',
              expiryDate: c.expiryDate ?? undefined,
              credentialId: c.credentialId ?? undefined,
              credentialUrl: c.url ?? undefined,
            })),
            languages: profileRecord.languages.map(l => ({
              id: l.id,
              language: l.name,
              proficiency: (l.proficiency as UserLanguageEntry['proficiency']) ?? 'Professional',
            })),
            links: {
              linkedin: profileRecord.links.find(l => l.kind === 'linkedin')?.url,
              github: profileRecord.links.find(l => l.kind === 'github')?.url,
              portfolio: profileRecord.links.find(l => l.kind === 'portfolio')?.url,
              personalWebsite: profileRecord.links.find(l => l.kind === 'personalWebsite')?.url,
              behance: profileRecord.links.find(l => l.kind === 'behance')?.url,
              dribbble: profileRecord.links.find(l => l.kind === 'dribbble')?.url,
              twitter: profileRecord.links.find(l => l.kind === 'twitter')?.url,
            },
          }));
        }
        setSecondaryGoals(goalList.map(toSecondaryGoal));
        setMilestones(milestoneList.map(toCareerMilestone));
        setActivities(activityList.map(toActivity));
        setCoverLetters(coverLetterList.map(toCoverLetter));
        setProjects(projectList.map(toCareerProject));
        setEvidenceItems(evidenceList.map(toEvidenceItem));
        setCvVersions(cvVersionList.map(toCVVersion));
        // certifications / languages / links / careerIdentity live inside `profile`.
        setProfile(prev => ({
          ...prev,
          certifications: certificationList.map(toCertification),
          languages: languageList.map(toLanguage),
          links: toProfessionalLinks(linkList),
          ...(identityRecord
            ? {
                careerIdentity: {
                  whoYouAre: identityRecord.whoYouAre ?? prev.careerIdentity?.whoYouAre ?? '',
                  whereYoureGoing:
                    identityRecord.whereYoureGoing ?? prev.careerIdentity?.whereYoureGoing ?? '',
                  why: identityRecord.why ?? prev.careerIdentity?.why ?? '',
                  whatYoureMissing:
                    identityRecord.whatYoureMissing ?? prev.careerIdentity?.whatYoureMissing ?? '',
                  whatYoureBuilding:
                    identityRecord.whatYoureBuilding ?? prev.careerIdentity?.whatYoureBuilding ?? '',
                  howYourePresenting:
                    identityRecord.howYourePresenting ?? prev.careerIdentity?.howYourePresenting ?? '',
                  whereApplying:
                    identityRecord.whereApplying ?? prev.careerIdentity?.whereApplying ?? '',
                },
              }
            : {}),
        }));
        setSavedRoles(savedRoleList.map(toTargetRole));
        setApplications(applicationList.map(toJobApplication));
        setInterviewSessions(interviewList.map(toInterviewSession));
        const active = cvList.find(c => c.isActive) ?? cvList[0];
        if (active) {
          setActiveCvId(active.id);
          const activeVersion = cvVersionList.find(v => v.cvId === active.id);
          if (activeVersion) setActiveCV((activeVersion.profileJson as CVProfile) ?? activeCV);
        }

        // Experiences and education now come from their own tables. The
        // profile DTO does not carry them, so they are hydrated separately —
        // the server is the source of truth, exactly as for every other
        // domain (B.3.9, finding C-1).
        setProfile(prev => ({
          ...prev,
          experiences: experienceList.map(toUserExperience),
          education: educationList.map(toUserEducation),
        }));

        // Skill levels are stored per user in public.user_skills. The
        // persisted level is the ONLY level; a skill the user has never
        // rated stays at level 1 (B.4 finding C-5).
        setUserSkillRows(userSkillList);
        const levels: Record<string, number> = {};
        for (const row of userSkillList) {
          const name = (row.skill?.name ?? '').toLowerCase();
          if (!name || row.proficiency === null) continue;
          levels[name] = row.proficiency;
        }
        setSkillLevels(levels);

        // The notifications are real rows, not the two hard-coded entries
        // the drawer used to show.
        setNotifications(notificationList.map(toUserNotification));

        // The account-owned settings (the theme and the interface language)
        // follow the user to another device.
        if (preferencesRecord) {
          setSettings(prev => ({
            ...prev,
            theme: (preferencesRecord.theme as UserSettings['theme']) ?? prev.theme,
            language: (preferencesRecord.language as UserSettings['language']) ?? prev.language,
          }));
        }

        // The job bookmarks are owned rows, not local state.
        setBookmarkedJobIds(bookmarkList.map((bookmark) => bookmark.jobId));

        // B.5 — catalogue, owned learning state and deterministic
        // recommendations are all server data. AI explanations are requested
        // when the Learning Hub is opened, not during every login hydration.
        setLearningCatalog(learningCatalogList);
        setLearningItems(learningItemList);
        setLearningRecommendations(learningRecommendationResult.recommendations ?? []);
        setLearningRecommendationMeta((prev) => ({
          ...prev,
          aiUsed: learningRecommendationResult.aiUsed,
          aiFallbackReason: learningRecommendationResult.aiFallbackReason,
          generatedAt: learningRecommendationResult.generatedAt,
          targetRoleTitle: learningRecommendationResult.context?.targetRoleTitle ?? null,
          weeklyHours: learningRecommendationResult.context?.weeklyHours ?? 5,
          budget: learningRecommendationResult.context?.budget ?? 'free_only',
          preferredFormat: learningRecommendationResult.context?.preferredFormat ?? 'any',
          skillGapCount: learningRecommendationResult.context?.skillGapCount ?? 0,
          roadmapSkillCount: learningRecommendationResult.context?.roadmapSkillCount ?? 0,
        }));

        // The target role is persisted as its title; the catalogue entry
        // supplies the skill requirements and the roadmap the UI derives.
        const persistedRole = profileRecord?.targetRole
          ? TARGET_ROLES.find((role) => role.title === profileRecord.targetRole)
          : undefined;
        if (persistedRole) setTargetRole(persistedRole);

        // Hydration is complete: only now may the localStorage cache be
        // written, and only then does the app trust the server's view.
        setIsHydrated(true);
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to hydrate career data:', error);
          setHydrationError(true);
        }
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [activeView, setActiveView] = useState('dashboard');

  // Profile & Persona
  //
  // B.4 finding C-5: this used to be initialised with a hard-coded demo
  // persona ("Sarah Jenkins", a full employment history, two certifications,
  // three languages, a career identity) and `onboardingCompleted: true`.
  // A brand-new signed-in user therefore saw another person's career data
  // until the server hydration finished, and if the hydration failed they saw
  // it permanently. The demo persona is now gone: an authenticated user
  // starts from empty fields, and every value comes from PostgreSQL.
  //
  // B.4 finding M-5: the localStorage cache is no longer read back to seed
  // the state. The cache is written for resilience, but a previous user's
  // cached profile must never leak into the next session.
  const [profile, setProfile] = useState<UserProfile>(emptyProfile);

  // Target Roles & Comparison
  //
  // B.4 finding M-5: the target role was initialised from localStorage. The
  // cache must never seed the state, so it now starts from the first
  // catalogue role and is replaced by the server's `targetRole` column once
  // the session hydrates.
  const [targetRole, setTargetRole] = useState<TargetRole>(TARGET_ROLES[0]);

  // Saved roles — PostgreSQL is the source of truth (B.3.7).
  const [savedRoles, setSavedRoles] = useState<TargetRole[]>([]);

  // Skills
  //
  // The skill CATALOGUE (which skills exist and what the target role wants)
  // comes from the role definition; the user's LEVELS come from
  // public.user_skills. The list is therefore built by merging the role's
  // required + preferred skills with the persisted levels, so a skill the
  // user has never rated is shown at level 1 rather than at a fabricated
  // value (B.4 finding C-5 / H-5).
  const [skillLevels, setSkillLevels] = useState<Record<string, number>>({});
  const [customSkills, setCustomSkills] = useState<UserSkill[]>([]);
  // The raw /api/user-skills rows, kept so a skill's catalogue id (skill_id)
  // can be resolved when it is removed.
  const [userSkillRows, setUserSkillRows] = useState<UserSkillDTO[]>([]);

  // The user's skill list, derived from two sources:
  //   * the CATALOGUE — the required and preferred skills of the target role
  //     plus any skill the user added themselves;
  //   * the user's LEVELS — the proficiency values persisted in
  //     public.user_skills, keyed by skill name.
  //
  // A skill the user has never rated is shown at level 1 with a gap to the
  // role's target. The levels are never invented (B.4 finding C-5 / H-5).
  const skills: UserSkill[] = useMemo(() => {
    const role = targetRole;
    const catalogue: Array<{ name: string; category: SkillCategory; targetLevel: number }> = [];

    for (const req of role.requiredSkills ?? []) {
      catalogue.push({
        name: req.name,
        category: (req.category as SkillCategory) ?? 'technical',
        targetLevel: req.minLevel,
      });
    }
    for (const pref of role.preferredSkills ?? []) {
      if (catalogue.some((entry) => entry.name.toLowerCase() === pref.name.toLowerCase())) continue;
      catalogue.push({
        name: pref.name,
        category: (pref.category as SkillCategory) ?? 'technical',
        targetLevel: pref.minLevel,
      });
    }

    const merged: UserSkill[] = catalogue.map((entry) => {
      const level = skillLevels[entry.name.toLowerCase()] ?? 1;
      return {
        id: `skill-${entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name: entry.name,
        category: entry.category,
        currentLevel: level,
        targetLevel: entry.targetLevel,
        gap: Math.max(0, entry.targetLevel - level),
        source: skillLevels[entry.name.toLowerCase()] !== undefined ? 'self_reported' : 'ai_estimated',
        evidenceIds: [],
        lastUpdated: new Date().toISOString().split('T')[0],
      };
    });

    // A skill the user added themselves that is not part of the role.
    for (const custom of customSkills) {
      if (merged.some((entry) => entry.name.toLowerCase() === custom.name.toLowerCase())) continue;
      merged.push(custom);
    }

    return merged;
  }, [targetRole, skillLevels, customSkills]);

  // Roadmap
  //
  // The roadmap is NOT cached in localStorage (B.3.9, finding M-5). The
  // cache used to hold the locally generated tree, which is not the server's
  // roadmap: it contained local-only task ids that meant nothing to the
  // database. The roadmap now lives only in PostgreSQL and is hydrated from
  // GET /api/roadmap.
  //
  // B.4 finding C-5: it also started with a generated demo tree, so a user
  // with no roadmap row saw six phases of somebody else's plan. It now
  // starts empty and is filled by the server's roadmap.
  const [roadmapPhases, setRoadmapPhases] = useState<RoadmapPhase[]>([]);
  const [isEnrolledInRoadmap, setIsEnrolledInRoadmap] = useState(false);

  // Learning Hub (B.5)
  //
  // The catalogue and every user action are persisted by the server. There is
  // no local-only fallback: a save/dismiss/start/complete that fails is
  // reported and the item state is reloaded from the server.
  const [learningCatalog, setLearningCatalog] = useState<LearningCourse[]>([]);
  const [learningItems, setLearningItems] = useState<LearningItem[]>([]);
  const [learningRecommendations, setLearningRecommendations] = useState<LearningRecommendation[]>([]);
  const [learningRecommendationMeta, setLearningRecommendationMeta] = useState({
    aiUsed: false,
    aiFallbackReason: null as string | null,
    generatedAt: null as string | null,
    targetRoleTitle: null as string | null,
    weeklyHours: 5,
    budget: 'free_only' as 'free_only' | 'low' | 'any',
    preferredFormat: 'any' as CourseFormat | 'any',
    skillGapCount: 0,
    roadmapSkillCount: 0,
  });
  const [isLearningLoading, setIsLearningLoading] = useState(false);
  const [learningError, setLearningError] = useState<string | null>(null);
  const [hydrationError, setHydrationError] = useState(false);

  // Projects & Evidence
  // Projects — PostgreSQL is the source of truth (B.3.7).
  const [projects, setProjects] = useState<CareerProject[]>([]);
  // Evidence — PostgreSQL is the source of truth (B.3.7).
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>([]);

  // CV Studio
  //
  // B.4 finding C-5: the CV carried a fabricated candidate (Sarah Jenkins,
  // Meridian Tech Labs, a Meta certificate). It now starts empty and is
  // filled from the persisted CV / CV version rows.
  const [activeCV, setActiveCV] = useState<CVProfile>(emptyCVProfile);

  // CVs and CV versions — PostgreSQL is the source of truth (B.3.7).
  const [cvVersions, setCvVersions] = useState<CVVersion[]>([]);
  const [activeCvId, setActiveCvId] = useState<string>('');
  const [isOptimizingCV, setIsOptimizingCV] = useState(false);
  const [isUploadingCv, setIsUploadingCv] = useState(false);

  // Jobs & Applications
  //
  // B.4 finding H-5: the applications were seeded with two fabricated
  // applications ("Vanguard Systems" at the interview stage, "Nexus Cloud")
  // and the interviews with a fabricated mock-interview session. A brand-new
  // user saw other people's career activity. Both lists now start empty and
  // are filled from PostgreSQL.
  const [jobs] = useState<JobListing[]>(JOBS_CATALOG);
  const [applications, setApplications] = useState<JobApplication[]>([]);

  // Interviews
  const [interviewSessions, setInterviewSessions] = useState<MockInterviewSession[]>([]);

  // Notifications
  //
  // The notifications are real, owned rows in public.notifications. They used
  // to be two hard-coded entries in React state, which meant the read/unread
  // state was lost on every reload and real users saw fabricated content
  // (B.3.9, finding M-1).
  const [notifications, setNotifications] = useState<UserNotification[]>([]);

  // Copilot & AI Proposed Action
  //
  // B.4 finding C-5: the opening message greeted the user as "Sarah" and
  // referenced a fabricated interview and an 82% match. The greeting is now
  // built from the user's own persisted state.
  const [copilotMessages, setCopilotMessages] = useState<CopilotMessage[]>([]);
  const [isCopilotTyping, setIsCopilotTyping] = useState(false);
  const [pendingAiAction, setPendingAiAction] = useState<AiProposedAction | null>(null);

  // Secondary Goals — PostgreSQL is the source of truth (B.3.6).
  const [secondaryGoals, setSecondaryGoals] = useState<SecondaryCareerGoal[]>([]);

  const addSecondaryGoal = async (goal: Omit<SecondaryCareerGoal, 'id'>) => {
    try {
      const dto = await postSecondaryGoal({
        title: goal.title,
        description: goal.description,
        priority: goal.priority,
        deadline: goal.deadline,
        status: goal.status,
        progressPercent: goal.progressPercent,
      });
      setSecondaryGoals(prev => [toSecondaryGoal(dto), ...prev]);
      void logActivity({
        actionType: 'goal_updated',
        title: 'Created Secondary Goal',
        subtitle: goal.title,
        linkView: 'my-career'
      });
    } catch (error) {
      console.error('Failed to create secondary goal:', error);
    }
  };

  const updateSecondaryGoal = async (id: string, updates: Partial<SecondaryCareerGoal>) => {
    try {
      const dto = await patchSecondaryGoal(id, {
        title: updates.title,
        description: updates.description,
        priority: updates.priority,
        deadline: updates.deadline,
        status: updates.status,
        progressPercent: updates.progressPercent,
      });
      setSecondaryGoals(prev => prev.map(g => (g.id === id ? toSecondaryGoal(dto) : g)));
    } catch (error) {
      console.error('Failed to update secondary goal:', error);
    }
  };

  const deleteSecondaryGoal = async (id: string) => {
    try {
      await deleteSecondaryGoalApi(id);
      setSecondaryGoals(prev => prev.filter(g => g.id !== id));
    } catch (error) {
      console.error('Failed to delete secondary goal:', error);
    }
  };

  // Career Milestones — PostgreSQL is the source of truth (B.3.6).
  const [milestones, setMilestones] = useState<CareerMilestoneItem[]>([]);

  const addMilestone = async (milestone: Omit<CareerMilestoneItem, 'id'>) => {
    try {
      const dto = await postCareerMilestone({
        title: milestone.title,
        category: milestone.category,
        dateAchieved: milestone.dateAchieved,
        notes: milestone.notes,
        verified: milestone.verified,
      });
      setMilestones(prev => [toCareerMilestone(dto), ...prev]);
      void logActivity({
        actionType: 'added_evidence',
        title: 'Career Milestone Recorded',
        subtitle: milestone.title,
        linkView: 'my-career'
      });
    } catch (error) {
      console.error('Failed to create career milestone:', error);
    }
  };

  const deleteMilestone = async (id: string) => {
    try {
      await deleteCareerMilestone(id);
      setMilestones(prev => prev.filter(m => m.id !== id));
    } catch (error) {
      console.error('Failed to delete career milestone:', error);
    }
  };

  // Activity Center — PostgreSQL is the source of truth (B.3.6).
  // The activity timestamp is a REAL timestamp in the database; the
  // human-readable string is derived here for display.
  const [activities, setActivities] = useState<UserActivityItem[]>([]);

  const logActivity = async (item: Omit<UserActivityItem, 'id' | 'timestamp'>) => {
    try {
      const dto = await postActivity({
        actionType: item.actionType,
        title: item.title,
        subtitle: item.subtitle,
        relatedObject: item.relatedObject,
        linkView: item.linkView,
      });
      setActivities(prev => [toActivity(dto), ...prev]);
    } catch (error) {
      console.error('Failed to record activity:', error);
    }
  };

  // Cover Letters Studio — PostgreSQL is the source of truth (B.3.6).
  // This is the canonical record; no duplicate CareerDocument is written.
  const [coverLetters, setCoverLetters] = useState<CoverLetter[]>([]);

  const saveCoverLetter = async (
    cl: Omit<CoverLetter, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => {
    try {
      if (cl.id) {
        const dto = await patchCoverLetter(cl.id, {
          title: cl.title,
          company: cl.company,
          role: cl.role,
          jobDescription: cl.jobDescription,
          content: cl.content,
          keyHighlights: cl.keyHighlights,
          targetJobId: cl.targetJobId,
          applicationId: cl.applicationId,
        });
        setCoverLetters(prev => prev.map(item => (item.id === cl.id ? toCoverLetter(dto) : item)));
      } else {
        const dto = await postCoverLetter({
          title: cl.title,
          company: cl.company,
          role: cl.role,
          jobDescription: cl.jobDescription,
          content: cl.content,
          keyHighlights: cl.keyHighlights,
          targetJobId: cl.targetJobId,
          applicationId: cl.applicationId,
        });
        setCoverLetters(prev => [toCoverLetter(dto), ...prev]);
        void logActivity({
          actionType: 'document_saved',
          title: 'Created Tailored Cover Letter',
          subtitle: `${cl.role} at ${cl.company}`,
          linkView: 'documents'
        });
      }
    } catch (error) {
      console.error('Failed to save cover letter:', error);
    }
  };

  const deleteCoverLetter = async (id: string) => {
    try {
      await deleteCoverLetterApi(id);
      setCoverLetters(prev => prev.filter(c => c.id !== id));
    } catch (error) {
      console.error('Failed to delete cover letter:', error);
    }
  };

  // Documents Center — derived view-model (B.3.6).
  // There is no `documents` table: CareerDocument is composed from the
  // canonical sources (cvVersions, coverLetters, profile.certifications,
  // projects). It is a compatibility representation, not a stored entity.
  const [documents, setDocuments] = useState<CareerDocument[]>([]);

  // Recompute the derived document list whenever its sources change.
  useEffect(() => {
    const derived: CareerDocument[] = [];

    for (const version of cvVersions) {
      derived.push({
        id: `cv-${version.id}`,
        name: version.name,
        type: 'cv',
        format: 'link',
        size: '—',
        updatedAt: version.createdAt,
        createdAt: version.createdAt,
        isPublic: false,
        contentPreview: version.profile.summary,
      });
    }

    for (const letter of coverLetters) {
      derived.push({
        id: `cl-${letter.id}`,
        name: letter.title,
        type: 'cover_letter',
        format: 'link',
        size: '—',
        updatedAt: letter.updatedAt,
        createdAt: letter.createdAt,
        relatedApplicationId: letter.applicationId,
        isPublic: false,
        contentPreview: letter.content.slice(0, 200),
      });
    }

    for (const cert of profile.certifications) {
      derived.push({
        id: `cert-${cert.id}`,
        name: cert.name,
        type: 'certificate',
        format: 'link',
        size: '—',
        updatedAt: cert.issueDate,
        createdAt: cert.issueDate,
        isPublic: true,
        contentPreview: `${cert.provider} — issued ${cert.issueDate}`,
      });
    }

    for (const project of projects) {
      derived.push({
        id: `proj-${project.id}`,
        name: project.title,
        type: 'portfolio',
        format: 'link',
        size: '—',
        updatedAt: project.createdAt,
        createdAt: project.createdAt,
        isPublic: false,
        contentPreview: project.description,
      });
    }

    setDocuments(derived);
  }, [cvVersions, coverLetters, profile.certifications, projects]);

  // Adding a document routes it to the canonical source for its type
  // (there is no standalone documents entity).
  const addDocument = async (
    doc: Omit<CareerDocument, 'id' | 'createdAt' | 'updatedAt'>
  ) => {
    try {
      if (doc.type === 'cover_letter') {
        await saveCoverLetter({
          title: doc.name,
          company: doc.relatedRoleId ?? 'Unknown',
          role: doc.relatedRoleId ?? 'Unknown',
          content: doc.contentPreview ?? '',
          keyHighlights: [],
          applicationId: doc.relatedApplicationId,
        });
        return;
      }
      if (doc.type === 'certificate') {
        updateProfile({
          certifications: [
            ...profile.certifications,
            {
              id: `cert-${Date.now()}`,
              name: doc.name,
              provider: 'Unknown',
              issueDate: new Date().toISOString().split('T')[0],
            },
          ],
        });
        return;
      }
      if (doc.type === 'portfolio') {
        await addProject({
          title: doc.name,
          goal: doc.contentPreview ?? '',
          description: doc.contentPreview ?? '',
          difficulty: 'Intermediate',
          skills: [],
          tasks: [],
          deliverables: [],
          status: 'planned',
        });
        return;
      }
      // 'cv' and 'supporting' have no writable canonical source in this phase.
      console.warn(`No canonical store for document type "${doc.type}" — ignored.`);
    } catch (error) {
      console.error('Failed to add document:', error);
    }
  };

  // Removing a derived document removes the underlying canonical record.
  const deleteDocument = async (id: string) => {
    try {
      if (id.startsWith('cl-')) {
        await deleteCoverLetter(id.slice(3));
      } else if (id.startsWith('cv-')) {
        const version = cvVersions.find(v => `cv-${v.id}` === id);
        if (version) await deleteCVVersion(version.id);
      } else if (id.startsWith('cert-')) {
        // Certifications are part of the profile record.
        updateProfile({
          certifications: profile.certifications.filter(c => `cert-${c.id}` !== id),
        });
      } else if (id.startsWith('proj-')) {
        await deleteProject(id.slice(5));
      }
    } catch (error) {
      console.error('Failed to delete document:', error);
    }
  };

  const generateAiCoverLetter = async (company: string, jobTitle: string, jobDesc: string, tone = 'Professional & Confident') => {
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/generate-cover-letter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          company,
          jobTitle,
          jobDescription: jobDesc,
          candidateName: profile.name,
          experiences: profile.experiences,
          skills: skills.map(s => s.name),
          projects: projects.map(p => ({ title: p.title, description: p.description, skills: p.skills })),
          tone
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data?.error === 'string' ? data.error : 'Cover letter generation failed'
        );
      }
      return {
        coverLetter: data.coverLetter || '',
        keyHighlights: data.keyHighlights || []
      };
    } catch (e) {
      // Never substitute an invented letter for a failed model call.
      console.error('Error generating cover letter:', e);
      return { coverLetter: '', keyHighlights: [] };
    }
  };

  // AI Summary Assistant
  const suggestAiSummary = async (): Promise<string> => {
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/suggest-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          name: profile.name,
          targetRoleTitle: targetRole.title,
          careerState: profile.careerState,
          yearsExperience: profile.yearsOfExperience,
          skills: skills.map(s => s.name),
          keyAchievements: profile.experiences.flatMap(e => e.achievements).slice(0, 3)
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data?.error === 'string' ? data.error : 'Summary generation failed'
        );
      }
      return data.suggestedSummary || '';
    } catch (e) {
      // Returning a canned paragraph (or silently reusing the existing
      // summary) would look like a generated suggestion. Return nothing.
      console.error('Error generating summary suggestion:', e);
      return '';
    }
  };

  // Username validation
  const validateUsername = async (username: string): Promise<{ available: boolean; message: string }> => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/profile/check-username?username=${encodeURIComponent(username)}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          available: false,
          message:
            typeof data?.error === 'string' ? data.error : 'Could not verify username availability',
        };
      }
      return {
        available: data.available,
        message: data.message
      };
    } catch (e) {
      // Never report a username as available without a successful server check.
      console.error('Username validation failed:', e);
      return { available: false, message: 'Could not verify username availability' };
    }
  };

  // CV Version Controls — PostgreSQL is the source of truth (B.3.7).
  const duplicateCVVersion = async (versionId: string) => {
    const existing = cvVersions.find(v => v.id === versionId);
    if (!existing) return;
    try {
      if (!existing.cvId) return;
      const dto = await postCvVersion({
        cvId: existing.cvId,
        name: `${existing.name} (Copy)`,
        targetRoleTitle: existing.targetRoleTitle,
        profileJson: existing.profile,
        atsAnalysis: existing.atsAnalysis,
      });
      setCvVersions(prev => [toCVVersion(dto), ...prev]);
      void logActivity({
        actionType: 'uploaded_cv',
        title: 'Duplicated CV Version',
        subtitle: dto.name,
        linkView: 'cv-studio'
      });
    } catch (error) {
      console.error('Failed to duplicate CV version:', error);
    }
  };

  const renameCVVersion = async (versionId: string, newName: string) => {
    try {
      const dto = await patchCvVersion(versionId, { name: newName });
      setCvVersions(prev => prev.map(v => (v.id === versionId ? toCVVersion(dto) : v)));
    } catch (error) {
      console.error('Failed to rename CV version:', error);
    }
  };

  const deleteCVVersion = async (versionId: string) => {
    if (cvVersions.length <= 1) return;
    try {
      await deleteCvVersion(versionId);
      setCvVersions(prev => prev.filter(v => v.id !== versionId));
    } catch (error) {
      console.error('Failed to delete CV version:', error);
    }
  };

  // Job Bookmarks
  //
  // B.4 finding H-5: the bookmarks were seeded with two job ids, so every
  // user started with two "saved" jobs they never saved.
  const [bookmarkedJobIds, setBookmarkedJobIds] = useState<string[]>([]);
  const toggleBookmarkJob = async (jobId: string) => {
    const wasBookmarked = bookmarkedJobIds.includes(jobId);
    // The toggle is optimistic, and it is ROLLED BACK when the write fails:
    // the UI must never claim a bookmark the database does not have.
    setBookmarkedJobIds(prev =>
      prev.includes(jobId) ? prev.filter(id => id !== jobId) : [...prev, jobId]
    );
    try {
      if (wasBookmarked) {
        await deleteBookmark(jobId);
      } else {
        await createBookmark(jobId);
      }
    } catch (error) {
      console.error('Failed to persist job bookmark:', error);
      setBookmarkedJobIds(prev =>
        wasBookmarked
          ? prev.includes(jobId)
            ? prev
            : [...prev, jobId]
          : prev.filter(id => id !== jobId)
      );
    }
  };

  // AI & Notification & Privacy Preferences
  const [aiPreferences, setAiPreferences] = useState<AiPreferences>({
    recommendationsEnabled: true,
    writingAssistance: true,
    proactiveSuggestions: true,
    personalizationLevel: 'focused',
    preferredLanguage: 'en'
  });

  const updateAiPreferences = (updates: Partial<AiPreferences>) => {
    setAiPreferences(prev => ({ ...prev, ...updates }));
  };

  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    emailNotifications: true,
    inAppNotifications: true,
    applicationReminders: true,
    interviewReminders: true,
    roadmapReminders: true,
    learningReminders: true,
    aiRecommendations: true
  });

  const updateNotificationPreferences = (updates: Partial<NotificationPreferences>) => {
    setNotificationPreferences(prev => ({ ...prev, ...updates }));
  };

  const [privacyPreferences, setPrivacyPreferences] = useState<PrivacyPreferences>({
    profileVisibility: 'public',
    allowSearchEngines: true,
    shareAnalyticsWithAi: true,
    showSkillsPublicly: true,
    showProjectsPublicly: true
  });

  const updatePrivacyPreferences = (updates: Partial<PrivacyPreferences>) => {
    setPrivacyPreferences(prev => ({ ...prev, ...updates }));
  };

  // Real Calculated Profile Completeness
  const profileCompleteness = useMemo<ProfileCompletenessBreakdown>(() => {
    const missingItems: ProfileCompletenessBreakdown['missingItems'] = [];
    let score = 0;

    // Full name (10%)
    if (profile.name?.trim().length > 3) {
      score += 10;
    } else {
      missingItems.push({ id: 'name', label: 'Add full name', impactWeight: 10, targetView: 'profile' });
    }

    // Headline (10%)
    if (profile.headline && profile.headline.trim().length > 5) {
      score += 10;
    } else {
      missingItems.push({ id: 'headline', label: 'Add professional headline', impactWeight: 10, targetView: 'profile' });
    }

    // Location (5%)
    if (profile.location && profile.location.trim().length > 2) {
      score += 5;
    } else {
      missingItems.push({ id: 'location', label: 'Specify your location', impactWeight: 5, targetView: 'profile' });
    }

    // Professional Summary (15%)
    if (profile.professionalSummary && profile.professionalSummary.trim().length > 30) {
      score += 15;
    } else {
      missingItems.push({ id: 'summary', label: 'Add professional summary', impactWeight: 15, targetView: 'profile' });
    }

    // Education entries (15%)
    if (profile.education && profile.education.length > 0) {
      score += 15;
    } else {
      missingItems.push({ id: 'education', label: 'Add education credentials', impactWeight: 15, targetView: 'profile' });
    }

    // Experience entries (15%)
    if (profile.experiences && profile.experiences.length > 0) {
      score += 15;
    } else {
      missingItems.push({ id: 'experience', label: 'Add at least 1 work experience', impactWeight: 15, targetView: 'profile' });
    }

    // Skills (10%)
    if (skills && skills.length >= 3) {
      score += 10;
    } else {
      missingItems.push({ id: 'skills', label: 'Assess at least 3 skills in Skills Center', impactWeight: 10, targetView: 'skills' });
    }

    // Project / Evidence (10%)
    if (evidenceItems && evidenceItems.length > 0) {
      score += 10;
    } else {
      missingItems.push({ id: 'evidence', label: 'Attach proof-of-skill or project repository', impactWeight: 10, targetView: 'evidence' });
    }

    // Professional Links (5%)
    if (profile.links?.linkedin || profile.links?.github) {
      score += 5;
    } else {
      missingItems.push({ id: 'links', label: 'Connect LinkedIn or GitHub profile', impactWeight: 5, targetView: 'profile' });
    }

    // CV uploaded or tailored (5%)
    if (cvVersions && cvVersions.length > 0) {
      score += 5;
    } else {
      missingItems.push({ id: 'cv', label: 'Generate or upload your CV', impactWeight: 5, targetView: 'cv-studio' });
    }

    return {
      overallPercent: Math.min(100, score),
      missingItems
    };
  }, [profile, skills, evidenceItems, cvVersions]);

  // Real Calculated Career Blockers
  const careerBlockers = useMemo<CareerBlocker[]>(() => {
    const blockers: CareerBlocker[] = [];

    // Check critical gaps
    const testingGap = skills.find(s => s.name.toLowerCase().includes('testing') && s.gap > 0);
    if (testingGap) {
      blockers.push({
        id: 'blk-testing',
        title: 'Missing Evidence for Automated Testing',
        description: `Target role ${targetRole.title} requires level ${testingGap.targetLevel} in automated testing, but you are currently at level ${testingGap.currentLevel} without verified repository proof.`,
        severity: 'high',
        ctaText: 'View Testing Roadmap Task',
        ctaView: 'roadmap'
      });
    }

    // Check CV alignment
    if (cvVersions[0] && cvVersions[0].atsAnalysis && cvVersions[0].atsAnalysis.overallScore < 85) {
      blockers.push({
        id: 'blk-cv',
        title: 'CV Optimization Needed for Target Role',
        description: `Your active CV ATS match score is ${cvVersions[0].atsAnalysis.overallScore}%. Missing key keywords like ${cvVersions[0].atsAnalysis.missingKeywords.slice(0, 2).join(', ')}.`,
        severity: 'medium',
        ctaText: 'Optimize in CV Studio',
        ctaView: 'cv-studio'
      });
    }

    // Check saved jobs without application
    if (bookmarkedJobIds.length > 0 && applications.length === 0) {
      blockers.push({
        id: 'blk-jobs',
        title: 'Saved Jobs With No Active Applications',
        description: `You have ${bookmarkedJobIds.length} bookmarked opportunities but have not initiated an application pipeline.`,
        severity: 'medium',
        ctaText: 'Submit Application',
        ctaView: 'jobs'
      });
    }

    // Check upcoming interview readiness
    const upcomingInterviewApp = applications.find(a => a.stage === 'interview' && a.nextActionDate);
    if (upcomingInterviewApp) {
      blockers.push({
        id: 'blk-int',
        title: `Technical Interview Approaching with ${upcomingInterviewApp.company}`,
        description: `Scheduled for ${upcomingInterviewApp.nextActionDate}. Complete mock interview practice to calibrate your technical answers.`,
        severity: 'high',
        ctaText: 'Launch Mock Interview',
        ctaView: 'interviews'
      });
    }

    return blockers;
  }, [skills, targetRole, cvVersions, bookmarkedJobIds, applications]);
  const [settings, setSettings] = useState<UserSettings>(() => {
    const saved = localStorage.getItem('careerpilot_settings');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return {
      language: 'en',
      theme: 'light',
      emailAlerts: true,
      roadmapReminders: true,
      interviewReminders: true,
      weeklyProgressSummary: true,
      allowAiContextLearning: true,
    };
  });

  // Apply theme & RTL direction
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.setAttribute('dir', settings.language === 'ar' ? 'rtl' : 'ltr');
    root.setAttribute('lang', settings.language);
  }, [settings.theme, settings.language]);

  // Persistence to server & localStorage
  //
  // B.3.9 (finding C-1): the aggregate POST /api/state is NO LONGER called
  // from an automatic whole-profile sync. It used to fire on every change to
  // `profile` — including the mount, before hydration finished — and the
  // server's replace-all handler deleted the caller's real `experiences` and
  // `educations` rows and re-inserted the demo seed persona in their place.
  //
  // Every domain now has a dedicated endpoint and an explicit, awaited
  // mutation:
  //   profile            -> PATCH /api/profile
  //   experiences        -> /api/experiences
  //   education          -> /api/educations
  //   skills             -> /api/user-skills
  //   roadmap            -> /api/roadmap
  //   notifications      -> /api/notifications
  //   CVs / versions     -> /api/cvs, /api/cv-versions
  //   projects, evidence, certifications, languages, links, career identity,
  //   saved roles, job applications, interviews, activities, secondary goals,
  //   career milestones, cover letters -> their own endpoints
  //
  // The only thing this effect does now is keep the localStorage cache
  // up to date. It is a CACHE, never a source of truth, and it is only
  // written for an authenticated session whose hydration has completed.
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Never cache a pre-hydration value: it would be the demo seed.
    if (!isHydrated) return;
    localStorage.setItem('careerpilot_profile', JSON.stringify(profile));
    localStorage.setItem('careerpilot_target_role', JSON.stringify(targetRole));
    localStorage.setItem('careerpilot_skills', JSON.stringify(skills));
    localStorage.setItem('careerpilot_settings', JSON.stringify(settings));
  }, [isHydrated, profile, targetRole, skills, settings]);

  // Compute Career Analysis
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const computeLocalAnalysis = (): CareerAnalysis => {
    const reqSkills = targetRole.requiredSkills || [];
    let matchScore = 0;
    const strengths: { skill: string; note: string }[] = [];
    const criticalGaps: { skill: string; current: number; target: number; reason: string }[] = [];

    if (reqSkills.length === 0) {
      matchScore = 80;
    } else {
      let earnedPoints = 0;
      let totalPoints = 0;

      reqSkills.forEach(req => {
        const found = skills.find(s => s.name.toLowerCase() === req.name.toLowerCase());
        const current = found ? found.currentLevel : 1;
        totalPoints += req.minLevel;
        earnedPoints += Math.min(current, req.minLevel);

        if (current >= req.minLevel) {
          strengths.push({
            skill: req.name,
            note: `Exceeds or meets baseline ${req.minLevel}/5 expectation for ${targetRole.title}.`
          });
        } else {
          criticalGaps.push({
            skill: req.name,
            current,
            target: req.minLevel,
            reason: `Role requires level ${req.minLevel}/5 for production independence; currently assessed at ${current}/5.`
          });
        }
      });

      matchScore = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 75;
    }

    return {
      matchPercentage: matchScore,
      strengths: strengths.slice(0, 4),
      criticalGaps: criticalGaps.slice(0, 5),
      missingExperience: [
        'Production CI/CD deployment pipeline maintenance',
        'Direct architectural responsibility for distributed client state'
      ],
      careerRisks: [
        'Candidate pool contains applicants with dedicated unit testing experience',
        'Rapid evolution of server components requires continuous hands-on practice'
      ],
      recommendedProjects: [
        'Accessible Design System component library with automated tests',
        'Real-time collaborative dashboard with WebSockets'
      ],
      recommendedLearning: [
        'CS50 Introduction to Databases with SQL',
        'Official React Documentation & Interactive Tutorials'
      ],
      nextBestAction: criticalGaps.length > 0 ? {
        title: `Close ${criticalGaps[0].skill} gap`,
        description: `Advance from level ${criticalGaps[0].current} to ${criticalGaps[0].target} with hands-on practice.`,
        reason: `${criticalGaps[0].skill} is your highest-impact remaining skill gap for ${targetRole.title}.`,
        actionType: 'task'
      } : {
        title: 'Prepare for Upcoming Interviews',
        description: 'Simulate behavioral and architectural STAR questions to solidify your interview presence.',
        reason: 'Your core technical skill requirements are aligned with market expectations.',
        actionType: 'cv'
      }
    };
  };

  const [analysis, setAnalysis] = useState<CareerAnalysis>(computeLocalAnalysis);

  useEffect(() => {
    setAnalysis(computeLocalAnalysis());
  }, [targetRole, skills]);

  // Daily Career Actions
  //
  // The actions are derived, so "completed" is tracked separately: a set of
  // ids the user has ticked off in this session.
  const [completedDailyActionIds, setCompletedDailyActionIds] = useState<Set<string>>(new Set());
  //
  // B.4 finding C-5: these were three hard-coded tasks about "Jest reducer
  // unit tests" and a "Vanguard Systems interview" — another person's plan.
  // They are now DERIVED from the user's own roadmap, applications and skill
  // gaps, so they describe the signed-in user's real work.
  const dailyActions: DailyCareerAction[] = useMemo(() => {
    const actions: DailyCareerAction[] = [];

    // The next unfinished roadmap task is the highest-leverage action.
    const nextTask = roadmapPhases
      .flatMap((phase) => phase.milestones)
      .flatMap((milestone) => milestone.tasks)
      .find((task) => task.status !== 'completed' && task.status !== 'skipped');
    if (nextTask) {
      actions.push({
        id: `da-roadmap-${nextTask.id}`,
        title: nextTask.title,
        description: nextTask.description || 'Continue your roadmap task.',
        category: 'roadmap',
        priority: 'high',
        completed: false,
        actionView: 'roadmap',
        reason: `Your next roadmap task for ${targetRole.title}.`,
      });
    }

    // An application that is waiting on the candidate needs a follow-up.
    const pendingApp = applications.find(
      (app) => app.stage !== 'offer' && app.stage !== 'rejected' && app.stage !== 'withdrawn'
    );
    if (pendingApp) {
      actions.push({
        id: `da-application-${pendingApp.id}`,
        title: `Follow up on ${pendingApp.company}`,
        description: pendingApp.nextAction || `Keep your ${pendingApp.role} application moving.`,
        category: 'job',
        priority: 'high',
        completed: false,
        actionView: 'applications',
        reason: `Your ${pendingApp.role} application at ${pendingApp.company} is at the "${pendingApp.stage}" stage.`,
      });
    }

    // The largest remaining skill gap for the target role.
    const biggestGap = analysis.criticalGaps[0];
    if (biggestGap) {
      actions.push({
        id: `da-skill-${biggestGap.skill}`,
        title: `Close your ${biggestGap.skill} gap`,
        description: `Advance from level ${biggestGap.current} to ${biggestGap.target}.`,
        category: 'skill',
        priority: 'medium',
        completed: false,
        actionView: 'skills',
        reason: biggestGap.reason,
      });
    }

    return actions.map((action) => ({
      ...action,
      completed: completedDailyActionIds.has(action.id),
    }));
  }, [roadmapPhases, applications, analysis, targetRole, completedDailyActionIds]);

  // The actions are derived, so "completed" is tracked separately: a set of
  // ids the user has ticked off in this session.
  const toggleDailyAction = (id: string) => {
    setCompletedDailyActionIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Compute Career Health Dimensions (Explainable)
  const careerHealth: CareerHealthDimensions = useMemo(() => {
    const allTasks = roadmapPhases
      .flatMap((phase) => phase.milestones)
      .flatMap((milestone) => milestone.tasks);
    const completedTasks = allTasks.filter((t) => t.status === 'completed').length;

    const dimensions = {
      skillsConfidence: skills.length > 0
        ? Math.round((skills.filter(s => s.gap === 0).length / skills.length) * 100)
        : 0,
      evidenceCoverage: Math.min(100, evidenceItems.length * 25),
      roadmapVelocity: allTasks.length > 0
        ? Math.round((completedTasks / allTasks.length) * 100)
        : 0,
      cvAlignment: cvVersions[0]?.atsAnalysis?.overallScore ?? 0,
      marketEngagement: Math.min(100, applications.length * 35),
      overallHealth: 0,
    };

    // The overall health is the mean of the dimensions above it, so it can
    // never be a hard-coded number.
    dimensions.overallHealth = Math.round(
      (dimensions.skillsConfidence +
        dimensions.evidenceCoverage +
        dimensions.roadmapVelocity +
        dimensions.cvAlignment +
        dimensions.marketEngagement) /
        5
    );

    return dimensions;
  }, [skills, evidenceItems, roadmapPhases, cvVersions, applications]);

  // Weekly Career Review — derived from the user's own persisted data.
  const weeklyReview: WeeklyCareerReview = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    const weekEnd = new Date(now);

    const allTasks = roadmapPhases
      .flatMap((phase) => phase.milestones)
      .flatMap((milestone) => milestone.tasks);
    const completedTasksCount = allTasks.filter((t) => t.status === 'completed').length;

    // ISO-8601 week number.
    const isoWeek = (() => {
      const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    })();

    return {
      weekNumber: isoWeek,
      startDate: weekStart.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
      endDate: weekEnd.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
      completedTasksCount,
      skillsAdvancedCount: Object.keys(skillLevels).length,
      applicationsCount: applications.length,
      interviewsCount: interviewSessions.length,
      keyAchievements: completedTasksCount > 0
        ? [`Completed ${completedTasksCount} roadmap task${completedTasksCount === 1 ? '' : 's'}`]
        : [],
      nextWeekPriorities: allTasks
        .filter((t) => t.status !== 'completed' && t.status !== 'skipped')
        .slice(0, 2)
        .map((t) => t.title),
      healthScore: careerHealth.overallHealth,
    };
  }, [roadmapPhases, skillLevels, applications, interviewSessions, careerHealth.overallHealth]);

  // Authentication Handlers
  const login = async (email: string, password: string) => {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Authentication is not configured' };
      }
      const { data, error } = await getBrowserSupabase().auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data.session) {
        return { success: false, error: error?.message || 'Invalid credentials' };
      }
      setAuthToken(data.session.access_token);
      setCurrentUser(toUserAccount(data.user, data.session.access_token));
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Connection failed' };
    }
  };

  const register = async (name: string, email: string, password: string) => {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Authentication is not configured' };
      }
      const { data, error } = await getBrowserSupabase().auth.signUp({
        email,
        password,
        options: {
          // Display name is carried in user metadata; the authoritative id is
          // always auth.users.id (== public.profiles.id).
          data: { name },
        },
      });
      if (error) {
        // A duplicate address is reported as such rather than as a failure.
        return { success: false, error: error.message || 'Registration failed' };
      }
      if (data.session) {
        setAuthToken(data.session.access_token);
        if (data.user) setCurrentUser(toUserAccount(data.user, data.session.access_token));
        setProfile(prev => ({ ...prev, name, email }));
        return { success: true };
      }

      // B.4 finding C-4: the project requires email confirmation, so
      // `signUp` returns NO session. The account IS created, but the user
      // must confirm before they can sign in. The old code reported this as
      // a FAILURE, so the modal stayed open with an error and the user had
      // no way forward. The account is created and the user is told exactly
      // what to do; a sign-in is also attempted in case the project has
      // auto-confirmation enabled.
      const signIn = await getBrowserSupabase().auth.signInWithPassword({ email, password });
      if (signIn.data?.session) {
        setAuthToken(signIn.data.session.access_token);
        setCurrentUser(toUserAccount(signIn.data.user, signIn.data.session.access_token));
        setProfile(prev => ({ ...prev, name, email }));
        return { success: true };
      }

      return {
        success: true,
        error:
          'Account created. Check your email to confirm the address, then sign in.',
      };
    } catch (e: any) {
      return { success: false, error: e.message || 'Connection failed' };
    }
  };

  const logout = () => {
    if (isSupabaseConfigured) {
      getBrowserSupabase().auth.signOut().catch(() => {});
    }
    setAuthToken(null);
    setCurrentUser(null);
    localStorage.removeItem('careerpilot_token');
    localStorage.removeItem('careerpilot_user');
    // B.4 finding M-3: the React state was NOT cleared on sign-out, so the
    // next user to sign in on the same tab saw the previous user's profile,
    // roadmap, applications and notifications until the hydration finished.
    // Every domain is reset to its empty state here.
    setProfile({ ...emptyProfile });
    setTargetRole(TARGET_ROLES[0]);
    setSavedRoles([]);
    setSkillLevels({});
    setCustomSkills([]);
    setUserSkillRows([]);
    setRoadmapPhases([]);
    setIsEnrolledInRoadmap(false);
    setLearningCatalog([]);
    setLearningItems([]);
    setLearningRecommendations([]);
    setLearningError(null);
    setHydrationError(false);
    setLearningRecommendationMeta((prev) => ({
      ...prev,
      aiUsed: false,
      aiFallbackReason: null,
      generatedAt: null,
      targetRoleTitle: null,
      skillGapCount: 0,
      roadmapSkillCount: 0,
    }));
    setProjects([]);
    setEvidenceItems([]);
    setCvVersions([]);
    setActiveCvId('');
    setActiveCV(emptyCVProfile);
    setApplications([]);
    setInterviewSessions([]);
    setNotifications([]);
    setActivities([]);
    setSecondaryGoals([]);
    setMilestones([]);
    setCoverLetters([]);
    setDocuments([]);
    setCopilotMessages([]);
    setPendingAiAction(null);
    setIsHydrated(false);
  };

  // Target Role Change Handler
  const setPrimaryTargetRole = async (roleId: string) => {
    const role = TARGET_ROLES.find(r => r.id === roleId);
    if (!role) return;
    setTargetRole(role);

    // The skill target levels are derived from the role, so they follow the
    // role automatically (B.4 finding M-2 — the levels are no longer a
    // separate local list that has to be rewritten by hand).
    // The user's own levels are untouched.

    // The roadmap is persisted server-side (B.3.9, finding H-1). It used to be
    // generated locally and never written, so a new user had no roadmap row
    // and the locally generated tree was lost on the next load.
    //
    // The tree is sent to POST /api/roadmap, which writes the phases,
    // milestones and tasks and returns the roadmap with the REAL database ids.
    // The local state is then replaced by the server's roadmap.
    const generated = generateInitialRoadmap(role);
    try {
      // The target role is persisted alongside the roadmap so the server's
      // view of the user's target matches the UI's (B.4 finding M-2).
      await patchProfile({ targetRole: role.title, targetIndustry: role.category });
      const roadmap = await createRoadmapApi({
        title: `${role.title} Roadmap`,
        targetRoleTitle: role.title,
        phases: generated.map((phase, phaseIndex) => ({
          phaseNumber: phase.phaseNumber ?? phaseIndex + 1,
          title: phase.title,
          description: phase.description,
          isUnlocked: phase.isUnlocked,
          milestones: phase.milestones.map(milestone => ({
            title: milestone.title,
            description: milestone.description,
            tasks: milestone.tasks.map(task => ({
              title: task.title,
              description: task.description,
              status: task.status,
              skillName: task.skillName,
              deadline: task.deadline,
              estimatedHours: task.estimatedHours,
            })),
          })),
        })),
      });
      if (roadmap) {
        setRoadmapPhases(toRoadmapPhases(roadmap));
        setIsEnrolledInRoadmap(roadmap.isEnrolled);
        return;
      }
    } catch (error) {
      console.error('Failed to persist roadmap:', error);
    }

    // The server is unreachable: keep the generated tree locally so the UI
    // still responds. It will be replaced by the server's roadmap on the next
    // successful load.
    setRoadmapPhases(generated);
  };

  const saveRole = async (role: TargetRole) => {
    try {
      const dto = await postSavedRole({
        roleId: role.id,
        title: role.title,
        category: role.category,
        level: role.level,
        payload: role,
      });
      setSavedRoles(prev =>
        prev.some(r => r.id === role.id) ? prev : [...prev, toTargetRole(dto)]
      );
      void logActivity({
        actionType: 'saved_job',
        title: 'Saved a target role',
        subtitle: role.title,
        linkView: 'jobs',
      });
    } catch (error) {
      console.error('Failed to save role:', error);
    }
  };

  const removeSavedRole = async (roleId: string) => {
    try {
      await deleteSavedRole(roleId);
      setSavedRoles(prev => prev.filter(r => r.id !== roleId));
    } catch (error) {
      console.error('Failed to remove saved role:', error);
    }
  };

  // Profile writes are backend-first: the server is the source of truth, and
  // the local state is only updated once the server has accepted the change.
  // Fields the dedicated profile API owns are mapped to their column names;
  // the rest (educations, experiences, and the aggregated preferences) keep
  // flowing through the aggregate /api/state sync.
  const updateProfile = async (updates: Partial<UserProfile>) => {
    const payload: Record<string, unknown> = {};

    if (updates.name !== undefined) payload.fullName = updates.name;
    if (updates.preferredName !== undefined) payload.preferredName = updates.preferredName;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.location !== undefined) payload.location = updates.location;
    if (updates.city !== undefined) payload.city = updates.city;
    if (updates.country !== undefined) payload.country = updates.country;
    if (updates.timezone !== undefined) payload.timezone = updates.timezone;
    if (updates.headline !== undefined) payload.headline = updates.headline;
    if (updates.currentTitle !== undefined) payload.currentTitle = updates.currentTitle;
    if (updates.currentPosition !== undefined) payload.currentPosition = updates.currentPosition;
    if (updates.currentCompany !== undefined) payload.currentCompany = updates.currentCompany;
    if (updates.professionalSummary !== undefined)
      payload.professionalSummary = updates.professionalSummary;
    if (updates.bio !== undefined) payload.bio = updates.bio;
    if (updates.username !== undefined) payload.username = updates.username;
    if (updates.industry !== undefined) payload.targetIndustry = updates.industry;
    if (updates.yearsOfExperience !== undefined)
      payload.yearsOfExperience = updates.yearsOfExperience;
    if (updates.isPublic !== undefined) payload.isPublic = updates.isPublic;
    if (updates.links !== undefined) {
      payload.links = {
        linkedin: updates.links.linkedin,
        github: updates.links.github,
        portfolio: updates.links.portfolio,
        personalWebsite: updates.links.personalWebsite,
        behance: updates.links.behance,
        dribbble: updates.links.dribbble,
        twitter: updates.links.twitter,
      };
    }
    if (updates.onboardingCompleted !== undefined)
      payload.onboardingCompleted = updates.onboardingCompleted;

    // Experiences and education are collections: they are owned by their own
    // endpoints, NOT by the profile PATCH and NOT by the aggregate endpoint.
    // Each entry is reconciled against the server: a row the server knows is
    // updated, a row the server does not know is created, and a row that has
    // been removed locally is deleted. Nothing is ever sent as a
    // replace-the-whole-collection payload.
    if (updates.experiences !== undefined) {
      await reconcileExperiences(updates.experiences);
    }
    if (updates.education !== undefined) {
      await reconcileEducations(updates.education);
    }
    // Certifications and languages are collections too: they are owned by
    // their own tables, not by the profile PATCH.
    if (updates.certifications !== undefined) {
      await reconcileCertifications(updates.certifications);
    }
    if (updates.languages !== undefined) {
      await reconcileLanguages(updates.languages);
    }

    if (Object.keys(payload).length > 0) {
      try {
        const saved = await patchProfile(payload as Partial<ProfileDTO>);
        if (saved) {
          setProfile(prev => ({
            ...prev,
            name: saved.fullName ?? prev.name,
            preferredName: saved.preferredName ?? prev.preferredName,
            phone: saved.phone ?? prev.phone,
            location: saved.location ?? prev.location,
            city: saved.city ?? prev.city,
            country: saved.country ?? prev.country,
            timezone: saved.timezone ?? prev.timezone,
            headline: saved.headline ?? prev.headline,
            currentTitle: saved.currentTitle ?? prev.currentTitle,
            currentPosition: saved.currentPosition ?? prev.currentPosition,
            currentCompany: saved.currentCompany ?? prev.currentCompany,
            professionalSummary: saved.professionalSummary ?? prev.professionalSummary,
            bio: saved.bio ?? prev.bio,
            username: saved.username ?? prev.username,
            industry: saved.targetIndustry ?? prev.industry,
            yearsOfExperience: saved.yearsOfExperience ?? prev.yearsOfExperience,
            links: {
              linkedin: saved.links.find(l => l.kind === 'linkedin')?.url,
              github: saved.links.find(l => l.kind === 'github')?.url,
              portfolio: saved.links.find(l => l.kind === 'portfolio')?.url,
              personalWebsite: saved.links.find(l => l.kind === 'personalWebsite')?.url,
              behance: saved.links.find(l => l.kind === 'behance')?.url,
              dribbble: saved.links.find(l => l.kind === 'dribbble')?.url,
              twitter: saved.links.find(l => l.kind === 'twitter')?.url,
            },
            isPublic: saved.isPublic,
            onboardingCompleted: saved.onboardingCompleted,
          }));
          return;
        }
        // The server answered without a profile. Nothing was applied, so the
        // local state must not be changed either.
        throw new Error('The server did not return the updated profile');
      } catch (error) {
        // B.4 finding M-1: the old code logged the failure and then fell
        // through to `setProfile(prev => ({...prev, ...updates}))`, so the UI
        // showed the change as saved even though the server had rejected it
        // — and the caller closed its modal. The failure is now surfaced to
        // the caller and the local state is left untouched.
        console.error('Failed to persist profile update:', error);
        throw error;
      }
    }

    // Fields the dedicated API does not own still update locally.
    //
    // The collections are deliberately EXCLUDED. They were reconciled with
    // the server above, and the server's rows — carrying the real ids —
    // replaced the local list. Re-applying the local entries here would put
    // the local ids back, and the next edit of the same entry would then
    // CREATE a duplicate row instead of updating it.
    //
    // `email` is excluded too: it belongs to the auth identity, and the
    // address is changed through /api/account/change-email.
    const {
      experiences: _experiences,
      education: _education,
      certifications: _certifications,
      languages: _languages,
      email: _email,
      ...localOnly
    } = updates;
    setProfile(prev => ({ ...prev, ...localOnly }));
  };

  /**
   * Reconciles the local experience list with the server.
   *
   * The server's rows are the source of truth. An entry whose id is a server
   * id is updated, an entry with a local id is created, and a server row that
   * is no longer in the local list is deleted. The local list is then replaced
   * by the server's response, so the ids are always the real ones.
   */
  const reconcileExperiences = async (entries: UserExperienceEntry[]) => {
    try {
      const serverRows = await fetchExperiences();
      const serverIds = new Set(serverRows.map((row) => row.id));
      const localIds = new Set(entries.map((entry) => entry.id));

      for (const entry of entries) {
        if (serverIds.has(entry.id)) {
          await patchExperience(entry.id, {
            role: entry.role,
            company: entry.company,
            employmentType: entry.employmentType,
            location: entry.location,
            startDate: entry.startDate,
            endDate: entry.endDate,
            isCurrent: entry.isCurrent,
            description: entry.description,
            achievements: entry.achievements,
          });
        } else {
          await postExperience({
            role: entry.role,
            company: entry.company,
            employmentType: entry.employmentType,
            location: entry.location,
            startDate: entry.startDate,
            endDate: entry.endDate,
            isCurrent: entry.isCurrent,
            description: entry.description,
            achievements: entry.achievements,
          });
        }
      }

      // A server row is deleted only when the LOCAL list the user was
      // actually shown contained it. A row that the local list never had is
      // left alone: it belongs to data the user has not seen (for example a
      // row created in another session), and silently removing it would be
      // the same class of data loss as the bug being fixed.
      const previouslyKnownIds = new Set(
        profile.experiences.map((entry) => entry.id).filter((id) => serverIds.has(id))
      );
      for (const row of serverRows) {
        if (previouslyKnownIds.has(row.id) && !localIds.has(row.id)) {
          await deleteExperienceApi(row.id);
        }
      }

      const refreshed = await fetchExperiences();
      setProfile(prev => ({
        ...prev,
        experiences: refreshed.map(toUserExperience),
      }));
    } catch (error) {
      console.error('Failed to persist experiences:', error);
    }
  };

  /**
   * Reconciles the local education list with the server. See
   * `reconcileExperiences` for the same contract.
   */
  const reconcileEducations = async (entries: UserEducationEntry[]) => {
    try {
      const serverRows = await fetchEducations();
      const serverIds = new Set(serverRows.map((row) => row.id));
      const localIds = new Set(entries.map((entry) => entry.id));

      for (const entry of entries) {
        if (serverIds.has(entry.id)) {
          await patchEducation(entry.id, {
            institution: entry.institution,
            degree: entry.degree,
            field: entry.field,
            startDate: entry.startDate,
            endDate: entry.endDate,
            isCurrent: entry.current,
            gpa: entry.gpa,
            coursework: entry.coursework,
          });
        } else {
          await postEducation({
            institution: entry.institution,
            degree: entry.degree,
            field: entry.field,
            startDate: entry.startDate,
            endDate: entry.endDate,
            isCurrent: entry.current,
            gpa: entry.gpa,
            coursework: entry.coursework,
          });
        }
      }

      for (const row of serverRows) {
        // See reconcileExperiences: only a row the user was shown may be
        // removed.
        const previouslyKnownIds = new Set(
          profile.education.map((entry) => entry.id).filter((id) => serverIds.has(id))
        );
        if (previouslyKnownIds.has(row.id) && !localIds.has(row.id)) {
          await deleteEducationApi(row.id);
        }
      }

      const refreshed = await fetchEducations();
      setProfile(prev => ({
        ...prev,
        education: refreshed.map(toUserEducation),
      }));
    } catch (error) {
      console.error('Failed to persist education:', error);
    }
  };

  /**
   * Reconciles the local certification list with the server.
   *
   * The certifications live in their own table (public.profile_certifications),
   * so the profile PATCH does not own them. The same contract as
   * `reconcileExperiences`: a known row is updated, an unknown one is created,
   * a row the user removed is deleted, and the local list is then replaced by
   * the server's rows so the ids are always the real ones.
   */
  const reconcileCertifications = async (entries: UserCertificationEntry[]) => {
    try {
      const serverRows = await fetchCertifications();
      const serverIds = new Set(serverRows.map((row) => row.id));
      const localIds = new Set(entries.map((entry) => entry.id));

      for (const entry of entries) {
        const fields = {
          name: entry.name,
          issuer: entry.provider,
          issueDate: entry.issueDate,
          expiryDate: entry.expiryDate,
          credentialId: entry.credentialId,
          url: entry.credentialUrl,
        };
        if (serverIds.has(entry.id)) {
          await patchCertification(entry.id, fields);
        } else {
          await postCertification(fields);
        }
      }

      // A server row is deleted only when the local list the user was shown
      // contained it. See reconcileExperiences.
      const previouslyKnownIds = new Set(
        profile.certifications.map((entry) => entry.id).filter((id) => serverIds.has(id))
      );
      for (const row of serverRows) {
        if (previouslyKnownIds.has(row.id) && !localIds.has(row.id)) {
          await deleteCertification(row.id);
        }
      }

      const refreshed = await fetchCertifications();
      setProfile(prev => ({
        ...prev,
        certifications: refreshed.map(toCertification),
      }));
    } catch (error) {
      console.error('Failed to persist certifications:', error);
      throw error;
    }
  };

  /**
   * Reconciles the local language list with the server. See
   * `reconcileCertifications` for the same contract.
   */
  const reconcileLanguages = async (entries: UserLanguageEntry[]) => {
    try {
      const serverRows = await fetchLanguages();
      const serverIds = new Set(serverRows.map((row) => row.id));
      const localIds = new Set(entries.map((entry) => entry.id));

      for (const entry of entries) {
        const fields = { name: entry.language, proficiency: entry.proficiency };
        if (serverIds.has(entry.id)) {
          await patchLanguage(entry.id, fields);
        } else {
          await postLanguage(fields);
        }
      }

      const previouslyKnownIds = new Set(
        profile.languages.map((entry) => entry.id).filter((id) => serverIds.has(id))
      );
      for (const row of serverRows) {
        if (previouslyKnownIds.has(row.id) && !localIds.has(row.id)) {
          await deleteLanguage(row.id);
        }
      }

      const refreshed = await fetchLanguages();
      setProfile(prev => ({
        ...prev,
        languages: refreshed.map(toLanguage),
      }));
    } catch (error) {
      console.error('Failed to persist languages:', error);
      throw error;
    }
  };

  // B.4 finding H-3: these were local-only setters, so the persona and the
  // goal chosen during onboarding were lost on reload. They are persisted
  // through PATCH /api/profile, which owns `user_type`, `career_goal` and
  // `custom_goal_text`.
  const setCareerState = async (state: CareerState) => {
    setProfile(prev => ({ ...prev, careerState: state }));
    try {
      await patchProfile({ userType: state });
    } catch (error) {
      console.error('Failed to persist career state:', error);
    }
  };

  const setCareerGoal = async (goal: CareerGoal, customText?: string) => {
    setProfile(prev => ({ ...prev, careerGoal: goal, customGoalText: customText }));
    try {
      await patchProfile({ careerGoal: goal, customGoalText: customText ?? '' });
    } catch (error) {
      console.error('Failed to persist career goal:', error);
    }
  };

  const completeOnboarding = async () => {
    setProfile(prev => ({ ...prev, onboardingCompleted: true }));
    try {
      await patchProfile({ onboardingCompleted: true });
    } catch (error) {
      console.error('Failed to persist onboarding completion:', error);
    }
  };

  // ---- Skills ----
  //
  // Skill levels are persisted per user in public.user_skills through
  // /api/user-skills. The local state is only updated AFTER the server
  // confirms the write, so the level the UI shows is the level that is stored
  // (B.3.9, finding H-2).
  const updateSkillLevel = async (skillId: string, currentLevel: number) => {
    const skill = skills.find(s => s.id === skillId);
    if (!skill) return;
    try {
      await postUserSkill({ name: skill.name, proficiency: currentLevel });
      setSkillLevels(prev => ({
        ...prev,
        [skill.name.toLowerCase()]: currentLevel,
      }));
    } catch (error) {
      console.error('Failed to persist skill level:', error);
    }
  };

  const addCustomSkill = async (skill: Omit<UserSkill, 'id' | 'gap' | 'lastUpdated'>) => {
    const newSkill: UserSkill = {
      ...skill,
      id: `sk-custom-${Date.now()}`,
      gap: Math.max(0, skill.targetLevel - skill.currentLevel),
      lastUpdated: new Date().toISOString().split('T')[0]
    };
    try {
      await postUserSkill({ name: newSkill.name, proficiency: newSkill.currentLevel });
    } catch (error) {
      // B.4 finding L-4: the skill was added to the local list even when the
      // server refused the write, so the UI showed a skill that was not
      // persisted. The local state is now only updated after the write
      // succeeds.
      console.error('Failed to persist skill:', error);
      throw error;
    }
    setCustomSkills(prev => [...prev, newSkill]);
    setSkillLevels(prev => ({
      ...prev,
      [newSkill.name.toLowerCase()]: newSkill.currentLevel,
    }));
    void logActivity({
      actionType: 'acquired_skill',
      title: 'Added Skill',
      subtitle: newSkill.name,
      linkView: 'skills',
    });
  };

  const removeSkill = async (skillId: string) => {
    const skill = skills.find(s => s.id === skillId);
    if (!skill) return;
    try {
      // The server-side link is keyed by the catalogue skill id, which the
      // /api/user-skills response exposes as `skill_id`. The local id is a
      // slug, so the catalogue id is resolved by name.
      const stored = userSkillRows.find(
        (row) => (row.skill?.name ?? '').toLowerCase() === skill.name.toLowerCase()
      );
      if (stored?.skill_id) {
        await deleteUserSkillApi(stored.skill_id);
      }
      setSkillLevels(prev => {
        const next = { ...prev };
        delete next[skill.name.toLowerCase()];
        return next;
      });
      setCustomSkills(prev => prev.filter(s => s.id !== skillId));
    } catch (error) {
      console.error('Failed to delete skill:', error);
    }
  };

  const refreshAiAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/analyze-career', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          targetRole,
          userSkills: skills,
          careerState: profile.careerState,
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAnalysis(data);
      } else {
        // Keep the previous analysis rather than replacing it with invented
        // numbers; the server explains why no analysis was produced.
        const data = await res.json().catch(() => ({}));
        console.error(
          'AI analysis unavailable:',
          typeof data?.error === 'string' ? data.error : res.status
        );
      }
    } catch (e) {
      console.error('Failed to run AI analysis:', e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Task status is the roadmap's progress mutation — it goes to the server first
  // so progress is persisted, and the local state is replaced by the server's
  // authoritative roadmap on success.
  const updateTaskStatus = async (taskId: string, status: RoadmapTaskStatus) => {
    try {
      const roadmap = await patchRoadmapTaskStatus(taskId, status);
      if (roadmap) {
        setRoadmapPhases(toRoadmapPhases(roadmap));
      } else {
        // The task id is a local (non-persisted) id: fall back to the local
        // update so the UI still responds for a task that has no server row.
        setRoadmapPhases(prevPhases =>
          prevPhases.map(phase => ({
            ...phase,
            milestones: phase.milestones.map(milestone => {
              const updatedTasks = milestone.tasks.map(t =>
                t.id === taskId ? { ...t, status } : t
              );
              return {
                ...milestone,
                tasks: updatedTasks,
                completedTasksCount: updatedTasks.filter(t => t.status === 'completed').length,
              };
            }),
          }))
        );
      }
      if (status === 'completed') {
        const task = roadmapPhases
          .flatMap(p => p.milestones)
          .flatMap(m => m.tasks)
          .find(t => t.id === taskId);
        void logActivity({
          actionType: 'completed_task',
          title: 'Completed Roadmap Task',
          subtitle: task?.title ?? 'Roadmap task',
          linkView: 'roadmap',
        });
      }
    } catch (error) {
      console.error('Failed to update roadmap task:', error);
    }
  };

  const addTask = async (
    phaseId: string,
    milestoneId: string,
    task: Omit<RoadmapTask, 'id'>
  ) => {
    try {
      // The task is written server-side first: a task the database does not
      // hold would vanish on the next reload.
      const dto = await addRoadmapTask(phaseId, milestoneId, {
        title: task.title,
        description: task.description,
        status: task.status,
      });
      if (dto) {
        setRoadmapPhases(prev =>
          prev.map(p => {
            if (p.id !== phaseId) return p;
            return {
              ...p,
              milestones: p.milestones.map(m => {
                if (m.id !== milestoneId) return m;
                const tasks = [...m.tasks, { ...task, id: dto.id }];
                return {
                  ...m,
                  tasks,
                  completedTasksCount: tasks.filter(t => t.status === 'completed').length,
                };
              }),
            };
          })
        );
        return;
      }
    } catch (error) {
      console.error('Failed to persist roadmap task:', error);
      throw error;
    }
  };

  const enrollInRoadmap = async () => {
    try {
      const roadmap = await enrollInRoadmapApi();
      if (roadmap) {
        setRoadmapPhases(toRoadmapPhases(roadmap));
        setIsEnrolledInRoadmap(true);
      } else {
        setIsEnrolledInRoadmap(true);
      }
    } catch (error) {
      console.error('Failed to enroll in roadmap:', error);
    }
  };

  const applyLearningItem = (item: LearningItem) => {
    setLearningItems((prev) => {
      const next = prev.filter((entry) => entry.courseId !== item.courseId);
      next.unshift(item);
      return next;
    });
  };

  const refreshLearningRecommendations = async (preferences: LearningPreferences = {}) => {
    setIsLearningLoading(true);
    try {
      const result = await fetchLearningRecommendations(preferences);
      setLearningRecommendations(result.recommendations ?? []);
      setLearningRecommendationMeta((prev) => ({
        ...prev,
        aiUsed: result.aiUsed,
        aiFallbackReason: result.aiFallbackReason,
        generatedAt: result.generatedAt,
        targetRoleTitle: result.context?.targetRoleTitle ?? prev.targetRoleTitle,
        weeklyHours: result.context?.weeklyHours ?? prev.weeklyHours,
        budget: result.context?.budget ?? prev.budget,
        preferredFormat: result.context?.preferredFormat ?? prev.preferredFormat,
        skillGapCount: result.context?.skillGapCount ?? prev.skillGapCount,
        roadmapSkillCount: result.context?.roadmapSkillCount ?? prev.roadmapSkillCount,
      }));
      setLearningError(null);
    } catch (error) {
      setLearningError(error instanceof Error ? error.message : 'Failed to load recommendations');
    } finally {
      setIsLearningLoading(false);
    }
  };

  const getLearningItem = (courseId: string) =>
    learningItems.find((item) => item.courseId === courseId);

  const persistLearningStatus = async (
    courseId: string,
    status: LearningStatus,
    reason?: string
  ) => {
    setIsLearningLoading(true);
    try {
      const item = await saveLearningItemApi({
        courseId,
        status,
        recommendationReason: reason ?? null,
      });
      applyLearningItem(item);
      setLearningError(null);
      // Refresh the deterministic ranking so dismissed/completed items leave
      // the recommendation list immediately. AI explanations are not
      // regenerated for every button press.
      await refreshLearningRecommendations({ ai: false });
    } catch (error) {
      setLearningError(error instanceof Error ? error.message : 'Failed to save learning state');
    } finally {
      setIsLearningLoading(false);
    }
  };

  const saveLearningCourse = (courseId: string, reason?: string) =>
    persistLearningStatus(courseId, 'saved', reason);

  const dismissLearningCourse = (courseId: string, reason?: string) =>
    persistLearningStatus(courseId, 'dismissed', reason);

  const startLearningCourse = (courseId: string, reason?: string) =>
    persistLearningStatus(courseId, 'in_progress', reason);

  const completeLearningCourse = async (courseId: string) => {
    // Completion records evidence of learning. It deliberately does NOT
    // modify public.user_skills: mastering a skill remains a separate,
    // explicit action in the Skills Center.
    await persistLearningStatus(courseId, 'completed');
  };

  const updateLearningProgress = async (courseId: string, percent: number) => {
    const existing = getLearningItem(courseId);
    setIsLearningLoading(true);
    try {
      const item = await patchLearningItemApi(courseId, {
        progressPercent: Math.max(0, Math.min(100, Math.round(percent))),
        status: existing?.status === 'saved' ? 'in_progress' : undefined,
      });
      applyLearningItem(item);
      setLearningError(null);
    } catch (error) {
      setLearningError(error instanceof Error ? error.message : 'Failed to update progress');
    } finally {
      setIsLearningLoading(false);
    }
  };

  const removeLearningCourse = async (courseId: string) => {
    setIsLearningLoading(true);
    try {
      await deleteLearningItemApi(courseId);
      setLearningItems((prev) => prev.filter((item) => item.courseId !== courseId));
      setLearningError(null);
      await refreshLearningRecommendations({ ai: false });
    } catch (error) {
      setLearningError(error instanceof Error ? error.message : 'Failed to remove learning item');
    } finally {
      setIsLearningLoading(false);
    }
  };

  const addProject = async (project: Omit<CareerProject, 'id' | 'createdAt'>) => {
    try {
      const dto = await postProject({
        title: project.title,
        goal: project.goal,
        description: project.description,
        difficulty: project.difficulty,
        status: project.status,
        repositoryUrl: project.repositoryUrl,
        demoUrl: project.demoUrl,
        documentation: project.documentation,
        tasks: project.tasks,
        deliverables: project.deliverables,
        skills: project.skills,
      });
      setProjects(prev => [toCareerProject(dto), ...prev]);
      void logActivity({
        actionType: 'added_project',
        title: 'Added Project',
        subtitle: project.title,
        linkView: 'projects'
      });
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const updateProject = async (projectId: string, updates: Partial<CareerProject>) => {
    try {
      const dto = await patchProject(projectId, {
        title: updates.title,
        goal: updates.goal,
        description: updates.description,
        difficulty: updates.difficulty,
        status: updates.status,
        repositoryUrl: updates.repositoryUrl,
        demoUrl: updates.demoUrl,
        documentation: updates.documentation,
        tasks: updates.tasks,
        deliverables: updates.deliverables,
        skills: updates.skills,
      });
      setProjects(prev => prev.map(p => (p.id === projectId ? toCareerProject(dto) : p)));
    } catch (error) {
      console.error('Failed to update project:', error);
    }
  };

  const deleteProject = async (projectId: string) => {
    try {
      await deleteProjectApi(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const addEvidence = async (evidence: Omit<EvidenceItem, 'id' | 'dateAdded'>) => {
    try {
      const dto = await postEvidence({
        title: evidence.title,
        type: evidence.type,
        description: evidence.description,
        url: evidence.url,
        verified: evidence.verified,
        projectId: evidence.projectId,
        skillNames: evidence.skillNames,
      });
      setEvidenceItems(prev => [toEvidenceItem(dto), ...prev]);
      void logActivity({
        actionType: 'added_evidence',
        title: 'Added Evidence',
        subtitle: evidence.title,
        linkView: 'evidence'
      });
    } catch (error) {
      console.error('Failed to create evidence:', error);
    }
  };

  const updateEvidence = async (
    evidenceId: string,
    updates: Partial<EvidenceItem>
  ) => {
    try {
      const dto = await patchEvidence(evidenceId, {
        title: updates.title,
        type: updates.type,
        description: updates.description,
        url: updates.url,
        verified: updates.verified,
        dateAdded: updates.dateAdded,
        projectId: updates.projectId,
        skillNames: updates.skillNames,
      });
      setEvidenceItems(prev =>
        prev.map(e => (e.id === evidenceId ? toEvidenceItem(dto) : e))
      );
    } catch (error) {
      console.error('Failed to update evidence:', error);
    }
  };

  const deleteEvidence = async (evidenceId: string) => {
    try {
      await deleteEvidenceApi(evidenceId);
      setEvidenceItems(prev => prev.filter(e => e.id !== evidenceId));
    } catch (error) {
      console.error('Failed to delete evidence:', error);
    }
  };

  const updateCV = (updates: Partial<CVProfile>) => {
    setActiveCV(prev => ({ ...prev, ...updates }));
  };

  const saveCVVersion = async (name: string) => {
    try {
      // A version belongs to a CV. A user who has never created one still
      // gets a snapshot: the CV row is created first, and its REAL id is
      // used. Posting against an empty cvId was rejected with 400.
      let cvId = activeCvId;
      if (!cvId) {
        const created = await postCv({ name, targetRoleTitle: targetRole.title });
        cvId = created.id;
        setActiveCvId(created.id);
      }
      const dto = await postCvVersion({
        cvId,
        name,
        targetRoleTitle: targetRole.title,
        profileJson: activeCV,
        atsAnalysis: cvVersions[0]?.atsAnalysis,
      });
      setCvVersions(prev => [toCVVersion(dto), ...prev]);
    } catch (error) {
      console.error('Failed to save CV version:', error);
      throw error;
    }
  };

  // Real CV Upload Pipeline implementation
  const uploadCvFile = async (file: File): Promise<{ success: boolean; error?: string }> => {
    setIsUploadingCv(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('targetRoleTitle', targetRole.title);

      const token = await getAccessToken();
      const res = await fetch('/api/resumes/upload', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to parse CV');
      }

      if (data.cv) {
        setActiveCV(data.cv);
        // The route creates the CV row and its first version and returns
        // their real ids. Without them the version list would hold a fake
        // id, and the next snapshot would have no CV to attach to.
        if (data.cvId) setActiveCvId(data.cvId);
        const newVer: CVVersion = {
          id: data.cvVersionId ?? `cv-v-${Date.now()}`,
          cvId: data.cvId,
          name: `${file.name.replace(/\.[^/.]+$/, '')} (Uploaded)`,
          targetRoleTitle: targetRole.title,
          createdAt: new Date().toISOString().split('T')[0],
          profile: data.cv,
          atsAnalysis: data.atsAnalysis
        };
        setCvVersions(prev => [newVer, ...prev]);
      }

      return { success: true };
    } catch (e: any) {
      console.error('Upload CV error:', e);
      return { success: false, error: e.message || 'File extraction failed' };
    } finally {
      setIsUploadingCv(false);
    }
  };

  const runAiCvOptimization = async () => {
    setIsOptimizingCV(true);
    try {
      const cvText = `
Name: ${activeCV.fullName}
Title: ${activeCV.title}
Summary: ${activeCV.summary}
Experience: ${activeCV.experiences.map(e => `${e.role} at ${e.company} (${e.period}): ${e.bullets.join('. ')}`).join('\n')}
Education: ${activeCV.education.map(ed => `${ed.degree} in ${ed.field} - ${ed.institution}`).join('\n')}
Skills: ${activeCV.skillsList.join(', ')}
`;
      const token = await getAccessToken();
      const res = await fetch('/api/optimize-cv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          cvText,
          targetRoleTitle: targetRole.title,
          targetRoleSkills: targetRole.requiredSkills.map(s => s.name)
        })
      });
      if (res.ok) {
        const result = await res.json();
        setCvVersions(prev => {
          const updated = [...prev];
          if (updated[0]) {
            updated[0] = { ...updated[0], atsAnalysis: result };
          }
          return updated;
        });
      } else {
        // Never attach an invented ATS result to the user's CV version.
        const data = await res.json().catch(() => ({}));
        console.error(
          'CV analysis unavailable:',
          typeof data?.error === 'string' ? data.error : res.status
        );
      }
    } catch (e) {
      console.error('Failed to optimize CV:', e);
    } finally {
      setIsOptimizingCV(false);
    }
  };

  const addApplication = async (
    application: Omit<JobApplication, 'id' | 'lastUpdated'>
  ) => {
    try {
      const dto = await postJobApplication({
        jobId: application.jobId,
        company: application.company,
        role: application.role,
        location: application.location,
        workMode: application.workMode,
        stage: application.stage,
        appliedDate: application.appliedDate,
        nextAction: application.nextAction,
        nextActionDate: application.nextActionDate,
        notes: application.notes,
        salaryDiscussed: application.salaryDiscussed,
        interviewStageDetails: application.interviewStageDetails,
      });
      setApplications(prev => [toJobApplication(dto), ...prev]);
      void logActivity({
        actionType: 'applied_job',
        title: `Applied to ${application.company}`,
        subtitle: application.role,
        linkView: 'applications',
      });
    } catch (error) {
      console.error('Failed to create job application:', error);
    }
  };

  const updateApplicationStage = async (id: string, stage: ApplicationStage) => {
    try {
      const dto = await patchJobApplication(id, { stage });
      setApplications(prev => prev.map(a => (a.id === id ? toJobApplication(dto) : a)));
    } catch (error) {
      console.error('Failed to update application stage:', error);
    }
  };

  const updateApplicationNotes = async (
    id: string,
    notes: string,
    nextAction?: string,
    nextActionDate?: string
  ) => {
    try {
      const dto = await patchJobApplication(id, {
        notes,
        nextAction,
        nextActionDate,
      });
      setApplications(prev => prev.map(a => (a.id === id ? toJobApplication(dto) : a)));
    } catch (error) {
      console.error('Failed to update application notes:', error);
    }
  };

  const deleteApplication = async (id: string) => {
    try {
      await deleteJobApplication(id);
      setApplications(prev => prev.filter(a => a.id !== id));
    } catch (error) {
      console.error('Failed to delete job application:', error);
    }
  };

  const saveInterviewSession = async (
    session: Omit<MockInterviewSession, 'id' | 'createdAt'>
  ) => {
    try {
      const dto = await postInterviewSession({
        roleTitle: session.roleTitle,
        type: session.type,
        question: session.question,
        userAnswer: session.userAnswer,
        aiFeedback: session.aiFeedback,
      });
      setInterviewSessions(prev => [toInterviewSession(dto), ...prev]);
      void logActivity({
        actionType: 'mock_interview',
        title: 'Completed Mock Interview',
        subtitle: session.roleTitle,
        linkView: 'interviews'
      });
    } catch (error) {
      console.error('Failed to save interview session:', error);
    }
  };

  const sendCopilotMessage = async (text: string) => {
    const userMsg: CopilotMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setCopilotMessages(prev => [...prev, userMsg]);
    setIsCopilotTyping(true);

    try {
      const topGaps = analysis.criticalGaps.map(g => `${g.skill} (${g.current}->${g.target})`);
      const context = {
        activeView,
        careerState: profile.careerState,
        careerGoal: profile.careerGoal,
        targetRole,
        skillGaps: topGaps,
        applicationsCount: applications.length,
        interviewsCount: interviewSessions.length,
        activeProjectTitle: projects.find(p => p.status === 'in_progress')?.title
      };

      const token = await getAccessToken();
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ userPrompt: text, context })
      });

      if (res.ok) {
        const data = await res.json();
        const assistantMsg: CopilotMessage = {
          id: `msg-${Date.now() + 1}`,
          sender: 'assistant',
          text: data.text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          suggestions: data.suggestions,
          proposedAction: data.proposedAction
        };
        setCopilotMessages(prev => [...prev, assistantMsg]);
        if (data.proposedAction) {
          setPendingAiAction(data.proposedAction);
        }
      } else {
        // Never substitute canned career advice for a failed model call. The
        // notice is explicitly a system message, not generated content.
        let reason = 'The AI assistant is temporarily unavailable.';
        try {
          const body = await res.json();
          if (body && typeof body.error === 'string') reason = body.error;
        } catch {
          // The response had no JSON body; the generic notice is enough.
        }
        const notice: CopilotMessage = {
          id: `msg-${Date.now() + 1}`,
          sender: 'assistant',
          text: `${reason} Your message was not answered.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setCopilotMessages(prev => [...prev, notice]);
      }
    } catch (e) {
      console.error(e);
      const notice: CopilotMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'assistant',
        text: 'The AI assistant could not be reached. Your message was not answered; please check your connection and try again.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setCopilotMessages(prev => [...prev, notice]);
    } finally {
      setIsCopilotTyping(false);
    }
  };

  const confirmAiAction = (actionId: string, accept: boolean) => {
    if (!pendingAiAction || pendingAiAction.id !== actionId) return;

    if (accept) {
      // Execute the proposed action safely
      if (pendingAiAction.type === 'update_task' || pendingAiAction.type === 'add_skill') {
        const skillName = pendingAiAction.payload?.skill || 'Automated Testing';
        addCustomSkill({
          name: skillName,
          category: 'tools',
          currentLevel: 1,
          targetLevel: 3,
          source: 'ai_estimated',
          evidenceIds: []
        });
        setNotifications(prev => [
          {
            id: `notif-${Date.now()}`,
            title: 'AI Action Confirmed',
            message: `Added ${skillName} competency tracking to your career graph.`,
            type: 'skill',
            read: false,
            timestamp: 'Just now'
          },
          ...prev
        ]);
      }
    }

    setPendingAiAction(null);
  };

  const markNotificationRead = async (id: string) => {
    try {
      const refreshed = await markNotificationReadApi(id);
      setNotifications(refreshed.map(toUserNotification));
    } catch (error) {
      console.error('Failed to mark notification read:', error);
    }
  };

  const clearNotifications = async () => {
    try {
      await clearNotificationsApi();
      setNotifications([]);
    } catch (error) {
      console.error('Failed to clear notifications:', error);
    }
  };

  const updateSettings = (updates: Partial<UserSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
    // The theme and the interface language belong to the ACCOUNT, so they
    // follow the user to another device. The remaining settings (the
    // reminder toggles, the AI personalisation controls) are per-device UI
    // preferences and deliberately stay in local state.
    const accountOwned: Partial<PreferencesDTO> = {};
    if (updates.theme !== undefined) accountOwned.theme = updates.theme;
    if (updates.language !== undefined) accountOwned.language = updates.language;
    if (Object.keys(accountOwned).length > 0) {
      void patchPreferences(accountOwned).catch((error) => {
        console.error('Failed to persist account settings:', error);
      });
    }
  };

  const t = (key: keyof typeof translations.en): string => {
    const lang = settings.language;
    return translations[lang]?.[key] || translations.en[key] || key;
  };

  const exportDataJson = () => {
    const fullGraph = {
      exportedAt: new Date().toISOString(),
      user: currentUser,
      profile,
      targetRole,
      savedRoles,
      skills,
      analysis,
      roadmapPhases,
      projects,
      evidenceItems,
      activeCV,
      cvVersions,
      applications,
      interviewSessions,
      dailyActions,
      weeklyReview,
      careerHealth,
      settings
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullGraph, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `careerpilot_data_${profile.name.toLowerCase().replace(/\s+/g, '_')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const resetAllData = () => {
    // B.4 finding L-1: `localStorage.clear()` also wiped the Supabase auth
    // session, so "reset my data" silently signed the user out. Only the
    // CareerPilot cache keys are removed; the auth session is left alone.
    for (const key of [
      'careerpilot_profile',
      'careerpilot_target_role',
      'careerpilot_skills',
      'careerpilot_settings',
      'careerpilot_token',
      'careerpilot_user',
    ]) {
      localStorage.removeItem(key);
    }
    window.location.reload();
  };

  return (
    <CareerContext.Provider
      value={{
        currentUser,
        authToken,
        isAuthReady,
        hydrationError,
        isHydrated,
        authModalOpen,
        setAuthModalOpen,
        login,
        register,
        logout,
        profile,
        updateProfile,
        setCareerState,
        setCareerGoal,
        completeOnboarding,
        suggestAiSummary,
        validateUsername,
        profileCompleteness,
        activeView,
        setActiveView,
        targetRole,
        savedRoles,
        setPrimaryTargetRole,
        saveRole,
        removeSavedRole,
        secondaryGoals,
        addSecondaryGoal,
        updateSecondaryGoal,
        deleteSecondaryGoal,
        milestones,
        addMilestone,
        deleteMilestone,
        activities,
        logActivity,
        documents,
        addDocument,
        deleteDocument,
        coverLetters,
        saveCoverLetter,
        deleteCoverLetter,
        generateAiCoverLetter,
        skills,
        updateSkillLevel,
        addCustomSkill,
        removeSkill,
        analysis,
        careerHealth,
        careerBlockers,
        dailyActions,
        toggleDailyAction,
        weeklyReview,
        refreshAiAnalysis,
        isAnalyzing,
        roadmapPhases,
        updateTaskStatus,
        addTask,
        isEnrolledInRoadmap,
        enrollInRoadmap,
        learningCatalog,
        learningItems,
        learningRecommendations,
        learningRecommendationMeta,
        isLearningLoading,
        learningError,
        refreshLearningRecommendations,
        getLearningItem,
        saveLearningCourse,
        dismissLearningCourse,
        startLearningCourse,
        completeLearningCourse,
        updateLearningProgress,
        removeLearningCourse,
        projects,
        addProject,
        updateProject,
        deleteProject,
        evidenceItems,
        addEvidence,
        deleteEvidence,
        activeCV,
        cvVersions,
        updateCV,
        saveCVVersion,
        duplicateCVVersion,
        renameCVVersion,
        deleteCVVersion,
        runAiCvOptimization,
        isOptimizingCV,
        uploadCvFile,
        isUploadingCv,
        jobs,
        bookmarkedJobIds,
        toggleBookmarkJob,
        applications,
        addApplication,
        updateApplicationStage,
        updateApplicationNotes,
        deleteApplication,
        interviewSessions,
        saveInterviewSession,
        copilotMessages,
        sendCopilotMessage,
        isCopilotTyping,
        pendingAiAction,
        confirmAiAction,
        notifications,
        markNotificationRead,
        clearNotifications,
        settings,
        updateSettings,
        aiPreferences,
        updateAiPreferences,
        notificationPreferences,
        updateNotificationPreferences,
        privacyPreferences,
        updatePrivacyPreferences,
        t,
        exportDataJson,
        resetAllData,
      }}
    >
      {children}
    </CareerContext.Provider>
  );
};

export const useCareer = () => {
  const context = useContext(CareerContext);
  if (!context) {
    throw new Error('useCareer must be used within a CareerProvider');
  }
  return context;
};
