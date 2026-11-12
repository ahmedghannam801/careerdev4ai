import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Briefcase,
  Code2,
  Compass,
  GraduationCap,
  Handshake,
  HeartPulse,
  Megaphone,
  Palette,
  Scale,
  ShieldCheck,
  TrendingUp,
  Truck,
  Users,
  Wrench,
  Search,
  ChevronRight,
  ArrowLeft,
  type LucideIcon,
} from 'lucide-react';
import { CAREER_DOMAINS, type CareerDomainId } from '../../../shared/careerDomains';
import {
  getCareerSpecializations,
  isCareerDomainId,
} from '../../../shared/targetRoleSelection';
import { searchCareerCatalog } from '../../data/rolesData';
import type { TargetRole } from '../../types/career';
import { useCareer } from '../../context/CareerContext';

/**
 * The hierarchical target-role picker.
 *
 * The selection has two levels, exactly like the career taxonomy it comes
 * from:
 *   - Level 1 — the career DOMAIN (e.g. "Business & Management").
 *   - Level 2 — the SPECIALISATION inside that domain (e.g. "Business Analyst").
 *
 * The specialisations are not a second list: they are the catalogue roles of
 * the selected domain, so the hierarchy and the catalogue can never drift
 * apart.
 */

/** The Lucide icon for each domain, named by `CAREER_DOMAINS[].icon`. */
const DOMAIN_ICONS: Record<string, LucideIcon> = {
  Code2,
  Wrench,
  BarChart3,
  Palette,
  Compass,
  Briefcase,
  Truck,
  TrendingUp,
  Megaphone,
  Handshake,
  Users,
  HeartPulse,
  GraduationCap,
  Scale,
  ShieldCheck,
};

export interface TargetRolePickerProps {
  /** The specialisation that is currently selected (level 2). */
  selectedRoleId: string | null;
  /** Called when the user picks a specialisation (level 2). */
  onSelect: (role: TargetRole) => void;
  /**
   * The domain the picker opens on (level 1). Defaults to the domain of the
   * selected specialisation.
   */
  initialDomainId?: string | null;
  /** Called when the user changes the domain (level 1). */
  onDomainChange?: (domainId: CareerDomainId | null) => void;
  /** Renders each specialisation row. Defaults to a compact standard row. */
  renderSpecialisation?: (role: TargetRole) => React.ReactNode;
  /** Renders each domain card. Defaults to a standard domain card. */
  renderDomain?: (domain: (typeof CAREER_DOMAINS)[number], count: number) => React.ReactNode;
  /** Placeholder for the search box. */
  searchPlaceholder?: string;
  /** Optional id so a surrounding <label htmlFor> can name the search box. */
  searchInputId?: string;
  className?: string;
}

export const TargetRolePicker: React.FC<TargetRolePickerProps> = ({
  selectedRoleId,
  onSelect,
  initialDomainId,
  onDomainChange,
  renderSpecialisation,
  renderDomain,
  searchPlaceholder = 'Search a role — e.g. "financial analyst"',
  searchInputId,
  className = '',
}) => {
  const { t } = useCareer();
  // The domain the picker opens on: the explicitly supplied one, otherwise
  // the domain of the specialisation that is already selected.
  const [domainId, setDomainId] = useState<CareerDomainId | null>(() => {
    if (initialDomainId && isCareerDomainId(initialDomainId)) return initialDomainId;
    return null;
  });
  const [query, setQuery] = useState('');

  // The domain that owns the current selection, resolved through the
  // catalogue rather than tracked separately.
  const selectionDomainId = useMemo(() => {
    if (!selectedRoleId) return null;
    const domain = CAREER_DOMAINS.find((d) =>
      getCareerSpecializations(d.slug).some((role) => role.id === selectedRoleId)
    );
    return domain?.slug ?? null;
  }, [selectedRoleId]);

  const activeDomainId = domainId ?? selectionDomainId ?? null;

  const domainCounts = useMemo(() => {
    const counts = new Map<CareerDomainId, number>();
    for (const domain of CAREER_DOMAINS) {
      counts.set(domain.slug, getCareerSpecializations(domain.slug).length);
    }
    return counts;
  }, []);

  const specialisations = useMemo(
    () => (activeDomainId ? getCareerSpecializations(activeDomainId) : []),
    [activeDomainId]
  );

  // A search looks across every domain; picking a result also moves the
  // picker to that result's domain, so the hierarchy stays consistent.
  const searchResults = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return null;
    return searchCareerCatalog(trimmed, { limit: 60 }).roles.map((match) => match.role);
  }, [query]);

  const chooseDomain = (next: CareerDomainId | null) => {
    setDomainId(next);
    onDomainChange?.(next);
  };

  const chooseSpecialisation = (role: TargetRole) => {
    // The domain follows the specialisation, so the two levels of the
    // hierarchy always describe the same selection — including when the
    // specialisation was picked through the cross-domain search.
    setDomainId(role.domainId);
    onDomainChange?.(role.domainId);
    onSelect(role);
  };

  const renderDefaultDomain = (domain: (typeof CAREER_DOMAINS)[number], count: number) => {
    const Icon = DOMAIN_ICONS[domain.icon] ?? Compass;
    const isActive = activeDomainId === domain.slug;
    const isSelectionDomain = selectionDomainId === domain.slug;
    return (
      <button
        key={domain.slug}
        type="button"
        onClick={() => chooseDomain(isActive && !isSelectionDomain ? null : domain.slug)}
        className={`p-3.5 rounded-xl border text-start transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm ${
          isActive
            ? 'bg-[var(--accent-surface)]/50 border-[var(--accent-primary)]'
            : 'bg-[var(--surface-main)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
        }`}
      >
        <div className="flex items-start gap-2.5">
          <Icon
            className={`w-4 h-4 mt-0.5 shrink-0 ${
              isActive ? 'text-[var(--color-primary-text)]' : 'text-[var(--text-muted)]'
            }`}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                {t(domain.label)}
              </span>
              {isSelectionDomain && (
                <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[var(--accent-primary)] text-[var(--color-on-primary)]">
                  {t('Current')}
                </span>
              )}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
              {count} {t(count === 1 ? 'specialisation' : 'specialisations')}
            </div>
          </div>
        </div>
      </button>
    );
  };

  const renderDefaultSpecialisation = (role: TargetRole) => {
    const isSelected = selectedRoleId === role.id;
    return (
      <button
        key={role.id}
        type="button"
        onClick={() => chooseSpecialisation(role)}
        className={`w-full p-3.5 rounded-xl border text-start transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm ${
          isSelected
            ? 'bg-[var(--accent-surface)]/50 border-[var(--accent-primary)]'
            : 'bg-[var(--surface-main)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-[var(--text-primary)]">{t(role.title)}</div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
              {t(role.level)} · {t(role.category)}
            </div>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 mt-0.5 rtl:rotate-180" />
        </div>
        <p className="text-[11px] text-[var(--text-secondary)] mt-1.5 line-clamp-2 leading-relaxed">
          {role.overview}
        </p>
      </button>
    );
  };

  const activeDomain = CAREER_DOMAINS.find((d) => d.slug === activeDomainId) ?? null;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Search across every domain */}
      <div className="relative">
        <Search className="w-4 h-4 text-[var(--text-muted)] absolute start-3 top-3" />
        <input
          id={searchInputId}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(searchPlaceholder)}
          className="w-full ps-9 pe-3.5 py-2.5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
        />
      </div>

      {searchResults ? (
        /* SEARCH RESULTS — across every domain */
        <div className="space-y-2">
          <div className="text-[11px] text-[var(--text-muted)]">
            {searchResults.length} {t(searchResults.length === 1 ? 'specialisation' : 'specialisations')} {t('matched')}
            &ldquo;{query.trim()}&rdquo;
          </div>
          <div className="space-y-2 max-h-[420px] overflow-y-auto pe-1">
            {searchResults.length === 0 && (
              <div className="text-xs text-[var(--text-muted)] p-4 text-center">
                {t('No specialisation matched that search.')}
              </div>
            )}
            {searchResults.map((role) => (
              <div key={role.id}>
                <button
                  type="button"
                  onClick={() => chooseSpecialisation(role)}
                  className={`w-full p-3.5 rounded-xl border text-start transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm ${
                    selectedRoleId === role.id
                      ? 'bg-[var(--accent-surface)]/50 border-[var(--accent-primary)]'
                      : 'bg-[var(--surface-main)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="text-xs font-bold text-[var(--text-primary)]">{t(role.title)}</div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {t(role.category)} · {t(role.level)}
                  </div>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* LEVEL 1 — THE CAREER DOMAIN */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] font-bold">
                {t('1 · Career domain')}
              </div>
              {activeDomain && (
                <button
                  type="button"
                  onClick={() => chooseDomain(null)}
                  className="text-[11px] text-[var(--color-primary-text)] hover:underline flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3 rtl:rotate-180" />
                  {t('All domains')}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CAREER_DOMAINS.map((domain) => {
                const count = domainCounts.get(domain.slug) ?? 0;
                if (count === 0) return null;
                return renderDomain
                  ? renderDomain(domain, count)
                  : renderDefaultDomain(domain, count);
              })}
            </div>
          </div>

          {/* LEVEL 2 — THE SPECIALISATION */}
          {activeDomain && (
            <div className="space-y-2 pt-1">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] font-bold">
                {t('2 · Specialisation in')} {t(activeDomain.label)}
              </div>
              <div className="space-y-2 max-h-[420px] overflow-y-auto pe-1">
                {specialisations.map((role) =>
                  renderSpecialisation ? renderSpecialisation(role) : renderDefaultSpecialisation(role)
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
