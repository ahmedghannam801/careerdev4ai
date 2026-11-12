/**
 * The token deduction contract.
 * ---------------------------------------------------------------------------
 * A token is a real unit of money for the candidate. This file is the guard
 * that says a token is only ever spent on work the candidate asked for and
 * actually received.
 *
 * WHY THIS FILE EXISTS
 * Candidates were losing their whole daily allowance without asking for
 * anything. Three separate faults could do it, and all three are silent:
 *
 *   1. A PASSIVE action was priced like an AI action. The Learning Hub
 *      refreshes its deterministic ranking when the career graph is hydrated,
 *      when a course is saved, started, dismissed or completed, and when the
 *      page opens. Each of those was charged a token while no model was ever
 *      asked. With an allowance of two tokens a day, two page loads were
 *      enough.
 *   2. A DUPLICATE request was charged twice. The ledger key used to be
 *      random, so a double-click, a React re-render or a retried request each
 *      took its own credit for one piece of work.
 *   3. A request that produced NO AI result kept its credit. The route could
 *      answer from its own deterministic fallback, or the model could be
 *      unavailable, and the candidate was charged for a result they did not
 *      receive.
 *
 * The tests below are mostly repository scans, because the fault is not a
 * single line of code but a property of the whole route table. A scan fails
 * the moment somebody prices a new passive route, or adds a deduction point
 * outside the one credit service.
 *
 * It is pure: no database, no API, no key.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { CREDIT_WEIGHTS, type AICreditAction } from '../shared/credits.ts';
import { requestFingerprint } from '../server/credits/middleware.ts';
import { aiButtonLabel, aiTokenCost, aiTokenCostLabel } from '../src/lib/aiTokenCosts.ts';

const REPO_ROOT = join(import.meta.dirname, '..');

const APP_TS = join(REPO_ROOT, 'app.ts');
const MIDDLEWARE_TS = join(REPO_ROOT, 'server', 'credits', 'middleware.ts');
const CV_TEMPLATES_ROUTES_TS = join(REPO_ROOT, 'server', 'cvTemplates', 'routes.ts');

/**
 * The routes that are allowed to spend a token, and what each one costs.
 *
 * Every entry is a real AI action the candidate explicitly triggers. A route
 * that is not on this list may not take a credit, whatever it does.
 */
const ALLOWED_TOKEN_ROUTES: Record<string, AICreditAction> = {
  '/api/copilot': 'career_consultation_chat',
  '/api/analyze-career': 'cv_ats_analysis',
  '/api/optimize-cv': 'cv_tailoring',
  '/api/mock-interview': 'interview_mock_session',
  '/api/suggest-summary': 'ai_assist_inline',
  '/api/generate-cover-letter': 'cover_letter_generation',
  '/api/cv/ai-assist': 'ai_assist_inline',
  '/api/cv/job-description/analyze': 'job_description_analysis',
  '/api/cv/job-description/generate': 'cv_tailoring',
  '/api/projects/recommendations': 'project_analysis',
  '/api/projects/analyze': 'project_analysis',
  '/api/learning/recommendations': 'learning_recommendation',
};

/**
 * Routes that are NOT AI actions and must never cost a token.
 *
 * They are named here so that the scan below can prove the absence of a
 * charge on each of them. Editing a CV, saving a draft, previewing a
 * template, switching view, exporting a document that already exists and
 * filtering a list are all ordinary product actions.
 */
const NON_AI_ROUTES = [
  '/api/cv/build',
  '/api/cv-templates',
  '/api/cv-templates/preview',
  '/api/cv-templates/apply',
  '/api/cv-templates/export/authorize',
  '/api/cv/save',
  '/api/state',
  '/api/profile',
  '/api/jobs/search',
  '/api/learning/catalog',
  '/api/learning/search',
  '/api/cv/analysis',
  '/api/cv/analysis/stream',
  '/api/roadmap/generate',
];

/** Reads every source file the scans below look at. */
function collectSourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Splits the route table out of `app.ts`.
 *
 * Each entry is the source of one route registration, from its path up to
 * the next registration. Reading the whole block is what makes the scan
 * meaningful: a charge can sit several lines below the path, and a route
 * whose guard is written as a small function must not be mistaken for an
 * unguarded one.
 */
function parseRouteBlocks(source: string): Map<string, string> {
  const blocks = new Map<string, string>();
  const registration = /app\.(get|post|put|patch|delete)\(\s*'([^']+)'/g;
  const starts: Array<{ path: string; index: number }> = [];

  for (const match of source.matchAll(registration)) {
    starts.push({ path: match[2], index: match.index! });
  }

  for (let i = 0; i < starts.length; i += 1) {
    const { path, index } = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1].index : source.length;
    blocks.set(path, source.slice(index, end));
  }

  return blocks;
}

describe('the token deduction contract', () => {
  describe('the routes that may spend a token', () => {
    const source = readFileSync(APP_TS, 'utf8');
    const blocks = parseRouteBlocks(source);

    test('every route that spends a token is an allowed AI route', () => {
      const offenders: string[] = [];

      for (const [path, block] of blocks) {
        const charge = block.match(/requireCredits\(\s*'([a-z_]+)'\s*\)/);
        if (!charge) continue;

        const allowed = ALLOWED_TOKEN_ROUTES[path];
        if (!allowed) {
          offenders.push(`${path} spends a token but is not an allowed AI route`);
          continue;
        }
        if (charge[1] !== allowed) {
          offenders.push(`${path} spends a '${charge[1]}' token but must spend '${allowed}'`);
        }
      }

      assert.deepEqual(
        offenders,
        [],
        `these routes spend tokens without being allowed to:\n${offenders.join('\n')}`
      );
    });

    test('every allowed AI route really does spend a token', () => {
      const missing: string[] = [];

      for (const [path, action] of Object.entries(ALLOWED_TOKEN_ROUTES)) {
        const block = blocks.get(path);
        if (!block) {
          missing.push(`${path} does not exist any more`);
          continue;
        }
        if (!block.includes(`requireCredits('${action}')`)) {
          missing.push(`${path} no longer charges '${action}'`);
        }
      }

      assert.deepEqual(
        missing,
        [],
        `these AI routes no longer charge their token:\n${missing.join('\n')}`
      );
    });

    test('no non-AI route spends a token', () => {
      const offenders: string[] = [];

      for (const path of NON_AI_ROUTES) {
        const block = blocks.get(path);
        if (!block) continue;
        if (/requireCredits\(/.test(block)) {
          offenders.push(path);
        }
      }

      assert.deepEqual(
        offenders,
        [],
        `these routes are not AI actions and must not cost a token: ${offenders.join(', ')}`
      );
    });

    test('a route that skips the charge for a non-AI request says so explicitly', () => {
      // The Learning Hub asks for its deterministic ranking on its own, with
      // `ai: false`. That request never reaches a model, so it must never be
      // charged. The guard has to be visible in the source, not implied.
      const learningBlock = blocks.get('/api/learning/recommendations');
      assert.ok(learningBlock, 'the Learning Hub route must exist');

      assert.match(
        learningBlock,
        /body\.ai\s*===\s*false/,
        'the Learning Hub route must skip the charge when the deterministic ranking is asked for'
      );
      assert.match(
        learningBlock,
        /requireCredits\('learning_recommendation'\)/,
        'the Learning Hub route must still charge when the AI explanation IS asked for'
      );

      const assistBlock = blocks.get('/api/cv/ai-assist');
      assert.ok(assistBlock, 'the CV assist route must exist');
      assert.match(
        assistBlock,
        /body\.ai\s*===\s*false/,
        'the CV assist route must skip the charge when no AI result is asked for'
      );
    });
  });

  describe('the deduction points', () => {
    const serverFiles = collectSourceFiles(join(REPO_ROOT, 'server'));

    test('no server file spends a token outside the credit service', () => {
      // `deductCredits` and `chargeAiAction` are the only two doors to the
      // ledger. Every other call site is a place where a token could be taken
      // without the route table noticing.
      //
      // Two files are allowed to open that door: the service itself, and the
      // template library, which buys a premium template and is checked
      // separately below.
      const allowed = new Set([
        join('server', 'db', 'credits.ts'),
        join('server', 'credits', 'service.ts'),
        join('server', 'credits', 'middleware.ts'),
        join('server', 'cvTemplates', 'routes.ts'),
      ]);

      const offenders: string[] = [];
      for (const file of serverFiles) {
        const relativePath = relative(REPO_ROOT, file);
        if (allowed.has(relativePath)) continue;

        const contents = readFileSync(file, 'utf8');
        if (/\bdeductCredits\s*\(/.test(contents) || /\bchargeAiAction\s*\(/.test(contents)) {
          offenders.push(relativePath);
        }
      }

      assert.deepEqual(
        offenders,
        [],
        `these server files spend tokens outside the credit service: ${offenders.join(', ')}`
      );
    });

    test('the premium template unlock is the only purchase outside the route table', () => {
      const contents = readFileSync(CV_TEMPLATES_ROUTES_TS, 'utf8');
      const charges = [...contents.matchAll(/chargeAiAction\(\{[^}]*action:\s*'([a-z_]+)'/g)].map(
        (match) => match[1]
      );

      assert.deepEqual(
        charges,
        ['premium_template_unlock'],
        'the template library may only charge for unlocking a premium template'
      );
    });

    test('the premium template unlock is idempotent', () => {
      // Unlocking the same template twice must never cost twice. The ledger
      // key is derived from the candidate and the template, not from the
      // moment the button was pressed.
      const contents = readFileSync(CV_TEMPLATES_ROUTES_TS, 'utf8');
      assert.ok(
        /idempotencyKey\s*=\s*`cv-template-unlock:\$\{profileId\}:\$\{templateId\}`/.test(contents),
        'the unlock key must be derived from the candidate and the template'
      );
      assert.ok(
        /idempotencyKey:\s*`cv-template-unlock-refund:\$\{profileId\}:\$\{templateId\}`/.test(
          contents
        ),
        'the reversal must be keyed the same way, so it can never be applied twice'
      );
    });
  });

  describe('a token is spent on a result, not on an attempt', () => {
    const source = readFileSync(MIDDLEWARE_TS, 'utf8');

    test('a credit is only kept when the route confirms an AI result', () => {
      assert.match(
        source,
        /aiCompleted/,
        'the reservation must record whether an AI completion happened'
      );
      assert.match(
        source,
        /markAiCreditCompleted/,
        'the middleware must expose a way for a route to confirm its AI result'
      );
      assert.match(
        source,
        /!reservation\.aiCompleted[\s\S]{0,600}refundAiCreditReservation/,
        'a successful request that produced no AI result must give the credit back'
      );
    });

    test('a failed request gives the credit back', () => {
      assert.match(
        source,
        /res\.statusCode\s*>=\s*400[\s\S]{0,600}refundAiCreditReservation/,
        'a request that failed must give the credit back'
      );
    });

    test('the automatic refund does not hang on the response finish event', () => {
      // The 'finish' event is not emitted by every runtime this application
      // runs on. Under the Cloudflare Pages worker's node:http bridge it is
      // never emitted, so a refund that waited for it never happened: the
      // request was answered with the credit already spent. The settlement is
      // therefore attached to the end of the response itself.
      assert.doesNotMatch(
        source,
        /res\.on\(\s*['"]finish['"]/,
        "the automatic refund must not wait for the response's 'finish' event"
      );
      assert.match(
        source,
        /res\.end\s*=/,
        'the automatic refund must be attached to the end of the response'
      );
      assert.match(
        source,
        /Promise\.resolve\(settlement\)\.then\(send\)/,
        'the refund must be settled before the response is written'
      );
    });

    test('a replayed request is never refunded', () => {
      // A replayed ledger key means this request took no money. Refunding it
      // would return a credit that the original request legitimately spent.
      assert.match(
        source,
        /if \(!reservation\.charged\)[\s\S]{0,300}reservation\.refunded\s*=\s*true/,
        'a replayed request must not refund a credit it never took'
      );
    });

    test('every AI route in the route table confirms its result', () => {
      const appSource = readFileSync(APP_TS, 'utf8');
      const blocks = parseRouteBlocks(appSource);

      const missing: string[] = [];
      for (const path of Object.keys(ALLOWED_TOKEN_ROUTES)) {
        const block = blocks.get(path);
        if (!block) continue;
        if (!block.includes('markAiCreditCompleted')) {
          missing.push(path);
        }
      }

      assert.deepEqual(
        missing,
        [],
        `these routes spend a token but never confirm that they produced an AI result, so they would always be refunded:\n${missing.join('\n')}`
      );
    });
  });

  describe('the same request is charged once', () => {
    test('the ledger key is derived from the content of the request', () => {
      const source = readFileSync(MIDDLEWARE_TS, 'utf8');
      assert.match(
        source,
        /requestFingerprint\(req\.body\)/,
        'the ledger key must be derived from the body of the request'
      );
      assert.match(
        source,
        /ai_req_\$\{profileId\}_\$\{action\}_\$\{fingerprint\}/,
        'the ledger key must carry the fingerprint of the request'
      );
      assert.doesNotMatch(
        source,
        /Math\.random\(\)[^\n]*idempotencyKey/,
        'the ledger key must not be random: a random key charges every duplicate'
      );
    });

    test('two identical bodies produce the same fingerprint', () => {
      const first = requestFingerprint({ jobDescription: 'a role', language: 'en' });
      const second = requestFingerprint({ language: 'en', jobDescription: 'a role' });
      assert.equal(first, second, 'the order of the keys must not change the fingerprint');
    });

    test('two different bodies produce different fingerprints', () => {
      const first = requestFingerprint({ jobDescription: 'a role', language: 'en' });
      const second = requestFingerprint({ jobDescription: 'another role', language: 'en' });
      assert.notEqual(first, second, 'a different request must be a different request');
    });

    test('the fingerprint is not the body itself', () => {
      const fingerprint = requestFingerprint({ jobDescription: 'a role' });
      assert.ok(!fingerprint.includes('role'), 'the fingerprint must not carry the content');
      assert.match(fingerprint, /^[0-9a-f]{32}$/, 'the fingerprint must be a stable digest');
    });
  });

  describe('the interface says what a token costs', () => {
    test('the cost shown is the cost the server charges', () => {
      for (const action of Object.keys(CREDIT_WEIGHTS) as AICreditAction[]) {
        assert.equal(
          aiTokenCost(action),
          CREDIT_WEIGHTS[action],
          `the interface must quote the price the server charges for '${action}'`
        );
      }
    });

    test('the label reads as a cost', () => {
      const t = (key: string) => key;
      assert.equal(aiTokenCostLabel('ai_assist_inline', t), '(1 Token)');
      assert.equal(aiTokenCostLabel('cv_tailoring', t), '(4 Tokens)');
      assert.equal(
        aiButtonLabel('Run ATS Audit', 'cv_tailoring', t),
        'Run ATS Audit (4 Tokens)'
      );
    });

    test('every token-spending action has a price the interface can quote', () => {
      for (const action of Object.keys(CREDIT_WEIGHTS) as AICreditAction[]) {
        assert.ok(
          CREDIT_WEIGHTS[action] > 0,
          `the action '${action}' must have a price, or it must not spend tokens at all`
        );
      }
    });

    test('every token-spending action shows its cost in the interface', () => {
      // A token must never be spent without the candidate knowing what it
      // costs. Every action the server can charge therefore has to appear as
      // a cost label somewhere in the interface.
      //
      // The premium template is excluded because the template library draws
      // its price from the product constant and already showed it.
      const interfaceFiles = collectSourceFiles(join(REPO_ROOT, 'src')).filter((file) =>
        /\.(ts|tsx)$/.test(file)
      );

      const quoted = new Set<string>();
      for (const file of interfaceFiles) {
        const contents = readFileSync(file, 'utf8');
        for (const match of contents.matchAll(
          /ai(?:ButtonLabel|TokenCostLabel)\(\s*(?:t\([^)]*\)|'[^']*'|"[^"]*")\s*,\s*'([a-z_]+)'/g
        )) {
          quoted.add(match[1]);
        }
        // The template library shows the price of the premium template from
        // the product constant, so it is quoted without a cost action.
        if (contents.includes('CV_TEMPLATE_PREMIUM_UNLOCK_CREDITS')) {
          quoted.add('premium_template_unlock');
        }
      }

      const missing = [
        ...new Set<AICreditAction>([
          ...(Object.values(ALLOWED_TOKEN_ROUTES) as AICreditAction[]),
          'premium_template_unlock',
        ]),
      ].filter((action) => !quoted.has(action));

      assert.deepEqual(
        missing,
        [],
        `these actions spend a token but the interface never says what they cost: ${missing.join(', ')}`
      );
    });
  });
});
