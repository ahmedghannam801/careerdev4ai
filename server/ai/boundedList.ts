// Bounds a list that is about to be embedded in an AI prompt.
//
// The count and each entry's length are both capped, so a single request
// cannot push an unbounded payload into the model's context and consume the
// project's daily quota.
//
// It lives here because two places need it: the API routes, and the background
// task that writes a cover letter. One implementation means the background
// task cannot accidentally be the place where the limit is missing.

export const boundedList = (value: unknown, maxItems: number, maxItemLength: number): unknown[] => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((entry) => {
    if (typeof entry === 'string') return entry.slice(0, maxItemLength);
    if (entry && typeof entry === 'object') {
      // Keep the shape but bound every string inside it.
      const bounded: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(entry as Record<string, unknown>)) {
        bounded[key] = typeof item === 'string' ? item.slice(0, maxItemLength) : item;
      }
      return bounded;
    }
    return entry;
  });
};
