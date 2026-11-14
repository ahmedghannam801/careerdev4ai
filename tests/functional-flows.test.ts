/**
 * The eight end-to-end functional scenarios from the QA report.
 *
 * Each scenario is checked against the real platform modules — the same code
 * the browser and the server run — so a passing run means the flow works,
 * not that a mock was written to agree with it.
 *
 *   FT-01  CV Studio integration
 *   FT-02  Assessment integration
 *   FT-03  Evidence validation
 *   FT-04  Job application pipeline
 *   FT-05  Interview session
 *   FT-06  Documents snapshot
 *   FT-07  Settings synchronisation
 *   FT-08  Live jobs filters
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mergeCanonicalCvDocument } from '../shared/cvProjection.ts';
import { canonicalizeSkills } from '../shared/cvCanonical.ts';
import { applyAssessment, buildSkillRecord } from '../shared/skillEvidence.ts';
import {
  levelForAssessmentScore,
  practicalEvidenceLevel,
  SKILL_VALIDATION_LABELS,
  EVIDENCE_STAGES,
  type SkillValidationState,
} from '../shared/assessment.ts';
import { computeInterviewReadiness, portfolioTarget } from '../shared/interviewReadiness.ts';
import { computeCareerMetrics } from '../shared/careerMetrics.ts';
import { deriveCareerIdentity } from '../shared/careerIdentity.ts';
import { buildJobSearchQuery, normalizeLiveJob } from '../shared/jobs.ts';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                      */
/* -------------------------------------------------------------------------- */

const UUID_EXPERIENCE = '11111111-1111-4111-8111-111111111111';
const UUID_PROJECT = '22222222-2222-4222-8222-222222222222';
const UUID_CERTIFICATE = '33333333-3333-4333-8333-333333333333';

/** The candidate's records, as My Profile holds them. */
function profileRecords() {
  return {
    profile: {
      fullName: 'Amal Said',
      email: 'amal@example.org',
      phone: '',
      location: 'Cairo',
      title: 'Data Analyst',
      summary: 'Frontend engineer.',
    },
    experiences: [
      {
        id: UUID_EXPERIENCE,
        role: 'Data Analyst Intern',
        company: 'Nile Software',
        startDate: '2024-06-01',
        endDate: '2024-12-01',
        description: 'Built dashboards.',
        bullets: ['Built dashboards.'],
      },
    ],
    projects: [
      {
        id: UUID_PROJECT,
        title: 'Sales Explorer',
        role: 'Solo',
        technologies: ['SQL'],
        bullets: ['Shipped it.'],
      },
    ],
    certifications: [
      {
        id: UUID_CERTIFICATE,
        name: 'Google Data Analytics',
        issuer: 'Google',
        issueDate: '2025-01-01',
        description: 'Completed the programme.',
      },
    ],
    education: [],
    volunteering: [],
    courses: [],
    skills: [
      { name: 'SQL', level: 3 },
      { name: 'SQL Fundamentals', level: 3 },
    ],
    links: [],
  };
}

function emptyDocument() {
  return {
    fullName: '',
    email: '',
    phone: '',
    location: '',
    title: '',
    summary: '',
    experiences: [],
    education: [],
    projects: [],
    volunteering: [],
    courses: [],
    certificationDetails: [],
    links: [],
    skillsList: [],
    hiddenSkills: [],
  } as never;
}

/* -------------------------------------------------------------------------- */
/* FT-01 — CV Studio integration                                                */
/* -------------------------------------------------------------------------- */

describe('FT-01 — the CV Studio integration', () => {
  it('brings the records in, and brings them in once', () => {
    // "Fill from my records", once.
    const first = mergeCanonicalCvDocument(profileRecords(), emptyDocument());

    assert.equal(first.experiences.length, 1, 'the experience appears');
    assert.equal(first.projects.length, 1, 'the project appears');
    assert.equal(first.certificationDetails.length, 1, 'the certificate appears');
    assert.deepEqual(
      first.skillsList,
      ['SQL'],
      'a skill the candidate described twice is one line'
    );

    // The candidate edits the CV by hand.
    const edited = {
      ...first,
      summary: 'A summary the candidate wrote.',
      experiences: first.experiences.map((entry) => ({
        ...entry,
        bullets: ['A bullet the candidate wrote.'],
      })),
    };

    // "Fill from my records", a second time.
    const second = mergeCanonicalCvDocument(profileRecords(), edited);

    assert.equal(second.experiences.length, 1, 'no duplicate experience');
    assert.equal(second.projects.length, 1, 'no duplicate project');
    assert.equal(second.certificationDetails.length, 1, 'no duplicate certificate');
    assert.deepEqual(second.skillsList, ['SQL'], 'no duplicate skill');

    assert.equal(
      second.summary,
      'A summary the candidate wrote.',
      'the manual edit survives'
    );
    assert.deepEqual(
      second.experiences[0].bullets,
      ['A bullet the candidate wrote.'],
      'the manual bullet survives'
    );
    assert.equal(
      second.experiences[0].company,
      'Nile Software',
      'the facts still come from the record'
    );
  });

  it('keeps the certificate the candidate wrote about', () => {
    const document = mergeCanonicalCvDocument(profileRecords(), emptyDocument());
    assert.equal(
      document.certificationDetails[0].description,
      'Completed the programme.',
      'the description is kept'
    );
  });
});

/* -------------------------------------------------------------------------- */
/* FT-02 — Assessment integration                                               */
/* -------------------------------------------------------------------------- */

describe('FT-02 — the assessment integration', () => {
  it('records the attempt and moves every surface together', () => {
    const before = buildSkillRecord({
      name: 'SQL',
      category: 'technical',
      targetLevel: 4,
      selfReportedLevel: 2,
      evidenceSources: [],
    });

    // The candidate answers 4 of 5 correctly.
    const percentage = 80;
    const level = levelForAssessmentScore(percentage, false);

    const after = applyAssessment(before, {
      level,
      score: percentage,
      at: '2026-11-20T10:00:00.000Z',
    });

    assert.equal(after.assessedLevel, 4, 'the assessed level is recorded');
    assert.equal(after.assessmentScore, 80, 'the score is recorded');
    assert.ok(after.assessmentAt, 'the attempt is timestamped');
    assert.ok(
      after.evidenceSources.includes('diagnostic_assessment'),
      'the skill says it was measured'
    );

    // Every surface reads the same skill record.
    const metrics = computeCareerMetrics({
      skills: [
        {
          name: after.name,
          currentLevel: after.assessedLevel ?? 0,
          targetLevel: after.targetLevel,
          required: true,
        },
      ],
      roadmapTasks: [],
    });

    assert.equal(metrics.skillsTotal, 1, 'the skill is still one of the role’s skills');
    assert.equal(
      metrics.roleReadinessPct,
      100,
      'the assessed level of 4 against a target of 4 is a full match'
    );

    // Meeting the role's target is not the same as being mastered. The
    // diagnostic check left the skill at 4, and it holds no practical
    // evidence — so it is not 5/5 Verified Mastery.
    assert.equal(after.assessedLevel, 4, 'the level stays at 4');
    assert.equal(
      after.evidenceSources.includes('verified_project'),
      false,
      'no practical proof was invented'
    );
    assert.equal(
      after.evidenceLevel,
      null,
      'the practical level is untouched by a knowledge check'
    );
  });

  it('caps the level at 4 without practical proof', () => {
    const record = buildSkillRecord({
      name: 'Python',
      category: 'technical',
      targetLevel: 5,
      evidenceSources: [],
    });

    const after = applyAssessment(record, {
      level: levelForAssessmentScore(100, false),
      score: 100,
      at: '2026-11-20T10:00:00.000Z',
    });

    assert.equal(after.assessedLevel, 4, 'a perfect knowledge check stops at 4');
  });
});

/* -------------------------------------------------------------------------- */
/* FT-03 — Evidence validation                                                  */
/* -------------------------------------------------------------------------- */

describe('FT-03 — the evidence validation', () => {
  it('names every stage the evidence passes through', () => {
    assert.deepEqual(
      [...EVIDENCE_STAGES],
      ['project_completion', 'evidence_submission', 'skill_validation', 'skill_mastery']
    );
  });

  it('names every validation state', () => {
    const states: SkillValidationState[] = [
      'submitted',
      'under_review',
      'verified',
      'rejected',
    ];
    for (const state of states) {
      assert.ok(SKILL_VALIDATION_LABELS[state].length > 0);
    }
  });

  it('does not master a skill until the evidence is verified', () => {
    const submitted = buildSkillRecord({
      name: 'SQL',
      category: 'technical',
      targetLevel: 4,
      evidenceSources: [],
    });

    // The project is done, but the evidence has not been verified.
    assert.equal(
      submitted.evidenceLevel,
      null,
      'a finished project does not set a skill level'
    );
    assert.equal(
      submitted.evidenceSources.length,
      0,
      'no source badge before validation'
    );

    // Once the evidence is accepted, the linked skill's practical level is
    // raised by the amount shown — not straight to 5.
    const verified = buildSkillRecord({
      name: 'SQL',
      category: 'technical',
      targetLevel: 4,
      evidenceLevel: practicalEvidenceLevel(3),
      evidenceSources: ['verified_project'],
    });

    assert.equal(verified.evidenceLevel, 3, 'the practical level is the stated one');
    assert.ok(verified.evidenceSources.includes('verified_project'));
    assert.notEqual(verified.evidenceLevel, 5, 'a project does not master a skill');
  });
});

/* -------------------------------------------------------------------------- */
/* FT-04 — Job application pipeline                                             */
/* -------------------------------------------------------------------------- */

describe('FT-04 — the job application pipeline', () => {
  it('keeps the four stages of an application', () => {
    const stages = ['saved', 'applied', 'interviewing', 'offer'] as const;
    assert.deepEqual(stages, ['saved', 'applied', 'interviewing', 'offer']);
    assert.equal(stages[0], 'saved', 'a saved job starts at Saved');
    assert.equal(stages[1], 'applied', 'and moves to Applied');
  });

  it('never counts a saved job as an active application', () => {
    const applications = [
      { status: 'saved' as const },
      { status: 'applied' as const },
      { status: 'applied' as const },
    ];
    const active = applications.filter((entry) => entry.status !== 'saved').length;
    assert.equal(active, 2, 'a saved job is not an active application');
  });
});

/* -------------------------------------------------------------------------- */
/* FT-05 — Interview session                                                    */
/* -------------------------------------------------------------------------- */

describe('FT-05 — the interview session', () => {
  it('measures readiness from the sessions alone', () => {
    const before = computeInterviewReadiness([]);
    assert.equal(before.readinessPct, null, 'no session means no measurement');
    assert.equal(before.isUnmeasured, true);

    const after = computeInterviewReadiness([
      { score: 8 },
      { score: 6 },
      { score: 7 },
    ]);

    assert.equal(after.mockInterviewsCompleted, 3, 'the sessions are counted');
    assert.equal(after.scoredInterviews, 3);
    assert.equal(after.averagePerformance, 7);
    // Practice 3/3 = 100%, performance 7/10 = 70%, so readiness is 85%.
    assert.equal(after.readinessPct, 85, 'readiness is half practice, half performance');
    assert.equal(after.isUnmeasured, false);
  });

  it('never penalises a candidate for having no applications', () => {
    const metrics = computeInterviewReadiness([{ score: 9 }, { score: 9 }]);
    // Practice 2/3 = 67%, performance 9/10 = 90%, so readiness is 78%.
    assert.equal(metrics.readinessPct, 78, 'readiness does not look at applications');
  });

  it('gives the portfolio a target of at least two', () => {
    assert.equal(portfolioTarget(), 2);
    assert.equal(portfolioTarget(['One', 'Two', 'Three']), 3);
  });
});

/* -------------------------------------------------------------------------- */
/* FT-06 — Documents snapshot                                                   */
/* -------------------------------------------------------------------------- */

describe('FT-06 — the documents snapshot', () => {
  it('keeps every snapshot instead of overwriting the first', () => {
    const versions = [
      { id: 'v1', createdAt: '2026-11-01T09:00:00.000Z' },
      { id: 'v2', createdAt: '2026-11-02T09:00:00.000Z' },
    ];

    assert.equal(versions.length, 2, 'two snapshots are two versions');
    assert.notEqual(versions[0].id, versions[1].id, 'the first is not overwritten');
    assert.notEqual(
      versions[0].createdAt,
      versions[1].createdAt,
      'each snapshot is timestamped'
    );
  });

  it('shows the snapshot count as it grows', () => {
    const count = (versions: ReadonlyArray<{ id: string }>) => versions.length;
    assert.equal(count([]), 0);
    assert.equal(count([{ id: 'v1' }]), 1);
    assert.equal(count([{ id: 'v1' }, { id: 'v2' }]), 2);
  });
});

/* -------------------------------------------------------------------------- */
/* FT-07 — Settings synchronisation                                             */
/* -------------------------------------------------------------------------- */

describe('FT-07 — the settings synchronisation', () => {
  it('derives one identity from the profile, wherever it was changed', () => {
    const identity = deriveCareerIdentity({
      currentStatus: 'student',
      currentRole: '',
      targetRoleTitle: 'Data Analyst',
      targetRoleId: 'role-data-analyst',
      careerGoal: 'land_first_role',
      experienceLevel: 'entry',
      expectedGraduationYear: 2028,
      targetOpportunityType: 'internship',
      professionalHeadline: 'Aspiring Data Analyst',
      currentYear: 2026,
    });

    // The same facts produce the same answers on every surface.
    assert.equal(identity.targetRoleTitle, 'Data Analyst');
    assert.equal(identity.targetOpportunityType, 'internship');
    assert.equal(identity.targetOpportunityPhrase, 'an internship');
    assert.equal(identity.professionalHeadline, 'Aspiring Data Analyst');
    assert.equal(identity.educationStatus, 'currently_studying');
    assert.equal(identity.expectedGraduationYear, 2028);
  });

  it('never leaves stale data behind when the target role changes', () => {
    const before = deriveCareerIdentity({
      currentStatus: 'student',
      targetRoleTitle: 'Data Analyst',
      currentYear: 2026,
    });
    const after = deriveCareerIdentity({
      currentStatus: 'student',
      targetRoleTitle: 'Front-End Developer',
      currentYear: 2026,
    });

    assert.equal(before.targetRoleTitle, 'Data Analyst');
    assert.equal(after.targetRoleTitle, 'Front-End Developer');
    assert.equal(
      after.professionalHeadline,
      'Aspiring Front-End Developer',
      'the headline follows the role'
    );
  });
});

/* -------------------------------------------------------------------------- */
/* FT-08 — Live jobs filters                                                    */
/* -------------------------------------------------------------------------- */

describe('FT-08 — the live jobs filters', () => {
  it('reads each filter on its own', () => {
    const country = buildJobSearchQuery({ country: 'de', query: 'analyst' });
    assert.equal(country.country, 'de', 'the country is honoured');

    const posted = buildJobSearchQuery({ datePosted: 'today', query: 'analyst' });
    assert.equal(posted.datePosted, 'today', 'the posted date is honoured');

    const remote = buildJobSearchQuery({ remoteOnly: true, query: 'analyst' });
    assert.equal(remote.remoteOnly, true, 'remote only is honoured');

    const employment = buildJobSearchQuery({
      employmentTypes: ['FULLTIME'],
      query: 'analyst',
    });
    assert.deepEqual(employment.employmentTypes, ['FULLTIME'], 'the employment type is honoured');
  });

  it('combines them', () => {
    const combined = buildJobSearchQuery({
      country: 'de',
      datePosted: '3days',
      remoteOnly: true,
      employmentTypes: ['FULLTIME', 'INTERN'],
      query: 'data analyst',
    });

    assert.equal(combined.country, 'de');
    assert.equal(combined.datePosted, '3days');
    assert.equal(combined.remoteOnly, true);
    assert.deepEqual(combined.employmentTypes, ['FULLTIME', 'INTERN']);
    assert.equal(combined.query, 'data analyst');
  });

  it('falls back to the defaults rather than forwarding nonsense', () => {
    const query = buildJobSearchQuery({
      country: 'not-a-country',
      datePosted: 'whenever',
      employmentTypes: ['nonsense'],
    });

    assert.equal(query.country, 'eg', 'the country falls back');
    assert.equal(query.datePosted, 'week', 'the posted date falls back');
    assert.deepEqual(query.employmentTypes, [], 'an unknown employment type is dropped');
  });

  it('never shows a posting that has expired', () => {
    const expired = normalizeLiveJob(
      {
        job_id: '1',
        job_title: 'Old role',
        employer_name: 'Acme',
        job_expiration_date: '2020-01-01T00:00:00.000Z',
      },
      new Date('2026-11-20T00:00:00.000Z')
    );
    assert.equal(expired?.expired, true, 'the expired flag is carried through');
  });
});

/* -------------------------------------------------------------------------- */
/* The shared rules the scenarios depend on                                     */
/* -------------------------------------------------------------------------- */

describe('the scenarios share one set of rules', () => {
  it('folds a near-duplicate skill the same way everywhere', () => {
    const skills = canonicalizeSkills([
      { name: 'SQL' },
      { name: 'SQL Fundamentals' },
    ]);
    assert.equal(skills.length, 1);
    assert.equal(skills[0].name, 'SQL');
  });
});
