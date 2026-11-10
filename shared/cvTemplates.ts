/**
 * The CV template catalogue.
 *
 * A template is not a colour and a font. The two things that make a document
 * read differently are its STRUCTURE — where the header sits, which column a
 * section lives in, how an entry is set, how skills are listed — and the
 * order in which the reader meets the sections. This module describes those
 * structural decisions as data, so that:
 *
 *   - the renderer can draw any template from one engine;
 *   - a test can prove that no two templates share a structure, without
 *     looking at colour or typography;
 *   - the server can authorise a template without importing React.
 *
 * Exactly THREE templates are free — an ATS-safe plain one, a modern
 * two-column one and a timeline one — so that a candidate with no plan can
 * still choose between genuinely different documents. Every other template is
 * premium and the SERVER decides: a premium template needs an active,
 * verified paid plan, never a client flag and never a temporary-access
 * payment that an administrator has not verified.
 *
 * Enforcement is therefore ON by default. It can be switched off with
 * `CV_TEMPLATE_PREMIUM_ENFORCEMENT=false` for a launch that is free for
 * everyone, but the product's own rule is the one that applies unless the
 * owner says otherwise.
 */

import type { SubscriptionPlanCode } from './subscriptions.ts';

/* -------------------------------------------------------------------------- */
/* Sections                                                                   */
/* -------------------------------------------------------------------------- */

/** Every section a CV document can carry. */
export const CV_SECTION_KEYS = [
  'summary',
  'experience',
  'projects',
  'education',
  'skills',
  'certifications',
  'courses',
  'internships',
  'volunteering',
  'languages',
  'awards',
  'publications',
  'research',
  'leadership',
  'links',
] as const;

export type CvSectionKey = (typeof CV_SECTION_KEYS)[number];

/** The reading order most recruiters expect. */
export const DEFAULT_CV_SECTION_ORDER: readonly CvSectionKey[] = [
  'summary',
  'experience',
  'projects',
  'education',
  'skills',
  'certifications',
  'courses',
  'internships',
  'volunteering',
  'languages',
  'awards',
  'publications',
  'research',
  'leadership',
  'links',
];

/* -------------------------------------------------------------------------- */
/* Categories                                                                 */
/* -------------------------------------------------------------------------- */

export const CV_TEMPLATE_CATEGORY_IDS = [
  'ats',
  'professional',
  'modern',
  'creative',
  'executive',
  'academic',
  'technical',
] as const;

export type CvTemplateCategoryId = (typeof CV_TEMPLATE_CATEGORY_IDS)[number];

export interface CvTemplateCategory {
  id: CvTemplateCategoryId;
  label: string;
  labelAr: string;
  description: string;
}

export const CV_TEMPLATE_CATEGORIES: readonly CvTemplateCategory[] = [
  {
    id: 'ats',
    label: 'ATS Essentials',
    labelAr: 'أساسيات ATS',
    description: 'Plain, parser-safe structures for online application systems.',
  },
  {
    id: 'professional',
    label: 'Professional',
    labelAr: 'احترافية',
    description: 'Traditional corporate layouts for established organisations.',
  },
  {
    id: 'modern',
    label: 'Modern',
    labelAr: 'عصرية',
    description: 'Contemporary layouts with a clear visual hierarchy.',
  },
  {
    id: 'creative',
    label: 'Creative',
    labelAr: 'إبداعية',
    description: 'Expressive structures for design, media and portfolio work.',
  },
  {
    id: 'executive',
    label: 'Executive',
    labelAr: 'تنفيذية',
    description: 'Senior layouts that lead with scope, impact and leadership.',
  },
  {
    id: 'academic',
    label: 'Academic',
    labelAr: 'أكاديمية',
    description: 'Research-first documents for universities and fellowships.',
  },
  {
    id: 'technical',
    label: 'Technical',
    labelAr: 'تقنية',
    description: 'Engineering layouts that foreground systems and evidence.',
  },
];

/** True when a value names a template category. */
export function isCvTemplateCategory(value: unknown): value is CvTemplateCategoryId {
  return (
    typeof value === 'string' &&
    (CV_TEMPLATE_CATEGORY_IDS as readonly string[]).includes(value)
  );
}

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

/** The structural families the renderer implements. */
export const CV_TEMPLATE_LAYOUTS = [
  'single',
  'sidebar-left',
  'sidebar-right',
  'banner',
  'timeline',
  'editorial',
  'academic',
  'cards',
  'compact',
  'split',
] as const;

export type CvTemplateLayout = (typeof CV_TEMPLATE_LAYOUTS)[number];

export const CV_HEADER_STYLES = [
  'centered',
  'left',
  'banner',
  'split',
  'monogram',
  'stacked',
  'editorial',
  'compact',
] as const;
export type CvHeaderStyle = (typeof CV_HEADER_STYLES)[number];

export const CV_DIVIDER_STYLES = ['line', 'none', 'double', 'accent', 'block'] as const;
export type CvDividerStyle = (typeof CV_DIVIDER_STYLES)[number];

export const CV_HEADING_STYLES = [
  'uppercase',
  'smallcaps',
  'serif',
  'numbered',
  'bar',
  'underline',
] as const;
export type CvHeadingStyle = (typeof CV_HEADING_STYLES)[number];

export const CV_BULLET_STYLES = ['disc', 'dash', 'square', 'arrow', 'none'] as const;
export type CvBulletStyle = (typeof CV_BULLET_STYLES)[number];

export const CV_ENTRY_STYLES = ['stacked', 'inline', 'timeline', 'card', 'grid'] as const;
export type CvEntryStyle = (typeof CV_ENTRY_STYLES)[number];

export const CV_SKILLS_STYLES = ['inline', 'chips', 'grouped', 'bars', 'columns'] as const;
export type CvSkillsStyle = (typeof CV_SKILLS_STYLES)[number];

export const CV_DENSITIES = ['compact', 'standard', 'spacious'] as const;
export type CvDensity = (typeof CV_DENSITIES)[number];

export const CV_ACCENT_POSITIONS = ['none', 'top', 'side', 'heading', 'border'] as const;
export type CvAccentPosition = (typeof CV_ACCENT_POSITIONS)[number];

export const CV_TYPOGRAPHY = ['sans', 'serif', 'mono', 'mixed'] as const;
export type CvTypography = (typeof CV_TYPOGRAPHY)[number];

/**
 * The structural description of a template.
 *
 * Every field here changes the DOCUMENT, not its decoration. Colour and
 * typography are deliberately excluded from the uniqueness signature: two
 * templates that differ only in accent colour are the same template.
 */
export interface CvTemplateStructure {
  layout: CvTemplateLayout;
  header: CvHeaderStyle;
  /** The order every section is read in. */
  sectionOrder: readonly CvSectionKey[];
  /** The sections placed in the aside column, when the layout has one. */
  sidebarSections: readonly CvSectionKey[];
  dividers: CvDividerStyle;
  headingStyle: CvHeadingStyle;
  bulletStyle: CvBulletStyle;
  entryStyle: CvEntryStyle;
  skillsStyle: CvSkillsStyle;
  density: CvDensity;
  accentPosition: CvAccentPosition;
  /** Icons are decorative; they are still part of what the reader sees. */
  showIcons: boolean;
}

/** The fields that make a template structurally unique. */
export function cvTemplateStructuralSignature(
  structure: CvTemplateStructure
): string {
  return [
    structure.layout,
    structure.header,
    structure.sectionOrder.join('>'),
    structure.sidebarSections.join('>') || '-',
    structure.dividers,
    structure.headingStyle,
    structure.bulletStyle,
    structure.entryStyle,
    structure.skillsStyle,
    structure.density,
    structure.accentPosition,
    structure.showIcons ? 'icons' : 'no-icons',
  ].join('|');
}

/* -------------------------------------------------------------------------- */
/* Template definitions                                                       */
/* -------------------------------------------------------------------------- */

export type CvTemplateTier = 'free' | 'premium';

export interface CvTemplateDefinition {
  id: string;
  name: string;
  nameAr: string;
  category: CvTemplateCategoryId;
  tier: CvTemplateTier;
  featured: boolean;
  /** Where the template sits in its category. */
  order: number;
  description: string;
  descriptionAr: string;
  bestFor: string;
  tags: readonly string[];
  /** Plain-language note on how the document is laid out. */
  layoutLabel: string;
  layoutLabelAr: string;
  atsFriendly: boolean;
  supportsRtl: boolean;
  /** The visual accent. Never part of the uniqueness signature. */
  accent: string;
  typography: CvTypography;
  structure: CvTemplateStructure;
  /** Built-in templates ship with the code; admin templates are metadata rows. */
  source: 'builtin' | 'admin';
  /** For an admin-authored template, the built-in structure it reuses. */
  baseTemplateId?: string;
  /** An administrator-supplied preview image, when one is set. */
  thumbnailUrl?: string;
  /** True when an administrator has disabled the template. */
  disabled?: boolean;
}

/**
 * A template without its layout.
 *
 * The server sends the name, the description and the category of every
 * template, so the library can show what a template is, but it sends the
 * LAYOUT only to a candidate who may use it. The parts of the catalogue that
 * only read metadata — the filter, the recommendation — work on this shape.
 */
export type CvTemplateMetadata = Omit<CvTemplateDefinition, 'structure'>;

interface TemplateSeed {
  id: string;
  name: string;
  nameAr: string;
  category: CvTemplateCategoryId;
  tier?: CvTemplateTier;
  featured?: boolean;
  description: string;
  descriptionAr: string;
  bestFor: string;
  tags: string[];
  accent: string;
  typography: CvTypography;
  atsFriendly?: boolean;
  structure: Partial<CvTemplateStructure> & Pick<CvTemplateStructure, 'layout'>;
}

/** Fills in every structural field a seed did not state. */
function defineTemplate(seed: TemplateSeed, order: number): CvTemplateDefinition {
  const structure: CvTemplateStructure = {
    header: 'centered',
    sectionOrder: DEFAULT_CV_SECTION_ORDER,
    sidebarSections: [],
    dividers: 'line',
    headingStyle: 'uppercase',
    bulletStyle: 'disc',
    entryStyle: 'stacked',
    skillsStyle: 'inline',
    density: 'standard',
    accentPosition: 'none',
    showIcons: false,
    ...seed.structure,
  };

  const layoutLabels: Record<CvTemplateLayout, { en: string; ar: string }> = {
    single: { en: 'Single column', ar: 'عمود واحد' },
    'sidebar-left': { en: 'Left sidebar', ar: 'شريط جانبي أيسر' },
    'sidebar-right': { en: 'Right sidebar', ar: 'شريط جانبي أيمن' },
    banner: { en: 'Header banner', ar: 'ترويسة عريضة' },
    timeline: { en: 'Timeline', ar: 'خط زمني' },
    editorial: { en: 'Editorial', ar: 'تحريري' },
    academic: { en: 'Academic record', ar: 'سجل أكاديمي' },
    cards: { en: 'Card grid', ar: 'شبكة بطاقات' },
    compact: { en: 'Compact', ar: 'مدمج' },
    split: { en: 'Split header', ar: 'ترويسة منقسمة' },
  };

  return {
    id: seed.id,
    name: seed.name,
    nameAr: seed.nameAr,
    category: seed.category,
    tier: seed.tier ?? 'premium',
    featured: seed.featured ?? false,
    order,
    description: seed.description,
    descriptionAr: seed.descriptionAr,
    bestFor: seed.bestFor,
    tags: seed.tags,
    layoutLabel: layoutLabels[structure.layout].en,
    layoutLabelAr: layoutLabels[structure.layout].ar,
    atsFriendly: seed.atsFriendly ?? false,
    supportsRtl: true,
    accent: seed.accent,
    typography: seed.typography,
    structure,
    source: 'builtin',
  };
}

/* The section orders used below. Named so the intent is readable and so a
 * template's reading order is a decision rather than an accident. */
const ORDER_ATS: readonly CvSectionKey[] = [
  'summary',
  'skills',
  'experience',
  'education',
  'projects',
  'certifications',
  'courses',
  'internships',
  'volunteering',
  'languages',
  'awards',
  'publications',
  'research',
  'leadership',
  'links',
];

const ORDER_CORPORATE: readonly CvSectionKey[] = [
  'summary',
  'experience',
  'education',
  'skills',
  'certifications',
  'projects',
  'volunteering',
  'languages',
  'awards',
  'courses',
  'internships',
  'leadership',
  'publications',
  'research',
  'links',
];

const ORDER_RESEARCH: readonly CvSectionKey[] = [
  'summary',
  'research',
  'publications',
  'education',
  'experience',
  'projects',
  'awards',
  'certifications',
  'skills',
  'leadership',
  'courses',
  'internships',
  'volunteering',
  'languages',
  'links',
];

const ORDER_TECHNICAL: readonly CvSectionKey[] = [
  'summary',
  'skills',
  'experience',
  'projects',
  'education',
  'certifications',
  'courses',
  'research',
  'awards',
  'leadership',
  'internships',
  'volunteering',
  'languages',
  'publications',
  'links',
];

const ORDER_PORTFOLIO: readonly CvSectionKey[] = [
  'summary',
  'projects',
  'experience',
  'skills',
  'education',
  'awards',
  'certifications',
  'courses',
  'volunteering',
  'leadership',
  'internships',
  'languages',
  'publications',
  'research',
  'links',
];

const ORDER_TEACHING: readonly CvSectionKey[] = [
  'summary',
  'education',
  'experience',
  'publications',
  'research',
  'projects',
  'awards',
  'leadership',
  'certifications',
  'skills',
  'courses',
  'volunteering',
  'internships',
  'languages',
  'links',
];

/* -------------------------------------------------------------------------- */
/* The 35 templates                                                           */
/* -------------------------------------------------------------------------- */

const SEEDS: readonly TemplateSeed[] = [
  /* ---- ATS Essentials ---------------------------------------------------- */
  {
    id: 'ats-classic',
    name: 'Minimal ATS-Friendly',
    nameAr: 'ATS بسيط وآمن',
    category: 'ats',
    tier: 'free',
    featured: true,
    description:
      'One column, standard headings and no decoration. The document a parser reads exactly as a recruiter does.',
    descriptionAr:
      'عمود واحد وعناوين قياسية بلا زخرفة. المستند الذي يقرأه نظام التتبع تمامًا كما يقرأه المسؤول.',
    bestFor: 'Every application, especially large employers and job boards.',
    tags: ['ATS', 'single column', 'parser safe', 'free'],
    accent: '#334155',
    typography: 'sans',
    atsFriendly: true,
    structure: {
      layout: 'single',
      header: 'centered',
      sectionOrder: ORDER_ATS,
      dividers: 'line',
      headingStyle: 'uppercase',
      bulletStyle: 'disc',
      entryStyle: 'stacked',
      skillsStyle: 'inline',
      density: 'standard',
      accentPosition: 'none',
    },
  },
  {
    id: 'ats-clean',
    name: 'Clean ATS',
    nameAr: 'ATS نظيفة',
    category: 'ats',
    featured: false,
    description:
      'A left-aligned header and underlined section rules keep the page quiet while every keyword stays in the text layer.',
    descriptionAr:
      'ترويسة محاذاة لليسار وفواصل مسطّرة تُبقي الصفحة هادئة مع بقاء كل كلمة مفتاحية في طبقة النص.',
    bestFor: 'Recruiters who scan the top third of the first page.',
    tags: ['ATS', 'left aligned', 'quiet'],
    accent: '#0f766e',
    typography: 'sans',
    atsFriendly: true,
    structure: {
      layout: 'single',
      header: 'left',
      sectionOrder: ORDER_ATS,
      dividers: 'line',
      headingStyle: 'underline',
      bulletStyle: 'dash',
      entryStyle: 'stacked',
      skillsStyle: 'columns',
      density: 'standard',
      accentPosition: 'heading',
    },
  },
  {
    id: 'ats-compact',
    name: 'Compact ATS',
    nameAr: 'ATS مدمجة',
    category: 'ats',
    description:
      'A dense single column that fits a long career on two pages without shrinking the type below a readable size.',
    descriptionAr:
      'عمود واحد كثيف يستوعب مسيرة طويلة في صفحتين دون تصغير الخط عن حجم مقروء.',
    bestFor: 'Candidates with 10+ years of experience and many roles.',
    tags: ['ATS', 'dense', 'two pages'],
    accent: '#1e3a8a',
    typography: 'sans',
    atsFriendly: true,
    structure: {
      layout: 'compact',
      header: 'compact',
      sectionOrder: ORDER_ATS,
      dividers: 'none',
      headingStyle: 'uppercase',
      bulletStyle: 'disc',
      entryStyle: 'inline',
      skillsStyle: 'inline',
      density: 'compact',
      accentPosition: 'none',
    },
  },
  {
    id: 'ats-keyword',
    name: 'Keyword Focus',
    nameAr: 'تركيز الكلمات المفتاحية',
    category: 'ats',
    description:
      'Opens with a skills matrix and a keyword-rich summary, then the evidence. Built for a role-specific application.',
    descriptionAr:
      'يبدأ بمصفوفة مهارات وملخص غني بالكلمات المفتاحية ثم الأدلة. مصمم لطلب وظيفي محدد.',
    bestFor: 'Tailoring one CV to one advertised role.',
    tags: ['ATS', 'keywords', 'tailoring'],
    accent: '#7c2d12',
    typography: 'sans',
    atsFriendly: true,
    structure: {
      layout: 'single',
      header: 'stacked',
      sectionOrder: ['summary', 'skills', 'experience', 'projects', 'certifications', 'education', 'courses', 'awards', 'languages', 'volunteering', 'internships', 'leadership', 'publications', 'research', 'links'],
      dividers: 'double',
      headingStyle: 'bar',
      bulletStyle: 'square',
      entryStyle: 'stacked',
      skillsStyle: 'chips',
      density: 'standard',
      accentPosition: 'heading',
    },
  },
  {
    id: 'ats-recruiter',
    name: 'Recruiter Scan',
    nameAr: 'مسح المسؤول',
    category: 'ats',
    description:
      'Every role begins with a bold title line and a date rail, so a six-second scan still finds the employer and the years.',
    descriptionAr:
      'كل دور يبدأ بسطر عنوان عريض وعمود تواريخ، حتى يجد المسح السريع صاحب العمل والسنوات.',
    bestFor: 'High-volume applications and agency recruiters.',
    tags: ['ATS', 'scan', 'dates'],
    accent: '#4c1d95',
    typography: 'sans',
    atsFriendly: true,
    structure: {
      layout: 'single',
      header: 'left',
      sectionOrder: ['summary', 'experience', 'education', 'skills', 'certifications', 'projects', 'courses', 'internships', 'volunteering', 'languages', 'awards', 'leadership', 'publications', 'research', 'links'],
      dividers: 'line',
      headingStyle: 'smallcaps',
      bulletStyle: 'disc',
      entryStyle: 'inline',
      skillsStyle: 'grouped',
      density: 'standard',
      accentPosition: 'border',
    },
  },

  /* ---- Professional ------------------------------------------------------ */
  {
    id: 'professional-timeline',
    name: 'Professional Timeline',
    nameAr: 'الخط الزمني المهني',
    category: 'professional',
    tier: 'free',
    featured: true,
    description:
      'A vertical rail runs the length of the career, making progression and tenure the first thing a reader sees.',
    descriptionAr:
      'مسار رأسي يمتد بطول المسيرة، فيكون التدرج ومدة البقاء أول ما يراه القارئ.',
    bestFor: 'Steady progression inside one industry.',
    tags: ['timeline', 'progression', 'corporate'],
    accent: '#1d4ed8',
    typography: 'sans',
    structure: {
      layout: 'timeline',
      header: 'left',
      sectionOrder: ORDER_CORPORATE,
      dividers: 'none',
      headingStyle: 'bar',
      bulletStyle: 'dash',
      entryStyle: 'timeline',
      skillsStyle: 'grouped',
      density: 'standard',
      accentPosition: 'side',
    },
  },
  {
    id: 'professional-corporate',
    name: 'Corporate Standard',
    nameAr: 'معيار الشركات',
    category: 'professional',
    description:
      'A centred masthead and ruled sections in the order a corporate HR team expects to read them.',
    descriptionAr:
      'ترويسة مركزية وأقسام مسطّرة بالترتيب الذي يتوقعه فريق الموارد البشرية.',
    bestFor: 'Banks, consultancies and established enterprises.',
    tags: ['corporate', 'traditional', 'HR'],
    accent: '#0f172a',
    typography: 'serif',
    structure: {
      layout: 'single',
      header: 'centered',
      sectionOrder: ORDER_CORPORATE,
      dividers: 'double',
      headingStyle: 'smallcaps',
      bulletStyle: 'disc',
      entryStyle: 'stacked',
      skillsStyle: 'columns',
      density: 'standard',
      accentPosition: 'top',
    },
  },
  {
    id: 'professional-consultant',
    name: 'Consultant Profile',
    nameAr: 'ملف المستشار',
    category: 'professional',
    description:
      'A two-column profile with a narrow evidence rail for engagements, sectors and outcomes.',
    descriptionAr:
      'ملف بعمودين مع مسار أدلة ضيق للارتباطات والقطاعات والنتائج.',
    bestFor: 'Management, strategy and independent consultants.',
    tags: ['consulting', 'two column', 'engagements'],
    accent: '#0369a1',
    typography: 'sans',
    structure: {
      layout: 'sidebar-right',
      header: 'split',
      sectionOrder: ['summary', 'experience', 'projects', 'education', 'certifications', 'leadership', 'awards', 'publications', 'research', 'courses', 'internships', 'volunteering', 'languages', 'links'],
      sidebarSections: ['skills', 'languages', 'certifications', 'awards'],
      dividers: 'line',
      headingStyle: 'bar',
      bulletStyle: 'square',
      entryStyle: 'stacked',
      skillsStyle: 'bars',
      density: 'standard',
      accentPosition: 'side',
    },
  },
  {
    id: 'professional-finance',
    name: 'Finance & Banking',
    nameAr: 'المالية والمصارف',
    category: 'professional',
    description:
      'A conservative serif document with a figures-first summary and a compact certification block.',
    descriptionAr:
      'مستند سيريفي متحفظ بملخص يقدّم الأرقام وكتلة شهادات مدمجة.',
    bestFor: 'Finance, audit, risk and banking roles.',
    tags: ['finance', 'serif', 'conservative'],
    accent: '#14532d',
    typography: 'serif',
    structure: {
      layout: 'single',
      header: 'stacked',
      sectionOrder: ['summary', 'experience', 'education', 'certifications', 'skills', 'projects', 'awards', 'leadership', 'languages', 'courses', 'volunteering', 'publications', 'research', 'internships', 'links'],
      dividers: 'line',
      headingStyle: 'serif',
      bulletStyle: 'dash',
      entryStyle: 'inline',
      skillsStyle: 'columns',
      density: 'compact',
      accentPosition: 'heading',
    },
  },
  {
    id: 'professional-legal',
    name: 'Legal & Compliance',
    nameAr: 'القانون والامتثال',
    category: 'professional',
    description:
      'Numbered sections and a formal register give a legal career the structure of a submission.',
    descriptionAr:
      'أقسام مرقّمة وأسلوب رسمي يمنح المسيرة القانونية بنية المذكرة.',
    bestFor: 'Lawyers, compliance officers and policy roles.',
    tags: ['legal', 'numbered', 'formal'],
    accent: '#3f3f46',
    typography: 'serif',
    structure: {
      layout: 'single',
      header: 'centered',
      sectionOrder: ['summary', 'experience', 'education', 'certifications', 'skills', 'leadership', 'awards', 'publications', 'research', 'languages', 'projects', 'courses', 'volunteering', 'internships', 'links'],
      dividers: 'none',
      headingStyle: 'numbered',
      bulletStyle: 'none',
      entryStyle: 'stacked',
      skillsStyle: 'inline',
      density: 'standard',
      accentPosition: 'none',
    },
  },

  /* ---- Modern ------------------------------------------------------------ */
  {
    id: 'modern-professional',
    name: 'Modern Professional',
    nameAr: 'احترافية عصرية',
    category: 'modern',
    tier: 'free',
    featured: true,
    description:
      'A wide banner header over a two-column body: the profile and the evidence sit side by side, and the evidence column stays full width for the long entries.',
    descriptionAr:
      'ترويسة عريضة فوق متن من عمودين: الملف والأدلة جنبًا إلى جنب، ويبقى عمود الأدلة بعرض كامل للبنود الطويلة.',
    bestFor: 'A candidate who wants their CV to look designed without looking decorated.',
    tags: ['modern', 'two column', 'banner', 'free'],
    accent: '#4f46e5',
    typography: 'sans',
    structure: {
      layout: 'sidebar-left',
      header: 'banner',
      sectionOrder: ORDER_TECHNICAL,
      sidebarSections: ['skills', 'languages', 'certifications'],
      dividers: 'accent',
      headingStyle: 'bar',
      bulletStyle: 'arrow',
      entryStyle: 'stacked',
      skillsStyle: 'chips',
      density: 'standard',
      accentPosition: 'heading',
      showIcons: true,
    },
  },
  {
    id: 'modern-minimal',
    name: 'Minimal Modern',
    nameAr: 'حديث بسيط',
    category: 'modern',
    featured: true,
    description:
      'Wide margins, one accent rule and a lot of white space. The content carries the page.',
    descriptionAr:
      'هوامش واسعة وخط تمييز واحد ومساحة بيضاء كثيرة. المحتوى هو ما يحمل الصفحة.',
    bestFor: 'Product, marketing and operations roles.',
    tags: ['minimal', 'white space', 'modern'],
    accent: '#111827',
    typography: 'sans',
    structure: {
      layout: 'single',
      header: 'left',
      sectionOrder: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'courses', 'awards', 'languages', 'leadership', 'volunteering', 'internships', 'publications', 'research', 'links'],
      dividers: 'none',
      headingStyle: 'uppercase',
      bulletStyle: 'none',
      entryStyle: 'stacked',
      skillsStyle: 'inline',
      density: 'spacious',
      accentPosition: 'top',
    },
  },
  {
    id: 'modern-split',
    name: 'Split Modern',
    nameAr: 'حديث منقسم',
    category: 'modern',
    description:
      'A two-column document: a quiet left rail for facts and a wide right column for the story.',
    descriptionAr:
      'مستند بعمودين: مسار أيسر هادئ للحقائق وعمود أيمن واسع للسرد.',
    bestFor: 'Career changers who need to explain the move.',
    tags: ['two column', 'narrative', 'modern'],
    accent: '#0d9488',
    typography: 'sans',
    structure: {
      layout: 'sidebar-left',
      header: 'split',
      sectionOrder: ['summary', 'experience', 'projects', 'education', 'certifications', 'leadership', 'awards', 'publications', 'research', 'courses', 'internships', 'volunteering', 'languages', 'links'],
      sidebarSections: ['skills', 'languages', 'certifications', 'links'],
      dividers: 'line',
      headingStyle: 'underline',
      bulletStyle: 'disc',
      entryStyle: 'stacked',
      skillsStyle: 'chips',
      density: 'standard',
      accentPosition: 'side',
    },
  },
  {
    id: 'modern-gradient',
    name: 'Gradient Modern',
    nameAr: 'حديث متدرج',
    category: 'modern',
    description:
      'A full-width header band carries the name and contact details, freeing the body for a clean two-column read.',
    descriptionAr:
      'شريط ترويسة بعرض الصفحة يحمل الاسم وبيانات التواصل، ليتفرغ الجسم لقراءة نظيفة بعمودين.',
    bestFor: 'Technology and growth roles in modern companies.',
    tags: ['banner', 'two column', 'modern'],
    accent: '#6d28d9',
    typography: 'sans',
    structure: {
      layout: 'banner',
      header: 'banner',
      sectionOrder: ['summary', 'experience', 'projects', 'education', 'certifications', 'awards', 'leadership', 'publications', 'research', 'courses', 'internships', 'volunteering', 'languages', 'links'],
      sidebarSections: ['skills', 'languages', 'certifications'],
      dividers: 'accent',
      headingStyle: 'bar',
      bulletStyle: 'disc',
      entryStyle: 'stacked',
      skillsStyle: 'chips',
      density: 'standard',
      accentPosition: 'top',
    },
  },
  {
    id: 'modern-card',
    name: 'Card Modern',
    nameAr: 'حديث بطاقات',
    category: 'modern',
    description:
      'Projects and roles sit in bordered cards, which keeps a portfolio-heavy document legible at a glance.',
    descriptionAr:
      'المشاريع والأدوار داخل بطاقات محددة، ما يُبقي المستند الغني بالأعمال مقروءًا سريعًا.',
    bestFor: 'Portfolios with several parallel projects.',
    tags: ['cards', 'projects', 'modern'],
    accent: '#be123c',
    typography: 'sans',
    structure: {
      layout: 'cards',
      header: 'monogram',
      sectionOrder: ['summary', 'projects', 'experience', 'skills', 'education', 'certifications', 'awards', 'courses', 'leadership', 'volunteering', 'internships', 'languages', 'publications', 'research', 'links'],
      dividers: 'block',
      headingStyle: 'bar',
      bulletStyle: 'dash',
      entryStyle: 'card',
      skillsStyle: 'chips',
      density: 'spacious',
      accentPosition: 'border',
    },
  },
  {
    id: 'modern-swiss',
    name: 'Swiss Grid',
    nameAr: 'شبكة سويسرية',
    category: 'modern',
    description:
      'A strict grid, a large typographic name and aligned date columns. Order is the design.',
    descriptionAr:
      'شبكة صارمة واسم طباعي كبير وأعمدة تواريخ محاذاة. الترتيب هو التصميم.',
    bestFor: 'Design-literate readers and structured careers.',
    tags: ['grid', 'swiss', 'typographic'],
    accent: '#dc2626',
    typography: 'sans',
    structure: {
      layout: 'split',
      header: 'editorial',
      sectionOrder: ['summary', 'experience', 'education', 'skills', 'projects', 'certifications', 'awards', 'languages', 'courses', 'leadership', 'volunteering', 'internships', 'publications', 'research', 'links'],
      dividers: 'line',
      headingStyle: 'uppercase',
      bulletStyle: 'none',
      entryStyle: 'grid',
      skillsStyle: 'columns',
      density: 'standard',
      accentPosition: 'heading',
    },
  },

  /* ---- Creative ---------------------------------------------------------- */
  {
    id: 'creative-portfolio',
    name: 'Portfolio Creative',
    nameAr: 'ملف أعمال إبداعي',
    category: 'creative',
    featured: true,
    description:
      'Projects lead the document, with a compact side rail for tools, education and recognition.',
    descriptionAr:
      'المشاريع تتصدر المستند، مع مسار جانبي مدمج للأدوات والتعليم والتقدير.',
    bestFor: 'Designers, illustrators and creative technologists.',
    tags: ['portfolio', 'projects first', 'creative'],
    accent: '#c2410c',
    typography: 'mixed',
    structure: {
      layout: 'sidebar-right',
      header: 'monogram',
      sectionOrder: ORDER_PORTFOLIO,
      sidebarSections: ['skills', 'education', 'certifications', 'languages', 'links'],
      dividers: 'block',
      headingStyle: 'bar',
      bulletStyle: 'arrow',
      entryStyle: 'card',
      skillsStyle: 'chips',
      density: 'spacious',
      accentPosition: 'side',
    },
  },
  {
    id: 'creative-studio',
    name: 'Studio Creative',
    nameAr: 'استوديو إبداعي',
    category: 'creative',
    description:
      'A magazine-style header and a two-column body with a strong accent rule between the columns.',
    descriptionAr:
      'ترويسة بأسلوب المجلات وجسم بعمودين مع خط تمييز قوي بينهما.',
    bestFor: 'Art directors, writers and studio leads.',
    tags: ['magazine', 'two column', 'creative'],
    accent: '#a21caf',
    typography: 'serif',
    structure: {
      layout: 'editorial',
      header: 'editorial',
      sectionOrder: ['summary', 'projects', 'experience', 'skills', 'awards', 'education', 'certifications', 'courses', 'volunteering', 'leadership', 'internships', 'languages', 'publications', 'research', 'links'],
      sidebarSections: ['skills', 'languages', 'awards'],
      dividers: 'double',
      headingStyle: 'serif',
      bulletStyle: 'dash',
      entryStyle: 'stacked',
      skillsStyle: 'grouped',
      density: 'spacious',
      accentPosition: 'side',
    },
  },
  {
    id: 'creative-editorial',
    name: 'Editorial Creative',
    nameAr: 'تحريري إبداعي',
    category: 'creative',
    description:
      'A narrow measure and serif headings make the document read like a profile piece rather than a form.',
    descriptionAr:
      'عرض نصي ضيق وعناوين سيريفية تجعل المستند يُقرأ كملف شخصي لا كنموذج.',
    bestFor: 'Journalism, content and communications.',
    tags: ['editorial', 'serif', 'writing'],
    accent: '#4d7c0f',
    typography: 'serif',
    structure: {
      layout: 'editorial',
      header: 'stacked',
      sectionOrder: ['summary', 'experience', 'projects', 'publications', 'skills', 'education', 'awards', 'certifications', 'courses', 'leadership', 'volunteering', 'languages', 'research', 'internships', 'links'],
      dividers: 'none',
      headingStyle: 'serif',
      bulletStyle: 'none',
      entryStyle: 'stacked',
      skillsStyle: 'inline',
      density: 'spacious',
      accentPosition: 'top',
    },
  },
  {
    id: 'creative-bold',
    name: 'Bold Creative',
    nameAr: 'جريء إبداعي',
    category: 'creative',
    description:
      'An oversized name, a full-width accent band and cards for every role. Confidence is the layout.',
    descriptionAr:
      'اسم كبير وشريط تمييز بعرض الصفحة وبطاقات لكل دور. الثقة هي التصميم.',
    bestFor: 'Creative directors and brand strategists.',
    tags: ['bold', 'banner', 'cards'],
    accent: '#b91c1c',
    typography: 'sans',
    structure: {
      layout: 'banner',
      header: 'banner',
      sectionOrder: ['summary', 'experience', 'projects', 'awards', 'skills', 'education', 'certifications', 'leadership', 'publications', 'courses', 'volunteering', 'internships', 'languages', 'research', 'links'],
      sidebarSections: ['skills', 'awards', 'languages'],
      dividers: 'block',
      headingStyle: 'uppercase',
      bulletStyle: 'square',
      entryStyle: 'card',
      skillsStyle: 'chips',
      density: 'spacious',
      accentPosition: 'top',
    },
  },
  {
    id: 'creative-designer',
    name: 'Designer Showcase',
    nameAr: 'عرض المصمم',
    category: 'creative',
    description:
      'A portfolio grid with a compact identity block and a skills matrix across the foot of the page.',
    descriptionAr:
      'شبكة أعمال مع كتلة هوية مدمجة ومصفوفة مهارات أسفل الصفحة.',
    bestFor: 'Product designers and UX researchers.',
    tags: ['grid', 'portfolio', 'design'],
    accent: '#0e7490',
    typography: 'mixed',
    structure: {
      layout: 'cards',
      header: 'compact',
      sectionOrder: ['projects', 'summary', 'experience', 'education', 'awards', 'skills', 'certifications', 'courses', 'leadership', 'volunteering', 'internships', 'languages', 'publications', 'research', 'links'],
      dividers: 'accent',
      headingStyle: 'bar',
      bulletStyle: 'arrow',
      entryStyle: 'grid',
      skillsStyle: 'grouped',
      density: 'standard',
      accentPosition: 'border',
    },
  },

  /* ---- Executive --------------------------------------------------------- */
  {
    id: 'executive-premium',
    name: 'Executive / Premium',
    nameAr: 'تنفيذية / مميزة',
    category: 'executive',
    featured: true,
    description:
      'A dark masthead over a narrow evidence rail, with every leadership role set as a bordered card. Built for a board, a partner or a director panel.',
    descriptionAr:
      'ترويسة داكنة فوق مسار أدلة ضيق، مع ضبط كل دور قيادي في بطاقة مؤطّرة. مصممة لمجلس أو شريك أو لجنة مديرين.',
    bestFor: 'Directors, partners and candidates at board level.',
    tags: ['executive', 'leadership', 'cards', 'impact'],
    accent: '#0f172a',
    typography: 'serif',
    structure: {
      layout: 'sidebar-right',
      header: 'editorial',
      sectionOrder: ORDER_CORPORATE,
      sidebarSections: ['skills', 'languages', 'certifications', 'awards'],
      dividers: 'block',
      headingStyle: 'numbered',
      bulletStyle: 'none',
      entryStyle: 'card',
      skillsStyle: 'bars',
      density: 'spacious',
      accentPosition: 'top',
      showIcons: true,
    },
  },
  {
    id: 'executive-summary',
    name: 'Executive Summary',
    nameAr: 'ملخص تنفيذي',
    category: 'executive',
    featured: true,
    description:
      'A one-page brief: a leadership summary, a scope-and-impact block, then the roles that evidence it.',
    descriptionAr:
      'موجز من صفحة واحدة: ملخص قيادي وكتلة نطاق وأثر ثم الأدوار التي تثبتها.',
    bestFor: 'Directors and senior managers.',
    tags: ['executive', 'impact', 'one page'],
    accent: '#1e293b',
    typography: 'serif',
    structure: {
      layout: 'single',
      header: 'split',
      sectionOrder: ['summary', 'experience', 'leadership', 'skills', 'education', 'certifications', 'awards', 'publications', 'languages', 'projects', 'courses', 'volunteering', 'internships', 'research', 'links'],
      dividers: 'double',
      headingStyle: 'smallcaps',
      bulletStyle: 'dash',
      entryStyle: 'stacked',
      skillsStyle: 'grouped',
      density: 'standard',
      accentPosition: 'top',
    },
  },
  {
    id: 'executive-brief',
    name: 'Executive Brief',
    nameAr: 'موجز تنفيذي',
    category: 'executive',
    description:
      'A two-column brief with the career narrative on the left and a metrics rail on the right.',
    descriptionAr:
      'موجز بعمودين: السرد المهني يسارًا ومسار المقاييس يمينًا.',
    bestFor: 'Executives who lead with measurable outcomes.',
    tags: ['executive', 'metrics', 'two column'],
    accent: '#0f766e',
    typography: 'sans',
    structure: {
      layout: 'sidebar-right',
      header: 'split',
      sectionOrder: ['summary', 'experience', 'leadership', 'projects', 'education', 'certifications', 'awards', 'publications', 'languages', 'courses', 'volunteering', 'internships', 'research', 'links'],
      sidebarSections: ['skills', 'awards', 'languages'],
      dividers: 'line',
      headingStyle: 'uppercase',
      bulletStyle: 'square',
      entryStyle: 'inline',
      skillsStyle: 'bars',
      density: 'standard',
      accentPosition: 'side',
    },
  },
  {
    id: 'executive-board',
    name: 'Board Candidate',
    nameAr: 'مرشح مجلس إدارة',
    category: 'executive',
    description:
      'A governance-first document: board roles, committee work and leadership scope come before operational history.',
    descriptionAr:
      'مستند يبدأ بالحوكمة: أدوار المجالس وعمل اللجان ونطاق القيادة قبل التاريخ التشغيلي.',
    bestFor: 'Board, non-executive and advisory applications.',
    tags: ['board', 'governance', 'executive'],
    accent: '#312e81',
    typography: 'serif',
    structure: {
      layout: 'single',
      header: 'centered',
      sectionOrder: ['summary', 'leadership', 'experience', 'awards', 'education', 'certifications', 'publications', 'skills', 'languages', 'projects', 'research', 'courses', 'volunteering', 'internships', 'links'],
      dividers: 'line',
      headingStyle: 'numbered',
      bulletStyle: 'none',
      entryStyle: 'stacked',
      skillsStyle: 'columns',
      density: 'standard',
      accentPosition: 'top',
    },
  },
  {
    id: 'executive-impact',
    name: 'Impact Executive',
    nameAr: 'تنفيذي الأثر',
    category: 'executive',
    description:
      'Every role opens with a result line before the responsibilities, so the page is read as a record of outcomes.',
    descriptionAr:
      'كل دور يبدأ بسطر نتيجة قبل المسؤوليات، فتُقرأ الصفحة كسجل نتائج.',
    bestFor: 'Transformation, turnaround and P&L leaders.',
    tags: ['impact', 'results', 'executive'],
    accent: '#9a3412',
    typography: 'sans',
    structure: {
      layout: 'timeline',
      header: 'left',
      sectionOrder: ['summary', 'experience', 'leadership', 'projects', 'awards', 'skills', 'education', 'certifications', 'publications', 'languages', 'research', 'courses', 'volunteering', 'internships', 'links'],
      dividers: 'none',
      headingStyle: 'bar',
      bulletStyle: 'arrow',
      entryStyle: 'timeline',
      skillsStyle: 'grouped',
      density: 'standard',
      accentPosition: 'side',
    },
  },
  {
    id: 'executive-legacy',
    name: 'Legacy Executive',
    nameAr: 'تنفيذي الخبرة',
    category: 'executive',
    description:
      'A long-form executive record with a spacious serif setting and a dedicated honours and publications close.',
    descriptionAr:
      'سجل تنفيذي مطوّل بإعداد سيريفي فسيح وخاتمة مخصصة للتكريمات والمنشورات.',
    bestFor: 'C-suite candidates with a long public record.',
    tags: ['executive', 'long form', 'serif'],
    accent: '#44403c',
    typography: 'serif',
    structure: {
      layout: 'single',
      header: 'editorial',
      sectionOrder: ['summary', 'experience', 'leadership', 'education', 'awards', 'publications', 'certifications', 'skills', 'research', 'languages', 'projects', 'courses', 'volunteering', 'internships', 'links'],
      dividers: 'double',
      headingStyle: 'serif',
      bulletStyle: 'dash',
      entryStyle: 'stacked',
      skillsStyle: 'inline',
      density: 'spacious',
      accentPosition: 'none',
    },
  },

  /* ---- Academic ---------------------------------------------------------- */
  {
    id: 'academic-cv',
    name: 'Academic CV',
    nameAr: 'سيرة أكاديمية',
    category: 'academic',
    description:
      'The full academic record: research, publications, teaching and service, in the order a search committee reads.',
    descriptionAr:
      'السجل الأكاديمي الكامل: البحث والمنشورات والتدريس والخدمة، بترتيب لجنة البحث.',
    bestFor: 'Faculty and postdoctoral applications.',
    tags: ['academic', 'research', 'full record'],
    accent: '#1e40af',
    typography: 'serif',
    structure: {
      layout: 'academic',
      header: 'centered',
      sectionOrder: ORDER_RESEARCH,
      dividers: 'line',
      headingStyle: 'numbered',
      bulletStyle: 'none',
      entryStyle: 'stacked',
      skillsStyle: 'inline',
      density: 'compact',
      accentPosition: 'none',
    },
  },
  {
    id: 'academic-research',
    name: 'Research Scholar',
    nameAr: 'باحث علمي',
    category: 'academic',
    featured: true,
    description:
      'A research statement leads, followed by publications and funded work. Teaching and service close the document.',
    descriptionAr:
      'بيان بحثي يتصدر، تليه المنشورات والأعمال الممولة. يُغلق المستند بالتدريس والخدمة.',
    bestFor: 'Research fellowships and grant applications.',
    tags: ['research', 'grants', 'academic'],
    accent: '#065f46',
    typography: 'serif',
    structure: {
      layout: 'academic',
      header: 'left',
      sectionOrder: ['summary', 'research', 'publications', 'projects', 'awards', 'education', 'experience', 'certifications', 'skills', 'leadership', 'courses', 'internships', 'volunteering', 'languages', 'links'],
      dividers: 'none',
      headingStyle: 'serif',
      bulletStyle: 'dash',
      entryStyle: 'stacked',
      skillsStyle: 'columns',
      density: 'standard',
      accentPosition: 'heading',
    },
  },
  {
    id: 'academic-fellowship',
    name: 'Fellowship Candidate',
    nameAr: 'مرشح زمالة',
    category: 'academic',
    description:
      'A compact academic brief with a clear evidence trail for awards, funding and leadership.',
    descriptionAr:
      'موجز أكاديمي مدمج مع مسار أدلة واضح للجوائز والتمويل والقيادة.',
    bestFor: 'Scholarships, fellowships and early-career grants.',
    tags: ['fellowship', 'awards', 'academic'],
    accent: '#7e22ce',
    typography: 'sans',
    structure: {
      layout: 'sidebar-left',
      header: 'stacked',
      sectionOrder: ['summary', 'education', 'research', 'publications', 'projects', 'experience', 'awards', 'leadership', 'certifications', 'skills', 'courses', 'volunteering', 'internships', 'languages', 'links'],
      sidebarSections: ['education', 'awards', 'languages', 'links'],
      dividers: 'line',
      headingStyle: 'bar',
      bulletStyle: 'disc',
      entryStyle: 'stacked',
      skillsStyle: 'chips',
      density: 'compact',
      accentPosition: 'side',
    },
  },
  {
    id: 'academic-publication',
    name: 'Publication Led',
    nameAr: 'قائم على المنشورات',
    category: 'academic',
    description:
      'Publications are the spine of the document, with a numbered bibliography style and a short profile above it.',
    descriptionAr:
      'المنشورات هي عمود المستند، بأسلوب ببليوغرافي مرقّم وملف قصير أعلاها.',
    bestFor: 'Researchers with a substantial publication record.',
    tags: ['publications', 'bibliography', 'academic'],
    accent: '#334155',
    typography: 'serif',
    structure: {
      layout: 'academic',
      header: 'stacked',
      sectionOrder: ['summary', 'publications', 'research', 'education', 'experience', 'awards', 'projects', 'certifications', 'skills', 'leadership', 'courses', 'languages', 'volunteering', 'internships', 'links'],
      dividers: 'double',
      headingStyle: 'numbered',
      bulletStyle: 'none',
      entryStyle: 'inline',
      skillsStyle: 'inline',
      density: 'compact',
      accentPosition: 'top',
    },
  },
  {
    id: 'academic-teaching',
    name: 'Teaching Portfolio',
    nameAr: 'ملف التدريس',
    category: 'academic',
    description:
      'A teaching-first academic document: courses, supervision, curriculum work and the scholarship behind them.',
    descriptionAr:
      'مستند أكاديمي يبدأ بالتدريس: المقررات والإشراف وتطوير المناهج والعمل العلمي خلفها.',
    bestFor: 'Teaching-focused faculty and education roles.',
    tags: ['teaching', 'courses', 'academic'],
    accent: '#b45309',
    typography: 'mixed',
    structure: {
      layout: 'academic',
      header: 'compact',
      sectionOrder: ORDER_TEACHING,
      dividers: 'line',
      headingStyle: 'underline',
      bulletStyle: 'dash',
      entryStyle: 'stacked',
      skillsStyle: 'grouped',
      density: 'standard',
      accentPosition: 'heading',
    },
  },

  /* ---- Technical --------------------------------------------------------- */
  {
    id: 'technical-engineer',
    name: 'Software Engineer',
    nameAr: 'مهندس برمجيات',
    category: 'technical',
    featured: true,
    description:
      'Skills and systems lead, followed by evidence from the roles and projects where they were used.',
    descriptionAr:
      'المهارات والأنظمة تتصدر، تليها الأدلة من الأدوار والمشاريع التي استُخدمت فيها.',
    bestFor: 'Backend, frontend and platform engineers.',
    tags: ['engineering', 'skills first', 'technical'],
    accent: '#1d4ed8',
    typography: 'sans',
    structure: {
      layout: 'single',
      header: 'left',
      sectionOrder: ORDER_TECHNICAL,
      dividers: 'line',
      headingStyle: 'bar',
      bulletStyle: 'square',
      entryStyle: 'stacked',
      skillsStyle: 'chips',
      density: 'standard',
      accentPosition: 'heading',
    },
  },
  {
    id: 'technical-developer',
    name: 'Full-Stack Developer',
    nameAr: 'مطور متكامل',
    category: 'technical',
    description:
      'A two-column developer profile with a technology rail and a project grid that shows what was shipped.',
    descriptionAr:
      'ملف مطور بعمودين مع مسار تقنيات وشبكة مشاريع تُظهر ما تم إنجازه.',
    bestFor: 'Full-stack and product engineers.',
    tags: ['full stack', 'projects', 'technical'],
    accent: '#0f766e',
    typography: 'sans',
    structure: {
      layout: 'sidebar-right',
      header: 'split',
      sectionOrder: ['summary', 'experience', 'projects', 'education', 'certifications', 'awards', 'research', 'courses', 'internships', 'volunteering', 'languages', 'publications', 'leadership', 'links'],
      sidebarSections: ['skills', 'languages', 'links'],
      dividers: 'accent',
      headingStyle: 'uppercase',
      bulletStyle: 'dash',
      entryStyle: 'grid',
      skillsStyle: 'grouped',
      density: 'standard',
      accentPosition: 'side',
    },
  },
  {
    id: 'technical-devops',
    name: 'DevOps & Cloud',
    nameAr: 'ديفوبس وسحابة',
    category: 'technical',
    description:
      'A reliability-focused layout: platforms, automation and incident outcomes sit beside the role history.',
    descriptionAr:
      'تخطيط يركز على الموثوقية: المنصات والأتمتة ونتائج الحوادث بجانب تاريخ الأدوار.',
    bestFor: 'SRE, DevOps and cloud infrastructure roles.',
    tags: ['devops', 'cloud', 'reliability'],
    accent: '#9a3412',
    typography: 'mono',
    structure: {
      layout: 'sidebar-left',
      header: 'compact',
      sectionOrder: ['summary', 'experience', 'projects', 'education', 'certifications', 'skills', 'awards', 'courses', 'research', 'leadership', 'internships', 'volunteering', 'languages', 'publications', 'links'],
      sidebarSections: ['skills', 'certifications', 'languages'],
      dividers: 'none',
      headingStyle: 'bar',
      bulletStyle: 'dash',
      entryStyle: 'stacked',
      skillsStyle: 'bars',
      density: 'compact',
      accentPosition: 'side',
    },
  },
  {
    id: 'technical-data',
    name: 'Data & AI',
    nameAr: 'بيانات وذكاء اصطناعي',
    category: 'technical',
    description:
      'A data-first document with a methods rail and a research and projects section written for evidence.',
    descriptionAr:
      'مستند يبدأ بالبيانات مع مسار أساليب وقسم بحث ومشاريع مكتوب للأدلة.',
    bestFor: 'Data scientists, analysts and ML engineers.',
    tags: ['data', 'AI', 'research'],
    accent: '#6d28d9',
    typography: 'mixed',
    structure: {
      layout: 'sidebar-right',
      header: 'editorial',
      sectionOrder: ['summary', 'experience', 'projects', 'research', 'publications', 'education', 'certifications', 'awards', 'skills', 'courses', 'leadership', 'internships', 'volunteering', 'languages', 'links'],
      sidebarSections: ['skills', 'languages', 'certifications'],
      dividers: 'line',
      headingStyle: 'serif',
      bulletStyle: 'arrow',
      entryStyle: 'stacked',
      skillsStyle: 'bars',
      density: 'standard',
      accentPosition: 'side',
    },
  },
  {
    id: 'technical-architect',
    name: 'Solutions Architect',
    nameAr: 'مهندس حلول',
    category: 'technical',
    description:
      'A systems narrative with architecture decisions, scale and stakeholder outcomes across a wide two-column page.',
    descriptionAr:
      'سرد أنظمة مع قرارات معمارية ونطاق ونتائج لأصحاب المصلحة عبر صفحة واسعة بعمودين.',
    bestFor: 'Architects, staff engineers and technical leads.',
    tags: ['architecture', 'systems', 'technical'],
    accent: '#0f172a',
    typography: 'sans',
    structure: {
      layout: 'split',
      header: 'split',
      sectionOrder: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'leadership', 'publications', 'research', 'awards', 'courses', 'internships', 'volunteering', 'languages', 'links'],
      dividers: 'line',
      headingStyle: 'numbered',
      bulletStyle: 'square',
      entryStyle: 'grid',
      skillsStyle: 'columns',
      density: 'standard',
      accentPosition: 'border',
    },
  },
];

/** Every built-in template, in catalogue order. */
export const CV_TEMPLATES: readonly CvTemplateDefinition[] = SEEDS.map((seed, index) =>
  defineTemplate(seed, index + 1)
);

/**
 * The templates every candidate may use without a subscription.
 *
 * There are three, and they are three genuinely different documents rather
 * than three colour schemes: a plain single-column page a parser reads
 * cleanly, a two-column modern page, and a timeline that runs the length of
 * the career. A candidate with no plan can therefore still choose a
 * structure that suits the posting rather than being handed the one ATS
 * template.
 */
export const FREE_CV_TEMPLATE_IDS = ['ats-classic', 'modern-professional', 'professional-timeline'] as const;

/** The one template that is free for everyone, forever. */
export const FREE_CV_TEMPLATE_ID = 'ats-classic';

/** The template a candidate gets before they have chosen one. */
export const DEFAULT_CV_TEMPLATE_ID = FREE_CV_TEMPLATE_ID;

/** True when a template is one of the free ones. */
export function isFreeCvTemplateId(id: string): boolean {
  return (FREE_CV_TEMPLATE_IDS as readonly string[]).includes(id);
}

/**
 * Turns anything into a usable template id.
 *
 * The id is not checked against the built-in catalogue here: an administrator
 * can publish a template whose id this build has never heard of, and a stale
 * value is resolved against the live catalogue at render time. What is
 * checked is the shape, so a hand-edited preference cannot inject markup or
 * an arbitrary database key.
 */
export function normalizeCvTemplateId(value: unknown): string {
  if (isCvTemplateIdShape(value)) {
    return value;
  }
  return DEFAULT_CV_TEMPLATE_ID;
}

/** The shape every template id must have, built-in or administrator-authored. */
export function isCvTemplateIdShape(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{1,47}$/.test(value);
}

const TEMPLATE_BY_ID = new Map(CV_TEMPLATES.map((template) => [template.id, template]));

/** True when a value names a built-in template. */
export function isBuiltinCvTemplateId(value: unknown): value is string {
  return typeof value === 'string' && TEMPLATE_BY_ID.has(value);
}

/** One built-in template, or null. */
export function getBuiltinCvTemplate(id: string | null | undefined): CvTemplateDefinition | null {
  if (!id) return null;
  return TEMPLATE_BY_ID.get(id) ?? null;
}

/**
 * Resolves an id to a real template.
 *
 * A stale preference — a template an administrator has since disabled — falls
 * back to the free template rather than leaving the studio with no document.
 */
export function resolveCvTemplate(
  id: string | null | undefined,
  catalog: readonly CvTemplateDefinition[] = CV_TEMPLATES
): CvTemplateDefinition {
  const found = id ? catalog.find((template) => template.id === id) : null;
  return (
    found ??
    catalog.find((template) => template.id === FREE_CV_TEMPLATE_ID) ??
    CV_TEMPLATES[0]
  );
}

/* -------------------------------------------------------------------------- */
/* Filtering                                                                  */
/* -------------------------------------------------------------------------- */

export type CvTemplateTierFilter = 'all' | CvTemplateTier;
export type CvTemplateCategoryFilter = 'all' | CvTemplateCategoryId;

export interface CvTemplateFilter {
  query?: string;
  category?: CvTemplateCategoryFilter;
  tier?: CvTemplateTierFilter;
}

/**
 * Filters a catalogue.
 *
 * The query is matched against the name, the category, the description, the
 * best-for line and the tags, in both languages. A candidate who types
 * "أكاديمي" finds the academic templates just as one who types "academic"
 * does.
 */
export function filterCvTemplates<T extends CvTemplateMetadata>(
  catalog: readonly T[],
  filter: CvTemplateFilter
): T[] {
  const query = (filter.query ?? '').trim().toLowerCase();
  const category = filter.category ?? 'all';
  const tier = filter.tier ?? 'all';

  return catalog.filter((template) => {
    if (category !== 'all' && template.category !== category) return false;
    if (tier !== 'all' && template.tier !== tier) return false;
    if (!query) return true;
    const categoryMeta = CV_TEMPLATE_CATEGORIES.find((entry) => entry.id === template.category);
    const haystack = [
      template.name,
      template.nameAr,
      template.description,
      template.descriptionAr,
      template.bestFor,
      template.layoutLabel,
      template.layoutLabelAr,
      categoryMeta?.label ?? '',
      categoryMeta?.labelAr ?? '',
      ...template.tags,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}

/** The templates the library shows first. */
export function featuredCvTemplates(
  catalog: readonly CvTemplateDefinition[] = CV_TEMPLATES
): CvTemplateDefinition[] {
  return catalog.filter((template) => template.featured);
}

/* -------------------------------------------------------------------------- */
/* Recommendations                                                            */
/* -------------------------------------------------------------------------- */

export interface CvTemplateRecommendationContext {
  careerState?: string | null;
  careerGoal?: string | null;
  targetRoleTitle?: string | null;
}

export interface CvTemplateRecommendation {
  templateId: string;
  reason: string;
}

/**
 * Recommends templates from what the candidate is actually doing.
 *
 * This is a deterministic rule set, not a model: the same context always
 * produces the same list, and every recommendation names the reason it was
 * made. The free template is always included first so a candidate who has
 * never paid still gets a usable recommendation.
 */
export function recommendCvTemplates(
  context: CvTemplateRecommendationContext,
  catalog: readonly CvTemplateMetadata[] = CV_TEMPLATES
): CvTemplateRecommendation[] {
  const available = new Set(catalog.map((template) => template.id));
  const role = (context.targetRoleTitle ?? '').toLowerCase();
  const recommendations: CvTemplateRecommendation[] = [];

  const add = (templateId: string, reason: string) => {
    if (!available.has(templateId)) return;
    if (recommendations.some((entry) => entry.templateId === templateId)) return;
    recommendations.push({ templateId, reason });
  };

  add(FREE_CV_TEMPLATE_ID, 'A parser-safe default that works for every application.');

  if (/data|machine learning|\bml\b|analyst|analytics|scientist/i.test(role)) {
    add('technical-data', 'Your target role is data-focused.');
  }
  if (/devops|sre|platform|cloud|infrastructure|reliability/i.test(role)) {
    add('technical-devops', 'Your target role is infrastructure-focused.');
  }
  if (/architect|staff engineer|principal|technical lead/i.test(role)) {
    add('technical-architect', 'Your target role is architecture-focused.');
  }
  if (/engineer|developer|programmer|software|frontend|backend|full.?stack/i.test(role)) {
    add('technical-engineer', 'Your target role is engineering-focused.');
    add('technical-developer', 'A project-led developer profile suits your work.');
  }
  if (/design|ux|ui|creative|brand|art director|illustrat/i.test(role)) {
    add('creative-portfolio', 'Your target role is creative and portfolio-led.');
    add('creative-designer', 'A project grid shows design work at a glance.');
  }
  if (/finance|bank|audit|risk|account|investment/i.test(role)) {
    add('professional-finance', 'Your target role is in finance.');
  }
  if (/legal|law|compliance|policy|counsel/i.test(role)) {
    add('professional-legal', 'Your target role is in law or compliance.');
  }
  if (/research|professor|lecturer|academic|phd|postdoc|scientist/i.test(role)) {
    add('academic-research', 'Your target role is research-led.');
    add('academic-cv', 'A full academic record suits a search committee.');
  }
  if (/director|chief|vp|vice president|head of|executive|board/i.test(role)) {
    add('executive-summary', 'Your target role is senior and impact-led.');
    add('executive-impact', 'A results-first timeline suits a leadership record.');
  }

  switch (context.careerState) {
    case 'student':
      add('ats-classic', 'A student application benefits from a parser-safe structure.');
      add('academic-fellowship', 'A fellowship layout suits an early-career record.');
      break;
    case 'fresh_graduate':
      add('modern-minimal', 'A clean, modern page suits a first professional role.');
      add('academic-fellowship', 'A fellowship layout suits an early-career record.');
      break;
    case 'working_professional':
      add('professional-timeline', 'A timeline shows steady professional progression.');
      add('modern-minimal', 'A quiet modern layout keeps the focus on your record.');
      break;
    case 'career_switcher':
      add('modern-split', 'A split layout gives room to explain a career change.');
      add('ats-keyword', 'A keyword-led document helps a role-specific switch.');
      break;
    case 'exploring':
      add('modern-minimal', 'A flexible modern layout suits an exploratory search.');
      break;
    default:
      break;
  }

  if (context.careerGoal === 'get_internship') {
    add('ats-clean', 'An internship application benefits from a clean, scannable page.');
  }
  if (context.careerGoal === 'build_portfolio' || context.careerGoal === 'freelance') {
    add('creative-portfolio', 'A portfolio-first layout suits independent work.');
  }
  if (context.careerGoal === 'become_manager' || context.careerGoal === 'get_promoted') {
    add('executive-summary', 'A leadership summary suits a promotion case.');
  }

  return recommendations.slice(0, 6);
}

/* -------------------------------------------------------------------------- */
/* Access                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The server flag that turns premium template enforcement on.
 *
 * Enforcement is ON unless the owner explicitly turns it off. The product's
 * rule is that a candidate with no paid plan reaches the three free templates
 * and no others, so the default is the rule rather than the exception. A
 * launch that is free for everyone sets
 * `CV_TEMPLATE_PREMIUM_ENFORCEMENT=false` and the whole catalogue becomes
 * available; the tiers are still recorded either way.
 */
export const CV_TEMPLATE_PREMIUM_ENFORCEMENT_ENV = 'CV_TEMPLATE_PREMIUM_ENFORCEMENT';

/** Reads the enforcement flag. Only an explicit false-like value turns it off. */
export function isCvTemplatePremiumEnforcementEnabled(
  env: Record<string, string | undefined> = {}
): boolean {
  const raw = env[CV_TEMPLATE_PREMIUM_ENFORCEMENT_ENV];
  if (typeof raw !== 'string') return true;
  const value = raw.trim().toLowerCase();
  if (!value) return true;
  return !['false', '0', 'off', 'no'].includes(value);
}

export type CvTemplateAccess = 'free' | 'included' | 'premium' | 'locked';

/**
 * What a candidate may offer to pay to use a premium template.
 *
 * `free`      the template costs nothing;
 * `subscription` the candidate's plan already includes it;
 * `credits`   the template can be unlocked with tokens;
 * `upgrade`   the template is only available on a paid plan.
 */
export type CvTemplateUnlockMethod = 'free' | 'subscription' | 'credits' | 'upgrade';

/**
 * What unlocking a premium template costs.
 *
 * The price is a property of the product, not of a candidate: every premium
 * template costs the same number of tokens, and the number is stated in
 * the interface before anything is spent. The server re-reads it, so the price
 * on the screen and the price on the ledger cannot disagree.
 *
 * The currency the candidate sees is called a TOKEN. The ledger underneath
 * still calls it a credit, because the ledger is a double-entry record of
 * what was spent and renaming it would not change what was spent.
 */
export const CV_TEMPLATE_PREMIUM_UNLOCK_CREDITS = 5;

export interface CvTemplateAccessContext {
  enforcementEnabled: boolean;
  /** The candidate's effective plan code, when the server resolved one. */
  planCode?: SubscriptionPlanCode | null;
  /** `active` means a verified paid subscription; temporary access is not. */
  subscriptionStatus?: 'active' | 'temporary_access' | 'free';
  /**
   * The premium templates this candidate has already unlocked with credits.
   *
   * A template is unlocked ONCE: the candidate paid for it, and paying again
   * for the same document would be charging twice for one thing.
   */
  unlockedTemplateIds?: readonly string[];
}

export interface CvTemplateAccessResult {
  templateId: string;
  allowed: boolean;
  /** What the interface should call this template for this candidate. */
  access: CvTemplateAccess;
  reason: string;
  /** Whether the candidate may unlock this template with tokens. */
  canUnlockWithCredits: boolean;
  /** What an unlock costs, in tokens. */
  unlockCredits: number;
  /** How this candidate obtains the template. */
  unlockMethod: CvTemplateUnlockMethod;
}

/**
 * Decides whether a candidate may use a template.
 *
 * The rule is intentionally small and server-owned:
 *
 *   free template                  → always allowed;
 *   premium, enforcement off       → allowed and shown as included;
 *   premium, enforcement on        → allowed for an ACTIVE, verified paid plan, or for a
 *                                    template the candidate already unlocked with credits;
 *                                    otherwise the candidate may unlock it with credits, or
 *                                    has to upgrade the plan.
 *
 * A temporary-access payment is not a verified paid plan: the money has not
 * been verified, so it does not include the premium templates.
 *
 * NOTE: this decides whether a template may be USED. It never decides whether a
 * candidate may LOOK at it. Seeing a template is free and always is — the
 * layout reaches the browser for every template, locked or not, so the gallery
 * can show the real document instead of a placeholder.
 */
export function resolveCvTemplateAccess(
  template: CvTemplateDefinition,
  context: CvTemplateAccessContext
): CvTemplateAccessResult {
  // The three free templates are free because the CODE says so. An
  // administrator's metadata row can rename, reorder or disable a template,
  // but it cannot take away the one every candidate is entitled to.
  if (template.tier === 'free' || isFreeCvTemplateId(template.id)) {
    return {
      templateId: template.id,
      allowed: true,
      access: 'free',
      reason: 'This template is free for everyone.',
      canUnlockWithCredits: false,
      unlockCredits: 0,
      unlockMethod: 'free',
    };
  }

  if (!context.enforcementEnabled) {
    return {
      templateId: template.id,
      allowed: true,
      access: 'included',
      reason: 'Premium templates are included under the current free-access policy.',
      canUnlockWithCredits: false,
      unlockCredits: 0,
      unlockMethod: 'free',
    };
  }

  const verifiedPaidPlan =
    context.subscriptionStatus === 'active' &&
    typeof context.planCode === 'string' &&
    context.planCode !== 'free';

  if (verifiedPaidPlan) {
    return {
      templateId: template.id,
      allowed: true,
      access: 'premium',
      reason: 'Your active plan includes every premium template.',
      canUnlockWithCredits: false,
      unlockCredits: 0,
      unlockMethod: 'subscription',
    };
  }

  // The candidate has already paid for this template with credits. Charging
  // again would be charging twice for the same document.
  if (context.unlockedTemplateIds?.includes(template.id)) {
    return {
      templateId: template.id,
      allowed: true,
      access: 'premium',
      reason: 'You unlocked this template with tokens.',
      canUnlockWithCredits: false,
      unlockCredits: 0,
      unlockMethod: 'credits',
    };
  }

  return {
    templateId: template.id,
    allowed: false,
    access: 'locked',
    reason:
      context.subscriptionStatus === 'temporary_access'
        ? 'Unlock this template with tokens, or upgrade your plan.'
        : 'Unlock this template with tokens, or upgrade your plan to use it.',
    canUnlockWithCredits: true,
    unlockCredits: CV_TEMPLATE_PREMIUM_UNLOCK_CREDITS,
    unlockMethod: 'credits',
  };
}

/** Applies the access rule to a whole catalogue. */
export function applyCvTemplateAccess(
  catalog: readonly CvTemplateDefinition[],
  context: CvTemplateAccessContext
): Array<CvTemplateDefinition & { access: CvTemplateAccessResult }> {
  return catalog.map((template) => ({
    ...template,
    access: resolveCvTemplateAccess(template, context),
  }));
}

/* -------------------------------------------------------------------------- */
/* Admin catalogue overrides                                                  */
/* -------------------------------------------------------------------------- */

/** The metadata row an administrator can change without a deploy. */
export interface CvTemplateAdminRow {
  template_id: string;
  name_en: string | null;
  name_ar: string | null;
  category: string | null;
  tier: CvTemplateTier | null;
  enabled: boolean;
  featured: boolean;
  sort_order: number | null;
  thumbnail_url: string | null;
  description_en: string | null;
  description_ar: string | null;
  /** The built-in template an admin-authored template reuses. */
  base_template_id: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CvTemplateCatalogOptions {
  includeDisabled?: boolean;
}

/**
 * Merges the administrator's metadata over the built-in catalogue.
 *
 * A row can rename a template, move it between categories, change its tier,
 * feature it, reorder it, disable it or attach a thumbnail. It cannot change
 * the STRUCTURE of a built-in template: the structure is what the uniqueness
 * guarantee is made of, and an administrator editing it from a form would
 * break that guarantee silently.
 *
 * An admin-authored row (one with `base_template_id`) creates a new template
 * that reuses a built-in structure under its own metadata.
 */
export function buildCvTemplateCatalog(
  rows: readonly CvTemplateAdminRow[] = [],
  options: CvTemplateCatalogOptions = {}
): CvTemplateDefinition[] {
  const byId = new Map(CV_TEMPLATES.map((template) => [template.id, { ...template }]));
  const custom: CvTemplateDefinition[] = [];

  for (const row of rows) {
    const baseId = row.base_template_id ?? row.template_id;
    const base = getBuiltinCvTemplate(baseId);
    if (!base) continue;

    const category = isCvTemplateCategory(row.category) ? row.category : base.category;
    const tier: CvTemplateTier = row.tier === 'free' || row.tier === 'premium' ? row.tier : base.tier;

    if (row.base_template_id && row.base_template_id !== row.template_id) {
      custom.push({
        ...base,
        id: row.template_id,
        name: row.name_en?.trim() || base.name,
        nameAr: row.name_ar?.trim() || base.nameAr,
        category,
        tier,
        featured: row.featured,
        order: row.sort_order ?? base.order,
        description: row.description_en?.trim() || base.description,
        descriptionAr: row.description_ar?.trim() || base.descriptionAr,
        accent: base.accent,
        structure: base.structure,
        source: 'admin',
        baseTemplateId: base.id,
      });
      continue;
    }

    const existing = byId.get(row.template_id);
    if (!existing) continue;
    existing.name = row.name_en?.trim() || existing.name;
    existing.nameAr = row.name_ar?.trim() || existing.nameAr;
    existing.category = category;
    existing.tier = tier;
    existing.featured = row.featured;
    existing.order = row.sort_order ?? existing.order;
    existing.description = row.description_en?.trim() || existing.description;
    existing.descriptionAr = row.description_ar?.trim() || existing.descriptionAr;
    if (row.thumbnail_url) existing.thumbnailUrl = row.thumbnail_url;
    if (!row.enabled) existing.disabled = true;
  }

  const merged = [...byId.values(), ...custom]
    .filter((template) => options.includeDisabled || !template.disabled)
    .sort((a, b) => {
      if (a.category !== b.category) {
        return (
          CV_TEMPLATE_CATEGORY_IDS.indexOf(a.category) -
          CV_TEMPLATE_CATEGORY_IDS.indexOf(b.category)
        );
      }
      return a.order - b.order;
    });

  return merged;
}

/* -------------------------------------------------------------------------- */
/* Admin validation                                                           */
/* -------------------------------------------------------------------------- */

export interface CvTemplateMetadataInput {
  templateId?: unknown;
  nameEn?: unknown;
  nameAr?: unknown;
  category?: unknown;
  tier?: unknown;
  enabled?: unknown;
  featured?: unknown;
  sortOrder?: unknown;
  thumbnailUrl?: unknown;
  descriptionEn?: unknown;
  descriptionAr?: unknown;
  baseTemplateId?: unknown;
}

const TEMPLATE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}$/;

/**
 * Validates an administrator's template metadata.
 *
 * Returns the list of things wrong with it; an empty list means it is safe to
 * write. The structure is never accepted from the client — only a known
 * built-in base id is.
 */
export function validateCvTemplateMetadata(
  input: CvTemplateMetadataInput,
  options: { requireId: boolean }
): string[] {
  const errors: string[] = [];

  if (options.requireId) {
    if (typeof input.templateId !== 'string' || !TEMPLATE_ID_PATTERN.test(input.templateId)) {
      errors.push('A template id of 2-48 lowercase letters, digits or hyphens is required.');
    }
  }

  if (input.nameEn !== undefined && input.nameEn !== null && (typeof input.nameEn !== 'string' || input.nameEn.trim().length < 2 || input.nameEn.length > 80)) {
    errors.push('The English name must be between 2 and 80 characters.');
  }
  if (input.nameAr !== undefined && input.nameAr !== null && (typeof input.nameAr !== 'string' || input.nameAr.trim().length < 2 || input.nameAr.length > 80)) {
    errors.push('The Arabic name must be between 2 and 80 characters.');
  }
  if (input.category !== undefined && input.category !== null && !isCvTemplateCategory(input.category)) {
    errors.push('The category is not one the library knows.');
  }
  if (input.tier !== undefined && input.tier !== null && input.tier !== 'free' && input.tier !== 'premium') {
    errors.push('The tier must be free or premium.');
  }
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
    errors.push('The enabled flag must be a boolean.');
  }
  if (input.featured !== undefined && typeof input.featured !== 'boolean') {
    errors.push('The featured flag must be a boolean.');
  }
  if (
    input.sortOrder !== undefined &&
    input.sortOrder !== null &&
    (typeof input.sortOrder !== 'number' || !Number.isFinite(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 9999)
  ) {
    errors.push('The sort order must be a number between 0 and 9999.');
  }
  if (input.thumbnailUrl !== undefined && input.thumbnailUrl !== null && input.thumbnailUrl !== '') {
    if (typeof input.thumbnailUrl !== 'string' || input.thumbnailUrl.length > 2048) {
      errors.push('The thumbnail URL is too long.');
    } else if (!/^(https?:\/\/|\/)/.test(input.thumbnailUrl)) {
      errors.push('The thumbnail must be an https URL or a site-relative path.');
    }
  }
  if (input.descriptionEn !== undefined && input.descriptionEn !== null && (typeof input.descriptionEn !== 'string' || input.descriptionEn.length > 400)) {
    errors.push('The English description must be 400 characters or fewer.');
  }
  if (input.descriptionAr !== undefined && input.descriptionAr !== null && (typeof input.descriptionAr !== 'string' || input.descriptionAr.length > 400)) {
    errors.push('The Arabic description must be 400 characters or fewer.');
  }
  if (input.baseTemplateId !== undefined && input.baseTemplateId !== null) {
    if (!isBuiltinCvTemplateId(input.baseTemplateId)) {
      errors.push('The base template is not one the renderer knows.');
    }
  }

  return errors;
}
