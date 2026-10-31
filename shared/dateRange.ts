/**
 * The dates a career record carries.
 *
 * Two rules decide what a date may be, and they are deliberately different:
 *
 *   1. A date may be in the past. A certificate issued in 2022, a role that
 *      ran from 2019 to 2021 and a course finished years ago are ordinary
 *      history. Nothing in this module compares a date with today, because
 *      history is not a mistake.
 *   2. The dates of one record must agree with each other. An end date
 *      before its start date is not history — it is a contradiction, and it
 *      is the one thing here that is refused.
 *
 * The second rule is the only rejection. It exists because a CV that says
 * "2024 – 2022" is wrong in a way the reader cannot see the cause of.
 *
 * The parsing lives here rather than in the server so the client and the
 * server can never disagree about what a date says.
 */

const MONTHS: Array<[RegExp, number]> = [
  [/^jan(?:uary)?\.?$/i, 1],
  [/^feb(?:ruary)?\.?$/i, 2],
  [/^mar(?:ch)?\.?$/i, 3],
  [/^apr(?:il)?\.?$/i, 4],
  [/^may\.?$/i, 5],
  [/^jun(?:e)?\.?$/i, 6],
  [/^jul(?:y)?\.?$/i, 7],
  [/^aug(?:ust)?\.?$/i, 8],
  [/^sep(?:t(?:ember)?)?\.?$/i, 9],
  [/^oct(?:ober)?\.?$/i, 10],
  [/^nov(?:ember)?\.?$/i, 11],
  [/^dec(?:ember)?\.?$/i, 12],
];

/**
 * What the application will and will not accept as a date.
 *
 * This is stated rather than implied, because the rule that a career date
 * may not be in the future is the one people expect to find, and it is the
 * one this application does not have.
 */
export const DATE_POLICY = {
  /** A date in the past is ordinary history and is always accepted. */
  allowsHistoricalDates: true,
  /** A date in the future is accepted where the record is planned activity. */
  allowsFutureDates: true,
  /** A record whose own dates contradict each other is refused. */
  enforcesChronology: true,
} as const;

/** The normalised form of a single date. */
export interface NormalizedDateValue {
  /** ISO `YYYY-MM-DD`, or null when the value is empty/unparseable/current. */
  date: string | null;
  /** True when the input is "Present"/"Current"/"Now"/"Ongoing". */
  isCurrent: boolean;
}

/** The normalised form of a start/end pair. */
export interface NormalizedDateRange {
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
}

/**
 * A date broken into the parts that could be read.
 *
 * The parts matter because two dates are compared at the precision both of
 * them actually carry: "2024" is not earlier than "Jun 2024" just because
 * January is earlier than June.
 */
export interface ParsedDate {
  /** ISO `YYYY-MM-DD`, or null when the value is empty, unparseable or current. */
  date: string | null;
  /** True when the input means "now". */
  isCurrent: boolean;
  /** The year, when one could be read. */
  year: number | null;
  /** The month, when one could be read. */
  month: number | null;
  /** The day, when one could be read. */
  day: number | null;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toIso(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    // Rejects dates such as 2022-02-30 instead of letting PostgreSQL reject
    // the whole insert.
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function monthNumber(token: string): number | null {
  const entry = MONTHS.find(([pattern]) => pattern.test(token));
  return entry ? entry[1] : null;
}

function expandYear(token: string): number {
  const year = Number(token);
  if (year >= 100) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

const EMPTY_DATE: ParsedDate = {
  date: null,
  isCurrent: false,
  year: null,
  month: null,
  day: null,
};

/**
 * Reads a date as a human writes it, keeping the precision that was written.
 *
 * "2022" keeps only the year, "Jun 2022" keeps the year and the month and
 * "2022-06-15" keeps all three. Nothing is invented and nothing is dropped.
 */
export function parseDate(value: unknown): ParsedDate {
  if (typeof value !== 'string') return EMPTY_DATE;
  const text = value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(?:since|from|starting)\s+/i, '')
    .replace(/\s+(?:approx\.?|approximately)$/i, '');
  if (!text) return EMPTY_DATE;

  if (/^(present|current|now|today|ongoing)$/i.test(text)) {
    return { date: null, isCurrent: true, year: null, month: null, day: null };
  }

  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return { date: toIso(year, month, day), isCurrent: false, year, month, day };
  }

  const yearMonth = text.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (yearMonth) {
    const year = Number(yearMonth[1]);
    const month = Number(yearMonth[2]);
    return { date: toIso(year, month, 1), isCurrent: false, year, month, day: null };
  }

  const monthYear = text.match(/^(\d{1,2})[/-](\d{4})$/);
  if (monthYear) {
    const year = Number(monthYear[2]);
    const month = Number(monthYear[1]);
    return { date: toIso(year, month, 1), isCurrent: false, year, month, day: null };
  }

  const namedMonthYear = text.match(/^([A-Za-z]+)\.?\s*,?\s*['’]?(\d{2,4})$/);
  if (namedMonthYear) {
    const month = monthNumber(namedMonthYear[1]);
    if (month) {
      const year = expandYear(namedMonthYear[2]);
      return { date: toIso(year, month, 1), isCurrent: false, year, month, day: null };
    }
  }

  const dayMonthYear = text.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s*,?\s*(\d{4})$/);
  if (dayMonthYear) {
    const month = monthNumber(dayMonthYear[2]);
    if (month) {
      const year = Number(dayMonthYear[3]);
      const day = Number(dayMonthYear[1]);
      return { date: toIso(year, month, day), isCurrent: false, year, month, day };
    }
  }

  const monthDayYear = text.match(/^([A-Za-z]+)\.?\s+(\d{1,2})\s*,?\s*(\d{4})$/);
  if (monthDayYear) {
    const month = monthNumber(monthDayYear[1]);
    if (month) {
      const year = Number(monthDayYear[3]);
      const day = Number(monthDayYear[2]);
      return { date: toIso(year, month, day), isCurrent: false, year, month, day };
    }
  }

  if (/^(?:19|20)\d{2}$/.test(text)) {
    // A year-only value is real evidence but the month is unknown. The first
    // of January is only the database representation; the UI keeps showing
    // the year from the stored period/description.
    const year = Number(text);
    return { date: `${text}-01-01`, isCurrent: false, year, month: null, day: null };
  }

  return EMPTY_DATE;
}

/**
 * Today, as `YYYY-MM-DD`.
 *
 * Only for the places where a date genuinely means "now" — the moment an
 * application was saved, for instance. It is never used to replace a date the
 * user wrote.
 */
export function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/**
 * Converts a date as a human writes it into the shape a PostgreSQL `date`
 * column accepts. Unparseable values become null; they are never guessed.
 */
export function normalizeDateValue(value: unknown): NormalizedDateValue {
  const parsed = parseDate(value);
  return { date: parsed.date, isCurrent: parsed.isCurrent };
}

/**
 * Normalises a start/end pair together. An end date of "Present" clears the
 * stored end date and marks the row current, so the two representations can
 * never disagree.
 */
export function normalizeDateRange(
  startDate: unknown,
  endDate: unknown,
  isCurrent?: unknown
): NormalizedDateRange {
  const start = normalizeDateValue(startDate);
  const end = normalizeDateValue(endDate);
  const current = Boolean(isCurrent) || end.isCurrent;
  return {
    startDate: start.date,
    endDate: current ? null : end.date,
    isCurrent: current,
  };
}

/**
 * Compares two dates at the precision both of them carry.
 *
 * Returns -1, 0 or 1, or null when the two cannot be compared at all.
 */
export function compareDateParts(a: ParsedDate, b: ParsedDate): number | null {
  if (a.year === null || b.year === null) return null;
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (a.month === null || b.month === null) return 0;
  if (a.month !== b.month) return a.month < b.month ? -1 : 1;
  if (a.day === null || b.day === null) return 0;
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  return 0;
}

/**
 * What is wrong with a pair of dates, if anything.
 */
export interface DateValidationProblem {
  /** The field the user has to correct. */
  field: 'startDate' | 'endDate' | 'issueDate' | 'expiryDate';
  /** A message the user can act on. */
  message: string;
}

/**
 * The error raised when a record's own dates contradict each other.
 *
 * It carries the HTTP status the API should answer with, so a contradiction
 * is reported as the user's mistake rather than as a server failure.
 */
export class DateValidationError extends Error {
  readonly status = 400;
  readonly field: DateValidationProblem['field'];

  constructor(problem: DateValidationProblem) {
    super(problem.message);
    this.name = 'DateValidationError';
    this.field = problem.field;
  }
}

/**
 * Checks that a start date and an end date agree.
 *
 * A record that is still running has no end date to disagree with. A record
 * with no readable dates has nothing to compare, and an unreadable date is
 * stored as unknown rather than guessed at.
 */
export function validateDateRange(
  startDate: unknown,
  endDate: unknown,
  isCurrent?: unknown
): DateValidationProblem | null {
  if (isCurrent === true) return null;

  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (end.isCurrent) return null;
  if (start.year === null || end.year === null) return null;

  const comparison = compareDateParts(start, end);
  if (comparison !== null && comparison > 0) {
    return {
      field: 'endDate',
      message: 'The end date must not be before the start date.',
    };
  }
  return null;
}

/**
 * Checks that a certificate's issue date and expiry date agree.
 *
 * A certificate that expires before it was issued is a contradiction. A
 * certificate with no expiry date — which is most of them — is fine.
 */
export function validateIssueDates(
  issueDate: unknown,
  expiryDate: unknown
): DateValidationProblem | null {
  const issue = parseDate(issueDate);
  const expiry = parseDate(expiryDate);
  if (issue.year === null || expiry.year === null) return null;

  const comparison = compareDateParts(issue, expiry);
  if (comparison !== null && comparison > 0) {
    return {
      field: 'expiryDate',
      message: 'The expiry date must not be before the issue date.',
    };
  }
  return null;
}
