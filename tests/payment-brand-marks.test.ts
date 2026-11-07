// The payment brand marks.
//
// A checkout that shows a made-up mark is worse than one that shows no mark:
// the customer is being asked to trust a drawing that the company behind it
// did not make. These tests therefore check the marks against the files they
// came from, rather than against a description of what a brand "looks like".
//
//   * The four glyph marks are the Simple Icons files in
//     `src/assets/payment/`. The path data in the React component must be
//     the path data in the file, character for character.
//   * The InstaPay wordmark is the official image from InstaPay's own site,
//     trimmed to its bounds. The component must render that file and nothing
//     else.
//   * Every payment method the platform offers must have a mark, and the
//     checkout must use the marks rather than a generic icon.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const ASSET_DIR = join(REPO_ROOT, 'src', 'assets', 'payment');
const COMPONENT = join(REPO_ROOT, 'src', 'components', 'payment', 'PaymentBrandMarks.tsx');

const component = readFileSync(COMPONENT, 'utf-8');

/** The marks that come from a Simple Icons file. */
const SVG_MARKS: { file: string; exportName: string; brand: string; fileTitle: string }[] = [
  { file: 'vodafone.svg', exportName: 'VodafoneCashMark', brand: 'Vodafone Cash', fileTitle: 'Vodafone' },
  { file: 'stripe.svg', exportName: 'StripeMark', brand: 'Stripe', fileTitle: 'Stripe' },
  { file: 'visa.svg', exportName: 'VisaMark', brand: 'Visa', fileTitle: 'Visa' },
  { file: 'mastercard.svg', exportName: 'MasterCardMark', brand: 'Mastercard', fileTitle: 'MasterCard' },
];

/** Reads the `d` attribute of the path inside a Simple Icons file. */
function svgPathData(svg: string): string {
  const match = /<path[^>]*\sd="([^"]+)"/.exec(svg);
  assert.ok(match, 'the SVG must contain a path');
  return match[1];
}

/** Reads the `d` attribute of the path inside the React component. */
function componentPathData(source: string, exportName: string): string {
  const start = source.indexOf(`export const ${exportName}`);
  assert.ok(start > 0, `the component must export ${exportName}`);
  const slice = source.slice(start, start + 4000);
  const match = /d="([^"]+)"/.exec(slice);
  assert.ok(match, `${exportName} must render a path`);
  return match[1];
}

describe('the brand marks are the real ones', () => {
  for (const mark of SVG_MARKS) {
    test(`${mark.brand} renders the path of its source file`, () => {
      const assetPath = join(ASSET_DIR, mark.file);
      assert.ok(existsSync(assetPath), `${mark.file} must be kept next to the component`);
      const svg = readFileSync(assetPath, 'utf-8');
      assert.equal(
        componentPathData(component, mark.exportName),
        svgPathData(svg),
        `${mark.exportName} must render the path of ${mark.file} exactly — a drawn approximation is not a brand mark`
      );
    });
  }

  test('the Simple Icons files are the ones they claim to be', () => {
    for (const mark of SVG_MARKS) {
      const svg = readFileSync(join(ASSET_DIR, mark.file), 'utf-8');
      assert.match(svg, /viewBox="0 0 24 24"/, `${mark.file} must keep the Simple Icons geometry`);
      // Simple Icons names the brand in the title of the file.
      const title = /<title>([^<]+)<\/title>/.exec(svg);
      assert.ok(title, `${mark.file} must name the brand it is`);
      assert.equal(
        title[1],
        mark.fileTitle,
        `${mark.file} must be the ${mark.brand} mark, not another one`
      );
    }
  });

  test('the InstaPay mark is the official image, not a drawing', () => {
    const logoPath = join(ASSET_DIR, 'instapay-logo.png');
    assert.ok(existsSync(logoPath), 'the official InstaPay wordmark must be kept');
    assert.ok(
      readFileSync(logoPath).length > 1000,
      'the wordmark must be the real image, not an empty placeholder'
    );
    assert.match(component, /from '\.\.\/\.\.\/assets\/payment\/instapay-logo\.png'/);
    assert.match(component, /export const InstaPayMark/);
  });

  test('the sources and licences are documented', () => {
    const attribution = join(ASSET_DIR, 'ATTRIBUTION.md');
    assert.ok(existsSync(attribution), 'the sources of the marks must be written down');
    const text = readFileSync(attribution, 'utf-8');
    for (const mark of SVG_MARKS) {
      assert.ok(text.includes(mark.file), `${mark.file} must be listed`);
    }
    assert.ok(text.includes('instapay-logo.png'), 'the InstaPay image must be listed');
    assert.match(text, /CC0/, 'the licence of the Simple Icons marks must be named');
  });
});

describe('every payment method the platform offers has a mark', () => {
  test('the component exports a mark for each method', () => {
    for (const name of [
      'VodafoneCashMark',
      'InstaPayMark',
      'StripeMark',
      'VisaMark',
      'MasterCardMark',
      'CardNetworkMarks',
    ]) {
      assert.ok(
        component.includes(`export const ${name}`),
        `${name} must be exported so a payment surface can use it`
      );
    }
  });

  test('the card networks are offered together', () => {
    assert.match(component, /export const CardNetworkMarks/);
    const start = component.indexOf('export const CardNetworkMarks');
    const slice = component.slice(start, start + 600);
    assert.match(slice, /VisaMark/);
    assert.match(slice, /MasterCardMark/);
  });

  test('a mark is decorative unless it is given a name', () => {
    // A mark always sits next to the name of the method, so it is hidden from
    // assistive technology. The name is what is read out.
    assert.match(component, /aria-hidden/);
    assert.match(component, /role: title \?/);
    assert.match(component, /'img' as const/);
  });
});

describe('the payment surfaces use the marks', () => {
  const checkoutPath = join(REPO_ROOT, 'src', 'components', 'subscription', 'CheckoutModal.tsx');
  const pricingPath = join(REPO_ROOT, 'src', 'components', 'views', 'PricingView.tsx');

  test('the checkout uses the brand marks', () => {
    assert.ok(existsSync(checkoutPath));
    const checkout = readFileSync(checkoutPath, 'utf-8');
    assert.match(
      checkout,
      /PaymentBrandMarks/,
      'the checkout must render the real payment marks'
    );
    assert.match(checkout, /VodafoneCashMark/);
    assert.match(checkout, /InstaPayMark/);
    assert.match(checkout, /StripeMark/);
  });

  test('the pricing page uses the brand marks', () => {
    assert.ok(existsSync(pricingPath));
    const pricing = readFileSync(pricingPath, 'utf-8');
    assert.match(pricing, /PaymentBrandMarks/);
    assert.match(pricing, /VodafoneCashMark/);
    assert.match(pricing, /InstaPayMark/);
  });
});
