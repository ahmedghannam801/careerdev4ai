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

export type SkillCategory = 
  | 'technical'
  | 'analytical'
  | 'business'
  | 'communication'
  | 'leadership'
  | 'tools'
  | 'domain'
  | 'soft_skills';

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

export interface TargetRole {
  id: string;
  title: string;
  category: string;
  level: 'Entry' | 'Entry-Mid' | 'Mid' | 'Senior' | 'Lead';
  overview: string;
  responsibilities: string[];
  requiredSkills: { name: string; category: SkillCategory; minLevel: number }[];
  preferredSkills: { name: string; category: SkillCategory; minLevel: number }[];
  tools: string[];
  experienceExpectation: string;
  salaryRange: string;
  typicalProjects: string[];
  certifications: string[];
  interviewTopics: string[];
  careerProgression: string[];
  relatedRoles: string[];
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
  milestones: RoadmapMilestone[];
  isUnlocked: boolean;
}

export interface LearningResource {
  id: string;
  title: string;
  provider: string;
  skill: string;
  skillCategory: SkillCategory;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  duration: string;
  cost: 'Free' | 'Paid';
  language: 'English' | 'Arabic' | 'Bilingual';
  url: string;
  prerequisites: string[];
  recommendationReason: string;
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

export interface CVProfile {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  title: string;
  summary: string;
  experiences: {
    id: string;
    company: string;
    role: string;
    period: string;
    location: string;
    bullets: string[];
  }[];
  education: {
    id: string;
    institution: string;
    degree: string;
    field: string;
    period: string;
    gpa?: string;
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
  type: 'roadmap' | 'interview' | 'application' | 'skill' | 'system';
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

export interface CareerPathNode {
  id: string;
  title: string;
  level: string;
  typicalYears: string;
  salaryRange: string;
  description: string;
  nextSteps: string[];
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
  | 'completed_course' 
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

