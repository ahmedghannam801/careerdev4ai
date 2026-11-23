import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUSINESS_CONTACT, PUBLIC_PATHS } from '../shared/contact.ts';
import { REFUND_POLICY } from '../shared/legal.ts';
import { buildBusinessInformationPage, buildRefundPolicyPage } from '../server/seo/businessInfo.ts';
import { renderPublicPage } from '../server/seo/html.ts';

test('the business information page publishes the business, contact details and legal links', () => {
  const html = renderPublicPage(buildBusinessInformationPage('en'));

  assert.match(html, /Business Information &amp; Contact Us/);
  assert.match(html, /Aionvia/);
  assert.match(html, /ahmedghannam801@gmail\.com/);
  assert.match(html, /\+20 10 2705 3876/);
  assert.match(html, /Terms &amp; Conditions/);
  assert.match(html, /Refund Policy/);
  assert.match(html, /href="\/refund-policy"/);
  assert.match(html, /href="\/business-information"/);
  assert.match(html, /<html lang="en" dir="ltr">/);
  assert.match(html, /name="viewport"/);
});

test('the business information page shows an unverified address as outstanding, never invented', () => {
  // The owner has not supplied the Egyptian address yet. The page must say so
  // and must not put a plausible-looking street or city in its place.
  assert.equal(BUSINESS_CONTACT.address.street, null);
  assert.equal(BUSINESS_CONTACT.address.city, null);

  const html = renderPublicPage(buildBusinessInformationPage('en'));
  assert.match(html, /address to be published/);
  assert.match(html, /To be published/);
  assert.doesNotMatch(html, /streetAddress":"[^"]+/);
  assert.doesNotMatch(html, /addressLocality":"[^"]+/);
});

test('the Arabic business information page is a real RTL document with the same facts', () => {
  const html = renderPublicPage(buildBusinessInformationPage('ar'));

  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /المعلومات التجارية واتصل بنا/);
  assert.match(html, /Aionvia/);
  assert.match(html, /ahmedghannam801@gmail\.com/);
  assert.match(html, /href="\/contact"/);
  assert.match(html, /href="\/refund-policy\/ar"/);
  assert.match(html, /العنوان قيد النشر/);
});

test('the refund policy page is public and links back to the business information page', () => {
  assert.equal(REFUND_POLICY.approved, true);
  assert.ok(REFUND_POLICY.sections.length > 0);

  const html = renderPublicPage(buildRefundPolicyPage('en'));
  assert.match(html, /Refund Policy/);
  assert.match(html, /Your right to request a refund/);
  assert.match(html, /href="\/contact"/);
  assert.match(html, /href="\/terms"/);
  assert.match(html, /<html lang="en" dir="ltr">/);
});

test('the Arabic refund policy is RTL and publishes the Arabic sections', () => {
  const html = renderPublicPage(buildRefundPolicyPage('ar'));
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /سياسة الاسترداد/);
  assert.match(html, /حقك في طلب الاسترداد/);
  assert.match(html, /href="\/contact\/ar"/);
});

test('the shared public-path vocabulary exposes the business and refund URLs', () => {
  assert.equal(PUBLIC_PATHS.businessInformation, '/contact');
  assert.equal(PUBLIC_PATHS.refundPolicy, '/refund-policy');
});
