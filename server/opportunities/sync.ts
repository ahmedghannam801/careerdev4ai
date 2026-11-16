/**
 * The opportunity ingestion pipeline.
 *
 * One job of this module is to keep the catalogue honest: a record that came
 * from a source says where it came from, what the source published, and when
 * the source was last read. A record that cannot be traced to a page is not
 * written at all.
 *
 * The pipeline is deliberately boring:
 *
 *   1. read the registry of enabled sources;
 *   2. for each source, read its list page and then each item's own page;
 *   3. work out what the page actually states — deadline, cohort, cost,
 *      delivery mode, eligibility, the careers it names;
 *   4. write the record, keyed by (source, the source's own id), so reading
 *      the same announcement twice updates one row rather than creating two;
 *   5. record what happened in the run log and on the source itself.
 *
 * A failure at any step is reported. It never leaves a half-written record
 * behind, and it never stops the other sources from being read.
 */

import { getSupabaseServer } from '../db/supabase.ts';
import {
  classifyKind,
  classifyType,
  computeStatus,
  detectAudience,
  detectCohort,
  detectCost,
  detectDeadline,
  detectEligibility,
  detectParticipationMode,
  detectTrainingHours,
  mapDomains,
  mapRoles,
  mapSkills,
  parseMcitAnnouncementDetail,
  parseMcitAnnouncementList,
  parseNtiProgramCards,
  toPlainText,
  type DiscoveredOpportunity,
  type SourceListItem,
} from './sources.ts';
import { fetchText, SourceFetchError } from './fetch.ts';

/** How many items one source may contribute in a single run. */
const MAX_ITEMS_PER_SOURCE = 40;

/** A source, as the registry stores it. */
export interface SourceRecord {
  id: string;
  slug: string;
  name: string;
  organization: string;
  country: string;
  kind: string;
  baseUrl: string;
  listUrl: string;
  adapter: string;
  confidence: number;
  defaultDomainIds: string[];
}

/** What one source's run produced. */
export interface SourceSyncOutcome {
  source: string;
  status: 'success' | 'partial' | 'failed';
  discovered: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  error: string | null;
}

/** What the whole run produced. */
export interface SyncOutcome {
  startedAt: string;
  finishedAt: string;
  sources: SourceSyncOutcome[];
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  /** The opportunities that were created, for the notification pass. */
  createdOpportunities: Array<{ id: string; title: string; sourceUrl: string }>;
}

// ---------------------------------------------------------------------------
// Reading the registry
// ---------------------------------------------------------------------------

/** Reads the sources this deployment is allowed to read. */
export async function listEnabledSources(): Promise<SourceRecord[]> {
  const { data, error } = await getSupabaseServer()
    .from('opportunity_sources')
    .select(
      'id, slug, name, organization, country, kind, base_url, list_url, adapter, confidence, default_domain_ids',
    )
    .eq('enabled', true)
    .order('slug', { ascending: true });
  if (error) throw error;

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    organization: String(row.organization),
    country: String(row.country ?? 'Egypt'),
    kind: String(row.kind ?? 'announcements'),
    baseUrl: String(row.base_url),
    listUrl: String(row.list_url),
    adapter: String(row.adapter),
    confidence: Number(row.confidence ?? 80),
    defaultDomainIds: Array.isArray(row.default_domain_ids)
      ? (row.default_domain_ids as string[])
      : [],
  }));
}

// ---------------------------------------------------------------------------
// Building a record out of a page
// ---------------------------------------------------------------------------

/** Picks the link a candidate would apply through. */
function pickApplicationUrl(
  links: Array<{ href: string; context: string }>,
): string | null {
  const apply = links.find((link) =>
    /(apply|application|register|registration|enrol|enroll|sign up|join)/i.test(
      `${link.context} ${link.href}`,
    ),
  );
  if (apply) return apply.href;
  return links.length ? links[0].href : null;
}

/**
 * Turns an MCIT announcement into a record.
 *
 * Everything written comes from the page. When the page does not state a
 * deadline, the record has no deadline: an invented one would make the
 * catalogue lie about whether a programme is still open.
 */
export function buildMcitOpportunity(
  item: SourceListItem,
  detail: { title: string | null; body: string; links: Array<{ href: string; context: string }>; publishedAt: string | null },
  source: SourceRecord,
  now: Date,
): DiscoveredOpportunity {
  const title = detail.title ?? item.title;
  const body = detail.body;
  const publishedAt = item.publishedAt ?? detail.publishedAt;
  const haystack = `${title} ${body}`;

  const deadline = detectDeadline(body, publishedAt);
  const kind = classifyKind(title, body);
  const cost = detectCost(body);
  const participationMode = detectParticipationMode(body);
  const skills = mapSkills(haystack);
  const domains = mapDomains(haystack, source.defaultDomainIds);
  const roles = mapRoles(haystack);

  return {
    externalId: item.externalId,
    title,
    organization: source.organization,
    description: body,
    country: source.country,
    sourceUrl: item.url,
    applicationUrl: pickApplicationUrl(detail.links),
    publishedAt,
    deadline: deadline.date,
    deadlineText: deadline.text,
    deadlinePrecision: deadline.precision,
    cohort: detectCohort(body),
    trainingHours: detectTrainingHours(body),
    costType: cost.type,
    costNote: cost.note,
    eligibility: detectEligibility(body),
    participationMode,
    opportunityKind: kind,
    opportunityType: classifyType(kind, title, body),
    category: kind,
    domainIds: domains,
    roleSlugs: roles,
    requiredSkills: skills,
    skillsGained: skills,
    audience: detectAudience(body),
    location: source.country === 'Egypt' ? 'Egypt' : source.country,
    isRemote: participationMode === 'online',
    confidence: source.confidence,
  };
}

/** Turns an NTI programme card into a record. */
export function buildNtiOpportunity(
  item: SourceListItem & { description?: string | null },
  body: string,
  source: SourceRecord,
  now: Date,
): DiscoveredOpportunity {
  const title = item.title;
  const description = body || item.description || '';
  const haystack = `${title} ${description}`;

  const deadline = detectDeadline(description, null);
  const kind = classifyKind(title, description);
  const cost = detectCost(description);
  const participationMode = detectParticipationMode(description);
  const skills = mapSkills(haystack);
  const domains = mapDomains(haystack, source.defaultDomainIds);
  const roles = mapRoles(haystack);

  return {
    externalId: item.externalId,
    title,
    organization: source.organization,
    description,
    country: source.country,
    sourceUrl: item.url,
    applicationUrl: item.url,
    publishedAt: null,
    deadline: deadline.date,
    deadlineText: deadline.text,
    deadlinePrecision: deadline.precision,
    cohort: detectCohort(description),
    trainingHours: detectTrainingHours(description),
    costType: cost.type,
    costNote: cost.note,
    eligibility: detectEligibility(description),
    participationMode,
    opportunityKind: kind,
    opportunityType: classifyType(kind, title, description),
    category: kind,
    domainIds: domains,
    roleSlugs: roles,
    requiredSkills: skills,
    skillsGained: skills,
    audience: detectAudience(description),
    location: source.country,
    isRemote: participationMode === 'online',
    confidence: source.confidence,
  };
}

// ---------------------------------------------------------------------------
// The adapters
// ---------------------------------------------------------------------------

/** Reads a source's announcements. */
async function readMcitAnnouncements(
  source: SourceRecord,
  now: Date,
): Promise<DiscoveredOpportunity[]> {
  const listHtml = await fetchText(source.listUrl);
  const items = parseMcitAnnouncementList(listHtml).slice(0, MAX_ITEMS_PER_SOURCE);
  const records: DiscoveredOpportunity[] = [];

  for (const item of items) {
    try {
      const detailHtml = await fetchText(item.url);
      const detail = parseMcitAnnouncementDetail(detailHtml);
      records.push(buildMcitOpportunity(item, detail, source, now));
    } catch (error) {
      // One unreadable page must not lose the others: the run reports the
      // failure and carries on.
      console.warn(
        `[opportunity-sync] ${source.slug}: could not read ${item.url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return records;
}

/** Reads a source's programme index. */
async function readNtiPrograms(
  source: SourceRecord,
  now: Date,
): Promise<DiscoveredOpportunity[]> {
  const listHtml = await fetchText(source.listUrl);
  const items = parseNtiProgramCards(listHtml).slice(0, MAX_ITEMS_PER_SOURCE);
  const records: DiscoveredOpportunity[] = [];

  for (const item of items) {
    let body = item.description ?? '';
    try {
      const detailHtml = await fetchText(item.url);
      const text = toPlainText(detailHtml);
      if (text.length > body.length) body = text;
    } catch (error) {
      console.warn(
        `[opportunity-sync] ${source.slug}: could not read ${item.url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    records.push(buildNtiOpportunity(item, body, source, now));
  }

  return records;
}

/** The adapter for each source kind. */
const ADAPTERS: Record<
  string,
  (source: SourceRecord, now: Date) => Promise<DiscoveredOpportunity[]>
> = {
  'mcit-announcements': readMcitAnnouncements,
  'nti-programs': readNtiPrograms,
};

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** A row the catalogue already holds for one of the source's records. */
export interface ExistingRecord {
  id: string;
  external_id: string | null;
  title: string | null;
  description: string | null;
  deadline: string | null;
  deadline_text: string | null;
  status: string | null;
}

/**
 * The longest description that is written.
 *
 * A ministry's announcement page can carry a great deal of text — navigation,
 * related articles, the footer — and none of that belongs in a candidate's
 * catalogue entry. The body is trimmed so one page cannot fill the column,
 * and the cut is made on a word boundary so the last sentence is still a
 * sentence.
 */
const MAX_DESCRIPTION_LENGTH = 4_000;

/** Shortens a body to what is worth keeping. */
export function boundDescription(description: string): string {
  if (description.length <= MAX_DESCRIPTION_LENGTH) return description;
  const cut = description.slice(0, MAX_DESCRIPTION_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > MAX_DESCRIPTION_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** The row a record becomes. */
function toRow(
  record: DiscoveredOpportunity,
  source: SourceRecord,
  status: string,
  reviewState: string,
): Record<string, unknown> {
  return {
    id: `opp-${source.slug}-${record.externalId}`.slice(0, 120),
    title: record.title,
    organization: record.organization,
    description: boundDescription(record.description),
    category: record.category,
    location: record.location,
    is_remote: record.isRemote,
    commitment: record.trainingHours ? `${record.trainingHours} hours` : null,
    application_url: record.applicationUrl ?? record.sourceUrl,
    skills_gained: record.skillsGained,
    required_skills: record.requiredSkills,
    role_slugs: record.roleSlugs,
    domain_ids: record.domainIds,
    verification_status: 'http',
    verified_at: new Date().toISOString(),
    is_active: true,
    country: record.country ?? source.country,
    languages: ['Arabic', 'English'],
    opportunity_type: record.opportunityType,
    deadline: record.deadline,
    opportunity_kind: record.opportunityKind,
    participation_mode: record.participationMode,
    audience: record.audience,
    eligibility: record.eligibility,
    source_url: record.sourceUrl,
    organization_type: 'government_initiative',
    tags: Array.from(new Set([...record.domainIds, record.opportunityKind])),
    status,
    published_at: record.publishedAt,
    deadline_text: record.deadlineText,
    deadline_precision: record.deadlinePrecision,
    cohort: record.cohort,
    training_hours: record.trainingHours,
    cost_type: record.costType,
    cost_note: record.costNote,
    source_id: source.id,
    external_id: record.externalId,
    review_state: reviewState,
  };
}

/**
 * True when two records differ in a way worth writing.
 *
 * The deadline is the change that matters most — a source that moves a
 * deadline has to be believed — but the body is compared too, because a
 * source that rewrites an announcement must not leave the old words standing.
 */
function hasChanged(
  existing: ExistingRecord,
  record: DiscoveredOpportunity,
  status: string
): boolean {
  if ((existing.deadline ?? null) !== (record.deadline ?? null)) return true;
  if ((existing.deadline_text ?? null) !== (record.deadlineText ?? null)) return true;
  if ((existing.status ?? null) !== status) return true;
  if ((existing.title ?? '') !== record.title) return true;
  // The comparison is made against the text that is actually written, so a
  // body longer than the limit is not read as a change on every run.
  if ((existing.description ?? '') !== boundDescription(record.description)) return true;
  return false;
}

/**
 * What a run intends to write.
 *
 * The decision is separate from the write so that it can be reasoned about
 * — and tested — without a database.
 */
export interface WritePlan {
  /** The rows that do not exist yet. */
  inserts: Array<Record<string, unknown>>;
  /** The rows that exist and have changed, each with the key they keep. */
  updates: Array<{ id: string; row: Record<string, unknown> }>;
  /** The opportunities that were created, for the notification pass. */
  createdOpportunities: Array<{ id: string; title: string; sourceUrl: string }>;
  /** The records that were already exactly right. */
  unchanged: number;
  /** The records that named the same thing twice and were read once. */
  duplicates: number;
}

/**
 * Decides what to write for one source.
 *
 * The existing rows are given as a map keyed by the source's own identifier
 * for the record, so a record that has been seen before is recognised however
 * the row was written.
 */
export function planRecordWrites(
  source: SourceRecord,
  records: DiscoveredOpportunity[],
  existing: Map<string, ExistingRecord>,
  now: Date
): WritePlan {
  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<{ id: string; row: Record<string, unknown> }> = [];
  const createdOpportunities: Array<{ id: string; title: string; sourceUrl: string }> = [];
  const seenExternalIds = new Set<string>();
  let unchanged = 0;
  let duplicates = 0;

  for (const record of records) {
    // The same announcement can appear twice on one list — once as a pinned
    // item and once in the archive, for instance. Two rows with one identity
    // would be written in a single batch, and the database refuses a batch
    // that says the same thing twice, which would lose every record of the
    // source rather than the duplicate alone. The first one wins.
    if (seenExternalIds.has(record.externalId)) {
      duplicates += 1;
      continue;
    }
    seenExternalIds.add(record.externalId);

    const status = computeStatus(record.deadline, record.publishedAt, now);
    // A record the parser was not confident about waits for an administrator
    // instead of appearing in the catalogue straight away.
    const reviewState = record.confidence >= 80 ? 'approved' : 'needs_review';
    const row = toRow(record, source, status, reviewState);

    const previous = existing.get(record.externalId);
    if (!previous) {
      inserts.push(row);
      createdOpportunities.push({
        id: String(row.id),
        title: record.title,
        sourceUrl: record.sourceUrl,
      });
      continue;
    }

    if (!hasChanged(previous, record, status)) {
      unchanged += 1;
      continue;
    }

    // The identity of a row is not something a later run may change. The row
    // that was written first carries the key the database knows, and the
    // catalogue refers to that key from the places a candidate saved it.
    const { id: _ignoredId, ...updatePayload } = row;
    updates.push({ id: previous.id, row: updatePayload });
  }

  return { inserts, updates, createdOpportunities, unchanged, duplicates };
}

/**
 * Writes the records of one source.
 *
 * The existing rows are read once, so a source with forty records costs one
 * read rather than forty.
 */
async function writeRecords(
  source: SourceRecord,
  records: DiscoveredOpportunity[],
  now: Date,
): Promise<{ created: number; updated: number; unchanged: number; createdOpportunities: Array<{ id: string; title: string; sourceUrl: string }> }> {
  const supabase = getSupabaseServer();

  const { data: existingRows, error: readError } = await supabase
    .from('volunteer_opportunities')
    .select('id, external_id, title, description, deadline, deadline_text, status')
    .eq('source_id', source.id);
  if (readError) throw readError;

  const existing = new Map<string, ExistingRecord>();
  for (const row of (existingRows ?? []) as ExistingRecord[]) {
    if (row.external_id) existing.set(row.external_id, row);
  }

  const { inserts, updates, createdOpportunities, unchanged, duplicates } = planRecordWrites(
    source,
    records,
    existing,
    now
  );

  if (duplicates > 0) {
    console.warn(
      `[opportunity-sync] ${source.slug}: ${duplicates} record(s) named the same thing twice and were read once.`
    );
  }

  if (inserts.length > 0) {
    const { error: insertError } = await supabase
      .from('volunteer_opportunities')
      .upsert(inserts, { onConflict: 'id' });
    if (insertError) throw insertError;
  }

  for (const update of updates) {
    const { error: updateError } = await supabase
      .from('volunteer_opportunities')
      .update(update.row)
      .eq('id', update.id);
    if (updateError) throw updateError;
  }

  return {
    created: inserts.length,
    updated: updates.length,
    unchanged,
    createdOpportunities,
  };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** Records the run in the log and on the source itself. */
async function recordRun(
  source: SourceRecord,
  runId: string,
  outcome: SourceSyncOutcome,
): Promise<void> {
  const supabase = getSupabaseServer();

  const { error: runError } = await supabase
    .from('opportunity_sync_runs')
    .update({
      finished_at: new Date().toISOString(),
      status: outcome.status,
      discovered: outcome.discovered,
      created_count: outcome.created,
      updated_count: outcome.updated,
      unchanged_count: outcome.unchanged,
      failed_count: outcome.failed,
      error_message: outcome.error,
    })
    .eq('id', runId);
  if (runError) throw runError;

  const failed = outcome.status === 'failed';
  const patch: Record<string, unknown> = {
    last_synced_at: new Date().toISOString(),
    last_status: outcome.status,
    consecutive_failures: failed ? outcome.failed : 0,
    last_error: outcome.error,
    updated_at: new Date().toISOString(),
  };
  if (!failed) patch.last_success_at = new Date().toISOString();

  const { error: sourceError } = await supabase
    .from('opportunity_sources')
    .update(patch)
    .eq('id', source.id);
  if (sourceError) throw sourceError;
}

/**
 * Reads every enabled source and writes what it finds.
 *
 * One source failing never stops the others, and the failure is reported
 * rather than swallowed.
 */
export async function syncOpportunitySources(now: Date = new Date()): Promise<SyncOutcome> {
  const startedAt = new Date().toISOString();
  const supabase = getSupabaseServer();

  const sources = await listEnabledSources();
  const outcomes: SourceSyncOutcome[] = [];
  const createdOpportunities: Array<{ id: string; title: string; sourceUrl: string }> = [];

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const source of sources) {
    const { data: run, error: runError } = await supabase
      .from('opportunity_sync_runs')
      .insert({ source_id: source.id, status: 'running' })
      .select('id')
      .single();

    if (runError || !run) {
      outcomes.push({
        source: source.slug,
        status: 'failed',
        discovered: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
        failed: 1,
        error: runError?.message ?? 'The run could not be recorded.',
      });
      failed += 1;
      continue;
    }

    const runId = String(run.id);

    try {
      const adapter = ADAPTERS[source.adapter];
      if (!adapter) {
        throw new SourceFetchError(
          'unavailable',
          `No adapter is registered for "${source.adapter}".`,
        );
      }

      const records = await adapter(source, now);
      const written = await writeRecords(source, records, now);

      const outcome: SourceSyncOutcome = {
        source: source.slug,
        status: 'success',
        discovered: records.length,
        created: written.created,
        updated: written.updated,
        unchanged: written.unchanged,
        failed: 0,
        error: null,
      };

      await recordRun(source, runId, outcome);
      outcomes.push(outcome);
      created += written.created;
      updated += written.updated;
      unchanged += written.unchanged;
      createdOpportunities.push(...written.createdOpportunities);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const outcome: SourceSyncOutcome = {
        source: source.slug,
        status: 'failed',
        discovered: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
        failed: 1,
        error: message,
      };
      await recordRun(source, runId, outcome);
      outcomes.push(outcome);
      failed += 1;
    }
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    sources: outcomes,
    created,
    updated,
    unchanged,
    failed,
    createdOpportunities,
  };
}

/**
 * Closes the opportunities whose deadline has passed.
 *
 * The status is what the catalogue reads, so an opportunity that expired
 * while the platform was not looking stops being presented as open.
 */
export async function expirePastOpportunities(now: Date = new Date()): Promise<number> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from('volunteer_opportunities')
    .select('id, deadline, status')
    .not('deadline', 'is', null)
    .in('status', ['open', 'closing_soon', 'upcoming']);
  if (error) throw error;

  const expired: string[] = [];
  for (const row of (data ?? []) as Array<{ id: string; deadline: string | null; status: string | null }>) {
    if (!row.deadline) continue;
    const deadlineTime = Date.parse(`${row.deadline}T23:59:59Z`);
    if (!Number.isFinite(deadlineTime)) continue;
    if (deadlineTime < now.getTime()) expired.push(row.id);
  }

  if (expired.length === 0) return 0;

  const { error: updateError } = await supabase
    .from('volunteer_opportunities')
    .update({ status: 'closed' })
    .in('id', expired);
  if (updateError) throw updateError;

  return expired.length;
}
