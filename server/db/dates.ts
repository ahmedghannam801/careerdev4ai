// Normalisation of the free-text dates the client and the CV importer send.
//
// PostgreSQL `date` columns accept only ISO `YYYY-MM-DD`. The UI and the CV
// review step legitimately speak in "Jan 2022" / "2021" / "Present", so the
// conversion belongs at the database boundary, once, instead of in every
// route and importer. An unrecognised value is stored as NULL rather than
// being guessed or sent to PostgreSQL to fail the whole request.

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

export interface NormalizedDateValue {
  /** ISO `YYYY-MM-DD`, or null when the value is empty/unparseable/current. */
  date: string | null;
  /** True when the input is "Present"/"Current"/"Now"/"Ongoing". */
  isCurrent: boolean;
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

/**
 * Converts a date as a human writes it into the shape a PostgreSQL `date`
 * column accepts. Unparseable values become null; they are never guessed.
 */
export function normalizeDateValue(value: unknown): NormalizedDateValue {
  if (typeof value !== 'string') return { date: null, isCurrent: false };
  const text = value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(?:since|from|starting)\s+/i, '')
    .replace(/\s+(?:approx\.?|approximately)$/i, '');
  if (!text) return { date: null, isCurrent: false };

  if (/^(present|current|now|today|ongoing)$/i.test(text)) {
    return { date: null, isCurrent: true };
  }

  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    return {
      date: toIso(Number(iso[1]), Number(iso[2]), Number(iso[3])),
      isCurrent: false,
    };
  }

  const yearMonth = text.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (yearMonth) {
    return {
      date: toIso(Number(yearMonth[1]), Number(yearMonth[2]), 1),
      isCurrent: false,
    };
  }

  const monthYear = text.match(/^(\d{1,2})[/-](\d{4})$/);
  if (monthYear) {
    return {
      date: toIso(Number(monthYear[2]), Number(monthYear[1]), 1),
      isCurrent: false,
    };
  }

  const namedMonthYear = text.match(/^([A-Za-z]+)\.?\s*,?\s*['’]?(\d{2,4})$/);
  if (namedMonthYear) {
    const month = monthNumber(namedMonthYear[1]);
    if (month) {
      return {
        date: toIso(expandYear(namedMonthYear[2]), month, 1),
        isCurrent: false,
      };
    }
  }

  const dayMonthYear = text.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s*,?\s*(\d{4})$/);
  if (dayMonthYear) {
    const month = monthNumber(dayMonthYear[2]);
    if (month) {
      return {
        date: toIso(Number(dayMonthYear[3]), month, Number(dayMonthYear[1])),
        isCurrent: false,
      };
    }
  }

  const monthDayYear = text.match(/^([A-Za-z]+)\.?\s+(\d{1,2})\s*,?\s*(\d{4})$/);
  if (monthDayYear) {
    const month = monthNumber(monthDayYear[1]);
    if (month) {
      return {
        date: toIso(Number(monthDayYear[3]), month, Number(monthDayYear[2])),
        isCurrent: false,
      };
    }
  }

  if (/^(?:19|20)\d{2}$/.test(text)) {
    // A year-only value is real evidence but the month is unknown. The first
    // of January is only the database representation; the UI keeps showing
    // the year from the stored period/description.
    return { date: `${text}-01-01`, isCurrent: false };
  }

  return { date: null, isCurrent: false };
}

export interface NormalizedDateRange {
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
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
