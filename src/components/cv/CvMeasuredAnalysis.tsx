import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Gauge, RefreshCw, Target, TrendingUp } from 'lucide-react';

import { useCareer } from '../../context/CareerContext';
import { apiRequest } from '../../lib/apiClient';
import type { CvAnalysisReport, CvDimensionKey } from '../../../shared/cvAnalysis.ts';

/** The document the panel measures. It is the candidate's own record. */
export interface MeasurableCv {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  title?: string;
  summary?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  experiences?: {
    company?: string;
    role?: string;
    period?: string;
    bullets?: string[];
    description?: string;
  }[];
  education?: {
    institution?: string;
    degree?: string;
    field?: string;
    period?: string;
    gpa?: string;
  }[];
  projects?: {
    title?: string;
    role?: string;
    technologies?: string[];
    bullets?: string[];
    description?: string;
  }[];
  skillsList?: string[];
  certifications?: string[];
}

/**
 * The six dimensions the radar draws, in the order they are drawn.
 *
 * A dimension the document cannot support is not drawn as a zero: it is drawn
 * as an axis without a reading, because a zero would say something the
 * document does not say.
 */
export const RADAR_DIMENSIONS: { key: CvDimensionKey; label: string }[] = [
  { key: 'clarity', label: 'Clarity' },
  { key: 'impact', label: 'Impact' },
  { key: 'ats', label: 'ATS' },
  { key: 'skills', label: 'Skills' },
  { key: 'experience', label: 'Experience' },
  { key: 'egyptMarketFit', label: 'Egypt Fit' },
];

const PRIORITY_LABEL: Record<string, string> = {
  now: 'Now',
  next: 'Next',
  later: 'Later',
};

interface MeasuredDimension {
  key: CvDimensionKey;
  label: string;
  score: number | null;
  available: boolean;
  summary: string;
  evidence: string[];
}

/** The dimensions of a report, in the order the radar draws them. */
export function measuredDimensions(report: CvAnalysisReport | null): MeasuredDimension[] {
  if (!report) return [];
  return RADAR_DIMENSIONS.map((entry) => {
    const measured = report.dimensions.find((item) => item.key === entry.key);
    return {
      ...entry,
      score: measured?.score ?? null,
      available: measured?.available ?? false,
      summary: measured?.summary ?? '',
      evidence: measured?.evidence ?? [],
    };
  });
}

/**
 * The radar.
 *
 * Six axes, one per dimension. The shape is drawn from the dimensions that
 * could be measured; an axis that could not be measured keeps its place on
 * the chart with no reading on it.
 */
export const CvMeasurementRadar: React.FC<{
  dimensions: MeasuredDimension[];
  isRtl: boolean;
  labelFor: (key: string) => string;
}> = ({ dimensions, isRtl, labelFor }) => {
  const size = 260;
  const centre = size / 2;
  const radius = 92;
  const count = dimensions.length;

  const pointAt = (index: number, value: number) => {
    // The first axis points up, and the rest follow clockwise.
    const angle = ((isRtl ? 90 : -90) + (index * 360) / count) * (Math.PI / 180);
    const distance = (radius * Math.max(0, Math.min(100, value))) / 100;
    return {
      x: centre + Math.cos(angle) * distance,
      y: centre + Math.sin(angle) * distance,
    };
  };

  const gridLevels = [25, 50, 75, 100];
  const measured = dimensions
    .map((dimension, index) =>
      dimension.available && dimension.score !== null ? pointAt(index, dimension.score) : null
    )
    .filter((point): point is { x: number; y: number } => point !== null);

  const polygon = measured.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="CV measurement radar"
        className="overflow-visible max-w-full h-auto"
      >
        {gridLevels.map((level) => (
          <polygon
            key={level}
            points={dimensions
              .map((_, index) => {
                const point = pointAt(index, level);
                return `${point.x},${point.y}`;
              })
              .join(' ')}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={1}
          />
        ))}

        {dimensions.map((dimension, index) => {
          const point = pointAt(index, 100);
          return (
            <line
              key={`axis-${dimension.key}`}
              x1={centre}
              y1={centre}
              x2={point.x}
              y2={point.y}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
          );
        })}

        {polygon && (
          <polygon
            points={polygon}
            fill="var(--color-primary)"
            fillOpacity={0.16}
            stroke="var(--color-primary-text)"
            strokeWidth={2}
          />
        )}

        {measured.map((point, index) => (
          <circle key={`point-${index}`} cx={point.x} cy={point.y} r={3} fill="var(--color-primary-text)" />
        ))}

        {dimensions.map((dimension, index) => {
          const point = pointAt(index, 118);
          const deltaX = point.x - centre;
          let anchor: 'start' | 'middle' | 'end' = 'middle';
          if (Math.abs(deltaX) >= 6) {
            const towardsStart = deltaX > 0;
            anchor = towardsStart === isRtl ? 'end' : 'start';
          }
          const measuredDimension = dimension.available && dimension.score !== null;
          return (
            <text
              key={`label-${dimension.key}`}
              x={point.x}
              y={point.y}
              textAnchor={anchor}
              dominantBaseline="middle"
              fontSize={11}
              fontWeight={600}
              fill={measuredDimension ? 'var(--color-text)' : 'var(--color-text-muted)'}
            >
              {labelFor(dimension.key)}
              {measuredDimension ? '' : ' —'}
            </text>
          );
        })}
      </svg>
    </div>
  );
};

/**
 * The measured report: every dimension with its evidence, the strengths, the
 * gaps and the plan that follows from them.
 */
export const CvMeasurementReport: React.FC<{
  report: CvAnalysisReport;
  dimensions?: MeasuredDimension[];
}> = ({ report, dimensions: provided }) => {
  const { t, settings } = useCareer();
  const isRtl = settings.language === 'ar';
  const dimensions = useMemo(
    () => provided ?? measuredDimensions(report),
    [provided, report]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,300px)_1fr] gap-6">
        <CvMeasurementRadar
          dimensions={dimensions}
          isRtl={isRtl}
          labelFor={(key) =>
            t(dimensions.find((entry) => entry.key === key)?.label ?? key)
          }
        />

        <div className="space-y-2">
          {dimensions.map((dimension) => (
            <div
              key={dimension.key}
              className="p-3.5 rounded-lg bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)]"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  {t(dimension.label)}
                </span>
                <span className="text-sm font-semibold font-mono tabular-nums text-[var(--text-primary)]">
                  {dimension.available && dimension.score !== null
                    ? `${dimension.score}%`
                    : t('Not measured')}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1">{dimension.summary}</p>
              {dimension.evidence.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {dimension.evidence.map((line, index) => (
                    <li key={index} className="text-[11px] text-[var(--text-muted)]">
                      • {line}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      {(report.strengths.length > 0 || report.weaknesses.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[var(--border-subtle)]">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-[var(--color-success-strong)] flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4" />
              {t('What this CV does well')}
            </h3>
            <ul className="space-y-1">
              {report.strengths.map((line, index) => (
                <li key={index} className="text-[11px] text-[var(--text-secondary)]">
                  • {line}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-[var(--color-warning)] flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />
              {t('What is missing')}
            </h3>
            <ul className="space-y-1">
              {report.weaknesses.map((line, index) => (
                <li key={index} className="text-[11px] text-[var(--text-secondary)]">
                  • {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {report.actionPlan.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-[var(--border-subtle)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
            <Target className="w-4 h-4 text-[var(--color-primary-text)]" />
            {t('Your next steps')}
          </h3>
          <div className="space-y-2">
            {report.actionPlan.map((item, index) => (
              <div
                key={index}
                className="p-3.5 rounded-lg bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] space-y-1"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">{item.title}</span>
                  <span className="text-[11px] font-semibold text-[var(--color-primary-text)]">
                    {t(PRIORITY_LABEL[item.priority] ?? item.priority)}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)]">{item.why}</p>
                <p className="text-[11px] text-[var(--text-muted)]">{item.how}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * The measured analysis of the CV.
 *
 * The score this panel shows is measured from the document: every dimension
 * comes from counting what is on the CV, and the panel shows the evidence
 * behind each one. It is a separate panel from the model's ATS suggestions on
 * purpose — one is a measurement, the other is advice.
 */
export const CvMeasuredAnalysis: React.FC<{
  cv: MeasurableCv | null;
  targetRoleTitle: string;
  targetRoleSkills?: string[];
  /**
   * Called whenever the measurement changes.
   *
   * The studio puts the measurement's advice next to the section it is
   * about, so the report has to reach it.
   */
  onMeasured?: (report: CvAnalysisReport | null) => void;
}> = ({ cv, targetRoleTitle, targetRoleSkills, onMeasured }) => {
  const { t } = useCareer();

  const [report, setReport] = useState<CvAnalysisReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The caller builds the skill list from the catalogue on every render, so
  // its identity changes constantly. The measurement must depend on what the
  // list says, not on which array instance carried it.
  const skillsRef = useRef(targetRoleSkills);
  skillsRef.current = targetRoleSkills;
  const skillsKey = (targetRoleSkills ?? []).join('|');

  // A measurement that is already on its way must not overwrite a newer one.
  const requestRef = useRef(0);

  const measure = useCallback(async () => {
    if (!cv) {
      setReport(null);
      onMeasured?.(null);
      return;
    }
    const request = requestRef.current + 1;
    requestRef.current = request;
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<{ analysis: CvAnalysisReport }>('/api/cv/analysis', {
        method: 'POST',
        body: JSON.stringify({
          cv,
          targetRoleTitle,
          targetRoleSkills: skillsRef.current,
        }),
      });
      if (requestRef.current !== request) return;
      setReport(result.analysis);
      onMeasured?.(result.analysis);
    } catch (failure) {
      if (requestRef.current !== request) return;
      setReport(null);
      onMeasured?.(null);
      setError(
        failure instanceof Error ? failure.message : 'The CV could not be measured right now.'
      );
    } finally {
      if (requestRef.current === request) setLoading(false);
    }
  }, [cv, targetRoleTitle, skillsKey]);

  useEffect(() => {
    void measure();
  }, [measure]);

  if (!cv) return null;

  return (
    <section className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Gauge className="w-5 h-5 text-[var(--color-primary-text)]" />
            {t('Measured analysis')}
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            {t('Every number below is counted from your CV. Nothing here is a guess.')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {report && (
            <div className="text-end">
              <div className="text-3xl font-extrabold font-mono tabular-nums text-[var(--color-primary-text)]">
                {report.overallScore}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">/ 100</div>
            </div>
          )}
          <button
            type="button"
            onClick={() => void measure()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-secondary)] disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('Measure again')}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
          <AlertCircle className="w-4 h-4 shrink-0 text-[var(--color-warning)]" />
          <span>{error}</span>
        </div>
      )}

      {loading && !report && (
        <p className="text-xs text-[var(--text-muted)]">{t('Measuring your CV…')}</p>
      )}

      {report && <CvMeasurementReport report={report} />}
    </section>
  );
};
