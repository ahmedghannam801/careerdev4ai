/**
 * Tests for the volunteer catalogue filters.
 *
 * What these lock down:
 *
 *   * the options the filter panel offers come from the catalogue itself, so
 *     the panel can never offer a choice that filters everything away;
 *   * a multi-select filter is an OR inside itself and an AND with the other
 *     filters, so adding a filter always narrows the list;
 *   * the selected filters are counted and named so the candidate can see
 *     what is narrowing their results;
 *   * the search reads the organisation and the skills as well as the title.
 *
 * These are pure: they need no browser, no server and no database.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EMPTY_ADVANCED_FILTERS,
  activeFilterIndicators,
  collectAdvancedFilterOptions,
  countAdvancedFilters,
  filterByAdvancedFilters,
  matchesOpportunitySearch,
  toggleInList,
} from '../src/lib/volunteerFilters.ts';
import type { VolunteerOpportunity } from '../src/lib/personalizationApi.ts';

function opportunity(overrides: Partial<VolunteerOpportunity>): VolunteerOpportunity {
  return {
    id: 'opp-1',
    title: 'Data volunteer',
    organization: 'DataKind',
    description: 'Clean and analyse a public dataset.',
    category: 'Data',
    location: 'Cairo',
    isRemote: false,
    commitment: '3 months',
    applicationUrl: 'https://example.invalid',
    skillsGained: ['SQL'],
    requiredSkills: ['Python'],
    roleSlugs: [],
    domainIds: [],
    verificationStatus: 'verified',
    verifiedAt: null,
    country: 'Egypt',
    languages: ['en'],
    opportunityType: 'volunteering',
    deadline: null,
    deadlineText: null,
    deadlinePrecision: null,
    status: 'open',
    costType: 'free',
    costNote: null,
    cohort: null,
    publishedAt: null,
    kind: 'volunteering',
    ...overrides,
  } as VolunteerOpportunity;
}

const CATALOGUE: VolunteerOpportunity[] = [
  opportunity({ id: 'a', category: 'Data', location: 'Cairo', requiredSkills: ['Python'] }),
  opportunity({
    id: 'b',
    title: 'Teaching volunteer',
    organization: 'Teach Egypt',
    category: 'Education',
    location: 'Giza',
    requiredSkills: ['Teaching'],
    skillsGained: ['Mentoring'],
    status: 'closed',
  }),
  opportunity({
    id: 'c',
    title: 'Remote data analyst',
    organization: 'Remote Org',
    category: 'Data',
    location: 'Remote',
    requiredSkills: ['SQL'],
    skillsGained: ['Python'],
    isRemote: true,
  }),
];

describe('the volunteer filters', () => {
  it('adds a value to a list and takes it out again', () => {
    const original = ['Cairo'];
    const added = toggleInList(original, 'Giza');
    assert.deepEqual(added, ['Cairo', 'Giza']);
    assert.deepEqual(toggleInList(added, 'Cairo'), ['Giza']);
    // The list it was given is never changed.
    assert.deepEqual(original, ['Cairo']);
  });

  it('offers only the values the catalogue actually carries', () => {
    const options = collectAdvancedFilterOptions(CATALOGUE);
    const categories = options.categories.map((option) => option.value);
    assert.deepEqual(categories, ['Data', 'Education']);
    assert.ok(!categories.includes('Finance'));
  });

  it('counts how many opportunities carry each value', () => {
    const options = collectAdvancedFilterOptions(CATALOGUE);
    const data = options.categories.find((option) => option.value === 'Data');
    assert.equal(data?.count, 2);
  });

  it('offers the skills an opportunity asks for and the ones it gives', () => {
    const options = collectAdvancedFilterOptions(CATALOGUE);
    const skills = options.skills.map((option) => option.value);
    assert.ok(skills.includes('Python'));
    assert.ok(skills.includes('SQL'));
    assert.ok(skills.includes('Teaching'));
  });

  it('keeps everything when no filter is chosen', () => {
    const kept = filterByAdvancedFilters(CATALOGUE, EMPTY_ADVANCED_FILTERS);
    assert.equal(kept.length, CATALOGUE.length);
  });

  it('keeps either value when a filter has two values chosen', () => {
    const kept = filterByAdvancedFilters(CATALOGUE, {
      ...EMPTY_ADVANCED_FILTERS,
      categories: ['Data', 'Education'],
    });
    assert.equal(kept.length, 3);
  });

  it('narrows the list to one value when one is chosen', () => {
    const kept = filterByAdvancedFilters(CATALOGUE, {
      ...EMPTY_ADVANCED_FILTERS,
      categories: ['Education'],
    });
    assert.equal(kept.length, 1);
    assert.equal(kept[0].id, 'b');
  });

  it('requires every filter to be satisfied at once', () => {
    const kept = filterByAdvancedFilters(CATALOGUE, {
      categories: ['Data'],
      locations: ['Remote'],
      skills: [],
      statuses: [],
    });
    assert.equal(kept.length, 1);
    assert.equal(kept[0].id, 'c');
  });

  it('matches a record by the skill it gives as well as the one it asks for', () => {
    const kept = filterByAdvancedFilters(CATALOGUE, {
      ...EMPTY_ADVANCED_FILTERS,
      skills: ['Mentoring'],
    });
    assert.equal(kept.length, 1);
    assert.equal(kept[0].id, 'b');
  });

  it('counts the filters that are narrowing the list', () => {
    assert.equal(countAdvancedFilters(EMPTY_ADVANCED_FILTERS), 0);
    assert.equal(
      countAdvancedFilters({
        categories: ['Data'],
        skills: ['Python', 'SQL'],
        locations: [],
        statuses: [],
      }),
      3
    );
  });

  it('names every selected filter so the page can show them', () => {
    const indicators = activeFilterIndicators({
      categories: ['Data'],
      skills: ['Python'],
      locations: [],
      statuses: ['open'],
    });
    assert.equal(indicators.length, 3);
    assert.deepEqual(
      indicators.map((indicator) => indicator.group).sort(),
      ['categories', 'skills', 'statuses']
    );
  });

  it('finds an opportunity by its organisation', () => {
    assert.equal(matchesOpportunitySearch(CATALOGUE[1], 'teach egypt'), true);
    assert.equal(matchesOpportunitySearch(CATALOGUE[1], 'nothing here'), false);
  });

  it('finds an opportunity by a skill it needs', () => {
    assert.equal(matchesOpportunitySearch(CATALOGUE[0], 'python'), true);
  });

  it('treats an empty search as everything', () => {
    assert.equal(matchesOpportunitySearch(CATALOGUE[0], '   '), true);
  });
});
