import { normalizeSkillKey, normalizeSkillName } from './skillNormalizer.ts';

/** Canonical names for common compound or vendor-specific skill labels. */
const CANONICAL_NAME_ALIASES: Readonly<Record<string, string>> = {
  'react.js': 'react',
  'node.js': 'node.js',
  'next.js': 'next.js',
  'pandas numpy': 'python data stack',
  'pandas and numpy': 'python data stack',
  'pandas numpy scikit learn': 'python data stack',
  'amazon web services': 'aws',
  'google cloud platform': 'google cloud',
  'microsoft azure': 'azure',
};

export interface CanonicalSkill {
  /** Stable slug suitable for persistence and cross-catalogue matching. */
  id: string;
  /** Canonical display name derived from the shared alias rules. */
  name: string;
}

export function resolveCanonicalSkill(value: string | null | undefined): CanonicalSkill | null {
  const clean = normalizeSkillName(value);
  if (!clean) return null;
  const key = normalizeSkillKey(clean);
  const canonicalName = CANONICAL_NAME_ALIASES[key] ?? key;
  const id = canonicalName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!id) return null;
  return { id, name: canonicalName };
}

export function canonicalSkillId(value: string | null | undefined): string | null {
  return resolveCanonicalSkill(value)?.id ?? null;
}
