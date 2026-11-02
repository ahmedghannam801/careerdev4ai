/**
 * The sitemap.
 *
 * The sitemap is generated from the same catalogue the public pages are built
 * from, so it cannot drift away from the site: a role that gains a page gains
 * a sitemap entry in the same request, and a course that is removed from the
 * catalogue leaves the sitemap with it.
 *
 * Only public, indexable URLs are listed. The application's own views are
 * hash-routed (`/#/dashboard`) and behind authentication, so they are not
 * indexable and do not appear here. Private data — a CV, a profile, a
 * roadmap, a notification — is never published.
 */

import { CAREER_ROLES } from '../../shared/careerRoles.ts';
import { absoluteUrl } from './config.ts';
import { escapeHtml } from './html.ts';
import {
  coursePath,
  learningCategoryPath,
  loadCourses,
  loadOpportunities,
  opportunityPath,
  rolePath,
} from './publicPages.ts';

/** One entry of the sitemap. */
export interface SitemapEntry {
  /** The site-relative path. */
  path: string;
  /** The date the page last changed, as an ISO 8601 date. */
  lastmod?: string | null;
  /** The relative importance, between 0 and 1. */
  priority?: number;
  /** How often the page is expected to change, relative to the others. */
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
}

/**
 * Every public URL the site exposes.
 *
 * The list is ordered from the most important page to the least, which is also
 * the order the entries are written in.
 */
export async function collectSitemapEntries(): Promise<SitemapEntry[]> {
  const [courses, opportunities] = await Promise.all([loadCourses(), loadOpportunities()]);

  const categories = new Map<string, string | null>();
  for (const course of courses) {
    if (!categories.has(course.category)) {
      categories.set(course.category, course.updatedAt ?? null);
    }
  }

  const entries: SitemapEntry[] = [
    { path: '/', priority: 1.0, changefreq: 'weekly' },
    { path: '/about', priority: 0.7, changefreq: 'monthly' },
    { path: '/careers', priority: 0.9, changefreq: 'weekly' },
    { path: '/learning', priority: 0.9, changefreq: 'weekly' },
    { path: '/opportunities', priority: 0.8, changefreq: 'daily' },
    { path: '/privacy', priority: 0.3, changefreq: 'yearly' },
  ];

  for (const role of CAREER_ROLES) {
    entries.push({ path: rolePath(role), priority: 0.8, changefreq: 'monthly' });
  }

  for (const [category, lastmod] of categories) {
    entries.push({
      path: learningCategoryPath(category),
      priority: 0.6,
      changefreq: 'weekly',
      lastmod,
    });
  }

  for (const course of courses) {
    entries.push({
      path: coursePath(course.id),
      priority: 0.5,
      changefreq: 'monthly',
      lastmod: course.updatedAt,
    });
  }

  for (const opportunity of opportunities) {
    entries.push({
      path: opportunityPath(opportunity.id),
      priority: 0.6,
      changefreq: 'weekly',
      lastmod: opportunity.updatedAt,
    });
  }

  return entries;
}

/**
 * Formats a date for the sitemap.
 *
 * The protocol accepts the full W3C Datetime, but the day is the precision a
 * search engine actually uses, and `YYYY-MM-DD` is the form every validator
 * and every parser is happiest with. The value is reduced to the UTC day.
 */
function formatLastmod(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/**
 * Renders the sitemap as XML.
 *
 * The document is built by hand rather than by a library so that the output
 * is exactly the shape the specification asks for, with no dependency and no
 * template that could emit an empty element.
 */
export function buildSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const parts = [`    <loc>${escapeHtml(absoluteUrl(entry.path))}</loc>`];
      const lastmod = formatLastmod(entry.lastmod);
      if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
      if (entry.changefreq) parts.push(`    <changefreq>${entry.changefreq}</changefreq>`);
      if (typeof entry.priority === 'number') {
        parts.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
      }
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/** The absolute URL of the sitemap. */
export function sitemapUrl(): string {
  return absoluteUrl('/sitemap.xml');
}
