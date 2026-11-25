/**
 * The business-information, contact and refund-policy pages.
 *
 * These three pages are what a customer, a partner or a payment provider
 * reads when they check the business and the money. They can rot silently —
 * a removed email address, a policy that no longer mentions how a refund is
 * requested, a footer link that points nowhere — so the facts are held here.
 *
 * Pure: no database, no server, no browser.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUSINESS_CONTACT,
  BUSINESS_EMAIL,
  businessLocation,
  PUBLIC_PATHS,
} from '../shared/contact.ts';
import { REFUND_POLICY } from '../shared/legal.ts';
import {
  buildBusinessInformationPage,
  buildContactPage,
  buildRefundPolicyPage,
} from '../server/seo/businessInfo.ts';
import { renderPublicPage } from '../server/seo/html.ts';

test('the business information page publishes the business, its location and its legal links', () => {
  const html = renderPublicPage(buildBusinessInformationPage('en'));

  assert.match(html, /<h1>Business Information<\/h1>/);
  assert.match(html, /Aionvia/);
  // The location a reviewer checks first.
  assert.match(html, /Tanta, Egypt/);
  // The mailbox the business answers on.
  assert.match(html, /aionvia09@gmail\.com/);
  // The website the service is bought from.
  assert.match(html, /https:\/\/aionvia\.pages\.dev/);
  // What the product actually is.
  assert.match(html, /online career development SaaS platform/);
  // The legal documents.
  assert.match(html, /Terms of Service/);
  assert.match(html, /Refund Policy/);
  assert.match(html, /Privacy Policy/);
  assert.match(html, /href="\/refund-policy"/);
  assert.match(html, /href="\/terms"/);
  assert.match(html, /href="\/privacy"/);
  assert.match(html, /<html lang="en" dir="ltr">/);
  assert.match(html, /name="viewport"/);
});

test('the business information page publishes the location without inventing an address', () => {
  // The city and the country are the published location. The finer address
  // fields are not published, and the page must not put a plausible-looking
  // street in their place.
  assert.equal(BUSINESS_CONTACT.address.city, 'Tanta');
  assert.equal(BUSINESS_CONTACT.address.country, 'Egypt');
  assert.equal(BUSINESS_CONTACT.address.street, null);
  assert.equal(BUSINESS_CONTACT.address.locality, null);
  assert.equal(BUSINESS_CONTACT.address.governorate, null);
  assert.equal(BUSINESS_CONTACT.address.postalCode, null);
  assert.equal(businessLocation(), 'Tanta, Egypt');

  const html = renderPublicPage(buildBusinessInformationPage('en'));

  // The structured data names the city and the country, and omits the street.
  assert.match(html, /"addressLocality":"Tanta"/);
  assert.match(html, /"addressCountry":"Egypt"/);
  assert.doesNotMatch(html, /"streetAddress":"[^"]+/);
  assert.doesNotMatch(html, /"postalCode":"[^"]+/);
});

test('the business contact email is published once and read from one place', () => {
  assert.equal(BUSINESS_CONTACT.email, BUSINESS_EMAIL);
  assert.equal(BUSINESS_EMAIL, 'aionvia09@gmail.com');

  const html = renderPublicPage(buildBusinessInformationPage('en'));
  assert.match(html, /mailto:aionvia09@gmail\.com/);
});

test('the Arabic business information page is a real RTL document with the same facts', () => {
  const html = renderPublicPage(buildBusinessInformationPage('ar'));

  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /المعلومات التجارية/);
  assert.match(html, /Aionvia/);
  assert.match(html, /Tanta, Egypt/);
  assert.match(html, /aionvia09@gmail\.com/);
  assert.match(html, /href="\/refund-policy\/ar"/);
  assert.match(html, /href="\/terms"/);
});

test('the contact page is public, carries the location and links to the business information page', () => {
  const html = renderPublicPage(buildContactPage('en'));

  assert.match(html, /<h1>Contact Us<\/h1>/);
  assert.match(html, /Tanta, Egypt/);
  assert.match(html, /aionvia09@gmail\.com/);
  assert.match(html, /href="\/business-information"/);
  assert.match(html, /href="\/refund-policy"/);
  assert.match(html, /<html lang="en" dir="ltr">/);
});

test('the refund policy page is public and explains how a refund is asked for', () => {
  assert.equal(REFUND_POLICY.approved, true);
  assert.ok(REFUND_POLICY.sections.length > 0);

  const html = renderPublicPage(buildRefundPolicyPage('en'));

  assert.match(html, /Refund Policy/);
  // The three things a reader has to be able to find.
  assert.match(html, /Cancelling a subscription/);
  assert.match(html, /Your right to request a refund/);
  assert.match(html, /Billing disputes and payment issues/);
  // The address the request is sent to.
  assert.match(html, /aionvia09@gmail\.com/);
  // The digital-service conditions.
  assert.match(html, /digital/);
  assert.match(html, /href="\/business-information"/);
  assert.match(html, /href="\/terms"/);
  assert.match(html, /<html lang="en" dir="ltr">/);
});

test('the Arabic refund policy is RTL and publishes the Arabic sections', () => {
  const html = renderPublicPage(buildRefundPolicyPage('ar'));

  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /سياسة الاسترداد/);
  assert.match(html, /إلغاء الاشتراك/);
  assert.match(html, /حقك في طلب الاسترداد/);
  assert.match(html, /aionvia09@gmail\.com/);
  assert.match(html, /href="\/contact\/ar"/);
});

test('the shared public-path vocabulary exposes the business and refund URLs', () => {
  assert.equal(PUBLIC_PATHS.businessInformation, '/business-information');
  assert.equal(PUBLIC_PATHS.refundPolicy, '/refund-policy');
  assert.equal(PUBLIC_PATHS.contact, '/contact');
  assert.equal(PUBLIC_PATHS.terms, '/terms');
  assert.equal(PUBLIC_PATHS.privacy, '/privacy');
});
