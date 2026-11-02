/**
 * The Opportunities & Activities hub.
 *
 * The page began as a volunteering catalogue. It now covers the wider
 * ecosystem the user asked for: volunteering, student activities, youth
 * programmes, career development, competitions, entrepreneurship,
 * fellowships, internships, academic and technology programmes.
 *
 * Every row is a real catalogue entry. The list is ordered by how closely the
 * opportunity matches the user's own skill gaps, target role, roadmap and
 * interests, and the reason for the order is shown on the card. Ordering never
 * hides a row: the full live catalogue stays browsable, and expired rows are
 * removed because they can no longer be applied to.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  BadgeCheck,
  Bookmark,
  BookmarkCheck,
  Building2,
  CalendarDays,
  Clock,
  ExternalLink,
  Filter,
  Globe,
  GraduationCap,
  Languages,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  X,
} from 'lucide-react';
import {
  fetchVolunteerOpportunities,
  saveVolunteerOpportunity,
  unsaveVolunteerOpportunity,
  type VolunteerOpportunity,
} from '../../lib/personalizationApi';
import { useCareer } from '../../context/CareerContext';
import {
  AUDIENCE_LABELS,
  OPPORTUNITY_KINDS,
  OPPORTUNITY_LABELS,
  PARTICIPATION_LABELS,
  type OpportunityAudience,
  type OpportunityKind,
} from '../../../shared/opportunities';
import { trackEvent } from '../../lib/analytics';

interface VolunteerOpportunitiesProps {
  /** Called when the user wants to record a stint they just started. */
  onRecordStint?: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  ongoing: 'Ongoing',
  program: 'Programme',
  remote: 'Remote',
  event: 'Event',
};

type ModeFilter = 'all' | 'egypt' | 'online' | 'hybrid';
type AudienceFilter = 'all' | OpportunityAudience;

const MODE_OPTIONS: Array<{ id: ModeFilter; label: string }> = [
  { id: 'all', label: 'Anywhere' },
  { id: 'egypt', label: 'Egypt' },
  { id: 'online', label: 'Online' },
  { id: 'hybrid', label: 'Hybrid' },
];

/**
 * The focus vocabulary the brief asks for. A chip only appears when the live
 * catalogue actually contains a matching tag or kind, so an empty filter is
 * never offered.
 */
const FOCUS_KEYS = [
  'leadership',
  'technology',
  'business',
  'hr',
  'data',
  'marketing',
  'pr',
  'ai',
  'entrepreneurship',
  'volunteering',
  'competition',
  'training',
  'internship',
] as const;

const FOCUS_LABELS: Record<string, string> = {
  leadership: 'Leadership',
  technology: 'Technology',
  business: 'Business',
  hr: 'HR',
  data: 'Data',
  marketing: 'Marketing',
  pr: 'PR',
  ai: 'AI',
  entrepreneurship: 'Entrepreneurship',
  volunteering: 'Volunteering',
  competition: 'Competitions',
  training: 'Training',
  internship: 'Internships',
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

function matchesFocus(item: VolunteerOpportunity, focus: string): boolean {
  if (focus === 'all') return true;
  const tags = item.tags.map(normalize);
  if (tags.includes(focus)) return true;
  if (focus === 'volunteering') return item.kind === 'volunteering';
  if (focus === 'competition') return item.kind === 'competition';
  if (focus === 'internship') return item.kind === 'internship';
  if (focus === 'entrepreneurship') return item.kind === 'entrepreneurship';
  if (focus === 'technology') return item.kind === 'technology' || tags.includes('tech');
  if (focus === 'hr') return tags.includes('hr') || tags.includes('human resources');
  if (focus === 'pr') return tags.includes('pr') || tags.includes('public relations');
  if (focus === 'training') {
    return tags.includes('training') || item.opportunityType === 'program';
  }
  return false;
}

export const VolunteerOpportunities: React.FC<VolunteerOpportunitiesProps> = ({
  onRecordStint,
}) => {
  const { t } = useCareer();
  const [opportunities, setOpportunities] = useState<VolunteerOpportunity[]>([]);
  const [search, setSearch] = useState('');
  const [activeKind, setActiveKind] = useState<OpportunityKind | 'all'>('all');
  const [activeMode, setActiveMode] = useState<ModeFilter>('all');
  const [activeAudience, setActiveAudience] = useState<AudienceFilter>('all');
  const [activeFocus, setActiveFocus] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchVolunteerOpportunities()
      .then((response) => {
        if (cancelled) return;
        setOpportunities(response.opportunities ?? []);
        setError(null);
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return;
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'The opportunities catalogue could not be loaded.'
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Expired rows are hidden in the catalogue, not merely ranked last: an
  // application link that no longer accepts applications is not actionable.
  const catalogue = useMemo(() => opportunities.filter((item) => item.live), [opportunities]);

  // The funnel records that the opportunities catalogue was reached. Only the
  // size of the catalogue and the filter that was active are reported — never
  // the opportunities themselves, and never anything about the person looking.
  useEffect(() => {
    if (isLoading || catalogue.length === 0) return;
    trackEvent('opportunity_view', {
      count: catalogue.length,
      opportunity_category: activeKind === 'all' ? 'all' : activeKind,
    });
  }, [isLoading, catalogue.length, activeKind]);

  const kindOptions = useMemo(
    () =>
      OPPORTUNITY_KINDS.map((kind) => ({
        kind,
        count: catalogue.filter((item) => item.kind === kind).length,
      })).filter((entry) => entry.count > 0),
    [catalogue]
  );

  const audienceOptions = useMemo(() => {
    const present = new Set<OpportunityAudience>();
    for (const item of catalogue) for (const audience of item.audiences) present.add(audience);
    return [...present];
  }, [catalogue]);

  const focusOptions = useMemo(
    () => FOCUS_KEYS.filter((focus) => catalogue.some((item) => matchesFocus(item, focus))),
    [catalogue]
  );

  const visible = useMemo(() => {
    const term = normalize(search);
    return catalogue
      .filter((item) => {
        if (activeKind !== 'all' && item.kind !== activeKind) return false;
        if (activeMode === 'egypt' && item.country !== 'Egypt') return false;
        if (activeMode === 'online' && item.participationMode !== 'online') return false;
        if (activeMode === 'hybrid' && item.participationMode !== 'hybrid') return false;
        if (activeAudience !== 'all' && !item.audiences.includes(activeAudience)) return false;
        if (!matchesFocus(item, activeFocus)) return false;
        if (term) {
          const haystack = [
            item.title,
            item.organization,
            item.description,
            item.category,
            item.location,
            item.eligibility ?? '',
            ...item.tags,
            ...item.skillsGained,
            ...item.requiredSkills,
          ]
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // The brief prioritises Egypt, then online, then hybrid, while the
        // server's personal relevance stays the primary ordering signal.
        const place = (item: VolunteerOpportunity) =>
          item.country === 'Egypt'
            ? 0
            : item.participationMode === 'online'
              ? 1
              : item.participationMode === 'hybrid'
                ? 2
                : 3;
        return (
          b.relevance - a.relevance ||
          Number(b.isFeatured) - Number(a.isFeatured) ||
          place(a) - place(b) ||
          a.title.localeCompare(b.title)
        );
      });
  }, [
    catalogue,
    search,
    activeKind,
    activeMode,
    activeAudience,
    activeFocus,
  ]);

  const activeFilterCount = [
    activeKind !== 'all',
    activeMode !== 'all',
    activeAudience !== 'all',
    activeFocus !== 'all',
    search.trim().length > 0,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearch('');
    setActiveKind('all');
    setActiveMode('all');
    setActiveAudience('all');
    setActiveFocus('all');
  };

  const matched = visible.filter((item) => item.relevance > 0).length;
  const egyptCount = catalogue.filter((item) => item.country === 'Egypt').length;

  const toggleSaved = async (opportunity: VolunteerOpportunity) => {
    // Optimistic: the list is a catalogue, not a queue, so the flip should
    // feel instant. A failure restores the previous state.
    const previous = opportunities;
    setOpportunities((current) =>
      current.map((item) =>
        item.id === opportunity.id ? { ...item, saved: !item.saved } : item
      )
    );
    try {
      if (opportunity.saved) {
        await unsaveVolunteerOpportunity(opportunity.id);
      } else {
        await saveVolunteerOpportunity(opportunity.id);
      }
    } catch {
      setOpportunities(previous);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-10 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('Loading the opportunities catalogue…')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-8 text-center space-y-2">
        <div className="text-sm font-semibold text-[var(--text-primary)]">
          {t('The opportunities catalogue could not be loaded')}
        </div>
        <p className="text-xs text-[var(--text-secondary)]">{error}</p>
      </div>
    );
  }

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
      active
        ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
        : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
    }`;

  return (
    <div data-guide="volunteer-opportunities" className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            {t('Opportunities & Activities')}
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-2xl">
            {t(
              'Volunteering, student activities, youth programmes, competitions, fellowships, internships and more — real organisations you can apply to, ordered by how closely they match your goals.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
          <Sparkles className="h-3.5 w-3.5 text-[var(--color-primary-text)]" />
          {matched > 0
            ? `${matched} ${t('matched to your profile')}`
            : t('Set a target role to see your matches')}
        </div>
      </div>

      {/* Search and the clear control. */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute start-2.5 top-2.5 text-[var(--text-muted)]"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('Search organisations, programmes, skills or cities')}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] py-2 ps-8 pe-3 text-sm text-[var(--text-primary)]"
            />
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <Filter size={12} />
            {catalogue.length} {t('live opportunities')}
          </span>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <X size={12} /> {t('Clear filters')} ({activeFilterCount})
            </button>
          )}
        </div>

        <div className="mt-3 space-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="me-1 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              {t('Type')}
            </span>
            <button type="button" onClick={() => setActiveKind('all')} className={chip(activeKind === 'all')}>
              {t('All')} ({catalogue.length})
            </button>
            {kindOptions.map(({ kind, count }) => (
              <button
                key={kind}
                type="button"
                onClick={() => setActiveKind(kind)}
                className={chip(activeKind === kind)}
              >
                {t(OPPORTUNITY_LABELS[kind])} ({count})
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="me-1 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              {t('Where')}
            </span>
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setActiveMode(option.id)}
                className={chip(activeMode === option.id)}
              >
                {option.id === 'all'
                  ? `${t(option.label)} (${catalogue.length})`
                  : option.id === 'egypt'
                    ? `${t(option.label)} (${egyptCount})`
                    : t(option.label)}
              </button>
            ))}
          </div>

          {audienceOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="me-1 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                {t('For')}
              </span>
              <button
                type="button"
                onClick={() => setActiveAudience('all')}
                className={chip(activeAudience === 'all')}
              >
                {t('Everyone')}
              </button>
              {audienceOptions.map((audience) => (
                <button
                  key={audience}
                  type="button"
                  onClick={() => setActiveAudience(audience)}
                  className={chip(activeAudience === audience)}
                >
                  {t(AUDIENCE_LABELS[audience])}
                </button>
              ))}
            </div>
          )}

          {focusOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="me-1 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                {t('Focus')}
              </span>
              <button
                type="button"
                onClick={() => setActiveFocus('all')}
                className={chip(activeFocus === 'all')}
              >
                {t('Any focus')}
              </button>
              {focusOptions.map((focus) => (
                <button
                  key={focus}
                  type="button"
                  onClick={() => setActiveFocus(focus)}
                  className={chip(activeFocus === focus)}
                >
                  {t(FOCUS_LABELS[focus] ?? focus)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="p-10 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            {t('No opportunities match these filters yet.')}
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-2 text-xs font-semibold text-[var(--color-primary-text)] hover:underline"
          >
            {t('Clear filters')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {visible.map((opportunity) => (
            <article
              key={opportunity.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] transition-colors hover:border-[var(--border-strong)]"
            >
              {/* Cover: the organisation's own image when the catalogue has
                  one, otherwise a designed panel built from its identity. */}
              <div className="relative flex h-28 items-center justify-between gap-3 bg-gradient-to-br from-[var(--accent-primary)]/25 via-[var(--surface-secondary)] to-[var(--accent-secondary)]/20 px-5">
                {opportunity.thumbnailUrl ? (
                  <>
                    <img
                      src={opportunity.thumbnailUrl}
                      alt=""
                      aria-hidden
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <div
                      aria-hidden
                      className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"
                    />
                  </>
                ) : (
                  <div
                    aria-hidden
                    className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/10"
                  />
                )}

                <div className="relative min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-primary-text)]">
                    {t(OPPORTUNITY_LABELS[opportunity.kind])}
                  </div>
                  <div className="mt-1 truncate text-xl font-black tracking-tight text-[var(--color-primary-text)]">
                    {opportunity.thumbnailUrl
                      ? opportunity.organization
                      : initials(opportunity.organization)}
                  </div>
                </div>

                <div className="relative flex flex-col items-end gap-1">
                  {opportunity.isFeatured && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-black/40 px-2 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm">
                      <Star className="h-2.5 w-2.5" /> {t('Featured')}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-black/40 px-2 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm">
                    {opportunity.participationMode === 'online' ? (
                      <Globe className="h-2.5 w-2.5" />
                    ) : opportunity.participationMode === 'hybrid' ? (
                      <Sparkles className="h-2.5 w-2.5" />
                    ) : (
                      <MapPin className="h-2.5 w-2.5" />
                    )}
                    {t(PARTICIPATION_LABELS[opportunity.participationMode])}
                  </span>
                  {opportunity.country === 'Egypt' && (
                    <span className="rounded-full border border-white/30 bg-black/40 px-2 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm">
                      {t('Egypt')}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{opportunity.organization}</span>
                      {opportunity.organizationType && (
                        <span className="truncate">· {opportunity.organizationType}</span>
                      )}
                    </div>
                    <h3 className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                      {opportunity.title}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleSaved(opportunity)}
                    className="shrink-0 rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--color-primary-text)]"
                    aria-label={
                      opportunity.saved
                        ? `${t('Remove')} ${opportunity.title} ${t('from saved')}`
                        : `${t('Save')} ${opportunity.title}`
                    }
                  >
                    {opportunity.saved ? (
                      <BookmarkCheck className="h-4 w-4 text-[var(--color-primary-text)]" />
                    ) : (
                      <Bookmark className="h-4 w-4" />
                    )}
                  </button>
                </div>

                <p className="line-clamp-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {opportunity.description}
                </p>

                {/* The facts a participant needs before applying. */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-[var(--text-muted)]">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {opportunity.location}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    {t(PARTICIPATION_LABELS[opportunity.participationMode])}
                  </span>
                  {opportunity.commitment && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {opportunity.commitment}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {TYPE_LABELS[opportunity.opportunityType]
                      ? t(TYPE_LABELS[opportunity.opportunityType])
                      : opportunity.opportunityType}
                  </span>
                  {opportunity.languages.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Languages className="h-3 w-3" />
                      {opportunity.languages.map((language) => t(language)).join(' / ')}
                    </span>
                  )}
                  {opportunity.deadline && (
                    <span className="inline-flex items-center gap-1 font-mono">
                      <CalendarDays className="h-3 w-3" />
                      {t('Apply by')} {opportunity.deadline}
                    </span>
                  )}
                </div>

                {opportunity.eligibility && (
                  <p className="flex items-start gap-1.5 rounded-lg bg-[var(--surface-secondary)]/60 px-2.5 py-1.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                    <GraduationCap className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>
                      <span className="font-semibold text-[var(--text-primary)]">
                        {t('Eligibility:')}
                      </span>{' '}
                      {opportunity.eligibility}
                    </span>
                  </p>
                )}

                {/* Why this one is ranked where it is. */}
                {opportunity.relevanceReason && (
                  <p className="flex items-start gap-1.5 rounded-lg bg-[var(--accent-primary)]/8 px-2.5 py-1.5 text-[11px] leading-relaxed text-[var(--color-primary-text)]">
                    <Target className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{opportunity.relevanceReason}</span>
                  </p>
                )}

                {opportunity.skillsGained.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      {t('Skills you will practise')}
                    </span>
                    {opportunity.skillsGained.slice(0, 6).map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-[var(--surface-secondary)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                )}

                {opportunity.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    {opportunity.tags.slice(0, 6).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={opportunity.applicationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        // The funnel records that the visitor followed an
                        // opportunity through to the organisation's own site.
                        // Only the kind of opportunity is reported.
                        trackEvent('opportunity_click', {
                          opportunity_category: opportunity.kind ?? 'unknown',
                        });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-90"
                    >
                      {t('Apply on their site')}
                      <ArrowUpRight className="h-3 w-3 rtl:-rotate-90" />
                    </a>
                    {opportunity.sourceUrl && opportunity.sourceUrl !== opportunity.applicationUrl && (
                      <a
                        href={opportunity.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        {t('Source')}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {onRecordStint && (
                      <button
                        type="button"
                        onClick={onRecordStint}
                        className="rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                      >
                        {t('I volunteered here')}
                      </button>
                    )}
                  </div>

                  <span
                    className="inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)]"
                    title={opportunity.verifiedAt ?? undefined}
                  >
                    {opportunity.verificationStatus === 'verified' ? (
                      <ShieldCheck className="h-3 w-3 text-[var(--color-success-strong)]" />
                    ) : opportunity.verificationStatus === 'rejected' ? (
                      <AlertCircle className="h-3 w-3 text-[var(--color-danger)]" />
                    ) : (
                      <BadgeCheck className="h-3 w-3" />
                    )}
                    {t(
                      opportunity.verificationStatus === 'verified'
                        ? 'Verified'
                        : opportunity.verificationStatus === 'rejected'
                          ? 'Not verified'
                          : opportunity.verificationStatus === 'pending'
                            ? 'Verification pending'
                            : 'Link checked'
                    )}
                    {opportunity.verifiedAt
                      ? ` · ${new Date(opportunity.verifiedAt).toLocaleDateString()}`
                      : ''}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
        {t(
          'Every card links to the organisation’s own page, where current openings and how to apply are published. Expired opportunities are hidden.'
        )}
      </p>
    </div>
  );
};
