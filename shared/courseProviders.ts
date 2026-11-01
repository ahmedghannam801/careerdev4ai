/**
 * Provider identity, catalogue tier and availability vocabulary for courses.
 *
 * The catalogue is curated, but a course card still has to look like it came
 * from a real provider. Two rules drive this module:
 *
 *   - a provider is identified by name, not by a hand-maintained id, because
 *     the catalogue stores the human-readable provider string;
 *   - availability is reduced to the three buckets a learner can act on:
 *     FREE, FREE AUDIT and PAID. An edX audit is never presented as a free
 *     certificate.
 *
 * Tier 1 is the set of providers the product deliberately prioritises:
 * Harvard/CS50, MIT OpenCourseWare, edX, Stanford, Microsoft Learn, IBM
 * SkillsBuild, Google, Cisco Networking Academy, OpenLearn and Kaggle Learn.
 * Tier is a ranking signal, never an eligibility signal.
 */

export type ProviderTier = 1 | 2 | 3;

export type AvailabilityBucket = 'free' | 'free_audit' | 'paid';

export type AvailabilityValue =
  | 'free'
  | 'free_with_limitations'
  | 'audit'
  | 'free_course_paid_certificate'
  | 'paid'
  | 'youtube_free'
  | string;

export interface ProviderBrand {
  key: string;
  /** The brand name shown on the card. */
  name: string;
  /** One or two letters used when no logo can be loaded. */
  short: string;
  tier: ProviderTier;
  /** Start and end colour of the branded thumbnail. */
  colors: [string, string];
  /** Colour used for text on the branded thumbnail. */
  textColor: string;
}

interface ProviderDefinition extends ProviderBrand {
  /** Substrings matched case-insensitively against the provider name. */
  matches: string[];
}

/**
 * Ordered: the first match wins. Harvard/CS50 must precede edX because the
 * catalogue names CS50 rows "Harvard University / edX".
 */
const PROVIDERS: ProviderDefinition[] = [
  {
    key: 'harvard',
    name: 'Harvard University',
    short: 'HU',
    tier: 1,
    colors: ['#A51C30', '#6d0f1e'],
    textColor: '#ffffff',
    matches: ['harvard', 'cs50'],
  },
  {
    key: 'mit-ocw',
    name: 'MIT OpenCourseWare',
    short: 'MIT',
    tier: 1,
    colors: ['#1a1a1a', '#8a8a8a'],
    textColor: '#ffffff',
    matches: ['mit opencourseware', 'mit ocw', 'ocw.mit.edu'],
  },
  {
    key: 'edx',
    name: 'edX',
    short: 'edX',
    tier: 1,
    colors: ['#02262B', '#0b6e6e'],
    textColor: '#ffffff',
    matches: ['edx'],
  },
  {
    key: 'stanford',
    name: 'Stanford University',
    short: 'SU',
    tier: 1,
    colors: ['#8C1515', '#5a0d0d'],
    textColor: '#ffffff',
    matches: ['stanford'],
  },
  {
    key: 'microsoft-learn',
    name: 'Microsoft Learn',
    short: 'MS',
    tier: 1,
    colors: ['#0078D4', '#004e8c'],
    textColor: '#ffffff',
    matches: ['microsoft learn', 'microsoft'],
  },
  {
    key: 'ibm-skillsbuild',
    name: 'IBM SkillsBuild',
    short: 'IBM',
    tier: 1,
    colors: ['#0F62FE', '#002d9c'],
    textColor: '#ffffff',
    matches: ['ibm skillsbuild', 'skillsbuild', 'ibm'],
  },
  {
    key: 'google',
    name: 'Google',
    short: 'G',
    tier: 1,
    colors: ['#4285F4', '#1a73e8'],
    textColor: '#ffffff',
    matches: ['google'],
  },
  {
    key: 'cisco-netacad',
    name: 'Cisco Networking Academy',
    short: 'CSCO',
    tier: 1,
    colors: ['#1BA0D7', '#0b5c7d'],
    textColor: '#ffffff',
    matches: ['cisco networking academy', 'cisco netacad', 'cisco'],
  },
  {
    key: 'openlearn',
    name: 'OpenLearn',
    short: 'OL',
    tier: 1,
    colors: ['#002D5C', '#0066b3'],
    textColor: '#ffffff',
    matches: ['openlearn', 'open university'],
  },
  {
    key: 'kaggle',
    name: 'Kaggle Learn',
    short: 'K',
    tier: 1,
    colors: ['#20BEFF', '#0b6f96'],
    textColor: '#ffffff',
    matches: ['kaggle'],
  },
  {
    key: 'coursera',
    name: 'Coursera',
    short: 'C',
    tier: 2,
    colors: ['#0056D2', '#003b91'],
    textColor: '#ffffff',
    matches: ['coursera'],
  },
  {
    key: 'datacamp',
    name: 'DataCamp',
    short: 'DC',
    tier: 2,
    colors: ['#05192D', '#03EF62'],
    textColor: '#ffffff',
    matches: ['datacamp'],
  },
  {
    key: 'udacity',
    name: 'Udacity',
    short: 'U',
    tier: 2,
    colors: ['#01B3E3', '#017f9f'],
    textColor: '#ffffff',
    matches: ['udacity'],
  },
  {
    key: 'deeplearning-ai',
    name: 'DeepLearning.AI',
    short: 'DL',
    tier: 2,
    colors: ['#E4002B', '#8c001a'],
    textColor: '#ffffff',
    matches: ['deeplearning.ai', 'deeplearning ai'],
  },
  {
    key: 'aws',
    name: 'AWS Skill Builder',
    short: 'AWS',
    tier: 2,
    colors: ['#232F3E', '#FF9900'],
    textColor: '#ffffff',
    matches: ['aws', 'amazon web services'],
  },
  {
    key: 'meta',
    name: 'Meta',
    short: 'M',
    tier: 2,
    colors: ['#0866FF', '#0a3d91'],
    textColor: '#ffffff',
    matches: ['meta'],
  },
  {
    key: 'linkedin-learning',
    name: 'LinkedIn Learning',
    short: 'in',
    tier: 2,
    colors: ['#0A66C2', '#06427d'],
    textColor: '#ffffff',
    matches: ['linkedin learning', 'linkedin'],
  },
  {
    key: 'freecodecamp',
    name: 'freeCodeCamp',
    short: 'fCC',
    tier: 2,
    colors: ['#0A0A23', '#3b3b66'],
    textColor: '#ffffff',
    matches: ['freecodecamp'],
  },
  {
    key: 'codecademy',
    name: 'Codecademy',
    short: 'CC',
    tier: 2,
    colors: ['#1F4056', '#101f2b'],
    textColor: '#ffffff',
    matches: ['codecademy'],
  },
  {
    key: 'khan-academy',
    name: 'Khan Academy',
    short: 'KA',
    tier: 2,
    colors: ['#14BF96', '#0b7a60'],
    textColor: '#ffffff',
    matches: ['khan academy'],
  },
  {
    key: 'hubspot',
    name: 'HubSpot Academy',
    short: 'HS',
    tier: 2,
    colors: ['#FF7A59', '#c94b2c'],
    textColor: '#ffffff',
    matches: ['hubspot'],
  },
  {
    key: 'salesforce',
    name: 'Salesforce',
    short: 'SF',
    tier: 2,
    colors: ['#00A1E0', '#0070a0'],
    textColor: '#ffffff',
    matches: ['salesforce', 'trailhead'],
  },
  {
    key: 'adobe',
    name: 'Adobe',
    short: 'Ai',
    tier: 2,
    colors: ['#FF0000', '#8c0000'],
    textColor: '#ffffff',
    matches: ['adobe'],
  },
  {
    key: 'nngroup',
    name: 'Nielsen Norman Group',
    short: 'NN/g',
    tier: 2,
    colors: ['#1F2937', '#4b5563'],
    textColor: '#ffffff',
    matches: ['nielsen norman'],
  },
  {
    key: 'gov-uk',
    name: 'GOV.UK',
    short: 'UK',
    tier: 2,
    colors: ['#0B0C0C', '#1d70b8'],
    textColor: '#ffffff',
    matches: ['gov.uk'],
  },
  {
    key: 'semrush',
    name: 'Semrush',
    short: 'SR',
    tier: 2,
    colors: ['#FF642D', '#c23e12'],
    textColor: '#ffffff',
    matches: ['semrush'],
  },
  {
    key: 'moz',
    name: 'Moz',
    short: 'Moz',
    tier: 2,
    colors: ['#2C5F8A', '#183c59'],
    textColor: '#ffffff',
    matches: ['moz'],
  },
  {
    key: 'cisco',
    name: 'Cisco',
    short: 'CSCO',
    tier: 2,
    colors: ['#1BA0D7', '#0b5c7d'],
    textColor: '#ffffff',
    matches: ['cisco'],
  },
];

const FALLBACK_COLORS: Array<[string, string]> = [
  ['#4F46E5', '#312E81'],
  ['#0F766E', '#134E4A'],
  ['#B45309', '#78350F'],
  ['#7C3AED', '#4C1D95'],
  ['#0369A1', '#0C4A6E'],
  ['#BE123C', '#881337'],
];

function hash(text: string): number {
  let value = 0;
  for (let index = 0; index < text.length; index += 1) {
    value = (value * 31 + text.charCodeAt(index)) >>> 0;
  }
  return value;
}

function initials(provider: string): string {
  const words = provider
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.trim())
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

/** Returns the branded identity for a provider name. */
export function providerBrand(provider: string): ProviderBrand {
  const value = (provider ?? '').trim();
  const lower = value.toLowerCase();
  for (const definition of PROVIDERS) {
    if (definition.matches.some((match) => lower.includes(match))) {
      return {
        key: definition.key,
        name: definition.name,
        short: definition.short,
        tier: definition.tier,
        colors: definition.colors,
        textColor: definition.textColor,
      };
    }
  }
  const colors = FALLBACK_COLORS[hash(lower) % FALLBACK_COLORS.length];
  return {
    key: `provider-${hash(lower).toString(36)}`,
    name: value || 'Learning provider',
    short: initials(value),
    tier: 3,
    colors,
    textColor: '#ffffff',
  };
}

/** 1 for the prioritised providers, 2 for other reputable sources, 3 otherwise. */
export function providerTier(provider: string): ProviderTier {
  return providerBrand(provider).tier;
}

/** Collapses the database vocabulary into the three learner-facing buckets. */
export function availabilityBucket(availability: AvailabilityValue): AvailabilityBucket {
  switch (availability) {
    case 'paid':
      return 'paid';
    case 'audit':
    case 'free_with_limitations':
      return 'free_audit';
    case 'free':
    case 'free_course_paid_certificate':
    case 'youtube_free':
    default:
      return 'free';
  }
}

/** The badge text. Deliberately English and uppercase in every locale. */
export function availabilityLabel(availability: AvailabilityValue): string {
  const bucket = availabilityBucket(availability);
  if (bucket === 'paid') return 'PAID';
  if (bucket === 'free_audit') return 'FREE AUDIT';
  return 'FREE';
}

/**
 * A plain-language explanation of what the badge means. It is used as the
 * card's title attribute so "FREE AUDIT" is never mistaken for a free
 * certificate.
 */
export function availabilityDescription(availability: AvailabilityValue): string {
  const bucket = availabilityBucket(availability);
  if (bucket === 'paid') return 'This resource requires payment.';
  if (bucket === 'free_audit') {
    return 'You can access the learning material for free by auditing it. A certificate is not included unless the provider says otherwise.';
  }
  if (availability === 'free_course_paid_certificate') {
    return 'The course itself is free. A certificate may cost extra.';
  }
  return 'This resource is free to access.';
}

/** Sort helper: Tier 1 first, then 2, then 3. */
export function compareProviderTier(left: string, right: string): number {
  return providerTier(left) - providerTier(right);
}
