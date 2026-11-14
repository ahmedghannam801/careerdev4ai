/**
 * Behavioural checks for the CV projection.
 *
 * The document the CV studio works with is a projection of the platform's
 * records. That is the whole claim these tests protect:
 *
 *   a record changes -> the document changes, with nobody pressing a button;
 *   the candidate's own words survive the change;
 *   a record that is deleted leaves the document;
 *   the skills on a CV are the skills the candidate owns, and never the
 *   requirements of a target role.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isCanonicalRecordId,
  mergeCanonicalCvDocument,
} from '../shared/cvProjection.ts';
import type { CvSourceData } from '../shared/cvDocument.ts';
import type { CVProfile } from '../src/types/career.ts';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';

function emptyDocument(): CVProfile {
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
    skillsList: [],
    certifications: [],
  };
}

function source(overrides: Partial<CvSourceData> = {}): CvSourceData {
  return {
    profile: {
      fullName: 'Amal Said',
      email: 'amal@example.com',
      phone: '+20 100 000 0000',
      location: 'Cairo, Egypt',
      title: 'Frontend Engineer',
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

describe('canonical record ids', () => {
  it('recognises a stored record', () => {
    assert.equal(isCanonicalRecordId(UUID_A), true);
  });

  it('does not mistake an imported id for a stored record', () => {
    assert.equal(isCanonicalRecordId('exp-1'), false);
    assert.equal(isCanonicalRecordId('edu-2'), false);
    assert.equal(isCanonicalRecordId(''), false);
    assert.equal(isCanonicalRecordId(null), false);
    assert.equal(isCanonicalRecordId(undefined), false);
  });
});

describe('profile -> CV', () => {
  it('carries the header across', () => {
    const document = mergeCanonicalCvDocument(source(), emptyDocument());
    assert.equal(document.fullName, 'Amal Said');
    assert.equal(document.email, 'amal@example.com');
    assert.equal(document.phone, '+20 100 000 0000');
    assert.equal(document.location, 'Cairo, Egypt');
    assert.equal(document.title, 'Frontend Engineer');
  });

  it('reflects a change to the profile without anyone asking', () => {
    const first = mergeCanonicalCvDocument(source(), emptyDocument());
    assert.equal(first.fullName, 'Amal Said');

    const renamed = mergeCanonicalCvDocument(
      source({ profile: { fullName: 'Amal Mahmoud', email: 'amal@example.com' } }),
      first
    );
    assert.equal(renamed.fullName, 'Amal Mahmoud', 'the document must follow the profile');
  });

  it('keeps the summary the candidate wrote', () => {
    const written = { ...emptyDocument(), summary: 'I build interfaces that people can use.' };
    const document = mergeCanonicalCvDocument(
      source({ profile: { fullName: 'Amal Said', summary: 'A summary from the profile.' } }),
      written
    );
    assert.equal(document.summary, 'I build interfaces that people can use.');
  });
});

describe('experience -> CV', () => {
  const experience = {
    id: UUID_A,
    role: 'Senior Frontend Engineer',
    company: 'Nile Software',
    location: 'Cairo',
    startDate: '2019-10-01',
    endDate: '2023-06-30',
    isCurrent: false,
    description: 'Built the design system.',
  };

  it('shows a newly created experience', () => {
    const document = mergeCanonicalCvDocument(
      source({ experiences: [experience] }),
      emptyDocument()
    );
    assert.equal(document.experiences.length, 1);
    assert.equal(document.experiences[0].company, 'Nile Software');
    assert.equal(document.experiences[0].role, 'Senior Frontend Engineer');
    assert.equal(document.experiences[0].period, 'Oct 2019 – Jun 2023');
    assert.deepEqual(document.experiences[0].bullets, ['Built the design system.']);
  });

  it('reflects an edited experience', () => {
    const first = mergeCanonicalCvDocument(
      source({ experiences: [experience] }),
      emptyDocument()
    );
    const second = mergeCanonicalCvDocument(
      source({
        experiences: [{ ...experience, role: 'Staff Frontend Engineer', endDate: '2024-01-31' }],
      }),
      first
    );
    assert.equal(second.experiences[0].role, 'Staff Frontend Engineer');
    assert.equal(second.experiences[0].period, 'Oct 2019 – Jan 2024');
  });

  it('removes a deleted experience', () => {
    const first = mergeCanonicalCvDocument(
      source({ experiences: [experience] }),
      emptyDocument()
    );
    const second = mergeCanonicalCvDocument(source({ experiences: [] }), first);
    assert.equal(second.experiences.length, 0, 'a deleted record must leave the document');
  });

  it('keeps the bullets the candidate wrote while the facts follow the record', () => {
    const first = mergeCanonicalCvDocument(
      source({ experiences: [experience] }),
      emptyDocument()
    );
    const written = {
      ...first,
      experiences: first.experiences.map((entry) => ({
        ...entry,
        bullets: ['Cut the release cycle from nine days to two.'],
      })),
    };
    const second = mergeCanonicalCvDocument(
      source({ experiences: [{ ...experience, company: 'Nile Software Group' }] }),
      written
    );
    assert.equal(second.experiences[0].company, 'Nile Software Group', 'the fact must follow');
    assert.deepEqual(
      second.experiences[0].bullets,
      ['Cut the release cycle from nine days to two.'],
      'the wording must stay'
    );
  });
});

describe('education -> CV', () => {
  const education = {
    id: UUID_B,
    institution: 'Cairo University',
    degree: 'BSc',
    field: 'Computer Science',
    startDate: '2014-09-01',
    endDate: '2018-06-30',
    isCurrent: false,
    description: '',
  };

  it('shows a created education and follows an edit and a delete', () => {
    const first = mergeCanonicalCvDocument(source({ education: [education] }), emptyDocument());
    assert.equal(first.education.length, 1);
    assert.equal(first.education[0].institution, 'Cairo University');

    const second = mergeCanonicalCvDocument(
      source({ education: [{ ...education, degree: 'BSc Computer Science' }] }),
      first
    );
    assert.equal(second.education[0].degree, 'BSc Computer Science');

    const third = mergeCanonicalCvDocument(source({ education: [] }), second);
    assert.equal(third.education.length, 0);
  });
});

describe('project -> CV', () => {
  const project = {
    id: UUID_C,
    title: 'Cairo Commute',
    role: 'Solo build',
    link: 'https://example.com/cairo-commute',
    technologies: ['React', 'TypeScript'],
    description: 'A route planner.',
  };

  it('shows a created project and removes a deleted one', () => {
    const first = mergeCanonicalCvDocument(source({ projects: [project] }), emptyDocument());
    assert.equal(first.projects.length, 1);
    assert.equal(first.projects[0].title, 'Cairo Commute');
    assert.deepEqual(first.projects[0].technologies, ['React', 'TypeScript']);

    const second = mergeCanonicalCvDocument(source({ projects: [] }), first);
    assert.equal(second.projects.length, 0);
  });
});

describe('certificate -> CV', () => {
  const certification = {
    id: UUID_A,
    name: 'Google Data Analytics',
    issuer: 'Google',
    issueDate: '2023-08-14',
  };

  it('shows a certificate with a historical issue date', () => {
    const document = mergeCanonicalCvDocument(
      source({ certifications: [certification] }),
      emptyDocument()
    );
    assert.deepEqual(document.certifications, ['Google Data Analytics']);
    assert.equal(document.certificationDetails?.[0].issueDate, '2023-08-14');
    assert.equal(document.certificationDetails?.[0].issuer, 'Google');
  });

  it('removes a deleted certificate', () => {
    const first = mergeCanonicalCvDocument(
      source({ certifications: [certification] }),
      emptyDocument()
    );
    const second = mergeCanonicalCvDocument(source({ certifications: [] }), first);
    assert.equal(second.certifications.length, 0);
    assert.equal(second.certificationDetails?.length, 0);
  });

  it('keeps the description the candidate wrote for a certificate', () => {
    const first = mergeCanonicalCvDocument(
      source({ certifications: [certification] }),
      emptyDocument()
    );
    const written = {
      ...first,
      certificationDetails: (first.certificationDetails ?? []).map((entry) => ({
        ...entry,
        description: 'Analysed a public transport dataset end to end.',
      })),
    };
    const second = mergeCanonicalCvDocument(
      source({ certifications: [{ ...certification, issuer: 'Google Cloud' }] }),
      written
    );
    assert.equal(second.certificationDetails?.[0].issuer, 'Google Cloud');
    assert.equal(
      second.certificationDetails?.[0].description,
      'Analysed a public transport dataset end to end.'
    );
  });

  it('gives the certificate the record it belongs to', () => {
    const document = mergeCanonicalCvDocument(
      source({ certifications: [certification] }),
      emptyDocument()
    );
    assert.equal(document.certificationDetails?.[0].id, UUID_A);
  });

  it('keeps a certificate that came from an imported CV', () => {
    // An imported certificate has no record yet. It must survive until the
    // candidate imports it into the profile.
    const imported: CVProfile = {
      ...emptyDocument(),
      certifications: ['TensorFlow Developer'],
      certificationDetails: [
        { name: 'TensorFlow Developer', issuer: 'Google', issueDate: '2022-05-01' },
      ],
    };
    const document = mergeCanonicalCvDocument(
      source({ certifications: [certification] }),
      imported
    );
    assert.equal(document.certificationDetails?.length, 2);
    assert.equal(document.certificationDetails?.[1].name, 'TensorFlow Developer');
    assert.deepEqual(document.certifications, ['Google Data Analytics', 'TensorFlow Developer']);
  });
});

describe('volunteering -> CV', () => {
  const volunteering = {
    id: UUID_A,
    organization: 'Coder Dojo Cairo',
    role: 'Mentor',
    startDate: '2023-01-01',
    endDate: '2024-05-01',
    isCurrent: false,
    description: 'Taught Python to twelve students.',
  };

  it('shows a volunteering stint and removes a deleted one', () => {
    const first = mergeCanonicalCvDocument(
      source({ volunteering: [volunteering] }),
      emptyDocument()
    );
    assert.equal(first.volunteering?.length, 1);
    assert.equal(first.volunteering?.[0].organization, 'Coder Dojo Cairo');
    assert.deepEqual(first.volunteering?.[0].bullets, ['Taught Python to twelve students.']);

    const second = mergeCanonicalCvDocument(source({ volunteering: [] }), first);
    assert.equal(second.volunteering?.length, 0);
  });
});

describe('completed courses -> CV', () => {
  it('shows a completed course and removes a deleted one', () => {
    // The id of a completed course is the id of the learning item, which is a
    // stored record — so removing the course removes it from the CV.
    const course = { id: UUID_B, title: 'Data Analysis with Python', provider: 'NTI' };
    const first = mergeCanonicalCvDocument(source({ courses: [course] }), emptyDocument());
    assert.equal(first.courses?.length, 1);
    assert.equal(first.courses?.[0].title, 'Data Analysis with Python');

    const second = mergeCanonicalCvDocument(source({ courses: [] }), first);
    assert.equal(second.courses?.length, 0);
  });
});

describe('skills -> CV', () => {
  it('shows the skills the candidate owns', () => {
    const document = mergeCanonicalCvDocument(
      source({ skills: [{ name: 'React', level: 4 }, { name: 'TypeScript', level: 3 }] }),
      emptyDocument()
    );
    assert.deepEqual(document.skillsList, ['React', 'TypeScript']);
  });

  it('never shows a target-role requirement as an owned skill', () => {
    // The source carries only what the candidate owns. A requirement is not
    // in the source, so it cannot reach the document.
    const document = mergeCanonicalCvDocument(
      source({ skills: [{ name: 'React', level: 4 }] }),
      emptyDocument()
    );
    assert.equal(document.skillsList.includes('Kubernetes'), false);
    assert.equal(document.skillsList.includes('GraphQL'), false);
  });

  it('does not put back a skill the candidate took off this CV', () => {
    const first = mergeCanonicalCvDocument(
      source({ skills: [{ name: 'React', level: 4 }, { name: 'Node', level: 3 }] }),
      emptyDocument()
    );
    const taken = { ...first, hiddenSkills: ['Node'] };
    const second = mergeCanonicalCvDocument(
      source({ skills: [{ name: 'React', level: 4 }, { name: 'Node', level: 3 }] }),
      taken
    );
    assert.deepEqual(second.skillsList, ['React']);
  });

  it('brings a new skill in when the candidate claims one', () => {
    const first = mergeCanonicalCvDocument(
      source({ skills: [{ name: 'React', level: 4 }] }),
      emptyDocument()
    );
    const second = mergeCanonicalCvDocument(
      source({ skills: [{ name: 'React', level: 4 }, { name: 'Rust', level: 2 }] }),
      first
    );
    assert.deepEqual(second.skillsList, ['React', 'Rust']);
  });
});

describe('professional links -> CV', () => {
  it('shows the links the profile owns', () => {
    const document = mergeCanonicalCvDocument(
      source({
        links: [
          { id: 'link-1', kind: 'linkedin', url: 'https://linkedin.com/in/amal' },
          { id: 'link-2', kind: 'github', url: 'https://github.com/amal' },
        ],
      }),
      emptyDocument()
    );
    assert.equal(document.links?.length, 2);
    assert.equal(document.links?.[0].label, 'LinkedIn');
    assert.equal(document.links?.[1].url, 'https://github.com/amal');
  });

  it('keeps the order and the enabled flag of this CV, and follows a changed URL', () => {
    const first = mergeCanonicalCvDocument(
      source({
        links: [
          { id: 'link-1', kind: 'linkedin', url: 'https://linkedin.com/in/amal' },
          { id: 'link-2', kind: 'github', url: 'https://github.com/amal' },
        ],
      }),
      emptyDocument()
    );
    const arranged = {
      ...first,
      links: [
        { ...(first.links ?? [])[1], enabled: false },
        { ...(first.links ?? [])[0], enabled: true },
      ],
    };
    const second = mergeCanonicalCvDocument(
      source({
        links: [
          { id: 'link-1', kind: 'linkedin', url: 'https://linkedin.com/in/amal-said' },
          { id: 'link-2', kind: 'github', url: 'https://github.com/amal' },
        ],
      }),
      arranged
    );
    assert.equal(second.links?.[0].id, 'link-2', 'the order belongs to the CV');
    assert.equal(second.links?.[0].enabled, false, 'the enabled flag belongs to the CV');
    assert.equal(
      second.links?.[1].url,
      'https://linkedin.com/in/amal-said',
      'the URL belongs to the profile'
    );
  });
});

describe('imported documents', () => {
  it('keeps imported content that the profile does not hold yet', () => {
    const imported: CVProfile = {
      ...emptyDocument(),
      experiences: [
        {
          id: 'exp-1',
          company: 'Old Employer',
          role: 'Designer',
          period: '2015 – 2017',
          location: '',
          bullets: ['Designed the brand system.'],
        },
      ],
    };
    const document = mergeCanonicalCvDocument(source(), imported);
    assert.equal(document.experiences.length, 1, 'imported content must survive');
    assert.equal(document.experiences[0].company, 'Old Employer');
  });

  it('matches imported content to the record it became, without duplicating it', () => {
    const imported: CVProfile = {
      ...emptyDocument(),
      experiences: [
        {
          id: 'exp-1',
          company: 'Nile Software',
          role: 'Senior Frontend Engineer',
          period: 'Oct 2019 – Jun 2023',
          location: '',
          bullets: ['Built the design system.'],
        },
      ],
    };
    const document = mergeCanonicalCvDocument(
      source({
        experiences: [
          {
            id: UUID_A,
            role: 'Senior Frontend Engineer',
            company: 'Nile Software',
            startDate: '2019-10-01',
            endDate: '2023-06-30',
          },
        ],
      }),
      imported
    );
    assert.equal(document.experiences.length, 1, 'the record and the import are one entry');
    assert.equal(document.experiences[0].id, UUID_A, 'the record owns the id');
    assert.deepEqual(
      document.experiences[0].bullets,
      ['Built the design system.'],
      'the imported wording is kept'
    );
  });
});

describe('the projection never invents anything', () => {
  it('leaves a field the records do not have empty', () => {
    const document = mergeCanonicalCvDocument(
      source({
        profile: { fullName: 'Amal Said' },
        experiences: [
          { id: UUID_A, role: 'Engineer', company: 'Nile Software' },
        ],
      }),
      emptyDocument()
    );
    assert.equal(document.email, '');
    assert.equal(document.phone, '');
    assert.equal(document.location, '');
    assert.equal(document.experiences[0].period, '', 'no dates means no period');
    assert.deepEqual(document.experiences[0].bullets, [], 'no text means no bullets');
    assert.deepEqual(document.skillsList, []);
  });
});

describe('the projection folds the records together', () => {
  it('writes one line for a skill the candidate described twice', () => {
    const document = mergeCanonicalCvDocument(
      source({
        skills: [
          { name: 'SQL', level: 3 },
          { name: 'SQL Fundamentals', level: 3 },
        ],
      }),
      emptyDocument()
    );
    assert.deepEqual(document.skillsList, ['SQL'], 'one skill, one line');
  });

  it('keeps the specialisation of a skill the candidate described twice', () => {
    const document = mergeCanonicalCvDocument(
      source({
        skills: [
          { name: 'Python', level: 3 },
          { name: 'Python for Data Analysis', level: 3 },
        ],
      }),
      emptyDocument()
    );
    assert.equal(document.skillsList.length, 1, 'one skill');
    assert.match(document.skillsList[0], /^Python/, 'the broad name leads');
  });

  it('folds a skill the CV already carries into the owned one', () => {
    const document = mergeCanonicalCvDocument(
      source({ skills: [{ name: 'SQL Fundamentals', level: 3 }] }),
      { ...emptyDocument(), skillsList: ['SQL'] }
    );
    assert.deepEqual(document.skillsList, ['SQL'], 'the CV does not list it twice');
  });

  it('keeps one row for a degree the candidate entered twice', () => {
    const document = mergeCanonicalCvDocument(
      source({
        education: [
          {
            id: UUID_A,
            institution: 'Cairo University',
            degree: 'Bachelor of Science',
            startDate: '2018-09-01',
          },
          {
            id: UUID_B,
            institution: 'Cairo University',
            degree: 'Bachelor of Science',
            startDate: '2018-09-01',
          },
        ],
      }),
      emptyDocument()
    );
    assert.equal(document.education.length, 1, 'one row for one degree');
    assert.equal(document.education[0].institution, 'Cairo University');
  });

  it('keeps two stints at the same company as two entries', () => {
    const document = mergeCanonicalCvDocument(
      source({
        experiences: [
          {
            id: UUID_A,
            role: 'Engineer',
            company: 'Nile Software',
            startDate: '2019-10-01',
            endDate: '2021-06-30',
          },
          {
            id: UUID_B,
            role: 'Engineer',
            company: 'Nile Software',
            startDate: '2023-01-01',
          },
        ],
      }),
      emptyDocument()
    );
    assert.equal(document.experiences.length, 2, 'two jobs are two entries');
  });

  it('drops a summary paragraph that repeats an earlier one', () => {
    const document = mergeCanonicalCvDocument(
      source({
        profile: {
          fullName: 'Amal Said',
          summary: 'Frontend engineer.\n\nFrontend engineer.',
        },
      }),
      emptyDocument()
    );
    assert.equal(document.summary, 'Frontend engineer.', 'the repeat is folded away');
  });

  it('leaves an experience record that says nothing off the CV', () => {
    const document = mergeCanonicalCvDocument(
      source({
        experiences: [{ id: UUID_A, role: '', company: '' }],
      }),
      emptyDocument()
    );
    assert.deepEqual(document.experiences, [], 'a blank row is not on the CV');
  });
});
