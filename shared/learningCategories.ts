/**
 * The learning catalogue's category vocabulary, and how the career domains
 * map onto it.
 *
 * The catalogue stores a free-text `category` on every course, and the
 * Learning Center filters on the distinct values it finds. That made adding
 * a career domain easy, but it also left the recommender's goal scoring
 * locked to a hard-coded list of technical categories: a course in
 * "Finance" scored 0.25 for every career goal because the goal map only
 * knew about Programming, Data and Cloud.
 *
 * This module is the shared vocabulary. Both the catalogue seed and the
 * recommender use it, so a course in a category always has a defined
 * relationship to the career domains it serves.
 */

import type { CareerDomainId } from './careerDomains.ts';

/**
 * The canonical catalogue categories.
 *
 * `courses.category` is unconstrained in the database, so this list is a
 * convention rather than a constraint — but the recommender relies on it.
 */
export const LEARNING_CATEGORIES = [
  'Programming',
  'Data',
  'AI',
  'Frontend',
  'Backend',
  'Cloud',
  'Cybersecurity',
  'Compliance',
  'Design',
  'Product',
  'Project Management',
  'Business',
  'Analytics',
  'Operations',
  'Supply Chain',
  'Finance',
  'Accounting',
  'Marketing',
  'Sales',
  'People',
  'Healthcare',
  'Education',
  'Legal',
  'Engineering',
  'Manufacturing',
  'Quality',
] as const;

export type LearningCategory = (typeof LEARNING_CATEGORIES)[number];

/**
 * Which catalogue categories serve which career domain.
 *
 * A course whose category appears in the user's target-role domain is
 * directly relevant to them, whatever their career goal happens to be.
 */
export const DOMAIN_LEARNING_CATEGORIES: Record<CareerDomainId, string[]> = {
  technology: ['Programming', 'Data', 'AI', 'Frontend', 'Backend', 'Cloud', 'Cybersecurity'],
  engineering: ['Engineering', 'Manufacturing', 'Quality', 'Project Management'],
  data: ['Data', 'Analytics', 'AI', 'Programming'],
  design: ['Design', 'Frontend'],
  product: ['Product', 'Project Management', 'Design', 'Analytics'],
  business: ['Business', 'Analytics', 'Project Management', 'People'],
  operations: ['Operations', 'Supply Chain', 'Project Management', 'Analytics'],
  finance: ['Finance', 'Accounting', 'Analytics', 'Data'],
  marketing: ['Marketing', 'Design', 'Analytics'],
  sales: ['Sales', 'Marketing', 'People'],
  'human-resources': ['People', 'Business', 'Compliance'],
  healthcare: ['Healthcare', 'People', 'Compliance'],
  education: ['Education', 'People', 'Design'],
  legal: ['Legal', 'Compliance', 'Business'],
  security: ['Cybersecurity', 'Compliance', 'Cloud'],
};

/** The catalogue categories that serve a domain. */
export function learningCategoriesForDomain(domainId: string | null | undefined): string[] {
  if (!domainId) return [];
  return DOMAIN_LEARNING_CATEGORIES[domainId as CareerDomainId] ?? [];
}

/**
 * The catalogue categories that suit a career goal.
 *
 * These are goal *kinds*, not domains: a goal that is about getting hired
 * suits introductory material in any discipline. The domain mapping is
 * applied on top of this, so the recommender never penalises a course for
 * being in a discipline the user did not choose.
 */
export const GOAL_LEARNING_CATEGORIES: Record<string, string[]> = {
  get_first_job: ['Programming', 'Data', 'Frontend', 'Cloud', 'Cybersecurity', 'Business', 'Finance', 'Marketing', 'Sales', 'People', 'Operations', 'Education', 'Healthcare', 'Legal', 'Design', 'Engineering'],
  get_internship: ['Programming', 'Data', 'Frontend', 'Business', 'Finance', 'Marketing', 'Design', 'People'],
  switch_career: ['Programming', 'Data', 'Business', 'Finance', 'Marketing', 'Sales', 'People', 'Operations', 'Design', 'Healthcare', 'Legal', 'Education'],
  get_promoted: ['Product', 'Business', 'Project Management', 'People', 'Analytics', 'Finance', 'Operations'],
  become_specialist: ['Data', 'AI', 'Cybersecurity', 'Analytics', 'Finance', 'Legal', 'Healthcare', 'Engineering', 'Quality', 'Compliance'],
  become_manager: ['Product', 'Business', 'Project Management', 'People', 'Operations'],
  build_portfolio: ['Frontend', 'Backend', 'Data', 'Design', 'Marketing', 'Business', 'Finance'],
  freelance: ['Frontend', 'Backend', 'Design', 'Marketing', 'Business', 'Sales'],
  explore_careers: ['Programming', 'Data', 'AI', 'Design', 'Product', 'Business', 'Finance', 'Marketing', 'People', 'Healthcare', 'Education', 'Legal'],
  custom: [],
};

/**
 * Whether a catalogue category belongs to a career domain.
 *
 * Matching is case-insensitive so a seed row that says "finance" still
 * resolves.
 */
export function categoryServesDomain(category: string, domainId: string | null | undefined): boolean {
  if (!domainId) return false;
  const wanted = learningCategoriesForDomain(domainId).map((entry) => entry.toLowerCase());
  return wanted.includes((category ?? '').trim().toLowerCase());
}
