/**
 * Career types.
 *
 * `SkillCategory` and `TargetRole` now live in `shared/` so that the API and
 * the frontend describe roles with exactly the same contract. They are
 * re-exported here because every existing frontend import points at this
 * module.
 */
export type { SkillCategory, TargetRole, RoleSkill } from '../../shared/careerTypes.ts';

import type { SkillCategory, TargetRole } from '../../shared/careerTypes.ts';

export type CareerState = 
  | 'student' 
  | 'fresh_graduate' 
  | 'working_professional' 
  | 'career_switcher' 
  | 'exploring';

export type CareerGoal = 
  | 'get_first_job'
  | 'get_internship'
  | 'switch_career'
  | 'get_promoted'
  | 'become_specialist'
  | 'become_manager'
  | 'build_portfolio'
  | 'freelance'
  | 'explore_careers'
  | 'custom';

export type SkillSource = 
  | 'self_reported'
  | 'ai_estimated'
  | 'assessment'
  | 'project_evidence'
  | 'experience'
  | 'certificate';

export interface UserSkill {
  id: string;
  name: string;
  category: SkillCategory;
  currentLevel: number; // 1-5
  targetLevel: number;  // 1-5
  gap: number;          // targetLevel - currentLevel (min 0)
  source: SkillSource;
  evidenceIds: string[];
  lastUpdated: string;
}

export interface CareerAnalysis {
  matchPercentage: number;
  strengths: { skill: string; note: string }[];
  criticalGaps: { skill: string; current: number; target: number; reason: string }[];
  missingExperience: string[];
  careerRisks: string[];
  recommendedProjects: string[];
  recommendedLearning: string[];
  nextBestAction: {
    title: string;
    description: string;
    reason: string;
    actionType: 'task' | 'course' | 'project' | 'cv';
    actionTargetId?: string;
  };
}

export type RoadmapTaskStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped' | 'blocked';

/** A learning resource attached to a roadmap step. */
export interface RoadmapResource {
  id: string;
  title: string;
  provider: string;
  url: string;
  durationHours: number | null;
}

export interface RoadmapTask {
  id: string;
  title: string;
  description: string;
  status: RoadmapTaskStatus;
  skillId?: string;
  skillName?: string;
  deadline?: string;
  resourceId?: string;
  resourceTitle?: string;
  evidenceId?: string;
  estimatedHours: number;
  /** How hard this step is: foundational, intermediate or advanced. */
  difficulty?: string | null;
  /** Titles of the steps that must be finished before this one. */
  prerequisites?: string[];
  /** Every skill this step moves the user on. */
  skillNames?: string[];
  /** Projects that demonstrate this step. */
  projectTitles?: string[];
  /** Recommended learning resources, with their links. */
  resources?: RoadmapResource[];
  /** Urgency of the gap this step closes. */
  priority?: string | null;
  /** Plain-language reason this step is in this user's plan. */
  rationale?: string | null;
}

export interface RoadmapMilestone {
  id: string;
  title: string;
  description: string;
  tasks: RoadmapTask[];
  completedTasksCount: number;
}

export interface RoadmapPhase {
  id: string;
  phaseNumber: number;
  title: string;
  description: string;
  /** The role-specific outcome this phase works towards. */
  goal?: string | null;
  milestones: RoadmapMilestone[];
  isUnlocked: boolean;
}

export type ProjectStatus = 'idea' | 'planned' | 'in_progress' | 'completed' | 'published';

export interface CareerProject {
  id: string;
  title: string;
  goal: string;
  description: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  skills: string[];
  tasks: string[];
  deliverables: string[];
  status: ProjectStatus;
  repositoryUrl?: string;
  demoUrl?: string;
  documentation?: string;
  createdAt: string;
  completedAt?: string;
}

/**
 * One volunteer stint.
 *
 * A volunteer experience is a domain of its own: it is not an employment
 * entry, so it never appears in the CV timeline. It records the
 * organisation, the role taken on, the duration, the responsibilities, the
 * achievements and the skills it gave the user — plus the projects that
 * evidence it.
 */
export interface VolunteerExperience {
  id: string;
  organization: string;
  role: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
  responsibilities: string[];
  achievements: string[];
  skills: string[];
  /** The ids of the projects this stint is evidenced by. */
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type EvidenceType = 
  | 'github'
  | 'demo'
  | 'certificate'
  | 'project'
  | 'experience'
  | 'course'
  | 'assessment'
  | 'portfolio';

export interface EvidenceItem {
  id: string;
  title: string;
  type: EvidenceType;
  description: string;
  url?: string;
  skillNames: string[];
  projectId?: string;
  verified: boolean;
  dateAdded: string;
}

export interface CvExtractionConfidence {
  overall: number;
  personal: number;
  summary: number;
  experience: number;
  education: number;
  skills: number;
  projects: number;
  certifications: number;
}

export interface CvExtractionEvidence {
  field: string;
  text: string;
  page?: number;
}

/**
 * Provenance of the structured CV returned by /api/resumes/upload.
 *
 * The CV is parsed deterministically from the document text; `confidence` and
 * `evidence` explain why each field exists, and `warnings` names what was not
 * found. The review step shows this instead of presenting every field as
 * equally certain.
 */
export interface CvExtractionMetadata {
  method: 'deterministic';
  format: 'pdf' | 'docx' | 'txt' | 'json';
  pageCount: number;
  layout: 'single-column' | 'two-column' | 'multi-column';
  characterCount: number;
  wordCount: number;
  confidence: CvExtractionConfidence;
  evidence: CvExtractionEvidence[];
  warnings: string[];
}

/** Overall readability grade returned next to the structured CV. */
export type CvExtractionQuality = 'high' | 'medium' | 'low' | 'failed';

export interface CvUploadResult {
  success: boolean;
  cv?: CVProfile;
  extraction?: CvExtractionMetadata;
  extractionQuality?: CvExtractionQuality;
  atsAnalysis?: ATSAnalysis | null;
  analysisAvailable?: boolean;
  error?: string;
  code?: string;
}

export type CvImportSectionKey =
  | 'personal'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications';

/**
 * The outcome of one import section. The review modal keeps the imported
 * counts visible so a partial failure is never reported as a full success.
 */
export interface CvImportSectionResult {
  section: CvImportSectionKey;
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export interface CvImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  failed: number;
  sections: CvImportSectionResult[];
  errors: string[];
}

export interface CVProfile {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  title: string;
  summary: string;
  linkedin?: string;
  github?: string;
  website?: string;
  experiences: {
    id: string;
    company: string;
    role: string;
    period: string;
    location: string;
    bullets: string[];
    startDate?: string;
    endDate?: string;
    isCurrent?: boolean;
  }[];
  education: {
    id: string;
    institution: string;
    degree: string;
    field: string;
    period: string;
    gpa?: string;
    startDate?: string;
    endDate?: string;
    current?: boolean;
  }[];
  projects: {
    id: string;
    title: string;
    role: string;
    link?: string;
    technologies: string[];
    bullets: string[];
  }[];
  skillsList: string[];
  certifications: string[];
  certificationDetails?: Array<{ name: string; issuer: string; issueDate: string }>;
}

export interface ATSAnalysis {
  overallScore: number; // 0-100
  breakdown: {
    keywordsMatch: number;
    impactAndMetrics: number;
    formattingStructure: number;
    experienceRelevance: number;
  };
  matchedKeywords: string[];
  missingKeywords: string[];
  actionableImprovements: {
    section: string;
    currentText?: string;
    suggestedText: string;
    reason: string;
  }[];
}

export interface CVVersion {
  id: string;
  /** Owning CV (public.cvs.id) — links a version snapshot to its CV document. */
  cvId?: string;
  name: string;
  targetRoleTitle: string;
  createdAt: string;
  profile: CVProfile;
  atsAnalysis?: ATSAnalysis;
}

export type ApplicationStage = 
  | 'saved'
  | 'applied'
  | 'screening'
  | 'interview'
  | 'technical'
  | 'final'
  | 'offer'
  | 'rejected'
  | 'withdrawn';

export interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  workMode: 'Remote' | 'Hybrid' | 'On-site';
  level: 'Entry' | 'Entry-Mid' | 'Mid' | 'Senior' | 'Lead';
  salaryRange: string;
  description: string;
  responsibilities: string[];
  requirements: string[];
  skillsRequired: string[];
  applicationUrl: string;
  postedDate: string;
}

export interface JobApplication {
  id: string;
  jobId?: string;
  company: string;
  role: string;
  location: string;
  workMode: string;
  stage: ApplicationStage;
  appliedDate?: string;
  lastUpdated: string;
  nextAction?: string;
  nextActionDate?: string;
  notes: string;
  salaryDiscussed?: string;
  interviewStageDetails?: string;
}

export interface MockInterviewSession {
  id: string;
  roleTitle: string;
  type: 'behavioral' | 'technical' | 'star';
  question: string;
  userAnswer: string;
  aiFeedback?: {
    score: number; // 1-10
    strengths: string[];
    improvements: string[];
    starEvaluation?: {
      situation: string;
      task: string;
      action: string;
      result: string;
    };
    suggestedAnswer: string;
  };
  createdAt: string;
}

export interface UserNotification {
  id: string;
  title: string;
  message: string;
  // Mirrors server/db/notifications.ts NOTIFICATION_TYPES. The two lists must
  // stay identical or persisted rows are cast to a type the UI cannot render.
  type: 'roadmap' | 'interview' | 'application' | 'achievement' | 'system';
  read: boolean;
  timestamp: string;
  linkAction?: string;
}

export interface UserSettings {
  language: 'en' | 'ar';
  theme: 'light' | 'dark';
  emailAlerts: boolean;
  roadmapReminders: boolean;
  interviewReminders: boolean;
  weeklyProgressSummary: boolean;
  allowAiContextLearning: boolean;
}

export interface CopilotMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  suggestions?: string[];
  proposedAction?: AiProposedAction;
}

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  token?: string;
  createdAt: string;
}

export interface DailyCareerAction {
  id: string;
  title: string;
  description: string;
  category: 'roadmap' | 'skill' | 'project' | 'job' | 'interview';
  priority: 'high' | 'medium';
  completed: boolean;
  actionView: string;
  reason: string;
}

export interface WeeklyCareerReview {
  weekNumber: number;
  startDate: string;
  endDate: string;
  completedTasksCount: number;
  skillsAdvancedCount: number;
  applicationsCount: number;
  interviewsCount: number;
  keyAchievements: string[];
  nextWeekPriorities: string[];
  healthScore: number;
}

export interface CareerHealthDimensions {
  skillsConfidence: number;     // 0-100
  evidenceCoverage: number;     // 0-100
  roadmapVelocity: number;      // 0-100
  cvAlignment: number;          // 0-100
  marketEngagement: number;     // 0-100
  overallHealth: number;        // 0-100
}

export interface AiProposedAction {
  id: string;
  title: string;
  description: string;
  reason: string;
  type: 'add_skill' | 'update_task' | 'add_project' | 'tailor_cv' | 'add_application';
  payload: any;
  status: 'pending' | 'accepted' | 'declined';
}

export interface UserEducationEntry {
  id: string;
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  current: boolean;
  gpa?: string;
  coursework?: string[];
}

export interface UserExperienceEntry {
  id: string;
  role: string;
  company: string;
  employmentType: 'Full-time' | 'Part-time' | 'Contract' | 'Internship' | 'Freelance';
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
  achievements: string[];
  skillsUsed: string[];
}

export interface UserCertificationEntry {
  id: string;
  name: string;
  provider: string;
  issueDate: string;
  expiryDate?: string;
  credentialId?: string;
  credentialUrl?: string;
}

export interface UserLanguageEntry {
  id: string;
  language: string;
  proficiency: 'Native' | 'Fluent' | 'Professional' | 'Conversational' | 'Basic';
}

export interface ProfessionalLinks {
  linkedin?: string;
  github?: string;
  portfolio?: string;
  personalWebsite?: string;
  behance?: string;
  dribbble?: string;
  twitter?: string;
}

export type MilestoneCategory = 
  | 'internship'
  | 'project'
  | 'certification'
  | 'application'
  | 'interview'
  | 'offer'
  | 'role'
  | 'promotion'
  | 'skill';

export interface CareerMilestoneItem {
  id: string;
  title: string;
  category: MilestoneCategory;
  dateAchieved: string;
  notes?: string;
  verified?: boolean;
}

export interface SecondaryCareerGoal {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  deadline: string;
  status: 'active' | 'achieved' | 'paused';
  progressPercent: number;
}

export type ActivityActionType = 
  | 'completed_task' 
  | 'added_project' 
  | 'uploaded_cv' 
  | 'applied_job' 
  | 'mock_interview' 
  | 'acquired_skill' 
  | 'added_evidence'
  | 'saved_job'
  | 'goal_updated'
  | 'document_saved';

export interface UserActivityItem {
  id: string;
  timestamp: string;
  actionType: ActivityActionType;
  title: string;
  subtitle: string;
  relatedObject?: string;
  linkView?: string;
}

export interface CoverLetter {
  id: string;
  title: string;
  company: string;
  role: string;
  jobDescription?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  keyHighlights: string[];
  targetJobId?: string;
  applicationId?: string;
}

export interface CareerDocument {
  id: string;
  name: string;
  type: 'cv' | 'cover_letter' | 'certificate' | 'portfolio' | 'supporting';
  format: 'pdf' | 'docx' | 'txt' | 'link';
  size: string;
  updatedAt: string;
  createdAt: string;
  relatedRoleId?: string;
  relatedApplicationId?: string;
  isPublic: boolean;
  fileUrl?: string;
  contentPreview?: string;
}

export interface AiPreferences {
  recommendationsEnabled: boolean;
  writingAssistance: boolean;
  proactiveSuggestions: boolean;
  personalizationLevel: 'focused' | 'balanced' | 'comprehensive';
  preferredLanguage: 'en' | 'ar';
}

export interface NotificationPreferences {
  emailNotifications: boolean;
  inAppNotifications: boolean;
  applicationReminders: boolean;
  interviewReminders: boolean;
  roadmapReminders: boolean;
  learningReminders: boolean;
  aiRecommendations: boolean;
}

export interface PrivacyPreferences {
  profileVisibility: 'public' | 'private';
  allowSearchEngines: boolean;
  shareAnalyticsWithAi: boolean;
  showSkillsPublicly: boolean;
  showProjectsPublicly: boolean;
}

export interface CareerBlocker {
  id: string;
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  ctaText: string;
  ctaView: string;
}

export interface ProfileCompletenessBreakdown {
  overallPercent: number;
  missingItems: {
    id: string;
    label: string;
    impactWeight: number;
    targetView: string;
  }[];
}

export interface CareerContextSummary {
  profile: any;
  careerGoal?: string;
  targetRole: TargetRole;
  skills: UserSkill[];
  skillGaps: string[];
  experience: UserExperienceEntry[];
  education: UserEducationEntry[];
  projects: CareerProject[];
  evidence: EvidenceItem[];
  roadmap: RoadmapPhase[];
  learningProgress: any[];
  preferences: {
    aiPreferences: AiPreferences;
    notificationPreferences: NotificationPreferences;
    privacyPreferences: PrivacyPreferences;
  };
  cv: CVProfile;
  applications: JobApplication[];
}

