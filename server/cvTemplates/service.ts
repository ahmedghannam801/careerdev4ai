/**
 * The server side of the CV template catalogue.
 *
 * Two things are decided here and nowhere else:
 *
 *   - WHICH templates exist, after an administrator's metadata is merged over
 *     the built-in catalogue;
 *   - WHO may use one, from the candidate's verified subscription, never from
 *     a flag the browser sent.
 *
 * The table is optional at runtime. A deployment that has not yet applied the
 * `cv_templates` migration still serves the built-in catalogue: the feature
 * degrades to "no admin overrides" instead of failing the studio.
 */

import { getSupabaseServer } from '../db/supabase.ts';
import { getPreferences } from '../db/preferences.ts';
import { getUserSubscriptionSummary } from '../subscriptions/service.ts';
import {
  applyCvTemplateAccess,
  buildCvTemplateCatalog,
  isCvTemplatePremiumEnforcementEnabled,
  normalizeCvTemplateId,
  resolveCvTemplate,
  resolveCvTemplateAccess,
  type CvTemplateAccessContext,
  type CvTemplateAdminRow,
  type CvTemplateDefinition,
  type CvTemplateStructure,
} from '../../shared/cvTemplates.ts';

export interface CvTemplateCatalogResult {
  /**
   * Every template the candidate may see, with the access decision attached.
   *
   * The LAYOUT is included for every template, locked or not. Looking at a
   * template is free: the gallery has to show the real document, because a
   * placeholder is not a preview, and a candidate who cannot see what a
   * template looks like cannot judge whether it is worth ten credits. The
   * access decision travels with the layout and governs the USE of the
   * template, not the sight of it.
   */
  templates: Array<
    Omit<CvTemplateDefinition, 'structure'> & {
      structure: CvTemplateStructure | null;
      access: ReturnType<typeof resolveCvTemplateAccess>;
    }
  >;
  enforcementEnabled: boolean;
  currentTemplateId: string;
  /** False when the `cv_templates` table has not been migrated yet. */
  adminTableAvailable: boolean;
}

interface CvTemplateDbRow {
  template_id: string;
  name_en: string | null;
  name_ar: string | null;
  category: string | null;
  tier: 'free' | 'premium' | null;
  enabled: boolean;
  featured: boolean;
  sort_order: number | null;
  thumbnail_url: string | null;
  description_en: string | null;
  description_ar: string | null;
  base_template_id: string | null;
  created_at?: string;
  updated_at?: string;
}

function isMissingTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  const message = String((error as { message?: string }).message ?? '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /relation .* does not exist/i.test(message) ||
    /could not find the table/i.test(message)
  );
}

/** Reads the administrator's rows, or an empty list when the table is absent. */
export async function listCvTemplateRows(): Promise<{
  rows: CvTemplateAdminRow[];
  available: boolean;
}> {
  try {
    const { data, error } = await getSupabaseServer()
      .from('cv_templates')
      .select(
        'template_id, name_en, name_ar, category, tier, enabled, featured, sort_order, thumbnail_url, description_en, description_ar, base_template_id, created_at, updated_at'
      )
      .order('sort_order', { ascending: true });
    if (error) {
      if (isMissingTable(error)) return { rows: [], available: false };
      throw error;
    }
    return { rows: (data ?? []) as CvTemplateDbRow[], available: true };
  } catch (error) {
    if (isMissingTable(error)) return { rows: [], available: false };
    throw error;
  }
}

/**
 * The premium templates this candidate has already unlocked with credits.
 *
 * The table is optional at runtime, exactly like the administrator's table: a
 * deployment that has not applied the migration simply has no unlocks, and
 * nothing breaks.
 */
export async function listCvTemplateUnlockIds(profileId: string): Promise<string[]> {
  try {
    const { data, error } = await getSupabaseServer()
      .from('cv_template_unlocks')
      .select('template_id')
      .eq('profile_id', profileId);
    if (error) {
      if (isMissingTable(error)) return [];
      throw error;
    }
    return ((data ?? []) as Array<{ template_id: string }>).map((row) => row.template_id);
  } catch (error) {
    console.error('Failed to read the unlocked CV templates:', error);
    return [];
  }
}

/**
 * Records that a candidate unlocked a template with credits.
 *
 * The write is idempotent: unlocking a template the candidate already owns is
 * a no-op that returns the existing row, so a retried request can never make
 * the candidate pay twice.
 */
export async function recordCvTemplateUnlock(params: {
  profileId: string;
  templateId: string;
  creditsPaid: number;
  ledgerIdempotencyKey?: string | null;
}): Promise<{ recorded: boolean; alreadyUnlocked: boolean }> {
  const { data, error } = await getSupabaseServer()
    .from('cv_template_unlocks')
    .insert({
      profile_id: params.profileId,
      template_id: params.templateId,
      credits_paid: params.creditsPaid,
      ledger_idempotency_key: params.ledgerIdempotencyKey ?? null,
    })
    .select('template_id')
    .maybeSingle();

  if (error) {
    // A duplicate is not a failure: the candidate already unlocked it.
    if (error.code === '23505') {
      return { recorded: false, alreadyUnlocked: true };
    }
    if (isMissingTable(error)) {
      throw new Error(
        'The CV template unlock table is missing. Apply the latest database migration before unlocking a template with credits.'
      );
    }
    throw error;
  }

  return { recorded: Boolean(data), alreadyUnlocked: false };
}

/**
 * The access context for one candidate.
 *
 * `temporary_access` is deliberately not treated as a paid plan: a payment an
 * administrator has not verified does not unlock premium templates.
 */
export async function getCvTemplateAccessContext(
  profileId: string | null
): Promise<CvTemplateAccessContext> {
  const enforcementEnabled = isCvTemplatePremiumEnforcementEnabled(
    process.env as Record<string, string | undefined>
  );
  if (!profileId || !enforcementEnabled) {
    return { enforcementEnabled, planCode: 'free', subscriptionStatus: 'free' };
  }

  try {
    const [summary, unlockedTemplateIds] = await Promise.all([
      getUserSubscriptionSummary(profileId),
      listCvTemplateUnlockIds(profileId),
    ]);
    return {
      enforcementEnabled,
      planCode: summary.planCode,
      subscriptionStatus: summary.status,
      unlockedTemplateIds,
    };
  } catch (error) {
    console.error('Failed to resolve CV template access:', error);
    return { enforcementEnabled, planCode: 'free', subscriptionStatus: 'free' };
  }
}

/** The catalogue for one candidate, with the access decision attached. */
export async function getCvTemplateCatalog(
  profileId: string | null,
  options: { includeDisabled?: boolean } = {}
): Promise<CvTemplateCatalogResult> {
  const [{ rows, available }, accessContext] = await Promise.all([
    listCvTemplateRows(),
    getCvTemplateAccessContext(profileId),
  ]);

  const catalog = buildCvTemplateCatalog(rows, {
    includeDisabled: options.includeDisabled,
  });

  let currentTemplateId = normalizeCvTemplateId(null);
  if (profileId) {
    try {
      const preferences = await getPreferences(profileId);
      currentTemplateId = normalizeCvTemplateId(preferences?.cv_template_id);
    } catch (error) {
      console.error('Failed to read the chosen CV template:', error);
    }
  }

  return {
    templates: applyCvTemplateAccess(catalog, accessContext).map((template) => ({
      // The layout travels with every template. Looking at a template is free,
      // so the browser can draw the real document — the gallery would otherwise
      // show a placeholder where a CV should be. The access decision beside it
      // says what the candidate may DO with the template.
      ...template,
    })),
    enforcementEnabled: accessContext.enforcementEnabled,
    currentTemplateId,
    adminTableAvailable: available,
  };
}

/** One template and the access decision for this candidate. */
export async function getCvTemplateForUser(
  profileId: string | null,
  templateId: string
): Promise<{
  template: CvTemplateDefinition;
  access: ReturnType<typeof resolveCvTemplateAccess>;
  catalog: CvTemplateDefinition[];
} | null> {
  const { rows } = await listCvTemplateRows();
  const catalog = buildCvTemplateCatalog(rows, { includeDisabled: true });
  const template = catalog.find((entry) => entry.id === templateId);
  if (!template || template.disabled) return null;
  const accessContext = await getCvTemplateAccessContext(profileId);
  return {
    template,
    access: resolveCvTemplateAccess(template, accessContext),
    catalog,
  };
}

/** Resolves a possibly stale id to the free template in the live catalogue. */
export async function resolveCvTemplateForUser(
  profileId: string | null,
  templateId: string | null | undefined
): Promise<{
  template: CvTemplateDefinition;
  access: ReturnType<typeof resolveCvTemplateAccess>;
}> {
  const { rows } = await listCvTemplateRows();
  const catalog = buildCvTemplateCatalog(rows);
  const template = resolveCvTemplate(templateId, catalog);
  const accessContext = await getCvTemplateAccessContext(profileId);
  return { template, access: resolveCvTemplateAccess(template, accessContext) };
}

/**
 * The template the account is using, recorded as a fact about a document.
 *
 * The tier is read from the LIVE catalogue rather than from the built-in
 * list, so that an administrator who changes a template's tier is reflected
 * in what the platform reports about the templates that were used.
 */
export async function currentCvTemplateRecord(
  profileId: string
): Promise<{ templateId: string | null; templateTier: string | null }> {
  try {
    const preferences = await getPreferences(profileId);
    const templateId = normalizeCvTemplateId(preferences?.cv_template_id);
    const { rows } = await listCvTemplateRows();
    const catalog = buildCvTemplateCatalog(rows);
    const template = catalog.find((entry) => entry.id === templateId);
    return {
      templateId: template?.id ?? null,
      templateTier: template?.tier ?? null,
    };
  } catch (error) {
    console.error('Failed to read the CV template in use:', error);
    return { templateId: null, templateTier: null };
  }
}

/* -------------------------------------------------------------------------- */
/* Administrator writes                                                       */
/* -------------------------------------------------------------------------- */

export interface CvTemplateWriteInput {
  templateId: string;
  nameEn?: string | null;
  nameAr?: string | null;
  category?: string | null;
  tier?: 'free' | 'premium' | null;
  enabled?: boolean;
  featured?: boolean;
  sortOrder?: number | null;
  thumbnailUrl?: string | null;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  baseTemplateId?: string | null;
}

function toRow(input: CvTemplateWriteInput, existingBaseId: string | null): CvTemplateDbRow {
  return {
    template_id: input.templateId,
    name_en: input.nameEn ?? null,
    name_ar: input.nameAr ?? null,
    category: input.category ?? null,
    tier: input.tier ?? null,
    enabled: input.enabled ?? true,
    featured: input.featured ?? false,
    sort_order: input.sortOrder ?? null,
    thumbnail_url: input.thumbnailUrl ?? null,
    description_en: input.descriptionEn ?? null,
    description_ar: input.descriptionAr ?? null,
    base_template_id: existingBaseId ?? input.baseTemplateId ?? null,
  };
}

/** Creates an administrator-authored template. */
export async function createCvTemplateRow(
  input: CvTemplateWriteInput
): Promise<CvTemplateAdminRow> {
  const { data, error } = await getSupabaseServer()
    .from('cv_templates')
    .insert(toRow(input, null))
    .select(
      'template_id, name_en, name_ar, category, tier, enabled, featured, sort_order, thumbnail_url, description_en, description_ar, base_template_id, created_at, updated_at'
    )
    .single();
  if (error) throw error;
  return data as CvTemplateAdminRow;
}

/**
 * Updates a template's metadata.
 *
 * For a built-in template the row is an override and `base_template_id` stays
 * null. For an administrator-authored template it must keep pointing at the
 * built-in structure it reuses.
 */
export async function updateCvTemplateRow(
  templateId: string,
  input: Omit<CvTemplateWriteInput, 'templateId'>,
  existing: CvTemplateAdminRow | null
): Promise<CvTemplateAdminRow> {
  // A partial update must not erase the metadata it did not mention. The
  // disable action, for example, sends only `enabled: false`; it must keep the
  // template's name, category and thumbnail.
  const row: CvTemplateDbRow = {
    template_id: templateId,
    name_en: input.nameEn !== undefined ? input.nameEn : existing?.name_en ?? null,
    name_ar: input.nameAr !== undefined ? input.nameAr : existing?.name_ar ?? null,
    category: input.category !== undefined ? input.category : existing?.category ?? null,
    tier: input.tier !== undefined ? input.tier : existing?.tier ?? null,
    enabled: input.enabled !== undefined ? input.enabled : existing?.enabled ?? true,
    featured: input.featured !== undefined ? input.featured : existing?.featured ?? false,
    sort_order: input.sortOrder !== undefined ? input.sortOrder : existing?.sort_order ?? null,
    thumbnail_url:
      input.thumbnailUrl !== undefined ? input.thumbnailUrl : existing?.thumbnail_url ?? null,
    description_en:
      input.descriptionEn !== undefined ? input.descriptionEn : existing?.description_en ?? null,
    description_ar:
      input.descriptionAr !== undefined ? input.descriptionAr : existing?.description_ar ?? null,
    base_template_id:
      existing?.base_template_id ?? input.baseTemplateId ?? null,
  };
  const { data, error } = await getSupabaseServer()
    .from('cv_templates')
    .upsert(row, { onConflict: 'template_id' })
    .select(
      'template_id, name_en, name_ar, category, tier, enabled, featured, sort_order, thumbnail_url, description_en, description_ar, base_template_id, created_at, updated_at'
    )
    .single();
  if (error) throw error;
  return data as CvTemplateAdminRow;
}

/** Deletes an administrator-authored template. Built-ins are disabled instead. */
export async function deleteCvTemplateRow(templateId: string): Promise<void> {
  const { error } = await getSupabaseServer()
    .from('cv_templates')
    .delete()
    .eq('template_id', templateId)
    .not('base_template_id', 'is', null);
  if (error) throw error;
}

/** The administrator's own view: every row, including disabled ones. */
export async function listCvTemplateAdminRows(): Promise<CvTemplateAdminRow[]> {
  const { rows } = await listCvTemplateRows();
  return rows;
}
