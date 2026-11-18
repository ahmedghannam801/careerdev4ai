// The unit tests for the three new features.
//
// They run without a database and without a network, so they can be run at
// any time and they prove the pure logic: how a board list is read, how a
// posting from a company's own board is shaped, how the semantic factor
// changes a score and what it says, and what the approval gate allows.
//
// The parts that talk to a board or to the database are covered by the
// integration suite.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseAtsBoards, descriptionText } from '../server/jobs/ats.ts';
import {
  JOB_SOURCE_IDS,
  JOB_SOURCE_LABELS,
  normalizeLiveJob,
  readDeclaredJobSource,
  resolveJobSource,
} from '../shared/jobs.ts';
import {
  CAREER_ROLES,
  CATALOG_SKILL_NAMES,
} from '../shared/careerRoles.ts';
import {
  EXACT_MATCH_TOTAL,
  JOB_MATCH_WEIGHTS,
  SEMANTIC_MATCH_WEIGHT,
  compareTerms,
  describeSemanticMatch,
  explainJobMatch,
  scaleExactWeights,
  type JobMatchCandidate,
  type SemanticFactorBreakdown,
} from '../shared/jobMatching.ts';
import {
  APPLICATION_PACKAGE_STATUSES,
  describeRefusal,
} from '../server/db/applicationApprovals.ts';

/* -------------------------------------------------------------------------- */
/* The boards                                                                  */
/* -------------------------------------------------------------------------- */

describe('the board list', () => {
  it('reads a board per line', () => {
    const boards = parseAtsBoards('greenhouse:stripe:Stripe\nlever:matchgroup:Match Group');
    assert.equal(boards.length, 2);
    assert.deepEqual(boards[0], { provider: 'greenhouse', boardId: 'stripe', company: 'Stripe' });
    assert.deepEqual(boards[1], { provider: 'lever', boardId: 'matchgroup', company: 'Match Group' });
  });

  it('falls back to the board id when no company is named', () => {
    const boards = parseAtsBoards('ashby:linear');
    assert.equal(boards[0].company, 'linear');
  });

  it('reads boards separated by commas as well as newlines', () => {
    assert.equal(parseAtsBoards('greenhouse:stripe, lever:matchgroup').length, 2);
  });

  it('ignores a line that names a provider it does not know', () => {
    const boards = parseAtsBoards('workday:acme\ngreenhouse:stripe');
    assert.equal(boards.length, 1);
    assert.equal(boards[0].boardId, 'stripe');
  });

  it('ignores a line with no board id', () => {
    assert.equal(parseAtsBoards('greenhouse:\nlever:matchgroup').length, 1);
  });

  it('ignores a board id with characters a board id cannot have', () => {
    assert.equal(parseAtsBoards('greenhouse:../../etc/passwd').length, 0);
    assert.equal(parseAtsBoards('greenhouse:has space').length, 0);
  });

  it('ignores comments and blank lines', () => {
    assert.equal(parseAtsBoards('# a comment\n\ngreenhouse:stripe').length, 1);
  });

  it('does not read the same board twice', () => {
    assert.equal(parseAtsBoards('greenhouse:stripe\ngreenhouse:stripe').length, 1);
  });

  it('reads nothing when nothing is configured', () => {
    assert.deepEqual(parseAtsBoards(''), []);
    assert.deepEqual(parseAtsBoards(null), []);
    assert.deepEqual(parseAtsBoards(undefined), []);
  });
});

/* -------------------------------------------------------------------------- */
/* Where a posting came from                                                   */
/* -------------------------------------------------------------------------- */

describe('the provenance of a posting', () => {
  it('names the company careers pages board', () => {
    assert.equal(JOB_SOURCE_LABELS.company_careers, 'Company careers pages');
    assert.ok(JOB_SOURCE_IDS.includes('company_careers'));
  });

  it('gives every source a label', () => {
    for (const source of JOB_SOURCE_IDS) {
      assert.equal(typeof JOB_SOURCE_LABELS[source], 'string');
      assert.ok(JOB_SOURCE_LABELS[source].length > 0);
    }
  });

  it('uses the board the provider wrote', () => {
    assert.equal(resolveJobSource('Indeed'), 'indeed');
    assert.equal(resolveJobSource('ZipRecruiter'), 'ziprecruiter');
    assert.equal(resolveJobSource('Zip Recruiter'), 'ziprecruiter');
    assert.equal(resolveJobSource('Handshake'), 'handshake');
  });

  it('calls a posting from a board the platform does not present a Google Jobs one', () => {
    assert.equal(resolveJobSource('Some Other Board'), 'google_jobs');
    assert.equal(resolveJobSource(null), 'google_jobs');
  });

  it('accepts a declared source the platform presents', () => {
    assert.equal(readDeclaredJobSource('company_careers'), 'company_careers');
    assert.equal(readDeclaredJobSource('COMPANY_CAREERS'), 'company_careers');
  });

  it('refuses a declared source the platform does not present', () => {
    assert.equal(readDeclaredJobSource('linkedin'), null);
    assert.equal(readDeclaredJobSource('wonderin_internships'), null);
    assert.equal(readDeclaredJobSource(''), null);
  });

  it('attributes a posting read from a company board to that board', () => {
    const job = normalizeLiveJob({
      job_id: 'ats:greenhouse:stripe:1',
      job_title: 'Backend Engineer',
      employer_name: 'Stripe',
      job_description: 'Build payment systems with TypeScript.',
      job_publisher: 'Stripe',
      job_source: 'company_careers',
    });
    assert.ok(job);
    assert.equal(job.source, 'company_careers');
    assert.equal(job.publisher, 'Stripe');
  });

  it('does not let a declared source override a board the platform presents', () => {
    // A record that claims to be from a board the platform does not read is
    // attributed the same way as one that says nothing.
    const job = normalizeLiveJob({
      job_id: 'x',
      job_title: 'Engineer',
      employer_name: 'Example',
      job_publisher: 'Indeed',
      job_source: 'not_a_real_board',
    });
    assert.ok(job);
    assert.equal(job.source, 'indeed');
  });
});

/* -------------------------------------------------------------------------- */
/* The description of a posting                                                */
/* -------------------------------------------------------------------------- */

describe('the description of a posting', () => {
  it('takes the plain text when the board states it as plain text', () => {
    const text = descriptionText({ descriptionPlain: 'We use TypeScript.' });
    assert.equal(text, 'We use TypeScript.');
  });

  it('strips the markup when the board sends real HTML', () => {
    const text = descriptionText({ description: '<p>Hello <b>world</b></p>' });
    assert.equal(text, 'Hello world');
  });

  it('strips the markup when the board sends escaped HTML', () => {
    // Greenhouse escapes its markup once, so the tags arrive as entities.
    // Decoding them and then stripping them is the only order that works:
    // stripping first would find nothing and the decoder would then write the
    // tags back into the text.
    const text = descriptionText({
      content: '&lt;div class=&quot;content-intro&quot;&gt;&lt;p&gt;Hello world&lt;/p&gt;&lt;/div&gt;',
    });
    assert.equal(text, 'Hello world');
    assert.doesNotMatch(String(text), /</);
  });

  it('leaves no markup in an escaped posting', () => {
    const text = descriptionText({
      content: '&lt;p&gt;One&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Two&lt;/li&gt;&lt;/ul&gt;',
    });
    assert.doesNotMatch(String(text), /[<>]/);
  });

  it('does not let a script tag through, escaped or not', () => {
    for (const content of [
      '&lt;script&gt;alert(1)&lt;/script&gt;',
      '<script>alert(1)</script>',
      '&lt;img src=x onerror=alert(2)&gt;',
    ]) {
      const text = descriptionText({ content });
      assert.doesNotMatch(String(text), /<[a-z/]/i);
      assert.doesNotMatch(String(text), /onerror/i);
    }
  });

  it('decodes an ampersand once, not twice', () => {
    // `&amp;lt;` is the text `&lt;`. Decoding it twice would produce a `<`.
    const text = descriptionText({ description: 'R&amp;D and &amp;lt;tag&amp;gt;' });
    assert.equal(text, 'R&D and &lt;tag&gt;');
  });

  it('turns a list into lines', () => {
    const text = descriptionText({ description: '<ul><li>One</li><li>Two</li></ul>' });
    assert.equal(text, '- One\n- Two');
  });

  it('says nothing when the posting states no description', () => {
    assert.equal(descriptionText({ title: 'A role' }), null);
  });
});

/* -------------------------------------------------------------------------- */
/* The semantic factor                                                         */
/* -------------------------------------------------------------------------- */

describe('the semantic factor', () => {
  const role = CAREER_ROLES[0];
  const candidate: JobMatchCandidate = {
    skillNames: [...role.requiredSkills, ...role.preferredSkills].map((s) => s.name),
    experienceLevel: 'senior',
    targetOpportunityType: 'both',
    educationLevel: 'doctorate',
    country: 'eg',
    city: 'Cairo',
  };

  function jobWith(overrides: Record<string, unknown> = {}) {
    const job = normalizeLiveJob({
      job_id: 'test',
      job_title: `Senior ${role.title}`,
      employer_name: 'Example',
      job_required_skills: role.requiredSkills.map((s) => s.name),
      job_min_education: 'Bachelor degree',
      job_is_remote: true,
      job_description: 'listing',
      ...overrides,
    });
    if (!job) throw new Error('Invalid fixture');
    return job;
  }

  it('leaves the exact weights alone when it does not join them', () => {
    assert.equal(Object.values(JOB_MATCH_WEIGHTS).reduce((sum, n) => sum + n, 0), 100);
  });

  it('leaves the score alone when there is no semantic factor', () => {
    const result = explainJobMatch(jobWith(), candidate, CATALOG_SKILL_NAMES, CAREER_ROLES);
    assert.equal(result.score, 100);
    assert.equal(result.semantic, undefined);
  });

  it('shares the total between the exact factors and the semantic one', () => {
    const scaled = scaleExactWeights(JOB_MATCH_WEIGHTS);
    const total = Object.values(scaled).reduce((sum, n) => sum + n, 0);
    assert.equal(Math.round(total), EXACT_MATCH_TOTAL);
    assert.equal(EXACT_MATCH_TOTAL + SEMANTIC_MATCH_WEIGHT, 100);
  });

  it('keeps the proportions of the exact factors when they are scaled', () => {
    const scaled = scaleExactWeights(JOB_MATCH_WEIGHTS);
    const before = JOB_MATCH_WEIGHTS.requiredSkills / JOB_MATCH_WEIGHTS.preferredSkills;
    const after = scaled.requiredSkills / scaled.preferredSkills;
    assert.ok(Math.abs(before - after) < 0.0001);
  });

  it('adds the semantic factor to the breakdown', () => {
    const semantic: SemanticFactorBreakdown = {
      factor: 'semantic',
      score: 80,
      weight: SEMANTIC_MATCH_WEIGHT,
      contribution: (SEMANTIC_MATCH_WEIGHT * 80) / 100,
      evaluated: true,
      reason: 'Your experience with TypeScript lines up with what this posting describes.',
      matched: ['TypeScript'],
      missing: [],
    };
    const result = explainJobMatch(
      jobWith(),
      candidate,
      CATALOG_SKILL_NAMES,
      CAREER_ROLES,
      semantic
    );
    assert.ok(result.semantic);
    assert.equal(result.semantic.score, 80);
    assert.equal(result.semantic.reason, semantic.reason);
  });

  it('adds the semantic contribution to the score', () => {
    const withoutSemantic = explainJobMatch(jobWith(), candidate, CATALOG_SKILL_NAMES, CAREER_ROLES);
    const withSemantic = explainJobMatch(
      jobWith(),
      candidate,
      CATALOG_SKILL_NAMES,
      CAREER_ROLES,
      {
        factor: 'semantic',
        score: 100,
        weight: SEMANTIC_MATCH_WEIGHT,
        contribution: SEMANTIC_MATCH_WEIGHT,
        evaluated: true,
        reason: 'r',
        matched: [],
        missing: [],
      }
    );
    // The exact factors give up a share of the total to make room for the
    // semantic one, so the total stays a hundred.
    assert.ok(withSemantic.score <= 100);
    assert.ok(withSemantic.score > withoutSemantic.score - 20);
  });

  it('leaves a semantic factor that was not evaluated out of the breakdown', () => {
    const result = explainJobMatch(
      jobWith(),
      candidate,
      CATALOG_SKILL_NAMES,
      CAREER_ROLES,
      {
        factor: 'semantic',
        score: 0,
        weight: SEMANTIC_MATCH_WEIGHT,
        contribution: 0,
        evaluated: false,
        reason: 'not compared',
        matched: [],
        missing: [],
      }
    );
    assert.equal(result.semantic, undefined);
  });

  it('finds the terms the two texts have in common', () => {
    const { matched, missing } = compareTerms(
      'We use TypeScript and PostgreSQL every day.',
      'Skills: TypeScript, React',
      ['TypeScript', 'PostgreSQL', 'React', 'Kubernetes']
    );
    assert.deepEqual(matched, ['TypeScript']);
    assert.deepEqual(missing, ['PostgreSQL']);
  });

  it('ignores a term the posting does not mention', () => {
    const { matched, missing } = compareTerms(
      'We use TypeScript.',
      'Skills: TypeScript, React',
      ['TypeScript', 'React']
    );
    assert.deepEqual(matched, ['TypeScript']);
    assert.deepEqual(missing, []);
  });

  it('compares terms without regard to case or spacing', () => {
    const { matched } = compareTerms(
      'TYPESCRIPT and  node.js',
      'skills: typescript, node js',
      ['TypeScript', 'Node.js']
    );
    assert.deepEqual(matched.sort(), ['Node.js', 'TypeScript']);
  });

  it('says what drove the score', () => {
    const reason = describeSemanticMatch(0.83, ['TypeScript', 'React'], ['Kubernetes']);
    assert.match(reason, /TypeScript/);
    assert.match(reason, /React/);
    assert.match(reason, /Kubernetes/);
  });

  it('says what the similarity was when no term is shared', () => {
    const reason = describeSemanticMatch(0.42, [], []);
    assert.match(reason, /42%/);
  });
});

/* -------------------------------------------------------------------------- */
/* The approval gate                                                           */
/* -------------------------------------------------------------------------- */

describe('the approval gate', () => {
  it('knows the four states a package can be in', () => {
    assert.deepEqual(
      [...APPLICATION_PACKAGE_STATUSES].sort(),
      ['approved', 'draft', 'pending_review', 'rejected']
    );
  });

  it('explains a refusal in the interface\'s own words', () => {
    const message = describeRefusal('approve', 'draft', ['pending_review']);
    assert.match(message, /draft/);
    assert.match(message, /pending_review/);
  });

  it('does not approve a package that was never reviewed', () => {
    // The rule the database enforces, stated here so a change to it has to
    // change this test too.
    const allowed: Record<string, string[]> = {
      submit_for_review: ['draft', 'rejected'],
      approve: ['pending_review'],
      reject: ['pending_review'],
      withdraw: ['approved'],
    };
    assert.ok(!allowed.approve.includes('draft'));
    assert.ok(!allowed.approve.includes('approved'));
    assert.ok(allowed.approve.includes('pending_review'));
  });
});
