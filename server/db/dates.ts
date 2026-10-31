// Normalisation of the free-text dates the client and the CV importer send.
//
// PostgreSQL `date` columns accept only ISO `YYYY-MM-DD`. The UI and the CV
// review step legitimately speak in "Jan 2022" / "2021" / "Present", so the
// conversion belongs at the database boundary, once, instead of in every
// route and importer. An unrecognised value is stored as NULL rather than
// being guessed or sent to PostgreSQL to fail the whole request.
//
// The rules themselves live in `shared/dateRange.ts`, so the client, the
// server and the tests all read a date the same way. This module stays as
// the server's entry point into them.

export {
  DATE_POLICY,
  DateValidationError,
  compareDateParts,
  normalizeDateRange,
  normalizeDateValue,
  parseDate,
  validateDateRange,
  validateIssueDates,
} from '../../shared/dateRange.ts';

export type {
  DateValidationProblem,
  NormalizedDateRange,
  NormalizedDateValue,
  ParsedDate,
} from '../../shared/dateRange.ts';
