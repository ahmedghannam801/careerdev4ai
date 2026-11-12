/**
 * The structured data (JSON-LD) the public pages publish.
 *
 * The rule this module enforces is simple: a schema is only emitted for
 * content the page actually shows, and only with properties that genuinely
 * exist in schema.org. A page that lists roles does not claim to be a course;
 * a page that shows a course does not invent an author, a rating or an
 * aggregate score; a volunteering opportunity is described as an `Event`,
 * because `VolunteerOpportunity` was proposed but never accepted into
 * schema.org and would be invalid markup.
 *
 * The schemas used are:
 *
 *   - `Organization` and `WebSite` — the product itself;
 *   - `WebPage` — every page;
 *   - `BreadcrumbList` — every page below the root;
 *   - `ItemList` — the catalogue index pages;
 *   - `Course` — a learning resource page;
 *   - `Event` — an opportunity page.
 */

import {
  SITE_ALTERNATE_NAMES,
  SITE_NAME,
  SITE_TAGLINE,
  absoluteUrl,
  ogImageUrl,
  siteUrl,
} from './config.ts';

/** The organisation behind the product. */
export function organizationSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    alternateName: [...SITE_ALTERNATE_NAMES],
    url: siteUrl(),
    logo: {
      '@type': 'ImageObject',
      url: ogImageUrl(),
      width: 1200,
      height: 630,
    },
    image: ogImageUrl(),
    description:
      'CareerDev4AI is an AI-powered career development platform for students and young professionals: goals, skills, roadmaps, CVs, job applications and interview practice in one workspace.',
  };
}

/**
 * The site itself.
 *
 * This is the schema that decides the name a search engine shows for the
 * site, so its `name` is the brand and its `url` is the canonical home page
 * address — the same address the canonical link and `og:url` carry. The
 * `alternateName` covers the other written forms of the same name.
 */
export function websiteSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    alternateName: [...SITE_ALTERNATE_NAMES],
    url: siteUrl(),
    description: SITE_TAGLINE,
    inLanguage: 'en',
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      alternateName: [...SITE_ALTERNATE_NAMES],
      url: siteUrl(),
      logo: {
        '@type': 'ImageObject',
        url: ogImageUrl(),
      },
    },
  };
}

/** One entry of a breadcrumb trail. */
export interface BreadcrumbEntry {
  name: string;
  path: string;
}

/** The stable identifier of a page's breadcrumb list. */
export function breadcrumbId(path: string): string {
  return `${absoluteUrl(path)}#breadcrumb`;
}

/**
 * The breadcrumb trail of a page.
 *
 * The list carries an `@id` so the `WebPage` can point at it, which is the
 * pattern search engines expect when both are present.
 */
export function breadcrumbSchema(entries: BreadcrumbEntry[], path: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': breadcrumbId(path),
    itemListElement: entries.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: absoluteUrl(entry.path),
    })),
  };
}

/**
 * The Contact Us page.
 *
 * The schema describes the business behind the page, and it describes it only
 * as far as the business has actually published itself. A property that has
 * not been supplied is left out of the markup entirely: a `PostalAddress`
 * without a street, or a `telephone` that is a placeholder, would be a
 * structured-data assertion the page does not make.
 */
export function contactPageSchema(input: {
  name: string;
  description: string;
  path: string;
  business: {
    name: string;
    url?: string;
    email?: string | null;
    telephone?: string | null;
    address?: {
      streetAddress?: string | null;
      addressLocality?: string | null;
      addressRegion?: string | null;
      postalCode?: string | null;
      addressCountry?: string | null;
    } | null;
  };
}): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: input.name,
    description: input.description,
    url: absoluteUrl(input.path),
    inLanguage: 'en',
  };

  const business: Record<string, unknown> = {
    '@type': 'Organization',
    name: input.business.name,
  };

  if (input.business.url) business.url = input.business.url;
  if (input.business.email) business.email = input.business.email;
  if (input.business.telephone) business.telephone = input.business.telephone;

  const address = input.business.address;
  if (address) {
    const postal: Record<string, unknown> = { '@type': 'PostalAddress' };
    if (address.streetAddress) postal.streetAddress = address.streetAddress;
    if (address.addressLocality) postal.addressLocality = address.addressLocality;
    if (address.addressRegion) postal.addressRegion = address.addressRegion;
    if (address.postalCode) postal.postalCode = address.postalCode;
    if (address.addressCountry) postal.addressCountry = address.addressCountry;
    // A postal address with nothing in it is not an address. It is only
    // published once at least the street and the locality are known.
    if (Object.keys(postal).length > 2) business.address = postal;
  }

  schema.mainEntity = business;

  return schema;
}

/** A page of the site. */
export function webPageSchema(input: {
  name: string;
  description: string;
  path: string;
  hasBreadcrumb?: boolean;
}): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: input.name,
    description: input.description,
    url: absoluteUrl(input.path),
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      alternateName: [...SITE_ALTERNATE_NAMES],
      url: siteUrl(),
    },
    inLanguage: 'en',
  };
  if (input.hasBreadcrumb) {
    schema.breadcrumb = { '@id': breadcrumbId(input.path) };
  }
  return schema;
}

/** One item of a catalogue listing. */
export interface ItemListEntry {
  name: string;
  path: string;
}

/** A list of catalogue entries. */
export function itemListSchema(name: string, entries: ItemListEntry[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: entries.length,
    itemListElement: entries.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      url: absoluteUrl(entry.path),
    })),
  };
}

/**
 * A learning resource.
 *
 * Only facts the catalogue actually holds are described: the title, the
 * provider, the external URL, the level, the language, the duration and the
 * format. A rating, a review count or an author is not asserted, because the
 * catalogue does not record one.
 */
export function courseSchema(course: {
  title: string;
  provider: string;
  url: string;
  description?: string | null;
  level?: string | null;
  language?: string | null;
  durationHours?: number | null;
  format?: string | null;
  skills?: string[];
  path: string;
}): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: course.title,
    url: absoluteUrl(course.path),
    inLanguage: (course.language ?? 'English').toLowerCase(),
    // The catalogue records the organisation that publishes the course and
    // the site it lives on. Both are stated; nothing else is inferred.
    provider: {
      '@type': 'Organization',
      name: course.provider,
    },
  };

  if (course.description) schema.description = course.description;
  if (course.url) schema.sameAs = course.url;
  if (course.level) schema.educationalLevel = course.level;

  schema.hasCourseInstance = {
    '@type': 'CourseInstance',
    // Every catalogue entry is taken on the web, at the URL the catalogue
    // records. That is the only delivery mode the data supports.
    courseMode: 'online',
  };

  if (typeof course.durationHours === 'number' && course.durationHours > 0) {
    schema.timeRequired = `PT${Math.round(course.durationHours)}H`;
  }

  if (course.skills && course.skills.length > 0) {
    schema.about = course.skills.map((skill) => ({
      '@type': 'Thing',
      name: skill,
    }));
  }

  return schema;
}

/**
 * A volunteering opportunity, described as an `Event`.
 *
 * The catalogue records the organisation, the location, the commitment, the
 * skills gained and the application link. Those are stated. The participation
 * itself is free, which is what `isAccessibleForFree` records.
 */
export function volunteerOpportunitySchema(opportunity: {
  title: string;
  organization: string;
  description?: string | null;
  location?: string | null;
  isRemote?: boolean | null;
  commitment?: string | null;
  skillsGained?: string[];
  applicationUrl?: string | null;
  path: string;
}): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: opportunity.title,
    url: absoluteUrl(opportunity.path),
    eventStatus: 'https://schema.org/EventScheduled',
    isAccessibleForFree: true,
  };

  if (opportunity.description) schema.description = opportunity.description;

  if (opportunity.organization) {
    schema.organizer = {
      '@type': 'Organization',
      name: opportunity.organization,
    };
  }

  const location = opportunity.location?.trim();
  if (opportunity.isRemote) {
    schema.eventAttendanceMode = 'https://schema.org/OnlineEventAttendanceMode';
    schema.location = {
      '@type': 'VirtualLocation',
      url: absoluteUrl(opportunity.path),
    };
  } else if (location) {
    schema.eventAttendanceMode = 'https://schema.org/OfflineEventAttendanceMode';
    schema.location = {
      '@type': 'Place',
      address: location,
    };
  }

  if (opportunity.skillsGained && opportunity.skillsGained.length > 0) {
    schema.keywords = opportunity.skillsGained.join(', ');
    schema.about = opportunity.skillsGained.map((skill) => ({
      '@type': 'Thing',
      name: skill,
    }));
  }

  if (opportunity.applicationUrl) {
    schema.sameAs = opportunity.applicationUrl;
    schema.offers = {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      url: opportunity.applicationUrl,
    };
  }

  return schema;
}
