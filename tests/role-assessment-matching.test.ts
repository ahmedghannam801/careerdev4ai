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

  it('selects an assessment whose skill name is identical to the requirement', () => {
    const dataChecks = [
      { id: 'analysis', skillName: 'Data Analysis' },
      { id: 'visualization', skillName: 'Data Visualization' },
    ];

    assert.deepEqual(
      assessmentsForRole(dataChecks, ['Data Analysis']).map(({ id }) => id),
      ['analysis']
    );
  });

  it('never treats two neighbouring subjects that share an ordinary word as the same skill', () => {
    const dataChecks = [
      { id: 'analysis', skillName: 'Data Analysis' },
      { id: 'visualization', skillName: 'Data Visualization' },
      { id: 'engineering', skillName: 'Data Engineering' },
    ];

    assert.deepEqual(
      assessmentsForRole(dataChecks, ['Data Visualization']).map(({ id }) => id),
      ['visualization']
    );
    assert.deepEqual(
      assessmentsForRole(dataChecks, ['Data Analysis']).map(({ id }) => id),
      ['analysis']
    );
  });

  it('does not offer a specialization for a general Python requirement', () => {
    const pythonChecks = [
      { id: 'python', skillName: 'Python' },
      { id: 'python-data', skillName: 'Python for Data Analysis' },
      { id: 'python-web', skillName: 'Python for Web Development' },
    ];

    // The general requirement is answered by the general check only.
    assert.deepEqual(
      assessmentsForRole(pythonChecks, ['Python']).map(({ id }) => id),
      ['python']
    );
    // A specific requirement still gets the general check, alongside the check
    // that names it exactly. The reverse direction is the one that must not
    // happen.
    assert.deepEqual(
      assessmentsForRole(pythonChecks, ['Python for Data Analysis']).map(({ id }) => id),
      ['python', 'python-data']
    );
  });

  it('does not match a partial word that merely looks like a skill', () => {
    const languageChecks = [
      { id: 'java', skillName: 'Java' },
      { id: 'javascript', skillName: 'JavaScript' },
    ];

    assert.deepEqual(
      assessmentsForRole(languageChecks, ['JavaScript']).map(({ id }) => id),
      ['javascript']
    );
    assert.deepEqual(
      assessmentsForRole(languageChecks, ['Java']).map(({ id }) => id),
      ['java']
    );
  });

  it('treats the framework extension and the controlled synonyms as the same skill', () => {
    const frameworkChecks = [
      { id: 'react', skillName: 'React' },
      { id: 'excel', skillName: 'Microsoft Excel' },
    ];

    assert.deepEqual(
      assessmentsForRole(frameworkChecks, ['React.js']).map(({ id }) => id),
      ['react']
    );
    assert.deepEqual(
      assessmentsForRole(frameworkChecks, ['Spreadsheets']).map(({ id }) => id),
      ['excel']
    );
  });

  it('keeps different career specializations apart', () => {
    const specializationChecks = [
      { id: 'marketing', skillName: 'Digital Marketing' },
      { id: 'finance', skillName: 'Financial Analysis' },
      { id: 'nursing', skillName: 'Clinical Practice' },
    ];

    assert.deepEqual(
      assessmentsForRole(specializationChecks, ['Digital Marketing']).map(({ id }) => id),
      ['marketing']
    );
  });
});
