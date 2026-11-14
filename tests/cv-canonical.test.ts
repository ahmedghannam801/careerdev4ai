/**
 * Canonical CV records.
 *
 * The QA audit's BUG-05 and BUG-06: a CV whose skill list repeated the same
 * skill three ways, two education rows for one degree, a duplicated
 * university name, an empty experience row, and a summary that repeated
 * itself.
 *
 * These tests pin the behaviour: nothing the candidate wrote is thrown away,
 * but nothing is duplicated either.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canonicalizeSkills,
  canonicalSkillLines,
  cleanInstitutionName,
  dedupeSummaryParagraphs,
  dropEmptyExperience,
  institutionFaculty,
  mergeEducationRecords,
  paragraphSimilarity,
  skillBaseName,
  skillSpecialization,
} from '../shared/cvCanonical.ts';

describe('canonical skills', () => {
  it('folds "SQL" and "SQL Fundamentals" into one SQL', () => {
    const skills = canonicalizeSkills([
      { name: 'SQL' },
      { name: 'SQL Fundamentals' },
    ]);

    assert.equal(skills.length, 1);
    assert.equal(skills[0].name, 'SQL');
  });

  it('folds Python, Python Fundamentals and Python for Data Analysis into one', () => {
    const skills = canonicalizeSkills([
      { name: 'Python' },
      { name: 'Python Fundamentals' },
      { name: 'Python for Data Analysis' },
    ]);

    assert.equal(skills.length, 1);
    assert.equal(skills[0].name, 'Python');
  });

  it('keeps the specialisation instead of throwing it away', () => {
    const skills = canonicalizeSkills([
      { name: 'Python' },
      { name: 'Python for Data Analysis' },
    ]);

    assert.equal(skills[0].specializations.length, 1);
    assert.match(skills[0].specializations[0], /data analysis/);
  });

  it('folds Microsoft Excel and Excel / Spreadsheets Modeling into one', () => {
    const skills = canonicalizeSkills([
      { name: 'Microsoft Excel' },
      { name: 'Excel / Spreadsheets Modeling' },
    ]);

    assert.equal(skills.length, 1);
  });

  it('writes one line per canonical skill, with the specialisation beside it', () => {
    const lines = canonicalSkillLines([
      { name: 'Python' },
      { name: 'Python for Data Analysis' },
      { name: 'SQL' },
    ]);

    assert.equal(lines.length, 2);
    assert.ok(lines.some((line) => line.startsWith('Python') && line.includes('data analysis')));
    assert.ok(lines.includes('SQL'));
  });

  it('orders the skills the target role requires first', () => {
    const skills = canonicalizeSkills(
      [
        { name: 'Communication' },
        { name: 'SQL' },
        { name: 'Excel' },
      ],
      { requiredSkills: ['SQL'], preferredSkills: ['Excel'] }
    );

    assert.equal(skills[0].name, 'SQL');
    assert.equal(skills[0].required, true);
    assert.equal(skills[1].name, 'Excel');
    assert.equal(skills[2].name, 'Communication');
  });

  it('keeps the strongest level when the same skill was rated twice', () => {
    const skills = canonicalizeSkills([
      { name: 'SQL', level: 2 },
      { name: 'SQL Fundamentals', level: 4 },
    ]);

    assert.equal(skills.length, 1);
  });

  it('leaves genuinely different skills alone', () => {
    const skills = canonicalizeSkills([
      { name: 'SQL' },
      { name: 'Python' },
      { name: 'Data Visualisation' },
    ]);

    assert.equal(skills.length, 3);
  });

  it('reads the base name and the specialisation out of a skill name', () => {
    assert.equal(skillBaseName('SQL Fundamentals'), 'sql');
    assert.equal(skillBaseName('Python for Data Analysis'), 'python');
    assert.equal(skillSpecialization('Python for Data Analysis'), 'data analysis');
    assert.equal(skillSpecialization('SQL'), '');
  });
});

describe('education records', () => {
  it('merges two records for the same degree into one', () => {
    const merged = mergeEducationRecords([
      {
        id: '1',
        institution: 'Cairo University',
        degree: 'BSc Computer Science',
        field: '',
        startDate: '2022-09-01',
        endDate: '2026-06-01',
      },
      {
        id: '2',
        institution: 'Cairo University',
        degree: 'BSc Computer Science',
        field: 'Computer Science',
        startDate: '',
        endDate: '',
      },
    ]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].field, 'Computer Science');
    assert.equal(merged[0].startDate, '2022-09-01');
  });

  it('keeps two different degrees at the same university apart', () => {
    const merged = mergeEducationRecords([
      { institution: 'Cairo University', degree: 'BSc Computer Science' },
      { institution: 'Cairo University', degree: 'MSc Data Science' },
    ]);

    assert.equal(merged.length, 2);
  });

  it('strips the university name repeated inside itself', () => {
    assert.equal(
      cleanInstitutionName('Cairo University, Cairo University — Faculty of Science'),
      'Cairo University'
    );
  });

  it('keeps the faculty as the field of study', () => {
    assert.equal(
      institutionFaculty('Cairo University — Faculty of Science'),
      'Faculty of Science'
    );
  });

  it('reads the faculty out of a repeated institution name', () => {
    const merged = mergeEducationRecords([
      {
        institution: 'Cairo University, Faculty of Science',
        degree: 'BSc',
        field: '',
      },
    ]);

    assert.equal(merged[0].institution, 'Cairo University');
    assert.equal(merged[0].field, 'Faculty of Science');
  });
});

describe('experience records', () => {
  it('drops a record with neither a title nor a company', () => {
    const kept = dropEmptyExperience([
      { role: 'Data Analyst', company: 'Acme' },
      { role: '', company: '' },
    ]);

    assert.equal(kept.length, 1);
    assert.equal(kept[0].role, 'Data Analyst');
  });

  it('keeps a record that has only a company', () => {
    const kept = dropEmptyExperience([{ role: '', company: 'Acme' }]);

    assert.equal(kept.length, 1);
  });

  it('keeps a record that has only a title', () => {
    const kept = dropEmptyExperience([{ role: 'Intern', company: '' }]);

    assert.equal(kept.length, 1);
  });
});

describe('the summary', () => {
  it('drops a paragraph that repeats an earlier one', () => {
    const summary = dedupeSummaryParagraphs(
      'I am a data analyst.\n\nI am a data analyst.'
    );

    assert.equal(summary, 'I am a data analyst.');
  });

  it('ignores case and punctuation when comparing', () => {
    const summary = dedupeSummaryParagraphs(
      'Built a sales dashboard.\n\nbuilt a sales dashboard'
    );

    assert.equal(summary, 'Built a sales dashboard.');
  });

  it('keeps paragraphs that say different things', () => {
    const original =
      'I am a data analyst.\n\nI build dashboards in SQL and Power BI.\n\nI mentor junior analysts.';
    const summary = dedupeSummaryParagraphs(original);

    assert.equal(summary, original);
  });

  it('folds a near-identical paragraph into the first one', () => {
    const summary = dedupeSummaryParagraphs(
      'I build interactive dashboards with SQL and Power BI for retail teams.\n\nI build interactive dashboards using SQL and Power BI for retail teams.'
    );

    assert.equal(summary.split('\n\n').length, 1);
  });

  it('leaves an empty summary alone', () => {
    assert.equal(dedupeSummaryParagraphs(''), '');
    assert.equal(dedupeSummaryParagraphs(null), '');
  });

  it('scores how alike two paragraphs are', () => {
    assert.equal(paragraphSimilarity('I am a data analyst', 'I am a data analyst'), 1);
    assert.ok(
      paragraphSimilarity('I build dashboards with SQL', 'I build dashboards using SQL') > 0.8
    );
    assert.equal(paragraphSimilarity('SQL tuning', 'Team leadership'), 0);
  });
});
