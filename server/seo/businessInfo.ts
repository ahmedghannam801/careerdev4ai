/**
 * The business-information and refund-policy public pages.
 *
 * Both pages exist for the same reason: a customer, a payment provider or a
 * compliance reviewer has to be able to check who the business is, where it
 * is, how to reach it and what happens when a payment has to be returned —
 * without creating an account.
 *
 * The pages are server-rendered HTML and are built from shared configuration,
 * not from per-request data. `shared/contact.ts` owns the contact details and
 * `shared/legal.ts` owns the policy text. Nothing here invents a business
 * fact: an address the owner has not supplied is rendered as an explicit
 * outstanding item and is omitted from structured data.
 */

import {
  BUSINESS_CONTACT,
  businessAddressLines,
  businessPhoneHref,
  isBusinessContactComplete,
  OPERATOR_LINKEDIN_URL,
  OPERATOR_NAME,
} from '../../shared/contact.ts';
import { REFUND_POLICY, hasApprovedRefundPolicy } from '../../shared/legal.ts';
import { SITE_NAME, absoluteUrl } from './config.ts';
import { escapeHtml, type PublicPage } from './html.ts';
import { breadcrumbSchema, contactPageSchema, webPageSchema } from './jsonld.ts';

type Language = 'en' | 'ar';

function button(href: string, label: string): string {
  return `<a class="button secondary" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function contactPath(language: Language): string {
  return language === 'ar' ? '/contact/ar' : '/contact';
}

function refundPath(language: Language): string {
  return language === 'ar' ? '/refund-policy/ar' : '/refund-policy';
}

/**
 * The Business Information / Contact Us page.
 *
 * `/contact` is the English page and `/contact/ar` is the Arabic, RTL page.
 * Both read the same contact object, so the two versions cannot disagree.
 */
export function buildBusinessInformationPage(language: Language = 'en'): PublicPage {
  const path = contactPath(language);
  const ar = language === 'ar';
  const details = BUSINESS_CONTACT;

  const addressLines = businessAddressLines(details);
  // A postal address is only published once it has a street and a city: a
  // governorate on its own is not an address a letter could be sent to.
  const addressPublished = Boolean(
    details.address.street?.trim() && details.address.city?.trim()
  );
  const phoneHref = businessPhoneHref(details);
  const email = details.email?.trim() || null;
  const complete = isBusinessContactComplete(details);

  const description = ar
    ? 'المعلومات التجارية وبيانات الاتصال بـ Aionvia: اسم النشاط التجاري، العنوان في مصر، رقم الهاتف، البريد الإلكتروني، وروابط الشروط وسياسة الاسترداد.'
    : 'Business information for Aionvia: the trading name, the business address in Egypt, the telephone number on +20, the official email address, and links to the Terms & Conditions and Refund Policy.';

  const missing: string[] = [];
  if (!addressPublished) missing.push(ar ? 'العنوان التجاري في مصر' : 'the registered business address in Egypt');
  if (!details.phone?.trim()) missing.push(ar ? 'رقم الهاتف' : 'the telephone number');
  if (!email) missing.push(ar ? 'البريد الإلكتروني' : 'the business email address');

  const pinIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
  const phoneIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>';
  const mailIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>';
  const buildingIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 9h2a2 2 0 0 1 2 2v10M9 7h2M9 11h2M9 15h2"/></svg>';

  const addressValue = addressPublished
    ? `<address class="contact-value address-block">${addressLines
        .map((line) => `<span>${escapeHtml(line)}</span>`)
        .join('')}</address>`
    : `<div class="pending">
         <p class="contact-value">${ar
           ? `${escapeHtml(details.address.country)} — العنوان قيد النشر`
           : `${escapeHtml(details.address.country)} — address to be published`}</p>
       </div>
       <p><span class="chip-pending">${ar ? 'قيد النشر' : 'To be published'}</span></p>`;

  const phoneValue = details.phone?.trim()
    ? `<p class="contact-value"><a href="${escapeHtml(phoneHref ?? '')}">${escapeHtml(
        details.phone.trim()
      )}</a></p>`
    : `<div class="pending"><p class="contact-value">+20 XX XXX XXXX</p></div>
       <p><span class="chip-pending">${ar ? 'قيد النشر' : 'To be published'}</span></p>`;

  const emailValue = email
    ? `<p class="contact-value"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>`
    : `<div class="pending"><p class="contact-value">${ar ? 'البريد الإلكتروني قيد النشر' : 'Email address to be published'}</p></div>
       <p><span class="chip-pending">${ar ? 'قيد النشر' : 'To be published'}</span></p>`;

  const pendingNotice =
    complete || missing.length === 0
      ? ''
      : `      <div class="notice" role="note">
        <p><strong>${ar ? 'بعض البيانات لم تُنشر بعد.' : `${missing.length === 1 ? 'One detail is' : `${missing.length} details are`} still to be published.`}</strong> ${escapeHtml(
          ar ? missing.join('، ') : missing.join(', ').replace(/, ([^,]*)$/, ' and $1')
        )}. ${ar
          ? 'لم نضع أي عنوان أو رقم بديل: البيانات غير المؤكدة تظل معلَّمة كناقصة حتى يقدم المالك التفاصيل الموثقة.'
          : 'Nothing is shown in its place: an unconfirmed address or number stays marked as outstanding until the owner supplies the verified detail, because a plausible placeholder would be a false business detail.'}</p>
      </div>`;

  const body = `      <section class="hero">
        <h1>${ar ? 'المعلومات التجارية واتصل بنا' : 'Business Information &amp; Contact Us'}</h1>
        <p class="lede">${escapeHtml(description)}</p>
        <p>${ar
          ? 'هذه الصفحة متاحة للعامة دون تسجيل دخول. تجمع معلومات النشاط التجاري وبيانات الاتصال والوثائق القانونية في مكان واحد.'
          : 'This page is public and needs no account. It brings the business details, the contact channels and the legal documents together in one place.'}</p>
      </section>

      <section>
        <h2>${ar ? 'بيانات النشاط التجاري' : 'Business details'}</h2>
        <p>${ar
          ? 'فيما يلي المعلومات التي يحتاجها العميل أو الشريك أو مراجع الامتثال للتحقق من النشاط التجاري والتواصل معه مباشرة.'
          : 'These are the details a customer, a partner or a compliance reviewer checks when verifying the business and contacting it directly.'}</p>
        <div class="grid">
          <div class="card contact-card">
            <span class="contact-icon">${buildingIcon}</span>
            <span class="contact-label">${ar ? 'اسم النشاط التجاري' : 'Business name'}</span>
            <p class="contact-value">${escapeHtml(details.businessName)}</p>
            <p class="contact-note">${ar
              ? 'الاسم التجاري الذي تعمل به المنصة.'
              : 'The trading name the platform operates under.'}</p>
          </div>
          <div class="card contact-card">
            <span class="contact-icon">${pinIcon}</span>
            <span class="contact-label">${ar ? 'العنوان التجاري' : 'Business address'}</span>
            ${addressValue}
            <p class="contact-note">${ar
              ? `العنوان المسجل للنشاط التجاري في ${escapeHtml(details.address.country)}.`
              : `The registered address of the business in ${escapeHtml(details.address.country)}.`}</p>
          </div>
          <div class="card contact-card">
            <span class="contact-icon">${phoneIcon}</span>
            <span class="contact-label">${ar ? 'الهاتف' : 'Telephone'}</span>
            ${phoneValue}
            <p class="contact-note">${ar
              ? 'يمكن الاتصال بالأرقام المصرية عبر رمز الدولة ‎+20.'
              : 'Egyptian numbers are reached on the +20 country code.'}</p>
          </div>
          <div class="card contact-card">
            <span class="contact-icon">${mailIcon}</span>
            <span class="contact-label">${ar ? 'البريد الإلكتروني' : 'Email'}</span>
            ${emailValue}
            <p class="contact-note">${ar
              ? 'يُستخدم للدعم والاستفسارات التجارية وطلبات الخصوصية والاسترداد.'
              : 'Used for support, business enquiries, privacy requests and refund requests.'}</p>
          </div>
        </div>
${pendingNotice}
        <div class="cta">
          ${email ? button(`mailto:${email}`, ar ? 'أرسل بريدًا إلكترونيًا' : 'Send us an email') : ''}
          ${button(ar ? '/contact' : '/contact/ar', ar ? 'English' : 'العربية')}
        </div>
      </section>

      <section>
        <h2>${ar ? 'الوثائق القانونية' : 'Legal documents'}</h2>
        <p>${ar
          ? 'الشروط والأحكام وسياسة الاسترداد وسياسة الخصوصية منشورة بالكامل، ولكل منها عنوانها الخاص، وتذكر نفس النشاط التجاري وقنوات الاتصال الواردة في هذه الصفحة.'
          : 'The Terms & Conditions, the Refund Policy and the Privacy Policy are published in full at their own addresses. They name the same business and the same contact channels as this page.'}</p>
        <div class="cta">
          ${button('/terms', ar ? 'الشروط والأحكام' : 'Terms & Conditions')}
          ${button(refundPath(language), ar ? 'سياسة الاسترداد' : 'Refund Policy')}
          ${button('/privacy', ar ? 'سياسة الخصوصية' : 'Privacy Policy')}
        </div>
      </section>

      <section>
        <h2>${ar ? 'من تقوم بالتواصل معه' : 'Who you are contacting'}</h2>
        <p>${ar
          ? `${escapeHtml(details.businessName)} منصة يبنيها وينشرها ${escapeHtml(OPERATOR_NAME)}، وهو أيضًا جهة الاتصال الخاصة بالوثائق القانونية المنشورة.`
          : `${escapeHtml(details.businessName)} is built and published by ${escapeHtml(OPERATOR_NAME)}, who is also the contact for the published legal documents.`}</p>
        <div class="cta">
          <a class="button secondary" href="${escapeHtml(
            OPERATOR_LINKEDIN_URL
          )}" target="_blank" rel="noopener noreferrer">${ar ? 'الملف المهني على LinkedIn' : 'LinkedIn profile'}</a>
        </div>
      </section>`;

  return {
    path,
    language,
    title: ar
      ? `المعلومات التجارية واتصل بنا | ${SITE_NAME}`
      : `Business Information & Contact Us | ${SITE_NAME}`,
    description,
    body,
    headerLinks: ar
      ? [
          { href: '/about', label: 'عن المنصة' },
          { href: '/careers', label: 'المسارات المهنية' },
          { href: '/learning', label: 'التعلّم' },
          { href: '/opportunities', label: 'الفرص' },
        ]
      : undefined,
    footerLinks: ar
      ? [
          { href: '/about', label: 'عن المنصة' },
          { href: '/careers', label: 'المسارات المهنية' },
          { href: '/learning', label: 'التعلّم' },
          { href: '/opportunities', label: 'الفرص' },
          { href: '/contact', label: 'المعلومات التجارية' },
          { href: '/contact/ar', label: 'هذه الصفحة بالعربية' },
        ]
      : undefined,
    jsonLd: [
      contactPageSchema({
        name: ar ? `معلومات ${details.businessName}` : `Contact ${details.businessName}`,
        description,
        path,
        language,
        business: {
          name: details.businessName,
          url: absoluteUrl('/'),
          email,
          telephone: details.phone?.trim() || null,
          address: {
            streetAddress: details.address.street,
            addressLocality: details.address.city,
            addressRegion: details.address.governorate,
            postalCode: details.address.postalCode,
            addressCountry: details.address.country,
          },
        },
      }),
      webPageSchema({
        name: ar ? 'المعلومات التجارية واتصل بنا' : 'Business Information & Contact Us',
        description,
        path,
        hasBreadcrumb: true,
        language,
      }),
      breadcrumbSchema(
        [
          { name: ar ? 'الرئيسية' : 'Home', path: '/' },
          { name: ar ? 'المعلومات التجارية' : 'Business Information', path },
        ],
        path
      ),
    ],
    breadcrumb: [
      { name: ar ? 'الرئيسية' : 'Home', path: '/' },
      { name: ar ? 'المعلومات التجارية' : 'Business Information', path },
    ],
  };
}

/**
 * The Refund Policy page.
 *
 * The policy text is owner-controlled in `shared/legal.ts`; this function only
 * renders it. It is public, server-rendered, and never gated by a session.
 */
export function buildRefundPolicyPage(language: Language = 'en'): PublicPage {
  const path = refundPath(language);
  const ar = language === 'ar';
  const sections = ar ? REFUND_POLICY.sectionsAr : REFUND_POLICY.sections;
  const available = hasApprovedRefundPolicy() && sections.length > 0;

  const description = ar
    ? 'سياسة استرداد Aionvia: متى يمكن طلب استرداد المبلغ، وكيفية تقديم الطلب، وكيفية صرف الاسترداد المعتمد، وحقوقك القانونية.'
    : 'The Aionvia Refund Policy: when a refund can be requested, how to submit a request, how an approved refund is paid, and the statutory rights that are unaffected.';

  const content = available
    ? sections
        .map(
          (section) =>
            `<section><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.body).replace(
              /\r?\n/g,
              '<br>'
            )}</p></section>`
        )
        .join('\n')
    : `<section class="hero"><h1>${ar ? 'سياسة الاسترداد' : 'Refund Policy'}</h1><p class="lede">${ar
        ? 'سياسة الاسترداد غير منشورة بعد.'
        : 'The Refund Policy has not been published yet.'}</p></section>`;

  return {
    path,
    language,
    title: ar ? `سياسة الاسترداد | ${SITE_NAME}` : `Refund Policy | ${SITE_NAME}`,
    description,
    body: available
      ? `<section class="hero">
        <h1>${ar ? 'سياسة الاسترداد' : 'Refund Policy'}</h1>
        <p class="lede">${escapeHtml(description)}</p>
        <p class="meta">${ar ? 'آخر تحديث' : 'Last updated'}: ${escapeHtml(
          REFUND_POLICY.updated
        )}</p>
      </section>${content}
      <section>
        <h2>${ar ? 'روابط ذات صلة' : 'Related pages'}</h2>
        <div class="cta">
          ${button(contactPath(language), ar ? 'المعلومات التجارية واتصل بنا' : 'Business Information & Contact Us')}
          ${button('/terms', ar ? 'الشروط والأحكام' : 'Terms & Conditions')}
          ${button(ar ? '/refund-policy' : '/refund-policy/ar', ar ? 'English' : 'العربية')}
        </div>
      </section>`
      : content,
    noindex: !available,
    headerLinks: ar
      ? [
          { href: '/about', label: 'عن المنصة' },
          { href: '/careers', label: 'المسارات المهنية' },
          { href: '/learning', label: 'التعلّم' },
          { href: '/opportunities', label: 'الفرص' },
        ]
      : undefined,
    footerLinks: ar
      ? [
          { href: '/about', label: 'عن المنصة' },
          { href: '/careers', label: 'المسارات المهنية' },
          { href: '/learning', label: 'التعلّم' },
          { href: '/opportunities', label: 'الفرص' },
          { href: '/contact', label: 'المعلومات التجارية' },
          { href: '/contact/ar', label: 'هذه الصفحة بالعربية' },
        ]
      : undefined,
    jsonLd: [
      webPageSchema({
        name: ar ? 'سياسة الاسترداد' : 'Refund Policy',
        description,
        path,
        hasBreadcrumb: true,
        language,
      }),
      breadcrumbSchema(
        [
          { name: ar ? 'الرئيسية' : 'Home', path: '/' },
          { name: ar ? 'سياسة الاسترداد' : 'Refund Policy', path },
        ],
        path
      ),
    ],
    breadcrumb: [
      { name: ar ? 'الرئيسية' : 'Home', path: '/' },
      { name: ar ? 'سياسة الاسترداد' : 'Refund Policy', path },
    ],
  };
}
