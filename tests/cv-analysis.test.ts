// The deterministic CV analysis.
//
// The engine in `shared/cvAnalysis.ts` is the part of the product that claims
// to measure a CV rather than describe it. These tests hold that claim to four
// rules:
//
//   1. The same document always produces the same report. Nothing in it is
//      sampled, guessed or dependent on a model.
//   2. A dimension the document cannot support is marked unavailable and left
//      out of the average. It is never quietly scored as zero.
//   3. The market dimension is scored only from a job description the candidate
//      actually supplied. With no advertisement there is no market score, and
//      no claim about the Egyptian market either.
//   4. The report maps onto the shape the platform already stores, so the score
//      a candidate sees is the score the database holds.
//
// Pure: no database, no model, no network.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeCv,
  isCvAnalysisFresh,
  runCvAnalysisPipeline,
  scoreBand,
  toLegacyAtsAnalysis,
  CV_ANALYSIS_STAGES,
  CV_SCORE_BANDS,
  type CvAnalysisDocument,
  type CvAnalysisInput,
  type CvAnalysisReport,
  type CvDimensionKey,
} from '../shared/cvAnalysis.ts';
import type { ATSAnalysis } from '../src/types/career.ts';
import { catalogueSkillNames, measureCv } from '../server/cv/cvAnalysis.ts';

const FIXED_NOW = Date.parse('2026-11-06T12:00:00.000Z');

/** A CV with everything a strong application needs. */
const STRONG_CV: CvAnalysisDocument = {
  fullName: 'Ahmed Ebrahim',
  email: 'ahmed.ebrahim@example.com',
  phone: '+20 100 123 4567',
  location: 'Cairo, Egypt',
  title: 'Full-Stack Developer',
  summary:
    'Full-stack developer with five years of experience building and shipping production web applications for fintech and healthcare clients in Egypt, focused on measurable delivery, clean architecture and fast, accessible interfaces.',
  linkedin: 'https://linkedin.com/in/ahmed-ebrahim',
  github: 'https://github.com/ahmed-ebrahim',
  experiences: [
    {
      company: 'Nile Digital',
      role: 'Senior Backend Developer',
      period: '2021 - Present',
      bullets: [
        'Reduced checkout latency by 38% by rewriting the payment service in Node.js.',
        'Led the migration of 12 services to Kubernetes, cutting deployment time from 40 minutes to 6.',
        'Automated the release pipeline with CI/CD, releasing 3 times per week instead of monthly.',
      ],
      description: 'Owns the payment platform used by 90000 customers.',
    },
    {
      company: 'Delta Labs',
      role: 'Software Engineer',
      period: '2019 - 2021',
      bullets: [
        'Delivered 4 client portals in React and TypeScript with 100% Lighthouse accessibility scores.',
        'Improved API response times by 25% by adding read-through caching to PostgreSQL.',
      ],
    },
  ],
  education: [
    {
      institution: 'Cairo University',
      degree: 'Bachelor of Science',
      field: 'Computer Science',
      period: '2015 - 2019',
      gpa: '3.6/4.0',
    },
  ],
  projects: [
    {
      title: 'Arabic Speech-to-CV',
      role: 'Solo builder',
      technologies: ['React', 'TypeScript', 'Node.js'],
      bullets: [
        'Built a voice interview flow that transcribes 1200 sessions and cuts CV writing time by 70%.',
        'Implemented a deterministic scorer that rates a CV against 6 measured dimensions.',
      ],
    },
  ],
  skillsList: [
    'React',
    'TypeScript',
    'Node.js',
    'PostgreSQL',
    'Docker',
    'GraphQL',
    'CI/CD',
  ],
  certifications: ['AWS Certified Solutions Architect Associate'],
};

/** A CV that carries almost nothing. */
const WEAK_CV: CvAnalysisDocument = {
  fullName: '',
  email: '',
  phone: '',
  location: '',
  title: '',
  summary: '',
  experiences: [],
  education: [],
  projects: [],
  skillsList: [],
  certifications: [],
};

/** A job advertisement in the shape an employer actually writes. */
const ADVERTISEMENT = `Full-Stack Developer
Location: Cairo, Egypt
Work mode: Hybrid

We are hiring a Full-Stack Developer to build our payments platform.

Requirements:
- Strong knowledge of React and TypeScript
- Solid Node.js and PostgreSQL experience
- Docker and CI/CD pipelines
- 3+ years of experience shipping web applications
`;

function input(overrides: Partial<CvAnalysisInput> = {}): CvAnalysisInput {
  return {
    cv: STRONG_CV,
    targetRoleTitle: 'Full-Stack Developer',
    targetRoleSkills: [
      'React',
      'TypeScript',
      'Node.js',
      'GraphQL',
      'Docker',
      'AWS',
      'Kubernetes',
      'Terraform',
    ],
    ...overrides,
  };
}

function reportFor(overrides: Partial<CvAnalysisInput> = {}): CvAnalysisReport {
  const report = analyzeCv(input(overrides), FIXED_NOW);
  assert.ok(report, 'the analysis must produce a report for a readable document');
  return report;
}

function dimension(report: CvAnalysisReport, key: CvDimensionKey) {
  const found = report.dimensions.find((entry) => entry.key === key);
  assert.ok(found, `the report must carry the ${key} dimension`);
  return found;
}

describe('the deterministic CV analysis', () => {
  test('the same document always produces the same report', () => {
    const first = reportFor();
    const second = reportFor();

    assert.deepEqual(first, second, 'two runs over one document must agree exactly');
    assert.equal(first.generatedAt, new Date(FIXED_NOW).toISOString());
  });

  test('a document with no identity and no content is refused rather than scored', () => {
    const report = analyzeCv(
      { cv: WEAK_CV, targetRoleTitle: 'Full-Stack Developer', targetRoleSkills: [] },
      FIXED_NOW
    );

    assert.equal(report, null, 'an unreadable document must not produce a score');
  });

  test('the pipeline reports every stage in the order the catalogue declares', () => {
    const pipeline = runCvAnalysisPipeline(input(), FIXED_NOW);
    const events = [];
    let step = pipeline.next();
    while (!step.done) {
      events.push(step.value);
      step = pipeline.next();
    }

    const completed = events
      .filter((event) => event.status === 'completed')
      .map((event) => event.stage);
    assert.deepEqual(
      completed,
      CV_ANALYSIS_STAGES.map((stage) => stage.id),
      'every stage must complete, and in the catalogue order'
    );

    for (const stage of CV_ANALYSIS_STAGES) {
      const stageEvents = events.filter((event) => event.stage === stage.id);
      assert.equal(stageEvents.length, 2, `${stage.id} must be opened and closed`);
      assert.equal(stageEvents[0].status, 'active');
      assert.equal(stageEvents[1].status, 'completed');
    }

    assert.ok(step.value, 'the pipeline must end with the report');
  });

  test('every dimension is scored 0..100 and carries its evidence', () => {
    const report = reportFor();

    for (const dimension of report.dimensions) {
      if (dimension.score !== null) {
        assert.ok(
          Number.isInteger(dimension.score) && dimension.score >= 0 && dimension.score <= 100,
          `${dimension.key} must be an integer between 0 and 100`
        );
      }
      assert.ok(dimension.summary.length > 0, `${dimension.key} must explain itself`);
      assert.equal(
        dimension.available,
        dimension.score !== null,
        `${dimension.key} must be unavailable exactly when it has no score`
      );
    }
  });
});

describe('the dimensions are measured from the document', () => {
  test('a complete document scores full marks on clarity and ATS structure', () => {
    const report = reportFor();

    assert.equal(dimension(report, 'clarity').score, 100);
    assert.equal(dimension(report, 'ats').score, 100);
  });

  test('a missing contact detail is reported as an ATS failure, not hidden', () => {
    const report = reportFor({
      cv: { ...STRONG_CV, email: '' },
    });

    const ats = dimension(report, 'ats');
    assert.ok((ats.score ?? 100) < 100, 'a CV without an email cannot be a perfect ATS read');
    const findings = report.ats.findings;
    const email = findings.find((finding) => finding.id === 'email');
    assert.equal(email?.status, 'fail');
  });

  test('quantified, action-led bullets beat responsibility bullets', () => {
    const strong = reportFor();
    const weak = reportFor({
      cv: {
        ...STRONG_CV,
        experiences: [
          {
            company: 'Nile Digital',
            role: 'Backend Developer',
            period: '2021 - Present',
            bullets: [
              'Responsible for backend services.',
              'Worked with the team on reporting.',
              'Helped maintain the API.',
            ],
          },
        ],
        projects: [],
      },
    });

    const strongImpact = dimension(strong, 'impact').score ?? 0;
    const weakImpact = dimension(weak, 'impact').score ?? 0;
    assert.ok(
      strongImpact > weakImpact,
      `measured impact (${strongImpact}) must beat unmeasured impact (${weakImpact})`
    );
  });

  test('the skills dimension compares the CV with the target role', () => {
    const report = reportFor();

    const skills = dimension(report, 'skills');
    assert.equal(skills.available, true);
    assert.equal(skills.score, 63, '5 of the 8 target-role skills are on the CV');
    assert.equal(report.skills.present.length, 5);
    assert.equal(report.skills.missing.length, 3);
    assert.ok(report.skills.missing.includes('AWS'));
    assert.ok(report.skills.missing.includes('Kubernetes'));
    assert.ok(
      skills.evidence.some((line) => /3 target-role skill/.test(line)),
      'the dimension must say how many target-role skills are missing'
    );
  });

  test('a target role with no skill set leaves the dimension unavailable, not zero', () => {
    const report = reportFor({ targetRoleSkills: [] });

    const skills = dimension(report, 'skills');
    assert.equal(skills.available, false);
    assert.equal(skills.score, null);
    assert.equal(
      report.overallScore > 0,
      true,
      'an unavailable dimension must not drag the score to zero'
    );
  });

  test('the overall score is the weighted average of the dimensions that exist', () => {
    const report = reportFor();
    const weights: Record<CvDimensionKey, number> = {
      clarity: 0.18,
      impact: 0.2,
      ats: 0.2,
      skills: 0.2,
      experience: 0.17,
      egyptMarketFit: 0.05,
    };

    const scored = report.dimensions.filter(
      (entry) => entry.available && entry.score !== null
    );
    const totalWeight = scored.reduce((total, entry) => total + weights[entry.key], 0);
    const expected = Math.round(
      scored.reduce((total, entry) => total + (entry.score ?? 0) * weights[entry.key], 0) /
        totalWeight
    );

    assert.equal(report.overallScore, expected);
  });

  test('a missing dimension is re-normalised away instead of counted as a zero', () => {
    const withSkills = reportFor();
    const withoutSkills = reportFor({ targetRoleSkills: [] });

    assert.equal(dimension(withoutSkills, 'skills').score, null);
    assert.ok(
      withoutSkills.overallScore >= withSkills.overallScore,
      'dropping a dimension must not lower the score of the ones that remain'
    );
  });
});

describe('the market dimension only reports what was supplied', () => {
  test('no advertisement means no market score and no market claim', () => {
    const report = reportFor();

    const market = dimension(report, 'egyptMarketFit');
    assert.equal(market.available, false);
    assert.equal(market.score, null);
    assert.equal(report.marketFit.score, null);
    assert.equal(report.marketFit.source, 'none');
    assert.equal(report.marketFit.match, null);
    assert.ok(
      report.marketFit.evidence.some((line) => /job description/i.test(line)),
      'the report must say that market fit needs a job description'
    );
  });

  test('a supplied advertisement is matched against the CV evidence', () => {
    const report = reportFor({ jobDescription: ADVERTISEMENT });

    const market = dimension(report, 'egyptMarketFit');
    assert.equal(market.available, true);
    assert.ok((market.score ?? 0) > 0, 'a CV that matches the role must score above zero');
    assert.equal(report.marketFit.source, 'job_description');
    assert.ok(report.marketFit.match, 'the match report must be carried through');
    assert.ok(report.marketFit.match!.matched.length > 0);
  });

  test('the number in a requirement survives the reading of the advertisement', () => {
    const report = reportFor({ jobDescription: ADVERTISEMENT });

    const requirements = [
      ...(report.marketFit.match?.matched ?? []),
      ...(report.marketFit.match?.missing ?? []),
    ].map((entry) => entry.requirement);

    assert.ok(
      requirements.some((requirement) => requirement.includes('3+ years')),
      'a requirement must keep the number it states'
    );
    assert.ok(
      !requirements.some((requirement) => /^[-+]?\s*years of experience/.test(requirement)),
      'the leading number of a requirement must not be stripped away'
    );
  });

  test("the employer's own section heading is not counted as a requirement", () => {
    const report = reportFor({ jobDescription: ADVERTISEMENT });

    const requirements = [
      ...(report.marketFit.match?.matched ?? []),
      ...(report.marketFit.match?.missing ?? []),
    ].map((entry) => entry.requirement.trim().toLowerCase());

    assert.ok(
      !requirements.includes('requirements:'),
      'a heading introduces the requirements; it is not one of them'
    );
  });
});

describe('the report maps onto the shape the platform already stores', () => {
  test('the legacy analysis satisfies the stored ATS analysis contract', () => {
    const report = reportFor();
    const legacy: ATSAnalysis = toLegacyAtsAnalysis(report);

    assert.equal(legacy.overallScore, report.overallScore);
    assert.equal(typeof legacy.breakdown.keywordsMatch, 'number');
    assert.equal(typeof legacy.breakdown.impactAndMetrics, 'number');
    assert.equal(typeof legacy.breakdown.formattingStructure, 'number');
    assert.equal(typeof legacy.breakdown.experienceRelevance, 'number');
    assert.ok(Array.isArray(legacy.matchedKeywords));
    assert.ok(Array.isArray(legacy.missingKeywords));
    assert.ok(Array.isArray(legacy.actionableImprovements));

    for (const improvement of legacy.actionableImprovements) {
      assert.equal(typeof improvement.section, 'string');
      assert.equal(typeof improvement.suggestedText, 'string');
      assert.equal(typeof improvement.reason, 'string');
    }
  });

  test('the legacy breakdown carries the measured dimensions', () => {
    const report = reportFor();
    const legacy = toLegacyAtsAnalysis(report);

    assert.equal(legacy.breakdown.keywordsMatch, dimension(report, 'skills').score);
    assert.equal(legacy.breakdown.impactAndMetrics, dimension(report, 'impact').score);
    assert.equal(legacy.breakdown.formattingStructure, dimension(report, 'ats').score);
    assert.equal(legacy.breakdown.experienceRelevance, dimension(report, 'experience').score);
  });

  test('the action plan is prioritised and never empty', () => {
    const report = reportFor();

    assert.ok(report.actionPlan.length > 0, 'a report must always carry a next step');
    const order = { now: 0, next: 1, later: 2 };
    for (let index = 1; index < report.actionPlan.length; index += 1) {
      assert.ok(
        order[report.actionPlan[index - 1].priority] <= order[report.actionPlan[index].priority],
        'the plan must be ordered by priority'
      );
    }
    for (const item of report.actionPlan) {
      assert.ok(item.title.length > 0);
      assert.ok(item.why.length > 0);
      assert.ok(item.how.length > 0);
    }
  });

  test('the report names its strengths and its weaknesses', () => {
    const report = reportFor();

    assert.ok(report.strengths.length > 0);
    assert.ok(report.weaknesses.length > 0);
    assert.ok(report.summary.includes(String(report.overallScore)));
    assert.ok(report.summary.includes('Full-Stack Developer'));
  });
});

describe('the score bands and the freshness rule', () => {
  test('the bands are the ones the whole platform agrees on', () => {
    assert.equal(CV_SCORE_BANDS.length, 3);
    assert.equal(scoreBand(85), 'excellent');
    assert.equal(scoreBand(80), 'excellent');
    assert.equal(scoreBand(79), 'good');
    assert.equal(scoreBand(60), 'good');
    assert.equal(scoreBand(59), 'needs_improvement');
    assert.equal(scoreBand(0), 'needs_improvement');
  });

  test('a report is fresh for thirty days and stale afterwards', () => {
    const report = reportFor();

    assert.equal(isCvAnalysisFresh(report, FIXED_NOW), true);
    assert.equal(isCvAnalysisFresh(report, FIXED_NOW + 29 * 24 * 60 * 60 * 1000), true);
    assert.equal(isCvAnalysisFresh(report, FIXED_NOW + 31 * 24 * 60 * 60 * 1000), false);
  });
});

describe('the server measures a CV the way the platform holds it', () => {
  test('the target role skills come from the catalogue the platform owns', () => {
    const names = catalogueSkillNames('Full-Stack Engineer');

    assert.ok(names.length > 0, 'a catalogue role must carry its skills');
    assert.ok(names.some((name) => /react/i.test(name)));
  });

  test('a role the catalogue does not know has no skill set of its own', () => {
    assert.deepEqual(catalogueSkillNames('Astrologer of the Pharaohs'), []);
  });

  test('the catalogue is the comparison, not a list sent with the request', () => {
    const report = measureCv({
      cv: STRONG_CV,
      targetRoleTitle: 'Full-Stack Engineer',
      targetRoleSkills: ['React'],
      now: FIXED_NOW,
    });

    assert.ok(report);
    const skills = report.dimensions.find((entry) => entry.key === 'skills');
    assert.equal(skills?.available, true);
    assert.equal(
      report.skills.present.length + report.skills.missing.length,
      catalogueSkillNames('Full-Stack Engineer').length,
      'the whole catalogue skill set is compared, not the one the caller sent'
    );
  });

  test('a document that cannot be read is refused rather than scored', () => {
    assert.equal(
      measureCv({ cv: WEAK_CV, targetRoleTitle: 'Full-Stack Engineer', now: FIXED_NOW }),
      null
    );
  });
});
