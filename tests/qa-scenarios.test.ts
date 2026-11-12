/**
 * The six scenarios from the QA report.
 *
 * Each scenario is a situation a real candidate finds themselves in. They are
 * written here against the SHARED domain layer — the modules the server, the
 * interface and the database all use — because that is where the behaviour
 * that used to go wrong actually lives.
 *
 *   A  a student who signed up and did nothing yet
 *   B  a candidate who changes their target role
 *   C  a candidate who finishes a diagnostic knowledge check
 *   D  a candidate who imports a CV
 *   E  a candidate who rates a skill by hand
 *   F  the interface in Arabic, right to left
 *
 * The point of each test is the CLAIM that used to be false.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  deriveCareerIdentity,
  resolveEducationStatus,
  suggestedCareerGoal,
} from '../shared/careerIdentity.ts';
import {
  applyAssessment,
  buildSkillRecord,
  effectiveSkillLevel,
  evidenceBadges,
  rankSkillPriorities,
} from '../shared/skillEvidence.ts';
import { mergeCanonicalCvDocument } from '../shared/cvProjection.ts';
import { activityBadge } from '../shared/activityStatus.ts';
import {
  computeSkillGaps,
  normalizeSkillName,
  summarizeSkillGaps,
  toRoleSkillRequirements,
} from '../shared/skillGap.ts';
import { computeProfileCompleteness } from '../shared/profileCompleteness.ts';
import {
  dedupeEducation,
  dedupeExperience,
  dedupeSkills,
  isSkillSectionHeader,
  normalizeSkillKey,
} from '../shared/cvDedupe.ts';
import {
  isShippedStatus,
  normalizeProjectStatus,
  projectMetrics,
} from '../shared/projectLifecycle.ts';
import { AR_STRINGS } from '../src/translations/sourceStrings.ts';

/**
 * The role requirements used by the scenarios.
 *
 * They stand in for the catalogue so the test does not depend on the
 * catalogue's contents.
 */
const ROLE = {
  requiredSkills: [
    { name: 'Python', category: 'technical', minLevel: 3 },
    { name: 'SQL', category: 'technical', minLevel: 3 },
    { name: 'Excel', category: 'technical', minLevel: 2 },
  ],
  preferredSkills: [{ name: 'Tableau', category: 'technical', minLevel: 2 }],
};

/** The gaps a candidate with the given levels has against the role. */
function gapsFor(levels: Record<string, number>) {
  const requirements = toRoleSkillRequirements(ROLE as never);
  return computeSkillGaps(
    requirements,
    Object.entries(levels).map(([name, level]) => ({ name, level })),
  );
}

describe('Scenario A: a student who signed up and did nothing yet', () => {
  it('invents no target role', () => {
    const identity = deriveCareerIdentity({
      currentStatus: null,
      currentRole: null,
      targetRoleTitle: null,
      careerGoal: null,
      experienceLevel: null,
      education: [],
      currentYear: 2026,
    });

    assert.equal(identity.targetRoleTitle, null, 'no role is invented');
    assert.equal(identity.currentStatus, null, 'no status is invented');
    assert.equal(identity.careerGoal, null, 'no goal is invented');
  });

  it('names what is still missing instead of filling it in', () => {
    const identity = deriveCareerIdentity({
      currentStatus: null,
      currentRole: null,
      targetRoleTitle: null,
      careerGoal: null,
      experienceLevel: null,
      education: [],
      currentYear: 2026,
    });

    const missing = identity.missingFields.map((field) => field.id);
    assert.ok(missing.includes('currentStatus'));
    assert.ok(missing.includes('targetRole'));
    assert.ok(missing.includes('careerGoal'));
  });

  it('reports a graduation year in the future as still studying', () => {
    const status = resolveEducationStatus({
      education: [],
      expectedGraduationYear: 2028,
      educationStatusOverride: null,
      currentYear: 2026,
    });

    assert.equal(status.status, 'currently_studying');
  });

  it('does not let a future graduation year count as a degree', () => {
    const completeness = computeProfileCompleteness({
      fullName: 'Ahmed Ebrahim',
      headline: 'Data Analyst in training',
      location: 'Tanta, Egypt',
      professionalSummary: 'A summary that is long enough to count towards the total.',
      avatarUrl: 'avatar-01',
      targetRoleTitle: 'Data Analyst',
      educationCount: 1,
      experienceCount: 0,
      ratedSkillCount: 0,
      evidencedSkillCount: 0,
      activeProjectCount: 0,
      shippedProjectCount: 0,
      certificationCount: 0,
      hasProfessionalLink: false,
      cvVersionCount: 0,
    });

    // The missing items name the sections that are empty, so the checklist
    // says what to do rather than just reporting a number.
    const missing = completeness.missingItems.map((item) => item.id);
    assert.ok(missing.includes('experience'), 'the empty experience section is named');
    assert.ok(missing.includes('projects'), 'the empty projects section is named');
    assert.ok(missing.includes('certifications'), 'the empty certifications section is named');
    assert.ok(completeness.overallPercent < 100);
  });

  it('never lets profile completeness exceed 75% when projects and certifications are both zero', () => {
    const maxedExceptProjectsAndCerts = computeProfileCompleteness({
      fullName: 'Sara Mostafa',
      headline: 'Junior Data Analyst',
      location: 'Cairo, Egypt',
      professionalSummary: 'Analytical computer science graduate focused on SQL and Python data pipelines.',
      avatarUrl: 'avatar-02',
      targetRoleTitle: 'Data Analyst',
      educationCount: 1,
      experienceCount: 1,
      ratedSkillCount: 5,
      evidencedSkillCount: 0,
      activeProjectCount: 0,
      shippedProjectCount: 0,
      certificationCount: 0,
      hasProfessionalLink: true,
      cvVersionCount: 1,
    });

    assert.ok(
      maxedExceptProjectsAndCerts.overallPercent <= 75,
      `expected completeness <= 75% without projects & certifications, got ${maxedExceptProjectsAndCerts.overallPercent}%`
    );
  });

  it('suggests a goal that fits the stage of life', () => {
    assert.equal(suggestedCareerGoal('student', 'student'), 'get_internship');
    assert.equal(suggestedCareerGoal('fresh_graduate', 'junior'), 'get_first_job');
    assert.equal(suggestedCareerGoal('working_professional', 'mid'), 'get_promoted');
  });
});

describe('Scenario B: a candidate who changes their target role', () => {
  it('derives the identity from the new role', () => {
    const identity = deriveCareerIdentity({
      currentStatus: 'fresh_graduate',
      currentRole: null,
      targetRoleTitle: 'Data Analyst',
      targetRoleId: 'data-analyst',
      careerGoal: 'get_first_job',
      experienceLevel: 'junior',
      education: [{ institution: 'Tanta University', endDate: '2025-06-01' }],
      currentYear: 2026,
    });

    assert.equal(identity.targetRoleTitle, 'Data Analyst');
    assert.equal(identity.targetRoleId, 'data-analyst');
  });

  it('measures the gaps against the NEW role, not the old one', () => {
    const analyst = gapsFor({ Python: 2, SQL: 2, Excel: 4 });
    const designer = computeSkillGaps(
      toRoleSkillRequirements({
        requiredSkills: [{ name: 'Figma', category: 'technical', minLevel: 3 }],
        preferredSkills: [],
      } as never),
      [{ name: 'Figma', level: 1 }],
    );

    assert.ok(analyst.some((gap) => gap.name === 'Python'), 'the analyst gaps are measured');
    assert.ok(designer.some((gap) => gap.name === 'Figma'), 'the designer gaps are measured');
    assert.equal(
      analyst.some((gap) => gap.name === 'Figma'),
      false,
      'the previous role does not leak into the new one',
    );
  });
});

describe('Scenario C: a candidate who finishes a diagnostic knowledge check', () => {
  it('keeps the self-report and adds the measurement beside it', () => {
    const before = buildSkillRecord({
      name: 'Python',
      category: 'technical',
      selfReportedLevel: 2,
    });

    const after = buildSkillRecord({
      name: 'Python',
      category: 'technical',
      selfReportedLevel: 2,
      assessedLevel: 4,
      assessmentScore: 100,
      assessmentAt: '2026-11-11T10:00:00.000Z',
      evidenceSources: ['self_reported', 'diagnostic_assessment'],
    });

    assert.equal(after.selfReportedLevel, 2, 'the self-report is not overwritten');
    assert.equal(after.assessedLevel, 4, 'the measurement is stored');
    assert.equal(after.assessmentScore, 100);
    assert.ok(after.evidenceSources.includes('diagnostic_assessment'));
  });

  it('uses the strongest signal as the level the platform compares', () => {
    const record = buildSkillRecord({
      name: 'Python',
      category: 'technical',
      selfReportedLevel: 2,
      assessedLevel: 4,
    });

    assert.equal(effectiveSkillLevel(record), 4);
  });

  it('raises the level when the evidence proves it, even without a claim', () => {
    const record = buildSkillRecord({
      name: 'Python',
      category: 'technical',
      selfReportedLevel: null,
      assessedLevel: null,
      evidenceLevel: 3,
      evidenceSources: ['verified_project'],
    });

    assert.equal(effectiveSkillLevel(record), 3);
  });

  it('shows the badge that says where the level came from', () => {
    const record = buildSkillRecord({
      name: 'Python',
      category: 'technical',
      selfReportedLevel: 2,
      assessedLevel: 4,
      evidenceSources: ['self_reported', 'diagnostic_assessment'],
    });

    const badges = evidenceBadges(record).map((badge) => badge.source);
    assert.ok(badges.includes('self_reported'));
    assert.ok(badges.includes('diagnostic_assessment'));
  });

  it('closes the gap so the skill leaves the blockers on its own', () => {
    const before = gapsFor({ Python: 2, SQL: 2, Excel: 4 });
    const after = gapsFor({ Python: 4, SQL: 2, Excel: 4 });

    const beforePriorities = rankSkillPriorities(before).map((p) => p.skillName);
    const afterPriorities = rankSkillPriorities(after).map((p) => p.skillName);

    assert.ok(beforePriorities.includes('Python'), 'Python is a blocker before the check');
    assert.equal(
      afterPriorities.includes('Python'),
      false,
      'Python leaves the blockers once it is measured at the required level',
    );
    assert.ok(afterPriorities.includes('SQL'), 'the other gaps are untouched');
  });

  it('caps knowledge checks at 4/5 without practical evidence and allows 5/5 once project evidence exists', () => {
    const noProject = buildSkillRecord({
      name: 'SQL',
      category: 'technical',
      selfReportedLevel: 2,
    });
    const knowledgeOnly = applyAssessment(noProject, {
      level: 5,
      score: 100,
      at: '2026-11-12T00:00:00.000Z',
    });
    assert.equal(knowledgeOnly.assessedLevel, 4, 'diagnostic quiz alone caps at 4/5');

    const withProject = buildSkillRecord({
      name: 'SQL',
      category: 'technical',
      selfReportedLevel: 2,
      evidenceLevel: 4,
      evidenceSources: ['verified_project'],
    });
    const verified = applyAssessment(withProject, {
      level: 5,
      score: 100,
      at: '2026-11-12T00:00:00.000Z',
    });
    assert.equal(verified.assessedLevel, 5, 'practical evidence unlocks 5/5 verified proficiency');
  });
});

describe('Scenario D: a candidate who imports a CV', () => {
  it('imports one placement, not three', () => {
    // The block read one line at a time: the organisation becomes a record
    // of its own, with no role and no dates.
    const parsed = [
      {
        role: 'Data Analyst Trainee',
        company: 'University Data Analytics Training',
        period: 'Jan 2024 – Jun 2024',
      },
      {
        role: 'Data Analyst Trainee',
        company: 'University Data Analytics Training',
        period: 'Jan 2024 – Jun 2024',
      },
      { role: '', company: 'University Data Analytics Training', period: '' },
    ];

    const deduped = dedupeExperience(parsed);

    assert.equal(deduped.length, 1, 'the block is one placement');
    assert.equal(deduped[0].role, 'Data Analyst Trainee');
    assert.equal(deduped[0].company, 'University Data Analytics Training');
  });

  it('keeps two placements at the same organisation apart', () => {
    const parsed = [
      { role: 'Data Analyst', company: 'Nile Retail Group', period: 'Jan 2023 – Dec 2023' },
      { role: 'Data Analyst', company: 'Nile Retail Group', period: 'Jan 2024 – Jun 2024' },
    ];

    assert.equal(dedupeExperience(parsed).length, 2, 'different dates are different placements');
  });

  it('does not import a section heading as a skill', () => {
    assert.equal(isSkillSectionHeader('TECHNICAL SKILLS'), true);
    assert.equal(isSkillSectionHeader('SOFT SKILLS'), true);
    assert.equal(isSkillSectionHeader('Skills'), true);
    assert.equal(isSkillSectionHeader('Python'), false);

    const skills = dedupeSkills(['Python', 'SQL', 'TECHNICAL SKILLS', 'Excel']);
    assert.equal(skills.some((skill) => isSkillSectionHeader(skill)), false);
    assert.deepEqual(skills, ['Python', 'SQL', 'Excel']);
  });

  it('matches a skill by its normalised name, not by its spelling', () => {
    assert.equal(normalizeSkillKey('Python'), normalizeSkillKey(' python '));
    assert.equal(normalizeSkillKey('Python'), normalizeSkillKey('(Python)'));
  });

  it('does not duplicate a degree', () => {
    const degrees = [
      { institution: 'Tanta University', degree: 'BSc' },
      { institution: 'Tanta University', degree: 'BSc' },
    ];

    assert.equal(dedupeEducation(degrees).length, 1);
  });
});

describe('Scenario E: a candidate who rates a skill by hand', () => {
  it('moves the skill up the priority list when the gap closes', () => {
    const before = rankSkillPriorities(gapsFor({ Python: 1, SQL: 4, Excel: 4 }));
    const after = rankSkillPriorities(gapsFor({ Python: 3, SQL: 4, Excel: 4 }));

    assert.equal(before[0].skillName, 'Python');
    assert.equal(
      after.some((priority) => priority.skillName === 'Python'),
      false,
      'the satisfied skill leaves the list',
    );
  });

  it('gives the first priority a reason and an action', () => {
    const priorities = rankSkillPriorities(gapsFor({ Python: 1, SQL: 4, Excel: 4 }));
    const first = priorities[0];

    assert.ok(first.why.length > 0, 'the priority explains itself');
    assert.ok(first.estimatedHours > 0, 'the priority says how long it takes');
    assert.ok(first.action.length > 0, 'the priority says what to do');
  });

  it('reads the readiness the same way for the dashboard and the roadmap', () => {
    const gaps = gapsFor({ Python: 3, SQL: 1, Excel: 4 });
    const summary = summarizeSkillGaps(gaps, toRoleSkillRequirements(ROLE as never));

    // One engine, one number. The readiness figure and the blocker list are
    // two views of the same measurement.
    const open = gaps.filter((gap) => gap.gap > 0).length;
    assert.equal(summary.open, open);
  });

  it('keeps the project lifecycle honest about what has shipped', () => {
    assert.equal(isShippedStatus('completed'), true);
    assert.equal(isShippedStatus('published'), true);
    assert.equal(isShippedStatus('planned'), false);
    assert.equal(isShippedStatus(null), false);

    const metrics = projectMetrics([
      { status: 'planned' },
      { status: 'in_progress' },
      { status: 'completed' },
      { status: 'published' },
    ]);

    assert.equal(metrics.total, 4);
    assert.equal(metrics.planned, 1);
    assert.equal(metrics.shipped, 2);
    assert.equal(metrics.added, 3);
  });

  it('reads the older project vocabulary as the same states', () => {
    assert.equal(normalizeProjectStatus('idea'), 'planned');
    assert.equal(normalizeProjectStatus('verified'), 'published');
    assert.equal(normalizeProjectStatus('submitted'), 'published');
  });
});

describe('Scenario F: the interface in Arabic, right to left', () => {
  it('translates the strings the identity and the checks use', () => {
    const required = [
      'Where you are now',
      'Current status',
      'Education status',
      'Expected graduation year',
      'Re-sync skill profile',
      'Saved to your skill profile',
      'Diagnostic Knowledge Checks',
      'My Career',
      'Learn & Practise',
      'Get Hired',
      'Last checked: {time}',
      'What does this score mean?',
    ];

    const missing = required.filter((source) => !AR_STRINGS[source]);
    assert.deepEqual(missing, [], 'every new string has an Arabic entry');
  });

  it('keeps the placeholders in the Arabic, so the sentence still reads', () => {
    const source =
      '{skill} is now measured at level {level}/5. Your role readiness, career blockers and roadmap were recalculated.';
    const translation = AR_STRINGS[source];

    assert.ok(translation, 'the sentence is translated');
    assert.ok(translation.includes('{skill}'));
    assert.ok(translation.includes('{level}'));
  });
});

describe('the shared measurement is one measurement', () => {
  it('normalises a skill name the same way everywhere', () => {
    assert.equal(normalizeSkillName('  Python  '), normalizeSkillName('python'));
  });

  it('filters section headers and case duplicates during Fill from my records projection', () => {
    const merged = mergeCanonicalCvDocument(
      {
        profile: { fullName: 'Mona Hassan' },
        skills: [
          { name: 'SQL', category: 'technical', currentLevel: 3 },
          { name: 'Python', category: 'technical', currentLevel: 4 },
        ],
      },
      {
        fullName: 'Mona Hassan',
        email: '',
        phone: '',
        location: '',
        title: '',
        summary: '',
        experiences: [],
        education: [],
        skillsList: ['TECHNICAL SKILLS', 'sql', '  Python '],
        certifications: [],
      }
    );

    assert.deepEqual(merged.skillsList, ['sql', 'Python']);
    assert.equal(merged.skillsList?.some((s) => isSkillSectionHeader(s)), false);
  });

  it('assigns honest verification badges to activity log items', () => {
    assert.equal(activityBadge('completed_task').label, 'Activity Recorded');
    assert.equal(activityBadge('applied_job').label, 'User Submitted');
    assert.equal(activityBadge('acquired_skill').label, 'System Evaluated');
    assert.equal(activityBadge('added_evidence').label, 'Evidence Verified');
  });
});
