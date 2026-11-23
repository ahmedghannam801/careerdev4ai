/**
 * The Aionvia email templates.
 *
 * One reusable layout, rendered for both languages. The layout is a table
 * because that is what mail clients understand, the width is capped at 600px,
 * and every style is inline: Gmail, Outlook and the Apple clients strip a
 * <style> block, so a responsive stylesheet is an enhancement rather than the
 * thing that makes the message readable.
 *
 * Nothing here sends anything. A template turns a payload into a subject, an
 * HTML body and a plain-text body; the queue decides whether the message may
 * be sent.
 *
 * The Arabic layout is a real right-to-left layout (`dir="rtl"`), not English
 * text with Arabic words dropped into it. Labels, alignment, the accent bar and
 * the call-to-action all follow the direction.
 */

export type EmailLocale = 'en' | 'ar';

export type EmailTemplateId =
  | 'welcome'
  | 'verify_email'
  | 'password_reset'
  | 'password_changed'
  | 'email_changed'
  | 'security_alert'
  | 'subscription_activated'
  | 'subscription_expired'
  | 'payment_confirmed'
  | 'payment_failed'
  | 'opportunity_alert'
  | 'learning_update'
  | 'volunteering_update'
  | 'project_update'
  | 'assessment_result'
  | 'application_update'
  | 'interview_update'
  | 'roadmap_update'
  | 'digest_daily'
  | 'digest_weekly'
  | 'announcement'
  | 'generic_notification';

export interface EmailPayload {
  [key: string]: unknown;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  preheader: string;
}

export interface RenderEmailInput {
  template: EmailTemplateId | string;
  payload: EmailPayload;
  locale?: EmailLocale;
  /** The page where the account can change what it receives. */
  preferencesUrl: string;
  /** The signed unsubscribe link. Required for marketing categories. */
  unsubscribeUrl?: string;
  /** True for account, security and receipt mail. */
  transactional?: boolean;
}

const BRAND = 'Aionvia';
const ACCENT = '#FF5A36';
const ACCENT_DARK = '#B63C22';
const ACCENT_SOFT = '#FFF0EC';
const TEXT = '#20242B';
const MUTED = '#5B6270';
const BORDER = '#E7E8EB';
const PAGE = '#F5F6F8';
const FONT = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escapes a value for a URL query string without throwing on bad input. */
function safeUrl(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return fallback;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

function asText(value: unknown, max = 2000): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function asList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
  );
}

interface Copy {
  dir: 'ltr' | 'rtl';
  font: string;
  greeting: (name: string) => string;
  button: (label: string) => string;
  manage: string;
  unsubscribe: string;
  transactionalFooter: string;
  marketingFooter: string;
  sentBecause: string;
  needHelp: string;
  noReply: string;
  labels: Record<string, string>;
}

const COPY: Record<EmailLocale, Copy> = {
  en: {
    dir: 'ltr',
    font: FONT,
    greeting: (name) => (name ? `Hello ${name},` : 'Hello,'),
    button: (label) => label,
    manage: 'Manage email preferences',
    unsubscribe: 'Unsubscribe from these emails',
    transactionalFooter:
      'You are receiving this because it is part of your Aionvia account. Account, security and payment emails cannot be turned off.',
    marketingFooter:
      'You are receiving this because you chose to hear about opportunities, learning and updates from Aionvia.',
    sentBecause: 'Sent by Aionvia',
    needHelp: 'Need help? Reply to this email or contact support.',
    noReply: 'This mailbox is not monitored for replies.',
    labels: {
      opportunities: 'Opportunities',
      courses: 'Learning',
      jobs: 'Jobs',
      volunteering: 'Volunteering',
      projects: 'Projects',
      announcements: 'Announcements',
      viewAll: 'Open Aionvia',
      deadline: 'Deadline',
      organization: 'Organisation',
      location: 'Location',
      progress: 'Progress',
      score: 'Score',
      stage: 'Stage',
      role: 'Role',
      company: 'Company',
      nextStep: 'Next step',
      summary: 'Summary',
      week: 'This week',
      daily: 'Today',
      unsubscribeNote:
        'If this was not you, you can ignore this message. No change is made unless you confirm it.',
    },
  },
  ar: {
    dir: 'rtl',
    font: "'Segoe UI', Tahoma, Arial, sans-serif",
    greeting: (name) => (name ? `مرحباً ${name}،` : 'مرحباً،'),
    button: (label) => label,
    manage: 'إدارة تفضيلات البريد',
    unsubscribe: 'إلغاء الاشتراك في هذه الرسائل',
    transactionalFooter:
      'تصلك هذه الرسالة لأنها جزء من حسابك في Aionvia. لا يمكن إيقاف رسائل الحساب والأمان والدفع.',
    marketingFooter:
      'تصلك هذه الرسالة لأنك اخترت معرفة الفرص والتعلم والتحديثات من Aionvia.',
    sentBecause: 'أُرسلت من Aionvia',
    needHelp: 'تحتاج مساعدة؟ رُد على هذه الرسالة أو تواصل مع الدعم.',
    noReply: 'لا تتم متابعة الردود على هذا البريد.',
    labels: {
      opportunities: 'الفرص',
      courses: 'التعلم',
      jobs: 'الوظائف',
      volunteering: 'التطوع',
      projects: 'المشاريع',
      announcements: 'الإعلانات',
      viewAll: 'افتح Aionvia',
      deadline: 'آخر موعد',
      organization: 'الجهة',
      location: 'الموقع',
      progress: 'التقدم',
      score: 'الدرجة',
      stage: 'المرحلة',
      role: 'الدور',
      company: 'الشركة',
      nextStep: 'الخطوة التالية',
      summary: 'الملخص',
      week: 'هذا الأسبوع',
      daily: 'اليوم',
      unsubscribeNote:
        'إذا لم تكن أنت من طلب ذلك، يمكنك تجاهل هذه الرسالة. لن يتغير شيء إلا بعد تأكيدك.',
    },
  },
};

const SUBJECTS: Record<EmailTemplateId, Record<EmailLocale, string>> = {
  welcome: { en: 'Welcome to Aionvia', ar: 'مرحباً بك في Aionvia' },
  verify_email: { en: 'Confirm your Aionvia email', ar: 'أكّد بريدك في Aionvia' },
  password_reset: { en: 'Reset your Aionvia password', ar: 'إعادة تعيين كلمة المرور' },
  password_changed: { en: 'Your Aionvia password was changed', ar: 'تم تغيير كلمة مرور Aionvia' },
  email_changed: { en: 'Your Aionvia sign-in email was changed', ar: 'تم تغيير بريد الدخول إلى Aionvia' },
  security_alert: { en: 'Security alert for your Aionvia account', ar: 'تنبيه أمني لحسابك في Aionvia' },
  subscription_activated: { en: 'Your Aionvia plan is active', ar: 'تم تفعيل خطتك في Aionvia' },
  subscription_expired: { en: 'Your Aionvia plan has ended', ar: 'انتهت خطتك في Aionvia' },
  payment_confirmed: { en: 'Payment received — thank you', ar: 'تم استلام الدفع — شكراً لك' },
  payment_failed: { en: 'A payment could not be completed', ar: 'تعذر إتمام عملية دفع' },
  opportunity_alert: { en: 'A new opportunity for you', ar: 'فرصة جديدة تناسبك' },
  learning_update: { en: 'A learning update for you', ar: 'تحديث تعليمي لك' },
  volunteering_update: { en: 'A volunteering opportunity for you', ar: 'فرصة تطوع جديدة لك' },
  project_update: { en: 'A project update for you', ar: 'تحديث مشروع لك' },
  assessment_result: { en: 'Your assessment result', ar: 'نتيجة التقييم الخاصة بك' },
  application_update: { en: 'Your application moved forward', ar: 'تحديث على طلب التقديم' },
  interview_update: { en: 'Your interview feedback is ready', ar: 'ملاحظات المقابلة جاهزة' },
  roadmap_update: { en: 'Your career roadmap moved forward', ar: 'تقدم في خارطة طريقك المهنية' },
  digest_daily: { en: 'Your Aionvia daily digest', ar: 'ملخص Aionvia اليومي' },
  digest_weekly: { en: 'Your Aionvia weekly career summary', ar: 'ملخصك المهني الأسبوعي من Aionvia' },
  announcement: { en: 'News from Aionvia', ar: 'خبر من Aionvia' },
  generic_notification: { en: 'Aionvia update', ar: 'تحديث من Aionvia' },
};

function brandHeader(copy: Copy): string {
  return `
    <tr>
      <td style="padding:26px 30px 6px 30px;background:#ffffff;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td align="${copy.dir === 'rtl' ? 'right' : 'left'}" style="font-family:${copy.font};font-size:20px;font-weight:800;letter-spacing:-.4px;color:${TEXT};">
              Aion<span style="color:${ACCENT};">via</span>
            </td>
            <td align="${copy.dir === 'rtl' ? 'left' : 'right'}" style="font-family:${copy.font};font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#9AA0AA;">
              Career operating system
            </td>
          </tr>
        </table>
        <div style="height:3px;width:44px;background:${ACCENT};border-radius:2px;margin-top:16px;"></div>
      </td>
    </tr>`;
}

function button(href: string, label: string, copy: Copy): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 6px 0;">
      <tr>
        <td align="center" bgcolor="${ACCENT}" style="border-radius:10px;">
          <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:13px 22px;font-family:${copy.font};font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

function paragraph(text: string, copy: Copy, muted = false): string {
  return `<p style="margin:0 0 14px 0;font-family:${copy.font};font-size:15px;line-height:1.7;color:${muted ? MUTED : TEXT};">${text}</p>`;
}

function detailRow(label: string, value: string, copy: Copy): string {
  if (!value) return '';
  return `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid ${BORDER};font-family:${copy.font};font-size:12px;font-weight:700;color:${MUTED};width:38%;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:9px 0;border-bottom:1px solid ${BORDER};font-family:${copy.font};font-size:14px;color:${TEXT};vertical-align:top;">${escapeHtml(value)}</td>
    </tr>`;
}

function detailTable(rows: string[]): string {
  const body = rows.filter(Boolean).join('');
  if (!body) return '';
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 18px 0;">${body}</table>`;
}

function itemList(
  items: Array<Record<string, unknown>>,
  copy: Copy,
  heading: string,
  hrefKey = 'url',
): string {
  if (items.length === 0) return '';
  const rows = items
    .slice(0, 8)
    .map((item) => {
      const title = escapeHtml(asText(item.title ?? item.name, 180));
      const meta = escapeHtml(asText(item.meta ?? item.organization ?? item.provider ?? item.company, 160));
      const href = safeUrl(item[hrefKey] ?? item.url, '');
      const link = href
        ? `<a href="${escapeHtml(href)}" target="_blank" style="font-family:${copy.font};font-size:14px;font-weight:700;color:${ACCENT_DARK};text-decoration:none;">${title}</a>`
        : `<span style="font-family:${copy.font};font-size:14px;font-weight:700;color:${TEXT};">${title}</span>`;
      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid ${BORDER};">
            ${link}
            ${meta ? `<div style="margin-top:3px;font-family:${copy.font};font-size:12px;line-height:1.5;color:${MUTED};">${meta}</div>` : ''}
          </td>
        </tr>`;
    })
    .join('');
  return `
    <h3 style="margin:22px 0 4px 0;font-family:${copy.font};font-size:13px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:${MUTED};">${escapeHtml(heading)}</h3>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${rows}</table>`;
}

function badge(label: string, copy: Copy, tone: 'accent' | 'success' | 'warning' = 'accent'): string {
  const palette =
    tone === 'success'
      ? 'background:#E9F7EF;color:#1D7A45;'
      : tone === 'warning'
        ? 'background:#FFF7E6;color:#9A5B00;'
        : `background:${ACCENT_SOFT};color:${ACCENT_DARK};`;
  return `<div style="display:inline-block;${palette}padding:6px 11px;border-radius:999px;font-family:${copy.font};font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;">${escapeHtml(label)}</div>`;
}

function layout(input: {
  copy: Copy;
  preheader: string;
  content: string;
  transactional: boolean;
  preferencesUrl: string;
  unsubscribeUrl?: string;
}): string {
  const { copy, preheader, content, transactional, preferencesUrl, unsubscribeUrl } = input;
  const footerLink = transactional
    ? `<a href="${escapeHtml(preferencesUrl)}" target="_blank" style="color:${MUTED};text-decoration:underline;">${escapeHtml(copy.manage)}</a>`
    : unsubscribeUrl
      ? `<a href="${escapeHtml(unsubscribeUrl)}" target="_blank" style="color:${MUTED};text-decoration:underline;">${escapeHtml(copy.unsubscribe)}</a>
         <span style="color:#B7BBC3;"> · </span>
         <a href="${escapeHtml(preferencesUrl)}" target="_blank" style="color:${MUTED};text-decoration:underline;">${escapeHtml(copy.manage)}</a>`
      : `<a href="${escapeHtml(preferencesUrl)}" target="_blank" style="color:${MUTED};text-decoration:underline;">${escapeHtml(copy.manage)}</a>`;

  return `<!doctype html>
<html lang="${copy.dir === 'rtl' ? 'ar' : 'en'}" dir="${copy.dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${escapeHtml(BRAND)}</title>
  <!--[if mso]>
  <style>table,td{font-family:Arial,Helvetica,sans-serif !important;}</style>
  <![endif]-->
  <style>
    @media only screen and (max-width:620px){
      .email-shell{width:100% !important;}
      .email-pad{padding-left:20px !important;padding-right:20px !important;}
      .email-title{font-size:24px !important;line-height:1.28 !important;}
      .email-button a{display:block !important;padding:14px 16px !important;}
    }
    a{word-break:break-word;}
  </style>
</head>
<body style="margin:0;padding:0;background:${PAGE};">
  <div style="display:none;font-size:1px;color:${PAGE};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${PAGE};padding:26px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" class="email-shell" style="width:600px;max-width:100%;background:#ffffff;border:1px solid ${BORDER};border-radius:16px;overflow:hidden;">
          ${brandHeader(copy)}
          <tr>
            <td class="email-pad" style="padding:8px 30px 8px 30px;background:#ffffff;">
              ${content}
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:22px 30px 26px 30px;background:#FAFBFC;border-top:1px solid ${BORDER};">
              <p style="margin:0 0 8px 0;font-family:${copy.font};font-size:11px;line-height:1.65;color:${MUTED};">
                ${escapeHtml(transactional ? copy.transactionalFooter : copy.marketingFooter)}
              </p>
              <p style="margin:0 0 8px 0;font-family:${copy.font};font-size:11px;line-height:1.65;color:${MUTED};">
                ${footerLink}
              </p>
              <p style="margin:0;font-family:${copy.font};font-size:11px;line-height:1.65;color:#9AA0AA;">
                ${escapeHtml(copy.sentBecause)} · <a href="https://aionvia.pages.dev" target="_blank" style="color:#9AA0AA;text-decoration:underline;">aionvia.pages.dev</a>
              </p>
            </td>
          </tr>
        </table>
        <div style="max-width:600px;margin:14px auto 0 auto;font-family:${copy.font};font-size:10px;line-height:1.6;color:#9AA0AA;text-align:center;">
          ${escapeHtml(copy.noReply)}
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<div style="display:none[\s\S]*?<\/div>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|tr|h1|h2|h3|table|div)>/gi, '\n')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line, index, lines) => line.length > 0 || lines[index - 1]?.length > 0)
    .join('\n')
    .trim();
}

function isTemplateId(value: string): value is EmailTemplateId {
  return value in SUBJECTS;
}

/**
 * Renders one email.
 *
 * An unknown template is not an error the sender can act on at send time: the
 * queue would retry it for ever. It falls back to the generic notification
 * template, which still carries the payload's title and message.
 */
export function renderEmail(input: RenderEmailInput): RenderedEmail {
  const locale: EmailLocale = input.locale === 'ar' ? 'ar' : 'en';
  const copy = COPY[locale];
  const template: EmailTemplateId = isTemplateId(String(input.template))
    ? (input.template as EmailTemplateId)
    : 'generic_notification';
  const payload = input.payload ?? {};
  const transactions = new Set<string>([
    'welcome',
    'verify_email',
    'password_reset',
    'password_changed',
    'email_changed',
    'security_alert',
    'subscription_activated',
    'subscription_expired',
    'payment_confirmed',
    'payment_failed',
  ]);
  const transactional = input.transactional ?? transactions.has(template);

  const name = asText(payload.name ?? payload.fullName, 120);
  const title = asText(payload.title, 200);
  const message = asText(payload.message, 4000);
  const actionUrl = safeUrl(
    payload.actionUrl ?? payload.url ?? payload.ctaUrl,
    input.preferencesUrl,
  );
  const actionLabel = asText(payload.actionLabel ?? payload.ctaText, 80);
  const greeting = paragraph(escapeHtml(copy.greeting(name)), copy);

  let content = '';
  let preheader = title || SUBJECTS[template][locale];

  switch (template) {
    case 'welcome': {
      content =
        greeting +
        `<h1 class="email-title" style="margin:0 0 12px 0;font-family:${copy.font};font-size:30px;line-height:1.22;letter-spacing:-.6px;color:${TEXT};">${escapeHtml(
          locale === 'ar' ? 'حسابك جاهز للانطلاق' : 'Your career workspace is ready',
        )}</h1>` +
        paragraph(
          escapeHtml(
            locale === 'ar'
              ? 'أصبح لديك مكان واحد لأهدافك ومهاراتك وخارطة طريقك وسيرك الذاتي وفرصك. ابدأ بتحديد هدفك المهني، وسنبني لك الخطوات التالية.'
              : 'You now have one place for your goals, skills, roadmap, CV and opportunities. Start by setting your career goal and we will build the next steps around it.',
          ),
          copy,
        ) +
        `<div style="background:${ACCENT_SOFT};border:1px solid #FFD9CF;border-radius:12px;padding:14px 16px;margin:18px 0;">${paragraph(
          escapeHtml(
            locale === 'ar'
              ? 'نصيحة البداية: أكمل ملفك الشخصي بنسبة 60% على الأقل لتصبح التوصيات أدق.'
              : 'A good first step: complete at least 60% of your profile so recommendations are actually about you.',
          ),
          copy,
        )}</div>` +
        button(actionUrl, actionLabel || copy.labels.viewAll, copy);
      break;
    }
    case 'verify_email':
    case 'password_reset': {
      const isVerify = template === 'verify_email';
      content =
        greeting +
        `<h1 class="email-title" style="margin:0 0 12px 0;font-family:${copy.font};font-size:28px;line-height:1.25;letter-spacing:-.5px;color:${TEXT};">${escapeHtml(
          isVerify
            ? locale === 'ar'
              ? 'أكّد بريدك الإلكتروني'
              : 'Confirm your email address'
            : locale === 'ar'
              ? 'أعد تعيين كلمة المرور'
              : 'Reset your password',
        )}</h1>` +
        paragraph(
          escapeHtml(
            isVerify
              ? locale === 'ar'
                ? 'اضغط على الزر أدناه لتأكيد بريدك. الرابط صالح لمدة محدودة.'
                : 'Press the button below to confirm your address. The link is valid for a limited time.'
              : locale === 'ar'
                ? 'اضغط على الزر أدناه لاختيار كلمة مرور جديدة. إذا لم تطلب ذلك، تجاهل الرسالة.'
                : 'Press the button below to choose a new password. If you did not ask for this, ignore this message.',
          ),
          copy,
        ) +
        button(
          actionUrl,
          actionLabel ||
            (isVerify
              ? locale === 'ar'
                ? 'تأكيد البريد'
                : 'Confirm email'
              : locale === 'ar'
                ? 'اختيار كلمة مرور جديدة'
                : 'Choose a new password'),
          copy,
        ) +
        paragraph(escapeHtml(copy.labels.unsubscribeNote), copy, true);
      break;
    }
    case 'password_changed':
    case 'email_changed':
    case 'security_alert': {
      const heading =
        template === 'password_changed'
          ? locale === 'ar'
            ? 'تم تغيير كلمة المرور'
            : 'Your password was changed'
          : template === 'email_changed'
            ? locale === 'ar'
              ? 'تم تغيير بريد الدخول'
              : 'Your sign-in email was changed'
            : locale === 'ar'
              ? 'نشاط مهم على حسابك'
              : 'Important account activity';
      content =
        greeting +
        badge(locale === 'ar' ? 'أمان الحساب' : 'Account security', copy, 'warning') +
        `<h1 class="email-title" style="margin:14px 0 12px 0;font-family:${copy.font};font-size:27px;line-height:1.28;letter-spacing:-.4px;color:${TEXT};">${escapeHtml(heading)}</h1>` +
        paragraph(escapeHtml(message || (locale === 'ar' ? 'تم تنفيذ التغيير على حسابك.' : 'A change was made to your account.')), copy) +
        detailTable([
          detailRow(copy.labels.summary, asText(payload.detail, 400), copy),
          detailRow(
            locale === 'ar' ? 'الوقت' : 'Time',
            asText(payload.occurredAt, 80) || new Date().toISOString().slice(0, 16).replace('T', ' '),
            copy,
          ),
        ]) +
        paragraph(escapeHtml(copy.labels.unsubscribeNote), copy, true) +
        button(actionUrl, actionLabel || copy.labels.viewAll, copy);
      break;
    }
    case 'subscription_activated': {
      content =
        greeting +
        badge(locale === 'ar' ? 'تم التفعيل' : 'Active', copy, 'success') +
        `<h1 class="email-title" style="margin:14px 0 12px 0;font-family:${copy.font};font-size:28px;line-height:1.25;color:${TEXT};">${escapeHtml(
          locale === 'ar' ? 'خطتك جاهزة' : 'Your plan is active',
        )}</h1>` +
        paragraph(escapeHtml(message || (locale === 'ar' ? 'تم تفعيل اشتراكك وكل ما يشمله.' : 'Your subscription is active and everything it includes is available.')), copy) +
        detailTable([
          detailRow(locale === 'ar' ? 'الخطة' : 'Plan', asText(payload.planName, 80), copy),
          detailRow(locale === 'ar' ? 'الدورة' : 'Billing cycle', asText(payload.billingCycle, 40), copy),
          detailRow(locale === 'ar' ? 'ينتهي في' : 'Renews / ends', asText(payload.periodEnd, 80), copy),
        ]) +
        button(actionUrl, actionLabel || copy.labels.viewAll, copy);
      break;
    }
    case 'subscription_expired': {
      content =
        greeting +
        badge(locale === 'ar' ? 'انتهت' : 'Ended', copy, 'warning') +
        `<h1 class="email-title" style="margin:14px 0 12px 0;font-family:${copy.font};font-size:27px;line-height:1.28;color:${TEXT};">${escapeHtml(
          locale === 'ar' ? 'انتهت خطتك' : 'Your plan has ended',
        )}</h1>` +
        paragraph(escapeHtml(message || (locale === 'ar' ? 'انتهت مدة اشتراكك. حسابك وبياناتك ما زالا محفوظين.' : 'Your subscription period has ended. Your account and data are still here.')), copy) +
        button(actionUrl, actionLabel || (locale === 'ar' ? 'استعراض الخطط' : 'View plans'), copy);
      break;
    }
    case 'payment_confirmed': {
      content =
        greeting +
        badge(locale === 'ar' ? 'تم الدفع' : 'Payment received', copy, 'success') +
        `<h1 class="email-title" style="margin:14px 0 12px 0;font-family:${copy.font};font-size:28px;line-height:1.25;color:${TEXT};">${escapeHtml(
          locale === 'ar' ? 'شكراً لك' : 'Thank you',
        )}</h1>` +
        paragraph(escapeHtml(message || (locale === 'ar' ? 'تم استلام دفعتك بنجاح.' : 'Your payment was received successfully.')), copy) +
        detailTable([
          detailRow(locale === 'ar' ? 'المبلغ' : 'Amount', asText(payload.amount, 60), copy),
          detailRow(locale === 'ar' ? 'المرجع' : 'Reference', asText(payload.reference, 120), copy),
          detailRow(locale === 'ar' ? 'التاريخ' : 'Date', asText(payload.date, 80), copy),
        ]) +
        button(actionUrl, actionLabel || copy.labels.viewAll, copy);
      break;
    }
    case 'payment_failed': {
      content =
        greeting +
        badge(locale === 'ar' ? 'لم يكتمل' : 'Not completed', copy, 'warning') +
        `<h1 class="email-title" style="margin:14px 0 12px 0;font-family:${copy.font};font-size:27px;line-height:1.28;color:${TEXT};">${escapeHtml(
          locale === 'ar' ? 'تعذر إتمام الدفع' : 'The payment did not complete',
        )}</h1>` +
        paragraph(escapeHtml(message || (locale === 'ar' ? 'لم يتم خصم المبلغ. يمكنك المحاولة مرة أخرى.' : 'Nothing was charged. You can try again whenever you are ready.')), copy) +
        detailTable([
          detailRow(locale === 'ar' ? 'المبلغ' : 'Amount', asText(payload.amount, 60), copy),
          detailRow(locale === 'ar' ? 'السبب' : 'Reason', asText(payload.reason, 240), copy),
        ]) +
        button(actionUrl, actionLabel || (locale === 'ar' ? 'إعادة المحاولة' : 'Try again'), copy);
      break;
    }
    case 'opportunity_alert':
    case 'volunteering_update': {
      const org = asText(payload.organization, 160);
      content =
        greeting +
        badge(template === 'volunteering_update' ? copy.labels.volunteering : copy.labels.opportunities, copy) +
        `<h1 class="email-title" style="margin:14px 0 12px 0;font-family:${copy.font};font-size:27px;line-height:1.28;letter-spacing:-.4px;color:${TEXT};">${escapeHtml(title || SUBJECTS[template][locale])}</h1>` +
        paragraph(escapeHtml(message || org), copy) +
        detailTable([
          detailRow(copy.labels.organization, org, copy),
          detailRow(copy.labels.location, asText(payload.location, 120), copy),
          detailRow(copy.labels.deadline, asText(payload.deadline, 80), copy),
        ]) +
        button(actionUrl, actionLabel || (locale === 'ar' ? 'عرض الفرصة' : 'View opportunity'), copy);
      break;
    }
    case 'learning_update': {
      content =
        greeting +
        badge(copy.labels.courses, copy) +
        `<h1 class="email-title" style="margin:14px 0 12px 0;font-family:${copy.font};font-size:27px;line-height:1.28;color:${TEXT};">${escapeHtml(title || SUBJECTS.learning_update[locale])}</h1>` +
        paragraph(escapeHtml(message), copy) +
        detailTable([detailRow(locale === 'ar' ? 'المزود' : 'Provider', asText(payload.provider, 120), copy)]) +
        button(actionUrl, actionLabel || (locale === 'ar' ? 'ابدأ التعلم' : 'Start learning'), copy);
      break;
    }
    case 'project_update': {
      content =
        greeting +
        badge(copy.labels.projects, copy) +
        `<h1 class="email-title" style="margin:14px 0 12px 0;font-family:${copy.font};font-size:27px;line-height:1.28;color:${TEXT};">${escapeHtml(title || SUBJECTS.project_update[locale])}</h1>` +
        paragraph(escapeHtml(message), copy) +
        button(actionUrl, actionLabel || copy.labels.viewAll, copy);
      break;
    }
    case 'assessment_result': {
      content =
        greeting +
        badge(copy.labels.score, copy) +
        `<h1 class="email-title" style="margin:14px 0 12px 0;font-family:${copy.font};font-size:27px;line-height:1.28;color:${TEXT};">${escapeHtml(title || SUBJECTS.assessment_result[locale])}</h1>` +
        paragraph(escapeHtml(message), copy) +
        detailTable([
          detailRow(copy.labels.score, asText(payload.score, 40), copy),
          detailRow(copy.labels.nextStep, asText(payload.nextStep, 240), copy),
        ]) +
        button(actionUrl, actionLabel || copy.labels.viewAll, copy);
      break;
    }
    case 'application_update': {
      content =
        greeting +
        badge(copy.labels.stage, copy) +
        `<h1 class="email-title" style="margin:14px 0 12px 0;font-family:${copy.font};font-size:27px;line-height:1.28;color:${TEXT};">${escapeHtml(title || SUBJECTS.application_update[locale])}</h1>` +
        paragraph(escapeHtml(message), copy) +
        detailTable([
          detailRow(copy.labels.company, asText(payload.company, 120), copy),
          detailRow(copy.labels.role, asText(payload.role, 140), copy),
          detailRow(copy.labels.stage, asText(payload.stage, 80), copy),
          detailRow(copy.labels.nextStep, asText(payload.nextStep, 240), copy),
        ]) +
        button(actionUrl, actionLabel || copy.labels.viewAll, copy);
      break;
    }
    case 'interview_update': {
      content =
        greeting +
        badge(locale === 'ar' ? 'المقابلة' : 'Interview', copy) +
        `<h1 class="email-title" style="margin:14px 0 12px 0;font-family:${copy.font};font-size:27px;line-height:1.28;color:${TEXT};">${escapeHtml(title || SUBJECTS.interview_update[locale])}</h1>` +
        paragraph(escapeHtml(message), copy) +
        detailTable([
          detailRow(copy.labels.role, asText(payload.role, 140), copy),
          detailRow(copy.labels.score, asText(payload.score, 40), copy),
        ]) +
        button(actionUrl, actionLabel || (locale === 'ar' ? 'عرض الملاحظات' : 'View feedback'), copy);
      break;
    }
    case 'roadmap_update': {
      content =
        greeting +
        badge(copy.labels.progress, copy) +
        `<h1 class="email-title" style="margin:14px 0 12px 0;font-family:${copy.font};font-size:27px;line-height:1.28;color:${TEXT};">${escapeHtml(title || SUBJECTS.roadmap_update[locale])}</h1>` +
        paragraph(escapeHtml(message), copy) +
        detailTable([detailRow(copy.labels.progress, asText(payload.progress, 40), copy)]) +
        button(actionUrl, actionLabel || (locale === 'ar' ? 'متابعة الخارطة' : 'Open roadmap'), copy);
      break;
    }
    case 'digest_daily':
    case 'digest_weekly': {
      const sections = asList(payload.sections);
      const sectionHtml = sections
        .map((section) =>
          itemList(
            asList(section.items),
            copy,
            asText(section.title, 80) || copy.labels.opportunities,
            'url',
          ),
        )
        .join('');
      content =
        greeting +
        `<h1 class="email-title" style="margin:0 0 8px 0;font-family:${copy.font};font-size:28px;line-height:1.25;letter-spacing:-.5px;color:${TEXT};">${escapeHtml(
          asText(payload.title, 160) ||
            (template === 'digest_daily'
              ? locale === 'ar'
                ? 'ملخصك اليومي'
                : 'Your daily digest'
              : locale === 'ar'
                ? 'ملخصك الأسبوعي'
                : 'Your weekly summary'),
        )}</h1>` +
        paragraph(escapeHtml(message || (locale === 'ar' ? 'أهم ما يستحق انتباهك الآن.' : 'The few things worth your attention right now.')), copy, true) +
        sectionHtml +
        button(actionUrl, actionLabel || copy.labels.viewAll, copy);
      preheader = asText(payload.preheader, 180) || preheader;
      break;
    }
    case 'announcement': {
      content =
        badge(copy.labels.announcements, copy) +
        `<h1 class="email-title" style="margin:14px 0 12px 0;font-family:${copy.font};font-size:28px;line-height:1.25;letter-spacing:-.4px;color:${TEXT};">${escapeHtml(title || SUBJECTS.announcement[locale])}</h1>` +
        paragraph(escapeHtml(message).replace(/\n/g, '<br>'), copy) +
        button(actionUrl, actionLabel || copy.labels.viewAll, copy);
      break;
    }
    default: {
      content =
        greeting +
        `<h1 class="email-title" style="margin:0 0 12px 0;font-family:${copy.font};font-size:27px;line-height:1.28;color:${TEXT};">${escapeHtml(title || SUBJECTS.generic_notification[locale])}</h1>` +
        paragraph(escapeHtml(message || (locale === 'ar' ? 'هناك تحديث جديد في حسابك.' : 'There is an update in your account.')), copy) +
        button(actionUrl, actionLabel || copy.labels.viewAll, copy);
    }
  }

  const html = layout({
    copy,
    preheader,
    content,
    transactional,
    preferencesUrl: input.preferencesUrl,
    unsubscribeUrl: input.unsubscribeUrl,
  });

  return {
    subject: asText(payload.subject, 160) || SUBJECTS[template][locale],
    html,
    text: `${htmlToText(html)}`,
    preheader,
  };
}

/** The categories whose mail must never be suppressed by a marketing toggle. */
export const TRANSACTIONAL_CATEGORIES = new Set([
  'transactional',
  'security',
  'billing_receipt',
  'digest_system',
]);

export function isTransactionalCategory(category: string): boolean {
  return TRANSACTIONAL_CATEGORIES.has(category);
}
