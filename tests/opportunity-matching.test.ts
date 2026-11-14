/**
 * Behavioural checks for the opportunity matcher.
 *
 * The Opportunities page used to show a Data Analyst a construction
 * site-operations role, put "I volunteered here" on an internship, listed
 * an NGO's home page as a live vacancy, and showed the same listing twice.
 *
 * These tests protect the four corrections: relevance, the action, the
 * listing type, and the duplicates.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canonicalUrl,
  dedupeOpportunities,
  matchedGapSkills,
  matchesCandidate,
  opportunityCta,
  opportunityListing,
  opportunityKey,
} from '../shared/opportunityMatching.ts';

describe('the matcher keeps the candidate\'s field', () => {
  const dataAnalyst = {
    gapSkills: ['SQL', 'Tableau'],
    targetRoleTitle: 'Data Analyst',
    track: 'data',
  };

  it('matches a data role for a data analyst', () => {
    assert.equal(
      matchesCandidate(
        {
          title: 'Data Analyst Internship',
          description: 'Work with SQL and Tableau dashboards.',
          organization: 'Nile Software',
          skillsGained: ['SQL', 'Tableau'],
        },
        dataAnalyst
      ),
      true
    );
  });

  it('rejects a construction role for a data analyst', () => {
    assert.equal(
      matchesCandidate(
        {
          title: 'Site Operations Engineer',
          description: 'Site operations and construction site management.',
          organization: 'BuildCo',
          skillsGained: ['Site operations'],
        },
        dataAnalyst
      ),
      false
    );
  });

  it('rejects a clinical course for a data analyst', () => {
    assert.equal(
      matchesCandidate(
        {
          title: 'Emergency Care Course',
          description: 'Critical care and patient nursing for clinical staff.',
          organization: 'Red Crescent',
          skillsGained: ['Patient care'],
        },
        dataAnalyst
      ),
      false
    );
  });

  it('matches on a gap even when the title says nothing', () => {
    assert.equal(
      matchesCandidate(
        {
          title: 'Summer Bootcamp',
          description: 'An intensive programme.',
          organization: 'Code Academy',
          skillsGained: ['SQL'],
        },
        dataAnalyst
      ),
      true
    );
  });

  it('does not match a word inside another word', () => {
    // "bi" must not make a combining role a data role.
    assert.equal(
      matchesCandidate(
        {
          title: 'Combining Machine Operator',
          description: 'Operating a combined machine on the line.',
          organization: 'Factory',
        },
        { gapSkills: [], targetRoleTitle: 'Data Analyst', track: 'data' }
      ),
      false
    );
  });
});

describe('the gap badge names the skill', () => {
  it('names the gaps the opportunity practises', () => {
    const matched = matchedGapSkills(
      { title: 'Analytics Bootcamp', skillsGained: ['SQL', 'Excel'] },
      ['SQL', 'Tableau', 'Python']
    );
    assert.deepEqual(matched, ['SQL']);
  });

  it('says nothing when there is no match', () => {
    assert.deepEqual(
      matchedGapSkills({ title: 'Gardening Club', skillsGained: ['Gardening'] }, ['SQL']),
      []
    );
  });

  it('counts a near-match as a match', () => {
    assert.deepEqual(
      matchedGapSkills({ title: 'Analytics', skillsGained: ['Data analysis'] }, ['Data Analysis']),
      ['Data Analysis']
    );
  });
});

describe('the action fits the opportunity', () => {
  it('offers a volunteering action for volunteering', () => {
    assert.equal(opportunityCta('volunteering').label, 'I volunteered here');
  });

  it('offers an application action for an internship', () => {
    const cta = opportunityCta('internship');
    assert.notEqual(cta.label, 'I volunteered here');
    assert.match(cta.label, /Apply/);
  });

  it('offers a participation action for a competition', () => {
    assert.match(opportunityCta('competition').label, /Join/);
  });

  it('offers an enrolment action for a programme', () => {
    assert.match(opportunityCta('academic').label, /Enroll/);
  });

  it('falls back for a kind it does not know', () => {
    assert.ok(opportunityCta('something-new').label.length > 0);
    assert.ok(opportunityCta(null).label.length > 0);
  });
});

describe('a directory is not an opening', () => {
  it('recognises an organisation\'s careers page', () => {
    assert.equal(
      opportunityListing({
        title: 'UNICEF Careers',
        applicationUrl: 'https://www.unicef.org/careers',
      }),
      'directory'
    );
  });

  it('recognises a bare home page', () => {
    assert.equal(
      opportunityListing({
        title: 'Catchafire',
        applicationUrl: 'https://catchafire.org',
      }),
      'directory'
    );
  });

  it('treats a specific opening as active', () => {
    assert.equal(
      opportunityListing({
        title: 'Data Analyst Internship',
        applicationUrl: 'https://example.org/jobs/data-analyst',
        deadline: '2027-01-01',
      }),
      'active'
    );
  });

  it('treats a passed deadline as expired', () => {
    assert.equal(
      opportunityListing({
        title: 'Data Analyst Internship',
        applicationUrl: 'https://example.org/jobs/data-analyst',
        deadline: '2020-01-01',
      }),
      'expired'
    );
  });
});

describe('the same listing is not shown twice', () => {
  it('ignores the noise in a URL', () => {
    assert.equal(
      canonicalUrl('https://www.unicef.org/careers/?ref=tw'),
      canonicalUrl('http://unicef.org/careers')
    );
  });

  it('gives the same key to the same listing', () => {
    const a = opportunityKey({
      organization: 'UNICEF Egypt',
      title: 'Internship Programme',
      applicationUrl: 'https://www.unicef.org/egypt/careers',
    });
    const b = opportunityKey({
      organization: 'unicef egypt',
      title: 'Internship Programme',
      applicationUrl: 'https://unicef.org/egypt/careers/',
    });
    assert.equal(a, b);
  });

  it('keeps one of the two copies', () => {
    const kept = dedupeOpportunities([
      {
        id: 'a',
        title: 'Internship Programme',
        organization: 'UNICEF Egypt',
        applicationUrl: 'https://www.unicef.org/egypt/careers',
      },
      {
        id: 'b',
        title: 'Internship Programme',
        organization: 'UNICEF Egypt',
        applicationUrl: 'https://unicef.org/egypt/careers/',
      },
      {
        id: 'c',
        title: 'Another Programme',
        organization: 'UNICEF Egypt',
        applicationUrl: 'https://unicef.org/egypt/other',
      },
    ]);
    assert.deepEqual(
      kept.map((item) => item.id),
      ['a', 'c']
    );
  });
});
