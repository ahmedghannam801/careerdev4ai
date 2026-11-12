/**
 * The grouping of the work experience section.
 *
 * WHY THIS FILE EXISTS
 * A candidate's CV writes one placement as a block of lines:
 *
 *     Data Analyst Trainee
 *     University Data Analytics Training
 *     Internship
 *     Tanta, Egypt
 *     Jan 2024 - Jun 2024
 *     - Built a dashboard with Power BI...
 *
 * That is ONE job. The reader used to take it apart — the organisation became
 * a record of its own, the employment type was thrown away entirely as if it
 * were a section heading, and what was left in the profile was a fragment
 * with no title and no dates.
 *
 * The rules this file pins down:
 *
 *   - one block of lines is one record, whatever order the lines are in;
 *   - the employment type is CAPTURED, not discarded;
 *   - two genuine placements stay two records.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseExperience, parseEmploymentType } from '../server/cv/parseStructuredCv.ts';
import type { DocumentBlock } from '../server/cv/documentExtraction.ts';

function block(text: string, index: number): DocumentBlock {
  return {
    text,
    page: 1,
    x: 10,
    y: 700 - index * 20,
    width: 500,
    fontSize: 11,
    heading: false,
    source: 'text',
  };
}

function parse(lines: string[]) {
  return parseExperience(lines.map((text, index) => block(text, index)));
}

describe('the experience section is read as blocks', () => {
  it('keeps one placement together when the organisation is written second', () => {
    const result = parse([
      'Data Analyst Trainee',
      'University Data Analytics Training',
      'Internship',
      'Tanta, Egypt',
      'Jan 2024 - Jun 2024',
      '• Built a dashboard with Power BI for the training cohort.',
    ]);

    assert.equal(result.length, 1, 'the whole block is one placement');
    const entry = result[0];
    assert.equal(entry.role, 'Data Analyst Trainee');
    assert.equal(entry.company, 'University Data Analytics Training');
    assert.equal(entry.employmentType, 'Internship');
    assert.equal(entry.location, 'Tanta, Egypt');
    assert.equal(entry.period, 'Jan 2024 – Jun 2024');
    assert.equal(entry.startDate, '2024-01-01');
    assert.equal(entry.endDate, '2024-06-01');
    assert.equal(entry.bullets.length, 1);
  });

  it('keeps one placement together when the employment type comes first', () => {
    const result = parse([
      'Internship',
      'Data Analyst Trainee',
      'University Data Analytics Training',
      'Tanta, Egypt',
      'Jan 2024 - Jun 2024',
    ]);

    assert.equal(result.length, 1);
    assert.equal(result[0].role, 'Data Analyst Trainee');
    assert.equal(result[0].company, 'University Data Analytics Training');
    assert.equal(result[0].employmentType, 'Internship');
  });

  it('keeps one placement together when the organisation is written first', () => {
    const result = parse([
      'University Data Analytics Training',
      'Data Analyst Trainee',
      'Internship',
      'Tanta, Egypt',
      'Jan 2024 - Jun 2024',
    ]);

    assert.equal(result.length, 1);
    assert.equal(result[0].role, 'Data Analyst Trainee');
    assert.equal(result[0].company, 'University Data Analytics Training');
    assert.equal(result[0].employmentType, 'Internship');
  });

  it('keeps one placement together when the type is in brackets on the title', () => {
    const result = parse([
      'Data Analyst Trainee (Internship)',
      'University Data Analytics Training',
      'Tanta, Egypt',
      'Jan 2024 - Jun 2024',
    ]);

    assert.equal(result.length, 1);
    assert.equal(result[0].role, 'Data Analyst Trainee');
    assert.equal(result[0].employmentType, 'Internship');
  });

  it('keeps two genuine placements as two records', () => {
    const result = parse([
      'Data Analyst',
      'Nile Retail Group',
      'Tanta, Egypt',
      'Jan 2023 - Dec 2023',
      '• Built a dashboard with Power BI.',
      'Data Analyst Trainee',
      'University Data Analytics Training',
      'Tanta, Egypt',
      'Jan 2024 - Jun 2024',
      '• Cleaned survey data in Excel.',
    ]);

    assert.equal(result.length, 2);
    assert.equal(result[0].company, 'Nile Retail Group');
    assert.equal(result[1].company, 'University Data Analytics Training');
    assert.equal(result[1].role, 'Data Analyst Trainee');
  });

  it('does not read a section heading as a placement', () => {
    const result = parse([
      'EXPERIENCE',
      'Data Analyst',
      'Nile Retail Group',
      'Jan 2023 - Dec 2023',
    ]);

    assert.equal(result.length, 1);
    assert.equal(result[0].role, 'Data Analyst');
    assert.equal(result[0].company, 'Nile Retail Group');
  });
});

describe('the employment type is read on its own terms', () => {
  it('reads a line that is only a type', () => {
    assert.equal(parseEmploymentType('Internship').type, 'Internship');
    assert.equal(parseEmploymentType('Full-time').type, 'Full-time');
    assert.equal(parseEmploymentType('Part-time').type, 'Part-time');
    assert.equal(parseEmploymentType('Contract').type, 'Contract');
    assert.equal(parseEmploymentType('Freelance').type, 'Freelance');
  });

  it('does not read a type out of the middle of a job title', () => {
    // "Trainee" is part of the title here, not a statement about the kind of
    // engagement. Reading it as one loses the title.
    const parsed = parseEmploymentType('Data Analyst Trainee');
    assert.equal(parsed.type, null);
    assert.equal(parsed.rest, 'Data Analyst Trainee');
  });

  it('does not read a type out of a sentence', () => {
    assert.equal(parseEmploymentType('Led an internship programme for interns').type, null);
  });

  it('reads a type out of brackets and keeps the rest of the line', () => {
    const parsed = parseEmploymentType('Data Analyst Trainee (Internship)');
    assert.equal(parsed.type, 'Internship');
    assert.equal(parsed.rest, 'Data Analyst Trainee');
  });
});
