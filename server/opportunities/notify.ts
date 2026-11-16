/**
 * Telling the right candidate about a new opportunity.
 *
 * A notification only goes to a candidate whose own record says the
 * opportunity concerns their career. The match is made on the role the
 * candidate is targeting and the role the source's programme is mapped to,
 * both expressed in the platform's own role vocabulary.
 *
 * Two rules keep this honest:
 *
 *   1. An opportunity with no role mapping is not sent to anybody. The
 *      pipeline could not establish whose career it concerns, so guessing
 *      would put irrelevant items in real inboxes.
 *   2. A candidate is told once. The notification is keyed by the
 *      opportunity, and the database refuses a second copy.
 */

import { getSupabaseServer } from '../db/supabase.ts';
import { ROLE_DEFINITION_LIST } from '../../shared/careerRoles.ts';
import { canonicalUrl } from '../../shared/opportunityMatching.ts';

/** A new opportunity, as the notification pass sees it. */
export interface NewOpportunity {
  id: string;
  title: string;
  sourceUrl: string;
}

/**
 * The source text of the title a new opportunity is announced with.
 *
 * The server records the wording rather than a translated string, so the
 * notification is shown in the reader's own language. The value is the English
 * source text itself, which is what the Arabic catalogue is keyed by.
 */
export const NEW_OPPORTUNITY_TITLE_KEY = 'New opportunity';

/**
 * The source text of the message a new opportunity is announced with.
 *
 * The placeholders are filled in after the translation, so the wording comes
 * from the reader's language and the values keep the spelling they had when
 * they were recorded.
 */
export const NEW_OPPORTUNITY_MESSAGE_TEMPLATE =
  'A new opportunity from {organization}: {opportunityTitle}';

/** What the pass did. */
export interface NotifyOutcome {
  /** The candidates who were told. */
  notified: number;
  /** The candidates who matched but had already been told. */
  skipped: number;
  /** The opportunities that could not be matched to anybody. */
  unmatched: number;
}

/**
 * The role slug behind a role title, as the catalogue writes it.
 *
 * The profile stores the title a candidate chose ("Data Analyst") and the
 * catalogue stores the slug ("data-analyst"), so the two are joined here.
 */
function slugForRoleTitle(title: string): string | null {
  const needle = title.trim().toLowerCase();
  if (!needle) return null;
  for (const role of ROLE_DEFINITION_LIST) {
    if (role.title.trim().toLowerCase() === needle) return role.id;
  }
  return null;
}

/**
 * Notifies the candidates a new opportunity concerns.
 *
 * The candidate's target role is read once, the opportunities are read once,
 * and the notifications are written in one batch: the pass costs three reads
 * however many opportunities and candidates there are.
 */
export async function notifyAboutNewOpportunities(
  opportunities: NewOpportunity[],
  now: Date = new Date(),
): Promise<NotifyOutcome> {
  const outcome: NotifyOutcome = { notified: 0, skipped: 0, unmatched: 0 };
  if (opportunities.length === 0) return outcome;

  const supabase = getSupabaseServer();

  const ids = opportunities.map((opportunity) => opportunity.id);
  const { data: rows, error: readError } = await supabase
    .from('volunteer_opportunities')
    .select('id, title, role_slugs, domain_ids, source_url, organization, deadline')
    .in('id', ids);
  if (readError) throw readError;

  const records = (rows ?? []) as Array<{
    id: string;
    title: string;
    role_slugs: string[] | null;
    domain_ids: string[] | null;
    source_url: string | null;
    organization: string | null;
    deadline: string | null;
  }>;

  // The roles the catalogue knows, so a title can be joined to a slug.
  const slugByTitle = new Map<string, string>();
  for (const role of ROLE_DEFINITION_LIST) {
    slugByTitle.set(role.title.trim().toLowerCase(), role.id);
  }

  const { data: profileRows, error: profileError } = await supabase
    .from('profiles')
    .select('id, target_role')
    .not('target_role', 'is', null);
  if (profileError) throw profileError;

  const profiles = (profileRows ?? []) as Array<{ id: string; target_role: string | null }>;

  // Which candidates care about which role slug.
  const candidatesByRole = new Map<string, string[]>();
  for (const profile of profiles) {
    const title = (profile.target_role ?? '').trim().toLowerCase();
    if (!title) continue;
    const slug = slugByTitle.get(title) ?? slugForRoleTitle(profile.target_role ?? '');
    if (!slug) continue;
    const list = candidatesByRole.get(slug) ?? [];
    list.push(profile.id);
    candidatesByRole.set(slug, list);
  }

  // The candidates who were already told about one of these opportunities.
  // The notification table has no natural key for this, so the pairs are
  // read once and filtered in memory: a candidate is told once, and a
  // repeated run of the pipeline does not fill their inbox.
  const { data: existingRows, error: existingError } = await supabase
    .from('notifications')
    .select('profile_id, opportunity_id')
    .eq('title_key', NEW_OPPORTUNITY_TITLE_KEY)
    .in('opportunity_id', ids);
  if (existingError) throw existingError;

  const alreadyTold = new Set<string>();
  for (const row of (existingRows ?? []) as Array<{
    profile_id: string;
    opportunity_id: string | null;
  }>) {
    if (row.opportunity_id) {
      alreadyTold.add(`${row.profile_id}::${row.opportunity_id}`);
    }
  }

  const notifications: Array<Record<string, unknown>> = [];
  let matchedProfiles = 0;
  let skipped = 0;

  for (const record of records) {
    const roleSlugs = record.role_slugs ?? [];
    if (roleSlugs.length === 0) {
      // Nothing established whose career this concerns.
      outcome.unmatched += 1;
      continue;
    }

    const recipients = new Set<string>();
    for (const slug of roleSlugs) {
      for (const profileId of candidatesByRole.get(slug) ?? []) {
        recipients.add(profileId);
      }
    }
    if (recipients.size === 0) {
      outcome.unmatched += 1;
      continue;
    }

    for (const profileId of recipients) {
      if (alreadyTold.has(`${profileId}::${record.id}`)) {
        skipped += 1;
        continue;
      }
      matchedProfiles += 1;
      notifications.push({
        profile_id: profileId,
        title: record.title,
        message: record.organization
          ? `A new opportunity from ${record.organization}.`
          : 'A new opportunity was published.',
        type: 'opportunity',
        link_view: '/volunteer',
        title_key: NEW_OPPORTUNITY_TITLE_KEY,
        opportunity_id: record.id,
        params: {
          opportunityId: record.id,
          title: record.title,
          organization: record.organization ?? '',
          deadline: record.deadline ?? '',
          url: canonicalUrl(record.source_url),
          // The template is what the drawer translates and then fills in.
          messageTemplate: NEW_OPPORTUNITY_MESSAGE_TEMPLATE,
        },
      });
    }
  }

  if (notifications.length === 0) {
    outcome.skipped = skipped;
    outcome.unmatched += opportunities.length;
    return outcome;
  }

  // The write names the unique index as its conflict target, so a run that
  // overlaps another one cannot put the same notice in a real inbox twice.
  const { error: insertError } = await supabase
    .from('notifications')
    .upsert(notifications, {
      onConflict: 'profile_id,opportunity_id',
      ignoreDuplicates: true,
    });
  if (insertError) throw insertError;

  outcome.notified = matchedProfiles;
  outcome.skipped = skipped;
  return outcome;
}
