import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode, useMemo } from 'react';
import type { Session } from '@supabase/supabase-js';
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
  VolunteerExperience,
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
  ProfileCompletenessBreakdown,
  CareerContextSummary,
} from '../types/career';
import { TARGET_ROLES, resolveRole } from '../data/rolesData';
import { validateTargetRoleSelection } from '../../shared/targetRoleSelection';
import {
  buildSkillRecord,
  effectiveSkillLevel,
  type SkillRecord as SkillEvidenceRecord,
} from '../../shared/skillEvidence';
import {
  computeSkillGaps,
  summarizeSkillGaps,
  toRoleSkillRequirements,
  describeGap,
} from '../../shared/skillGap';
import {
  deriveCareerIdentity,
  type CareerIdentity,
  type EducationStatus,
  type TargetOpportunityType,
} from '../../shared/careerIdentity';
import { computeProfileCompleteness } from '../../shared/profileCompleteness';
import {
  isActiveProjectStatus,
  isShippedStatus,
  normalizeProjectStatus,
} from '../../shared/projectLifecycle';
import {
  impliedExperienceLevel,
  normalizeExperienceLevel,
  type ExperienceLevel,
} from '../../shared/experienceLevel';
import { translations } from '../translations';
import { translate } from '../translations/sourceStrings';
import { getBrowserSupabase, getAccessToken, isSupabaseConfigured } from '../lib/supabase';
import { trackEvent } from '../lib/analytics';
import { apiUrl } from '../lib/native';
import { mergeCanonicalCvDocument } from '../../shared/cvProjection';
import { isSkillSectionHeader, normalizeSkillKey } from '../../shared/cvDedupe';
import {
  DEFAULT_RESUME_LANGUAGE,
  normalizeResumeLanguage,
} from '../../shared/resumeLanguage';
import {
  DEFAULT_CV_TEMPLATE_ID,
  normalizeCvTemplateId,
} from '../../shared/cvTemplates';
import type { CvSourceData } from '../../shared/cvDocument';
import {
  isAtsAnalysisForRole,
  parseAtsAnalysisFailure,
  type AtsAnalysisFailure,
} from '../../shared/atsAnalysis';
import {
  PRIVACY_VERSION,
  TERMS_VERSION,
  type ConsentSource,
  type ConsentState,
} from '../../shared/legal';
import {
  acceptConsent as acceptConsentApi,
  fetchConsentState,
} from '../lib/consentApi';
import {
  fetchActivities,
  postActivity,
  fetchSecondaryGoals,
  postSecondaryGoal,
  patchSecondaryGoal,
  deleteSecondaryGoal as deleteSecondaryGoalApi,
  fetchCareerMilestones,
  postCareerMilestone,
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
  fetchCvVersions,
  postCvVersion,
  patchCvVersion,
  deleteCvVersion,
  fetchProjects,
  postProject,
  patchProject,
  deleteProject as deleteProjectApi,
  fetchVolunteerExperiences,
  postVolunteerExperience,
  patchVolunteerExperience,
  deleteVolunteerExperience as deleteVolunteerExperienceApi,
  fetchEvidence,
  postEvidence,
  deleteEvidence as deleteEvidenceApi,
  fetchCertifications,
  postCertification,
  patchCertification,
  deleteCertification,
  fetchLanguages,
  postLanguage,
  patchLanguage,
  deleteLanguage,
  fetchSavedRoles,
  postSavedRole,
  deleteSavedRole,
  fetchJobApplications,
  fetchProfileLinks,
  postJobApplication,
  patchJobApplication,
  deleteJobApplication,
  fetchInterviewSessions,
  postInterviewSession,
  type CvVersionDTO,
  type ProjectDTO,
  type EvidenceDTO,
  type CertificationDTO,
  type LanguageDTO,
  type SavedRoleDTO,
  type JobApplicationDTO,
  type InterviewSessionDTO,
  type VolunteerExperienceDTO,
  type ProfileLinkDTO,
} from '../lib/coreApi';
import {
  fetchRoadmap,
  generatePersonalizedRoadmap as generatePersonalizedRoadmapApi,
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
  postSkillAssessment,
  fetchSkillGaps,
  recalculateSkillDependents as requestSkillRecalculation,
  deleteUserSkill as deleteUserSkillApi,
  type ExperienceDTO,
  type EducationDTO,
  type UserSkillDTO,
  type SkillRecalculationDTO,
} from '../lib/careerHistoryApi';
import {
  fetchNotifications,
  markNotificationRead as markNotificationReadApi,
  markAllNotificationsRead as markAllNotificationsReadApi,
  recordNotificationClick as recordNotificationClickApi,
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
  reorderProfileCollection,
  type OrderedCollection,
} from '../lib/profileOrderApi';
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
  LearningPreferences,
  LearningStatus,
  CourseFormat,
} from '../types/learning';
import {
  fetchCurrentSubscription,
  type CurrentSubscriptionResponse,
} from '../lib/subscriptionApi';
import {
  fetchCreditBalance,
  claimDailyTokens as claimDailyTokensRequest,
} from '../lib/creditsApi';
import type { CreditBalanceDTO } from '../../shared/credits';
import {
  captureReferralCodeFromUrl,
  claimStoredReferral,
  readStoredReferralCode,
} from '../lib/referralApi';
import { ProcessingProvider } from '../components/processing/ProcessingProvider';
import { ToastProvider } from '../components/toast/ToastProvider';
import {
  resolveIdentity,
  type CandidateIdentity,
} from '../../shared/identity';

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
  /**
   * The career state the candidate is in right now.
   *
   * It is NULLABLE on purpose: "not set" is a real state, and the platform
   * must report it rather than defaulting to "working professional" for a
   * candidate who skipped onboarding.
   */
  careerState: CareerState | null;
  /**
   * The goal the candidate is aiming at. Nullable for the same reason: the
   * goal is chosen, never assumed.
   */
  careerGoal: CareerGoal | null;
  customGoalText?: string;
  /**
   * Whether the candidate is currently studying or has graduated.
   *
   * The platform never guesses this: a stated graduation year in the future
   * always means "currently studying", whatever this column says.
   */
  educationStatus?: EducationStatus | null;
  /** The year the candidate expects to graduate, when they stated one. */
  expectedGraduationYear?: number | null;
  /**
   * The kind of opening the candidate is aiming at.
   *
   * It is a separate choice from the career goal: a candidate can be aiming
   * at "Data Analyst" as a role and still want an internship rather than a
   * full-time entry-level job.
   */
  targetOpportunityType?: TargetOpportunityType | null;
  onboardingCompleted: boolean;
  onboardingStatus: 'not_started' | 'started' | 'completed' | 'skipped';
  onboardingStep: number;
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
  avatarUrl: 'avatar-01',
  currentTitle: '',
  location: '',
  bio: '',
  // The career state and the goal are NOT given a default.
  //
  // They used to default to "working_professional" and "get_promoted", which
  // meant a candidate who skipped onboarding was presented as a working
  // professional chasing a promotion. The identity is derived from what the
  // candidate actually stated, and an absent value is reported as absent so
  // the interface can ask rather than invent.
  careerState: null,
  careerGoal: null,
  educationStatus: null,
  expectedGraduationYear: null,
  targetOpportunityType: null,
  onboardingCompleted: false,
  onboardingStatus: 'not_started',
  onboardingStep: 0,
  education: [],
  experiences: [],
  certifications: [],
  languages: [],
  links: {},
};

interface CareerContextType {
  // Authentication
  currentUser: UserAccount | null;
  /**
   * The candidate's identity, resolved once.
   *
   * Every surface — the topbar, the sidebar, the Dashboard, the CV Studio —
   * reads the name, the initials and the avatar from here. The platform used
   * to derive them separately in each place, which is how the header and the
   * sidebar ended up showing different names for the same person.
   */
  identity: CandidateIdentity;
  /**
   * The avatar identifier every avatar surface renders.
   *
   * It is part of the identity because an avatar is part of who somebody is:
   * two pictures of the same candidate is the same defect as two names.
   */
  avatarId: string;
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
  /**
   * A message from a failed OAuth / email-confirmation redirect (for example
   * "Email link is invalid or has expired"). The provider opens the auth modal
   * and the modal shows this until it is dismissed.
   */
  authRedirectError: string | null;
  clearAuthRedirectError: () => void;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (
    name: string,
    email: string,
    password: string,
    consent?: { accepted: boolean }
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  /**
   * The legal consent state of the signed-in user, or null while it is being
   * read. The server decides which versions are current and refuses every
   * protected route until a current acceptance exists.
   */
  consentState: ConsentState | null;
  /** True when the user must accept the current terms before using the platform. */
  consentRequired: boolean;
  /** Why the consent state could not be read, when it could not be read. */
  consentError: string | null;
  /** Records an acceptance of the current terms and unlocks the platform. */
  acceptConsent: (source?: ConsentSource) => Promise<void>;
  /**
   * Re-reads the consent state from the server.
   *
   * It resolves to the new state, or to null when the state could not be
   * read — which is not the same as "not accepted" and is reported as an
   * error rather than as a prompt.
   */
  refreshConsent: () => Promise<ConsentState | null>;  /**
   * True while the browser holds a Supabase recovery session created by the
   * password-reset email link. The app must ask for a new password before the
   * user continues, because the recovery session is not a normal sign-in.
   */
  passwordRecovery: boolean;
  completePasswordReset: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  dismissPasswordRecovery: () => void;

  // Profile & Persona
  profile: UserProfile;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  /**
   * Stores the order of one of the collections that appear on a CV.
   *
   * The order is part of the document, so it is written to the server next to
   * the entries themselves rather than kept in the browser.
   */
  reorderCvCollection: (collection: OrderedCollection, ids: string[]) => Promise<void>;
  setCareerState: (state: CareerState) => Promise<void>;
  setCareerGoal: (goal: CareerGoal, customText?: string) => Promise<void>;
  /**
   * The candidate's career identity, derived once and read everywhere.
   *
   * It carries the distinct axes — who they are now, what they do now, the
   * role they are aiming at, their goal, whether they are still studying and
   * the level they are aiming at — so no screen has to infer any of them.
   */
  careerIdentity: CareerIdentity;
  /**
   * Saves the career identity in ONE write.
   *
   * My Profile and Settings both call this, so a change made in either place
   * is immediately true in the other and in every screen that reads the
   * identity. The patch uses the identity's own vocabulary.
   */
  saveCareerIdentity: (patch: {
    currentStatus?: CareerState | null;
    currentRole?: string | null;
    careerGoal?: CareerGoal | null;
    experienceLevel?: ExperienceLevel | null;
    educationStatus?: EducationStatus | null;
    expectedGraduationYear?: number | null;
    targetOpportunityType?: TargetOpportunityType | null;
    professionalHeadline?: string | null;
  }) => Promise<boolean>;
  completeOnboarding: () => Promise<void>;
  suggestAiSummary: (signal?: AbortSignal) => Promise<string>;
  validateUsername: (username: string) => Promise<{ available: boolean; message: string }>;
  profileCompleteness: ProfileCompletenessBreakdown;

  // Active View for Contextual Copilot
  activeView: string;
  setActiveView: (view: string) => void;

  // Copilot drawer (shared by the shell and the dashboard)
  copilotOpen: boolean;
  setCopilotOpen: (open: boolean) => void;

  // Target Roles & Comparison
  /**
   * The candidate's target role, or `null` when they have not chosen one.
   *
   * It is nullable ON PURPOSE. It used to be initialised to the first role in
   * the catalogue — "Frontend Engineer" — which meant a candidate who skipped
   * onboarding was permanently, invisibly a Frontend Engineer: the database
   * had no role for them, so the hydration never replaced the default, and
   * every screen spoke about a role they never chose.
   *
   * `null` is the honest state, and it is a state the interface can show.
   */
  targetRole: TargetRole | null;
  /** The target role's title, or an empty string when no role is chosen. */
  targetRoleTitle: string;
  /** True once the candidate has chosen a target role. */
  hasTargetRole: boolean;
  /**
   * The level the candidate is aiming at (student, intern, junior, mid,
   * senior, lead). It is a different axis from the career state.
   */
  experienceLevel: ExperienceLevel | null;
  /** Saves the experience level on its own. */
  setExperienceLevel: (level: ExperienceLevel | null) => Promise<void>;
  savedRoles: TargetRole[];
  setPrimaryTargetRole: (roleId: string) => Promise<boolean>;
  /**
   * Saves the whole career target in ONE write.
   *
   * This is the single writer that the Profile page and the Settings page
   * both use, which is what keeps them in step: there is only one path from a
   * change in the interface to the database, so the two screens cannot drift.
   */
  saveCareerTarget: (input: {
    /** The catalogue id of the new role. Omit to leave the role alone. */
    roleId?: string | null;
    /** The new experience level. Omit to leave the level alone. */
    experienceLevel?: ExperienceLevel | null;
    /** The new career goal. Omit to leave the goal alone. */
    careerGoal?: CareerGoal | null;
    /** The free-text goal. Omit to leave it alone. */
    customGoalText?: string | null;
  }) => Promise<boolean>;
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
  logActivity: (
    activity: Omit<UserActivityItem, 'id' | 'timestamp'> & { idempotencyKey?: string }
  ) => void;

  // Documents & Cover Letters
  documents: CareerDocument[];
  deleteDocument: (id: string) => Promise<void>;
  coverLetters: CoverLetter[];
  saveCoverLetter: (cl: Omit<CoverLetter, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<string>;
  deleteCoverLetter: (id: string) => Promise<void>;
  generateAiCoverLetter: (company: string, jobTitle: string, jobDesc: string, tone?: string, signal?: AbortSignal) => Promise<{ coverLetter: string; keyHighlights: string[] }>;

  // Skills
  skills: UserSkill[];
  /**
   * The skills the candidate actually owns.
   *
   * `skills` is the CATALOGUE — every skill the target role wants, with the
   * candidate's level where they have one and level 1 where they do not.
   * This is the list of the skills the candidate has really rated or added,
   * and it is what a CV may show.
   */
  ownedSkills: Array<{ name: string; level: number }>;
  updateSkillLevel: (skillId: string, currentLevel: number) => void;
  addCustomSkill: (skill: Omit<UserSkill, 'id' | 'gap' | 'lastUpdated'>) => void;
  removeSkill: (skillId: string) => void;

  /**
   * The structured evidence for each skill, keyed by the lowercased name.
   *
   * A skill is a claim plus what the platform can prove. This map keeps the
   * three apart: the self-report, the level a diagnostic check measured, and
   * the evidence records that back it.
   */
  skillEvidence: Record<string, SkillEvidenceRecord>;
  /**
   * What the last recalculation found.
   *
   * The ranked priorities are the SAME list the roadmap's first recommended
   * step comes from, so "My Career" and the roadmap never disagree. The
   * readiness figure is the same number the server computed.
   */
  skillRecalculation: SkillRecalculationDTO | null;
  /**
   * Stores the result of a diagnostic knowledge check.
   *
   * The measurement is kept beside the candidate's self-report, not on top of
   * it, and the recalculation that follows removes a satisfied skill from the
   * blockers and from the roadmap's opening steps automatically.
   */
  recordSkillAssessment: (input: {
    name: string;
    level: number;
    score: number;
    category?: string;
  }) => Promise<boolean>;
  /**
   * The explicit re-sync control.
   *
   * Every skill write already recalculates; this is the secondary fallback
   * for a user who wants to be certain the roadmap matches their skills.
   */
  resyncSkillDependents: () => Promise<SkillRecalculationDTO | null>;

  // Analysis, Plan, Health, Blockers
  analysis: CareerAnalysis;
  careerHealth: CareerHealthDimensions;
  careerBlockers: CareerBlocker[];
  dailyActions: DailyCareerAction[];
  toggleDailyAction: (actionId: string) => void;
  weeklyReview: WeeklyCareerReview;
  refreshAiAnalysis: (signal?: AbortSignal) => Promise<void>;
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
  addProject: (project: Omit<CareerProject, 'id' | 'createdAt'>) => Promise<void>;
  updateProject: (projectId: string, updates: Partial<CareerProject>) => void;
  deleteProject: (projectId: string) => void;

  // Volunteer experience — its own domain, separate from employment.
  volunteerExperiences: VolunteerExperience[];
  addVolunteerExperience: (
    input: Omit<VolunteerExperience, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<VolunteerExperience>;
  updateVolunteerExperience: (
    id: string,
    updates: Partial<VolunteerExperience>
  ) => Promise<VolunteerExperience>;
  deleteVolunteerExperience: (id: string) => Promise<void>;
  evidenceItems: EvidenceItem[];
  addEvidence: (evidence: Omit<EvidenceItem, 'id' | 'dateAdded'>) => void;
  deleteEvidence: (evidenceId: string) => void;

  // CV Studio & Upload Pipeline
  activeCV: CVProfile;
  cvVersions: CVVersion[];
  updateCV: (updates: Partial<CVProfile>) => void;
  /**
   * The profile links the candidate owns, in the shape the API returns.
   *
   * The CV document is a projection of these rows, so a mutation must update
   * this state as well as the document; otherwise the next projection drops
   * the edit the candidate just made.
   */
  profileLinks: ProfileLinkDTO[];
  /** Re-reads the profile links and updates the document projection. */
  refreshProfileLinks: () => Promise<ProfileLinkDTO[]>;
  loadCVFromMyData: () => void;
  saveCVVersion: (name: string, profileSnapshot?: CVProfile) => Promise<CVVersion>;
  duplicateCVVersion: (versionId: string) => void;
  renameCVVersion: (versionId: string, newName: string) => void;
  deleteCVVersion: (versionId: string) => void;
  runAiCvOptimization: (options?: {
    signal?: AbortSignal;
    /** Reports the phase of the work; the save phase is not cancellable. */
    setPhase?: (stage: string, cancellable?: boolean) => void;
  }) => Promise<void>;
  isOptimizingCV: boolean;
  cvAnalysisError: AtsAnalysisFailure | null;
  dismissCvAnalysisError: () => void;
  /**
   * Puts a reviewed CV into the studio.
   *
   * The document the candidate reviewed and accepted becomes the document the
   * studio works on, and it is shown as a version so it can be compared with
   * the ones that came before it.
   */
  applyReviewedCv: (options: {
    cv: CVProfile;
    versionName?: string;
    targetRoleTitle?: string;
    cvId?: string;
    cvVersionId?: string;
  }) => void;
  regeneratePersonalizedRoadmap: () => Promise<boolean>;
  careerContext: CareerContextSummary;

  // Jobs & Applications
  jobs: JobListing[];
  bookmarkedJobIds: string[];
  toggleBookmarkJob: (jobId: string) => void;
  applications: JobApplication[];
  addApplication: (application: Omit<JobApplication, 'id' | 'lastUpdated'>) => Promise<boolean>;
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
  /** Notifications allowed by the device-local notification preferences. */
  visibleNotifications: UserNotification[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  recordNotificationClick: (id: string) => Promise<string | null>;
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
  t: (key: string) => string;
  exportDataJson: () => void;
  resetAllData: () => void;

  // Subscription & Tokens
  subscription: CurrentSubscriptionResponse | null;
  creditBalance: CreditBalanceDTO | null;
  refreshSubscription: () => Promise<void>;
  refreshCredits: () => Promise<void>;
  /**
   * Claims the daily free-token reward.
   *
   * Resolves to the number of tokens that were actually granted — zero when
   * the reward had already been claimed today — or `null` when the claim
   * could not be completed at all. The balance in context is corrected
   * straight away, so every surface that shows the balance shows the truth
   * without waiting for the next read.
   */
  claimDailyTokens: () => Promise<number | null>;
}

const CareerContext = createContext<CareerContextType | undefined>(undefined);

export function normalizeSkillName(name: string): string {
  if (!name) return '';
  const clean = name.toLowerCase().trim();
  // Aliases bridge the way a skill is written in a CV against the way the
  // role catalogue names it. The table spans every career domain, so a
  // "Financial Statement Analysis" in a CV matches the catalogue, and so does
  // a "Financial Modelling" one.
  const aliases: Record<string, string> = {
    'microsoft excel': 'excel',
    'ms excel': 'excel',
    'excel / spreadsheets modeling': 'excel',
    'excel / spreadsheets modelling': 'excel',
    'spreadsheets': 'excel',
    'power bi': 'power bi',
    'powerbi': 'power bi',
    'ms power bi': 'power bi',
    'microsoft power bi': 'power bi',
    'data visualization (tableau/power bi)': 'data visualization',
    'data visualisation': 'data visualization',
    'tableau desktop': 'tableau',
    'react.js': 'react',
    'reactjs': 'react',
    'node.js': 'node.js',
    'nodejs': 'node.js',
    'ts': 'typescript',
    'js': 'javascript',
    'python3': 'python',
    'py': 'python',
    'postgres': 'postgresql',
    'postgresql': 'postgresql',
    'git & version control': 'git',
    'git / version control': 'git',
    'statistical analysis': 'statistics',
    'statistics': 'statistics',
    // Finance and accounting
    'financial statement analysis': 'financial statements',
    'financial statements analysis': 'financial statements',
    'financial reporting': 'financial statements',
    'fin modeling': 'financial modelling',
    'financial model': 'financial modelling',
    'management reporting': 'budgeting',
    'budgeting & forecasting': 'budgeting',
    // People and HR
    'human resources': 'employee relations',
    'hr generalist': 'employee relations',
    'recruitment': 'sourcing & boolean search',
    'recruiting': 'sourcing & boolean search',
    'talent acquisition': 'sourcing & boolean search',
    'payroll administration': 'payroll & people process administration',
    'total rewards': 'compensation benchmarking & market pricing',
    'comp & ben': 'compensation benchmarking & market pricing',
    // Marketing, sales and design
    'search engine optimisation': 'seo content writing',
    'search engine optimization': 'seo content writing',
    'social media marketing': 'social media strategy',
    'customer acquisition': 'sourcing & boolean search',
    'brand & graphic design': 'visual identity systems',
    'ux / ui': 'interaction & ux design',
    // Operations and supply chain
    'supply chain management': 'demand forecasting & supply planning',
    'procurement': 'sourcing & competitive tendering',
    'warehouse management': 'inventory & warehouse management',
    'logistics coordination': 'logistics coordination & routing',
    // Education, healthcare and legal
    'classroom management': 'classroom management',
    'lesson planning': 'curriculum & lesson planning',
    'patient care': 'clinical assessment & nursing care',
    'clinical nursing': 'clinical assessment & nursing care',
    'legal research': 'legal research & case analysis',
    'contract management': 'contract lifecycle management',
  };
  return aliases[clean] || clean.replace(/[^a-z0-9+#]/g, '');
}


// Maps a Supabase Auth user to the application's account shape.
// The id is always auth.users.id — the same value as public.profiles.id.
function toUserAccount(
  user: {
    id: string;
    email?: string;
    user_metadata?: Record<string, any>;
    created_at?: string;
  },
  token?: string
): UserAccount {
  const meta = user.user_metadata || {};
  // Google and LinkedIn supply `name`; GitHub may supply only its username
  // (`user_name`/`preferred_username`). None of these fields is required: the
  // onboarding flow collects the details the profile needs, so a provider that
  // omits them must not prevent the session from being established.
  const email = user.email || meta.email || '';
  return {
    id: user.id,
    email,
    name:
      meta.name ||
      meta.full_name ||
      meta.user_name ||
      meta.preferred_username ||
      (email ? email.split('@')[0] : 'User'),
    avatarUrl: meta.avatar_url || undefined,
    token,
    // `created_at` is the authoritative account age. The metadata copy is a
    // fallback for providers that do not expose the column, and the current
    // time is the last resort — an unknown age must not look old enough for
    // an invitation.
    createdAt: user.created_at || meta.created_at || new Date().toISOString(),
  };
}

// Reads an OAuth / email-confirmation error that Supabase appended to the
// return URL, removes it from the address bar, and returns a human-readable
// message. Query parameters are used by PKCE OAuth and email links; the hash is
// also checked because some providers still return implicit-flow errors there.
// The hash is only rewritten when it actually contains error parameters, so a
// valid `#/route` or `type=recovery` fragment is never damaged.
function consumeAuthRedirectError(): string | null {
  if (typeof window === 'undefined') return null;

  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  const read = (key: string) => search.get(key) ?? hash.get(key);
  const raw = read('error_description') ?? read('error');
  if (!raw) return null;

  const code = read('error_code');
  const message =
    code === 'otp_expired'
      ? 'That sign-in link has expired. Request a new one and try again.'
      : raw.replace(/\+/g, ' ');

  for (const key of ['error', 'error_code', 'error_description']) {
    search.delete(key);
    hash.delete(key);
  }

  const nextSearch = search.toString();
  const nextUrl =
    window.location.pathname +
    (nextSearch ? `?${nextSearch}` : '') +
    (window.location.hash.includes('error=') && hash.toString() ? `#${hash.toString()}` : window.location.hash);

  // `replaceState` avoids adding an entry the Back button would return to.
  window.history.replaceState({}, '', nextUrl);
  return message;
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
    goal: phase.goal ?? null,
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
    workKind: (task.workKind as RoadmapTask['workKind']) ?? undefined,
        difficulty: task.difficulty ?? null,
        prerequisites: task.prerequisites ?? [],
        skillNames: task.skillNames ?? [],
        projectTitles: task.projectTitles ?? [],
        resources: task.resources ?? [],
        priority: task.priority ?? null,
        rationale: task.rationale ?? null,
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
    status: normalizeProjectStatus(dto.status),
    repositoryUrl: dto.repositoryUrl ?? undefined,
    demoUrl: dto.demoUrl ?? undefined,
    documentation: dto.documentation ?? undefined,
    category: dto.category ?? 'personal',
    role: dto.role ?? undefined,
    responsibilities: dto.responsibilities ?? [],
    startDate: dto.startDate ?? undefined,
    isFeatured: dto.isFeatured ?? false,
    includeInPortfolio: dto.includeInPortfolio !== false,
    thumbnailUrl: dto.thumbnailUrl ?? undefined,
    screenshots: dto.screenshots ?? [],
    createdAt: dto.createdAt,
    completedAt: dto.completedAt ?? undefined,
  };
}

function toVolunteerExperience(dto: VolunteerExperienceDTO): VolunteerExperience {
  return {
    id: dto.id,
    organization: dto.organization,
    role: dto.role,
    location: dto.location ?? '',
    startDate: dto.startDate ?? '',
    endDate: dto.endDate ?? '',
    isCurrent: dto.isCurrent,
    description: dto.description ?? '',
    responsibilities: dto.responsibilities,
    achievements: dto.achievements,
    skills: dto.skills,
    projectIds: dto.projectIds,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
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
    clicked: dto.clicked,
    priority: dto.priority ?? null,
    timestamp: dto.createdAt,
    linkAction: dto.linkView ?? undefined,
  };
}

function toCVVersion(dto: CvVersionDTO): CVVersion {
  return {
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

/** True for a server-generated version/cv id, false for a local placeholder. */
function isPersistedId(id: string | null | undefined): boolean {
  return Boolean(
    id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  );
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
      domainId: 'business',
      aliases: [],
      entryPath: [],
      intermediatePath: [],
      advancedPath: [],
      proficiencyExpectations: [],
      evidenceSuggestions: [],
      learningTopics: [],
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
    description: dto.description ?? undefined,
    skills: dto.skills ?? [],
    attachmentUrl: dto.attachmentUrl ?? undefined,
  };
}

function toLanguage(dto: LanguageDTO): UserLanguageEntry {
  return {
    id: dto.id,
    language: dto.name,
    proficiency: (dto.proficiency as UserLanguageEntry['proficiency']) ?? 'Professional',
  };
}

const DEFAULT_AI_PREFERENCES: AiPreferences = {
  recommendationsEnabled: true,
  writingAssistance: true,
  proactiveSuggestions: true,
  personalizationLevel: 'focused',
  preferredLanguage: 'en',
};

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  emailNotifications: true,
  inAppNotifications: true,
  applicationReminders: true,
  interviewReminders: true,
  roadmapReminders: true,
  learningReminders: true,
  aiRecommendations: true,
};

const DEFAULT_PRIVACY_PREFERENCES: PrivacyPreferences = {
  profileVisibility: 'public',
  allowSearchEngines: true,
  shareAnalyticsWithAi: true,
  showSkillsPublicly: true,
  showProjectsPublicly: true,
};

/**
 * Preferences are device-local UI settings. They are stored per browser
 * rather than in PostgreSQL (theme and language are the account-owned
 * exceptions, handled by the preferences API).
 */
function readPreferenceCache<T extends object>(key: string, defaults: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? { ...defaults, ...parsed } : defaults;
  } catch {
    return defaults;
  }
}

function writePreferenceCache<T extends object>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A private-mode browser may refuse the write; the in-memory value still
    // applies for this session.
  }
}

export const CareerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Authentication State — Supabase Auth is the only identity source.
  // No demo fallback: an unauthenticated visitor has no session and no user.
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  // True when Supabase reports a recovery session created by the reset email.
  // Until a new password is saved, the session must not be treated as a
  // deliberate sign-in.
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);

  // The legal consent state.
  //
  // It is read before anything else is loaded, because the server refuses
  // every protected route until the user has accepted the current terms. A
  // user without an acceptance would otherwise see a wall of failed loads
  // instead of the one screen that can actually help them.
  const [consentState, setConsentState] = useState<ConsentState | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);

  // Subscriptions & Tokens
  const [subscription, setSubscription] = useState<CurrentSubscriptionResponse | null>(null);
  const [creditBalance, setCreditBalance] = useState<CreditBalanceDTO | null>(null);

  const refreshSubscription = useCallback(async () => {
    try {
      const data = await fetchCurrentSubscription();
      setSubscription(data);
    } catch (err) {
      console.warn('Could not refresh subscription:', err);
    }
  }, []);

  const refreshCredits = useCallback(async () => {
    try {
      const data = await fetchCreditBalance();
      setCreditBalance(data);
    } catch (err) {
      console.warn('Could not refresh credit balance:', err);
    }
  }, []);

  // Claims the daily free-token reward.
  //
  // The reward is claimed, not granted: nothing else in the application hands
  // it out, so this is the single path that creates a claim. The server
  // treats the claim as idempotent per day, so a double press pays out once.
  //
  // The answer carries the new balance and the new allowance state, and both
  // are written into the context here. That is what lets the badge, the
  // dashboard widget and the token hub agree without asking again.
  const claimDailyTokens = useCallback(async (): Promise<number | null> => {
    try {
      const result = await claimDailyTokensRequest();

      setCreditBalance((previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          balance: result.balance,
          ...(result.daily ? { daily: result.daily } : {}),
        };
      });

      return result.granted;
    } catch (err) {
      console.warn('Could not claim the daily tokens:', err);
      // The balance may still have moved on the server, so it is read again
      // rather than left showing a number that is known to be wrong.
      void refreshCredits();
      return null;
    }
  }, [refreshCredits]);

  // The identity the in-memory career state belongs to. When the Supabase
  // session changes to a different user (or disappears) without going through
  // the explicit logout button, the old user's data must be cleared before the
  // new user's hydration starts. Otherwise the previous user's profile,
  // roadmap, applications and notifications remain visible for the duration
  // of the hydration request.
  const authIdentityRef = useRef<string | null>(null);

  // Session restoration + automatic token refresh.
  // Supabase persists the session and refreshes it on expiry; this listener
  // keeps the in-memory token and user in sync with it.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsAuthReady(true);
      return;
    }
    // Read the recovery marker before Supabase initializes: with
    // `detectSessionInUrl` the client consumes and removes the token fragment.
    // The auth event below is the primary signal; this is the fallback for the
    // case where initialization finishes before the listener is attached.
    const looksLikeRecovery =
      /(?:^|[#&?])type=recovery(?:[&=]|$)/.test(window.location.hash) ||
      /(?:^|[?&])type=recovery(?:[&=]|$)/.test(window.location.search);

    const supabase = getBrowserSupabase();

    const applySession = (session: Session | null) => {
      const nextUserId = session?.user?.id ?? null;
      if (authIdentityRef.current !== null && authIdentityRef.current !== nextUserId) {
        resetAuthenticatedState();
      }
      authIdentityRef.current = nextUserId;

      if (session) {
        setAuthToken(session.access_token);
        setCurrentUser(toUserAccount(session.user, session.access_token));
      } else {
        setAuthToken(null);
        setCurrentUser(null);
      }
      setIsAuthReady(true);
    };

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (looksLikeRecovery && data.session) setPasswordRecovery(true);
        applySession(data.session);
      })
      .catch(() => {
        // A failed session restore must not leave the app on the boot loader
        // forever. The visitor is treated as signed out.
        setIsAuthReady(true);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // A reset link arrives as a real session with the PASSWORD_RECOVERY
        // event. The user is authenticated, but the only safe next step is to
        // choose a new password; the app shows that form before continuing.
        if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
        applySession(session);
      }
    );

    return () => {
      subscription.subscription.unsubscribe();
    };
    // `resetAuthenticatedState` is a hoisted function declaration and is called
    // only from the session callback, never during render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reads the legal consent state for the signed-in user.
  //
  // This runs before the hydration below, and the hydration waits for it. The
  // server refuses every protected route until a current acceptance exists, so
  // loading the career data first would produce nothing but failures for a
  // user who has not accepted yet.
  const refreshConsent = useCallback(async () => {
    try {
      const state = await fetchConsentState();
      setConsentState(state);
      setConsentError(null);
      return state;
    } catch (error) {
      // The state could not be read. That is not the same as "not accepted",
      // and it must not be reported as either: the screen asks the user to
      // try again rather than showing them a prompt for a check that failed.
      setConsentError(
        error instanceof Error
          ? error.message
          : 'Your consent status could not be checked. Please try again.'
      );
      return null;
    }
  }, []);

  useEffect(() => {
    if (!authToken) {
      setConsentState(null);
      setConsentError(null);
      return;
    }
    let cancelled = false;
    void refreshConsent().then((state) => {
      if (cancelled) return;
      if (!state) {
        // The check failed. The gate is not shown, because the user has not
        // been told anything false — but the application cannot load either.
        setConsentState(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authToken, refreshConsent]);

  // Records an acceptance of the current terms.
  //
  // The versions that are sent back are the ones the server published when it
  // was read. The server compares them with its own current release, so an
  // acceptance of text that has since been replaced is refused rather than
  // silently recorded.
  const acceptConsent = useCallback(async (source: ConsentSource = 'reconsent') => {
    if (!consentState) {
      throw new Error('The current terms have not been read yet.');
    }
    if (!consentState.termsAvailable) {
      throw new Error('Approved Terms are not published yet. Consent cannot be recorded.');
    }
    const state = await acceptConsentApi(
      {
        termsVersion: consentState.termsVersion,
        privacyVersion: consentState.privacyVersion,
      },
      source
    );
    setConsentState(state);
    setConsentError(null);
  }, [consentState]);

  // B.3.6 — Backend hydration for the persisted domains.
  // Runs whenever an authenticated session is present. The database is the
  // source of truth; localStorage is not consulted for these domains.
  useEffect(() => {
    if (!authToken) return;
    // The data load waits for the consent check. Until the server says the
    // user has accepted the current terms, every protected route answers
    // 403 CONSENT_REQUIRED, so there is nothing to hydrate.
    if (!consentState) return;
    if (!consentState.accepted) return;
    let cancelled = false;

    const hydrate = async () => {
      setHydrationError(false);
      try {
        // The theme and the interface language belong to the account, and the
        // direction of the page follows the language. They are applied as
        // soon as they arrive rather than after the whole batch below, which
        // includes the learning catalogue and the recommendation ranking. An
        // Arabic reader was shown a left-to-right layout, with Arabic text in
        // it, for as long as the slowest of those requests took.
        const preferencesPromise = fetchPreferences();
        preferencesPromise
          .then((record) => {
            if (cancelled || !record) return;
            setSettings((prev) => ({
              ...prev,
              theme: (record.theme as UserSettings['theme']) ?? prev.theme,
              language: (record.language as UserSettings['language']) ?? prev.language,
              // The resume language is the account's, not the browser's. It
              // is the language the CV is written in, and it is deliberately
              // not the interface language.
              resumeLanguage: normalizeResumeLanguage(record.resumeLanguage),
              cvTemplateId: normalizeCvTemplateId(record.cvTemplateId),
            }));
          })
          .catch(() => {
            // The hydration below reports a failed hydration; this early
            // application only makes sure the page is not left pointing the
            // wrong way.
          });
        const [
          roadmapRecord,
          profileRecord,
          goalList,
          milestoneList,
          activityList,
          coverLetterList,
          projectList,
          volunteerList,
          evidenceList,
          cvList,
          cvVersionList,
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
          profileLinkList,
          skillGapList,
        ] = await Promise.all([
          fetchRoadmap(),
          fetchProfile(),
          fetchSecondaryGoals(),
          fetchCareerMilestones(),
          fetchActivities(),
          fetchCoverLetters(),
          fetchProjects(),
          fetchVolunteerExperiences(),
          fetchEvidence(),
          fetchCvs(),
          fetchCvVersions(),
          fetchSavedRoles(),
          fetchJobApplications(),
          fetchInterviewSessions(),
          fetchExperiences(),
          fetchEducations(),
          fetchUserSkills(),
          fetchNotifications(),
          preferencesPromise,
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
          // A missing link list must not block the hydration: the CV shows the
          // links it has, and the studio can still add more.
          fetchProfileLinks().catch(() => []),
          // The ranked skill gaps. A candidate with no target role has none,
          // which is a normal state rather than a failure.
          fetchSkillGaps().catch(() => null),
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
            // The goal is what the candidate chose, or absent. It is never
            // defaulted, because a default goal is how a student ended up
            // chasing a promotion.
            careerGoal: (profileRecord.careerGoal as UserProfile['careerGoal']) ?? null,
            customGoalText: profileRecord.customGoalText ?? prev.customGoalText,
            industry: profileRecord.targetIndustry ?? prev.industry,
            username: profileRecord.username ?? prev.username,
            // The column is `user_type`; the domain field is `careerState`.
            // Writing it to `userType` left the persona at its default, so
            // every user saw "Working Professional" whatever they chose.
            careerState: (profileRecord.userType as UserProfile['careerState']) ?? null,
            // The education axis: whether the candidate is still studying
            // and when they expect to graduate. The level they are aiming at
            // is read separately, into its own state.
            educationStatus:
              (profileRecord.educationStatus as UserProfile['educationStatus']) ?? null,
            expectedGraduationYear: profileRecord.expectedGraduationYear ?? null,
            targetOpportunityType:
              (profileRecord.targetOpportunityType as UserProfile['targetOpportunityType']) ??
              null,
            yearsOfExperience: profileRecord.yearsOfExperience ?? prev.yearsOfExperience,
            onboardingCompleted: profileRecord.onboardingCompleted,
            onboardingStatus: profileRecord.onboardingStatus ?? (profileRecord.onboardingCompleted ? 'completed' : 'not_started'),
            onboardingStep: profileRecord.onboardingStep ?? 0,
            certifications: profileRecord.certifications.map(c => ({
              id: c.id,
              name: c.name,
              provider: c.issuer ?? '',
              issueDate: c.issueDate ?? '',
              expiryDate: c.expiryDate ?? undefined,
              credentialId: c.credentialId ?? undefined,
              credentialUrl: c.url ?? undefined,
              description: c.description ?? undefined,
              skills: c.skills ?? [],
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
            careerIdentity: profileRecord.careerIdentity
              ? {
                  whoYouAre: profileRecord.careerIdentity.whoYouAre ?? '',
                  whereYoureGoing: profileRecord.careerIdentity.whereYoureGoing ?? '',
                  why: profileRecord.careerIdentity.why ?? '',
                  whatYoureMissing: profileRecord.careerIdentity.whatYoureMissing ?? '',
                  whatYoureBuilding: profileRecord.careerIdentity.whatYoureBuilding ?? '',
                  howYourePresenting: profileRecord.careerIdentity.howYourePresenting ?? '',
                  whereApplying: profileRecord.careerIdentity.whereApplying ?? '',
                }
              : prev.careerIdentity,
          }));
        }
        setSecondaryGoals(goalList.map(toSecondaryGoal));
        setMilestones(milestoneList.map(toCareerMilestone));
        setActivities(activityList.map(toActivity));
        setCoverLetters(coverLetterList.map(toCoverLetter));
        setProjects(projectList.map(toCareerProject));
        setVolunteerExperiences(volunteerList.map(toVolunteerExperience));
        setEvidenceItems(evidenceList.map(toEvidenceItem));
        setCvVersions(cvVersionList.map(toCVVersion));
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
        // The evidence for each skill, kept beside the level. The self-report
        // and the measurement are separate values, so a skill that was only
        // MEASURED (never self-rated) still shows up — with its assessment
        // badge and no self-reported claim.
        const evidence: Record<string, SkillEvidenceRecord> = {};
        for (const row of userSkillList) {
          const rawName = row.skill?.name ?? '';
          const name = rawName.toLowerCase();
          if (!name) continue;
          const record = buildSkillRecord({
            name: rawName,
            category: row.skill?.category,
            selfReportedLevel: row.proficiency,
            assessedLevel: row.assessed_level ?? null,
            assessmentScore: row.assessment_score ?? null,
            assessmentAt: row.assessment_at ?? null,
            evidenceSources: row.evidence_sources ?? [],
          });
          evidence[name] = record;
          if (row.proficiency !== null) levels[name] = row.proficiency;
        }
        setSkillEvidence(evidence);
        setSkillLevels(levels);

        // The ranked gaps come from the server, so the blockers, the readiness
        // figure and the roadmap's first recommended step all read the same
        // numbers.
        if (skillGapList) setSkillRecalculation(skillGapList);

        // The professional links are their own records. The CV shows them, so
        // they have to be in the projection.
        setProfileLinks(profileLinkList ?? []);

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

        // The target role is persisted as its canonical title; the catalogue entry
        // supplies the skill requirements and the roadmap the UI derives.
        //
        // A candidate with no persisted role has NO role — the state is null,
        // not the first entry of the catalogue. That is what stops a skipped
        // onboarding from leaving someone permanently "Frontend Engineer".
        const persistedRole = profileRecord?.targetRole
          ? resolveRole(profileRecord.targetRole)
          : undefined;
        setTargetRole(persistedRole ?? null);

        // The experience level is its own column. When the profile has none,
        // the career state gives a sensible starting value.
        const persistedLevel = normalizeExperienceLevel(profileRecord?.experienceLevel);
        setExperienceLevelState(
          persistedLevel.ok
            ? persistedLevel.value ?? impliedExperienceLevel(profileRecord?.userType ?? null)
            : impliedExperienceLevel(profileRecord?.userType ?? null)
        );

        // Hydration is complete: only now may the localStorage cache be
        // written, and only then does the app trust the server's view.
        setIsHydrated(true);
        void refreshSubscription();
        void refreshCredits();
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
    // `consentState` is a dependency because the load must start again once
    // the user accepts: before the acceptance there was nothing to load.
  }, [authToken, consentState]);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authRedirectError, setAuthRedirectError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState('dashboard');

  // Surface an OAuth / confirmation-link failure that Supabase appended to the
  // return URL. Without this the visitor lands on the dashboard, silently
  // signed out, with no explanation. Runs once on mount, before the user can
  // interact with the app.
  useEffect(() => {
    const message = consumeAuthRedirectError();
    if (message) {
      setAuthRedirectError(message);
      setAuthModalOpen(true);
    }
  }, []);

  const clearAuthRedirectError = useCallback(() => setAuthRedirectError(null), []);

  // The Copilot drawer is part of the authenticated shell, but the dashboard
  // also opens it. The open flag therefore lives in the shared context rather
  // than inside AppShell (where the dashboard's button could not reach it).
  const [copilotOpen, setCopilotOpen] = useState(false);

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
  // cache must never seed the state, so it now starts EMPTY and is replaced by
  // the server's `targetRole` column once the session hydrates.
  //
  // It is deliberately NOT initialised to the first catalogue role either.
  // That role is "Frontend Engineer", and a candidate who skipped onboarding
  // has no role at all — so the honest starting state is `null`, and the
  // interface asks them to choose rather than inventing an answer for them.
  const [targetRole, setTargetRole] = useState<TargetRole | null>(null);

  // The level the candidate is aiming at. Hydrated from the profile, and
  // seeded from the career state when the profile has no level of its own.
  const [experienceLevel, setExperienceLevelState] = useState<ExperienceLevel | null>(null);

  // ---- The Career Identity ----
  //
  // ONE definition of who the candidate is, used by every screen: My
  // Profile, Settings, My Career, the Dashboard, the Roadmap and CV Studio.
  //
  // It is DERIVED, never stored twice. The facts live in the profile row and
  // the education records; this reads them and produces one answer. That is
  // what stops the profile from saying "Student" while the roadmap plans
  // for a working professional, and what stops a target role from appearing
  // on a CV that belongs to someone who never chose one.
  //
  // The derivation is pure and lives in `shared/careerIdentity.ts`, so the
  // server, the browser and the tests all agree.
  const careerIdentity: CareerIdentity = useMemo(
    () =>
      deriveCareerIdentity({
        currentStatus: profile.careerState,
        currentRole: profile.currentTitle,
        targetRoleTitle: targetRole?.title ?? null,
        targetRoleId: targetRole?.id ?? null,
        careerGoal: profile.careerGoal,
        experienceLevel: experienceLevel ?? null,
        educationStatusOverride: profile.educationStatus ?? null,
        expectedGraduationYear: profile.expectedGraduationYear ?? null,
        targetOpportunityType: profile.targetOpportunityType ?? null,
        // The professional headline is `profiles.headline`. It is the
        // candidate's own line about themselves, kept apart from the current
        // job title — a student has no job title.
        professionalHeadline: profile.headline ?? null,
        education: profile.education.map((entry) => ({
          institution: entry.institution,
          degree: entry.degree,
          startDate: entry.startDate,
          endDate: entry.endDate,
          current: entry.current,
        })),
        // The current year is injected rather than read from the clock, so
        // the rule "a graduation year in the future means still studying" is
        // testable and never depends on when the code runs.
        currentYear: new Date().getFullYear(),
      }),
    [
      profile.careerState,
      profile.currentTitle,
      profile.careerGoal,
      experienceLevel,
      profile.educationStatus,
      profile.expectedGraduationYear,
      profile.targetOpportunityType,
      profile.headline ?? null,
      profile.education,
      targetRole,
    ],
  );


  /** The target role's title, or an empty string when none is chosen. */
  const targetRoleTitle = targetRole?.title ?? '';

  /** True once the candidate has chosen a target role. */
  const hasTargetRole = targetRole !== null;

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
  // The structured evidence for each skill, keyed by the skill name.
  //
  // A skill is a claim plus whatever the platform can prove: the candidate's
  // self-report, the level a diagnostic knowledge check measured, and the
  // records (projects, courses, certificates) that back it. Keeping the three
  // apart is what lets the interface say WHICH of them it is showing instead
  // of presenting one unexplained number.
  const [skillEvidence, setSkillEvidence] = useState<Record<string, SkillEvidenceRecord>>({});
  // What the last recalculation found. The roadmap, the blockers and the
  // readiness figure all follow from this, and it is what the "why is this
  // out of date?" indicator reads.
  const [skillRecalculation, setSkillRecalculation] = useState<SkillRecalculationDTO | null>(null);

  // The user's skill list, derived from two sources:
  //   * the CATALOGUE — the required and preferred skills of the target role
  //     plus any skill the user added themselves;
  //   * the user's EVIDENCE — the self-report, the measurement and the proof
  //     held in public.user_skills, keyed by skill name.
  //
  // The level the platform compares against the role is the EFFECTIVE level:
  // the strongest of the self-report, the assessment and the evidence. A
  // skill nobody rated and nothing proves is level 0 — the old default of 1
  // hid the largest possible gap behind an optimistic number.
  const skills: UserSkill[] = useMemo(() => {
    const role = targetRole;
    const catalogue: Array<{ name: string; category: SkillCategory; targetLevel: number }> = [];

    // No role means no role catalogue. The candidate's own skills still show,
    // but the platform must not ask them to rate the requirements of a role
    // they never chose — that is how "Frontend Engineer" used to leak into
    // every account that skipped onboarding.
    for (const req of role?.requiredSkills ?? []) {
      catalogue.push({
        name: req.name,
        category: (req.category as SkillCategory) ?? 'technical',
        targetLevel: req.minLevel,
      });
    }
    for (const pref of role?.preferredSkills ?? []) {
      if (catalogue.some((entry) => entry.name.toLowerCase() === pref.name.toLowerCase())) continue;
      catalogue.push({
        name: pref.name,
        category: (pref.category as SkillCategory) ?? 'technical',
        targetLevel: pref.minLevel,
      });
    }

    const merged: UserSkill[] = catalogue.map((entry) => {
      const key = entry.name.toLowerCase();
      const record = skillEvidence[key];
      const level = record ? effectiveSkillLevel(record) : 0;
      const selfReported = record?.selfReportedLevel ?? null;
      const assessed = record?.assessedLevel ?? null;
      return {
        id: `skill-${key.replace(/[^a-z0-9]+/g, '-')}`,
        name: entry.name,
        category: entry.category,
        currentLevel: level,
        targetLevel: entry.targetLevel,
        gap: Math.max(0, entry.targetLevel - level),
        source:
          selfReported !== null
            ? 'self_reported'
            : assessed !== null
              ? 'assessment'
              : 'ai_estimated',
        evidenceIds: [],
        lastUpdated: new Date().toISOString().split('T')[0],
        selfReportedLevel: selfReported,
        assessedLevel: assessed,
        assessmentScore: record?.assessmentScore ?? null,
        assessmentAt: record?.assessmentAt ?? null,
        evidenceSources: record?.evidenceSources ?? [],
      };
    });

    // A skill the user added themselves that is not part of the role.
    for (const custom of customSkills) {
      if (merged.some((entry) => entry.name.toLowerCase() === custom.name.toLowerCase())) continue;
      merged.push(custom);
    }

    return merged;
  }, [targetRole, skillEvidence, customSkills]);

  // The skills the candidate actually owns.
  //
  // The list above is the CATALOGUE: every skill the target role wants, with
  // the candidate's own level where they have one and level 1 where they do
  // not. A CV is not that list. Putting a requirement on a CV would claim
  // the candidate has a skill they never said they had, so the CV is built
  // from the rows in public.user_skills — the skills the candidate has
  // actually rated or added.
  const ownedSkills = useMemo(() => {
    // The name each skill is shown under. The catalogue spells it the way the
    // platform does, and a skill the candidate added carries its own.
    const displayNames = new Map<string, string>();
    for (const skill of skills) {
      displayNames.set(skill.name.toLowerCase(), skill.name);
    }
    for (const row of userSkillRows) {
      const name = (row.skill?.name ?? '').trim();
      if (name) displayNames.set(name.toLowerCase(), name);
    }
    for (const custom of customSkills) {
      const name = custom.name.trim();
      if (name) displayNames.set(name.toLowerCase(), name);
    }

    // `skillLevels` is the set of skills the candidate has actually rated.
    // It is updated the moment a level is set or a skill is added, so a skill
    // reaches the CV as soon as it is claimed rather than at the next
    // refresh.
    const byName = new Map<string, { name: string; level: number }>();
    for (const [key, level] of Object.entries(skillLevels)) {
      const name = displayNames.get(key);
      if (!name) continue;
      byName.set(key, { name, level });
    }
    return [...byName.values()];
  }, [skills, skillLevels, userSkillRows, customSkills]);

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
  // Volunteer experience — PostgreSQL is the source of truth.
  const [volunteerExperiences, setVolunteerExperiences] = useState<VolunteerExperience[]>([]);
  // Evidence — PostgreSQL is the source of truth (B.3.7).
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>([]);

  // CV Studio
  //
  // B.4 finding C-5: the CV carried a fabricated candidate (Sarah Jenkins,
  // Meridian Tech Labs, a Meta certificate). It now starts empty and is
  // filled from the persisted CV / CV version rows.
  //
  // The document is not a second copy of the career data. It is a projection
  // of the records below: see `cvSource` and `mergeCanonicalCvDocument`.
  const [activeCV, setActiveCV] = useState<CVProfile>(emptyCVProfile);

  // The professional links, as the profile owns them. The CV shows them, but
  // the order and the enabled flag belong to the CV alone.
  const [profileLinks, setProfileLinks] = useState<ProfileLinkDTO[]>([]);

  // CVs and CV versions — PostgreSQL is the source of truth (B.3.7).
  const [cvVersions, setCvVersions] = useState<CVVersion[]>([]);
  const [activeCvId, setActiveCvId] = useState<string>('');
  const [isOptimizingCV, setIsOptimizingCV] = useState(false);
  const [cvAnalysisError, setCvAnalysisError] = useState<AtsAnalysisFailure | null>(null);

  const dismissCvAnalysisError = () => setCvAnalysisError(null);

  // Jobs & Applications
  //
  // B.4 finding H-5: the applications were seeded with two fabricated
  // applications ("Vanguard Systems" at the interview stage, "Nexus Cloud")
  // and the interviews with a fabricated mock-interview session. A brand-new
  // user saw other people's career activity. Both lists now start empty and
  // are filled from PostgreSQL.
  // The static catalogue that used to live here contained fabricated employers
  // and `.example.com` application links, so it was removed rather than
  // presented as live matches. Live vacancies now come from the job provider
  // through `/api/jobs/search`; this list stays empty because a vacancy is
  // only ever shown when the provider returned it. Job applications are still
  // tracked in PostgreSQL.
  const jobs: JobListing[] = [];
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

  const logActivity = async (
    item: Omit<UserActivityItem, 'id' | 'timestamp'> & { idempotencyKey?: string }
  ) => {
    try {
      const dto = await postActivity({
        actionType: item.actionType,
        title: item.title,
        subtitle: item.subtitle,
        relatedObject: item.relatedObject,
        linkView: item.linkView,
        idempotencyKey: item.idempotencyKey,
      });
      // The server returns the row that already exists when the same action
      // is logged again. Replace by id, never blind-prepend: a retry must not
      // make the Recent Activity panel show the action twice.
      const next = toActivity(dto);
      setActivities(prev => [next, ...prev.filter(activity => activity.id !== next.id)]);
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
        return dto.id;
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
        return dto.id;
      }
    } catch (error) {
      console.error('Failed to save cover letter:', error);
      throw error;
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

  const generateAiCoverLetter = async (
    company: string,
    jobTitle: string,
    jobDesc: string,
    tone = 'Professional & Confident',
    signal?: AbortSignal
  ) => {
    try {
      const token = await getAccessToken();
      const res = await fetch(apiUrl('/api/generate-cover-letter'), {
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
          tone,
          // The cover letter is a document the candidate sends alongside
          // the CV, so it is written in the language the CV is written in
          // rather than in the language the assistant happens to answer in.
          language: settings.resumeLanguage
        }),
        signal
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
      // Never substitute an invented letter for a failed model call. Cancellation
      // is an expected user action and is not a model/network failure.
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        console.error('Error generating cover letter:', e);
      }
      return { coverLetter: '', keyHighlights: [] };
    }
  };

  // AI Summary Assistant
  const suggestAiSummary = async (signal?: AbortSignal): Promise<string> => {
    const token = await getAccessToken();
    const res = await fetch(apiUrl('/api/suggest-summary'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        name: profile.name,
        targetRoleTitle: targetRole?.title ?? '',
        careerState: profile.careerState,
        yearsExperience: profile.yearsOfExperience,
        skills: skills.map(s => s.name),
        keyAchievements: profile.experiences.flatMap(e => e.achievements).slice(0, 3),
        language: aiPreferences.preferredLanguage
      }),
      signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data?.error === 'string' ? data.error : 'Summary generation failed'
      );
    }
    const suggested = typeof data?.suggestedSummary === 'string' ? data.suggestedSummary : '';
    if (!suggested.trim()) throw new Error('The AI could not create a summary. Please try again.');
    return suggested;
  };

  // Username validation
  const validateUsername = async (username: string): Promise<{ available: boolean; message: string }> => {
    try {
      const token = await getAccessToken();
      const res = await fetch(apiUrl(`/api/profile/check-username?username=${encodeURIComponent(username)}`), {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        cache: 'no-store',
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

  // AI & Notification & Privacy Preferences. These are per-device UI
  // preferences and survive a reload; account-owned theme and language live in
  // the preferences API instead.
  const [aiPreferences, setAiPreferences] = useState<AiPreferences>(() =>
    readPreferenceCache('careerpilot_ai_preferences', DEFAULT_AI_PREFERENCES)
  );

  const updateAiPreferences = (updates: Partial<AiPreferences>) => {
    setAiPreferences(prev => {
      const next = { ...prev, ...updates };
      writePreferenceCache('careerpilot_ai_preferences', next);
      return next;
    });
  };

  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences>(() =>
      readPreferenceCache(
        'careerpilot_notification_preferences',
        DEFAULT_NOTIFICATION_PREFERENCES
      )
    );

  const updateNotificationPreferences = (updates: Partial<NotificationPreferences>) => {
    setNotificationPreferences(prev => {
      const next = { ...prev, ...updates };
      writePreferenceCache('careerpilot_notification_preferences', next);
      return next;
    });
  };

  const [privacyPreferences, setPrivacyPreferences] = useState<PrivacyPreferences>(() =>
    readPreferenceCache('careerpilot_privacy_preferences', DEFAULT_PRIVACY_PREFERENCES)
  );

  const updatePrivacyPreferences = (updates: Partial<PrivacyPreferences>) => {
    setPrivacyPreferences(prev => {
      const next = { ...prev, ...updates };
      writePreferenceCache('careerpilot_privacy_preferences', next);
      return next;
    });
  };

  // The notification preferences are real display filters. A hidden category
  // stays in the database; it is simply not shown in this browser.
  const visibleNotifications = useMemo(() => {
    if (!notificationPreferences.inAppNotifications) return [];
    return notifications.filter((notification) => {
      if (
        notification.type === 'interview' &&
        !notificationPreferences.interviewReminders
      ) {
        return false;
      }
      if (
        notification.type === 'application' &&
        !notificationPreferences.applicationReminders
      ) {
        return false;
      }
      if (
        notification.type === 'roadmap' &&
        !notificationPreferences.roadmapReminders
      ) {
        return false;
      }
      return true;
    });
  }, [notifications, notificationPreferences]);

  // Real Calculated Profile Completeness
  // The profile completeness.
  //
  // It is computed from what the candidate has actually FILLED IN, and it is
  // the shared engine's job so the number is the same everywhere. The old
  // local version checked eight things that had nothing to do with the
  // sections a CV needs, so a candidate with no projects and no
  // certifications could still be told they were 90% complete.
  const profileCompleteness = useMemo<ProfileCompletenessBreakdown>(() => {
    const result = computeProfileCompleteness({
      fullName: profile.name,
      headline: profile.headline,
      location: profile.location,
      professionalSummary: profile.professionalSummary,
      avatarUrl: profile.avatarUrl,
      targetRoleTitle: targetRole?.title ?? null,
      educationCount: profile.education?.length ?? 0,
      experienceCount: profile.experiences?.length ?? 0,
      // The skills the candidate has really rated, not the role catalogue.
      ratedSkillCount: Object.keys(skillEvidence).length,
      evidencedSkillCount: Object.values(skillEvidence).filter(
        (record) => record.evidenceSources.length > 0 || record.assessedLevel !== null
      ).length,
      activeProjectCount: projects.filter(
        (project) => isActiveProjectStatus(project.status)
      ).length,
      shippedProjectCount: projects.filter((project) => isShippedStatus(project.status))
        .length,
      certificationCount: profile.certifications?.length ?? 0,
      hasProfessionalLink: Boolean(profile.links?.linkedin || profile.links?.github),
      cvVersionCount: cvVersions?.length ?? 0,
    });

    return {
      overallPercent: result.overallPercent,
      missingItems: result.missingItems.map((item) => ({
        id: item.id,
        label: item.label,
        impactWeight: item.impactWeight,
        targetView: item.targetView,
      })),
    };
  }, [profile, targetRole, skillEvidence, projects, cvVersions]);

  // Real Calculated Career Blockers
  const careerBlockers = useMemo<CareerBlocker[]>(() => {
    const blockers: CareerBlocker[] = [];

    // A candidate with no target role has no role-specific blockers. Asking
    // someone to close the gaps of a role they never chose is exactly the
    // advice the old "Frontend Engineer" default produced.
    const role = targetRole;

    // The skill blockers come from the SAME ranked list the roadmap's first
    // recommended step is drawn from, so "My Career" and the roadmap can never
    // disagree about which skill to close next.
    //
    // The list is derived from the current levels rather than stored, so a
    // skill that now meets the role requirement leaves the blockers the
    // moment it is satisfied — with no "sync" step in between.
    for (const priority of (skillRecalculation?.priorities ?? []).slice(0, 4)) {
      blockers.push({
        id: `blk-skill-${priority.id}`,
        title: `${priority.skillName} is below the ${role?.title ?? 'target role'} requirement`,
        description: priority.why,
        severity:
          priority.priority === 'critical'
            ? 'high'
            : priority.priority === 'high'
              ? 'medium'
              : 'low',
        ctaText:
          priority.action === 'assessment'
            ? 'Take the Diagnostic Check'
            : priority.action === 'project'
              ? 'Build the Project'
              : 'Start Learning',
        ctaView: priority.view === 'assessment' ? 'skills' : priority.view,
      });
    }

    // Check CV alignment. A score belongs to the role its analysis was
    // generated for; showing an old role's score as the current alignment
    // would overstate readiness after a target-role change.
    const latestCv = cvVersions[0];
    const latestAts = latestCv?.atsAnalysis ?? null;
    if (role && latestAts && !isAtsAnalysisForRole(latestCv?.targetRoleTitle, role.title)) {
      blockers.push({
        id: 'blk-cv-stale',
        title: 'CV ATS Analysis Needs a Refresh',
        description: `Your saved ATS score of ${latestAts.overallScore}% was generated for ${
          latestCv?.targetRoleTitle || 'an unrecorded target role'
        }, not ${role.title}. Run a new audit in CV Studio so the score matches your current target.`,
        severity: 'medium',
        ctaText: 'Refresh ATS Analysis',
        ctaView: 'cv-studio'
      });
    } else if (role && latestAts && latestAts.overallScore < 85) {
      blockers.push({
        id: 'blk-cv',
        title: 'CV Optimization Needed for Target Role',
        description: `Your active CV ATS match score for ${role.title} is ${latestAts.overallScore}%. Missing key keywords like ${latestAts.missingKeywords.slice(0, 2).join(', ')}.`,
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
  }, [skillRecalculation, targetRole, cvVersions, bookmarkedJobIds, applications]);
  const [settings, setSettings] = useState<UserSettings>(() => {
    const saved = localStorage.getItem('careerpilot_settings');
    // The defaults are spread UNDER the saved value so a setting added in a
    // later version of the product is present even in a browser that stored
    // an older shape. The resume language is normalised for the same reason:
    // a value written by an earlier build, or by hand, must never leave the
    // studio with a language it cannot render.
    const defaults: UserSettings = {
      language: 'en',
      resumeLanguage: DEFAULT_RESUME_LANGUAGE,
      theme: 'light',
      emailAlerts: true,
      roadmapReminders: true,
      interviewReminders: true,
      weeklyProgressSummary: true,
      allowAiContextLearning: true,
      cvTemplateId: DEFAULT_CV_TEMPLATE_ID,
    };
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<UserSettings>;
        return {
          ...defaults,
          ...parsed,
          resumeLanguage: normalizeResumeLanguage(parsed.resumeLanguage),
          cvTemplateId: normalizeCvTemplateId(parsed.cvTemplateId),
        };
      } catch {}
    }
    return defaults;
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

  // The CV document is a projection of the records, not a second copy of
  // them.
  //
  // `cvSource` is everything the platform knows about the user, in the shape
  // the projection reads. It is rebuilt whenever any of those records change,
  // which is what makes "add a project, and the CV shows it" true without
  // anybody pressing a button.
  const cvSource = useMemo<CvSourceData>(() => {
    const completedCourseItems = learningItems.filter((item) => item.status === 'completed');
    return {
      profile: {
        fullName: profile.name,
        email: profile.email,
        phone: profile.phone ?? '',
        location: profile.location,
        title: profile.headline || profile.currentTitle || '',
        summary: profile.professionalSummary ?? profile.bio ?? '',
      },
      experiences: profile.experiences.map((entry) => ({
        id: entry.id,
        role: entry.role,
        company: entry.company,
        location: entry.location,
        startDate: entry.startDate,
        endDate: entry.endDate,
        isCurrent: entry.isCurrent,
        description: entry.description,
        bullets: entry.achievements,
      })),
      education: profile.education.map((entry) => ({
        id: entry.id,
        institution: entry.institution,
        degree: entry.degree,
        field: entry.field,
        startDate: entry.startDate,
        endDate: entry.endDate,
        isCurrent: entry.current,
        description: entry.coursework?.join(', ') ?? '',
      })),
      projects: projects.map((entry) => ({
        id: entry.id,
        title: entry.title,
        role: entry.goal ?? '',
        link: entry.repositoryUrl ?? undefined,
        technologies: entry.skills,
        bullets: entry.deliverables,
        description: entry.description,
      })),
      volunteering: volunteerExperiences.map((entry) => ({
        id: entry.id,
        organization: entry.organization,
        role: entry.role,
        location: entry.location,
        startDate: entry.startDate,
        endDate: entry.endDate,
        isCurrent: entry.isCurrent,
        description: entry.description,
        achievements: entry.achievements,
        responsibilities: entry.responsibilities,
      })),
      certifications: profile.certifications.map((entry) => ({
        id: entry.id,
        name: entry.name,
        issuer: entry.provider,
        issueDate: entry.issueDate,
        // The description and the skills come from the certificate record, so
        // a change in the profile reaches the CV without anyone retyping it.
        description: entry.description ?? '',
        expiryDate: entry.expiryDate,
        credentialId: entry.credentialId,
        credentialUrl: entry.credentialUrl,
        skills: entry.skills ?? [],
      })),
      courses: completedCourseItems
        .map((item) => {
          const course = learningCatalog.find((entry) => entry.id === item.courseId);
          return course
            ? {
                id: item.id,
                title: course.title,
                provider: course.provider,
                description: item.notes ?? '',
              }
            : null;
        })
        .filter(
          (entry): entry is { id: string; title: string; provider: string; description: string } =>
            entry !== null
        ),
      skills: ownedSkills,
      links: profileLinks.map((link) => ({
        id: link.id,
        kind: link.kind,
        label: link.label,
        url: link.url,
      })),
    };
  }, [
    profile,
    projects,
    volunteerExperiences,
    learningItems,
    learningCatalog,
    ownedSkills,
    profileLinks,
  ]);

  // Keep the document in step with the records.
  //
  // This is the whole of the synchronisation: when a record is created,
  // changed or deleted, the records change, the source is rebuilt, and the
  // document is projected again. There is no polling and no second copy of
  // the data to keep in step — the candidate's own wording survives, because
  // the projection reads it from the document it is replacing.
  //
  // The projection waits for the hydration to finish. Before it has, the
  // records are empty, and projecting them would wipe a document that was
  // restored from a saved version.
  useEffect(() => {
    if (!isHydrated) return;
    setActiveCV((previous) => mergeCanonicalCvDocument(cvSource, previous));
  }, [isHydrated, cvSource]);

  useEffect(() => {
    // Never cache a pre-hydration value: it would be the demo seed.
    if (!isHydrated) return;
    localStorage.setItem('careerpilot_profile', JSON.stringify(profile));
    // The cached role mirrors the database. When the candidate has no role it
    // caches `null` rather than a default, so a stale "Frontend Engineer" can
    // never be resurrected from the cache.
    localStorage.setItem('careerpilot_target_role', JSON.stringify(targetRole));
    localStorage.setItem('careerpilot_skills', JSON.stringify(skills));
    localStorage.setItem('careerpilot_settings', JSON.stringify(settings));
  }, [isHydrated, profile, targetRole, skills, settings]);

  // Compute Career Analysis
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const computeLocalAnalysis = (): CareerAnalysis => {
    const reqSkills = targetRole?.requiredSkills || [];
    let matchScore = 0;
    const strengths: { skill: string; note: string }[] = [];
    const criticalGaps: { skill: string; current: number; target: number; reason: string }[] = [];

    // The gaps are the SAME ones the server computed and the roadmap's first
    // recommended step is drawn from. When the server has answered, its
    // numbers are used verbatim, so the readiness figure on the dashboard, the
    // blockers on "My Career" and the roadmap's opening step can never
    // disagree.
    const priorities = skillRecalculation?.priorities ?? [];

    if (reqSkills.length === 0) {
      matchScore = 80;
    } else if (skillRecalculation?.readinessPct !== null && skillRecalculation?.readinessPct !== undefined) {
      matchScore = skillRecalculation.readinessPct;
    } else {
      // Before the server has answered, the same shared engine is used
      // locally, so the fallback is the same measurement rather than a
      // different one.
      const gaps = computeSkillGaps(
        toRoleSkillRequirements(targetRole ?? { requiredSkills: reqSkills }),
        skills.map((skill) => ({ name: skill.name, level: skill.currentLevel })),
      );
      const summary = summarizeSkillGaps(
        gaps,
        toRoleSkillRequirements(targetRole ?? { requiredSkills: reqSkills }),
      );
      matchScore = summary.readinessPct;

      for (const gap of gaps) {
        if (gap.gap <= 0) {
          strengths.push({
            skill: gap.name,
            note: `Meets the level ${gap.requiredLevel}/5 expectation for ${targetRole?.title ?? 'your target role'}.`,
          });
        } else {
          criticalGaps.push({
            skill: gap.name,
            current: gap.currentLevel,
            target: gap.requiredLevel,
            reason: describeGap(gap),
          });
        }
      }
    }

    // With no target role there is nothing to analyse against. The analysis is
    // empty rather than descriptive of a role the candidate never chose — the
    // platform asks for a role instead of inventing one.
    if (!targetRole) {
      return {
        matchPercentage: 0,
        strengths: [],
        criticalGaps: [],
        missingExperience: [],
        careerRisks: [],
        recommendedProjects: [],
        recommendedLearning: [],
        nextBestAction: {
          title: 'Choose your target role',
          description: 'Pick the role you are aiming at and your plan, roadmap and skill gaps will be built around it.',
          reason: 'Everything on this screen is measured against a target role.',
          actionType: 'task',
        },
      };
    }

    // The ranked list is the authority for "what is missing" and "what next".
    if (priorities.length > 0) {
      criticalGaps.length = 0;
      for (const priority of priorities) {
        criticalGaps.push({
          skill: priority.skillName,
          current: priority.currentLevel,
          target: priority.requiredLevel,
          reason: priority.why,
        });
      }
    }

    const topPriority = priorities[0] ?? null;

    return {
      matchPercentage: matchScore,
      strengths: strengths.slice(0, 4),
      criticalGaps: criticalGaps.slice(0, 5),
      missingExperience: [
        `Demonstrable ${targetRole?.title ?? ''} delivery against ${targetRole.experienceExpectation || 'the role expectation'}`,
        `Evidence in your portfolio that shows the skills below at working level`,
      ],
      careerRisks: [
        `Candidates with verified ${targetRole?.title ?? ''} experience are competing for the same openings`,
        `Skills in this role are expected to keep developing, so continuous practice matters`,
      ],
      recommendedProjects: (targetRole.typicalProjects?.length
        ? targetRole.typicalProjects
        : [`A ${targetRole?.title ?? ''} showcase project`]
      ).slice(0, 2),
      recommendedLearning: (targetRole.learningTopics?.length
        ? targetRole.learningTopics.map(
            (topic) => `Focused study on ${topic} for ${targetRole?.title ?? ''}`,
          )
        : [`Targeted study on ${criticalGaps[0]?.skill || (targetRole?.title ?? '')} fundamentals`]
      ).slice(0, 2),
      nextBestAction: topPriority ? {
        title: `Close the ${topPriority.skillName} gap`,
        description: `Advance from level ${topPriority.currentLevel} to level ${topPriority.requiredLevel} for ${targetRole.title}. About ${topPriority.estimatedHours} hours of focused work.`,
        reason: topPriority.why,
        actionType:
          topPriority.action === 'assessment'
            ? 'task'
            : topPriority.action === 'project'
              ? 'project'
              : 'course',
      } : {
        title: 'Prepare for Upcoming Interviews',
        description: 'Simulate behavioural and role-specific STAR questions to solidify your interview presence.',
        reason: 'Your core technical skill requirements are aligned with market expectations.',
        actionType: 'cv'
      }
    };
  };

  const [analysis, setAnalysis] = useState<CareerAnalysis>(computeLocalAnalysis);

  useEffect(() => {
    setAnalysis(computeLocalAnalysis());
    // The recalculation is part of the input: when the server's ranked gaps
    // arrive, the readiness figure and the "next best action" follow them.
  }, [targetRole, skills, skillRecalculation]);

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
        reason: `Your next roadmap task for ${targetRole?.title ?? ''}.`,
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
      cvAlignment: isAtsAnalysisForRole(
        cvVersions[0]?.targetRoleTitle,
        targetRole?.title ?? ''
      )
        ? cvVersions[0]?.atsAnalysis?.overallScore ?? 0
        : 0,
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
  }, [skills, evidenceItems, roadmapPhases, cvVersions, targetRole?.title ?? '', applications]);

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

  /**
   * Creates an account.
   *
   * The acceptance of the Terms & Conditions and the Privacy Policy travels
   * with the registration itself. Supabase's `signUp` returns no session
   * until the address is confirmed, so a client cannot call the
   * authenticated consent endpoint at that moment; the accepted versions are
   * therefore carried in the user's metadata, and the server turns them into
   * a real consent record the first time the user authenticates. The server
   * checks the versions against the current release, so a stale or forged
   * value simply leaves the platform gated.
   */
  const register = async (
    name: string,
    email: string,
    password: string,
    consent?: { accepted: boolean }
  ) => {
    try {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Authentication is not configured' };
      }
      // The project rejects weak passwords through Supabase Auth's own policy.
      // The same minimum is enforced here so a candidate gets a clear reason
      // instead of a generic failure, and so the rule holds even when the
      // project's leaked-password protection is not available on its plan.
      if (typeof password === 'string' && password.length < 8) {
        return { success: false, error: 'PASSWORD_TOO_SHORT' };
      }
      // The form does not let an account be created without the acceptance,
      // and the metadata is only written when it was actually given.
      const consentAccepted = consent?.accepted === true;
      // A visitor who arrived through somebody else's invitation carries that
      // code into the account, so the server can attribute the signup and
      // grant the inviter their credit. A signup without a code is untouched.
      const referralCode = readStoredReferralCode();
      const { data, error } = await getBrowserSupabase().auth.signUp({
        email,
        password,
        options: {
          // Display name is carried in user metadata; the authoritative id is
          // always auth.users.id (== public.profiles.id).
          data: {
            name,
            ...(referralCode ? { ref: referralCode } : {}),
            ...(consentAccepted
              ? {
                  consent_accepted: true,
                  terms_version: TERMS_VERSION,
                  privacy_version: PRIVACY_VERSION,
                }
              : {}),
          },
          // Send the confirmation link back to the deployed origin instead of
          // relying on the project's dashboard default. This works for the
          // Cloudflare Pages URL, preview deployments and localhost, provided
          // each origin is allowlisted in Supabase Auth → URL Configuration.
          emailRedirectTo: window.location.origin,
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

  /**
   * The referral code that arrived with the invitation.
   *
   * The code is captured from the URL as soon as the application loads, and
   * it is kept until the account exists so the signup can carry it. Once the
   * candidate is authenticated the code is claimed — once — and then
   * forgotten. Neither step can block the signup: a claim that fails is
   * simply not made, and the candidate still gets their account.
   */
  useEffect(() => {
    captureReferralCodeFromUrl();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    void claimStoredReferral().catch(() => {});
  }, [currentUser]);

  // Clears every domain that belongs to the signed-in user. It is called by
  // the explicit logout button AND by the auth listener when the Supabase
  // identity changes (session expiry, forced sign-out, or a different user
  // signing in on the same tab).
  //
  // B.4 finding M-3: the React state was NOT cleared on sign-out, so the next
  // user to sign in on the same tab saw the previous user's profile, roadmap,
  // applications and notifications until hydration finished.
  function resetAuthenticatedState() {
    setProfile({ ...emptyProfile });
    // The target role resets to NOTHING, not to the first catalogue role. A
    // signed-out tab must not leave "Frontend Engineer" behind for the next
    // person who signs in on it.
    setTargetRole(null);
    setExperienceLevelState(null);
    setSavedRoles([]);
    setSkillLevels({});
    setCustomSkills([]);
    setUserSkillRows([]);
    setRoadmapPhases([]);
    setIsEnrolledInRoadmap(false);
    setVolunteerExperiences([]);
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
    setCopilotOpen(false);
    setActiveView('dashboard');
    // The consent state belongs to the session. A different user must not
    // inherit the previous one's answer.
    setConsentState(null);
    setConsentError(null);
    setSubscription(null);
    setCreditBalance(null);
    setIsHydrated(false);
    setPasswordRecovery(false);
  }

  const logout = () => {
    if (isSupabaseConfigured) {
      getBrowserSupabase().auth.signOut().catch(() => {});
    }
    setAuthToken(null);
    setCurrentUser(null);
    authIdentityRef.current = null;
    localStorage.removeItem('careerpilot_token');
    localStorage.removeItem('careerpilot_user');
    resetAuthenticatedState();
  };

  // Completes the password-reset flow. Supabase treats the link as a recovery
  // session, so `updateUser` is allowed without the old password. The modal
  // stays open until the write succeeds, then the user continues normally.
  const completePasswordReset = async (newPassword: string) => {
    if (!isSupabaseConfigured) {
      return { success: false, error: 'Authentication is not configured' };
    }
    if (newPassword.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters' };
    }
    try {
      const { error } = await getBrowserSupabase().auth.updateUser({ password: newPassword });
      if (error) {
        return { success: false, error: error.message || 'Could not update the password' };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Connection failed' };
    }
  };

  const dismissPasswordRecovery = () => {
    setPasswordRecovery(false);
    // Do not leave a recovery/token fragment in the address bar. replaceState
    // avoids a navigation and keeps the app on the current SPA route.
    if (/type=recovery|access_token=/.test(window.location.hash)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  // Target Role Change Handler
  const setPrimaryTargetRole = async (roleId: string): Promise<boolean> => {
    const role = resolveRole(roleId) ?? TARGET_ROLES.find(r => r.id === roleId);
    if (!role) return false;
    // The selection is hierarchical: a domain (level 1) and a specialisation
    // (level 2). The pair is validated here for a fast, clear rejection and
    // again on the server, which is the authority.
    const selection = validateTargetRoleSelection({
      domainId: role.domainId,
      specializationId: role.id,
    });
    if (!selection.ok) return false;
    const previousRole = targetRole;

    // The skill target levels are derived from the role, so they follow the
    // role automatically (B.4 finding M-2 — the levels are no longer a
    // separate local list that has to be rewritten by hand).
    // The user's own levels are untouched.

    // The roadmap is generated on the server from the user's target role and
    // their own skill ratings, then persisted. The plan used to be assembled
    // in this file from a fixed five-phase template that was identical for
    // every career; the server-side generator derives it from the role
    // catalogue and the user's real gaps.
    try {
      // The target role is persisted alongside the roadmap so the server's
      // view of the user's target matches the UI's (B.4 finding M-2).
      //
      // The selection is hierarchical: the domain is level 1 and the
      // specialisation is level 2. Both are sent so the server can validate
      // that the pair is a real domain/role combination — the server is the
      // authority, this is only the fast path.
      await patchProfile({
        targetRoleId: role.id,
        targetRoleDomain: role.domainId,
      });

      // A failure here is a failed step, not a warning: the UI must not show a
      // role whose roadmap was not persisted. The server stages the new tree
      // and only swaps it in after every row is written, so the previous
      // roadmap is still intact when this throws.
      const roadmap = await generatePersonalizedRoadmapApi();
      if (!roadmap) {
        throw new Error('The server did not return the persisted roadmap');
      }

      setTargetRole(role);
      setRoadmapPhases(toRoadmapPhases(roadmap));
      setIsEnrolledInRoadmap(roadmap.isEnrolled);
      // The funnel records that a career was chosen. Only the domain and the
      // level are reported: the role's own identifier is never sent.
      trackEvent('select_career', {
        career_domain: role.domainId,
        level: role.level,
      });
      // Everything that was computed for the old role is now stale.
      void invalidateRoleDependents();
      return true;
    } catch (error) {
      console.error('Failed to persist target role:', error);
      // The profile PATCH may already have succeeded before the roadmap call
      // failed. Put the previous target back so the UI, the server and the
      // roadmap all describe the same role.
      try {
        await patchProfile(
          previousRole
            ? { targetRoleId: previousRole.id, targetRoleDomain: previousRole.domainId }
            : { targetRole: null, targetIndustry: null }
        );
      } catch (rollbackError) {
        console.error('Failed to roll back target role after roadmap failure:', rollbackError);
      }
      return false;
    }
  };

  const regeneratePersonalizedRoadmap = async (): Promise<boolean> => {
    try {
      const roadmap = await generatePersonalizedRoadmapApi();
      if (roadmap) {
        setRoadmapPhases(toRoadmapPhases(roadmap));
        setIsEnrolledInRoadmap(roadmap.isEnrolled);
        return true;
      }
    } catch (error) {
      console.error('Failed to regenerate roadmap:', error);
    }
    return false;
  };

  /**
   * Reads the roadmap back from the server.
   *
   * The server rebuilds the roadmap whenever a skill level changes, so this
   * is how the interface picks up the new tree: a skill that now meets the
   * role requirement has already left the opening steps by the time this
   * resolves.
   */
  const refreshRoadmap = async (): Promise<boolean> => {
    try {
      const roadmap = await fetchRoadmap();
      if (roadmap) {
        setRoadmapPhases(toRoadmapPhases(roadmap));
        setIsEnrolledInRoadmap(roadmap.isEnrolled);
        return true;
      }
    } catch (error) {
      console.error('Failed to refresh the roadmap:', error);
    }
    return false;
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
    // `email` is owned by Supabase Auth, not by the profile row. The account
    // endpoint has already changed it when the UI calls this; mirroring it
    // onto the session user keeps the displayed address in sync instead of
    // silently ignoring the update.
    if (updates.email !== undefined) {
      setCurrentUser(prev => (prev ? { ...prev, email: updates.email! } : prev));
      setProfile(prev => ({ ...prev, email: updates.email! }));
    }

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
    if (updates.onboardingStatus !== undefined) payload.onboardingStatus = updates.onboardingStatus;
    if (updates.onboardingStep !== undefined) payload.onboardingStep = updates.onboardingStep;

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
            onboardingStatus: saved.onboardingStatus,
            onboardingStep: saved.onboardingStep,
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
   * Stores the order of one of the collections that appear on a CV.
   *
   * The order is part of the document, so it lives on the server next to the
   * entries themselves. The local list is put into the order the server
   * actually stored, so a row that was created in another session — and that
   * the client did not know about — keeps its place instead of appearing in
   * a different position than the one the server will show next time.
   */
  const reorderCvCollection = useCallback(
    async (collection: OrderedCollection, ids: string[]): Promise<void> => {
      const stored = await reorderProfileCollection(collection, ids);
      const byId = new Map(stored.map((id, index) => [id, index]));
      const sortByStoredOrder = <T extends { id: string }>(items: T[]): T[] =>
        [...items].sort(
          (left, right) =>
            (byId.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
            (byId.get(right.id) ?? Number.MAX_SAFE_INTEGER)
        );

      if (collection === 'experiences') {
        setProfile((prev) => ({ ...prev, experiences: sortByStoredOrder(prev.experiences) }));
        return;
      }
      if (collection === 'educations') {
        setProfile((prev) => ({ ...prev, education: sortByStoredOrder(prev.education) }));
        return;
      }
      if (collection === 'certifications') {
        setProfile((prev) => ({ ...prev, certifications: sortByStoredOrder(prev.certifications) }));
        return;
      }
      if (collection === 'languages') {
        setProfile((prev) => ({ ...prev, languages: sortByStoredOrder(prev.languages) }));
        return;
      }
      setProjects((prev) => sortByStoredOrder(prev));
    },
    []
  );

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
      throw error;
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
      throw error;
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
          description: entry.description,
          skillNames: entry.skills ?? [],
          attachmentUrl: entry.attachmentUrl,
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
  //
  // The local state is updated only after the server accepts the write, and
  // the error is re-thrown so the onboarding wizard can keep the user on the
  // current step instead of advancing with unsaved data.
  const setCareerState = async (state: CareerState) => {
    try {
      await patchProfile({ userType: state });
      setProfile(prev => ({ ...prev, careerState: state }));
    } catch (error) {
      console.error('Failed to persist career state:', error);
      throw error;
    }
  };

  const setCareerGoal = async (goal: CareerGoal, customText?: string) => {
    try {
      await patchProfile({ careerGoal: goal, customGoalText: customText ?? '' });
      setProfile(prev => ({ ...prev, careerGoal: goal, customGoalText: customText }));
    } catch (error) {
      console.error('Failed to persist career goal:', error);
      throw error;
    }
  };

  /**
   * Saves the experience level on its own.
   *
   * The level is a column of its own, so it does not need the roadmap to be
   * regenerated — but it is written through the same profile endpoint as
   * everything else, so there is still only one path to the database.
   */
  const setExperienceLevel = async (level: ExperienceLevel | null): Promise<void> => {
    const normalized = normalizeExperienceLevel(level);
    if (!normalized.ok) return;
    await patchProfile({ experienceLevel: normalized.value });
    setExperienceLevelState(normalized.value);
  };

  /**
   * Saves the career target — role, experience level and goal — in one write.
   *
   * THE SINGLE WRITER
   * The Profile page and the Settings page both edit the career target. When
   * they each had their own write path, they could disagree: one screen
   * showed a role the other had already replaced, and the platform's own
   * idea of the target lagged behind. Now both screens call this, so there
   * is exactly one path from a change in the interface to the database, and
   * a change made in either place is immediately true in both.
   *
   * A ROLE CHANGE ALSO REFRESHES THE ROADMAP AND THE LEARNING RANKING,
   * because both are derived from the target role. A level or goal change on
   * its own does not move the roadmap, so it does not regenerate one.
   */
  const saveCareerTarget = async (input: {
    roleId?: string | null;
    experienceLevel?: ExperienceLevel | null;
    careerGoal?: CareerGoal | null;
    customGoalText?: string | null;
  }): Promise<boolean> => {
    const roleChanged =
      input.roleId !== undefined && input.roleId !== null && input.roleId !== targetRole?.id;
    const levelChanged =
      input.experienceLevel !== undefined && input.experienceLevel !== experienceLevel;
    const goalChanged =
      (input.careerGoal !== undefined && input.careerGoal !== profile.careerGoal) ||
      (input.customGoalText !== undefined &&
        input.customGoalText !== (profile.customGoalText ?? ''));

    if (!roleChanged && !levelChanged && !goalChanged) return true;

    // The goal is a plain profile field, written through the profile endpoint.
    if (goalChanged) {
      await setCareerGoal(
        (input.careerGoal ?? profile.careerGoal) as CareerGoal,
        input.customGoalText ?? profile.customGoalText ?? ''
      );
    }

    if (levelChanged) {
      const normalized = normalizeExperienceLevel(input.experienceLevel);
      if (!normalized.ok) return false;
      await patchProfile({ experienceLevel: normalized.value });
      setExperienceLevelState(normalized.value);
    }

    if (roleChanged && input.roleId) {
      // The role change owns the roadmap: it is generated on the server from
      // the new role and the candidate's own skill ratings.
      const persisted = await setPrimaryTargetRole(input.roleId);
      if (!persisted) return false;
    }

    return true;
  };

  /**
   * Saves the career identity as one write.
   *
   * THE SINGLE WRITER
   * My Profile and Settings both edit the identity. When they each had their
   * own write path they could disagree, and the change made in one screen was
   * invisible in the other until a reload. Both screens call this, so a
   * change made in either place is immediately true everywhere — the
   * dashboard, the roadmap, My Career and CV Studio all read the derived
   * identity from the same state.
   *
   * The patch uses the identity's own vocabulary; the mapping onto the
   * profile columns lives in one place (`identityPatchToProfilePatch`), so no
   * screen has to remember which column `currentStatus` lives in.
   */
  const saveCareerIdentity = async (patch: {
    currentStatus?: CareerState | null;
    currentRole?: string | null;
    careerGoal?: CareerGoal | null;
    experienceLevel?: ExperienceLevel | null;
    educationStatus?: EducationStatus | null;
    expectedGraduationYear?: number | null;
    targetOpportunityType?: TargetOpportunityType | null;
    professionalHeadline?: string | null;
  }): Promise<boolean> => {
    try {
      const updates: Record<string, unknown> = {};

      if (patch.currentStatus !== undefined) {
        updates.userType = patch.currentStatus;
      }
      if (patch.currentRole !== undefined) {
        updates.currentTitle = patch.currentRole ?? '';
      }
      if (patch.careerGoal !== undefined) {
        updates.careerGoal = patch.careerGoal;
      }
      if (patch.experienceLevel !== undefined) {
        const normalized = normalizeExperienceLevel(patch.experienceLevel);
        if (!normalized.ok) return false;
        updates.experienceLevel = normalized.value;
      }
      if (patch.educationStatus !== undefined) {
        updates.educationStatus = patch.educationStatus;
      }
      if (patch.expectedGraduationYear !== undefined) {
        updates.expectedGraduationYear = patch.expectedGraduationYear;
        // A future graduation year means the candidate is still studying. The
        // server enforces the same rule; applying it here keeps the screen in
        // step even before the profile is read back.
        if (
          typeof patch.expectedGraduationYear === 'number' &&
          patch.expectedGraduationYear > new Date().getFullYear()
        ) {
          updates.educationStatus = 'currently_studying';
        }
      }
      if (patch.targetOpportunityType !== undefined) {
        updates.targetOpportunityType = patch.targetOpportunityType;
      }
      if (patch.professionalHeadline !== undefined) {
        updates.headline = patch.professionalHeadline ?? '';
      }

      if (Object.keys(updates).length === 0) return true;

      await patchProfile(updates as Partial<ProfileDTO>);

      // The local state is only updated AFTER the server accepts the write,
      // so the identity shown is the identity stored.
      setProfile((prev) => ({
        ...prev,
        careerState:
          patch.currentStatus !== undefined ? patch.currentStatus : prev.careerState,
        currentTitle:
          patch.currentRole !== undefined
            ? (patch.currentRole ?? '')
            : prev.currentTitle,
        careerGoal: patch.careerGoal !== undefined ? patch.careerGoal : prev.careerGoal,
        educationStatus:
          updates.educationStatus !== undefined
            ? (updates.educationStatus as EducationStatus)
            : prev.educationStatus,
        expectedGraduationYear:
          patch.expectedGraduationYear !== undefined
            ? patch.expectedGraduationYear
            : prev.expectedGraduationYear,
        targetOpportunityType:
          patch.targetOpportunityType !== undefined
            ? patch.targetOpportunityType
            : prev.targetOpportunityType,
        professionalHeadline:
          patch.professionalHeadline !== undefined
            ? patch.professionalHeadline
            : prev.headline,
      }));

      if (patch.experienceLevel !== undefined) {
        const normalized = normalizeExperienceLevel(patch.experienceLevel);
        if (normalized.ok) setExperienceLevelState(normalized.value ?? null);
      }

      return true;
    } catch (error) {
      console.error('Failed to persist the career identity:', error);
      throw error;
    }
  };

  const completeOnboarding = async () => {
    try {
      // The status is the authoritative field; the legacy boolean is kept in
      // step by the server when the status is written.
      await patchProfile({ onboardingCompleted: true, onboardingStatus: 'completed' });
      setProfile(prev => ({
        ...prev,
        onboardingCompleted: true,
        onboardingStatus: 'completed',
      }));
    } catch (error) {
      console.error('Failed to persist onboarding completion:', error);
      throw error;
    }
  };

  // ---- Skills ----
  //
  // Skill levels are persisted per user in public.user_skills through
  // /api/user-skills. The local state is only updated AFTER the server
  // confirms the write, so the level the UI shows is the level that is stored
  // (B.3.9, finding H-2).
  //
  // Every write is followed by a RECALCULATION. The server rebuilds the
  // roadmap and recomputes the gap summary as part of answering, so a skill
  // that now meets the role requirement leaves the blockers and the roadmap's
  // opening steps on its own — there is no "Sync With Profile" step the user
  // has to remember. The manual control is kept as a secondary fallback.
  const updateSkillLevel = async (skillId: string, currentLevel: number) => {
    const skill = skills.find(s => s.id === skillId);
    if (!skill) return;
    try {
      const { skill: stored, recalculation } = await postUserSkill({
        name: skill.name,
        proficiency: currentLevel,
        category: skill.category,
      });
      applyStoredSkill(stored);
      applyRecalculation(recalculation);
    } catch (error) {
      console.error('Failed to persist skill level:', error);
    }
  };

  /**
   * Stores the result of a diagnostic knowledge check.
   *
   * The measurement is kept BESIDE the candidate's self-report rather than on
   * top of it: the effective level becomes the stronger of the two, so a
   * finished check closes a gap immediately without erasing what the
   * candidate said about themselves.
   *
   * Returns true when the result was stored, so the interface can report
   * exactly what changed across the platform.
   */
  const recordSkillAssessment = async (input: {
    name: string;
    level: number;
    score: number;
    category?: string;
  }): Promise<boolean> => {
    try {
      const { skill: stored, recalculation, evidence } = await postSkillAssessment({
        name: input.name,
        level: input.level,
        score: input.score,
        category: input.category,
      });
      applyStoredSkill(stored);
      applyRecalculation(recalculation);
      if (evidence) {
        const mapped = toEvidenceItem(evidence);
        setEvidenceItems((prev) => [
          mapped,
          ...prev.filter((item) => item.id !== mapped.id),
        ]);
      }
      void logActivity({
        actionType: 'acquired_skill',
        title: 'Completed Skill Assessment',
        subtitle: `${input.name} (${input.score}%)`,
        linkView: 'assessment',
      });
      return true;
    } catch (error) {
      console.error('Failed to record the skill assessment:', error);
      return false;
    }
  };

  /**
   * Asks the server to rebuild the roadmap and the gap summary.
   *
   * This is the secondary, explicit re-sync control. The automatic path runs
   * on every write; this one exists so a user can be certain the projection
   * matches the source, and so the fallback button has something to do.
   */
  const resyncSkillDependents = async (): Promise<SkillRecalculationDTO | null> => {
    try {
      const recalculation = await requestSkillRecalculation();
      applyRecalculation(recalculation);
      return recalculation;
    } catch (error) {
      console.error('Failed to re-sync the skill dependents:', error);
      return null;
    }
  };

  /**
   * Folds one stored skill back into the local evidence map.
   *
   * The server is the authority on what was written, so the local state
   * takes the server's answer rather than assuming what it sent.
   */
  const applyStoredSkill = (stored: {
    name: string;
    category: string;
    selfReportedLevel: number | null;
    assessedLevel: number | null;
    assessmentScore: number | null;
    assessmentAt: string | null;
    evidenceSources: string[];
  }) => {
    if (!stored?.name) return;
    const key = stored.name.toLowerCase();
    setSkillEvidence(prev => ({
      ...prev,
      [key]: buildSkillRecord({
        name: stored.name,
        category: stored.category,
        selfReportedLevel: stored.selfReportedLevel,
        assessedLevel: stored.assessedLevel,
        assessmentScore: stored.assessmentScore,
        assessmentAt: stored.assessmentAt,
        evidenceSources: stored.evidenceSources,
      }),
    }));
    if (stored.selfReportedLevel !== null) {
      const selfReported = stored.selfReportedLevel;
      setSkillLevels(prev => ({ ...prev, [key]: selfReported }));
    }
  };

  /**
   * Folds the recalculation into the local state.
   *
   * The roadmap is refetched so a satisfied skill leaves its opening steps
   * immediately; the summary is stored so the readiness figure, the blockers
   * and the "is this out of date?" indicator all read the same numbers.
   */
  const applyRecalculation = (recalculation: SkillRecalculationDTO | null) => {
    if (!recalculation) return;
    setSkillRecalculation(recalculation);
    if (recalculation.roadmapRegenerated) {
      void refreshRoadmap();
    }
  };

  const addCustomSkill = async (skill: Omit<UserSkill, 'id' | 'gap' | 'lastUpdated'>) => {
    const cleanedName = skill.name.trim();
    if (!cleanedName || isSkillSectionHeader(cleanedName)) {
      throw new Error('Please enter an individual skill rather than a category header.');
    }
    const newSkill: UserSkill = {
      ...skill,
      name: cleanedName,
      id: `sk-custom-${Date.now()}`,
      gap: Math.max(0, skill.targetLevel - skill.currentLevel),
      lastUpdated: new Date().toISOString().split('T')[0]
    };
    try {
      const { skill: stored, recalculation } = await postUserSkill({
        name: newSkill.name,
        proficiency: newSkill.currentLevel,
        category: newSkill.category,
      });
      applyStoredSkill(stored);
      applyRecalculation(recalculation);
    } catch (error) {
      // B.4 finding L-4: the skill was added to the local list even when the
      // server refused the write, so the UI showed a skill that was not
      // persisted. The local state is now only updated after the write
      // succeeds.
      console.error('Failed to persist skill:', error);
      throw error;
    }
    const normalizedNew = normalizeSkillKey(newSkill.name);
    setCustomSkills(prev => {
      const filtered = prev.filter((item) => normalizeSkillKey(item.name) !== normalizedNew);
      return [...filtered, newSkill];
    });
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

  const refreshAiAnalysis = async (signal?: AbortSignal) => {
    setIsAnalyzing(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(apiUrl('/api/analyze-career'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          targetRole,
          userSkills: skills,
          careerState: profile.careerState,
          language: aiPreferences.preferredLanguage,
        }),
        signal,
      });
      if (signal?.aborted) return;
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
      if (e instanceof DOMException && e.name === 'AbortError') return;
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
      // The funnel records that a roadmap was started. The domain is a
      // catalogue value, not a personal one, so it is safe to report.
      trackEvent('roadmap_enroll', {
        career_domain: targetRole?.domainId,
        level: targetRole?.level,
      });
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
    // The Privacy Center switch is the user's consent to send career-graph
    // context to Gemini. Deterministic recommendations still run with AI off.
    const aiBlockedByPrivacy =
      preferences.ai === true && !privacyPreferences.shareAnalyticsWithAi;
    const effectivePreferences = aiBlockedByPrivacy
      ? { ...preferences, ai: false }
      : preferences;

    setIsLearningLoading(true);
    try {
      const result = await fetchLearningRecommendations({
        // The explanation language follows the explicit AI response language,
        // not the interface language. A caller may still override it.
        aiLanguage: preferences.aiLanguage ?? aiPreferences.preferredLanguage,
        ...effectivePreferences,
      });
      setLearningRecommendations(result.recommendations ?? []);
      setLearningRecommendationMeta((prev) => ({
        ...prev,
        aiUsed: result.aiUsed,
        aiFallbackReason: aiBlockedByPrivacy
          ? 'AI grounding is disabled in Settings.'
          : result.aiFallbackReason,
        generatedAt: result.generatedAt,
        targetRoleTitle: result.context?.targetRoleTitle ?? prev.targetRoleTitle,
        weeklyHours: result.context?.weeklyHours ?? prev.weeklyHours,
        budget: result.context?.budget ?? prev.budget,
        preferredFormat: result.context?.preferredFormat ?? prev.preferredFormat,
        skillGapCount: result.context?.skillGapCount ?? prev.skillGapCount,
        roadmapSkillCount: result.context?.roadmapSkillCount ?? prev.roadmapSkillCount,
      }));
      setLearningError(null);

      // The balance the server reports after the operation is the balance the
      // ledger holds, so the badge is corrected straight away rather than on
      // the next visit. The request reads the balance again as a safety net
      // for a server that did not report one.
      if (typeof result.creditBalance === 'number') {
        setCreditBalance((previous) =>
          previous ? { ...previous, balance: result.creditBalance as number } : previous
        );
      } else {
        void refreshCredits();
      }
    } catch (error) {
      setLearningError(error instanceof Error ? error.message : 'Failed to load recommendations');
    } finally {
      setIsLearningLoading(false);
    }
  };

  const getLearningItem = (courseId: string) =>
    learningItems.find((item) => item.courseId === courseId);

  /**
   * Refreshes everything that was computed for the PREVIOUS target role.
   *
   * Most of the platform derives itself from `targetRole`, so a role change
   * reaches those screens for free. Two things do not: the Learning Hub's
   * ranking, which was built for the old role's skill gaps, and the cached
   * role title the recommendation panel shows. Both are refreshed here, with
   * AI OFF — the deterministic ranking is what the panel needs, and asking
   * the model for an explanation of a role the candidate just changed would
   * spend a token for nothing.
   *
   * It lives below `refreshLearningRecommendations` because it calls it, and
   * a `const` arrow function is not hoisted.
   */
  const invalidateRoleDependents = async (): Promise<void> => {
    setLearningRecommendations([]);
    setLearningRecommendationMeta((prev) => ({
      ...prev,
      aiUsed: false,
      aiFallbackReason: null,
      generatedAt: null,
      targetRoleTitle: null,
      skillGapCount: 0,
      roadmapSkillCount: 0,
    }));
    try {
      await refreshLearningRecommendations({ ai: false });
    } catch {
      // The refresh is best-effort: a failure here must not undo the role
      // change the candidate just made and confirmed.
    }
  };

  /**
   * Re-reads the candidate's profile links.
   *
   * Adding, editing or removing a link is a change to the profile, not just
   * to this CV. Updating `profileLinks` rebuilds `cvSource`, which re-projects
   * the document and preserves the order and on/off switches the candidate
   * chose for this CV.
   */
  const refreshProfileLinks = useCallback(async (): Promise<ProfileLinkDTO[]> => {
    const links = await fetchProfileLinks();
    setProfileLinks(links);
    return links;
  }, []);

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
      // The funnel records the two milestones of the learning journey: a
      // resource that was started and a resource that was finished. Only the
      // catalogue category is reported — never the course's identity, the
      // user's progress or the reason for the recommendation.
      if (status === 'in_progress' || status === 'completed') {
        const course = learningCatalog.find((entry) => entry.id === courseId);
        trackEvent(status === 'completed' ? 'learning_complete' : 'learning_start', {
          learning_category: course?.category ?? 'unknown',
          level: course?.level ?? undefined,
        });
      }
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
        category: project.category,
        role: project.role,
        responsibilities: project.responsibilities,
        startDate: project.startDate,
        isFeatured: project.isFeatured,
        includeInPortfolio: project.includeInPortfolio,
        thumbnailUrl: project.thumbnailUrl,
        screenshots: project.screenshots,
      });
      setProjects(prev => [toCareerProject(dto), ...prev]);
      // The funnel records that a project was started. The project's title and
      // its links are never reported — only the domain it belongs to.
      trackEvent('project_start', {
        career_domain: targetRole?.domainId,
        level: project.difficulty ?? undefined,
      });
      void logActivity({
        actionType: 'added_project',
        title: 'Added Project',
        subtitle: project.title,
        linkView: 'projects'
      });
    } catch (error) {
      console.error('Failed to create project:', error);
      throw error;
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
        category: updates.category,
        role: updates.role,
        responsibilities: updates.responsibilities,
        startDate: updates.startDate,
        isFeatured: updates.isFeatured,
        includeInPortfolio: updates.includeInPortfolio,
        thumbnailUrl: updates.thumbnailUrl,
        screenshots: updates.screenshots,
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

  // ---- Volunteer experience ----
  //
  // A volunteer stint is its own domain. It is NOT written into the
  // employment timeline, so it never shows up in the CV builder.

  const addVolunteerExperience = async (
    input: Omit<VolunteerExperience, 'id' | 'createdAt' | 'updatedAt'>
  ) => {
    const dto = await postVolunteerExperience({
      organization: input.organization,
      role: input.role,
      location: input.location || undefined,
      startDate: input.startDate || undefined,
      endDate: input.endDate || undefined,
      isCurrent: input.isCurrent,
      description: input.description || undefined,
      responsibilities: input.responsibilities,
      achievements: input.achievements,
      skills: input.skills,
      projectIds: input.projectIds,
    });
    setVolunteerExperiences(prev => [toVolunteerExperience(dto), ...prev]);
    return toVolunteerExperience(dto);
  };

  const updateVolunteerExperience = async (
    id: string,
    updates: Partial<VolunteerExperience>
  ) => {
    const dto = await patchVolunteerExperience(id, {
      organization: updates.organization,
      role: updates.role,
      location: updates.location,
      startDate: updates.startDate,
      endDate: updates.endDate,
      isCurrent: updates.isCurrent,
      description: updates.description,
      responsibilities: updates.responsibilities,
      achievements: updates.achievements,
      skills: updates.skills,
      projectIds: updates.projectIds,
    });
    setVolunteerExperiences(prev =>
      prev.map((item) => (item.id === id ? toVolunteerExperience(dto) : item))
    );
    return toVolunteerExperience(dto);
  };

  const deleteVolunteerExperience = async (id: string) => {
    await deleteVolunteerExperienceApi(id);
    setVolunteerExperiences(prev => prev.filter((item) => item.id !== id));
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

  const deleteEvidence = async (evidenceId: string) => {
    try {
      await deleteEvidenceApi(evidenceId);
      setEvidenceItems(prev => prev.filter(e => e.id !== evidenceId));
    } catch (error) {
      console.error('Failed to delete evidence:', error);
    }
  };

  /**
   * The CV header is written to the profile, and the field is edited a
   * character at a time. The write is therefore held back until the typing
   * pauses, so a name is one request rather than one per keystroke.
   */
  const cvProfileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cvProfilePending = useRef<Partial<UserProfile>>({});

  const flushCvProfile = useCallback(() => {
    cvProfileTimer.current = null;
    const pending = cvProfilePending.current;
    cvProfilePending.current = {};
    if (Object.keys(pending).length === 0) return;
    // The document already shows the change. If the profile write fails, the
    // next projection puts the old value back rather than leaving the
    // document claiming something the server never accepted.
    void updateProfile(pending).catch((error) => {
      console.error('Failed to persist the CV header:', error);
    });
  }, [updateProfile]);

  const queueCvProfileUpdate = useCallback(
    (updates: Partial<UserProfile>) => {
      cvProfilePending.current = { ...cvProfilePending.current, ...updates };
      if (cvProfileTimer.current) clearTimeout(cvProfileTimer.current);
      cvProfileTimer.current = setTimeout(flushCvProfile, 700);
    },
    [flushCvProfile]
  );

  // A pending header edit is not lost because the studio was closed.
  useEffect(
    () => () => {
      if (cvProfileTimer.current) {
        clearTimeout(cvProfileTimer.current);
        flushCvProfile();
      }
    },
    [flushCvProfile]
  );

  /**
   * The editor writes to the document.
   *
   * The header is a fact about the candidate, so it is written to the PROFILE
   * rather than to the document: the profile is where the name, the headline,
   * the phone number, the location and the address live, and the document
   * reads them back out through the projection. The change is applied to the
   * document straight away so the field does not lag behind the keyboard, and
   * the profile is updated underneath it.
   *
   * Everything else the editor writes — the summary, the bullets, the order
   * of the links, the skills taken off this CV — is the candidate's wording
   * for this document, and stays in the document.
   */
  const updateCV = (updates: Partial<CVProfile>) => {
    const profileUpdates: Partial<UserProfile> = {};
    if (updates.fullName !== undefined) profileUpdates.name = updates.fullName;
    if (updates.title !== undefined) profileUpdates.headline = updates.title;
    if (updates.phone !== undefined) profileUpdates.phone = updates.phone;
    if (updates.location !== undefined) profileUpdates.location = updates.location;
    if (updates.email !== undefined) profileUpdates.email = updates.email;

    setActiveCV((previous) => {
      const next: CVProfile = { ...previous, ...updates };
      // A skill taken off this CV is remembered here, so the projection does
      // not put it back. Taking a skill off a CV is a decision about this CV
      // only — it does not mean the candidate does not have the skill.
      if (updates.skillsList !== undefined) {
        const kept = new Set(updates.skillsList);
        const removed = previous.skillsList.filter((name) => !kept.has(name));
        if (removed.length > 0) {
          next.hiddenSkills = [...new Set([...(previous.hiddenSkills ?? []), ...removed])];
        }
      }
      return next;
    });

    if (Object.keys(profileUpdates).length > 0) {
      queueCvProfileUpdate(profileUpdates);
    }
  };

  /**
   * Fills the editor from the records the platform already holds.
   *
   * The document is a projection of the records, so it is already filled from
   * them. This button remains for the one thing a projection cannot do on its
   * own: bring back the skills the candidate took off this particular CV, and
   * put every record the platform holds back in front of them.
   *
   * The merge is one-directional in the other sense too: anything the
   * candidate has already written is kept, and only the gaps are filled. Their
   * words are never replaced by the platform's.
   */
  const loadCVFromMyData = () => {
    setActiveCV((previous) =>
      mergeCanonicalCvDocument(cvSource, { ...previous, hiddenSkills: [] })
    );
  };

  const saveCVVersion = async (name: string, profileSnapshot?: CVProfile): Promise<CVVersion> => {
    try {
      // A version belongs to a CV. A user who has never created one still
      // gets a snapshot: the CV row is created first, and its REAL id is
      // used. Posting against an empty cvId was rejected with 400.
      let cvId = activeCvId;
      if (!cvId) {
        const created = await postCv({ name, targetRoleTitle: targetRole?.title ?? '' });
        cvId = created.id;
        setActiveCvId(created.id);
      }
      const dto = await postCvVersion({
        cvId,
        name,
        targetRoleTitle: targetRole?.title ?? '',
        profileJson: profileSnapshot ?? activeCV,
        atsAnalysis: cvVersions[0]?.atsAnalysis,
      });
      const savedVersion = toCVVersion(dto);
      setCvVersions(prev => [savedVersion, ...prev]);
      return savedVersion;
    } catch (error) {
      console.error('Failed to save CV version:', error);
      throw error;
    }
  };

  /**
   * Puts a reviewed CV into the studio.
   *
   * The document is set as the studio's document and shown as a version. The
   * version is what makes it durable: the studio's document is a projection
   * of the platform's records, and the sections a CV carries that the
   * platform has no record type for — an internship, an award, a
   * publication — live in the version and nowhere else.
   */
  const applyReviewedCv = (options: {
    cv: CVProfile;
    versionName?: string;
    targetRoleTitle?: string;
    cvId?: string;
    cvVersionId?: string;
  }) => {
    const { cv, versionName, targetRoleTitle, cvId, cvVersionId } = options;
    setActiveCV(cv);
    if (cvId) setActiveCvId(cvId);
    const newVersion: CVVersion = {
      id: cvVersionId ?? `cv-v-${Date.now()}`,
      cvId,
      name: versionName ?? 'Reviewed CV',
      targetRoleTitle: targetRoleTitle ?? targetRole?.title ?? '',
      createdAt: new Date().toISOString().split('T')[0],
      profile: cv,
    };
    setCvVersions((previous) => [
      newVersion,
      ...previous.filter((entry) => entry.id !== newVersion.id),
    ]);
  };

  const runAiCvOptimization = async (options?: {
    signal?: AbortSignal;
    setPhase?: (stage: string, cancellable?: boolean) => void;
  }) => {
    setIsOptimizingCV(true);
    setCvAnalysisError(null);
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
      const res = await fetch(apiUrl('/api/optimize-cv'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          cvText,
          targetRoleTitle: targetRole?.title ?? '',
          targetRoleSkills: (targetRole?.requiredSkills ?? []).map(s => s.name),
          language: aiPreferences.preferredLanguage
        }),
        signal: options?.signal,
      });

      if (!res.ok) {
        // Never attach an invented ATS result to the user's CV version, and
        // never leave the provider's reason (quota, outage) only in the
        // console. The review UI shows this object verbatim.
        const data = await res.json().catch(() => ({}));
        const failure = parseAtsAnalysisFailure(data, res.status);
        setCvAnalysisError(failure);
        console.error('CV analysis unavailable:', failure.code ?? res.status);
        return;
      }

      const result = await res.json();
      const latest = cvVersions[0];

      // The audit is saved to a real CV version from here on. The write cannot
      // be abandoned halfway, so the request is no longer cancellable and the
      // interface says so instead of pretending the save can be stopped.
      options?.setPhase?.(t('Saving the analysis to this CV…'), false);

      // Persist the result against a real version so a reload cannot bring
      // back an older analysis for a different role. If persistence fails the
      // generated result is still shown, with an explicit warning.
      let persisted: CVVersion | null = null;
      try {
        if (latest && isPersistedId(latest.id)) {
          const dto = await patchCvVersion(latest.id, {
            atsAnalysis: result,
            targetRoleTitle: targetRole?.title ?? '',
          });
          persisted = toCVVersion(dto);
        } else {
          let cvId = activeCvId;
          if (!isPersistedId(cvId)) {
            const created = await postCv({
              name: latest?.name || 'Current CV',
              targetRoleTitle: targetRole?.title ?? '',
            });
            cvId = created.id;
            setActiveCvId(created.id);
          }
          const dto = await postCvVersion({
            cvId,
            name: latest?.name || 'Current CV',
            targetRoleTitle: targetRole?.title ?? '',
            profileJson: latest?.profile ?? activeCV,
            atsAnalysis: result,
          });
          persisted = toCVVersion(dto);
        }
      } catch (error) {
        console.error('Failed to save CV analysis:', error);
        setCvAnalysisError({
          message:
            'The ATS analysis was generated, but it could not be saved to this CV version. It will disappear after a reload.',
          code: 'analysis_not_saved',
          retryAfterSeconds: null,
        });
      }

      setCvVersions(prev => {
        const updated = [...prev];
        if (persisted) {
          const index = updated.findIndex(v => v.id === persisted!.id);
          if (index >= 0) updated[index] = persisted!;
          else updated.unshift(persisted!);
        } else if (updated[0]) {
          // The local fallback still records the role the score belongs to,
          // so the label can never silently follow a later target-role change.
          updated[0] = {
            ...updated[0],
            atsAnalysis: result,
            targetRoleTitle: targetRole?.title ?? '',
          };
        } else {
          updated.unshift({
            id: `cv-v-${Date.now()}`,
            name: 'Current CV',
            targetRoleTitle: targetRole?.title ?? '',
            createdAt: new Date().toISOString().split('T')[0],
            profile: activeCV,
            atsAnalysis: result,
          });
        }
        return updated;
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      console.error('Failed to optimize CV:', e);
      setCvAnalysisError({
        message:
          'We could not reach the ATS audit service. Check your connection and try again.',
        code: 'network_error',
        retryAfterSeconds: null,
      });
    } finally {
      setIsOptimizingCV(false);
    }
  };

  /**
   * Records an application.
   *
   * The result says whether the record was actually written. A caller that
   * shows the user a confirmation must use it: the interface must never claim
   * an application the database does not have.
   */
  const addApplication = async (
    application: Omit<JobApplication, 'id' | 'lastUpdated'>
  ): Promise<boolean> => {
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
        // The id makes this one action for this one application. A retry
        // lands on the same activity row; a second application to the same
        // company is a different event.
        relatedObject: dto.id,
        linkView: 'applications',
      });
      return true;
    } catch (error) {
      console.error('Failed to create job application:', error);
      return false;
    }
  };

  /**
   * Moves an application to a new stage.
   *
   * The change is not only written to the application: it is recorded in the
   * activity feed and reported to the candidate, so "My Career", "Progress"
   * and "Recent Activity" all tell the same story about where the
   * application stands.
   */
  const updateApplicationStage = async (id: string, stage: ApplicationStage) => {
    const application = applications.find((entry) => entry.id === id);
    const previousStage = application?.stage;
    try {
      const dto = await patchJobApplication(id, { stage });
      setApplications(prev => prev.map(a => (a.id === id ? toJobApplication(dto) : a)));

      // A move that changes nothing is not an event worth reporting.
      if (!application || previousStage === stage) return;

      void logActivity({
        actionType: 'applied_job',
        title: `Application moved to ${stage}`,
        subtitle: `${application.role} at ${application.company}`,
        // Scoped to this application, so two applications at the same
        // company can both reach the same stage.
        relatedObject: application.id,
        linkView: 'applications',
      });
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
      // The caller decides how to tell the candidate. The session really was
      // not saved, so the failure is reported instead of being swallowed.
      throw error;
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

    if (!aiPreferences.recommendationsEnabled || !privacyPreferences.shareAnalyticsWithAi) {
      setCopilotMessages(prev => [
        ...prev,
        {
          id: `msg-${Date.now() + 1}`,
          sender: 'assistant',
          text: 'AI recommendations are turned off in Settings. Enable AI Recommendations and Career Graph AI Grounding to use Copilot.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      return;
    }

    setIsCopilotTyping(true);

    try {
      // The server reads the user's career graph from the database for the
      // verified user id, so only the prompt and the active view travel from
      // the browser. Sending the whole context used to mean the assistant was
      // reasoning about unverified client data.
      const token = await getAccessToken();
      const res = await fetch(apiUrl('/api/copilot'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          userPrompt: text,
          context: { activeView },
          language: aiPreferences.preferredLanguage,
        })
      });

      if (res.ok) {
        const data = await res.json();
        const assistantMsg: CopilotMessage = {
          id: `msg-${Date.now() + 1}`,
          sender: 'assistant',
          text: data.text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          suggestions: data.suggestions,
          proposedAction: aiPreferences.proactiveSuggestions ? data.proposedAction : undefined
        };
        setCopilotMessages(prev => [...prev, assistantMsg]);
        if (data.proposedAction && aiPreferences.proactiveSuggestions) {
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

  const confirmAiAction = async (actionId: string, accept: boolean) => {
    if (!pendingAiAction || pendingAiAction.id !== actionId) return;

    if (accept) {
      // Execute the proposed action safely
      if (pendingAiAction.type === 'update_task' || pendingAiAction.type === 'add_skill') {
        // The server proposes a real skill name from the user's actual gap
        // list. If it did not supply one, nothing is created: writing a
        // placeholder skill would pollute the user's skill graph.
        const proposedSkill = pendingAiAction.payload?.skill;
        if (!proposedSkill || !proposedSkill.trim()) {
          setCopilotMessages(prev => [
            ...prev,
            {
              id: `msg-${Date.now() + 1}`,
              sender: 'assistant',
              text: 'That action did not name a specific skill, so nothing was added. Ask the assistant to name the skill you should work on.',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
          setPendingAiAction(null);
          return;
        }
        const skillName = proposedSkill.trim();
        try {
          await addCustomSkill({
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
              type: 'achievement',
              read: false,
              timestamp: 'Just now'
            },
            ...prev
          ]);
        } catch (error) {
          // The write failed: report it instead of showing a success toast
          // for work that did not happen.
          console.error('Failed to add the AI-proposed skill:', error);
          setCopilotMessages(prev => [
            ...prev,
            {
              id: `msg-${Date.now() + 1}`,
              sender: 'assistant',
              text: `Could not add "${skillName}" to your skills. Nothing was changed; please try again.`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
        }
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

  const markAllNotificationsRead = async () => {
    try {
      const refreshed = await markAllNotificationsReadApi();
      setNotifications(refreshed.map(toUserNotification));
    } catch (error) {
      console.error('Failed to mark all notifications read:', error);
    }
  };

  const recordNotificationClick = async (id: string): Promise<string | null> => {
    try {
      const linkView = await recordNotificationClickApi(id);
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === id
            ? { ...notification, clicked: true, read: true }
            : notification
        )
      );
      return linkView;
    } catch (error) {
      console.error('Failed to record notification click:', error);
      return null;
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
    // The theme, the interface language and the resume language belong to the
    // ACCOUNT, so they follow the user to another device. The remaining
    // settings (the reminder toggles, the AI personalisation controls) are
    // per-device UI preferences and deliberately stay in local state.
    const accountOwned: Partial<PreferencesDTO> = {};
    if (updates.theme !== undefined) accountOwned.theme = updates.theme;
    if (updates.language !== undefined) accountOwned.language = updates.language;
    // The resume language is written separately from the interface language
    // so that changing one can never move the other.
    if (updates.resumeLanguage !== undefined) {
      accountOwned.resumeLanguage = normalizeResumeLanguage(updates.resumeLanguage);
    }
    // The chosen template belongs to the account too. The server validates
    // the id and, when premium enforcement is on, the entitlement.
    if (updates.cvTemplateId !== undefined) {
      accountOwned.cvTemplateId = normalizeCvTemplateId(updates.cvTemplateId);
    }
    // Only an account can own a preference. A visitor who is browsing the
    // landing page before signing up still gets the change immediately — the
    // local state above is updated either way — but there is no account to
    // persist it to, so no request is made. Sending one would only produce
    // an authentication error in the console for a change that already
    // worked.
    if (Object.keys(accountOwned).length > 0 && currentUser) {
      void patchPreferences(accountOwned).catch((error) => {
        console.error('Failed to persist account settings:', error);
      });
    }
  };

  /**
   * Translates a string for the current interface language.
   *
   * Two kinds of key are accepted:
   *
   *   - a legacy catalogue key, e.g. `t('navRoadmap')`;
   *   - the English source text itself, e.g. `t('Your roadmap')`, which is
   *     looked up in the Arabic source-string catalogue.
   *
   * Anything that has no Arabic entry falls back to the English source, so a
   * missing translation degrades to English rather than to a broken label.
   */
  const t = (key: string): string => {
    const lang = settings.language;
    const legacy = (translations[lang] as Record<string, string> | undefined)?.[key];
    if (legacy) return legacy;
    const english = (translations.en as Record<string, string>)[key];
    if (english) return english;
    return translate(key, lang);
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
      'careerpilot_ai_preferences',
      'careerpilot_notification_preferences',
      'careerpilot_privacy_preferences',
      'careerpilot_token',
      'careerpilot_user',
    ]) {
      localStorage.removeItem(key);
    }
    window.location.reload();
  };

  /**
   * The candidate's identity, resolved once.
   *
   * It is recomputed whenever the profile's name, the preferred name or the
   * auth account changes, which is what makes an edit in Profile show up in
   * the topbar, the sidebar and the Dashboard immediately — without a reload.
   */
  const identity = useMemo(
    () =>
      resolveIdentity({
        name: profile.name,
        preferredName: profile.preferredName,
        accountName: currentUser?.name ?? null,
      }),
    [profile.name, profile.preferredName, currentUser?.name]
  );

  const careerContext: CareerContextSummary = useMemo(() => ({
    profile,
    careerGoal: profile.careerGoal,
    targetRole,
    skills,
    skillGaps: analysis.criticalGaps.map(g => g.skill),
    experience: profile.experiences,
    education: profile.education,
    projects,
    evidence: evidenceItems,
    roadmap: roadmapPhases,
    learningProgress: learningItems,
    preferences: {
      aiPreferences,
      notificationPreferences,
      privacyPreferences,
    },
    cv: activeCV,
    applications,
  }), [
    profile,
    targetRole,
    skills,
    analysis,
    projects,
    evidenceItems,
    roadmapPhases,
    learningItems,
    aiPreferences,
    notificationPreferences,
    privacyPreferences,
    activeCV,
    applications,
  ]);

  return (
    <CareerContext.Provider
      value={{
        careerContext,
        regeneratePersonalizedRoadmap,
        currentUser,
        identity,
        avatarId: profile.avatarUrl,
        authToken,
        isAuthReady,
        hydrationError,
        isHydrated,
        authModalOpen,
        setAuthModalOpen,
        authRedirectError,
        clearAuthRedirectError,
        login,
        register,
        logout,
        consentState,
        consentRequired: consentState !== null && (!consentState.termsAvailable || !consentState.accepted),
        consentError,
        acceptConsent,
        refreshConsent,
        passwordRecovery,
        completePasswordReset,
        dismissPasswordRecovery,
        profile,
        updateProfile,
        reorderCvCollection,
        setCareerState,
        setCareerGoal,
        careerIdentity,
        saveCareerIdentity,
        completeOnboarding,
        suggestAiSummary,
        validateUsername,
        profileCompleteness,
        activeView,
        setActiveView,
        copilotOpen,
        setCopilotOpen,
        targetRole,
        targetRoleTitle,
        hasTargetRole,
        experienceLevel,
        setExperienceLevel,
        savedRoles,
        setPrimaryTargetRole,
        saveCareerTarget,
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
        deleteDocument,
        coverLetters,
        saveCoverLetter,
        deleteCoverLetter,
        generateAiCoverLetter,
        skills,
        ownedSkills,
        updateSkillLevel,
  addCustomSkill,
  skillEvidence,
  skillRecalculation,
  recordSkillAssessment,
  resyncSkillDependents,
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
        volunteerExperiences,
        addVolunteerExperience,
        updateVolunteerExperience,
        deleteVolunteerExperience,
        evidenceItems,
        addEvidence,
        deleteEvidence,
        activeCV,
        cvVersions,
        updateCV,
        profileLinks,
        refreshProfileLinks,
        loadCVFromMyData,
        saveCVVersion,
        duplicateCVVersion,
        renameCVVersion,
        deleteCVVersion,
        runAiCvOptimization,
        isOptimizingCV,
        cvAnalysisError,
        dismissCvAnalysisError,
        applyReviewedCv,
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
        visibleNotifications,
        markNotificationRead,
        markAllNotificationsRead,
        recordNotificationClick,
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
        subscription,
        creditBalance,
        refreshSubscription,
        refreshCredits,
        claimDailyTokens,
      }}
    >
      {/* The global processing layer lives inside the career provider, so the
          surface it renders is translated with the application's own
          translator. */}
      <ProcessingProvider>
        {/* The toast layer lives inside the career provider too, so every
            confirmation the application raises — the daily token claim above
            all — has somewhere to go. */}
        <ToastProvider>{children}</ToastProvider>
      </ProcessingProvider>
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
