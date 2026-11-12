/**
 * Career types.
 *
 * `SkillCategory` and `TargetRole` now live in `shared/` so that the API and
 * the frontend describe roles with exactly the same contract. They are
 * re-exported here because every existing frontend import points at this
 * module.
 */
export type { SkillCategory, TargetRole, RoleSkill } from '../../shared/careerTypes.ts';
export type { ProjectLifecycleStatus } from '../../shared/projectLifecycle.ts';

import type { SkillCategory, TargetRole } from '../../shared/careerTypes.ts';
import type { ProjectLifecycleStatus } from '../../shared/projectLifecycle.ts';
import type { AiLanguageCode } from '../../shared/aiLanguages.ts';
import type { ResumeLanguage } from '../../shared/resumeLanguage.ts';

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

/**
 * The evidence that backs a skill.
 *
 * A skill is a claim plus whatever the platform can actually prove. The
 * vocabulary is shared with the server (`shared/skillEvidence.ts`) so a badge
 * shown in the browser means the same thing as the value in the database.
 */
export type SkillEvidenceSource =
  | 'self_reported'
  | 'diagnostic_assessment'
  | 'course_completed'
  | 'verified_project'
  | 'certificate'
  | 'work_experience';

export interface UserSkill {
  id: string;
  name: string;
  category: SkillCategory;
  /**
   * The level the product compares against the role: the strongest of the
   * self-report, the assessment and the evidence. Never a silent default —
   * a skill nobody rated and nothing proves is level 0.
   */
  currentLevel: number; // 0-5
  targetLevel: number;  // 1-5
  gap: number;          // targetLevel - currentLevel (min 0)
  source: SkillSource;
  evidenceIds: string[];
  lastUpdated: string;
  /** What the candidate says they can do (1-5). Null when never rated. */
  selfReportedLevel?: number | null;
  /** What a diagnostic knowledge check measured (1-5). Null when never taken. */
  assessedLevel?: number | null;
  /** The raw percentage the assessment scored (0-100). */
  assessmentScore?: number | null;
  /** When the assessment was taken. */
  assessmentAt?: string | null;
  /** The evidence backing this skill. */
  evidenceSources?: SkillEvidenceSource[];
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
  /**
   * The kind of work this step is: learning, practice, project or
   * application. It is what makes the time estimate break down honestly.
   */
  workKind?: 'learning' | 'practice' | 'project' | 'application';
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

/**
 * The status of a project.
 *
 * It is the shared lifecycle enum, so the interface, the server and the
 * database all speak the same vocabulary. The older words ('idea',
 * 'submitted', 'verified') are read as aliases rather than as statuses of
 * their own.
 */
export type ProjectStatus = ProjectLifecycleStatus;

export type ProjectCategory = 'academic' | 'personal' | 'professional' | 'volunteer' | 'team';

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
  category?: ProjectCategory;
  role?: string;
  responsibilities?: string[];
  startDate?: string;
  isFeatured?: boolean;
  includeInPortfolio?: boolean;
  thumbnailUrl?: string;
  screenshots?: string[];
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

/**
 * One professional link as it appears on a CV.
 *
 * The URL and label belong to the profile's link record, so editing them here
 * writes back to the profile. The order and the enabled flag belong to this
 * CV alone: the same person may show a GitHub link on one CV and not on
 * another.
 */
export interface CVLink {
  /** The id of the profile link record this came from. */
  id: string;
  /** The kind of link: linkedin, github, portfolio, behance, dribbble, kaggle, medium, other. */
  kind: string;
  label: string;
  url: string;
  /** Whether this link is shown on this CV. */
  enabled: boolean;
}

/** One volunteering stint, as it appears on a CV. */
export interface CVVolunteering {
  id: string;
  organization: string;
  role: string;
  period: string;
  location?: string;
  /** The candidate's own description, or the one the assistant wrote. */
  description: string;
  bullets: string[];
  /** The machine-readable dates, when the source of the CV gave them. */
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
}

/** One completed course, as it appears on a CV. */
export interface CVCourse {
  id: string;
  title: string;
  provider: string;
  /** The candidate's own line about the course, or the one the assistant wrote. */
  description: string;
}

/**
 * One internship, as it appears on a CV.
 *
 * An internship is kept apart from a full-time role because the two are read
 * differently by an employer: an internship is a placement with a limited
 * term, and folding it into the employment history loses that. The platform
 * has no separate internship record, so these live on the document itself.
 */
export interface CVInternship {
  id: string;
  organization: string;
  role: string;
  period: string;
  location?: string;
  /** The candidate's own line about the placement. */
  description?: string;
  bullets: string[];
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
}

/**
 * One language the candidate speaks.
 *
 * The level is whatever the document stated — "Fluent", "B2", "Native" — and
 * is not translated into a scale the candidate did not ask for.
 */
export interface CVLanguage {
  id: string;
  name: string;
  /** The level the document stated, when it stated one. */
  level?: string;
}

/** One award or honour, as it appears on a CV. */
export interface CVAward {
  id: string;
  title: string;
  /** The body that gave the award. */
  issuer?: string;
  /** When it was given. */
  date?: string;
  description?: string;
}

/** One publication, as it appears on a CV. */
export interface CVPublication {
  id: string;
  title: string;
  /** The journal, conference or publisher. */
  publisher?: string;
  /** When it was published. */
  date?: string;
  /** Where it can be read. */
  url?: string;
  description?: string;
}

/** One piece of research work, as it appears on a CV. */
export interface CVResearch {
  id: string;
  title: string;
  /** The university, laboratory or institute the work belongs to. */
  institution?: string;
  period?: string;
  description?: string;
  bullets?: string[];
}

/** One leadership or committee role, as it appears on a CV. */
export interface CVLeadership {
  id: string;
  organization: string;
  role: string;
  period?: string;
  description?: string;
  bullets?: string[];
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
    /** The line shown under the degree. */
    description?: string;
  }[];
  projects: {
    id: string;
    title: string;
    role: string;
    link?: string;
    technologies: string[];
    bullets: string[];
    /** The short line shown above the bullets. */
    description?: string;
  }[];
  skillsList: string[];
  certifications: string[];
  certificationDetails?: Array<{
    /**
     * The id of the certificate record, when it has one.
     *
     * It is what lets the platform tell a certificate the candidate has
     * deleted from a certificate that came from an imported CV and has not
     * been imported into the profile yet.
     */
    id?: string;
    name: string;
    issuer: string;
    issueDate: string;
    /** The line shown under the certificate. */
    description?: string;
    /** When the certificate stops being valid. */
    expiryDate?: string;
    /** The credential identifier the issuing body gave the certificate. */
    credentialId?: string;
    /** Where the credential can be verified. */
    credentialUrl?: string;
    /** The skills and tools the certificate produced. */
    skills?: string[];
  }>;
  /**
   * The professional links shown on this CV, in the order they are shown.
   *
   * Optional because a CV snapshot saved before links were editable has
   * none; the studio treats that as "no links chosen" rather than an error.
   */
  links?: CVLink[];
  /** The volunteering stints shown on this CV. */
  volunteering?: CVVolunteering[];
  /** The completed courses shown on this CV. */
  courses?: CVCourse[];
  /**
   * The internship placements shown on this CV.
   *
   * Kept apart from the employment history: an internship is a placement
   * with a limited term and an employer reads it differently.
   */
  internships?: CVInternship[];
  /** The languages shown on this CV. */
  languages?: CVLanguage[];
  /** The awards and honours shown on this CV. */
  awards?: CVAward[];
  /** The publications shown on this CV. */
  publications?: CVPublication[];
  /** The research work shown on this CV. */
  research?: CVResearch[];
  /** The leadership and committee roles shown on this CV. */
  leadership?: CVLeadership[];
  /**
   * The skills the candidate took off this CV.
   *
   * The skills shown on a CV are the skills the candidate owns — the platform
   * never puts a target-role requirement on a CV as if the candidate had it.
   * Taking a skill off is a decision about this CV only, so it is recorded
   * here rather than in the candidate's own skill list.
   */
  hiddenSkills?: string[];
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
  type: 'roadmap' | 'interview' | 'application' | 'achievement' | 'system' | 'announcement';
  read: boolean;
  /** True once the user followed the notification's CTA. */
  clicked?: boolean;
  /** Announcement priority, when this notification came from an announcement. */
  priority?: 'normal' | 'important' | 'critical' | null;
  timestamp: string;
  linkAction?: string;
}

export interface UserSettings {
  language: 'en' | 'ar';
  /**
   * The language the CV is written in.
   *
   * This is deliberately NOT the same as `language`, which is the interface
   * language. A candidate can work in an Arabic interface and write their CV
   * in English; changing one must never change the other.
   */
  resumeLanguage: ResumeLanguage;
  theme: 'light' | 'dark';
  emailAlerts: boolean;
  roadmapReminders: boolean;
  interviewReminders: boolean;
  weeklyProgressSummary: boolean;
  allowAiContextLearning: boolean;
  /**
   * The CV template the candidate chose.
   *
   * It belongs to the account, like the resume language: a candidate who picks
   * a structure on their laptop expects the same document on their phone.
   */
  cvTemplateId: string;
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
  /** What the certificate says about the work it certified. */
  description?: string;
  /** The skills and tools the certificate produced. */
  skills?: string[];
  attachmentUrl?: string;
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
  /**
   * The language the assistant answers in. This is separate from the interface
   * language: a candidate can read the product in Arabic and ask for an
   * English CV summary, or the reverse.
   */
  preferredLanguage: AiLanguageCode;
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
  /**
   * The candidate's goal, or null when they have not chosen one.
   *
   * It is nullable because the platform never assumes a goal: a student
   * chasing a promotion is a default the candidate did not ask for.
   */
  careerGoal?: string | null;
  /**
   * The candidate's target role, or null when they have not chosen one.
   *
   * It is nullable because the platform must never stand in a role the
   * candidate did not pick. Consumers read `targetRole?.title` and fall back
   * to a prompt.
   */
  targetRole: TargetRole | null;
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

