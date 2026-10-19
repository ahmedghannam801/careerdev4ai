import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import {
  CareerState,
  CareerGoal,
  TargetRole,
  UserSkill,
  CareerAnalysis,
  RoadmapPhase,
  RoadmapTask,
  RoadmapTaskStatus,
  LearningResource,
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
import { LEARNING_RESOURCES } from '../data/learningResources';
import { PROJECTS_CATALOG } from '../data/projectsCatalog';
import { JOBS_CATALOG } from '../data/jobsData';
import { translations, Language } from '../translations';

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

interface CareerContextType {
  // Authentication
  currentUser: UserAccount | null;
  authToken: string | null;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;

  // Profile & Persona
  profile: UserProfile;
  updateProfile: (updates: Partial<UserProfile>) => void;
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
  addDocument: (doc: Omit<CareerDocument, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateDocument: (id: string, updates: Partial<CareerDocument>) => void;
  deleteDocument: (id: string) => void;
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

  // Learning
  learningResources: LearningResource[];
  enrolledResourceIds: string[];
  toggleResourceEnrollment: (resourceId: string) => void;

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

export const CareerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Authentication State
  const [authToken, setAuthToken] = useState<string | null>(() => {
    return localStorage.getItem('careerpilot_token') || 'demo-session-token-123';
  });

  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    const saved = localStorage.getItem('careerpilot_user');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return {
      id: 'user-default-1',
      name: 'Sarah Jenkins',
      email: 'sarah.jenkins@example.com',
      avatarUrl: '/src/assets/images/career_user_avatar_1792417629788.jpg',
      createdAt: '2026-10-01'
    };
  });

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [activeView, setActiveView] = useState('dashboard');

  // Profile & Persona
  const [profile, setProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('careerpilot_profile');
    if (saved) {
      try { 
        const parsed = JSON.parse(saved);
        if (parsed.education && parsed.experiences) return parsed;
      } catch {}
    }
    return {
      name: 'Sarah Jenkins',
      preferredName: 'Sarah',
      email: 'sarah.jenkins@example.com',
      phone: '+1 (555) 234-5678',
      avatarUrl: '/src/assets/images/career_user_avatar_1792417629788.jpg',
      currentTitle: 'Junior Frontend Developer',
      currentPosition: 'Junior Frontend Developer',
      currentCompany: 'Meridian Tech Labs',
      yearsOfExperience: '2.5 years',
      industry: 'Enterprise Software & Cloud Platforms',
      location: 'San Francisco, CA / Remote',
      country: 'United States',
      city: 'San Francisco',
      timezone: 'America/Los_Angeles (UTC-7)',
      preferredLanguage: 'en',
      headline: 'Frontend Engineer | Modern React, TypeScript & Accessible Design Systems',
      bio: 'Frontend engineer passionate about accessible interfaces, component architectures, and web performance optimization.',
      professionalSummary: 'Results-driven Frontend Engineer with 2+ years of experience building accessible, high-performance web applications using React, TypeScript, and modern CSS architectures. Passionate about design systems and engineering velocity.',
      username: 'sarah-jenkins',
      isPublic: true,
      careerState: 'working_professional',
      careerGoal: 'get_promoted',
      onboardingCompleted: true,
      education: [
        {
          id: 'edu-1',
          institution: 'University of Texas at Austin',
          degree: 'Bachelor of Science',
          field: 'Computer Science',
          startDate: '2018-09-01',
          endDate: '2022-05-15',
          current: false,
          gpa: '3.8/4.0',
          coursework: ['Data Structures & Algorithms', 'Web Application Development', 'Computer Networks', 'Human-Computer Interaction']
        }
      ],
      experiences: [
        {
          id: 'exp-1',
          role: 'Frontend Developer',
          company: 'Meridian Tech Labs',
          employmentType: 'Full-time',
          location: 'San Francisco, CA / Hybrid',
          startDate: '2024-03-01',
          endDate: '',
          isCurrent: true,
          description: 'Design, develop, and maintain high-volume customer-facing React components and design systems.',
          achievements: [
            'Spearheaded 25+ reusable design system components adopted across 3 agile squads.',
            'Optimized Largest Contentful Paint (LCP) from 3.2s to 1.1s, boosting conversion by 14%.'
          ],
          skillsUsed: ['React', 'TypeScript', 'Tailwind CSS', 'State Management']
        },
        {
          id: 'exp-2',
          role: 'Junior Web Developer (Internship)',
          company: 'Apex Digital Agency',
          employmentType: 'Internship',
          location: 'Austin, TX',
          startDate: '2022-06-01',
          endDate: '2023-01-15',
          isCurrent: false,
          description: 'Developed client marketing portals and responsive landing experiences.',
          achievements: [
            'Delivered 8 responsive microsites with 100% Google Lighthouse accessibility scores.',
            'Authored reusable CSS utility tokens reducing styling turnaround by 20%.'
          ],
          skillsUsed: ['JavaScript (ES6+)', 'HTML5 & Modern CSS', 'Git & Version Control']
        }
      ],
      certifications: [
        {
          id: 'cert-1',
          name: 'Meta Front-End Developer Professional Certificate',
          provider: 'Meta / Coursera',
          issueDate: '2024-02-18',
          credentialId: 'META-FE-98327',
          credentialUrl: 'https://coursera.org/verify/professional-cert/meta-frontend'
        }
      ],
      languages: [
        { id: 'lang-1', language: 'English', proficiency: 'Native' },
        { id: 'lang-2', language: 'Spanish', proficiency: 'Professional' },
        { id: 'lang-3', language: 'Arabic', proficiency: 'Basic' }
      ],
      links: {
        linkedin: 'https://linkedin.com/in/sarah-jenkins-dev',
        github: 'https://github.com/sarah-jenkins',
        portfolio: 'https://sarahjenkins.dev',
        personalWebsite: 'https://sarahjenkins.dev/blog'
      },
      careerIdentity: {
        whoYouAre: 'Working Professional with strong frontend design system foundations',
        whereYoureGoing: 'Mid-Level Frontend Engineer at a high-velocity product company',
        why: 'Accelerate promotion, lead component architecture, and increase compensation',
        whatYoureMissing: 'Automated testing suites (Jest/Playwright) and CI/CD deployment pipelines',
        whatYoureBuilding: 'Accessible Design System component library with automated unit testing',
        howYourePresenting: 'Targeted Mid-Level Frontend Engineer CV with 84% ATS match',
        whereApplying: 'Vanguard Systems (Technical Interview stage) & Nexus Cloud'
      }
    };
  });

  // Target Roles & Comparison
  const [targetRole, setTargetRole] = useState<TargetRole>(() => {
    const saved = localStorage.getItem('careerpilot_target_role');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return TARGET_ROLES[0];
  });

  const [savedRoles, setSavedRoles] = useState<TargetRole[]>([TARGET_ROLES[0], TARGET_ROLES[1]]);

  // Skills
  const [skills, setSkills] = useState<UserSkill[]>(() => {
    const saved = localStorage.getItem('careerpilot_skills');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return DEFAULT_INITIAL_SKILLS;
  });

  // Roadmap
  const [roadmapPhases, setRoadmapPhases] = useState<RoadmapPhase[]>(() => {
    const saved = localStorage.getItem('careerpilot_roadmap');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return generateInitialRoadmap(TARGET_ROLES[0]);
  });
  const [isEnrolledInRoadmap, setIsEnrolledInRoadmap] = useState(true);

  // Learning
  const [learningResources] = useState<LearningResource[]>(LEARNING_RESOURCES);
  const [enrolledResourceIds, setEnrolledResourceIds] = useState<string[]>(['res-react-docs', 'res-ts-handbook']);

  // Projects & Evidence
  const [projects, setProjects] = useState<CareerProject[]>(PROJECTS_CATALOG);
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>([
    {
      id: 'ev-1',
      title: 'Accessible Design System Repository',
      type: 'github',
      description: 'Production React & TypeScript library with 95% unit test coverage and automated CI workflow.',
      url: 'https://github.com/example/accessible-ui-system',
      skillNames: ['React', 'TypeScript', 'Tailwind CSS', 'Git & Version Control'],
      projectId: 'proj-design-system',
      verified: true,
      dateAdded: '2026-09-15'
    },
    {
      id: 'ev-2',
      title: 'SaaS Churn Analysis & Dashboard',
      type: 'demo',
      description: 'Interactive Tableau dashboard demonstrating SQL cohort queries and churn drivers.',
      url: 'https://public.tableau.com/views/saas-retention-demo',
      skillNames: ['SQL', 'Data Visualization (Tableau/Power BI)'],
      projectId: 'proj-churn-dashboard',
      verified: true,
      dateAdded: '2026-09-06'
    }
  ]);

  // CV Studio
  const [activeCV, setActiveCV] = useState<CVProfile>({
    fullName: 'Sarah Jenkins',
    email: 'sarah.jenkins@example.com',
    phone: '+1 (555) 234-5678',
    location: 'San Francisco, CA',
    title: 'Frontend Engineer',
    summary: 'Detail-oriented Frontend Engineer with 2+ years of experience building accessible, high-performance web applications using React, TypeScript, and modern CSS architectures.',
    experiences: [
      {
        id: 'exp-1',
        company: 'Meridian Tech Labs',
        role: 'Frontend Developer',
        period: '2024 - Present',
        location: 'San Francisco, CA',
        bullets: [
          'Engineered 25+ reusable React and TypeScript components, accelerating feature shipment across 3 squads by 30%.',
          'Optimized Largest Contentful Paint (LCP) from 3.2s to 1.1s by implementing route-based code splitting.',
          'Collaborated closely with designers to establish WCAG 2.1 AA accessibility standards.'
        ]
      }
    ],
    education: [
      {
        id: 'edu-1',
        institution: 'University of Texas at Austin',
        degree: 'Bachelor of Science',
        field: 'Computer Science',
        period: '2018 - 2022',
        gpa: '3.8/4.0'
      }
    ],
    projects: [
      {
        id: 'cp-1',
        title: 'Accessible Design System & Storybook',
        role: 'Lead Architect',
        link: 'https://github.com/example/accessible-ui-system',
        technologies: ['React', 'TypeScript', 'Tailwind CSS', 'Playwright'],
        bullets: [
          'Constructed 15 accessible UI primitives with keyboard focus traps.',
          'Implemented automated CI testing pipeline with Jest and Playwright.'
        ]
      }
    ],
    skillsList: ['React', 'TypeScript', 'JavaScript (ES6+)', 'HTML5 & Modern CSS', 'Tailwind CSS', 'Git & Version Control', 'REST & GraphQL APIs'],
    certifications: ['Meta Front-End Developer Professional Certificate']
  });

  const [cvVersions, setCvVersions] = useState<CVVersion[]>([
    {
      id: 'cv-v1',
      name: 'Frontend Engineer Master v1',
      targetRoleTitle: 'Frontend Engineer',
      createdAt: '2026-10-10',
      profile: activeCV,
      atsAnalysis: {
        overallScore: 84,
        breakdown: { keywordsMatch: 86, impactAndMetrics: 82, formattingStructure: 92, experienceRelevance: 78 },
        matchedKeywords: ['React', 'TypeScript', 'Accessibility', 'Core Web Vitals', 'REST APIs', 'Tailwind CSS'],
        missingKeywords: ['Next.js', 'Playwright', 'GraphQL', 'CI/CD Pipelines'],
        actionableImprovements: [
          {
            section: 'Experience',
            currentText: 'Collaborated closely with product designers to establish WCAG 2.1 AA...',
            suggestedText: 'Spearheaded WCAG 2.1 AA accessibility compliance across customer portal, reducing accessibility audit violations by 90%.',
            reason: 'Quantifies business outcome with Google X-Y-Z formula.'
          }
        ]
      }
    }
  ]);
  const [isOptimizingCV, setIsOptimizingCV] = useState(false);
  const [isUploadingCv, setIsUploadingCv] = useState(false);

  // Jobs & Applications
  const [jobs] = useState<JobListing[]>(JOBS_CATALOG);
  const [applications, setApplications] = useState<JobApplication[]>([
    {
      id: 'app-1',
      jobId: 'job-fe-01',
      company: 'Vanguard Systems',
      role: 'Frontend Engineer (React / TypeScript)',
      location: 'San Francisco, CA / Remote',
      workMode: 'Remote',
      stage: 'interview',
      appliedDate: '2026-10-15',
      lastUpdated: '2026-10-18',
      nextAction: 'Round 2 Technical Interview with Lead Architect',
      nextActionDate: '2026-10-22',
      notes: 'Technical round covers React Fiber lifecycle, custom hooks, and live coding.',
      interviewStageDetails: 'Technical Interview (Virtual)'
    },
    {
      id: 'app-2',
      jobId: 'job-fs-02',
      company: 'Nexus Cloud Technologies',
      role: 'Full-Stack Software Engineer',
      location: 'Austin, TX',
      workMode: 'Hybrid',
      stage: 'applied',
      appliedDate: '2026-10-16',
      lastUpdated: '2026-10-16',
      nextAction: 'Follow up if no recruiter reply by Oct 24',
      notes: 'Applied directly through referral link.'
    }
  ]);

  // Interviews
  const [interviewSessions, setInterviewSessions] = useState<MockInterviewSession[]>([
    {
      id: 'int-1',
      roleTitle: 'Frontend Engineer',
      type: 'star',
      question: 'Describe a situation where a project you led faced an unexpected technical roadblock close to a deadline. How did you resolve it?',
      userAnswer: 'During our Q3 customer portal release, our LCP score degraded to 4.2s due to an unbundled chart library. With 4 days to launch, I identified the bundle bloat, code-split the chart module asynchronously, and compressed assets with WebP. This brought LCP down to 1.2s and we launched on schedule.',
      aiFeedback: {
        score: 9,
        strengths: ['Clear metrics (4.2s to 1.2s)', 'Methodical root-cause debugging under time constraints'],
        improvements: ['Mention team post-mortem and automated CI bundle size limits.'],
        starEvaluation: {
          situation: 'Launch with performance regression near deadline.',
          task: 'Diagnose and remediate bundle bloat in 4 days.',
          action: 'Dynamic code splitting and WebP asset optimization.',
          result: 'Achieved 1.2s LCP and launched on schedule.'
        },
        suggestedAnswer: 'During our release cycle, our LCP degraded to 4.2s due to an unbundled package. I surfaced the risk in daily standup, analyzed bundles using flamecharts, and dynamically code-split dependencies. LCP recovered to 1.2s, we deployed on time, and I added bundle size gating to our CI pipeline.'
      },
      createdAt: '2026-10-17'
    }
  ]);

  // Notifications
  const [notifications, setNotifications] = useState<UserNotification[]>([
    {
      id: 'notif-1',
      title: 'Upcoming Technical Interview',
      message: 'Round 2 Technical Interview with Vanguard Systems scheduled for October 22.',
      type: 'interview',
      read: false,
      timestamp: '2 hours ago',
      linkAction: 'applications'
    },
    {
      id: 'notif-2',
      title: 'Roadmap Task Due Soon',
      message: 'Refactor component props to strict generic types by Oct 25.',
      type: 'roadmap',
      read: false,
      timestamp: '1 day ago',
      linkAction: 'roadmap'
    }
  ]);

  // Copilot & AI Proposed Action
  const [copilotMessages, setCopilotMessages] = useState<CopilotMessage[]>([
    {
      id: 'cop-1',
      sender: 'assistant',
      text: 'Hello Sarah! I am your CareerPilot Advisor. Your primary target is Frontend Engineer, where you currently match 82% of core competencies. Your highest-leverage next move is closing the automated testing gap (Jest/Playwright) and preparing for your Vanguard Systems interview on Oct 22.',
      timestamp: 'Just now',
      suggestions: [
        'What should I prioritize today?',
        'Drill technical interview questions for React',
        'How can I improve my CV ATS match score?'
      ]
    }
  ]);
  const [isCopilotTyping, setIsCopilotTyping] = useState(false);
  const [pendingAiAction, setPendingAiAction] = useState<AiProposedAction | null>(null);

  // Secondary Goals
  const [secondaryGoals, setSecondaryGoals] = useState<SecondaryCareerGoal[]>(() => {
    const saved = localStorage.getItem('careerpilot_secondary_goals');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [
      {
        id: 'sg-1',
        title: 'Publish Accessible Design System Open-Source Library',
        description: 'Package component primitives to npm with automated Storybook documentation.',
        priority: 'high',
        deadline: '2026-11-20',
        status: 'active',
        progressPercent: 65
      },
      {
        id: 'sg-2',
        title: 'Master Automated E2E Testing with Playwright',
        description: 'Complete cross-browser test suites and CI integration to eliminate manual testing friction.',
        priority: 'medium',
        deadline: '2026-12-05',
        status: 'active',
        progressPercent: 30
      }
    ];
  });

  const addSecondaryGoal = (goal: Omit<SecondaryCareerGoal, 'id'>) => {
    const newGoal: SecondaryCareerGoal = { ...goal, id: `sg-${Date.now()}` };
    setSecondaryGoals(prev => [newGoal, ...prev]);
    logActivity({
      actionType: 'goal_updated',
      title: 'Created Secondary Goal',
      subtitle: goal.title,
      linkView: 'my-career'
    });
  };

  const updateSecondaryGoal = (id: string, updates: Partial<SecondaryCareerGoal>) => {
    setSecondaryGoals(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
  };

  const deleteSecondaryGoal = (id: string) => {
    setSecondaryGoals(prev => prev.filter(g => g.id !== id));
  };

  // Career Milestones
  const [milestones, setMilestones] = useState<CareerMilestoneItem[]>(() => {
    const saved = localStorage.getItem('careerpilot_milestones');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [
      { id: 'ms-1', title: 'Graduated Computer Science B.S.', category: 'role', dateAchieved: '2022-05-15', verified: true, notes: 'GPA 3.8 / 4.0' },
      { id: 'ms-2', title: 'First Web Engineering Internship at Apex Agency', category: 'internship', dateAchieved: '2022-06-01', verified: true },
      { id: 'ms-3', title: 'Earned Meta Front-End Developer Certification', category: 'certification', dateAchieved: '2024-02-18', verified: true },
      { id: 'ms-4', title: 'Joined Meridian Tech Labs as Frontend Developer', category: 'role', dateAchieved: '2024-03-01', verified: true },
      { id: 'ms-5', title: 'Shipped Accessible Design System v1', category: 'project', dateAchieved: '2026-09-15', verified: true },
      { id: 'ms-6', title: 'Secured Technical Interview at Vanguard Systems', category: 'interview', dateAchieved: '2026-10-15', verified: true }
    ];
  });

  const addMilestone = (milestone: Omit<CareerMilestoneItem, 'id'>) => {
    const item: CareerMilestoneItem = { ...milestone, id: `ms-${Date.now()}` };
    setMilestones(prev => [item, ...prev]);
    logActivity({
      actionType: 'added_evidence',
      title: 'Career Milestone Recorded',
      subtitle: milestone.title,
      linkView: 'my-career'
    });
  };

  const deleteMilestone = (id: string) => {
    setMilestones(prev => prev.filter(m => m.id !== id));
  };

  // Activity Center
  const [activities, setActivities] = useState<UserActivityItem[]>(() => {
    const saved = localStorage.getItem('careerpilot_activities');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [
      {
        id: 'act-1',
        timestamp: 'Today, 10:45 AM',
        actionType: 'completed_task',
        title: 'Completed Roadmap Task',
        subtitle: 'Advanced Type Safety & Generics Handbook Drill',
        relatedObject: 'TypeScript',
        linkView: 'roadmap'
      },
      {
        id: 'act-2',
        timestamp: 'Yesterday, 3:20 PM',
        actionType: 'applied_job',
        title: 'Job Application Submitted',
        subtitle: 'Frontend Engineer at Vanguard Systems',
        relatedObject: 'Vanguard Systems',
        linkView: 'applications'
      },
      {
        id: 'act-3',
        timestamp: 'Oct 17, 2:15 PM',
        actionType: 'mock_interview',
        title: 'Mock Interview Evaluated',
        subtitle: 'STAR Answer Scored 9/10 with Gemini AI',
        relatedObject: 'Frontend Engineer',
        linkView: 'interviews'
      },
      {
        id: 'act-4',
        timestamp: 'Oct 15, 11:00 AM',
        actionType: 'added_evidence',
        title: 'Attached Proof of Skill',
        subtitle: 'Accessible Design System Repository verified',
        relatedObject: 'React & TypeScript',
        linkView: 'evidence'
      }
    ];
  });

  const logActivity = (item: Omit<UserActivityItem, 'id' | 'timestamp'>) => {
    const newAct: UserActivityItem = {
      ...item,
      id: `act-${Date.now()}`,
      timestamp: 'Just now'
    };
    setActivities(prev => [newAct, ...prev]);
  };

  // Documents Center
  const [documents, setDocuments] = useState<CareerDocument[]>(() => {
    const saved = localStorage.getItem('careerpilot_documents');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [
      {
        id: 'doc-1',
        name: 'Sarah Jenkins - Frontend Engineer CV.pdf',
        type: 'cv',
        format: 'pdf',
        size: '142 KB',
        updatedAt: '2026-10-18',
        createdAt: '2026-10-10',
        relatedRoleId: 'frontend-engineer',
        isPublic: true,
        contentPreview: 'Detail-oriented Frontend Engineer with 2+ years of experience building accessible, high-performance web applications...'
      },
      {
        id: 'doc-2',
        name: 'Vanguard Systems - Tailored Cover Letter.pdf',
        type: 'cover_letter',
        format: 'pdf',
        size: '85 KB',
        updatedAt: '2026-10-17',
        createdAt: '2026-10-17',
        relatedRoleId: 'frontend-engineer',
        relatedApplicationId: 'app-1',
        isPublic: false,
        contentPreview: 'Dear Hiring Team at Vanguard Systems, I am writing to express my strong enthusiasm for the Frontend Engineer position...'
      },
      {
        id: 'doc-3',
        name: 'Meta Front-End Developer Certificate.pdf',
        type: 'certificate',
        format: 'pdf',
        size: '1.2 MB',
        updatedAt: '2024-02-18',
        createdAt: '2024-02-18',
        isPublic: true,
        contentPreview: 'Professional certification verifying React, Web Fundamentals, and UX Development mastery.'
      },
      {
        id: 'doc-4',
        name: 'Accessible UI Design System Case Study.pdf',
        type: 'portfolio',
        format: 'pdf',
        size: '3.4 MB',
        updatedAt: '2026-09-20',
        createdAt: '2026-09-20',
        isPublic: true,
        contentPreview: 'Deep technical architecture guide outlining keyboard focus management, WCAG 2.1 compliance, and automated testing.'
      }
    ];
  });

  const addDocument = (doc: Omit<CareerDocument, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newDoc: CareerDocument = {
      ...doc,
      id: `doc-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0]
    };
    setDocuments(prev => [newDoc, ...prev]);
    logActivity({
      actionType: 'document_saved',
      title: 'Added Document',
      subtitle: doc.name,
      linkView: 'documents'
    });
  };

  const updateDocument = (id: string, updates: Partial<CareerDocument>) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...updates, updatedAt: new Date().toISOString().split('T')[0] } : d));
  };

  const deleteDocument = (id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
  };

  // Cover Letters Studio
  const [coverLetters, setCoverLetters] = useState<CoverLetter[]>(() => {
    const saved = localStorage.getItem('careerpilot_cover_letters');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [
      {
        id: 'cl-1',
        title: 'Vanguard Systems — Frontend Engineer',
        company: 'Vanguard Systems',
        role: 'Frontend Engineer (React / TypeScript)',
        jobDescription: 'Seeking experienced Frontend Engineer to build high-scale, accessible web systems using modern React 19, strict TypeScript, and automated testing.',
        content: `Dear Hiring Team at Vanguard Systems,\n\nI am writing to express my strong enthusiasm for the Frontend Engineer position. With my background in architecting accessible, high-performance web applications at Meridian Tech Labs and my dedication to engineering velocity, I am excited about the prospect of contributing directly to Vanguard Systems' mission.\n\nThroughout my work, I have consistently translated complex product requirements into reliable, clean component architectures. My hands-on experience spearheading a 25+ component WCAG 2.1 AA design system and optimizing Largest Contentful Paint from 3.2s to 1.1s directly matches your emphasis on performance and scale. What excites me most about Vanguard Systems is your focus on resilient enterprise software, and I am eager to bring my problem-solving mindset and technical discipline to your frontend team.\n\nThank you for considering my application. I look forward to the opportunity to discuss how my skill set aligns with your engineering roadmap.\n\nWarm regards,\nSarah Jenkins`,
        createdAt: '2026-10-17',
        updatedAt: '2026-10-17',
        keyHighlights: [
          'Spearheading accessible design systems (WCAG 2.1 AA)',
          'Core Web Vitals performance optimization (3.2s to 1.1s LCP)',
          'Strict TypeScript and agile squad delivery'
        ],
        targetJobId: 'job-fe-01',
        applicationId: 'app-1'
      }
    ];
  });

  const saveCoverLetter = (cl: Omit<CoverLetter, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    if (cl.id) {
      setCoverLetters(prev => prev.map(item => item.id === cl.id ? {
        ...item,
        ...cl,
        updatedAt: new Date().toISOString().split('T')[0]
      } : item));
    } else {
      const newCl: CoverLetter = {
        ...cl,
        id: `cl-${Date.now()}`,
        createdAt: new Date().toISOString().split('T')[0],
        updatedAt: new Date().toISOString().split('T')[0]
      };
      setCoverLetters(prev => [newCl, ...prev]);
      logActivity({
        actionType: 'document_saved',
        title: 'Created Tailored Cover Letter',
        subtitle: `${cl.role} at ${cl.company}`,
        linkView: 'documents'
      });
    }
  };

  const deleteCoverLetter = (id: string) => {
    setCoverLetters(prev => prev.filter(c => c.id !== id));
  };

  const generateAiCoverLetter = async (company: string, jobTitle: string, jobDesc: string, tone = 'Professional & Confident') => {
    try {
      const res = await fetch('/api/generate-cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      return {
        coverLetter: data.coverLetter || '',
        keyHighlights: data.keyHighlights || []
      };
    } catch (e) {
      console.error('Error generating cover letter:', e);
      return {
        coverLetter: `Dear Hiring Team at ${company},\n\nI am thrilled to apply for the ${jobTitle} opportunity. With proven experience engineering modern, scalable web applications and optimizing user experiences, I am confident in my ability to make an immediate positive contribution to your team.\n\nWarm regards,\n${profile.name}`,
        keyHighlights: ['Direct role alignment', 'Authentic candidate grounding']
      };
    }
  };

  // AI Summary Assistant
  const suggestAiSummary = async (): Promise<string> => {
    try {
      const res = await fetch('/api/suggest-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      return data.suggestedSummary || profile.professionalSummary;
    } catch (e) {
      return `Results-driven ${targetRole.title} with 2+ years of software engineering experience specializing in React, TypeScript, and accessible component architectures. Demonstrated track record of optimizing application performance and delivering high-impact product features.`;
    }
  };

  // Username validation
  const validateUsername = async (username: string): Promise<{ available: boolean; message: string }> => {
    try {
      const res = await fetch(`/api/profile/check-username?username=${encodeURIComponent(username)}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      const data = await res.json();
      return {
        available: data.available,
        message: data.message
      };
    } catch (e) {
      return { available: true, message: 'Username valid' };
    }
  };

  // CV Version Controls
  const duplicateCVVersion = (versionId: string) => {
    const existing = cvVersions.find(v => v.id === versionId);
    if (!existing) return;
    const duplicated: CVVersion = {
      ...existing,
      id: `cv-v${Date.now()}`,
      name: `${existing.name} (Copy)`,
      createdAt: new Date().toISOString().split('T')[0]
    };
    setCvVersions(prev => [...prev, duplicated]);
    logActivity({
      actionType: 'uploaded_cv',
      title: 'Duplicated CV Version',
      subtitle: duplicated.name,
      linkView: 'cv-studio'
    });
  };

  const renameCVVersion = (versionId: string, newName: string) => {
    setCvVersions(prev => prev.map(v => v.id === versionId ? { ...v, name: newName } : v));
  };

  const deleteCVVersion = (versionId: string) => {
    if (cvVersions.length <= 1) return;
    setCvVersions(prev => prev.filter(v => v.id !== versionId));
  };

  // Job Bookmarks
  const [bookmarkedJobIds, setBookmarkedJobIds] = useState<string[]>(['job-fe-01', 'job-fs-02']);
  const toggleBookmarkJob = (jobId: string) => {
    setBookmarkedJobIds(prev => prev.includes(jobId) ? prev.filter(id => id !== jobId) : [...prev, jobId]);
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
  const syncStateToServer = async () => {
    try {
      const statePayload = {
        profile,
        targetRole,
        savedRoles,
        skills,
        roadmapPhases,
        projects,
        evidenceItems,
        activeCV,
        cvVersions,
        applications,
        interviewSessions,
        settings
      };
      await fetch('/api/state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(statePayload)
      });
    } catch (e) {
      console.warn('Background state sync to server failed:', e);
    }
  };

  useEffect(() => {
    localStorage.setItem('careerpilot_profile', JSON.stringify(profile));
    localStorage.setItem('careerpilot_target_role', JSON.stringify(targetRole));
    localStorage.setItem('careerpilot_skills', JSON.stringify(skills));
    localStorage.setItem('careerpilot_roadmap', JSON.stringify(roadmapPhases));
    localStorage.setItem('careerpilot_settings', JSON.stringify(settings));
    syncStateToServer();
  }, [profile, targetRole, skills, roadmapPhases, settings, projects, evidenceItems, applications]);

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

  // Compute Daily Career Actions
  const [dailyActions, setDailyActions] = useState<DailyCareerAction[]>([
    {
      id: 'da-1',
      title: 'Complete Jest Reducer Unit Test Suite',
      description: 'Strengthen test assertions to close the automated testing gap.',
      category: 'roadmap',
      priority: 'high',
      completed: false,
      actionView: 'roadmap',
      reason: 'Directly addresses your primary skill gap for Frontend Engineer.'
    },
    {
      id: 'da-2',
      title: 'Refine STAR Story for Vanguard Systems Interview',
      description: 'Practice the technical roadblock question in Mock Interview Simulator.',
      category: 'interview',
      priority: 'high',
      completed: false,
      actionView: 'interviews',
      reason: 'Scheduled technical interview on October 22.'
    },
    {
      id: 'da-3',
      title: 'Deploy Storybook Documentation for Accessible UI Project',
      description: 'Attach public live demo URL as verified portfolio evidence.',
      category: 'project',
      priority: 'medium',
      completed: true,
      actionView: 'projects',
      reason: 'Provides verifiable proof for hiring managers.'
    }
  ]);

  const toggleDailyAction = (id: string) => {
    setDailyActions(prev => prev.map(a => a.id === id ? { ...a, completed: !a.completed } : a));
  };

  // Compute Weekly Career Review
  const weeklyReview: WeeklyCareerReview = {
    weekNumber: 42,
    startDate: 'Oct 12, 2026',
    endDate: 'Oct 19, 2026',
    completedTasksCount: 4,
    skillsAdvancedCount: 2,
    applicationsCount: 2,
    interviewsCount: 1,
    keyAchievements: [
      'Mastered TypeScript Generics and advanced discriminated unions',
      'Advanced to Round 2 Technical Interview with Vanguard Systems',
      'Reached 84% ATS match score in CV Studio'
    ],
    nextWeekPriorities: [
      'Finalize Playwright cross-browser onboarding test workflow',
      'Complete Vanguard Systems Lead Architect technical drill'
    ],
    healthScore: 88
  };

  // Compute Career Health Dimensions (Explainable)
  const careerHealth: CareerHealthDimensions = {
    skillsConfidence: Math.round((skills.filter(s => s.gap === 0).length / skills.length) * 100),
    evidenceCoverage: Math.min(100, evidenceItems.length * 25),
    roadmapVelocity: 75,
    cvAlignment: cvVersions[0]?.atsAnalysis?.overallScore || 84,
    marketEngagement: Math.min(100, applications.length * 35),
    overallHealth: 85
  };

  // Authentication Handlers
  const login = async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAuthToken(data.token);
        setCurrentUser(data.user);
        localStorage.setItem('careerpilot_token', data.token);
        localStorage.setItem('careerpilot_user', JSON.stringify(data.user));
        return { success: true };
      }
      return { success: false, error: data.error || 'Invalid credentials' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Connection failed' };
    }
  };

  const register = async (name: string, email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAuthToken(data.token);
        setCurrentUser(data.user);
        setProfile(prev => ({ ...prev, name, email }));
        localStorage.setItem('careerpilot_token', data.token);
        localStorage.setItem('careerpilot_user', JSON.stringify(data.user));
        return { success: true };
      }
      return { success: false, error: data.error || 'Registration failed' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Connection failed' };
    }
  };

  const logout = () => {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    }).catch(() => {});
    setAuthToken(null);
    setCurrentUser(null);
    localStorage.removeItem('careerpilot_token');
    localStorage.removeItem('careerpilot_user');
  };

  // Target Role Change Handler
  const setPrimaryTargetRole = (roleId: string) => {
    const role = TARGET_ROLES.find(r => r.id === roleId);
    if (!role) return;
    setTargetRole(role);

    setSkills(prevSkills => {
      return prevSkills.map(s => {
        const req = role.requiredSkills.find(r => r.name.toLowerCase() === s.name.toLowerCase());
        const pref = role.preferredSkills.find(p => p.name.toLowerCase() === s.name.toLowerCase());
        const target = req ? req.minLevel : pref ? pref.minLevel : 3;
        return {
          ...s,
          targetLevel: target,
          gap: Math.max(0, target - s.currentLevel)
        };
      });
    });

    setRoadmapPhases(generateInitialRoadmap(role));
  };

  const saveRole = (role: TargetRole) => {
    if (!savedRoles.some(r => r.id === role.id)) {
      setSavedRoles(prev => [...prev, role]);
    }
  };

  const removeSavedRole = (roleId: string) => {
    setSavedRoles(prev => prev.filter(r => r.id !== roleId));
  };

  const updateProfile = (updates: Partial<UserProfile>) => {
    setProfile(prev => ({ ...prev, ...updates }));
  };

  const setCareerState = (state: CareerState) => {
    setProfile(prev => ({ ...prev, careerState: state }));
  };

  const setCareerGoal = (goal: CareerGoal, customText?: string) => {
    setProfile(prev => ({ ...prev, careerGoal: goal, customGoalText: customText }));
  };

  const completeOnboarding = () => {
    setProfile(prev => ({ ...prev, onboardingCompleted: true }));
  };

  const updateSkillLevel = (skillId: string, currentLevel: number) => {
    setSkills(prev => prev.map(s => {
      if (s.id === skillId) {
        return {
          ...s,
          currentLevel,
          gap: Math.max(0, s.targetLevel - currentLevel),
          lastUpdated: new Date().toISOString().split('T')[0]
        };
      }
      return s;
    }));
  };

  const addCustomSkill = (skill: Omit<UserSkill, 'id' | 'gap' | 'lastUpdated'>) => {
    const newSkill: UserSkill = {
      ...skill,
      id: `sk-custom-${Date.now()}`,
      gap: Math.max(0, skill.targetLevel - skill.currentLevel),
      lastUpdated: new Date().toISOString().split('T')[0]
    };
    setSkills(prev => [...prev, newSkill]);
  };

  const removeSkill = (skillId: string) => {
    setSkills(prev => prev.filter(s => s.id !== skillId));
  };

  const refreshAiAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/analyze-career', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetRole,
          userSkills: skills,
          careerState: profile.careerState,
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAnalysis(data);
      }
    } catch (e) {
      console.error('Failed to run AI analysis:', e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateTaskStatus = (taskId: string, status: RoadmapTaskStatus) => {
    setRoadmapPhases(prevPhases => {
      return prevPhases.map(phase => {
        const updatedMilestones = phase.milestones.map(milestone => {
          const updatedTasks = milestone.tasks.map(t => {
            if (t.id === taskId) {
              return { ...t, status };
            }
            return t;
          });
          const completedCount = updatedTasks.filter(t => t.status === 'completed').length;
          return {
            ...milestone,
            tasks: updatedTasks,
            completedTasksCount: completedCount
          };
        });
        return {
          ...phase,
          milestones: updatedMilestones
        };
      });
    });
  };

  const addTask = (phaseId: string, milestoneId: string, task: Omit<RoadmapTask, 'id'>) => {
    const newTask: RoadmapTask = {
      ...task,
      id: `task-${Date.now()}`
    };
    setRoadmapPhases(prev => {
      return prev.map(p => {
        if (p.id !== phaseId) return p;
        return {
          ...p,
          milestones: p.milestones.map(m => {
            if (m.id !== milestoneId) return m;
            return {
              ...m,
              tasks: [...m.tasks, newTask]
            };
          })
        };
      });
    });
  };

  const enrollInRoadmap = () => {
    setIsEnrolledInRoadmap(true);
  };

  const toggleResourceEnrollment = (resourceId: string) => {
    setEnrolledResourceIds(prev => 
      prev.includes(resourceId) ? prev.filter(id => id !== resourceId) : [...prev, resourceId]
    );
  };

  const addProject = (project: Omit<CareerProject, 'id' | 'createdAt'>) => {
    const newProj: CareerProject = {
      ...project,
      id: `proj-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0]
    };
    setProjects(prev => [newProj, ...prev]);
  };

  const updateProject = (projectId: string, updates: Partial<CareerProject>) => {
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, ...updates } : p));
  };

  const deleteProject = (projectId: string) => {
    setProjects(prev => prev.filter(p => p.id !== projectId));
  };

  const addEvidence = (evidence: Omit<EvidenceItem, 'id' | 'dateAdded'>) => {
    const newEv: EvidenceItem = {
      ...evidence,
      id: `ev-${Date.now()}`,
      dateAdded: new Date().toISOString().split('T')[0]
    };
    setEvidenceItems(prev => [newEv, ...prev]);
  };

  const deleteEvidence = (evidenceId: string) => {
    setEvidenceItems(prev => prev.filter(e => e.id !== evidenceId));
  };

  const updateCV = (updates: Partial<CVProfile>) => {
    setActiveCV(prev => ({ ...prev, ...updates }));
  };

  const saveCVVersion = (name: string) => {
    const newVer: CVVersion = {
      id: `cv-v-${Date.now()}`,
      name,
      targetRoleTitle: targetRole.title,
      createdAt: new Date().toISOString().split('T')[0],
      profile: activeCV,
      atsAnalysis: cvVersions[0]?.atsAnalysis
    };
    setCvVersions(prev => [newVer, ...prev]);
  };

  // Real CV Upload Pipeline implementation
  const uploadCvFile = async (file: File): Promise<{ success: boolean; error?: string }> => {
    setIsUploadingCv(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('targetRoleTitle', targetRole.title);

      const res = await fetch('/api/resumes/upload', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to parse CV');
      }

      if (data.cv) {
        setActiveCV(data.cv);
        const newVer: CVVersion = {
          id: `cv-v-${Date.now()}`,
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
      const res = await fetch('/api/optimize-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      }
    } catch (e) {
      console.error('Failed to optimize CV:', e);
    } finally {
      setIsOptimizingCV(false);
    }
  };

  const addApplication = (application: Omit<JobApplication, 'id' | 'lastUpdated'>) => {
    const newApp: JobApplication = {
      ...application,
      id: `app-${Date.now()}`,
      lastUpdated: new Date().toISOString().split('T')[0]
    };
    setApplications(prev => [newApp, ...prev]);
  };

  const updateApplicationStage = (id: string, stage: ApplicationStage) => {
    setApplications(prev => prev.map(a => a.id === id ? { ...a, stage, lastUpdated: new Date().toISOString().split('T')[0] } : a));
  };

  const updateApplicationNotes = (id: string, notes: string, nextAction?: string, nextActionDate?: string) => {
    setApplications(prev => prev.map(a => a.id === id ? {
      ...a,
      notes,
      nextAction: nextAction !== undefined ? nextAction : a.nextAction,
      nextActionDate: nextActionDate !== undefined ? nextActionDate : a.nextActionDate,
      lastUpdated: new Date().toISOString().split('T')[0]
    } : a));
  };

  const deleteApplication = (id: string) => {
    setApplications(prev => prev.filter(a => a.id !== id));
  };

  const saveInterviewSession = (session: Omit<MockInterviewSession, 'id' | 'createdAt'>) => {
    const newSession: MockInterviewSession = {
      ...session,
      id: `mock-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0]
    };
    setInterviewSessions(prev => [newSession, ...prev]);
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

      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      }
    } catch (e) {
      console.error(e);
      const fallbackMsg: CopilotMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'assistant',
        text: `Based on your profile targeting "${targetRole.title}", your top priority is addressing the ${analysis.criticalGaps[0]?.skill || 'core requirements'} gap. What specific questions do you have about this area?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestions: ['How to prepare for technical interview', 'Review my portfolio project idea', 'Optimize my CV']
      };
      setCopilotMessages(prev => [...prev, fallbackMsg]);
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

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const updateSettings = (updates: Partial<UserSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
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
    localStorage.clear();
    window.location.reload();
  };

  return (
    <CareerContext.Provider
      value={{
        currentUser,
        authToken,
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
        updateDocument,
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
        learningResources,
        enrolledResourceIds,
        toggleResourceEnrollment,
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
