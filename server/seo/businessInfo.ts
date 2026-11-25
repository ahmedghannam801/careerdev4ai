/**
 * The business-information, contact and refund-policy public pages.
 *
 * All three exist for the same reason: a customer, a payment provider or a
 * compliance reviewer has to be able to check who the business is, where it
 * is, how to reach it and what happens when a payment has to be returned —
 * without creating an account.
 *
 * The pages are server-rendered HTML and are built from shared configuration,
 * not from per-request data. `shared/contact.ts` owns the contact details and
 * `shared/legal.ts` owns the policy text. Nothing here invents a business
 * fact: a detail the owner has not confirmed is left out rather than filled in
 * with a plausible-looking value.
 */

import {
  BUSINESS_CONTACT,
  businessLocation,
  businessPhoneHref,
  OPERATOR_LINKEDIN_URL,
  OPERATOR_NAME,
} from '../../shared/contact.ts';
import { REFUND_POLICY, hasApprovedRefundPolicy } from '../../shared/legal.ts';
import { SITE_NAME, absoluteUrl, siteOrigin } from './config.ts';
import { escapeHtml, type PublicPage } from './html.ts';
import { breadcrumbSchema, contactPageSchema, webPageSchema } from './jsonld.ts';

type Language = 'en' | 'ar';

/* -------------------------------------------------------------------------- */
/* The paths                                                                   */
/* -------------------------------------------------------------------------- */

function businessInformationPath(language: Language): string {
  return language === 'ar' ? '/business-information/ar' : '/business-information';
}

function contactPath(language: Language): string {
  return language === 'ar' ? '/contact/ar' : '/contact';
}

function refundPath(language: Language): string {
  return language === 'ar' ? '/refund-policy/ar' : '/refund-policy';
}

/* -------------------------------------------------------------------------- */
/* The shared pieces                                                           */
/* -------------------------------------------------------------------------- */

function button(href: string, label: string, secondary = true): string {
  return `<a class="button${secondary ? ' secondary' : ''}" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

/**
 * The inline icons.
 *
 * The page runs no JavaScript, so an icon has to be inline markup rather than
 * an image request. They are decorative and are hidden from a screen reader.
 */
const ICONS = {
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  phone:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>',
  building:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 9h2a2 2 0 0 1 2 2v10M9 7h2M9 11h2M9 15h2"/></svg>',
  globe:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z"/></svg>',
} as const;

/**
 * The contact-detail cards.
 *
 * The same cards are shown on the Business Information page and on the Contact
 * Us page, so the two pages cannot disagree about a detail. A detail that is
 * not published is left out entirely rather than shown as an empty field.
 */
function contactCards(language: Language): string {
  const ar = language === 'ar';
  const details = BUSINESS_CONTACT;
  const location = businessLocation(details);
  const phoneHref = businessPhoneHref(details);
  const email = details.email?.trim() || null;

  const locationCard = location
    ? `          <div class="card contact-card">
            <span class="contact-icon">${ICONS.pin}</span>
            <span class="contact-label">${ar ? 'موقع النشاط التجاري' : 'Business location'}</span>
            <p class="contact-value">${escapeHtml(location)}</p>
            <p class="contact-note">${ar
              ? 'المقر المسجل للنشاط التجاري.'
              : 'The registered location of the business.'}</p>
          </div>`
    : '';

  const phoneCard = details.phone?.trim()
    ? `          <div class="card contact-card">
            <span class="contact-icon">${ICONS.phone}</span>
            <span class="contact-label">${ar ? 'الهاتف' : 'Telephone'}</span>
            <p class="contact-value" dir="ltr"><a href="${escapeHtml(phoneHref ?? '')}">${escapeHtml(
              details.phone.trim()
            )}</a></p>
            <p class="contact-note">${ar
              ? 'يمكن الاتصال بالأرقام المصرية عبر رمز الدولة ‎+20.'
              : 'Egyptian numbers are reached on the +20 country code.'}</p>
          </div>`
    : '';

  const emailCard = email
    ? `          <div class="card contact-card">
            <span class="contact-icon">${ICONS.mail}</span>
            <span class="contact-label">${ar ? 'البريد الإلكتروني' : 'Email'}</span>
            <p class="contact-value"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
            <p class="contact-note">${ar
              ? 'يُستخدم للاستفسارات التجارية وطلبات الخصوصية والاسترداد.'
              : 'Used for business enquiries, privacy requests and refund requests.'}</p>
          </div>`
    : '';

  return `        <div class="grid">
${locationCard}
${phoneCard}
${emailCard}
        </div>`;
}

/**
 * The header and footer links of the Arabic pages.
 *
 * The English pages use the shared header and footer; the Arabic ones pass
 * their own, so an Arabic reader is never shown a link labelled in English.
 */
function arabicNavigation(): {
  headerLinks: Array<{ href: string; label: string }>;
  footerLinks: Array<{ href: string; label: string }>;
} {
  return {
    headerLinks: [
      { href: '/about', label: 'عن المنصة' },
      { href: '/careers', label: 'المسارات المهنية' },
      { href: '/learning', label: 'التعلّم' },
      { href: '/opportunities', label: 'الفرص' },
    ],
    footerLinks: [
      { href: '/about', label: 'عن المنصة' },
      { href: '/careers', label: 'المسارات المهنية' },
      { href: '/learning', label: 'التعلّم' },
      { href: '/opportunities', label: 'الفرص' },
      { href: '/business-information/ar', label: 'المعلومات التجارية' },
      { href: '/contact/ar', label: 'اتصل بنا' },
      { href: '/refund-policy/ar', label: 'سياسة الاسترداد' },
      { href: '/terms', label: 'الشروط والأحكام' },
      { href: '/privacy', label: 'سياسة الخصوصية' },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* The Business Information page                                               */
/* -------------------------------------------------------------------------- */

/**
 * The Business Information page.
 *
 * `/business-information` is the English page and `/business-information/ar`
 * is the Arabic, RTL one. Both read the same contact object, so the two
 * versions cannot disagree.
 *
 * This is the page a payment provider reads: it names the business, says what
 * the product is, gives the location, the address the business answers on and
 * the website, and links to the legal documents.
 */
export function buildBusinessInformationPage(language: Language = 'en'): PublicPage {
  const path = businessInformationPath(language);
  const ar = language === 'ar';
  const details = BUSINESS_CONTACT;
  const email = details.email?.trim() || null;
  const website = siteOrigin();

  const description = ar
    ? 'المعلومات التجارية لـ Aionvia: اسم النشاط التجاري، وموقعه في طنطا بمصر، والبريد الإلكتروني الذي ترد عليه الشركة، وعنوان الموقع، وروابط الشروط والأحكام وسياسة الاسترداد.'
    : 'Business information for Aionvia: the trading name, the business location in Tanta, Egypt, the email address the business answers on, the website, and links to the Terms of Service and the Refund Policy.';

  const saasDescription = ar
    ? 'Aionvia منصة برمجية مهنية عبر الإنترنت (SaaS) لتطوير المسار المهني. تقدّم للمشتركين — عبر اشتراك أو رصيد — تحليل السيرة الذاتية، ومطابقة الوظائف، وتوليد سير ذاتية ورسائل تغطية، وخطط طريق للتعلّم، وتقييمًا للمهارات، وتدريبًا على المقابلات، كلها داخل مساحة عمل واحدة. الخدمة رقمية بالكامل وتُشحن عبر الإنترنت.'
    : 'Aionvia is an online career development SaaS platform. It gives subscribers — through a subscription or an AI credit balance — CV analysis, job matching, tailored CV and cover-letter generation, career roadmaps, skills assessment, interview practice and career guidance, all inside one workspace. The service is delivered entirely online and is paid for online.';

  const services = ar
    ? [
        'تحليل السيرة الذاتية وتحسينها لتجاوز أنظمة التتبع (ATS)',
        'تحليل وصف الوظيفة ومطابقة الوظائف مع ملفك',
        'توليد سير ذاتية ورسائل تغطية مخصصة',
        'خطط طريق مهنية وتوصيات تعلّم',
        'تقييم المهارات وتطويرها',
        'تدريب على المقابلات وتقييم الأداء',
      ]
    : [
        'CV analysis and optimisation for applicant tracking systems',
        'Job description analysis and job matching',
        'Tailored CV and cover-letter generation',
        'Career roadmaps and learning recommendations',
        'Skills assessment and development',
        'Interview practice and evaluation',
      ];

  const serviceItems = services
    .map((item) => `<li><strong>${escapeHtml(item)}</strong></li>`)
    .join('\n');

  const body = `      <section class="hero">
        <h1>${ar ? 'المعلومات التجارية' : 'Business Information'}</h1>
        <p class="lede">${escapeHtml(description)}</p>
        <p>${ar
          ? 'هذه الصفحة متاحة للعامة دون تسجيل دخول. تجمع بيانات النشاط التجاري وبيانات الاتصال والوثائق القانونية في مكان واحد.'
          : 'This page is public and needs no account. It brings the business details, the contact channels and the legal documents together in one place.'}</p>
      </section>

      <section>
        <h2>${ar ? 'بيانات النشاط التجاري' : 'Business details'}</h2>
        <p>${ar
          ? 'هذه هي البيانات التي يراجعها العميل أو الشريك أو مراجع الامتثال للتحقق من النشاط التجاري والتواصل معه مباشرة.'
          : 'These are the details a customer, a partner or a compliance reviewer checks when verifying the business and contacting it directly.'}</p>
${contactCards(language)}
        <div class="grid">
          <div class="card contact-card">
            <span class="contact-icon">${ICONS.building}</span>
            <span class="contact-label">${ar ? 'اسم النشاط التجاري' : 'Business name'}</span>
            <p class="contact-value">${escapeHtml(details.businessName)}</p>
            <p class="contact-note">${ar
              ? 'الاسم التجاري الذي تعمل به المنصة.'
              : 'The trading name the platform operates under.'}</p>
          </div>
          <div class="card contact-card">
            <span class="contact-icon">${ICONS.globe}</span>
            <span class="contact-label">${ar ? 'الموقع الإلكتروني' : 'Website'}</span>
            <p class="contact-value" dir="ltr"><a href="${escapeHtml(website)}">${escapeHtml(website)}</a></p>
            <p class="contact-note">${ar
              ? 'العنوان الرسمي للموقع الذي تُشترى منه الخدمة.'
              : 'The official address of the site the service is bought from.'}</p>
          </div>
        </div>
        <div class="cta">
          ${email ? button(`mailto:${email}`, ar ? 'أرسل بريدًا إلكترونيًا' : 'Send us an email') : ''}
          ${button(contactPath(language), ar ? 'صفحة الاتصال' : 'Contact Us page')}
        </div>
      </section>

      <section>
        <h2>${ar ? 'الخدمة التي نقدّمها' : 'The service we provide'}</h2>
        <p>${escapeHtml(saasDescription)}</p>
        <ul class="detail-list">
${serviceItems}
        </ul>
      </section>

      <section>
        <h2>${ar ? 'الوثائق القانونية' : 'Legal documents'}</h2>
        <p>${ar
          ? 'الشروط والأحكام وسياسة الاسترداد وسياسة الخصوصية منشورة بالكامل، ولكل منها عنوانها الخاص، وتذكر نفس النشاط التجاري وموقعه وقنوات الاتصال الواردة في هذه الصفحة.'
          : 'The Terms of Service, the Refund Policy and the Privacy Policy are published in full at their own addresses. They name the same business, the same location and the same contact channels as this page.'}</p>
        <div class="cta">
          ${button('/terms', ar ? 'الشروط والأحكام' : 'Terms of Service')}
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

  const navigation = ar ? arabicNavigation() : null;

  return {
    path,
    language,
    title: ar
      ? `المعلومات التجارية | ${SITE_NAME}`
      : `Business Information — Location, Contact & Legal | ${SITE_NAME}`,
    description,
    body,
    headerLinks: navigation?.headerLinks,
    footerLinks: navigation?.footerLinks,
    jsonLd: [
      contactPageSchema({
        name: ar ? `معلومات ${details.businessName}` : `Business information for ${details.businessName}`,
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
        name: ar ? 'المعلومات التجارية' : 'Business Information',
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

/* -------------------------------------------------------------------------- */
/* The Contact Us page                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The Contact Us page.
 *
 * The stable public address the landing page, the footer and the application
 * already link to. It answers the question "how do I reach this business", so
 * it carries the contact channels and what a reply needs to turn on.
 */
export function buildContactPage(language: Language = 'en'): PublicPage {
  const path = contactPath(language);
  const ar = language === 'ar';
  const details = BUSINESS_CONTACT;
  const email = details.email?.trim() || null;

  const description = ar
    ? 'اتصل بـ Aionvia: البريد الإلكتروني الذي ترد عليه الشركة، ورقم الهاتف، وموقع النشاط التجاري في طنطا بمصر. الدعم والاستفسارات التجارية وطلبات الاسترداد.'
    : 'Contact Aionvia: the email address the business answers on, the telephone number, and the business location in Tanta, Egypt. Support, business enquiries and refund requests.';

  const body = `      <section class="hero">
        <h1>${ar ? 'اتصل بنا' : 'Contact Us'}</h1>
        <p class="lede">${escapeHtml(description)}</p>
      </section>

      <section>
        <h2>${ar ? 'بيانات الاتصال' : 'Contact details'}</h2>
        <p>${ar
          ? 'هذه هي بيانات النشاط التجاري خلف هذه المنصة. تُنشر هنا ليتمكن العميل أو الشريك أو مراجع الامتثال من الوصول إلى النشاط التجاري مباشرة، دون حساب ودون نموذج.'
          : 'These are the details for the business behind this platform. They are published here so that a customer, a partner or a compliance reviewer can reach the business directly, without an account and without a form.'}</p>
${contactCards(language)}
        <div class="cta">
          ${email ? button(`mailto:${email}`, ar ? 'أرسل بريدًا إلكترونيًا' : 'Send us an email') : ''}
          ${button(businessInformationPath(language), ar ? 'المعلومات التجارية' : 'Business Information')}
        </div>
      </section>

      <section>
        <h2>${ar ? 'ما الذي يساعد في الرد عليك' : 'What to include in a message'}</h2>
        <p>${ar
          ? 'من الأفضل أن تكون هذه البيانات أمامك قبل الكتابة، لأنها عادة ما تكون أساس الرد:'
          : 'It helps to have these to hand before writing, because they are what a reply usually turns on:'}</p>
        <ul class="detail-list">
          <li><strong>${ar ? 'اسم النشاط التجاري' : 'The name of the business'}</strong> <span>${ar
            ? 'الاسم التجاري كما يظهر في السجل التجاري.'
            : 'the registered or trading name, as it appears on the commercial record.'}</span></li>
          <li><strong>${ar ? 'مرجعك' : 'Your reference'}</strong> <span>${ar
            ? 'رقم التاجر أو الطلب أو الحساب الذي يتعلق به الاستفسار، إن وُجد.'
            : 'the merchant, application or account number the enquiry is about, if you have one.'}</span></li>
          <li><strong>${ar ? 'ما تحتاجه' : 'What you need'}</strong> <span>${ar
            ? 'وصف موجز للطلب، وأي تاريخ يتعلق به.'
            : 'a short description of the request, and any date it relates to.'}</span></li>
          <li><strong>${ar ? 'كيف نرد' : 'How to reply'}</strong> <span>${ar
            ? 'العنوان أو الرقم الذي يجب أن يصل إليه الرد.'
            : 'the address or number the reply should go to.'}</span></li>
        </ul>
      </section>

      <section>
        <h2>${ar ? 'من تراسلهم' : 'Who you are writing to'}</h2>
        <p>${ar
          ? `${escapeHtml(details.businessName)} منصة يبنيها وينشرها ${escapeHtml(OPERATOR_NAME)}، وهو جهة الاتصال الخاصة بالوثائق القانونية المنشورة وكذلك بهذه الصفحة.`
          : `${escapeHtml(details.businessName)} is built and published by ${escapeHtml(OPERATOR_NAME)}, who is the contact for the published legal documents as well as for this page.`}</p>
        <div class="cta">
          <a class="button secondary" href="${escapeHtml(
            OPERATOR_LINKEDIN_URL
          )}" target="_blank" rel="noopener noreferrer">${ar ? 'الملف المهني على LinkedIn' : 'LinkedIn profile'}</a>
        </div>
      </section>

      <section>
        <h2>${ar ? 'الوثائق القانونية' : 'Legal documents'}</h2>
        <p>${ar
          ? 'الشروط والأحكام وسياسة الاسترداد وسياسة الخصوصية منشورة بالكامل، ولكل منها عنوانها الخاص.'
          : 'The Terms of Service, the Refund Policy and the Privacy Policy are published in full, at their own addresses.'}</p>
        <div class="cta">
          ${button('/terms', ar ? 'الشروط والأحكام' : 'Terms of Service')}
          ${button(refundPath(language), ar ? 'سياسة الاسترداد' : 'Refund Policy')}
          ${button('/privacy', ar ? 'سياسة الخصوصية' : 'Privacy Policy')}
        </div>
      </section>`;

  const navigation = ar ? arabicNavigation() : null;

  return {
    path,
    language,
    title: ar
      ? `اتصل بنا | ${SITE_NAME}`
      : `Contact Us — Email, Telephone & Location | ${SITE_NAME}`,
    description,
    body,
    headerLinks: navigation?.headerLinks,
    footerLinks: navigation?.footerLinks,
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
        name: ar ? 'اتصل بنا' : 'Contact Us',
        description,
        path,
        hasBreadcrumb: true,
        language,
      }),
      breadcrumbSchema(
        [
          { name: ar ? 'الرئيسية' : 'Home', path: '/' },
          { name: ar ? 'اتصل بنا' : 'Contact', path },
        ],
        path
      ),
    ],
    breadcrumb: [
      { name: ar ? 'الرئيسية' : 'Home', path: '/' },
      { name: ar ? 'اتصل بنا' : 'Contact', path },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* The Refund Policy page                                                      */
/* -------------------------------------------------------------------------- */

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

  const navigation = ar ? arabicNavigation() : null;

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
          ${button(businessInformationPath(language), ar ? 'المعلومات التجارية' : 'Business Information')}
          ${button(contactPath(language), ar ? 'اتصل بنا' : 'Contact Us')}
          ${button('/terms', ar ? 'الشروط والأحكام' : 'Terms of Service')}
          ${button(ar ? '/refund-policy' : '/refund-policy/ar', ar ? 'English' : 'العربية')}
        </div>
      </section>`
      : content,
    noindex: !available,
    headerLinks: navigation?.headerLinks,
    footerLinks: navigation?.footerLinks,
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
