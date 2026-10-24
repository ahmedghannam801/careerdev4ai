/**
 * Career domains — the top level of the career taxonomy.
 *
 * This module is the single source of truth for "what career domains does
 * CareerPilot support?". It is imported by BOTH the React frontend and the
 * Node/Cloudflare API, so it must stay free of any DOM or Node-only
 * dependency.
 *
 * Adding a domain is a two-step change:
 *   1. add an entry to `CAREER_DOMAINS` below;
 *   2. add roles for it in `shared/roles/*` (the slug becomes the role's
 *      `domainId`).
 *
 * The `slug` is persisted in the database, so it must stay stable once
 * shipped. Add new domains rather than renaming existing ones.
 */

export type CareerDomainId =
  | 'technology'
  | 'engineering'
  | 'data'
  | 'design'
  | 'product'
  | 'business'
  | 'operations'
  | 'finance'
  | 'marketing'
  | 'sales'
  | 'human-resources'
  | 'healthcare'
  | 'education'
  | 'legal'
  | 'security';

export interface CareerDomain {
  /** Stable identifier. Persisted in the database — never rename. */
  slug: CareerDomainId;
  /** Human-readable label shown in the UI. */
  label: string;
  /** One-line description of the domain. */
  summary: string;
  /**
   * Lucide icon name, rendered by `src/components/ui/Icon.tsx`.
   * Keep it to an icon that actually exists in the icon set.
   */
  icon: string;
  /**
   * Tailwind-compatible accent colour token (without the `text-`/`bg-`
   * prefix) used to tint the domain chip in the UI.
   */
  accent: string;
  /** Short example search terms; also used to seed search aliases. */
  keywords: string[];
}

export const CAREER_DOMAINS: CareerDomain[] = [
  {
    slug: 'technology',
    label: 'Technology & Software',
    summary: 'Building, shipping and operating software products and platforms.',
    icon: 'Code2',
    accent: 'indigo',
    keywords: ['software', 'developer', 'programming', 'web', 'cloud', 'security', 'qa', 'mobile'],
  },
  {
    slug: 'engineering',
    label: 'Engineering & Manufacturing',
    summary: 'Designing, building and operating physical systems and products.',
    icon: 'Wrench',
    accent: 'slate',
    keywords: ['mechanical', 'civil', 'electrical', 'manufacturing', 'quality', 'architect'],
  },
  {
    slug: 'data',
    label: 'Data & Analytics',
    summary: 'Turning data into decisions through analysis, modelling and reporting.',
    icon: 'BarChart3',
    accent: 'sky',
    keywords: ['data', 'analytics', 'analyst', 'statistics', 'machine learning', 'bi'],
  },
  {
    slug: 'design',
    label: 'Design & Creative',
    summary: 'Shaping how products, brands and messages look and feel.',
    icon: 'Palette',
    accent: 'pink',
    keywords: ['design', 'graphic', 'ux', 'ui', 'visual', 'brand', 'creative', 'motion'],
  },
  {
    slug: 'product',
    label: 'Product & Leadership',
    summary: 'Deciding what to build, prioritising it and shipping it.',
    icon: 'Compass',
    accent: 'violet',
    keywords: ['product', 'owner', 'program', 'roadmap', 'leadership', 'strategy'],
  },
  {
    slug: 'business',
    label: 'Business & Management',
    summary: 'Running organisations, projects and day-to-day business performance.',
    icon: 'Briefcase',
    accent: 'blue',
    keywords: ['business', 'management', 'consulting', 'project', 'operations', 'strategy'],
  },
  {
    slug: 'operations',
    label: 'Operations & Supply Chain',
    summary: 'Moving goods, materials and services reliably and cost-effectively.',
    icon: 'Truck',
    accent: 'amber',
    keywords: ['supply chain', 'logistics', 'procurement', 'inventory', 'warehouse', 'operations'],
  },
  {
    slug: 'finance',
    label: 'Finance & Accounting',
    summary: 'Planning, recording and reporting on money and performance.',
    icon: 'TrendingUp',
    accent: 'emerald',
    keywords: ['finance', 'financial', 'accounting', 'accountant', 'audit', 'tax', 'investment', 'planning'],
  },
  {
    slug: 'marketing',
    label: 'Marketing & Growth',
    summary: 'Understanding audiences and growing awareness, demand and pipeline.',
    icon: 'Megaphone',
    accent: 'fuchsia',
    keywords: ['marketing', 'seo', 'content', 'brand', 'social media', 'growth', 'campaign'],
  },
  {
    slug: 'sales',
    label: 'Sales & Revenue',
    summary: 'Winning customers and growing revenue relationships.',
    icon: 'Handshake',
    accent: 'orange',
    keywords: ['sales', 'account executive', 'business development', 'crm', 'customer success', 'revenue'],
  },
  {
    slug: 'human-resources',
    label: 'People & Human Resources',
    summary: 'Hiring, developing and supporting an organisation’s people.',
    icon: 'Users',
    accent: 'rose',
    keywords: ['hr', 'human resources', 'recruiting', 'recruitment', 'talent', 'people', 'compensation', 'l&d'],
  },
  {
    slug: 'healthcare',
    label: 'Healthcare & Life Sciences',
    summary: 'Delivering care and improving health outcomes for people.',
    icon: 'HeartPulse',
    accent: 'red',
    keywords: ['healthcare', 'nurse', 'clinical', 'medical', 'patient', 'public health', 'pharmacy'],
  },
  {
    slug: 'education',
    label: 'Education & Training',
    summary: 'Teaching, training and developing learning programmes.',
    icon: 'GraduationCap',
    accent: 'cyan',
    keywords: ['teacher', 'teaching', 'education', 'school', 'curriculum', 'training', 'tutor'],
  },
  {
    slug: 'legal',
    label: 'Legal & Regulation',
    summary: 'Applying law, contracts and regulation to organisational decisions.',
    icon: 'Scale',
    accent: 'zinc',
    keywords: ['legal', 'law', 'paralegal', 'compliance', 'contract', 'risk', 'policy'],
  },
  {
    slug: 'security',
    label: 'Security & Compliance',
    summary: 'Protecting systems, data and people from threats and regulatory exposure.',
    icon: 'ShieldCheck',
    accent: 'teal',
    keywords: ['security', 'cybersecurity', 'soc', 'incident response', 'audit', 'assurance'],
  },
];

const DOMAIN_BY_SLUG = new Map<CareerDomainId, CareerDomain>(
  CAREER_DOMAINS.map((domain) => [domain.slug, domain]),
);

export function getCareerDomain(slug: string | null | undefined): CareerDomain | undefined {
  if (!slug) return undefined;
  return DOMAIN_BY_SLUG.get(slug as CareerDomainId);
}

/** Label for a domain slug, with a safe fallback for unknown slugs. */
export function getCareerDomainLabel(slug: string | null | undefined): string {
  return getCareerDomain(slug)?.label ?? (slug ? slug.replace(/[-_]/g, ' ') : 'General');
}
