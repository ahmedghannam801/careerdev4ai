/**
 * What the opportunity pipeline writes.
 *
 * The pipeline reads a ministry's announcement page and writes what it says
 * into the catalogue. Three things about that write are worth pinning down,
 * because each of them cost a source its whole run when it was wrong:
 *
 *   1. A source that names the same announcement twice must not fail. The
 *      database refuses a batch that says the same thing twice, and the
 *      refusal would take every other record of the source with it.
 *   2. A later run must not change the identity of a row. The catalogue
 *      refers to that identity from the places a candidate saved it.
 *   3. A body that is far longer than a catalogue entry has to be bounded,
 *      and the bound must be the same on the way in and on the way out — or
 *      every run reads the row as changed.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  boundDescription,
  planRecordWrites,
  type ExistingRecord,
  type SourceRecord,
} from '../server/opportunities/sync.ts';
import type { DiscoveredOpportunity } from '../server/opportunities/sources.ts';

const SOURCE: SourceRecord = {
  id: 'source-1',
  slug: 'mcit-announcements',
  name: 'Ministry announcements',
  organization: 'Ministry of Communications and Information Technology',
  country: 'Egypt',
  kind: 'announcements',
  baseUrl: 'https://mcit.gov.eg/',
  listUrl: 'https://mcit.gov.eg/en/Announcements',
  adapter: 'mcit-announcements',
  confidence: 90,
  defaultDomainIds: [],
};

const NOW = new Date('2026-11-17T00:00:00.000Z');

function record(overrides: Partial<DiscoveredOpportunity> = {}): DiscoveredOpportunity {
  return {
    externalId: 'ann-1',
    title: 'Data Analyst Internship',
    organization: 'Ministry of Communications and Information Technology',
    description: 'A short description of the programme.',
    country: 'Egypt',
    sourceUrl: 'https://mcit.gov.eg/en/Announcements/1',
    applicationUrl: 'https://mcit.gov.eg/en/Announcements/1',
    publishedAt: null,
    deadline: null,
    deadlineText: null,
    deadlinePrecision: null,
    cohort: null,
    trainingHours: null,
    costType: null,
    costNote: null,
    eligibility: null,
    participationMode: 'online',
    opportunityKind: 'programme',
    opportunityType: 'internship',
    category: 'programme',
    domainIds: [],
    roleSlugs: ['data-analyst'],
    requiredSkills: ['sql'],
    skillsGained: ['sql'],
    audience: null,
    location: 'Egypt',
    isRemote: true,
    confidence: 90,
    ...overrides,
  };
}

function existing(overrides: Partial<ExistingRecord> = {}): ExistingRecord {
  return {
    id: 'opp-mcit-announcements-ann-1',
    external_id: 'ann-1',
    title: 'Data Analyst Internship',
    description: 'A short description of the programme.',
    deadline: null,
    deadline_text: null,
    status: 'open',
    ...overrides,
  };
}

describe('the opportunity pipeline writes', () => {
  it('reads an announcement that is named twice only once', () => {
    const plan = planRecordWrites(
      SOURCE,
      [record(), record({ title: 'The same announcement, listed again' })],
      new Map(),
      NOW
    );

    assert.equal(plan.inserts.length, 1, 'the duplicate must not be written twice');
    assert.equal(plan.duplicates, 1, 'the duplicate must be reported');
    assert.equal(plan.inserts[0].title, 'Data Analyst Internship', 'the first one wins');
  });

  it('keeps the identity of a row that already exists', () => {
    // The row was written under a key that the current naming would not
    // produce. The update must not move it.
    const row = existing({ id: 'legacy-row-key' });
    const plan = planRecordWrites(
      SOURCE,
      [record({ deadline: new Date('2026-12-01T00:00:00.000Z').toISOString() })],
      new Map([['ann-1', row]]),
      NOW
    );

    assert.equal(plan.updates.length, 1, 'the changed row must be written');
    assert.equal(plan.updates[0].id, 'legacy-row-key', 'the key the database knows is kept');
    assert.equal(
      Object.prototype.hasOwnProperty.call(plan.updates[0].row, 'id'),
      false,
      'the update must not carry an identity of its own'
    );
  });

  it('does not read a bounded body as a change on every run', () => {
    const long = `${'word '.repeat(2_000)}`;
    const stored = boundDescription(long);

    assert.ok(stored.length < long.length, 'a long body must be shortened');
    assert.ok(stored.endsWith('…'), 'the cut is marked');

    const plan = planRecordWrites(
      SOURCE,
      [record({ description: long })],
      new Map([['ann-1', existing({ description: stored })]]),
      NOW
    );

    assert.equal(plan.updates.length, 0, 'the row must not be rewritten');
    assert.equal(plan.unchanged, 1, 'the row must be read as unchanged');
  });

  it('shortens a body on a word boundary', () => {
    const long = `${'a'.repeat(3_990)} tail`;
    const bounded = boundDescription(long);

    assert.ok(bounded.length <= 4_001, `the body was not bounded: ${bounded.length}`);
    assert.ok(!bounded.includes('  '), 'the cut must not leave a broken word');
  });

  it('leaves a body that is short enough alone', () => {
    const short = 'A short description.';
    assert.equal(boundDescription(short), short);
  });

  it('holds a record the parser was not confident about for review', () => {
    const plan = planRecordWrites(
      SOURCE,
      [record({ confidence: 40 })],
      new Map(),
      NOW
    );

    assert.equal(plan.inserts.length, 1);
    assert.equal(plan.inserts[0].review_state, 'needs_review');
  });

  it('publishes a record the parser was confident about', () => {
    const plan = planRecordWrites(SOURCE, [record({ confidence: 90 })], new Map(), NOW);

    assert.equal(plan.inserts.length, 1);
    assert.equal(plan.inserts[0].review_state, 'approved');
  });
});
