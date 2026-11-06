/**
 * The job description flow: what it reads, what it measures, and what it
 * writes.
 *
 * Three things are being protected here.
 *
 * The first is honesty about the score. The ATS score is computed from the
 * candidate's own records, so a requirement their records support must be
 * reported as covered, a requirement they do not have must be reported as
 * missing, and a requirement nobody can verify must not be quietly counted as
 * a match.
 *
 * The second is that the job description is the employer's text. Everything
 * the model "reads" out of it is checked against the pasted text, so a
 * requirement the candidate never pasted cannot appear in the analysis.
 *
 * The third is that the generated CV is written onto the candidate's own
 * document and not around it. A skill they do not have is never written, a
 * skill they do have is never taken off, and a record that is not theirs is
 * never touched.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyAtsCvToDocument,
  buildAtsMatchReport,
  emptyAtsCvContent,
  emptyJobDescriptionAnalysis,
  extractDeterministicJobDescription,
  groundJobDescriptionAnalysis,
  namesMatch,
  parseAtsCvPayload,
  parseJobDescriptionAnalysis,
  tokenizeText,
  validateAtsCvPayload,
  validateJobDescriptionAnalysis,
  type AtsProfileFacts,
  type JobDescriptionAnalysis,
} from '../shared/jobDescription.ts';

import {
  buildAtsCvPrompt,
  buildJobDescriptionPrompt,
} from '../server/cv/jobDescription.ts';

/** A candidate with a real, if small, record. */
const facts: AtsProfileFacts = {
  skills: [
    { name: 'React', level: 4 },
    { name: 'TypeScript', level: 3 },
  ],
  sources: [
    {
      label: 'Frontend Engineer at Acme Corp',
      text: 'Frontend Engineer at Acme Corp. Built React dashboards with TypeScript.',
    },
    {
      label: 'BSc Computer Science at Cairo University',
      text: 'BSc Computer Science. Cairo University.',
    },
  ],
};

const analysis: JobDescriptionAnalysis = {
  jobTitle: 'Frontend Engineer',
  requiredSkills: ['React', 'GraphQL'],
  technicalSkills: ['TypeScript'],
  keywords: ['testing'],
  responsibilities: ['Build accessible user interfaces'],
  experienceRequirements: ['3+ years of experience with React'],
  qualifications: ['Bachelor degree in Computer Science'],
};

describe('the job description contract', () => {
  it('accepts an analysis that satisfies the shape', () => {
    const errors = validateJobDescriptionAnalysis({
      jobTitle: 'Frontend Engineer',
      requiredSkills: ['React'],
      technicalSkills: [],
      keywords: [],
      responsibilities: [],
      experienceRequirements: [],
      qualifications: [],
    });
    assert.deepEqual(errors, []);
  });

  it('rejects a payload that is not an analysis', () => {
    assert.ok(validateJobDescriptionAnalysis(null).length > 0);
    assert.ok(validateJobDescriptionAnalysis('a string').length > 0);
    assert.ok(
      validateJobDescriptionAnalysis({ requiredSkills: 'React' }).length > 0,
      'a list must be a list'
    );
    assert.ok(
      validateJobDescriptionAnalysis({ requiredSkills: [{ nested: true }] }).length > 0,
      'a list must hold strings'
    );
  });

  it('returns null for a payload it cannot trust', () => {
    assert.equal(parseJobDescriptionAnalysis({ requiredSkills: 42 }), null);
    assert.equal(parseJobDescriptionAnalysis(null), null);
  });

  it('drops blanks and duplicates but keeps the employer\'s order', () => {
    const parsed = parseJobDescriptionAnalysis({
      requiredSkills: ['React', 'React', '  ', 'TypeScript'],
    });
    assert.ok(parsed);
    assert.deepEqual(parsed.requiredSkills, ['React', 'TypeScript']);
  });

  it('starts from an empty analysis', () => {
    const empty = emptyJobDescriptionAnalysis();
    assert.equal(empty.jobTitle, null);
    assert.deepEqual(empty.requiredSkills, []);
    // An advertisement that states none of the optional details leaves them
    // empty rather than filled in with a plausible-looking value.
    assert.equal(empty.company, null);
    assert.equal(empty.seniority, null);
    assert.equal(empty.location, null);
    assert.equal(empty.workArrangement, null);
    assert.deepEqual(empty.preferredSkills, []);
    assert.deepEqual(empty.softSkills, []);
    assert.deepEqual(empty.educationRequirements, []);
    assert.deepEqual(empty.certifications, []);
    assert.deepEqual(empty.atsTerms, []);
  });

  it('reads the details an advertisement actually states', () => {
    const parsed = parseJobDescriptionAnalysis({
      jobTitle: 'Senior Frontend Engineer',
      company: 'Acme Corporation',
      requiredSkills: ['React'],
      preferredSkills: ['GraphQL'],
      technicalSkills: ['TypeScript'],
      softSkills: ['Communication'],
      keywords: ['accessibility'],
      responsibilities: ['Build interfaces'],
      experienceRequirements: ['5 years'],
      educationRequirements: ['BSc Computer Science'],
      certifications: ['AWS Certified Developer'],
      qualifications: ['Work permit'],
      seniority: 'Senior',
      location: 'Cairo, Egypt',
      workArrangement: 'Hybrid',
      atsTerms: ['React', 'TypeScript'],
    });

    assert.ok(parsed);
    assert.equal(parsed.company, 'Acme Corporation');
    assert.deepEqual(parsed.preferredSkills, ['GraphQL']);
    assert.deepEqual(parsed.softSkills, ['Communication']);
    assert.deepEqual(parsed.educationRequirements, ['BSc Computer Science']);
    assert.deepEqual(parsed.certifications, ['AWS Certified Developer']);
    assert.equal(parsed.seniority, 'Senior');
    assert.equal(parsed.location, 'Cairo, Egypt');
    assert.equal(parsed.workArrangement, 'Hybrid');
    assert.deepEqual(parsed.atsTerms, ['React', 'TypeScript']);
  });

  it('rejects a single-valued detail that is not a string', () => {
    assert.ok(validateJobDescriptionAnalysis({ company: 42 }).length > 0);
    assert.ok(validateJobDescriptionAnalysis({ workArrangement: ['Remote'] }).length > 0);
    assert.ok(validateJobDescriptionAnalysis({ seniority: { level: 'Senior' } }).length > 0);
  });
});

describe('grounding the analysis against the pasted text', () => {
  const jd = [
    'Frontend Engineer',
    'We are looking for a Frontend Engineer.',
    'Required: React and GraphQL experience.',
    'You will work with TypeScript.',
    '3+ years of experience with React.',
    'Bachelor degree in Computer Science.',
  ].join('\n');

  it('keeps the requirements the candidate actually pasted', () => {
    const grounded = groundJobDescriptionAnalysis(
      {
        ...emptyJobDescriptionAnalysis(),
        jobTitle: 'Frontend Engineer',
        requiredSkills: ['React', 'GraphQL'],
        technicalSkills: ['TypeScript'],
        experienceRequirements: ['3+ years of experience with React'],
        qualifications: ['Bachelor degree in Computer Science'],
      },
      jd
    );

    assert.equal(grounded.jobTitle, 'Frontend Engineer');
    assert.deepEqual(grounded.requiredSkills, ['React', 'GraphQL']);
    assert.deepEqual(grounded.technicalSkills, ['TypeScript']);
    assert.deepEqual(grounded.experienceRequirements, ['3+ years of experience with React']);
    assert.deepEqual(grounded.qualifications, ['Bachelor degree in Computer Science']);
  });

  it('drops a requirement the candidate never pasted', () => {
    const grounded = groundJobDescriptionAnalysis(
      {
        ...emptyJobDescriptionAnalysis(),
        requiredSkills: ['React', 'Rust', 'Elixir', 'Haskell'],
        technicalSkills: ['Kubernetes'],
      },
      jd
    );

    assert.deepEqual(grounded.requiredSkills, ['React']);
    assert.deepEqual(grounded.technicalSkills, []);
  });

  it('drops a job title that is not in the text', () => {
    const grounded = groundJobDescriptionAnalysis(
      { ...emptyJobDescriptionAnalysis(), jobTitle: 'Chief Happiness Officer' },
      jd
    );
    assert.equal(grounded.jobTitle, null);
  });

  it('keeps the stated details and never invents the ones the text lacks', () => {
    const text = [
      'Senior Frontend Engineer',
      'Company: Acme',
      'Location: Cairo, Egypt',
      'Hybrid role, with React and teamwork.',
      'Bachelor degree in Computer Science.',
      'AWS Certified Developer.',
    ].join('\n');

    const grounded = groundJobDescriptionAnalysis(
      {
        ...emptyJobDescriptionAnalysis(),
        jobTitle: 'Senior Frontend Engineer',
        company: 'Acme Corporation',
        seniority: 'Senior',
        location: 'Cairo, Egypt',
        workArrangement: 'Hybrid',
        requiredSkills: ['React'],
        softSkills: ['Teamwork'],
        educationRequirements: ['Bachelor degree in Computer Science'],
        certifications: ['AWS Certified Developer'],
        atsTerms: ['React'],
        // None of these are in the pasted text.
        preferredSkills: ['Rust'],
        keywords: ['Kubernetes'],
      },
      text
    );

    assert.equal(grounded.company, 'Acme Corporation', 'a named employer survives');
    assert.equal(grounded.seniority, 'Senior');
    assert.equal(grounded.location, 'Cairo, Egypt');
    assert.equal(grounded.workArrangement, 'Hybrid');
    assert.deepEqual(grounded.softSkills, ['Teamwork']);
    assert.deepEqual(grounded.educationRequirements, ['Bachelor degree in Computer Science']);
    assert.deepEqual(grounded.certifications, ['AWS Certified Developer']);
    assert.deepEqual(grounded.atsTerms, ['React']);
    assert.deepEqual(grounded.preferredSkills, []);
    assert.deepEqual(grounded.keywords, []);
  });

  it('drops a company, a place or an arrangement the text does not name', () => {
    const grounded = groundJobDescriptionAnalysis(
      {
        ...emptyJobDescriptionAnalysis(),
        company: 'Globex',
        location: 'Berlin, Germany',
        seniority: 'Principal',
        workArrangement: 'On-site',
      },
      jd
    );

    assert.equal(grounded.company, null);
    assert.equal(grounded.location, null);
    assert.equal(grounded.seniority, null);
    assert.equal(grounded.workArrangement, null);
  });
});

describe('the ATS match', () => {
  it('reports a requirement the candidate has as covered', () => {
    const report = buildAtsMatchReport(analysis, facts);
    const react = report.matched.find((item) => item.requirement === 'React');
    assert.ok(react, 'React is in the candidate\'s record');
    assert.equal(react.matched, true);
    assert.ok(react.evidence, 'the evidence names the record that supports it');
    assert.match(react.evidence ?? '', /React/);
  });

  it('reports a requirement the candidate does not have as missing', () => {
    const report = buildAtsMatchReport(analysis, facts);
    const graphql = report.missing.find((item) => item.requirement === 'GraphQL');
    assert.ok(graphql, 'GraphQL is nowhere in the record');
    assert.equal(graphql.matched, false);
    assert.equal(graphql.evidence, null);
  });

  it('names every covered and every missing requirement exactly once', () => {
    const report = buildAtsMatchReport(analysis, facts);
    const covered = report.matched.map((item) => item.requirement).sort();
    const missing = report.missing.map((item) => item.requirement).sort();

    assert.deepEqual(covered, ['3+ years of experience with React', 'Bachelor degree in Computer Science', 'React', 'TypeScript']);
    assert.deepEqual(missing, ['Build accessible user interfaces', 'GraphQL', 'testing']);
  });

  it('scores between zero and a hundred', () => {
    const report = buildAtsMatchReport(analysis, facts);
    assert.ok(report.score >= 0 && report.score <= 100);
  });

  it('scores an empty job description as zero rather than guessing', () => {
    const report = buildAtsMatchReport(emptyJobDescriptionAnalysis(), facts);
    assert.equal(report.score, 0);
    assert.equal(report.matched.length, 0);
    assert.equal(report.missing.length, 0);
    assert.ok(report.explanation.length > 0, 'the empty case is still explained');
  });

  it('scores a perfect record at a hundred', () => {
    const report = buildAtsMatchReport(
      {
        ...emptyJobDescriptionAnalysis(),
        requiredSkills: ['React', 'TypeScript'],
      },
      facts
    );
    assert.equal(report.score, 100);
  });

  it('counts a preferred skill and the other stated details', () => {
    const report = buildAtsMatchReport(
      {
        ...emptyJobDescriptionAnalysis(),
        preferredSkills: ['React'],
        softSkills: ['Communication'],
        educationRequirements: ['BSc Computer Science'],
        certifications: ['AWS Certified Developer'],
      },
      {
        skills: [{ name: 'React', level: 4 }],
        sources: [
          {
            label: 'BSc Computer Science',
            text: 'BSc Computer Science. Communication. AWS Certified Developer.',
          },
        ],
      }
    );

    assert.ok(report.matched.some((item) => item.requirement === 'React'));
    assert.ok(report.missing.some((item) => item.requirement === 'Communication') === false);
    assert.ok(report.matched.some((item) => item.requirement === 'BSc Computer Science'));
    assert.ok(report.matched.some((item) => item.requirement === 'AWS Certified Developer'));
  });

  it('counts a term the advertisement repeats only once', () => {
    const report = buildAtsMatchReport(
      {
        ...emptyJobDescriptionAnalysis(),
        requiredSkills: ['React'],
        technicalSkills: ['React'],
        atsTerms: ['React'],
        keywords: ['React'],
      },
      facts
    );

    assert.equal(report.matched.length, 1);
    assert.equal(report.missing.length, 0);
    assert.equal(report.score, 100);
  });

  it('raises the score when the candidate covers more', () => {
    const before = buildAtsMatchReport(analysis, facts).score;
    const after = buildAtsMatchReport(analysis, {
      ...facts,
      // GraphQL is in the advertisement and missing from the record before
      // this point. Covering it has to help.
      skills: [...facts.skills, { name: 'GraphQL', level: 4 }],
    }).score;
    assert.ok(after > before, 'covering GraphQL too would have to help');
  });

  it('lists the keywords that matched and the ones that did not', () => {
    const report = buildAtsMatchReport(analysis, facts);
    assert.deepEqual(report.matchedKeywords, ['React', 'TypeScript']);
    assert.deepEqual(report.missingKeywords, ['GraphQL', 'testing']);
  });

  it('explains the score in words, and names what is missing', () => {
    const report = buildAtsMatchReport(analysis, facts);
    assert.match(report.explanation, /GraphQL/);
    assert.match(report.explanation, /requirements/i);
  });

  it('explains the score in Arabic when Arabic is asked for', () => {
    const report = buildAtsMatchReport(analysis, facts, { language: 'ar' });
    assert.match(report.explanation, /سجلاتك/);
    assert.match(report.explanation, /GraphQL/);
  });

  it('does not credit a requirement it cannot verify', () => {
    // "Excellent communication" is made only of words the platform cannot
    // check, so it must not be reported as covered on a guess.
    const report = buildAtsMatchReport(
      {
        ...emptyJobDescriptionAnalysis(),
        responsibilities: ['Excellent communication'],
      },
      facts
    );
    assert.equal(report.matched.length, 0);
    assert.equal(report.missing.length, 1);
  });

  it('reads an Arabic job description and an Arabic record', () => {
    const arabicFacts: AtsProfileFacts = {
      skills: [{ name: 'React', level: 4 }],
      sources: [{ label: 'مهندس واجهات', text: 'بنيت لوحات تحكم باستخدام React و TypeScript.' }],
    };
    const arabicAnalysis: JobDescriptionAnalysis = {
      ...emptyJobDescriptionAnalysis(),
      jobTitle: 'مهندس واجهات أمامية',
      requiredSkills: ['React'],
      technicalSkills: ['TypeScript'],
      keywords: ['اختبار'],
    };

    const report = buildAtsMatchReport(arabicAnalysis, arabicFacts, { language: 'ar' });

    assert.equal(report.matched.length, 2, 'React and TypeScript are both in the record');
    assert.equal(report.missing.length, 1, 'the Arabic keyword is not');
    assert.match(report.explanation, /سجلاتك/);
  });
});

describe('matching names', () => {
  it('matches the same capability written differently', () => {
    assert.equal(namesMatch('React', 'React'), true);
    assert.equal(namesMatch('CI/CD', 'Continuous Integration'), true);
    assert.equal(namesMatch('Node.js', 'Node'), true);
  });

  it('does not match two unrelated things', () => {
    assert.equal(namesMatch('React', 'Kubernetes'), false);
    assert.equal(namesMatch('Python', 'Java'), false);
  });

  it('tokenises Arabic as words rather than as nothing', () => {
    const tokens = tokenizeText('مهندس برمجيات React');
    assert.ok(tokens.includes('مهندس'));
    assert.ok(tokens.includes('برمجيات'));
    assert.ok(tokens.includes('react'));
  });
});

describe('the generated CV contract', () => {
  it('accepts a payload that satisfies the shape', () => {
    const errors = validateAtsCvPayload({
      headline: 'Frontend Engineer',
      summary: 'A summary.',
      experiences: [{ id: 'e1', bullets: ['A bullet'] }],
      projects: [{ id: 'p1', bullets: ['A bullet'], description: 'A description.' }],
      skills: ['React'],
      keywordsUsed: ['React'],
    });
    assert.deepEqual(errors, []);
  });

  it('rejects a payload that does not satisfy the shape', () => {
    assert.ok(validateAtsCvPayload(null).length > 0);
    assert.ok(validateAtsCvPayload({ headline: 42 }).length > 0);
    assert.ok(validateAtsCvPayload({ experiences: 'none' }).length > 0);
    assert.ok(validateAtsCvPayload({ experiences: [{ bullets: [] }] }).length > 0);
    assert.ok(validateAtsCvPayload({ skills: [{}] }).length > 0);
  });

  it('returns null for a payload it cannot trust', () => {
    assert.equal(parseAtsCvPayload({ experiences: [{ id: 1 }] }), null);
  });

  it('starts from an empty CV', () => {
    const empty = emptyAtsCvContent();
    assert.equal(empty.headline, null);
    assert.deepEqual(empty.experiences, []);
  });
});

describe('applying the generated CV to the candidate\'s document', () => {
  const document = {
    title: 'Software Engineer',
    summary: 'My own summary.',
    experiences: [
      {
        id: 'e1',
        company: 'Acme Corp',
        role: 'Frontend Engineer',
        period: '2022 — now',
        location: 'Remote',
        bullets: ['My own bullet'],
      },
    ],
    projects: [
      {
        id: 'p1',
        title: 'Dashboard tool',
        role: 'Builder',
        technologies: ['React'],
        bullets: ['My own project bullet'],
      },
    ],
    skillsList: ['React', 'TypeScript', 'CSS'],
  };

  const generated = {
    headline: 'Frontend Engineer',
    summary: 'A summary written for this job.',
    experiences: [
      { id: 'e1', bullets: ['A rewritten bullet'] },
      { id: 'not-my-record', bullets: ['Should never appear'] },
    ],
    projects: [
      { id: 'p1', bullets: ['A rewritten project bullet'], description: 'A description.' },
    ],
    skills: ['TypeScript', 'GraphQL'],
    keywordsUsed: ['React'],
    removedClaims: [],
  };

  it('writes the headline and the summary', () => {
    const next = applyAtsCvToDocument(document, generated);
    assert.equal(next.title, 'Frontend Engineer');
    assert.equal(next.summary, 'A summary written for this job.');
  });

  it('rewrites only the bullets it was given', () => {
    const next = applyAtsCvToDocument(document, generated);
    assert.deepEqual(next.experiences[0].bullets, ['A rewritten bullet']);
  });

  it('keeps every field the candidate\'s document already had', () => {
    const next = applyAtsCvToDocument(document, generated);
    assert.equal(next.experiences[0].company, 'Acme Corp');
    assert.equal(next.experiences[0].role, 'Frontend Engineer');
    assert.equal(next.experiences[0].period, '2022 — now');
    assert.equal(next.experiences[0].location, 'Remote');
    assert.equal(next.projects[0].title, 'Dashboard tool');
    assert.equal(next.projects[0].technologies.length, 1);
  });

  it('ignores a record id that is not the candidate\'s', () => {
    const next = applyAtsCvToDocument(document, generated);
    assert.equal(next.experiences.length, 1);
    assert.ok(
      !next.experiences.some((entry) => entry.id === 'not-my-record'),
      'a record the candidate does not have must not be created'
    );
  });

  it('never writes a skill the candidate does not have', () => {
    const next = applyAtsCvToDocument(document, generated);
    assert.ok(
      !next.skillsList.includes('GraphQL'),
      'GraphQL is in the job description but not in the candidate\'s record'
    );
  });

  it('reorders the skills without dropping any of them', () => {
    const next = applyAtsCvToDocument(document, generated);
    assert.deepEqual(next.skillsList, ['TypeScript', 'React', 'CSS']);
    assert.equal(next.skillsList.length, document.skillsList.length);
  });

  it('keeps the candidate\'s own bullets when the generator had none', () => {
    const next = applyAtsCvToDocument(document, {
      ...generated,
      experiences: [],
    });
    assert.deepEqual(next.experiences[0].bullets, ['My own bullet']);
  });

  it('keeps the candidate\'s own text when the generator wrote none', () => {
    const next = applyAtsCvToDocument(document, {
      ...generated,
      headline: null,
      summary: null,
    });
    assert.equal(next.title, 'Software Engineer');
    assert.equal(next.summary, 'My own summary.');
  });

  it('does not change the document it was given', () => {
    const before = JSON.stringify(document);
    applyAtsCvToDocument(document, generated);
    assert.equal(JSON.stringify(document), before, 'the original document is untouched');
  });
});

describe('reading a job description without a model', () => {
  it('finds the requirements in the advertisement\'s own bullets', () => {
    const analysis = extractDeterministicJobDescription(
      [
        'Frontend Engineer',
        'Required: strong knowledge of React and GraphQL',
        'Our stack: TypeScript, React and Vite',
        'You will build accessible user interfaces',
        '3+ years of experience with React',
        'Bachelor degree in Computer Science',
      ].join('\n')
    );

    assert.equal(analysis.jobTitle, 'Frontend Engineer');
    assert.ok(analysis.requiredSkills.length > 0);
    assert.ok(analysis.technicalSkills.length > 0);
    assert.ok(analysis.responsibilities.length > 0);
    assert.ok(analysis.experienceRequirements.length > 0);
    assert.ok(analysis.educationRequirements!.length > 0);
  });

  it('keeps the number a requirement states', () => {
    const analysis = extractDeterministicJobDescription(
      [
        'Frontend Engineer',
        '- 3+ years of experience with React',
        'Requirements:',
        '- 5+ years of experience shipping web applications',
      ].join('\n')
    );

    assert.deepEqual(analysis.experienceRequirements, [
      '3+ years of experience with React',
      '5+ years of experience shipping web applications',
    ]);
  });

  it('does not read a section heading as a requirement', () => {
    const analysis = extractDeterministicJobDescription(
      ['Frontend Engineer', 'Requirements:', '- React and TypeScript'].join('\n')
    );

    // The heading introduces the lines that follow it. Counting it as a
    // requirement would charge the candidate for the employer's formatting.
    const everything = [
      ...analysis.requiredSkills,
      ...analysis.preferredSkills!,
      ...analysis.technicalSkills,
      ...analysis.keywords,
      ...analysis.responsibilities,
      ...analysis.experienceRequirements,
    ];
    assert.ok(!everything.includes('Requirements:'));
    assert.ok(everything.includes('React and TypeScript'));
  });

  it('reads the stated company, place, seniority and arrangement', () => {
    const analysis = extractDeterministicJobDescription(
      [
        'Senior Frontend Engineer',
        'Company: Acme Corporation',
        'Location: Cairo, Egypt',
        'Work arrangement: Hybrid',
        '- React and TypeScript are required.',
        '- GraphQL experience is preferred.',
        '- Excellent communication skills.',
        '- Bachelor degree in Computer Science.',
        '- AWS Certified Developer.',
        '- You will build accessible user interfaces.',
      ].join('\n')
    );

    assert.equal(analysis.company, 'Acme Corporation');
    assert.equal(analysis.location, 'Cairo, Egypt');
    assert.equal(analysis.workArrangement, 'Hybrid');
    assert.equal(analysis.seniority, 'Senior');
    assert.deepEqual(analysis.preferredSkills, ['GraphQL experience is preferred.']);
    assert.deepEqual(analysis.softSkills, ['Excellent communication skills.']);
    assert.deepEqual(analysis.educationRequirements, ['Bachelor degree in Computer Science.']);
    assert.deepEqual(analysis.certifications, ['AWS Certified Developer.']);
    // The deterministic reader cannot identify an ATS filter term on its own,
    // so it reports none rather than presenting its own guess as extraction.
    assert.deepEqual(analysis.atsTerms, []);
  });

  it('leaves the details empty when the advertisement states none', () => {
    const analysis = extractDeterministicJobDescription('Frontend Engineer\nReact required.');
    assert.equal(analysis.company, null);
    assert.equal(analysis.location, null);
    assert.equal(analysis.seniority, null);
    assert.equal(analysis.workArrangement, null);
    assert.deepEqual(analysis.atsTerms, []);
  });

  it('returns an empty analysis for an empty advertisement', () => {
    const analysis = extractDeterministicJobDescription('');
    assert.equal(analysis.jobTitle, null);
    assert.equal(analysis.requiredSkills.length, 0);
  });
});

describe('the prompts', () => {
  it('asks for every field and says not to invent any', () => {
    const prompt = buildJobDescriptionPrompt('Some job description text.', { language: 'ar' });
    for (const field of [
      'jobTitle',
      'company',
      'requiredSkills',
      'preferredSkills',
      'technicalSkills',
      'softSkills',
      'keywords',
      'responsibilities',
      'experienceRequirements',
      'educationRequirements',
      'certifications',
      'qualifications',
      'seniority',
      'location',
      'workArrangement',
      'atsTerms',
    ]) {
      assert.match(prompt, new RegExp(field), `the prompt asks for ${field}`);
    }
    assert.match(prompt, /Do not add a requirement it does not state/);
    assert.match(prompt, /Never guess a company/);
    assert.match(prompt, /Arabic/);
  });

  it('tells the model which requirements the record supports', () => {
    const report = buildAtsMatchReport(analysis, facts);
    const prompt = buildAtsCvPrompt({
      analysis,
      match: report,
      careerContextBlock: 'The candidate\'s record.',
      experienceBlock: 'id: e1',
      projectBlock: '',
      documentBlock: '',
    });

    assert.match(prompt, /React/);
    assert.match(prompt, /NOT supported by the candidate/);
    assert.match(prompt, /Never invent a company/);
    assert.match(prompt, /GROUNDING RULES/);
  });
});
