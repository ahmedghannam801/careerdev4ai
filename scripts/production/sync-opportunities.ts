/**
 * Reads the registered opportunity sources once and prints what it found.
 *
 * This is the manual way to run the pipeline: it is the same code the
 * scheduled job uses, so what it prints is what the platform does.
 *
 *   npx tsx scripts/production/sync-opportunities.ts
 *
 * The optional argument caps how many of the newly created opportunities are
 * listed at the end. Both spellings are accepted, so the following are the
 * same command:
 *
 *   npx tsx scripts/production/sync-opportunities.ts --limit 5
 *   npx tsx scripts/production/sync-opportunities.ts --limit=5
 *
 * The command fails when a source could not be read, so that a scheduled run
 * of this script does not report success over a broken source.
 */

import 'dotenv/config';
import { expirePastOpportunities, syncOpportunitySources } from '../../server/opportunities/sync.ts';

/**
 * The value of the `--limit` argument, whichever way it was written.
 *
 * A limit that is not a positive whole number is ignored rather than treated
 * as zero, so a typo cannot silently hide everything the run found.
 */
function readLimit(argv: string[]): number | null {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--limit') {
      const value = Number.parseInt(argv[index + 1] ?? '', 10);
      return Number.isFinite(value) && value > 0 ? value : null;
    }
    if (argument.startsWith('--limit=')) {
      const value = Number.parseInt(argument.slice('--limit='.length), 10);
      return Number.isFinite(value) && value > 0 ? value : null;
    }
  }
  return null;
}

const limit = readLimit(process.argv.slice(2));

async function main(): Promise<void> {
  const started = Date.now();
  const outcome = await syncOpportunitySources();

  console.log(`The sources were read in ${Date.now() - started}ms.`);
  for (const source of outcome.sources) {
    console.log(
      `  ${source.source}: ${source.status} — ${source.discovered} found, ` +
        `${source.created} new, ${source.updated} updated, ${source.unchanged} unchanged` +
        (source.error ? ` — ${source.error}` : ''),
    );
  }

  const expired = await expirePastOpportunities();
  console.log(`  ${expired} expired opportunities were closed.`);

  for (const opportunity of outcome.createdOpportunities.slice(0, limit ?? 10)) {
    console.log(`  + ${opportunity.title} (${opportunity.sourceUrl})`);
  }

  // A source that could not be read is a failure of the run, even though the
  // other sources were read successfully. The command says so, so that it can
  // be watched rather than trusted.
  if (outcome.failed > 0) {
    console.error(`  ${outcome.failed} source(s) could not be read.`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error('The synchronisation failed:', error);
  process.exitCode = 1;
});
