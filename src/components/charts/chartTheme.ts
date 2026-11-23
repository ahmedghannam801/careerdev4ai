/**
 * The chart design system.
 *
 * ONE PLACE THAT DECIDES HOW A CHART LOOKS
 * ----------------------------------------
 * Every visualisation on the platform is built from the components in this
 * folder, and every colour, radius, gap and motion decision lives here. A
 * chart added to a new screen therefore matches the charts that were already
 * there, instead of becoming the one panel with a different palette.
 *
 * WHAT A CHART IS ALLOWED TO SAY
 * ------------------------------
 * A chart is only ever drawn from a number the page already has: a count of
 * the candidate's own records, a percentage the server computed, a series the
 * database returned. There is no sample data, no placeholder value and no
 * "demo" mode here. When there is nothing to draw, the chart shows an empty
 * state and says why — it never draws zeros to look complete.
 *
 * MOTION
 * ------
 * The animation is a CSS transition on a property the browser already
 * animates cheaply (a width, an offset, a stroke dash). Nothing here runs on
 * scroll, nothing listens to the pointer to re-render, and every transition is
 * removed under `prefers-reduced-motion`.
 */

/** One value in a chart. */
export interface ChartDatum {
  /** A stable identity, unique within the chart. */
  key: string;
  /** The word the reader sees. */
  label: string;
  /** The number itself. Never a made-up one. */
  value: number;
  /** A sentence shown in the tooltip, when the label alone is not enough. */
  hint?: string;
  /** An explicit colour. When absent, the palette assigns one by position. */
  color?: string;
}

/** The palette, as CSS custom properties, so both themes are covered. */
export const CHART_PALETTE = [
  'var(--accent-primary)',
  'var(--color-success-strong)',
  'var(--color-ai)',
  'var(--color-accent-strong)',
  'var(--color-info)',
  'var(--color-warning)',
] as const;

/** The colour of the datum at `index`. */
export function chartColor(index: number, datum?: ChartDatum): string {
  return datum?.color ?? CHART_PALETTE[index % CHART_PALETTE.length];
}

/** Formats a plain count, in the reader's own digits. */
export function formatCount(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale ?? undefined).format(value);
}

/** Formats a whole-number percentage. */
export function formatPercent(value: number, locale?: string): string {
  return `${formatCount(Math.round(value), locale)}%`;
}

/**
 * The share of a whole, as a whole-number percentage.
 *
 * A zero total has no share: it returns 0 rather than dividing by zero, and
 * the caller shows its empty state instead.
 */
export function shareOf(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, (value / total) * 100));
}
