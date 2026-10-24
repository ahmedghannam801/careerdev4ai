// Phase B.6 — multi-domain career catalogue and career search.
//
// The catalogue used to hold eight technology roles, so "find me a career
// outside IT" was impossible: the search was a substring match over a
// fixed list, and every generated roadmap spoke in software vocabulary.
//
// This suite covers the pieces that make the product multi-domain:
//   1. the catalogue's own integrity (every role belongs to a known domain,
//      every related role resolves, every role has a documented path);
//   2. the fuzzy search (abbreviations, typos, domain words, substrings);
//   3. the shared learning-category mapping, which is what stopped the
//      recommender from scoring a finance course 0.25 for every career goal.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { CAREER_ROLES, resolveRole, findRoleByTitle } from '../shared/careerRoles.ts';
import { CAREER_DOMAINS, getCareerDomain } from '../shared/careerDomains.ts';
import { searchCareerCatalog, suggestClosestRole, normalizeSearchText } from '../shared/careerSearch.ts';
import {
  GOAL_LEARNING_CATEGORIES,
  DOMAIN_LEARNING_CATEGORIES,
  categoryServesDomain,
  learningCategoriesForDomain,
} from '../shared/learningCategories.ts';

const ROLE_IDS = new Set(CAREER_ROLES.map((role) => role.id));
const DOMAIN_IDS = new Set(CAREER_DOMAINS.map((domain) => domain.slug));

describe('B.6 career catalogue integrity', () => {
  test('role ids are unique and every role belongs to a known domain', () => {
    assert.equal(new Set(ROLE_IDS).size, CAREER_ROLES.length, 'duplicate role id');
    for (const role of CAREER_ROLES) {
      assert.ok(DOMAIN_IDS.has(role.domainId), `${role.id} has unknown domain ${role.domainId}`);
      assert.ok(role.title.trim().length > 2, `${role.id} has no title`);
      assert.ok(role.overview.trim().length > 20, `${role.id} has no overview`);
      assert.equal(role.category, getCareerDomain(role.domainId)?.label, `${role.id} category/domain mismatch`);
    }
  });

  test('every related role resolves to a real role', () => {
    for (const role of CAREER_ROLES) {
      for (const related of role.relatedRoles) {
        assert.ok(ROLE_IDS.has(related), `${role.id} points at unknown related role ${related}`);
      }
    }
  });

  test('every role documents a beginner path and a progression', () => {
    for (const role of CAREER_ROLES) {
      assert.ok(role.entryPath.length > 0, `${role.id} has no entry path`);
      assert.ok(role.intermediatePath.length > 0, `${role.id} has no intermediate path`);
      assert.ok(role.advancedPath.length > 0, `${role.id} has no advanced path`);
      assert.ok(role.proficiencyExpectations.length > 0, `${role.id} has no proficiency expectations`);
      assert.ok(role.requiredSkills.length >= 4, `${role.id} has too few required skills`);
      assert.ok(role.interviewTopics.length >= 3, `${role.id} has too few interview topics`);
      assert.ok(role.careerProgression.length >= 3, `${role.id} has no career progression`);
    }
  });

  test('the catalogue covers every career domain with at least two roles', () => {
    for (const domain of CAREER_DOMAINS) {
      const count = CAREER_ROLES.filter((role) => role.domainId === domain.slug).length;
      assert.ok(count >= 2, `domain ${domain.slug} has only ${count} role(s)`);
    }
  });

  test('the catalogue is not technology-only', () => {
    const technical = CAREER_ROLES.filter((role) => role.domainId === 'technology').length;
    assert.ok(
      CAREER_ROLES.length > technical * 4,
      'the catalogue is still dominated by technology roles'
    );
  });

  test('a role resolves by id and by title', () => {
    const byId = resolveRole('financial-analyst');
    assert.ok(byId);
    assert.equal(byId?.title, 'Financial Analyst');
    assert.equal(resolveRole('Financial Analyst')?.id, 'financial-analyst');
    assert.equal(findRoleByTitle('Supply Chain Manager')?.id, 'supply-chain-manager');
    assert.equal(resolveRole('not-a-role'), undefined);
  });
});

describe('B.6 career search', () => {
  test('finds roles by abbreviation', () => {
    const result = searchCareerCatalog('fin analyst');
    assert.ok(
      result.roles.some((match) => match.role.id === 'financial-analyst'),
      'did not find Financial Analyst'
    );
  });

  test('finds roles by domain word', () => {
    const result = searchCareerCatalog('supply chain');
    assert.ok(
      result.roles.some((match) => match.role.id === 'supply-chain-manager'),
      'did not find Supply Chain Manager'
    );
  });

  test('finds roles by a plain job title', () => {
    const result = searchCareerCatalog('teacher');
    assert.ok(result.roles.some((match) => match.role.id === 'teacher'), 'did not find Teacher');
  });

  test('finds roles by the HR abbreviation used in job adverts', () => {
    const result = searchCareerCatalog('hr');
    assert.ok(result.roles.length > 0, 'HR returned nothing');
    assert.ok(
      result.roles.some((match) => match.role.domainId === 'human-resources'),
      'HR did not surface a people role'
    );
  });

  test('tolerates a typo', () => {
    const result = searchCareerCatalog('finanical analyst');
    assert.ok(
      result.roles.some((match) => match.role.id === 'financial-analyst'),
      'did not recover from a typo'
    );
  });

  test('tolerates a missing character', () => {
    const result = searchCareerCatalog('financ anal');
    assert.ok(
      result.roles.some((match) => match.role.id === 'financial-analyst'),
      'did not recover from a subsequence'
    );
  });

  test('matches a domain and reports it', () => {
    const result = searchCareerCatalog('marketing');
    assert.ok(result.domains.length > 0, 'marketing matched no domain');
    assert.ok(
      result.domains.some((entry) => entry.domain.slug === 'marketing'),
      'the marketing domain was not matched'
    );
  });

  test('an empty query returns nothing rather than everything', () => {
    const result = searchCareerCatalog('   ');
    assert.equal(result.roles.length, 0);
    assert.equal(result.domains.length, 0);
  });

  test('an unmatched query returns nothing', () => {
    const result = searchCareerCatalog('zzzzqqqqxxxx');
    assert.equal(result.roles.length, 0);
  });

  test('search covers roles outside technology', () => {
    const domains = new Set<string>();
    for (const query of ['nurse', 'teacher', 'graphic designer', 'financial planner', 'supply chain', 'paralegal']) {
      const result = searchCareerCatalog(query);
      assert.ok(result.roles.length > 0, `no result for "${query}"`);
      for (const match of result.roles) domains.add(match.role.domainId);
    }
    assert.ok(domains.size >= 5, `only ${domains.size} career domains reachable through search`);
  });

  test('normalisation folds case, accents and punctuation', () => {
    assert.equal(normalizeSearchText('Supply-Chain, Manager!'), 'supply-chain manager');
  });

  test('a free-text job title suggests the closest catalogue role', () => {
    const suggestion = suggestClosestRole('Senior Financial Analyst');
    assert.ok(suggestion, 'no suggestion for a close role');
    assert.equal(suggestion?.id, 'financial-analyst');
  });
});

describe('B.6 shared learning categories', () => {
  test('every domain maps to at least one catalogue category', () => {
    for (const domain of CAREER_DOMAINS) {
      assert.ok(
        learningCategoriesForDomain(domain.slug).length > 0,
        `${domain.slug} maps to no catalogue category`
      );
    }
  });

  test('every goal has a category list', () => {
    for (const goal of Object.keys(GOAL_LEARNING_CATEGORIES)) {
      assert.ok(Array.isArray(GOAL_LEARNING_CATEGORIES[goal]), `${goal} has no category list`);
    }
  });

  test('a category serves the domain it is mapped to', () => {
    assert.ok(categoryServesDomain('Finance', 'finance'));
    assert.ok(categoryServesDomain('People', 'human-resources'));
    assert.ok(categoryServesDomain('Healthcare', 'healthcare'));
    assert.ok(categoryServesDomain('Legal', 'legal'));
    assert.ok(!categoryServesDomain('Programming', 'finance'));
    assert.ok(!categoryServesDomain('Finance', 'unknown-domain'));
  });

  test('the goal lists span the career domains, not only technology', () => {
    const all = new Set(Object.values(GOAL_LEARNING_CATEGORIES).flat());
    for (const expected of ['Finance', 'People', 'Marketing', 'Sales', 'Healthcare', 'Education', 'Legal', 'Operations']) {
      assert.ok(all.has(expected), `the goal category lists omit ${expected}`);
    }
  });

  test('every domain maps only to categories it declares', () => {
    for (const [domainId, categories] of Object.entries(DOMAIN_LEARNING_CATEGORIES)) {
      for (const category of categories) {
        assert.ok(
          learningCategoriesForDomain(domainId).includes(category),
          `${domainId} lists ${category} inconsistently`
        );
      }
    }
  });
});
