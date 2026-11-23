/**
 * The chart design system, as one import.
 *
 * Every dashboard on the platform draws from these components, so a chart on
 * the Career Timeline, a chart on the Learning Hub and a chart in the admin
 * centre are the same chart: the same palette, the same spacing, the same
 * empty state, the same tooltip, the same motion.
 */

export { ChartCard } from './ChartCard';
export type { ChartCardProps } from './ChartCard';

export { BarChart } from './BarChart';
export type { BarChartProps } from './BarChart';

export { DonutChart } from './DonutChart';
export type { DonutChartProps } from './DonutChart';

export { LineChart } from './LineChart';
export type { LineChartProps } from './LineChart';

export { StatTile, ProgressMeter } from './StatTile';
export type { StatTileProps, ProgressMeterProps } from './StatTile';

export {
  CHART_PALETTE,
  chartColor,
  formatCount,
  formatPercent,
  shareOf,
  type ChartDatum,
} from './chartTheme';
