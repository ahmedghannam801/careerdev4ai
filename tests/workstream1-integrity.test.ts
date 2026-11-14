/**
 * Workstream 1 — data integrity.
 *
 * These tests protect the promises the product makes about the candidate's own
 * data, without needing a database or a model:
 *
 *   * one record is counted once — experience, education, summary, skills,
 *     projects and certifications are deduplicated by a stable identity, not by
 *     whichever copy arrived last;
 *   * "Fill from my records" is idempotent, so pressing it five times is the
 *     same as pressing it once;
 *   * a skill says where it came from (evidence, assessment, claim, or model
 *     estimate), and a stronger source wins;
 *   * a future expected graduation year always means "currently studying";
 *   * the Recent Activity feed logs an action exactly once;
 *   * the AI chat is free and unlimited, while the four paid actions keep their
 *     prices.
 *
 * Everything here is pure. The token/route checks read the source rather than
 * calling the model, and the integrity checks run the same shared functions the
 * client and the server run.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

import { mergeCanonicalCvDocument } from '../shared/cvProjection.ts';
import type { CvSourceData } from '../shared/cvDocument.ts';
import type { CVProfile } from '../src/types/career.ts';
import {
  certificationDedupeKey,
  dedupeCertifications,
  dedupeEducation,
  dedupeExperience,
  dedupeProjects,
  sameCertification,
  sameProject,
} from '../shared/cvDedupe.ts';
import { dedupeSummaryParagraphs } from '../shared/cvCanonical.ts';
import {
  SKILL_SOURCES,
  dedupeSkillRecords,
  isSkillSectionHeader,
  normalizeSkillName,
  resolveSkillSource,
  skillDedupeKey,
} from '../shared/skillNormalizer.ts';
import { resolveEducationStatus } from '../shared/careerIdentity.ts';
import {
  activityIdempotencySeed,
  deterministicActivityId,
} from '../server/db/activities.ts';
import { CREDIT_WEIGHTS, DAILY_CREDIT_ALLOWANCE } from '../shared/credits.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const APP_TS = join(REPO_ROOT, 'app.ts');

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function source(overrides: Partial<CvSourceData> = {}): CvSourceData {
  return {
    profile: {
      fullName: 'Sam Lee',
      email: 'sam@example.com',
      phone: '',
      location: 'Cairo',
      title: 'Data Analyst',
      summary: '',
    },
    experiences: [],
    education: [],
    projects: [],
    volunteering: [],
    certifications: [],
    courses: [],
    skills: [],
    links: [],
    ...overrides,
  };
}

/** Recursively lists files below a directory, skipping build output. */
function walk(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* 1. One record, counted once                                                */
/* -------------------------------------------------------------------------- */

describe('Workstream 1 — the same record is never counted twice', () => {
  it('collapses duplicate experience by title, organisation and dates', () => {
    const merged = dedupeExperience([
      {
        title: 'Data Analyst',
        organization: 'Acme',
        startDate: '2022-01-01',
        location: 'Cairo',
        description: 'Owned reporting end to end.',
        bullets: ['Built the monthly reporting pack.'],
      },
      {
        title: 'data analyst',
        organization: 'ACME',
        startDate: '2022-01-01',
        employmentType: 'Full-time',
        location: 'Remote',
        bullets: ['Automated the variance analysis.'],
      },
    ]);

    assert.equal(merged.length, 1, 'the same job must be one entry');
    assert.equal(merged[0].location, 'Cairo', 'the first location is kept');
    assert.equal(merged[0].employmentType, 'Full-time', 'the missing type is filled');
    assert.deepEqual(
      merged[0].bullets,
      ['Built the monthly reporting pack.', 'Automated the variance analysis.'],
      'bullets from both copies survive'
    );
  });

  it('keeps two stints at the same organisation apart', () => {
    const merged = dedupeExperience([
      { title: 'Engineer', organization: 'Acme', startDate: '2019-01-01', endDate: '2020-12-31' },
      { title: 'Engineer', organization: 'Acme', startDate: '2022-01-01', endDate: '2023-12-31' },
    ]);
    assert.equal(merged.length, 2, 'the same title at two different periods is two jobs');
  });

  it('collapses duplicate education by degree and institution', () => {
    const merged = dedupeEducation([
      { institution: 'Cairo University', degree: 'BSc Computer Science' },
      { institution: 'cairo university', degree: 'bsc computer science', field: 'Computer Science' },
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].field, 'Computer Science', 'the missing field is filled');
  });

  it('collapses projects by title and URL, not by title alone', () => {
    const sameRepository = dedupeProjects([
      { title: 'Portfolio', link: 'https://github.com/sam/portfolio' },
      { title: 'portfolio', link: 'https://github.com/sam/portfolio' },
    ]);
    assert.equal(sameRepository.length, 1);

    const twoRepositories = dedupeProjects([
      { title: 'Portfolio', link: 'https://github.com/sam/portfolio' },
      { title: 'Portfolio', link: 'https://github.com/sam/portfolio-v2' },
    ]);
    assert.equal(twoRepositories.length, 2, 'different repositories are different projects');
    assert.equal(sameProject(twoRepositories[0], twoRepositories[1]), false);
  });

  it('collapses certifications by name, issuer and credential URL', () => {
    const sameCredential = dedupeCertifications([
      { name: 'Data Fundamentals', issuer: 'IBM', credentialUrl: 'https://ibm.example/cred/1' },
      { name: 'data fundamentals', issuer: 'ibm', credentialUrl: 'https://ibm.example/cred/1' },
    ]);
    assert.equal(sameCredential.length, 1);

    const twoIssuers = dedupeCertifications([
      { name: 'Data Fundamentals', issuer: 'IBM' },
      { name: 'Data Fundamentals', issuer: 'Google' },
    ]);
    assert.equal(twoIssuers.length, 2, 'two vendors issue two credentials');
    assert.notEqual(
      certificationDedupeKey(twoIssuers[0]),
      certificationDedupeKey(twoIssuers[1])
    );
    assert.equal(sameCertification(twoIssuers[0], twoIssuers[1]), false);
  });

  it('folds a repeated summary paragraph away', () => {
    const summary = dedupeSummaryParagraphs(
      'Data analyst with five years in reporting.\n\nData analyst with five years in reporting.\n\nI build dashboards people use.'
    );
    const occurrences = summary.match(/five years in reporting/g) ?? [];
    assert.equal(occurrences.length, 1, 'the repeated paragraph appears once');
  });

  it('drops a skill-section heading and folds aliases into one skill', () => {
    assert.equal(isSkillSectionHeader('TECHNICAL SKILLS'), true);
    assert.equal(normalizeSkillName('TECHNICAL SKILLS'), '');
    assert.equal(normalizeSkillName('  React  '), 'React');
    assert.equal(skillDedupeKey('JS'), skillDedupeKey('JavaScript'));

    const merged = dedupeSkillRecords([
      { name: 'JavaScript', category: 'technical' },
      { name: 'JS', category: 'technical' },
      { name: 'TECHNICAL SKILLS' },
    ]);
    assert.equal(merged.length, 1, 'the heading is not a skill and the alias is the same skill');
  });
});

/* -------------------------------------------------------------------------- */
/* 2. "Fill from my records" is idempotent                                    */
/* -------------------------------------------------------------------------- */

describe('Workstream 1 — pressing "Fill from my records" five times', () => {
  const input = source({
    profile: {
      fullName: 'Sam Lee',
      email: 'sam@example.com',
      phone: '',
      location: 'Cairo',
      title: 'Data Analyst',
      summary:
        'Data analyst with five years in reporting.\n\nData analyst with five years in reporting.',
    },
    experiences: [
      {
        id: UUID_A,
        role: 'Data Analyst',
        company: 'Acme',
        startDate: '2022-01-01',
        endDate: '2024-01-01',
        location: 'Cairo',
        bullets: ['Built the monthly reporting pack.'],
      },
      {
        id: UUID_B,
        role: 'data analyst',
        company: 'acme',
        startDate: '2022-01-01',
        endDate: '2024-01-01',
        location: 'Remote',
        bullets: ['Automated the variance analysis.'],
      },
    ],
    education: [
      {
        id: UUID_A,
        institution: 'Cairo University',
        degree: 'BSc Computer Science',
        field: 'Computer Science',
        startDate: '2016-09-01',
        endDate: '2020-06-30',
      },
      {
        id: UUID_B,
        institution: 'Cairo University',
        degree: 'BSc Computer Science',
        field: 'Computer Science',
        startDate: '2016-09-01',
        endDate: '2020-06-30',
      },
    ],
    projects: [
      {
        id: UUID_A,
        title: 'Reporting Suite',
        link: 'https://github.com/sam/reporting',
        technologies: ['SQL'],
      },
      {
        id: UUID_B,
        title: 'reporting suite',
        link: 'https://github.com/sam/reporting',
        technologies: ['Tableau'],
      },
    ],
    certifications: [
      {
        id: UUID_A,
        name: 'Data Fundamentals',
        issuer: 'IBM',
        credentialUrl: 'https://ibm.example/cred/1',
      },
      {
        id: UUID_B,
        name: 'Data Fundamentals',
        issuer: 'IBM',
        credentialUrl: 'https://ibm.example/cred/1',
      },
    ],
    skills: [
      { name: 'SQL', level: 4 },
      { name: 'sql', level: 4 },
      { name: 'TECHNICAL SKILLS', level: 3 },
    ],
  });

  it('produces exactly one copy of every record', () => {
    let document: CVProfile | null = null;
    for (let press = 0; press < 5; press += 1) {
      document = mergeCanonicalCvDocument(input, {
        ...(document ?? ({} as CVProfile)),
        hiddenSkills: [],
      });
    }

    assert.ok(document);
    assert.equal(document!.experiences.length, 1, 'one experience entry');
    assert.equal(document!.experiences[0].bullets?.length, 2, 'both bullets are kept');
    assert.equal(document!.education.length, 1, 'one education entry');
    assert.equal(document!.projects.length, 1, 'one project entry');
    assert.equal(document!.projects[0].technologies?.length, 2, 'both technologies are kept');
    assert.equal(document!.certificationDetails?.length, 1, 'one certification entry');
    assert.equal(document!.skillsList.length, 1, 'one skill entry');
  });

  it('is stable: press four and press five are byte-identical', () => {
    let document: CVProfile = mergeCanonicalCvDocument(input, null);
    document = mergeCanonicalCvDocument(input, { ...document, hiddenSkills: [] });
    const fourth = mergeCanonicalCvDocument(input, { ...document, hiddenSkills: [] });
    const fifth = mergeCanonicalCvDocument(input, { ...fourth, hiddenSkills: [] });
    assert.deepEqual(fifth, fourth, 'a sixth press cannot add anything');
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Skill source                                                            */
/* -------------------------------------------------------------------------- */

describe('Workstream 1 — a skill knows where it came from', () => {
  it('uses the strongest signal available', () => {
    assert.equal(resolveSkillSource({}), 'ai_estimated');
    assert.equal(resolveSkillSource({ selfReportedLevel: 3 }), 'self_reported');
    assert.equal(
      resolveSkillSource({ selfReportedLevel: 3, assessedLevel: 4 }),
      'assessment'
    );
    assert.equal(
      resolveSkillSource({
        selfReportedLevel: 3,
        assessedLevel: 4,
        evidenceSources: ['verified_project'],
      }),
      'verified_evidence'
    );
  });

  it('only uses the four documented sources', () => {
    assert.deepEqual([...SKILL_SOURCES].sort(), [
      'ai_estimated',
      'assessment',
      'self_reported',
      'verified_evidence',
    ]);
  });

  it('merges two records for one skill without losing a signal', () => {
    const merged = dedupeSkillRecords([
      {
        name: 'SQL',
        category: 'analytical',
        selfReportedLevel: 3,
        evidenceSources: ['self_reported'],
      },
      {
        name: 'sql',
        category: 'technical',
        assessedLevel: 4,
        assessmentScore: 82,
        assessmentAt: '2026-01-01T00:00:00.000Z',
        evidenceSources: ['diagnostic_assessment'],
      },
    ]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].selfReportedLevel, 3);
    assert.equal(merged[0].assessedLevel, 4);
    assert.equal(merged[0].source, 'assessment');
    assert.deepEqual(merged[0].evidenceSources?.sort(), [
      'diagnostic_assessment',
      'self_reported',
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. Education status                                                        */
/* -------------------------------------------------------------------------- */

describe('Workstream 1 — a future graduation year means "currently studying"', () => {
  it('forces the status even when the record says graduated', () => {
    const result = resolveEducationStatus({
      education: [{ endDate: '2028-06-01', current: false }],
      expectedGraduationYear: 2028,
      educationStatusOverride: 'graduated',
      currentYear: 2026,
    });
    assert.equal(result.status, 'currently_studying');
    assert.equal(result.expectedGraduationYear, 2028);
  });

  it('respects a graduation in the past', () => {
    const result = resolveEducationStatus({
      education: [{ endDate: '2020-06-01' }],
      expectedGraduationYear: 2020,
      currentYear: 2026,
    });
    assert.equal(result.status, 'graduated');
  });
});

/* -------------------------------------------------------------------------- */
/* 5. Activity idempotency                                                    */
/* -------------------------------------------------------------------------- */

describe('Workstream 1 — Recent Activity logs an action once', () => {
  const profileId = UUID_A;
  const action = {
    actionType: 'applied_job' as const,
    title: 'Applied to Data Analyst at Acme',
    relatedObject: UUID_B,
  };

  it('derives the same id for the same action', () => {
    const first = activityIdempotencySeed(profileId, action);
    const second = activityIdempotencySeed(profileId, { ...action });
    assert.equal(first, second);
    assert.equal(deterministicActivityId(first), deterministicActivityId(second));
  });

  it('derives a different id for a different related object or user', () => {
    const base = activityIdempotencySeed(profileId, action);
    assert.notEqual(
      deterministicActivityId(base),
      deterministicActivityId(
        activityIdempotencySeed(profileId, { ...action, relatedObject: UUID_C })
      )
    );
    assert.notEqual(
      deterministicActivityId(base),
      deterministicActivityId(activityIdempotencySeed(UUID_C, action))
    );
  });

  it('produces a syntactically valid UUID', () => {
    const id = deterministicActivityId(activityIdempotencySeed(profileId, action));
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      `the id must be a version-5 uuid, got ${id}`
    );
  });

  it('lets a caller scope a deliberately repeated action', () => {
    const daily = { ...action, idempotencyKey: '2026-11-14' };
    const nextDay = { ...action, idempotencyKey: '2026-11-15' };
    assert.notEqual(
      deterministicActivityId(activityIdempotencySeed(profileId, daily)),
      deterministicActivityId(activityIdempotencySeed(profileId, nextDay))
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 6. Identity and demo data                                                  */
/* -------------------------------------------------------------------------- */

describe('Workstream 1 — no demo candidate leaks into the product', () => {
  const USER_FACING = [
    join(REPO_ROOT, 'src', 'components'),
    join(REPO_ROOT, 'src', 'translations'),
  ];

  it('contains no hardcoded demo names', () => {
    const pattern = /\b(Nour|Maya|Omar|Alex Morgan|Era)\b/;
    const offenders: string[] = [];
    for (const directory of USER_FACING) {
      for (const file of walk(directory)) {
        if (!/\.(tsx?|json)$/.test(file)) continue;
        const contents = readFileSync(file, 'utf8');
        if (pattern.test(contents)) offenders.push(relative(REPO_ROOT, file));
      }
    }
    assert.deepEqual(offenders, [], `demo names found in: ${offenders.join(', ')}`);
  });

  it('does not fall back to "Frontend Engineer"', () => {
    const pattern = /\?\?\s*['"]Frontend Engineer['"]|\|\|\s*['"]Frontend Engineer['"]/;
    const offenders: string[] = [];
    for (const directory of ['src', 'shared', 'server']) {
      for (const file of walk(join(REPO_ROOT, directory))) {
        if (!/\.(tsx?)$/.test(file)) continue;
        if (pattern.test(readFileSync(file, 'utf8'))) {
          offenders.push(relative(REPO_ROOT, file));
        }
      }
    }
    assert.deepEqual(offenders, [], `hardcoded role fallback in: ${offenders.join(', ')}`);
  });
});

/* -------------------------------------------------------------------------- */
/* 7. The token contract                                                      */
/* -------------------------------------------------------------------------- */

describe('Workstream 1 — the AI chat is free, the four paid actions are not', () => {
  const appSource = readFileSync(APP_TS, 'utf8');

  function routeBlock(startMarker: string, endMarker: string): string {
    const start = appSource.indexOf(startMarker);
    assert.notEqual(start, -1, `${startMarker} must exist`);
    const end = appSource.indexOf(endMarker, start);
    assert.notEqual(end, -1, `${endMarker} must follow ${startMarker}`);
    return appSource.slice(start, end);
  }

  it('never charges the copilot and never caps it with a daily AI budget', () => {
    const block = routeBlock("app.post('/api/copilot'", "app.post('/api/analyze-career'");
    assert.equal(
      /requireCredits\s*\(/.test(block),
      false,
      'the chat must not carry a credit gate'
    );
    assert.equal(
      /consumeAiBudget\s*\(/.test(block),
      false,
      'the chat must not be capped by the per-user daily AI budget'
    );
    assert.match(block, /aiRateLimit/, 'the per-minute limiter is still the guard');
  });

  it('charges nothing for a mock interview', () => {
    const block = routeBlock("app.post('/api/mock-interview'", "app.post('/api/suggest-summary'");
    assert.equal(/requireCredits\s*\(/.test(block), false);
  });

  it('keeps the documented prices', () => {
    assert.equal(CREDIT_WEIGHTS.cv_ats_analysis, 1);
    assert.equal(CREDIT_WEIGHTS.cv_tailoring, 1);
    assert.equal(CREDIT_WEIGHTS.project_analysis, 1);
    assert.equal(CREDIT_WEIGHTS.premium_template_unlock, 5);
    assert.equal(CREDIT_WEIGHTS.career_consultation_chat, 0);
    assert.equal(CREDIT_WEIGHTS.interview_mock_session, 0);
    assert.equal(DAILY_CREDIT_ALLOWANCE, 2, 'the manual daily claim is exactly two tokens');
  });
});

/* -------------------------------------------------------------------------- */
/* 8. Cross-page sync                                                         */
/* -------------------------------------------------------------------------- */

describe('Workstream 1 — a profile change reaches the CV', () => {
  it('reflects the profile header and adds a new project immediately', () => {
    const first = mergeCanonicalCvDocument(source(), null);
    assert.equal(first.fullName, 'Sam Lee');
    assert.equal(first.projects.length, 0);

    const updated = mergeCanonicalCvDocument(
      source({
        profile: {
          fullName: 'Samira Lee',
          email: 'sam@example.com',
          phone: '',
          location: 'Alexandria',
          title: 'Senior Data Analyst',
          summary: '',
        },
        projects: [{ id: UUID_A, title: 'Reporting Suite', link: 'https://example.com/reporting' }],
      }),
      first
    );

    assert.equal(updated.fullName, 'Samira Lee', 'the new name reaches the document');
    assert.equal(updated.title, 'Senior Data Analyst', 'the new headline reaches the document');
    assert.equal(updated.location, 'Alexandria');
    assert.equal(updated.projects.length, 1, 'the new project appears without a button press');
  });

  it('does not resurrect a deleted record, but keeps imported content', () => {
    const projected = mergeCanonicalCvDocument(
      source({
        experiences: [
          { id: UUID_A, role: 'Data Analyst', company: 'Acme', startDate: '2022-01-01' },
        ],
      }),
      {
        ...mergeCanonicalCvDocument(source(), null),
        experiences: [
          {
            id: UUID_A,
            company: 'Acme',
            role: 'Data Analyst',
            period: '2022 - Present',
            location: 'Cairo',
            bullets: [],
          },
          {
            id: 'exp-imported',
            company: 'Old Co',
            role: 'Intern',
            period: '2015',
            location: '',
            bullets: [],
          },
        ],
      }
    );

    assert.equal(
      projected.experiences.some((entry) => entry.id === UUID_A),
      true,
      'the stored record stays'
    );
    assert.equal(
      projected.experiences.some((entry) => entry.id === 'exp-imported'),
      true,
      'unimported content is not thrown away'
    );

    const afterDelete = mergeCanonicalCvDocument(source(), projected);
    assert.equal(
      afterDelete.experiences.some((entry) => entry.id === UUID_A),
      false,
      'a deleted stored record leaves the document'
    );
  });
});
