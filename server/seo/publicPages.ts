/**
 * The public pages, rendered on the server.
 *
 * The application itself is a hash-routed single-page application, which means
 * a crawler that requests `/#/learning` receives the same document as the home
 * page: the fragment is never sent to the server. Search engines cannot index
 * those URLs, and a hash URL cannot carry its own canonical link.
 *
 * These pages solve that without touching the application's routing. They are
 * ordinary server-rendered documents, served from clean paths, built from the
 * data the platform already owns:
 *
 *   - the career catalogue in `shared/careerRoles.ts`;
 *   - the learning catalogue in the `courses` table;
 *   - the volunteering catalogue in the `volunteer_opportunities` table.
 *
 * Nothing here is invented. Every page describes content that exists in the
 * catalogue, and every structured-data block describes the page that renders
 * it.
 *
 * The private side of the product is untouched: it stays behind the hash
 * routes, behind authentication, and out of the sitemap.
 */

import { CAREER_DOMAINS, getCareerDomain } from '../../shared/careerDomains.ts';
import {
  BUSINESS_CONTACT,
  businessAddressLines,
  businessPhoneHref,
  isBusinessContactComplete,
  OPERATOR_LINKEDIN_URL,
  OPERATOR_NAME,
} from '../../shared/contact.ts';
import { hasApprovedTerms, TERMS_DOCUMENT } from '../../shared/legal.ts';
import { CAREER_ROLES } from '../../shared/careerRoles.ts';
import type { TargetRole } from '../../shared/careerTypes.ts';
import { getSupabaseServer } from '../db/supabase.ts';
import { SITE_NAME, absoluteUrl, clampDescription, slugify } from './config.ts';
import { escapeHtml, renderPublicPage, type PublicPage } from './html.ts';
import {
  breadcrumbSchema,
  contactPageSchema,
  courseSchema,
  itemListSchema,
  organizationSchema,
  volunteerOpportunitySchema,
  webPageSchema,
  websiteSchema,
  type BreadcrumbEntry,
} from './jsonld.ts';

/* -------------------------------------------------------------------------- */
/* Public URL vocabulary                                                       */
/* -------------------------------------------------------------------------- */

/** The site-relative path of a career role page. */
export function rolePath(role: Pick<TargetRole, 'id'>): string {
  return `/careers/${role.id}`;
}

/** The site-relative path of a learning resource page. */
export function coursePath(courseId: string): string {
  return `/learning/course/${courseId}`;
}

/** The site-relative path of a learning category page. */
export function learningCategoryPath(category: string): string {
  return `/learning/category/${slugify(category)}`;
}

/** The site-relative path of an opportunity page. */
export function opportunityPath(id: string): string {
  return `/opportunities/${id}`;
}

/** The static public pages that carry no catalogue data. */
export const STATIC_PUBLIC_PATHS = ['/about', '/privacy'] as const;

/* -------------------------------------------------------------------------- */
/* Catalogue access                                                           */
/* -------------------------------------------------------------------------- */

/** A learning resource, reduced to the facts a public page may publish. */
export interface PublicCourse {
  id: string;
  title: string;
  provider: string;
  providerUrl: string | null;
  category: string;
  level: string;
  durationHours: number | null;
  language: string;
  url: string;
  availability: string;
  availabilityNote: string | null;
  format: string;
  description: string | null;
  skills: string[];
  updatedAt: string | null;
}

/** A volunteering opportunity, reduced to the facts a public page may publish. */
export interface PublicOpportunity {
  id: string;
  title: string;
  organization: string;
  description: string | null;
  category: string;
  location: string | null;
  isRemote: boolean;
  commitment: string | null;
  skillsGained: string[];
  applicationUrl: string | null;
  country: string | null;
  deadline: string | null;
  verificationStatus: string | null;
  updatedAt: string | null;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const courseCache: { entry: CacheEntry<PublicCourse[]> | null } = { entry: null };
const opportunityCache: { entry: CacheEntry<PublicOpportunity[]> | null } = { entry: null };

/**
 * Reads the learning catalogue.
 *
 * A failure here must not take the public site down: the catalogue pages fall
 * back to an empty list and the rest of the site keeps working.
 */
export async function loadCourses(): Promise<PublicCourse[]> {
  const now = Date.now();
  if (courseCache.entry && courseCache.entry.expiresAt > now) {
    return courseCache.entry.value;
  }

  try {
    const supabase = getSupabaseServer();
    const [coursesResult, skillRowsResult] = await Promise.all([
      supabase
        .from('courses')
        .select(
          'id, title, provider, provider_url, category, level, duration_hours, language, url, availability, availability_note, format, description, updated_at'
        )
        .order('title', { ascending: true }),
      supabase.from('course_skills').select('course_id, skill_name, importance'),
    ]);

    if (coursesResult.error) throw coursesResult.error;

    const skillsByCourse = new Map<string, string[]>();
    for (const row of (skillRowsResult.data ?? []) as Array<{
      course_id: string;
      skill_name: string;
      importance: string | null;
    }>) {
      const list = skillsByCourse.get(row.course_id) ?? [];
      if (list.length < 6) list.push(row.skill_name);
      skillsByCourse.set(row.course_id, list);
    }

    const courses = ((coursesResult.data ?? []) as Array<Record<string, unknown>>).map(
      (row): PublicCourse => ({
        id: String(row.id),
        title: String(row.title ?? ''),
        provider: String(row.provider ?? ''),
        providerUrl: (row.provider_url as string | null) ?? null,
        category: String(row.category ?? ''),
        level: String(row.level ?? ''),
        durationHours:
          typeof row.duration_hours === 'number' ? row.duration_hours : null,
        language: String(row.language ?? 'English'),
        url: String(row.url ?? ''),
        availability: String(row.availability ?? ''),
        availabilityNote: (row.availability_note as string | null) ?? null,
        format: String(row.format ?? 'course'),
        description: (row.description as string | null) ?? null,
        skills: skillsByCourse.get(String(row.id)) ?? [],
        updatedAt: (row.updated_at as string | null) ?? null,
      })
    );

    courseCache.entry = { value: courses, expiresAt: now + CACHE_TTL_MS };
    return courses;
  } catch (error) {
    console.error('SEO: could not read the learning catalogue:', error);
    return courseCache.entry?.value ?? [];
  }
}

/**
 * Reads the volunteering catalogue.
 *
 * Only live rows are published: an expired or deactivated opportunity is not
 * an opportunity, and the public page must not advertise it.
 */
export async function loadOpportunities(): Promise<PublicOpportunity[]> {
  const now = Date.now();
  if (opportunityCache.entry && opportunityCache.entry.expiresAt > now) {
    return opportunityCache.entry.value;
  }

  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from('volunteer_opportunities')
      .select(
        'id, title, organization, description, category, location, is_remote, commitment, skills_gained, application_url, country, deadline, verification_status, updated_at'
      )
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('organization', { ascending: true });

    if (error) throw error;

    const opportunities = ((data ?? []) as Array<Record<string, unknown>>).map(
      (row): PublicOpportunity => ({
        id: String(row.id),
        title: String(row.title ?? ''),
        organization: String(row.organization ?? ''),
        description: (row.description as string | null) ?? null,
        category: String(row.category ?? ''),
        location: (row.location as string | null) ?? null,
        isRemote: row.is_remote === true,
        commitment: (row.commitment as string | null) ?? null,
        skillsGained: Array.isArray(row.skills_gained)
          ? (row.skills_gained as string[]).filter(Boolean)
          : [],
        applicationUrl: (row.application_url as string | null) ?? null,
        country: (row.country as string | null) ?? null,
        deadline: (row.deadline as string | null) ?? null,
        verificationStatus: (row.verification_status as string | null) ?? null,
        updatedAt: (row.updated_at as string | null) ?? null,
      })
    );

    opportunityCache.entry = { value: opportunities, expiresAt: now + CACHE_TTL_MS };
    return opportunities;
  } catch (error) {
    console.error('SEO: could not read the volunteering catalogue:', error);
    return opportunityCache.entry?.value ?? [];
  }
}

/* -------------------------------------------------------------------------- */
/* Small HTML helpers                                                         */
/* -------------------------------------------------------------------------- */

/** A list of items, or nothing at all when the list is empty. */
function listOrEmpty(items: string[], emptyText = ''): string {
  if (items.length === 0) return emptyText ? `<p class="meta">${escapeHtml(emptyText)}</p>` : '';
  return `<ul class="clean">${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')}</ul>`;
}

/** A row of labelled tags. */
function tagRow(tags: string[]): string {
  if (tags.length === 0) return '';
  return `<div class="tags">${tags
    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join('')}</div>`;
}

/** A link into the application. */
function appLink(href: string, label: string, secondary = false): string {
  return `<a class="button${secondary ? ' secondary' : ''}" href="${escapeHtml(href)}">${escapeHtml(
    label
  )}</a>`;
}

/**
 * Capitalises the first letter of a sentence.
 *
 * The notice that lists the outstanding details starts with a phrase that was
 * written mid-sentence, so it needs the first letter raised to read as a
 * sentence of its own.
 */
function capitalise(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/* -------------------------------------------------------------------------- */
/* The pages                                                                  */
/* -------------------------------------------------------------------------- */

/** The about page. */
function buildAboutPage(): PublicPage {
  const path = '/about';
  const description =
    'CareerDev4AI is an AI-powered career operating system: goals, skills, roadmaps, CVs, job applications, interview practice, learning resources and volunteering opportunities in one bilingual workspace.';

  const body = `      <section class="hero">
        <h1>About ${escapeHtml(SITE_NAME)}</h1>
        <p class="lede">${escapeHtml(description)}</p>
      </section>

      <section>
        <h2>What the platform does</h2>
        <p>Most career decisions are made in fragments: a goal in one place, a CV in another, a course bookmarked somewhere else, and a list of jobs that never becomes a plan. ${escapeHtml(
          SITE_NAME
        )} puts the whole journey in one place and keeps it connected, so each step is grounded in what you have already done rather than in generic advice.</p>
        <div class="grid">
          <div class="card"><h3>Goals and career setup</h3><p>Define the target role, the domain and the level you are aiming at, and the platform keeps every later step tied to that choice.</p></div>
          <div class="card"><h3>Skills and gap analysis</h3><p>Record what you can already do, compare it with what the role expects, and see the gap that is actually worth closing.</p></div>
          <div class="card"><h3>Roadmaps</h3><p>A phased plan of the skills, projects and milestones that take you from where you are to where you want to be.</p></div>
          <div class="card"><h3>CV studio</h3><p>Build, tailor and check a CV against a real job description, with ATS analysis and version history.</p></div>
          <div class="card"><h3>Applications and interviews</h3><p>Track every application through its stages and practise with a structured interview plan for the role you are chasing.</p></div>
          <div class="card"><h3>Learning and volunteering</h3><p>A curated catalogue of courses matched to your gaps, plus volunteering opportunities that close them in practice.</p></div>
        </div>
      </section>

      <section>
        <h2>Built for the next step, in the language you think in</h2>
        <p>The interface is bilingual: English and Arabic, in both reading directions, with right-to-left layout handled properly rather than as an afterthought. The AI guidance runs in the language you choose and is grounded in your own record — the role you are targeting, the skills you have, the roadmap you are following — rather than in a generic answer to a generic question.</p>
      </section>

      <section>
        <h2>Open the catalogue</h2>
        <p>The career, learning and volunteering catalogues are public. You can read them without an account, and the platform itself will build a plan around them once you sign in.</p>
        <div class="cta">
          ${appLink('/careers', 'Browse career roles')}
          ${appLink('/learning', 'Browse learning resources')}
          ${appLink('/opportunities', 'Browse volunteering opportunities')}
        </div>
      </section>`;

  return {
    path,
    title: `About ${SITE_NAME} — Your AI Career Operating System`,
    description,
    body,
    jsonLd: [
      organizationSchema(),
      webPageSchema({ name: `About ${SITE_NAME}`, description, path, hasBreadcrumb: true }),
      breadcrumbSchema(
        [
          { name: 'Home', path: '/' },
          { name: 'About', path },
        ],
        path
      ),
    ],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'About', path: path },
    ],
  };
}

/** The privacy page. */
function buildPrivacyPage(): PublicPage {
  const path = '/privacy';
  const description =
    'How CareerDev4AI handles analytics: aggregated, cookie-free measurement of page views and product usage, with no CV text, no contact details and no private profile fields ever sent to Google Analytics.';

  const body = `      <section class="hero">
        <h1>Privacy and analytics</h1>
        <p class="lede">${escapeHtml(description)}</p>
      </section>

      <section>
        <h2>What is measured</h2>
        <p>The site uses Google Analytics 4 to understand how the product is used: which public pages are read, where visitors come from, what device they use, and which parts of the career journey people reach. All of it is aggregated.</p>
        <ul class="clean">
          <li>Page views, sessions and active users.</li>
          <li>The referring source of a visit — search, social, or a direct link.</li>
          <li>The country and device category of a visit.</li>
          <li>Product milestones such as registering, choosing a career, enrolling in a roadmap, starting or completing a learning item, starting a project, and viewing or clicking an opportunity.</li>
        </ul>
      </section>

      <section>
        <h2>What is never measured</h2>
        <p>The analytics integration is deliberately restricted. The following never leave the browser and are never sent as an analytics parameter:</p>
        <ul class="clean">
          <li>The contents of a CV, in any form.</li>
          <li>Private profile fields.</li>
          <li>Private projects, roadmaps and notifications.</li>
          <li>Email addresses, phone numbers or any other contact detail.</li>
          <li>Session tokens or credentials.</li>
          <li>User identifiers that would let a visit be tied back to an individual.</li>
        </ul>
      </section>

      <section>
        <h2>How the measurement is kept anonymous</h2>
        <ul class="clean">
          <li>IP anonymisation is on, so the last octet of a visitor's address is discarded before storage.</li>
          <li>Google's advertising and remarketing signals are turned off, so the data is used for measurement only.</li>
          <li>No advertising identifiers are read or stored.</li>
          <li>Events carry a name and a small, non-identifying set of values — a route, a category, a level. They never carry a name, an email or a document.</li>
        </ul>
      </section>

      <section>
        <h2>Your own records</h2>
        <p>Your career records, CVs, documents and notifications are private to your account and are protected by authentication. They are not part of any public page and are not included in the sitemap. An internal counter, if one is shown, counts visits only and stores no personal information.</p>
      </section>`;

  return {
    path,
    title: `Privacy and Analytics — ${SITE_NAME}`,
    description,
    body,
    jsonLd: [
      webPageSchema({ name: 'Privacy and Analytics', description, path, hasBreadcrumb: true }),
      breadcrumbSchema(
        [
          { name: 'Home', path: '/' },
          { name: 'Privacy', path },
        ],
        path
      ),
    ],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Privacy', path: path },
    ],
  };
}

/**
 * The Contact Us page.
 *
 * This page carries the business details a third party acts on: a postal
 * address, a telephone number and an email address. It is published as a
 * server-rendered document at its own address, with no session and no
 * account, so a reviewer can open it and read it.
 *
 * The details come from `shared/contact.ts` and nothing here invents one. A
 * detail that has not been supplied is shown as a marked placeholder and is
 * left out of the structured data, so the page never asserts an address or a
 * number that the business has not published.
 */
function buildContactPage(): PublicPage {
  const path = '/contact';
  const details = BUSINESS_CONTACT;

  const addressLines = businessAddressLines(details);
  // A postal address is only published once it has a street and a city: a
  // governorate on its own is not an address a post could be sent to.
  const addressPublished = Boolean(
    details.address.street?.trim() && details.address.city?.trim()
  );
  const phoneHref = businessPhoneHref(details);
  const email = details.email?.trim() || null;

  const description =
    'Contact CareerDev4AI: the business address in Egypt, the telephone number on the +20 country code, and the email address the team answers on. Support, feedback and merchant onboarding enquiries.';

  /* The details that are still outstanding, named so the notice can be exact
     rather than vague. */
  const missing: string[] = [];
  if (!addressPublished) missing.push('the registered business address in Egypt');
  if (!details.phone?.trim()) missing.push('the telephone number');
  if (!email) missing.push('the business email address');
  const complete = isBusinessContactComplete(details);

  /* The icons are inline SVG: the page runs no JavaScript, but inline markup
     is part of the document. */
  const pinIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
  const phoneIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>';
  const mailIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>';

  const addressValue = addressPublished
    ? `<address class="contact-value address-block">${addressLines
        .map((line) => `<span>${escapeHtml(line)}</span>`)
        .join('')}</address>`
    : `<div class="pending">
         <p class="contact-value">${escapeHtml(details.address.country)} — address to be published</p>
       </div>
       <p><span class="chip-pending">To be published</span></p>`;

  const phoneValue = details.phone?.trim()
    ? `<p class="contact-value"><a href="${escapeHtml(phoneHref ?? '')}">${escapeHtml(
        details.phone.trim()
      )}</a></p>`
    : `<div class="pending">
         <p class="contact-value">+20 XX XXX XXXX</p>
       </div>
       <p><span class="chip-pending">To be published</span></p>`;

  const emailValue = email
    ? `<p class="contact-value"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>`
    : `<div class="pending">
         <p class="contact-value">Email address to be published</p>
       </div>
       <p><span class="chip-pending">To be published</span></p>`;

  const pendingNotice =
    complete || missing.length === 0
      ? ''
      : `      <div class="notice" role="note">
        <p><strong>${missing.length === 1 ? 'One detail is' : `${missing.length} details are`} still to be published.</strong> ${escapeHtml(
          capitalise(
            missing.join(', ').replace(/, ([^,]*)$/, ' and $1')
          )
        )}. Nothing is shown in its place: a placeholder address or a placeholder number would be worse than an acknowledged gap, so each one is marked as outstanding until it is confirmed.</p>
      </div>`;

  const body = `      <section class="hero">
        <h1>Contact Us</h1>
        <p class="lede">${escapeHtml(description)}</p>
      </section>

      <section>
        <h2>Business contact details</h2>
        <p>These are the details for the business behind ${escapeHtml(
          details.businessName
        )}. They are published here so that a customer, a partner or a compliance reviewer can reach the business directly, without an account and without a form.</p>
        <div class="grid">
          <div class="card contact-card">
            <span class="contact-icon">${pinIcon}</span>
            <span class="contact-label">Business address</span>
            ${addressValue}
            <p class="contact-note">The registered address of the business in ${escapeHtml(
              details.address.country
            )}.</p>
          </div>
          <div class="card contact-card">
            <span class="contact-icon">${phoneIcon}</span>
            <span class="contact-label">Telephone</span>
            ${phoneValue}
            <p class="contact-note">Egyptian numbers are reached on the +20 country code.</p>
          </div>
          <div class="card contact-card">
            <span class="contact-icon">${mailIcon}</span>
            <span class="contact-label">Email</span>
            ${emailValue}
            <p class="contact-note">Support, feedback and merchant onboarding enquiries are answered on this address.</p>
          </div>
        </div>
${pendingNotice}
        <div class="cta">
          ${email ? appLink(`mailto:${email}`, 'Send us an email') : ''}
          ${appLink('/about', 'About the platform', true)}
        </div>
      </section>

      <section>
        <h2>What to include in a message</h2>
        <p>It helps to have these to hand before writing, because they are what a reply usually turns on:</p>
        <ul class="detail-list">
          <li><strong>The name of the business</strong> <span>the registered or trading name, as it appears on the commercial record.</span></li>
          <li><strong>Your reference</strong> <span>the merchant, application or account number the enquiry is about, if you have one.</span></li>
          <li><strong>What you need</strong> <span>a short description of the request, and any date it relates to.</span></li>
          <li><strong>How to reply</strong> <span>the address or number the reply should go to.</span></li>
        </ul>
      </section>

      <section>
        <h2>Who you are writing to</h2>
        <p>${escapeHtml(
          details.businessName
        )} is built and published by ${escapeHtml(OPERATOR_NAME)}, who is the contact for the published legal documents as well as for this page.</p>
        <div class="cta">
          <a class="button secondary" href="${escapeHtml(
            OPERATOR_LINKEDIN_URL
          )}" target="_blank" rel="noopener noreferrer">LinkedIn profile</a>
        </div>
      </section>

      <section>
        <h2>Legal documents</h2>
        <p>The Terms and the Privacy Policy are published in full, at their own addresses, and are versioned. They name the same business and the same contact channels as this page.</p>
        <div class="cta">
          ${appLink('/terms', 'Terms & Conditions', true)}
          ${appLink('/privacy', 'Privacy and analytics', true)}
        </div>
      </section>`;

  return {
    path,
    title: `Contact Us — Business Address, Phone & Email | ${SITE_NAME}`,
    description,
    body,
    jsonLd: [
      contactPageSchema({
        name: `Contact ${details.businessName}`,
        description,
        path,
        business: {
          name: details.businessName,
          url: absoluteUrl('/'),
          email,
          telephone: details.phone?.trim() || null,
          address: {
            streetAddress: details.address.street,
            addressLocality: details.address.city,
            addressRegion: details.address.governorate,
            postalCode: details.address.postalCode,
            addressCountry: details.address.country,
          },
        },
      }),
      webPageSchema({ name: 'Contact Us', description, path, hasBreadcrumb: true }),
      breadcrumbSchema(
        [
          { name: 'Home', path: '/' },
          { name: 'Contact', path },
        ],
        path
      ),
    ],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Contact', path: path },
    ],
  };
}

/**
 * Terms page shell. It never substitutes generated copy for the legal document.
 * Until the operator adds and approves the actual text, the route is noindex and
 * reports 503 so signup cannot be mistaken for being legally ready.
 */
function buildTermsPage(): PublicPage {
  const path = '/terms';
  const available = hasApprovedTerms();
  const description = available
    ? 'The current approved Terms & Conditions for CareerDev4AI: account use, acceptable use, AI-generated content, your documents, liability and contact details.'
    : 'Terms & Conditions are not published yet. Registration and protected platform use remain unavailable until approved legal content is supplied.';
  const content = available
    ? TERMS_DOCUMENT.sections
        .map((section) => `<section><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.body).replace(/\r?\n/g, '<br>')}</p></section>`)
        .join('\n')
    : `<section class="hero"><h1>Terms &amp; Conditions</h1><p class="lede">Terms &amp; Conditions have not been published. The operator must supply and approve the document before registration or protected platform use is enabled.</p><p lang="ar" dir="rtl">لم تُنشر الشروط والأحكام بعد. يجب على المشغّل توفير النص القانوني واعتماده قبل تفعيل التسجيل أو استخدام المنصة.</p></section>`;

  return {
    path,
    title: `Terms & Conditions | ${SITE_NAME}`,
    description,
    body: available
      ? `<section class="hero"><h1>Terms &amp; Conditions</h1></section>${content}`
      : content,
    noindex: !available,
  };
}

/** The index of the career catalogue. */
function buildCareersIndexPage(): PublicPage {
  const path = '/careers';
  const description = `Explore ${CAREER_ROLES.length} career roles across ${CAREER_DOMAINS.length} career domains. Each role lists the responsibilities, core skills, tools, interview topics, salary range and projects that make it real.`;

  const byDomain = new Map<string, TargetRole[]>();
  for (const role of CAREER_ROLES) {
    const list = byDomain.get(role.domainId) ?? [];
    list.push(role);
    byDomain.set(role.domainId, list);
  }

  const sections = CAREER_DOMAINS.map((domain) => {
    const roles = byDomain.get(domain.slug) ?? [];
    if (roles.length === 0) return '';
    const cards = roles
      .map(
        (role) => `            <div class="card"><span class="chip">${escapeHtml(
          role.level
        )}</span><h3><a href="${escapeHtml(rolePath(role))}">${escapeHtml(
          role.title
        )}</a></h3><p>${escapeHtml(clampDescription(role.overview, 120))}</p></div>`
      )
      .join('\n');
    return `      <section>
        <h2>${escapeHtml(domain.label)}</h2>
        <p class="meta">${escapeHtml(domain.summary)}</p>
        <div class="grid">
${cards}
        </div>
      </section>`;
  })
    .filter(Boolean)
    .join('\n');

  const body = `      <section class="hero">
        <h1>Career roles</h1>
        <p class="lede">${escapeHtml(description)}</p>
      </section>
${sections}
      <section>
        <h2>Build your own plan</h2>
        <p>Pick a role inside the platform and it becomes the target every roadmap, learning plan and CV is built around.</p>
        <div class="cta">${appLink('/#/dashboard', 'Open CareerDev4AI')}</div>
      </section>`;

  const items = CAREER_ROLES.map((role) => ({ name: role.title, path: rolePath(role) }));

  return {
    path,
    title: `Career Roles — ${CAREER_ROLES.length} Paths, Skills & Roadmaps | ${SITE_NAME}`,
    description,
    body,
    jsonLd: [
      webPageSchema({ name: 'Career Roles', description, path, hasBreadcrumb: true }),
      breadcrumbSchema(
        [
          { name: 'Home', path: '/' },
          { name: 'Careers', path },
        ],
        path
      ),
      itemListSchema('Career roles', items),
    ],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Careers', path: path },
    ],
  };
}

/** The page of one career role. */
function buildRolePage(role: TargetRole): PublicPage {
  const path = rolePath(role);
  const domain = getCareerDomain(role.domainId);
  const description = clampDescription(
    `${role.title} career guide: responsibilities, core skills, tools, salary range, interview topics and the projects that make a strong portfolio for this role.`
  );

  const related = role.relatedRoles
    .map((name) => {
      const match = CAREER_ROLES.find(
        (candidate) => candidate.title.toLowerCase() === name.toLowerCase()
      );
      return match
        ? `<li><a href="${escapeHtml(rolePath(match))}">${escapeHtml(match.title)}</a></li>`
        : `<li>${escapeHtml(name)}</li>`;
    })
    .join('');

  const body = `      <section class="hero">
        <h1>${escapeHtml(role.title)}</h1>
        <p class="lede">${escapeHtml(role.overview)}</p>
        <div class="tags">
          <span class="tag">${escapeHtml(domain?.label ?? role.category)}</span>
          <span class="tag">${escapeHtml(role.level)} level</span>
          <span class="tag">${escapeHtml(role.salaryRange)}</span>
        </div>
      </section>

      <section>
        <h2>What the role involves</h2>
        ${listOrEmpty(role.responsibilities)}
      </section>

      <section>
        <h2>Core skills</h2>
        ${listOrEmpty(role.requiredSkills.map((skill) => `${skill.name} (level ${skill.minLevel}/5)`))}
      </section>

      ${
        role.preferredSkills.length > 0
          ? `<section>
        <h2>Preferred skills</h2>
        ${listOrEmpty(role.preferredSkills.map((skill) => skill.name))}
      </section>`
          : ''
      }

      ${
        role.tools.length > 0
          ? `<section>
        <h2>Tools</h2>
        ${tagRow(role.tools)}
      </section>`
          : ''
      }

      <section>
        <h2>Experience expected</h2>
        <p>${escapeHtml(role.experienceExpectation)}</p>
      </section>

      ${
        role.typicalProjects.length > 0
          ? `<section>
        <h2>Projects that prove the role</h2>
        ${listOrEmpty(role.typicalProjects)}
      </section>`
          : ''
      }

      ${
        role.evidenceSuggestions.length > 0
          ? `<section>
        <h2>Evidence to collect</h2>
        ${listOrEmpty(role.evidenceSuggestions)}
      </section>`
          : ''
      }

      ${
        role.interviewTopics.length > 0
          ? `<section>
        <h2>What the interview covers</h2>
        ${listOrEmpty(role.interviewTopics)}
      </section>`
          : ''
      }

      <section>
        <h2>How the role progresses</h2>
        ${listOrEmpty(role.careerProgression)}
      </section>

      ${
        role.certifications.length > 0
          ? `<section>
        <h2>Certifications that carry weight</h2>
        ${listOrEmpty(role.certifications)}
      </section>`
          : ''
      }

      ${
        related
          ? `<section>
        <h2>Related roles</h2>
        <ul class="clean">${related}</ul>
      </section>`
          : ''
      }

      <section>
        <h2>Turn this into a plan</h2>
        <p>Inside ${escapeHtml(SITE_NAME)}, choosing this role generates a roadmap of the skills, projects and milestones that move you towards it.</p>
        <div class="cta">${appLink('/#/dashboard', 'Plan this career')}</div>
      </section>`;

  return {
    path,
    title: `${role.title} Career Path, Skills & Roadmap | ${SITE_NAME}`,
    description,
    body,
    jsonLd: [
      webPageSchema({ name: role.title, description, path, hasBreadcrumb: true }),
      breadcrumbSchema(
        [
          { name: 'Home', path: '/' },
          { name: 'Careers', path: '/careers' },
          { name: role.title, path },
        ],
        path
      ),
    ],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Careers', path: '/careers' },
      { name: role.title, path: path },
    ],
  };
}

/** The index of the learning catalogue. */
function buildLearningIndexPage(courses: PublicCourse[]): PublicPage {
  const path = '/learning';
  const categories = new Map<string, PublicCourse[]>();
  for (const course of courses) {
    const list = categories.get(course.category) ?? [];
    list.push(course);
    categories.set(course.category, list);
  }

  const description = `A curated catalogue of ${courses.length} free and paid learning resources across ${categories.size} categories — courses, video playlists, tutorials and documentation matched to real career skills.`;

  const categoryLinks = Array.from(categories.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(
      ([category, list]) =>
        `            <div class="card"><h3><a href="${escapeHtml(
          learningCategoryPath(category)
        )}">${escapeHtml(category)}</a></h3><p class="meta">${list.length} resource${
          list.length === 1 ? '' : 's'
        }</p></div>`
    )
    .join('\n');

  const featured = courses
    .filter((course) => course.description && course.description.length > 80)
    .slice(0, 24)
    .map(
      (course) => `            <div class="card"><h3><a href="${escapeHtml(
        coursePath(course.id)
      )}">${escapeHtml(course.title)}</a></h3><p class="meta">${escapeHtml(course.provider)} · ${escapeHtml(
        course.level
      )} · ${escapeHtml(course.category)}</p></div>`
    )
    .join('\n');

  const body = `      <section class="hero">
        <h1>Learning resources</h1>
        <p class="lede">${escapeHtml(description)}</p>
      </section>

      <section>
        <h2>Browse by category</h2>
        <div class="grid">
${categoryLinks}
        </div>
      </section>

      <section>
        <h2>Recently catalogued</h2>
        <div class="grid">
${featured}
        </div>
      </section>

      <section>
        <h2>Learn against your own gap</h2>
        <p>The platform ranks these resources against the skills your target role expects and the gaps in your record, so the next course is the one that actually moves you forward.</p>
        <div class="cta">${appLink('/#/learning', 'Open the Learning Hub')}</div>
      </section>`;

  const items = courses.map((course) => ({ name: course.title, path: coursePath(course.id) }));

  return {
    path,
    title: `Free Learning Resources & Courses — ${courses.length} Curated | ${SITE_NAME}`,
    description,
    body,
    jsonLd: [
      webPageSchema({ name: 'Learning Resources', description, path, hasBreadcrumb: true }),
      breadcrumbSchema(
        [
          { name: 'Home', path: '/' },
          { name: 'Learning', path },
        ],
        path
      ),
      itemListSchema('Learning resources', items),
    ],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Learning', path: path },
    ],
  };
}

/** The page of one learning category. */
function buildLearningCategoryPage(category: string, courses: PublicCourse[]): PublicPage {
  const path = learningCategoryPath(category);
  const description = `${courses.length} ${category} learning resources — courses, video playlists, tutorials and documentation you can start with today.`;

  const cards = courses
    .map(
      (course) => `            <div class="card"><h3><a href="${escapeHtml(
        coursePath(course.id)
      )}">${escapeHtml(course.title)}</a></h3><p class="meta">${escapeHtml(course.provider)} · ${escapeHtml(
        course.level
      )} · ${escapeHtml(course.format.replace(/_/g, ' '))}</p></div>`
    )
    .join('\n');

  const body = `      <section class="hero">
        <h1>${escapeHtml(category)} learning resources</h1>
        <p class="lede">${escapeHtml(description)}</p>
      </section>

      <section>
        <div class="grid">
${cards}
        </div>
      </section>

      <section>
        <h2>Learn against your own gap</h2>
        <div class="cta">${appLink('/#/learning', 'Open the Learning Hub')}</div>
      </section>`;

  const items = courses.map((course) => ({ name: course.title, path: coursePath(course.id) }));

  return {
    path,
    title: `${category} Courses & Tutorials — ${courses.length} Resources | ${SITE_NAME}`,
    description,
    body,
    jsonLd: [
      webPageSchema({ name: `${category} learning resources`, description, path, hasBreadcrumb: true }),
      breadcrumbSchema(
        [
          { name: 'Home', path: '/' },
          { name: 'Learning', path: '/learning' },
          { name: category, path },
        ],
        path
      ),
      itemListSchema(`${category} learning resources`, items),
    ],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Learning', path: '/learning' },
      { name: category, path: path },
    ],
  };
}

/** The page of one learning resource. */
function buildCoursePage(course: PublicCourse): PublicPage {
  const path = coursePath(course.id);
  const provider = course.provider || 'the provider';
  const description = clampDescription(
    `${course.title} — ${course.level} ${course.category} resource from ${provider}. ${
      course.description ?? ''
    }`
  );

  const facts = [
    ['Provider', provider],
    ['Category', course.category],
    ['Level', course.level],
    ['Format', course.format.replace(/_/g, ' ')],
    ['Language', course.language],
    ['Availability', course.availability.replace(/_/g, ' ')],
    ['Duration', course.durationHours ? `${course.durationHours} hours` : 'Self-paced'],
  ];

  const body = `      <section class="hero">
        <h1>${escapeHtml(course.title)}</h1>
        <p class="lede">${escapeHtml(course.description ?? `A ${course.category} resource from ${provider}.`)}</p>
        <div class="cta">
          <a class="button" href="${escapeHtml(course.url)}" rel="noopener nofollow" target="_blank">Open the resource</a>
          ${appLink('/#/learning', 'Open the Learning Hub', true)}
        </div>
      </section>

      <section>
        <h2>About this resource</h2>
        <ul class="clean">
${facts.map(([label, value]) => `          <li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`).join('\n')}
        </ul>
        ${
          course.availabilityNote
            ? `<p class="meta">${escapeHtml(course.availabilityNote)}</p>`
            : ''
        }
      </section>

      ${
        course.skills.length > 0
          ? `<section>
        <h2>Skills it develops</h2>
        ${tagRow(course.skills)}
      </section>`
          : ''
      }

      <section>
        <h2>How it fits your plan</h2>
        <p>Inside ${escapeHtml(SITE_NAME)}, resources like this one are ranked against the skills your target role expects and the gaps in your record — so the course you are pointed at is the one that closes a gap you actually have.</p>
        <div class="cta">${appLink('/#/learning', 'See your recommended learning')}</div>
      </section>`;

  return {
    path,
    title: `${course.title} — ${course.level} ${course.category} | ${SITE_NAME}`,
    description,
    body,
    jsonLd: [
      courseSchema({
        title: course.title,
        provider,
        url: course.url,
        description: course.description,
        level: course.level,
        language: course.language,
        durationHours: course.durationHours,
        format: course.format,
        skills: course.skills,
        path,
      }),
      webPageSchema({ name: course.title, description, path, hasBreadcrumb: true }),
      breadcrumbSchema(
        [
          { name: 'Home', path: '/' },
          { name: 'Learning', path: '/learning' },
          { name: course.title, path },
        ],
        path
      ),
    ],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Learning', path: '/learning' },
      { name: course.title, path: path },
    ],
  };
}

/** The index of the volunteering catalogue. */
function buildOpportunitiesIndexPage(opportunities: PublicOpportunity[]): PublicPage {
  const path = '/opportunities';
  const description = `${opportunities.length} volunteering opportunities, internships, fellowships and programmes in Egypt and worldwide — filtered to the ones you can actually act on.`;

  const cards = opportunities
    .map(
      (opportunity) => `            <div class="card"><span class="chip">${escapeHtml(
        opportunity.category || 'opportunity'
      )}</span><h3><a href="${escapeHtml(
        opportunityPath(opportunity.id)
      )}">${escapeHtml(opportunity.title)}</a></h3><p class="meta">${escapeHtml(
        opportunity.organization
      )} · ${escapeHtml(opportunity.location ?? (opportunity.isRemote ? 'Remote' : '—'))}${
        opportunity.commitment ? ` · ${escapeHtml(opportunity.commitment)}` : ''
      }</p></div>`
    )
    .join('\n');

  const body = `      <section class="hero">
        <h1>Volunteering opportunities</h1>
        <p class="lede">${escapeHtml(description)}</p>
      </section>

      <section>
        <div class="grid">
${cards}
        </div>
      </section>

      <section>
        <h2>Matched to your gap</h2>
        <p>Inside ${escapeHtml(SITE_NAME)}, opportunities are ranked against your skill gaps, your target role and the skills your roadmap asks for — with the reason for each match shown.</p>
        <div class="cta">${appLink('/#/volunteer', 'See your matched opportunities')}</div>
      </section>`;

  const items = opportunities.map((opportunity) => ({
    name: opportunity.title,
    path: opportunityPath(opportunity.id),
  }));

  return {
    path,
    title: `Volunteering Opportunities & Internships — ${opportunities.length} | ${SITE_NAME}`,
    description,
    body,
    jsonLd: [
      webPageSchema({ name: 'Volunteering Opportunities', description, path, hasBreadcrumb: true }),
      breadcrumbSchema(
        [
          { name: 'Home', path: '/' },
          { name: 'Opportunities', path },
        ],
        path
      ),
      itemListSchema('Volunteering opportunities', items),
    ],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Opportunities', path: path },
    ],
  };
}

/** The page of one volunteering opportunity. */
function buildOpportunityPage(opportunity: PublicOpportunity): PublicPage {
  const path = opportunityPath(opportunity.id);
  const description = clampDescription(
    `${opportunity.title} with ${opportunity.organization}: what the programme involves, what you gain, and how to apply.`
  );

  const facts = [
    ['Organisation', opportunity.organization],
    ['Location', opportunity.location ?? (opportunity.isRemote ? 'Remote' : '—')],
    ['Type', opportunity.category || 'Volunteering'],
    ['Commitment', opportunity.commitment ?? '—'],
    ['Country', opportunity.country ?? '—'],
  ];

  const body = `      <section class="hero">
        <h1>${escapeHtml(opportunity.title)}</h1>
        <p class="lede">${escapeHtml(
          opportunity.description ?? `A volunteering opportunity with ${opportunity.organization}.`
        )}</p>
        <div class="cta">
          ${
            opportunity.applicationUrl
              ? `<a class="button" href="${escapeHtml(
                  opportunity.applicationUrl
                )}" rel="noopener nofollow" target="_blank">Apply to this opportunity</a>`
              : ''
          }
          ${appLink('/#/volunteer', 'Open CareerDev4AI', true)}
        </div>
      </section>

      <section>
        <h2>The details</h2>
        <ul class="clean">
${facts.map(([label, value]) => `          <li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`).join('\n')}
        </ul>
      </section>

      ${
        opportunity.skillsGained.length > 0
          ? `<section>
        <h2>What you gain</h2>
        ${tagRow(opportunity.skillsGained)}
      </section>`
          : ''
      }

      <section>
        <h2>Why it is worth your time</h2>
        <p>Volunteering is the part of a career plan that produces evidence: it gives you projects to describe, skills to evidence and people to reference. Inside ${escapeHtml(
          SITE_NAME
        )}, an opportunity you take is recorded against the skills it closes, so it feeds straight back into your roadmap and your CV.</p>
        <div class="cta">${appLink('/#/volunteer', 'Find the opportunities that match you')}</div>
      </section>`;

  return {
    path,
    title: `${opportunity.title} — ${opportunity.organization} | ${SITE_NAME}`,
    description,
    body,
    jsonLd: [
      volunteerOpportunitySchema({
        title: opportunity.title,
        organization: opportunity.organization,
        description: opportunity.description,
        location: opportunity.location,
        isRemote: opportunity.isRemote,
        commitment: opportunity.commitment,
        skillsGained: opportunity.skillsGained,
        applicationUrl: opportunity.applicationUrl,
        path,
      }),
      webPageSchema({ name: opportunity.title, description, path, hasBreadcrumb: true }),
      breadcrumbSchema(
        [
          { name: 'Home', path: '/' },
          { name: 'Opportunities', path: '/opportunities' },
          { name: opportunity.title, path },
        ],
        path
      ),
    ],
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Opportunities', path: '/opportunities' },
      { name: opportunity.title, path: path },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Resolution                                                                  */
/* -------------------------------------------------------------------------- */

/** The outcome of resolving a request path against the public pages. */
export interface PublicPageResult {
  html: string;
  status: number;
  contentType: string;
}

/**
 * Resolves a request path to a public page.
 *
 * `null` means the path is not a public page, and the caller should fall
 * through to the application. A resolved page always has a unique title and a
 * unique description, because each one is built from the entry it describes.
 */
export async function resolvePublicPage(pathname: string): Promise<PublicPageResult | null> {
  const path = pathname.replace(/\/+$/, '') || '/';

  let page: PublicPage | null = null;

  if (path === '/about') {
    page = buildAboutPage();
  } else if (path === '/terms') {
    page = buildTermsPage();
  } else if (path === '/privacy') {
    page = buildPrivacyPage();
  } else if (path === '/contact') {
    page = buildContactPage();
  } else if (path === '/careers') {
    page = buildCareersIndexPage();
  } else if (path.startsWith('/careers/')) {
    const slug = decodeURIComponent(path.slice('/careers/'.length));
    const role = CAREER_ROLES.find((candidate) => candidate.id === slug);
    if (role) page = buildRolePage(role);
  } else if (path === '/learning') {
    page = buildLearningIndexPage(await loadCourses());
  } else if (path.startsWith('/learning/course/')) {
    const id = decodeURIComponent(path.slice('/learning/course/'.length));
    const courses = await loadCourses();
    const course = courses.find((candidate) => candidate.id === id);
    if (course) page = buildCoursePage(course);
  } else if (path.startsWith('/learning/category/')) {
    const slug = decodeURIComponent(path.slice('/learning/category/'.length));
    const courses = await loadCourses();
    const inCategory = courses.filter((course) => slugify(course.category) === slug);
    if (inCategory.length > 0) {
      page = buildLearningCategoryPage(inCategory[0].category, inCategory);
    }
  } else if (path === '/opportunities') {
    page = buildOpportunitiesIndexPage(await loadOpportunities());
  } else if (path.startsWith('/opportunities/')) {
    const id = decodeURIComponent(path.slice('/opportunities/'.length));
    const opportunities = await loadOpportunities();
    const opportunity = opportunities.find((candidate) => candidate.id === id);
    if (opportunity) page = buildOpportunityPage(opportunity);
  }

  if (!page) return null;

  return {
    html: renderPublicPage(page),
    status: page.path === '/terms' && !hasApprovedTerms() ? 503 : 200,
    contentType: 'text/html; charset=utf-8',
  };
}

/**
 * The home page's structured data.
 *
 * The home page itself is the single-page application, so its JSON-LD is
 * emitted by the client. The organisation and the website are the same
 * entities either way, and this keeps the two in step.
 */
export function homePageJsonLd(): Record<string, unknown>[] {
  return [organizationSchema(), websiteSchema()];
}

/**
 * The page shown when a public path does not exist.
 *
 * It answers with a 404 rather than letting the application's fallback answer
 * 200 with the home document: a crawler must be able to tell a missing page
 * from a real one, and a soft 404 would put a duplicate URL into the index.
 */
export function renderNotFoundPage(): string {
  const path = '/404';
  const description = 'The page you asked for is not here.';

  const body = `      <section class="hero">
        <h1>Page not found</h1>
        <p class="lede">The page you asked for is not here. It may have moved, or the link may be wrong.</p>
        <div class="cta">
          <a class="button" href="/">Go to the home page</a>
          <a class="button secondary" href="/careers">Browse career roles</a>
        </div>
      </section>`;

  return renderPublicPage({
    path,
    title: `Page not found | ${SITE_NAME}`,
    description,
    body,
    noindex: true,
  });
}

export { BreadcrumbEntry };
