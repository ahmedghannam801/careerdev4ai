// The payment accounts.
//
// The identifiers a customer transfers money to are the most trusted string
// in the product: a wrong digit means a real transfer to a wallet that does
// not belong to this business, and a wrong InstaPay address means a transfer
// nobody can reconcile.
//
// These tests hold three things:
//
//   1. the authoritative values are exactly the agreed ones;
//   2. every payment surface reads them from one place rather than from a
//      constant of its own;
//   3. no outdated identifier survives anywhere in the repository.
//
// The third one is a repository scan on purpose. A placeholder left in a
// component that nobody opens any more is still an identifier somebody can
// copy, and the cost of finding it later is a refund.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  CONTACT_PHONE,
  INSTAPAY_ACCOUNT_HOLDER,
  INSTAPAY_HANDLE,
  PAYMENT_ACCOUNTS,
  VODAFONE_CASH_ACCOUNT_HOLDER,
  VODAFONE_CASH_WALLET,
  VODAFONE_CASH_WALLET_INTERNATIONAL,
  getPaymentAccount,
  maskPaymentIdentifier,
} from '../shared/paymentAccounts.ts';
import { getPaymentInstructions } from '../server/db/payments.ts';

const REPO_ROOT = join(import.meta.dirname, '..');

/** The identifiers this platform transfers money to. They are authoritative. */
const EXPECTED_VODAFONE_CASH = '01027053876';
const EXPECTED_INSTAPAY = 'ahmed1192005@instapay';

/** The values that were wrong and must not appear anywhere. */
const OUTDATED_IDENTIFIERS = [
  '01012345678',
  'careerdev4ai@instapay',
  'ahmed1192005@instapay.com',
  'ahmed1192005@instapay.eg',
  '0102705387a',
];

/** The directories that hold no product source and are not scanned. */
const IGNORED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'dist-android',
  'android',
  'build',
  'coverage',
  '.wrangler',
  '.agents',
  '.minimax',
  // Working copies and scratch checkouts. They are not the product.
  '.claude',
  '.tmp-qa',
  '.tmp',
]);

/** The file extensions that hold product source or configuration. */
const SCANNED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.jsonc',
  '.md',
  '.html',
  '.css',
  '.sql',
  '.yml',
  '.yaml',
  '.env.example',
]);

function collectFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (IGNORED_DIRECTORIES.has(entry)) continue;
    const absolute = join(directory, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      collectFiles(absolute, found);
      continue;
    }
    const name = entry.toLowerCase();
    const extension = name.includes('.') ? name.slice(name.lastIndexOf('.')) : name;
    if (!SCANNED_EXTENSIONS.has(extension) && name !== '.env.example') continue;
    found.push(absolute);
  }
  return found;
}

describe('the payment accounts are the agreed ones', () => {
  test('the Vodafone Cash wallet is exact', () => {
    assert.equal(VODAFONE_CASH_WALLET, EXPECTED_VODAFONE_CASH);
    assert.equal(VODAFONE_CASH_WALLET.length, 11, 'a local Egyptian wallet number is eleven digits');
    assert.match(VODAFONE_CASH_WALLET, /^01[0-9]{9}$/);
  });

  test('the InstaPay address is exact', () => {
    assert.equal(INSTAPAY_HANDLE, EXPECTED_INSTAPAY);
    assert.equal(INSTAPAY_HANDLE, 'ahmed1192005@instapay');
    assert.match(INSTAPAY_HANDLE, /^[^@\s]+@instapay$/, 'an IPA is a local part and a domain');
  });

  test('the international form of the wallet is the same number', () => {
    assert.equal(VODAFONE_CASH_WALLET_INTERNATIONAL, '+201027053876');
    // An Egyptian number written internationally is the country code, then the
    // national number without its leading zero.
    assert.equal(
      VODAFONE_CASH_WALLET_INTERNATIONAL,
      `+20${VODAFONE_CASH_WALLET.slice(1)}`,
      'the international form must be the same wallet, not a different number'
    );
    assert.equal(CONTACT_PHONE, VODAFONE_CASH_WALLET_INTERNATIONAL);
  });

  test('the account holders are named', () => {
    assert.ok(VODAFONE_CASH_ACCOUNT_HOLDER.length > 0);
    assert.ok(INSTAPAY_ACCOUNT_HOLDER.length > 0);
  });

  test('the registry resolves both rails', () => {
    assert.equal(PAYMENT_ACCOUNTS.vodafone_cash.identifier, EXPECTED_VODAFONE_CASH);
    assert.equal(PAYMENT_ACCOUNTS.instapay.identifier, EXPECTED_INSTAPAY);
    assert.equal(getPaymentAccount('vodafone_cash')?.identifier, EXPECTED_VODAFONE_CASH);
    assert.equal(getPaymentAccount('instapay')?.identifier, EXPECTED_INSTAPAY);
    assert.equal(getPaymentAccount('nonsense'), null, 'an unknown rail must not resolve');
  });

  test('an identifier is masked for logs and admin lists', () => {
    const masked = maskPaymentIdentifier(EXPECTED_VODAFONE_CASH);
    assert.ok(!masked.includes(EXPECTED_VODAFONE_CASH));
    assert.ok(masked.endsWith('3876'));
  });
});

describe('the server sends the authoritative identifiers', () => {
  test('the Vodafone Cash instructions carry the wallet', () => {
    const instructions = getPaymentInstructions('vodafone_cash', 9900);
    assert.equal(instructions.recipientAccount, EXPECTED_VODAFONE_CASH);
    assert.equal(instructions.amountFormatted, '99 EGP');
    assert.ok(
      instructions.instructionsEn.some((line) => line.includes(EXPECTED_VODAFONE_CASH)),
      'the English instructions must name the wallet the customer transfers to'
    );
    assert.ok(
      instructions.instructionsAr.some((line) => line.includes(EXPECTED_VODAFONE_CASH)),
      'the Arabic instructions must name the wallet the customer transfers to'
    );
  });

  test('the InstaPay instructions carry the address', () => {
    const instructions = getPaymentInstructions('instapay', 17900);
    assert.equal(instructions.recipientAccount, EXPECTED_INSTAPAY);
    assert.equal(instructions.amountFormatted, '179 EGP');
    assert.ok(
      instructions.instructionsEn.some((line) => line.includes(EXPECTED_INSTAPAY)),
      'the English instructions must name the address the customer transfers to'
    );
    assert.ok(
      instructions.instructionsAr.some((line) => line.includes(EXPECTED_INSTAPAY)),
      'the Arabic instructions must name the address the customer transfers to'
    );
  });
});

describe('no outdated identifier survives in the repository', () => {
  const files = collectFiles(REPO_ROOT);

  test('the scan found the product source', () => {
    assert.ok(files.length > 50, `the scan only found ${files.length} files`);
  });

  for (const outdated of OUTDATED_IDENTIFIERS) {
    test(`"${outdated}" appears nowhere`, () => {
      const offenders: string[] = [];
      for (const file of files) {
        const relativePath = relative(REPO_ROOT, file);
        // This file names the outdated values on purpose: it is the list.
        if (relativePath === 'tests\\payment-accounts.test.ts' || relativePath === 'tests/payment-accounts.test.ts') {
          continue;
        }
        const contents = readFileSync(file, 'utf8');
        if (contents.includes(outdated)) {
          offenders.push(relativePath);
        }
      }
      assert.deepEqual(
        offenders,
        [],
        `these files still carry the outdated identifier "${outdated}": ${offenders.join(', ')}`
      );
    });
  }

  test('the authoritative identifiers are only written down once', () => {
    // The registry holds them. Anything else in the product source that
    // writes them down is a second place to forget to update.
    //
    // The scan is limited to the product source: the README documents the
    // contact number on purpose, and this test is about code, not prose.
    const allowed = new Set([join('shared', 'paymentAccounts.ts')]);
    const sourceRoots = ['src', 'server', 'shared', 'scripts', 'worker'];
    const offenders: string[] = [];
    for (const file of files) {
      const relativePath = relative(REPO_ROOT, file);
      const inSource = sourceRoots.some(
        (root) => relativePath === root || relativePath.startsWith(`${root}\\`)
      );
      if (!inSource) continue;
      if (allowed.has(relativePath)) continue;
      if (relativePath.startsWith('tests\\')) continue;
      const contents = readFileSync(file, 'utf8');
      if (contents.includes(EXPECTED_VODAFONE_CASH) || contents.includes(EXPECTED_INSTAPAY)) {
        offenders.push(relativePath);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `these files write a payment identifier down themselves: ${offenders.join(', ')}`
    );
  });
});
