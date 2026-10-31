/**
 * Behavioural checks for the dates a career record carries.
 *
 * The rule the platform follows is simple and worth stating plainly: a date
 * in the past is history, not a mistake. A certificate issued in 2022 and a
 * role that ran from 2019 to 2021 have to be enterable, and they are.
 *
 * What is refused is a record that contradicts itself — an end date before
 * its start date — because that is a mistake the reader cannot see.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DATE_POLICY,
  compareDateParts,
  normalizeDateRange,
  normalizeDateValue,
  parseDate,
  validateDateRange,
  validateIssueDates,
} from '../shared/dateRange.ts';

describe('the date policy', () => {
  it('accepts history and refuses only contradictions', () => {
    assert.equal(DATE_POLICY.allowsHistoricalDates, true);
    assert.equal(DATE_POLICY.enforcesChronology, true);
  });
});

describe('a historical date is accepted', () => {
  it('reads an ISO date from years ago', () => {
    const parsed = normalizeDateValue('2021-10-01');
    assert.equal(parsed.date, '2021-10-01');
    assert.equal(parsed.isCurrent, false);
  });

  it('reads a certificate issued in 2023', () => {
    assert.equal(normalizeDateValue('2023-08-14').date, '2023-08-14');
  });

  it('reads a month and a year', () => {
    const parsed = parseDate('Jun 2021');
    assert.equal(parsed.year, 2021);
    assert.equal(parsed.month, 6);
    assert.equal(parsed.day, null, 'the day was never written, so it is not invented');
    assert.equal(parsed.date, '2021-06-01');
  });

  it('reads a year on its own', () => {
    const parsed = parseDate('2021');
    assert.equal(parsed.year, 2021);
    assert.equal(parsed.month, null);
  });

  it('reads a written month', () => {
    assert.equal(normalizeDateValue('September 2019').date, '2019-09-01');
  });

  it('reads a full written date', () => {
    assert.equal(normalizeDateValue('14 Aug 2023').date, '2023-08-14');
    assert.equal(normalizeDateValue('Aug 14, 2023').date, '2023-08-14');
  });

  it('reads "Present" as the current end date', () => {
    const parsed = normalizeDateValue('Present');
    assert.equal(parsed.date, null);
    assert.equal(parsed.isCurrent, true);
  });

  it('stores what it cannot read as unknown rather than guessing', () => {
    const parsed = normalizeDateValue('sometime last spring');
    assert.equal(parsed.date, null);
    assert.equal(parsed.isCurrent, false);
  });

  it('refuses a day that does not exist', () => {
    assert.equal(normalizeDateValue('2022-02-30').date, null);
  });
});

describe('a range of historical dates', () => {
  it('keeps both ends of a range that ended years ago', () => {
    const range = normalizeDateRange('2019-10-01', '2023-06-30');
    assert.equal(range.startDate, '2019-10-01');
    assert.equal(range.endDate, '2023-06-30');
    assert.equal(range.isCurrent, false);
  });

  it('treats "Present" as a current record with no end date', () => {
    const range = normalizeDateRange('2019-10-01', 'Present');
    assert.equal(range.endDate, null);
    assert.equal(range.isCurrent, true);
  });
});

describe('the chronology of one record', () => {
  it('accepts a range that ran from 2019 to 2021', () => {
    assert.equal(validateDateRange('2019-10-01', '2021-06-30'), null);
  });

  it('accepts a range that is still running', () => {
    assert.equal(validateDateRange('2019-10-01', null, true), null);
    assert.equal(validateDateRange('2019-10-01', 'Present'), null);
  });

  it('refuses a range that ends before it starts', () => {
    const problem = validateDateRange('2024-01-01', '2022-12-31');
    assert.ok(problem, 'the contradiction must be reported');
    assert.equal(problem?.field, 'endDate');
    assert.match(problem?.message ?? '', /end date/i);
  });

  it('refuses a range that ends in the same month it starts, later', () => {
    // "Jun 2024 - May 2024" is written differently but is the same mistake.
    const problem = validateDateRange('Jun 2024', 'May 2024');
    assert.ok(problem);
  });

  it('accepts a range whose ends are in the same month', () => {
    assert.equal(validateDateRange('2024-01-01', '2024-01-31'), null);
  });

  it('compares at the precision both dates carry', () => {
    // "2024" is not earlier than "Jun 2024" just because January is earlier
    // than June: the year-only value is not more precise than the other.
    assert.equal(validateDateRange('Jun 2024', '2024'), null);
    assert.equal(validateDateRange('2023', 'Jun 2024'), null);
    assert.ok(validateDateRange('2025', '2024'));
  });

  it('says nothing about a range it cannot read', () => {
    assert.equal(validateDateRange('', ''), null);
    assert.equal(validateDateRange('not a date', 'also not a date'), null);
  });
});

describe('the dates of a certificate', () => {
  it('accepts a certificate issued in 2023 that expires in 2026', () => {
    assert.equal(validateIssueDates('2023-08-14', '2026-08-13'), null);
  });

  it('accepts a certificate with no expiry date', () => {
    assert.equal(validateIssueDates('2023-08-14', ''), null);
    assert.equal(validateIssueDates('2023-08-14', null), null);
  });

  it('refuses a certificate that expires before it was issued', () => {
    const problem = validateIssueDates('2023-08-14', '2022-01-01');
    assert.ok(problem);
    assert.equal(problem?.field, 'expiryDate');
  });
});

describe('comparing two dates', () => {
  it('orders the dates it can read', () => {
    const older = parseDate('2019-10-01');
    const newer = parseDate('2023-06-30');
    assert.equal(compareDateParts(older, newer), -1);
    assert.equal(compareDateParts(newer, older), 1);
    assert.equal(compareDateParts(older, older), 0);
  });

  it('gives no answer when one of them is unreadable', () => {
    assert.equal(compareDateParts(parseDate(''), parseDate('2023-06-30')), null);
  });
});
