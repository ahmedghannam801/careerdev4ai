/**
 * The document metadata of the single-page application.
 *
 * The application is served from one URL and routes by hash, so the document
 * it returns is the same for every view. Two things follow from that, and
 * this module handles both.
 *
 * The canonical URL of the application is the home page. A hash is not part of
 * a URL as far as a crawler is concerned, so `/#/dashboard` and `/#/learning`
 * are the same document at the same address, and the canonical link says so
 * rather than pretending there is a page for each of them. The views that
 * deserve their own address — the career catalogue, the learning catalogue,
 * the volunteering catalogue — are server-rendered pages with their own
 * canonical links, published by the worker.
 *
 * The robots directive follows what is on screen. The landing page is public
 * and may be indexed. Every other view belongs to a signed-in user: it is
 * behind authentication, it holds nobody else's data, and it must not be
 * indexed. The directive is set to `noindex, nofollow` there, so a view that
 * is somehow reached without a session does not enter an index.
 *
 * The page title and description are per view, so the browser tab, a shared
 * link and a bookmark are all distinguishable.
 */

const SITE_ORIGIN = 'https://careerdev4ai.pages.dev';

/**
 * The canonical address of the home page.
 *
 * The trailing slash is the form the canonical link, `og:url` and the
 * `WebSite` schema all carry, so the site is never described under two
 * different addresses.
 */
const SITE_URL = `${SITE_ORIGIN}/`;

/** The name of the product, used in the document metadata. */
const SITE_NAME = 'CareerDev4AI';

/**
 * The other written forms of the same name.
 *
 * These are spellings of this product, not other products, and they are the
 * ones a search engine needs in order to show the site under the name a
 * person actually typed.
 */
const SITE_ALTERNATE_NAMES = [
  'CareerDev4AI',
  'Career Dev 4AI',
  'CareerDev4AI Career Platform',
];

/** The image used for link previews. */
const OG_IMAGE = `${SITE_ORIGIN}/brand/og-image-1200x630.png`;

/** The metadata of one view. */
export interface RouteMeta {
  /** The document title. */
  title: string;
  /** The meta description. */
  description: string;
  /** The canonical URL. */
  canonical: string;
  /** The robots directive. */
  robots: string;
  /** The JSON-LD blocks to publish. */
  jsonLd?: unknown[];
}

/**
 * The metadata of every view the application can show.
 *
 * Each entry has its own title and description: two views must never share
 * either, or a search engine sees them as the same page.
 */
const VIEW_META: Record<string, { title: string; description: string }> = {
  landing: {
    title: `CareerDev4AI — Turn Your Ambition Into a Career Plan`,
    description:
      'CareerDev4AI is an AI-powered career operating system for students and young professionals: goals, skills, roadmaps, CVs, job applications, interview practice and volunteering opportunities in one bilingual workspace.',
  },
  onboarding: {
    title: `Set up your career plan | ${SITE_NAME}`,
    description:
      'Tell CareerDev4AI the role you are aiming at, the experience you have and the time you have, and build a career plan around it.',
  },
  dashboard: {
    title: `Dashboard | ${SITE_NAME}`,
    description:
      'Your CareerDev4AI dashboard: where your plan stands, what is next, and how your skills, roadmap and applications are progressing.',
  },
  'my-career': {
    title: `My career | ${SITE_NAME}`,
    description:
      'Your career record in one place: the role you are targeting, the domain you work in, and the progress you have made so far.',
  },
  roles: {
    title: `Choose your career | ${SITE_NAME}`,
    description:
      'Pick the career role you are aiming at from the CareerDev4AI catalogue, and make every later step answer to it.',
  },
  analysis: {
    title: `Career analysis | ${SITE_NAME}`,
    description:
      'An analysis of your record against the role you are targeting: what you have, what is missing, and what is worth closing first.',
  },
  plan: {
    title: `Your career plan | ${SITE_NAME}`,
    description:
      'The plan for your career: the phases, the milestones and the work that take you from where you are to where you want to be.',
  },
  roadmap: {
    title: `Your roadmap | ${SITE_NAME}`,
    description:
      'Your skill roadmap: the phases, the tasks and the milestones that build the capabilities your target role expects.',
  },
  skills: {
    title: `Skills centre | ${SITE_NAME}`,
    description:
      'Track your skills, see the level you have reached in each of them, and find the gap between that and the role you are targeting.',
  },
  learning: {
    title: `Learning hub | ${SITE_NAME}`,
    description:
      'Learning resources matched to the gaps in your record: courses, video playlists, tutorials and documentation that close a gap you actually have.',
  },
  projects: {
    title: `Your projects | ${SITE_NAME}`,
    description:
      'The projects you are building for your portfolio, and the skills each of them is meant to prove.',
  },
  volunteer: {
    title: `Volunteering opportunities | ${SITE_NAME}`,
    description:
      'Volunteering opportunities, internships, fellowships and programmes, ranked against the skill gaps in your own record.',
  },
  evidence: {
    title: `Evidence | ${SITE_NAME}`,
    description:
      'Collect the evidence that proves your capability: repositories, demos, certificates, projects and assessments.',
  },
  'cv-studio': {
    title: `CV studio | ${SITE_NAME}`,
    description:
      'Build, tailor and check your CV against a real job description, with ATS analysis, suggestions and version history.',
  },
  documents: {
    title: `Documents | ${SITE_NAME}`,
    description:
      'Your CVs, cover letters, certificates and portfolio documents, with the versions you have kept.',
  },
  jobs: {
    title: `Jobs and training | ${SITE_NAME}`,
    description:
      'Track the roles you are aiming at and the training that prepares you for them.',
  },
  applications: {
    title: `Applications | ${SITE_NAME}`,
    description:
      'Every job application you have sent, the stage it has reached and what happens next.',
  },
  interviews: {
    title: `Interview practice | ${SITE_NAME}`,
    description:
      'Practise with a structured interview plan built from the role you are targeting.',
  },
  profile: {
    title: `Profile | ${SITE_NAME}`,
    description:
      'Your CareerDev4AI profile: your experience, your education, your skills and the work you have done.',
  },
  activity: {
    title: `Activity | ${SITE_NAME}`,
    description:
      'Everything you have done across your roadmap, your applications, your interviews and your documents.',
  },
  progress: {
    title: `Progress | ${SITE_NAME}`,
    description:
      'How far you have come: the skills you have gained, the milestones you have reached and the work still ahead.',
  },
  settings: {
    title: `Settings | ${SITE_NAME}`,
    description:
      'Your account, security, privacy, notifications, interface and language settings.',
  },
  admin: {
    title: `Administration | ${SITE_NAME}`,
    description:
      'The CareerDev4AI administration centre: users, catalogue, communications and analytics.',
  },
  referrals: {
    title: `Referrals | ${SITE_NAME}`,
    description:
      'Your personal invitation link, the people who joined through it, and the credits your referrals have earned.',
  },
};

/** The metadata of a public profile share link. */
const PUBLIC_PROFILE_META = {
  title: `Career profile | ${SITE_NAME}`,
  description:
    'A public CareerDev4AI profile: the experience, education, skills and projects behind the career.',
};

/**
 * The metadata for a view.
 *
 * A view that belongs to a signed-in user is marked `noindex, nofollow`: it
 * is private, and it must never enter a search index.
 */
export function routeMetaFor(
  view: string,
  options: { isPublicProfile?: boolean } = {}
): RouteMeta {
  const isPublicProfile = options.isPublicProfile === true;
  const entry = isPublicProfile ? PUBLIC_PROFILE_META : VIEW_META[view];

  const title = entry?.title ?? `${SITE_NAME}`;
  const description =
    entry?.description ??
    'CareerDev4AI is an AI-powered career operating system: goals, skills, roadmaps, CVs, job applications and interview practice in one workspace.';

  // The public landing page and a public profile may be indexed. Everything
  // else is behind authentication.
  const isPublic = view === 'landing' || isPublicProfile;

  return {
    title,
    description,
    canonical: SITE_URL,
    robots: isPublic ? 'index, follow, max-image-preview:large' : 'noindex, nofollow',
    jsonLd: isPublic ? buildPublicJsonLd(view, title, description) : undefined,
  };
}

/** The structured data of the public views of the application. */
function buildPublicJsonLd(view: string, title: string, description: string): unknown[] {
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    alternateName: SITE_ALTERNATE_NAMES,
    url: SITE_URL,
    logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/brand/icon-512.png` },
    image: `${SITE_ORIGIN}/brand/og-image-1200x630.png`,
    description,
  };

  if (view !== 'landing') {
    return [organization];
  }

  return [
    organization,
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      alternateName: SITE_ALTERNATE_NAMES,
      url: SITE_URL,
      inLanguage: 'en',
      publisher: {
        '@type': 'Organization',
        name: SITE_NAME,
        alternateName: SITE_ALTERNATE_NAMES,
        url: SITE_URL,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description,
      url: SITE_URL,
      isPartOf: {
        '@type': 'WebSite',
        name: SITE_NAME,
        alternateName: SITE_ALTERNATE_NAMES,
        url: SITE_URL,
      },
      inLanguage: 'en',
    },
  ];
}

/**
 * Writes a meta tag, replacing the one that is already there.
 *
 * The tag is found by its `name` or `property` attribute, so the document
 * never ends up with two descriptions or two Open Graph titles.
 */
function setMeta(selector: string, attribute: 'name' | 'property', key: string, content: string): void {
  let tag = document.head.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

/** Writes the canonical link. */
function setCanonical(href: string): void {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

/**
 * Applies a view's metadata to the document.
 *
 * The function is safe to call on every route change: it replaces what it
 * owns and leaves everything else alone.
 */
export function applyRouteMeta(meta: RouteMeta): void {
  if (typeof document === 'undefined') return;

  document.title = meta.title;

  setMeta('meta[name="description"]', 'name', 'description', meta.description);
  setMeta('meta[name="robots"]', 'name', 'robots', meta.robots);

  setMeta('meta[property="og:title"]', 'property', 'og:title', meta.title);
  setMeta('meta[property="og:description"]', 'property', 'og:description', meta.description);
  setMeta('meta[property="og:url"]', 'property', 'og:url', meta.canonical);
  setMeta('meta[property="og:type"]', 'property', 'og:type', 'website');
  setMeta('meta[property="og:image"]', 'property', 'og:image', OG_IMAGE);
  setMeta('meta[property="og:image:width"]', 'property', 'og:image:width', '1200');
  setMeta('meta[property="og:image:height"]', 'property', 'og:image:height', '630');
  setMeta('meta[property="og:site_name"]', 'property', 'og:site_name', SITE_NAME);

  setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', meta.title);
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', meta.description);
  setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', OG_IMAGE);

  setCanonical(meta.canonical);

  // The structured data of the document is replaced wholesale, so a block from
  // a previous view cannot survive into the next one.
  document.head
    .querySelectorAll('script[data-app-jsonld]')
    .forEach((node) => node.remove());

  for (const block of meta.jsonLd ?? []) {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.appJsonld = 'true';
    script.textContent = JSON.stringify(block).replace(/</g, '\\u003c');
    document.head.appendChild(script);
  }
}
