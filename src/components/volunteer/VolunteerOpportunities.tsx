/**
 * The volunteer opportunities hub.
 *
 * The volunteer page used to be a form for recording stints the user had
 * already done. There was nowhere to see what they could apply to, so the
 * page had nothing to offer a user who had not volunteered yet.
 *
 * This component shows the real catalogue: the organisations that run
 * volunteering programmes, each with a live application link. The list is
 * ordered by how closely the opportunity matches the user's own open skill
 * gaps and their target role, and the reason for the order is shown next to
 * each card, so the ranking is explainable rather than mysterious.
 *
 * The full catalogue is always browsable. The ordering changes what is seen
 * first; it never hides a row.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Building2,
  Globe,
  Loader2,
  MapPin,
  Sparkles,
  Target,
  Clock,
} from 'lucide-react';
import {
  fetchVolunteerOpportunities,
  saveVolunteerOpportunity,
  unsaveVolunteerOpportunity,
  type VolunteerOpportunity,
} from '../../lib/personalizationApi';
import { useCareer } from '../../context/CareerContext';

interface VolunteerOpportunitiesProps {
  /** Called when the user wants to record a stint they just started. */
  onRecordStint?: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  community: 'Community',
  education: 'Education',
  humanitarian: 'Humanitarian',
  environment: 'Environment',
  data: 'Data & research',
  'pro-bono': 'Pro bono',
  technology: 'Technology',
  engineering: 'Engineering',
};

export const VolunteerOpportunities: React.FC<VolunteerOpportunitiesProps> = ({
  onRecordStint,
}) => {
  const { t } = useCareer();
  const [opportunities, setOpportunities] = useState<VolunteerOpportunity[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchVolunteerOpportunities()
      .then((response) => {
        if (cancelled) return;
        setOpportunities(response.opportunities ?? []);
        setCategories(response.categories ?? []);
        setError(null);
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return;
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'The volunteering catalogue could not be loaded.'
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(
    () =>
      activeCategory === 'all'
        ? opportunities
        : opportunities.filter((item) => item.category === activeCategory),
    [opportunities, activeCategory]
  );

  const matched = visible.filter((item) => item.relevance > 0).length;

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
        {t('Loading the volunteering catalogue…')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-8 text-center space-y-2">
        <div className="text-sm font-semibold text-[var(--text-primary)]">
          {t('The volunteering catalogue could not be loaded')}
        </div>
        <p className="text-xs text-[var(--text-secondary)]">{error}</p>
      </div>
    );
  }

  return (
    <div data-guide="volunteer-opportunities" className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            {t('Volunteering opportunities')}
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-2xl">
            {t(
              'Real organisations you can apply to, ordered by how closely they match the skills you still need.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
          <Sparkles className="h-3.5 w-3.5 text-[var(--color-primary-text)]" />
          {matched > 0
            ? `${matched} ${t('matched to your target role')}`
            : t('Choose a target role to see your matches')}
        </div>
      </div>

      {/* Category filter. Every category is always reachable. */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setActiveCategory('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
            activeCategory === 'all'
              ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
              : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {t('All')} ({opportunities.length})
        </button>
        {categories.map((category) => {
          const count = opportunities.filter((item) => item.category === category).length;
          return (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeCategory === category
                  ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
                  : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {CATEGORY_LABELS[category] ?? category} ({count})
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="p-10 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            {t('No opportunities in this category yet.')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {visible.map((opportunity) => (
            <article
              key={opportunity.id}
              className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-3 flex flex-col hover:border-[var(--border-strong)] transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                    <Building2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">{opportunity.organization}</span>
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

              <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                {opportunity.description}
              </p>

              {/* The facts a volunteer needs before applying. */}
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {opportunity.location}
                </span>
                {opportunity.isRemote && (
                  <span className="inline-flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    {t('Remote')}
                  </span>
                )}
                {opportunity.commitment && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {opportunity.commitment}
                  </span>
                )}
              </div>

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
                  {opportunity.skillsGained.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full bg-[var(--surface-secondary)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                <a
                  href={opportunity.applicationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-90"
                >
                  {t('Apply on their site')}
                  <ArrowUpRight className="h-3 w-3" />
                </a>
                {onRecordStint && (
                  <button
                    type="button"
                    onClick={onRecordStint}
                    className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                  >
                    {t('I volunteered here')}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
        {t(
          'Each link opens the organisation’s own volunteering page, where the current openings and how to apply are published.'
        )}
      </p>
    </div>
  );
};
