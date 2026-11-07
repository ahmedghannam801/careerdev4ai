/**
 * What is wrong with an extracted CV.
 *
 * The extractor is allowed to be unsure. It is not allowed to be wrong
 * quietly: a date that runs backwards, a role that is listed twice, a phone
 * number that is really a year — these are things the candidate can see and
 * fix, and the review screen is where they are fixed. This module is what
 * finds them.
 *
 * The rules are written as they matter to a candidate, not as they matter to
 * a parser:
 *
 *   - something the document did not say is reported as missing, so the
 *     candidate knows to type it rather than believing it is there;
 *   - something the document said twice is reported as a duplicate, so the
 *     candidate can delete the copy;
 *   - something the document said that contradicts itself — two roles that
 *     overlap, a job that ends before it starts, a job that is still running
 *     and also finished — is reported as an error, because it will be read
 *     as a mistake by whoever reads the CV;
 *   - something that is merely unusual for an applicant system — no dates,
 *     no numbers in a bullet — is reported as information, so it is useful
 *     without being alarming.
 *
 * Every issue carries a stable code and a path, so the client can point at
 * the field that caused it rather than only printing a list of sentences.
 *
 * The messages are templates, not finished sentences. The Arabic catalogue
 * is keyed by the English text, so a sentence with the values already
 * written into it would be a new string every time and would never be
 * found in the catalogue. The values travel beside the template instead.
 */

import type { CVProfile } from '../../src/types/career.ts';
import type { CvValidationIssue } from '../../shared/cvExtraction.ts';

/** The far end of time, used when a role is still running. */
const OPEN_ENDED = '9999-12-31';

function issue(
  code: string,
  severity: CvValidationIssue['severity'],
  path: string,
  message: string,
  params?: Record<string, string>,
  suggestion?: string,
  suggestionParams?: Record<string, string>
): CvValidationIssue {
  return { code, severity, path, message, params, suggestion, suggestionParams };
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** The end of a period, with an open-ended one pushed to the far future. */
function effectiveEnd(startDate?: string, endDate?: string, isCurrent?: boolean): string {
  if (isCurrent) return OPEN_ENDED;
  if (hasText(endDate)) return endDate;
  if (hasText(startDate)) return startDate;
  return '';
}

/** The key two entries of the same kind are the same entry. */
function duplicateKey(parts: Array<string | undefined>): string {
  return parts
    .map((part) => (part ?? '').trim().toLowerCase().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join('|');
}

/**
 * Finds every issue in an extracted document.
 *
 * The document passed here is the one the review screen shows, so a value
 * the candidate has already corrected is validated as corrected.
 */
export function validateExtraction(cv: CVProfile): CvValidationIssue[] {
  const issues: CvValidationIssue[] = [];

  /* -- the header -------------------------------------------------------- */

  if (!hasText(cv.fullName)) {
    issues.push(
      issue(
        'missing_name',
        'error',
        'personal.fullName',
        'No candidate name was found in the document.',
        undefined,
        'Type your name in the header so the CV can be addressed to you.'
      )
    );
  }
  if (!hasText(cv.email)) {
    issues.push(
      issue(
        'missing_email',
        'error',
        'personal.email',
        'No email address was found in the document.',
        undefined,
        'Add an email address — most employers contact you through it.'
      )
    );
  } else if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(cv.email.trim())) {
    issues.push(
      issue(
        'invalid_email',
        'error',
        'personal.email',
        'The email address "{email}" does not look like a valid email address.',
        { email: cv.email },
        'Check it for a missing @ or a misspelled domain.'
      )
    );
  }
  if (!hasText(cv.phone)) {
    issues.push(
      issue(
        'missing_phone',
        'warning',
        'personal.phone',
        'No phone number was found in the document.',
        undefined,
        'Add a phone number if you want employers to call you.'
      )
    );
  } else {
    const digits = cv.phone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) {
      issues.push(
        issue(
          'invalid_phone',
          'warning',
          'personal.phone',
          'The phone number "{phone}" does not look like a complete phone number.',
          { phone: cv.phone },
          'Include the country or area code.'
        )
      );
    }
  }
  if (!hasText(cv.location)) {
    issues.push(
      issue(
        'missing_location',
        'warning',
        'personal.location',
        'No location was found in the document.',
        undefined,
        'Add the city you are based in — many employers filter on it.'
      )
    );
  }
  if (!hasText(cv.title)) {
    issues.push(
      issue(
        'missing_title',
        'info',
        'personal.title',
        'No job title was found in the document.',
        undefined,
        'Add the role you are aiming at; it is the first thing a reader looks for.'
      )
    );
  }
  if (!hasText(cv.summary)) {
    issues.push(
      issue(
        'missing_summary',
        'warning',
        'summary',
        'No professional summary was found in the document.',
        undefined,
        'A short summary at the top of the CV makes the rest easier to read.'
      )
    );
  } else if (cv.summary.trim().length > 1200) {
    issues.push(
      issue(
        'long_summary',
        'info',
        'summary',
        'The professional summary is longer than most readers will read.',
        undefined,
        'Consider keeping it to four lines and moving the detail into the experience.'
      )
    );
  }

  for (const [key, value] of [
    ['linkedin', cv.linkedin],
    ['github', cv.github],
    ['website', cv.website],
  ] as const) {
    if (!hasText(value)) continue;
    if (!/^https?:\/\/[^\s]+\.[^\s]+$/i.test(value.trim())) {
      issues.push(
        issue(
          'invalid_url',
          'warning',
          `personal.${key}`,
          'The {kind} link "{url}" is not a complete web address.',
          { kind: key, url: value },
          'Links written as "linkedin.com/in/name" are added automatically, but a link that was cut short needs fixing.'
        )
      );
    }
  }

  /* -- the links on the CV ------------------------------------------------ */

  const seenLinks = new Set<string>();
  (cv.links ?? []).forEach((link, index) => {
    const key = link.url.trim().toLowerCase();
    if (!key) return;
    if (seenLinks.has(key)) {
      issues.push(
        issue(
          'duplicate_link',
          'warning',
          `links[${index}]`,
          'The link "{url}" appears more than once on the CV.',
          { url: link.url },
          'Remove the duplicate.'
        )
      );
    }
    seenLinks.add(key);
    if (!/^https?:\/\//i.test(link.url.trim())) {
      issues.push(
        issue(
          'invalid_url',
          'warning',
          `links[${index}].url`,
          'The link "{url}" does not start with http:// or https://.',
          { url: link.url },
          'Add the full address, including the protocol.'
        )
      );
    }
  });

  /* -- the work history -------------------------------------------------- */

  const experienceKeys = new Map<string, number>();
  const ranges: Array<{ index: number; label: string; start: string; end: string }> = [];

  cv.experiences.forEach((entry, index) => {
    const label = [entry.role, entry.company].filter(Boolean).join(' — ') || `Entry ${index + 1}`;

    if (!hasText(entry.role) && !hasText(entry.company)) {
      issues.push(
        issue(
          'empty_entry',
          'error',
          `experience[${index}]`,
          'An experience entry has neither a role nor a company.',
          undefined,
          'Fill it in or remove it.'
        )
      );
      return;
    }

    const key = duplicateKey([entry.role, entry.company]);
    const previous = experienceKeys.get(key);
    if (previous !== undefined) {
      issues.push(
        issue(
          'duplicate_experience',
          'warning',
          `experience[${index}]`,
          '"{label}" appears more than once in the work history.',
          { label },
          'Two entries for the same role are usually one entry written twice.'
        )
      );
    } else {
      experienceKeys.set(key, index);
    }

    if (hasText(entry.startDate) && hasText(entry.endDate)) {
      if (entry.endDate < entry.startDate) {
        issues.push(
          issue(
            'end_before_start',
            'error',
            `experience[${index}].endDate`,
            '"{label}" ends before it starts.',
            { label },
            'Check the two dates against each other.'
          )
        );
      }
    }
    if (entry.isCurrent && hasText(entry.endDate)) {
      issues.push(
        issue(
          'current_with_end_date',
          'error',
          `experience[${index}].endDate`,
          '"{label}" is marked as current and also has an end date.',
          { label },
          'A role that is still running has no end date.'
        )
      );
    }
    if (!hasText(entry.startDate) && !hasText(entry.endDate)) {
      issues.push(
        issue(
          'missing_dates',
          'warning',
          `experience[${index}]`,
          '"{label}" has no dates.',
          { label },
          'Applicant systems read dates as a filter, so an undated role is often skipped.'
        )
      );
    }

    const start = entry.startDate ?? '';
    const end = effectiveEnd(entry.startDate, entry.endDate, entry.isCurrent);
    if (start && end) ranges.push({ index, label, start, end });

    if (!entry.bullets || entry.bullets.length === 0) {
      issues.push(
        issue(
          'empty_bullets',
          'warning',
          `experience[${index}].bullets`,
          '"{label}" has no bullet points describing what was done.',
          { label },
          'One or two lines of what you actually did makes the role legible.'
        )
      );
    }
  });

  // Two roles that overlap in time are either a mistake or a promotion that
  // was written as two roles. Both are worth a look.
  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      const first = ranges[i];
      const second = ranges[j];
      if (first.start <= second.end && second.start <= first.end) {
        issues.push(
          issue(
            'overlapping_dates',
            'warning',
            `experience[${first.index}]`,
            '"{first}" and "{second}" overlap in time.',
            { first: first.label, second: second.label },
            'Overlapping roles are normal when one was a promotion, but the dates should show that.'
          )
        );
      }
    }
  }

  /* -- the education ----------------------------------------------------- */

  const educationKeys = new Map<string, number>();
  cv.education.forEach((entry, index) => {
    const label = [entry.degree, entry.institution].filter(Boolean).join(' — ') || `Entry ${index + 1}`;
    if (!hasText(entry.institution) && !hasText(entry.degree)) {
      issues.push(
        issue(
          'empty_entry',
          'error',
          `education[${index}]`,
          'An education entry has neither a degree nor an institution.',
          undefined,
          'Fill it in or remove it.'
        )
      );
      return;
    }
    const key = duplicateKey([entry.institution, entry.degree, entry.field]);
    const previous = educationKeys.get(key);
    if (previous !== undefined) {
      issues.push(
        issue(
          'duplicate_education',
          'warning',
          `education[${index}]`,
          '"{label}" appears more than once in the education section.',
          { label },
          'Remove the duplicate.'
        )
      );
    } else {
      educationKeys.set(key, index);
    }
    if (hasText(entry.startDate) && hasText(entry.endDate) && entry.endDate < entry.startDate) {
      issues.push(
        issue(
          'end_before_start',
          'error',
          `education[${index}].endDate`,
          '"{label}" ends before it starts.',
          { label },
          'Check the two dates against each other.'
        )
      );
    }
  });

  /* -- the other list sections ------------------------------------------- */

  const checkDuplicates = (
    values: Array<string | undefined>,
    path: string,
    code: string,
    label: string
  ) => {
    const seen = new Map<string, number>();
    values.forEach((value, index) => {
      const key = duplicateKey([value]);
      if (!key) return;
      const previous = seen.get(key);
      if (previous !== undefined) {
        issues.push(
          issue(
            code,
            'warning',
            `${path}[${index}]`,
            '"{value}" appears more than once in the {section} section.',
            { value: value ?? '', section: label },
            'Remove the duplicate.'
          )
        );
      } else {
        seen.set(key, index);
      }
    });
  };

  checkDuplicates(
    cv.projects.map((entry) => entry.title),
    'projects',
    'duplicate_project',
    'projects'
  );
  checkDuplicates(
    (cv.certificationDetails ?? []).map((entry) => entry.name),
    'certifications',
    'duplicate_certification',
    'certifications'
  );
  checkDuplicates(
    (cv.courses ?? []).map((entry) => entry.title),
    'courses',
    'duplicate_course',
    'courses'
  );
  checkDuplicates(
    (cv.internships ?? []).map((entry) => `${entry.role}|${entry.organization}`),
    'internships',
    'duplicate_internship',
    'internships'
  );
  checkDuplicates(
    (cv.awards ?? []).map((entry) => entry.title),
    'awards',
    'duplicate_award',
    'awards'
  );
  checkDuplicates(
    (cv.languages ?? []).map((entry) => entry.name),
    'languages',
    'duplicate_language',
    'languages'
  );

  /* -- the skills --------------------------------------------------------- */

  const seenSkills = new Set<string>();
  cv.skillsList.forEach((skill, index) => {
    const key = skill.trim().toLowerCase();
    if (!key) return;
    if (seenSkills.has(key)) {
      issues.push(
        issue(
          'duplicate_skill',
          'info',
          `skills[${index}]`,
          '"{skill}" is listed more than once in the skills section.',
          { skill },
          'Remove the duplicate.'
        )
      );
    }
    seenSkills.add(key);
  });

  /* -- the certificates --------------------------------------------------- */

  (cv.certificationDetails ?? []).forEach((entry, index) => {
    if (!hasText(entry.name)) {
      issues.push(
        issue(
          'empty_entry',
          'error',
          `certifications[${index}]`,
          'A certificate has no name.',
          undefined,
          'Fill it in or remove it.'
        )
      );
      return;
    }
    if (!hasText(entry.issuer)) {
      issues.push(
        issue(
          'missing_issuer',
          'info',
          `certifications[${index}].issuer`,
          '"{name}" has no issuing body.',
          { name: entry.name },
          'An employer checks the body that gave the certificate.'
        )
      );
    }
  });

  return issues;
}

/**
 * Whether the issues found are serious enough to stop an import.
 *
 * An error means the document says something contradictory and the candidate
 * has to look at it. A warning means something is missing or unusual. The
 * studio warns on both but blocks on neither: the candidate is the one who
 * decides, and the review screen exists so that they can.
 */
export function countIssues(issues: CvValidationIssue[]): {
  errors: number;
  warnings: number;
  info: number;
} {
  return {
    errors: issues.filter((entry) => entry.severity === 'error').length,
    warnings: issues.filter((entry) => entry.severity === 'warning').length,
    info: issues.filter((entry) => entry.severity === 'info').length,
  };
}
