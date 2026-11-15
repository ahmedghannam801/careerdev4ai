import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assessmentsForRole } from '../shared/roleAssessmentMatching.ts';

const catalog = [
  { id: 'sql', skillName: 'SQL' },
  { id: 'python', skillName: 'Python' },
  { id: 'excel', skillName: 'Microsoft Excel' },
  { id: 'english', skillName: 'English' },
];

describe('role-specific assessment selection', () => {
  it('limits the catalog to skills required or preferred by the role', () => {
    assert.deepEqual(
      assessmentsForRole(catalog, ['SQL', 'Python for Data Analysis']).map(({ id }) => id),
      ['sql', 'python']
    );
  });

  it('matches meaningful skill extensions but not unrelated subject matter', () => {
    assert.deepEqual(
      assessmentsForRole(catalog, ['Excel & Spreadsheets']).map(({ id }) => id),
      ['excel']
    );
  });

  it('matches the assessment through explicit skill aliases', () => {
    const roleAssessments = [
      { id: 'visualization', skillName: 'Data Visualization', aliases: ['Power BI', 'Tableau'] },
      { id: 'typescript', skillName: 'TypeScript', aliases: ['JavaScript'] },
    ];
    assert.deepEqual(
      assessmentsForRole(roleAssessments, ['Power BI', 'React']).map(({ id }) => id),
      ['visualization']
    );
  });

  it('retains the exploration catalog when no target-role skills are supplied', () => {
    assert.deepEqual(assessmentsForRole(catalog, []), catalog);
  });

  it('returns no unrelated checks for a configured role without a catalog match', () => {
    assert.deepEqual(assessmentsForRole(catalog, ['Quantum Computing']), []);
  });
});
