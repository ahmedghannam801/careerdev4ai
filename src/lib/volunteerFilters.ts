/**
 * The filters of the Volunteer & Training catalogue.
 * ---------------------------------------------------------------------------
 * The page used to show every filter at once, permanently, above the results:
 * four rows of chips for type, place, audience and focus, before the candidate
 * had seen a single opportunity. On a phone that was most of the screen.
 *
 * These are the filters that did not exist yet — the ones the catalogue's own
 * fields support and that a candidate actually uses: the category, the skill,
 * the place, and where the opportunity stands. They are multi-select, because
 * "a remote role in Cairo, in data" is a real request and three separate
 * single-choice rows cannot express it.
 *
 * This module is pure, so the rules can be reasoned about and tested without a
 * browser: which options exist, which opportunities survive a set of filters,
 * and how the selected filters are counted and named.
 *
 * NOTHING HERE IS INVENTED.
 *
 * Every option offered is a value that appears on a record in the catalogue.
 * A filter with no options is not shown at all, so the page can never offer a
 * choice that filters nothing.
 */

import type { VolunteerOpportunity } from './personalizationApi';

/** One choice in a filter, and how many records carry it. */
export interface VolunteerFilterOption {
  /** The value, exactly as the record holds it. */
  value: string;
  /** How many opportunities in the catalogue carry it. */
  count: number;
}

/** The multi-select filters, all of them optional. */
export interface VolunteerAdvancedFilters {
  /** The catalogue category, as the record holds it. */
  categories: string[];
  /** A skill the opportunity asks for or gives. */
  skills: string[];
  /** The place the opportunity is based in. */
  locations: string[];
  /** Where the opportunity stands: open, closed, and so on. */
  statuses: string[];
}

/** No filters at all. */
export const EMPTY_ADVANCED_FILTERS: VolunteerAdvancedFilters = {
  categories: [],
  skills: [],
  locations: [],
  statuses: [],
};

/** Adds a value to a list, or takes it out. The list is never mutated. */
export function toggleInList(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((entry) => entry !== value)
    : [...list, value];
}

/**
 * The options of each multi-select filter, taken from the records themselves.
 *
 * A value is only offered when a record carries it, so the panel can never
 * show a choice that would filter everything away. The counts are the number
 * of records that carry the value, so the candidate can see what choosing it
 * would leave behind.
 */
export function collectAdvancedFilterOptions(
  items: VolunteerOpportunity[]
): Record<keyof VolunteerAdvancedFilters, VolunteerFilterOption[]> {
  const count = (values: string[]) => {
    const tally = new Map<string, number>();
    for (const value of values) {
      const key = value.trim();
      if (!key) continue;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    return [...tally.entries()]
      .map(([value, total]) => ({ value, count: total }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  };

  return {
    categories: count(items.map((item) => item.category ?? '')),
    skills: count(
      items.flatMap((item) => [...(item.requiredSkills ?? []), ...(item.skillsGained ?? [])])
    ),
    locations: count(items.map((item) => item.location ?? '')),
    statuses: count(items.map((item) => item.status ?? '')),
  };
}

/** The skills of one opportunity: the ones it asks for and the ones it gives. */
function skillsOf(item: VolunteerOpportunity): string[] {
  return [...(item.requiredSkills ?? []), ...(item.skillsGained ?? [])].map((skill) =>
    skill.trim()
  );
}

/**
 * Keeps the opportunities that match every selected filter.
 *
 * A multi-select filter is an OR inside itself and an AND with the others:
 * choosing Cairo and Giza keeps both, but keeps only the records that are in
 * one of them. Every selected filter has to be satisfied, so adding a filter
 * always narrows the list.
 */
export function filterByAdvancedFilters(
  items: VolunteerOpportunity[],
  filters: VolunteerAdvancedFilters
): VolunteerOpportunity[] {
  return items.filter((item) => {
    if (
      filters.categories.length > 0 &&
      !filters.categories.includes(item.category ?? '')
    ) {
      return false;
    }
    if (filters.locations.length > 0 && !filters.locations.includes(item.location ?? '')) {
      return false;
    }
    if (filters.statuses.length > 0 && !filters.statuses.includes(item.status ?? '')) {
      return false;
    }
    if (filters.skills.length > 0) {
      const skills = skillsOf(item);
      const matches = filters.skills.some((skill) => skills.includes(skill));
      if (!matches) return false;
    }
    return true;
  });
}

/** How many filters are selected across every multi-select filter. */
export function countAdvancedFilters(filters: VolunteerAdvancedFilters): number {
  return (
    filters.categories.length +
    filters.skills.length +
    filters.locations.length +
    filters.statuses.length
  );
}

/** A selected filter, as the chip that shows it. */
export interface VolunteerFilterIndicator {
  /** Which filter the value belongs to. */
  group: keyof VolunteerAdvancedFilters;
  /** The value itself. */
  value: string;
}

/** Every selected filter, as the chips that show what is narrowing the list. */
export function activeFilterIndicators(
  filters: VolunteerAdvancedFilters
): VolunteerFilterIndicator[] {
  const indicators: VolunteerFilterIndicator[] = [];
  for (const group of Object.keys(filters) as Array<keyof VolunteerAdvancedFilters>) {
    for (const value of filters[group]) indicators.push({ group, value });
  }
  return indicators;
}

/**
 * The words the search box looks for.
 *
 * The search covers what a candidate would type: the opportunity, who is
 * offering it, where it is, what it needs and what it gives. A search that
 * only read the title would miss an opportunity a candidate remembers by its
 * organisation or its skill.
 */
export function opportunitySearchText(item: VolunteerOpportunity): string {
  return [
    item.title,
    item.organization,
    item.description,
    item.category,
    item.location,
    item.eligibility ?? '',
    item.commitment ?? '',
    ...(item.tags ?? []),
    ...(item.skillsGained ?? []),
    ...(item.requiredSkills ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Whether an opportunity matches what the candidate typed. */
export function matchesOpportunitySearch(
  item: VolunteerOpportunity,
  term: string
): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return opportunitySearchText(item).includes(needle);
}
