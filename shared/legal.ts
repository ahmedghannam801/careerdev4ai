/**
 * The legal consent contract.
 *
 * Consent is versioned, not a boolean. A user who accepted an older version of
 * the Terms or the Privacy Policy is asked again when either version changes,
 * and every acceptance is kept as its own record.
 *
 * The versions live here so the browser, the server and the database migration
 * all agree on the values they compare. Changing a version is a deliberate
 * release decision: it invalidates every current acceptance and re-gates the
 * platform until the user accepts the new text.
 */

import { BUSINESS_EMAIL, businessLocation } from './contact.ts';

/**
 * The current consent versions.
 *
 * The Terms & Conditions published at `TERMS_PATH` were supplied and approved
 * by the operator on 2026-11-04, and the version below identifies that
 * document. Changing it is a deliberate release decision: it invalidates every
 * current acceptance and re-gates the platform until the user accepts the new
 * text.
 */
export const TERMS_VERSION = '2026-11-04';

/**
 * The approved Terms & Conditions.
 *
 * This is the operator-supplied document, reproduced as the published
 * structure of sections. `approved` is the operational switch that opens the
 * consent gate and publishes the page; it stays false until the real document
 * is populated, so the platform can never be opened by a placeholder.
 */
export const TERMS_DOCUMENT: {
  approved: boolean;
  sections: ReadonlyArray<{ heading: string; body: string }>;
} = {
  approved: true,
  sections: [
    {
      heading: 'Aionvia — Terms of Service',
      body: `Last Updated: November 4, 2026
Effective Date: November 4, 2026`,
    },
    {
      heading: '1. Acceptance of Terms',
      body: `Welcome to Aionvia.

These Terms of Service govern your access to and use of the Aionvia platform, website, applications, and related services.

By creating an account, accessing the platform, or using its services, you acknowledge that you have read and understood these Terms.

If you do not agree with these Terms, you must discontinue using the platform.`,
    },
    {
      heading: '2. About Aionvia',
      body: `Aionvia is an AI-powered career development platform designed to help users improve their professional profiles, prepare for employment opportunities, and develop career-related skills.

Our services may include:

• AI-powered CV analysis and optimization.
• Job description analysis and job matching.
• Tailored CV generation.
• Cover letter generation and management.
• Career roadmaps and learning recommendations.
• Skills assessment and development recommendations.
• Interview preparation and evaluation.
• Career guidance and professional development tools.

Features may change, improve, or become unavailable as the platform evolves.`,
    },
    {
      heading: '3. Account Registration and Security',
      body: `To access certain features, you may need to create an account.

You agree to:

• Provide accurate and up-to-date registration information.
• Maintain the confidentiality of your login credentials.
• Keep your account information updated.
• Notify us if you suspect unauthorized access to your account.
• Avoid sharing your account with unauthorized individuals.

You are responsible for activities conducted through your account, subject to applicable law.

We reserve the right to restrict or suspend accounts involved in abuse, fraud, security violations, or breaches of these Terms.`,
    },
    {
      heading: '4. Acceptable Use',
      body: `You agree to use Aionvia only for lawful and legitimate purposes.

You must not:

• Use the platform for fraudulent or deceptive activities.
• Upload malicious files, malware, or harmful content.
• Attempt to access other users' accounts or private information.
• Exploit vulnerabilities or interfere with platform security.
• Reverse engineer or attempt to extract protected platform source code, except where applicable law permits.
• Abuse, overload, or disrupt platform infrastructure.
• Use the platform to violate third-party intellectual property rights.
• Misrepresent AI-generated documents or qualifications as verified credentials.

We may investigate violations and take appropriate action.`,
    },
    {
      heading: '5. AI-Generated Content and Limitations',
      body: `Aionvia uses artificial intelligence to generate analyses, recommendations, documents, and other career-related outputs.

You acknowledge that:

• AI-generated results may contain inaccuracies or incomplete information.
• Recommendations are informational and are not guarantees of employment.
• AI-generated CVs and cover letters must be reviewed before submission.
• You are responsible for verifying the accuracy of all submitted information.
• AI-generated career recommendations do not replace professional advice.
• AI systems may occasionally become unavailable or produce unexpected results.

You must not rely on AI-generated content as the sole basis for important employment or professional decisions.`,
    },
    {
      heading: '6. User Content and Uploaded Documents',
      body: `You retain ownership of the documents and information you upload to Aionvia, subject to any third-party rights.

By uploading content, you grant Aionvia the limited permission necessary to:

• Store and process your submitted information.
• Analyze your CV and job descriptions.
• Generate customized career documents.
• Provide the features you request.
• Maintain and secure your account and associated services.

You confirm that you have the necessary rights and permissions to upload the content.

We do not claim ownership of your original CV, personal documents, or independently created content.

You are responsible for maintaining copies of important documents.`,
    },
    {
      heading: '7. Intellectual Property',
      body: `The Aionvia platform, including its branding, logos, design, software, interface, and original platform materials, is protected by applicable intellectual property laws.

You may not copy, reproduce, distribute, or commercially exploit protected platform materials without prior authorization.

Your uploaded documents remain yours, subject to any applicable third-party rights.

Ownership and permitted use of AI-generated outputs are subject to applicable law and any relevant third-party service terms.`,
    },
    {
      heading: '8. Third-Party Services',
      body: `Aionvia may rely on third-party services and providers to operate certain features.

These may include:

• AI model providers.
• Cloud hosting and infrastructure providers.
• Authentication and database services.
• File storage services.
• External learning resources and integrations.

Third-party services may have their own terms and privacy policies.

We are not responsible for independent third-party services beyond our control.`,
    },
    {
      heading: '9. Service Availability',
      body: `We aim to provide reliable and secure access to Aionvia.

However, we do not guarantee uninterrupted or error-free availability.

Services may be temporarily unavailable due to:

• Maintenance and upgrades.
• Infrastructure failures.
• Third-party provider interruptions.
• Security incidents.
• Circumstances beyond our reasonable control.

We may modify, suspend, or discontinue features when necessary.`,
    },
    {
      heading: '10. Privacy and Personal Data',
      body: `Your privacy matters to us.

Personal information and uploaded documents are handled according to our Privacy Policy.

We may process information necessary to:

• Operate your account.
• Provide requested AI-powered services.
• Store your documents and application packages.
• Maintain platform security.
• Improve service reliability.

We aim to apply appropriate technical and organizational safeguards to protect personal information.

Please review our Privacy Policy for further details about data collection, processing, retention, and your rights.`,
    },
    {
      heading: '11. Account Suspension and Termination',
      body: `You may stop using Aionvia at any time.

We may suspend or restrict access when reasonably necessary to:

• Address security threats.
• Investigate suspected fraud or abuse.
• Enforce these Terms.
• Comply with legal obligations.

Where appropriate and legally permitted, we will provide notice of significant restrictions.

Account deletion and associated data handling are governed by our Privacy Policy and applicable legal requirements.`,
    },
    {
      heading: '12. Limitation of Liability',
      body: `To the maximum extent permitted by applicable law, Aionvia shall not be liable for indirect, incidental, special, or consequential damages arising from your use of the platform.

We do not guarantee:

• Employment or job offers.
• Interview invitations.
• Recruitment success.
• Accuracy of every AI-generated recommendation.
• Acceptance of generated CVs or cover letters by employers.

Nothing in these Terms excludes or limits liability where such exclusion or limitation is prohibited by applicable law.`,
    },
    {
      heading: '13. Changes to These Terms',
      body: `We may update these Terms when necessary to reflect changes in our services, technology, or legal obligations.

When material changes occur, we will take reasonable steps to notify users.

Where required, users will be asked to review and accept the updated Terms before continuing to use affected services.

Each version will have an identifiable version number and effective date.`,
    },
    {
      heading: '14. Governing Law',
      body: `These Terms shall be interpreted in accordance with applicable laws.

The applicable governing law and dispute resolution arrangements must be specified in the final legally approved version before publication.`,
    },
    {
      heading: '15. Contact Information',
      body: `For questions, complaints, or requests concerning these Terms, please contact the Aionvia platform administration through the official contact channels published on our website.

By using Aionvia, you acknowledge that you have read and understood these Terms of Service.`,
    },
  ],
};

export function hasApprovedTerms(): boolean {
  return TERMS_DOCUMENT.approved && TERMS_DOCUMENT.sections.length > 0 &&
    TERMS_DOCUMENT.sections.every((section) => section.heading.trim() && section.body.trim());
}

/**
 * The Refund Policy published at `/refund-policy`.
 *
 * This is a business policy, not a rewrite of the Terms. It describes how a
 * refund request is reviewed, how an approved refund is paid, and which
 * statutory rights are unaffected.
 *
 * It is written against the way the platform actually sells: a subscription
 * period and a credit pack are each one charge for a fixed term, delivered
 * online, and are not renewed automatically. It deliberately does not invent a
 * fixed cooling-off period or a processing time: those are owner decisions and
 * are governed by the applicable consumer-protection rules.
 *
 * The contact address and the business location are interpolated from
 * `shared/contact.ts`, so the policy can never name an address the business
 * does not publish.
 */
export const REFUND_POLICY_VERSION = '2026-11-25';

export const REFUND_POLICY: {
  approved: boolean;
  updated: string;
  sections: ReadonlyArray<{ heading: string; body: string }>;
  sectionsAr: ReadonlyArray<{ heading: string; body: string }>;
} = {
  approved: true,
  updated: 'November 25, 2026',
  sections: [
    {
      heading: 'Scope',
      body: `This Refund Policy applies to paid subscriptions and AI credit packs bought through Aionvia's online checkout at ${businessLocation()}.

It does not replace your statutory rights under the applicable consumer-protection law. Where those rights give you a stronger remedy than this policy, those rights apply.`,
    },
    {
      heading: 'How Aionvia is sold',
      body: `Aionvia is an online career development SaaS platform. Everything you buy is a digital service that is delivered to your account online.

• A subscription plan is sold as one charge for one period — a month or a year, depending on what you chose. The period is not renewed automatically: when it ends, your access ends and your account returns to the free tier unless you buy another period.
• An AI credit pack is sold as one charge for a fixed number of AI credits, added to your account as soon as the payment is confirmed.

Because nothing renews on its own, you are never charged again without a new purchase.`,
    },
    {
      heading: 'Cancelling a subscription',
      body: `You can cancel a subscription at any time by writing to ${BUSINESS_EMAIL} from the email address on your Aionvia account.

When you cancel:

• the subscription is marked as cancelled and it is not renewed;
• your access to the paid plan continues until the end of the period you have already paid for;
• the unused part of the period is not paid back automatically — if you want the remainder considered for a refund, say so in the same message and the request is reviewed under "Your right to request a refund" below.

Cancelling a subscription does not delete your account or the documents you have already created and stored in it.`,
    },
    {
      heading: 'Your right to request a refund',
      body: `You may contact us to request a refund if:

• you were charged more than once for the same purchase;
• you were charged for a purchase you did not authorise;
• the paid service was not made available to your account and we could not resolve it;
• the purchase was made in error and you have not used the service; or
• you believe you are entitled to a refund under the applicable consumer-protection law.

A request is reviewed using the account, the payment reference and the records of what was delivered.`,
    },
    {
      heading: 'Purchases that are generally not refundable',
      body: `Because the service is digital and is consumed as it is used, we may decline a refund where:

• the subscription period or the credit pack has already been used in full;
• the AI credits have already been spent on generated content;
• the request relates to a change of mind after the service has been substantially used;
• the account was closed for a breach of the Terms & Conditions; or
• the request is made long after the purchase and the service has been delivered and used in the meantime.

Nothing in this section removes a right that applicable law says cannot be excluded.`,
    },
    {
      heading: 'How to request a refund',
      body: `Email ${BUSINESS_EMAIL} with the subject "Refund request" and tell us what happened. You can also use the contact details published on the Business Information page.

Please include:

• the email address on your Aionvia account;
• the date of payment;
• the XPay payment or order reference, if you have it;
• the amount you paid; and
• a short description of the problem.

We may ask for additional information needed to identify the payment. Never send a full card number or your password.`,
    },
    {
      heading: 'How an approved refund is paid',
      body: `An approved refund is returned through the original payment method, using the payment provider that processed the purchase. Aionvia does not ask for new card details in order to pay a refund.

The time it takes for the money to appear depends on the payment provider and your bank. We will tell you when the refund has been submitted.`,
    },
    {
      heading: 'Billing disputes and payment issues',
      body: `If you think a charge is wrong, please contact us first so we can identify the payment and respond. This covers a charge for a purchase you do not recognise, a duplicate charge, a payment that went through twice, a wrong amount, and a payment that left your account without giving you access.

Raising a chargeback does not prevent you from contacting us, and contacting us does not limit your right to dispute a charge with your bank or card issuer.`,
    },
    {
      heading: 'If we decline a request',
      body: `If we decline a refund request, we tell you why and, where we can, what would change the outcome — for example a payment we cannot identify, or a service that has already been used. If you disagree, you can reply and ask for a review, and you can raise the matter with your bank or card issuer at any time.`,
    },
    {
      heading: 'Contact',
      body: `The business behind Aionvia is located in ${businessLocation()}.

The business email address is ${BUSINESS_EMAIL}, and it is the address that handles refund requests, billing disputes and privacy requests.

The Business Information page, the Terms & Conditions and this Refund Policy are public and can be read without creating an account.`,
    },
  ],
  sectionsAr: [
    {
      heading: 'نطاق السياسة',
      body: `تنطبق سياسة الاسترداد هذه على الاشتراكات المدفوعة وحزم رصيد الذكاء الاصطناعي التي تُشترى عبر الدفع الإلكتروني في Aionvia من ${businessLocation()}.

لا تحل هذه السياسة محل حقوقك القانونية بموجب قانون حماية المستهلك المعمول به. وإذا منحتك تلك الحقوق علاجًا أقوى من هذه السياسة، فإن تلك الحقوق هي التي تُطبق.`,
    },
    {
      heading: 'كيف تُباع Aionvia',
      body: `Aionvia منصة برمجية مهنية عبر الإنترنت (SaaS) لتطوير المسار المهني. كل ما تشتريه خدمة رقمية تُسلَّم إلى حسابك عبر الإنترنت.

• تُباع باقة الاشتراك دفعة واحدة تغطي فترة واحدة — شهر أو سنة حسب اختيارك. لا تتجدد الفترة تلقائيًا: عند انتهائها تنتهي صلاحية الوصول ويعود حسابك إلى المستوى المجاني ما لم تشترِ فترة أخرى.
• تُباع حزمة رصيد الذكاء الاصطناعي دفعة واحدة مقابل عدد محدد من الأرصدة، وتُضاف إلى حسابك فور تأكيد الدفع.

ولأن لا شيء يتجدد تلقائيًا، فأنت لا تُخصم لك أي دفعة أخرى دون عملية شراء جديدة.`,
    },
    {
      heading: 'إلغاء الاشتراك',
      body: `يمكنك إلغاء الاشتراك في أي وقت بمراسلة ${BUSINESS_EMAIL} من البريد الإلكتروني المسجل في حساب Aionvia.

وعند الإلغاء:

• يُعلَّم الاشتراك كملغى ولا يُجدَّد؛
• تستمر صلاحية الوصول إلى الباقة المدفوعة حتى نهاية الفترة التي دفعت مقابلها؛
• لا تُردّ الفترة غير المستخدمة تلقائيًا — وإذا أردت النظر في ردّها، اذكر ذلك في الرسالة نفسها، ويُراجَع الطلب وفق بند «حقك في طلب الاسترداد» أدناه.

وإلغاء الاشتراك لا يحذف حسابك ولا المستندات التي أنشأتها واحتفظت بها فيه.`,
    },
    {
      heading: 'حقك في طلب الاسترداد',
      body: `يمكنك التواصل معنا لطلب استرداد المبلغ إذا:

• خُصم منك المبلغ أكثر من مرة لنفس عملية الشراء؛
• خُصم منك مبلغ لعملية شراء لم تصرّح بها؛
• لم تتوفر الخدمة المدفوعة في حسابك ولم نتمكن من حل المشكلة؛
• كان الشراء قد تم بالخطأ ولم تستخدم الخدمة؛ أو
• كنت ترى أن لك حقًا في الاسترداد بموجب قانون حماية المستهلك المعمول به.

تتم مراجعة الطلب باستخدام الحساب ومرجع الدفع وسجلات ما تم تسليمه.`,
    },
    {
      heading: 'المشتريات التي لا تُرد عمومًا',
      body: `لأن الخدمة رقمية وتُستهلك أثناء استخدامها، قد نرفض الاسترداد في الحالات التالية:

• استُخدمت فترة الاشتراك أو حزمة الرصيد بالكامل؛
• أُنفق رصيد الذكاء الاصطناعي بالفعل على محتوى تم إنشاؤه؛
• كان الطلب بسبب تغيير الرأي بعد استخدام الخدمة بشكل جوهري؛
• أُغلق الحساب لمخالفة الشروط والأحكام؛ أو
• قُدّم الطلب بعد مضي وقت طويل على الشراء، وقد سُلِّمت الخدمة واستُخدمت في هذه الأثناء.

لا يحذف أي بند في هذا القسم حقًا يقرر القانون المعمول به أنه لا يجوز استبعاده.`,
    },
    {
      heading: 'كيفية طلب الاسترداد',
      body: `أرسل بريدًا إلكترونيًا إلى ${BUSINESS_EMAIL} بعنوان «طلب استرداد» وأخبرنا بما حدث. ويمكنك أيضًا استخدام بيانات الاتصال المنشورة في صفحة المعلومات التجارية.

يرجى تضمين:

• البريد الإلكتروني المسجل في حساب Aionvia؛
• تاريخ الدفع؛
• مرجع الدفع أو الطلب لدى XPay إن كان متاحًا؛
• المبلغ الذي دفعته؛ و
• وصف موجز للمشكلة.

قد نطلب معلومات إضافية لتحديد عملية الدفع. لا ترسل رقم البطاقة كاملًا أو كلمة المرور.`,
    },
    {
      heading: 'كيفية صرف الاسترداد المعتمد',
      body: `يُعاد المبلغ المعتمد عبر وسيلة الدفع الأصلية، باستخدام مزود الدفع الذي نفّذ عملية الشراء. لا تطلب Aionvia بيانات بطاقة جديدة لصرف الاسترداد.

تختلف المدة التي يظهر بعدها المبلغ حسب مزود الدفع والبنك. وسنخبرك عند إرسال الاسترداد.`,
    },
    {
      heading: 'نزاعات الدفع ومشكلات الفوترة',
      body: `إذا كنت تعتقد أن هناك خصمًا خاطئًا، يرجى التواصل معنا أولًا حتى نتمكن من تحديد عملية الدفع والرد عليها. ويشمل ذلك خصمًا لعملية شراء لا تتعرف عليها، أو خصمًا مكررًا، أو عملية دفع تمت مرتين، أو مبلغًا غير صحيح، أو عملية دفع خرجت من حسابك دون أن تحصل على الخدمة.

رفع اعتراض لدى البنك لا يمنعك من التواصل معنا، والتواصل معنا لا يحد من حقك في الاعتراض لدى البنك أو جهة إصدار البطاقة.`,
    },
    {
      heading: 'إذا رُفض الطلب',
      body: `إذا رفضنا طلب استرداد، نوضح لك السبب، ونذكر ما يمكن أن يغيّر النتيجة — مثل دفعة لا نستطيع تحديدها، أو خدمة استُخدمت بالفعل. وإذا لم توافق، يمكنك الرد وطلب مراجعة الطلب، ويمكنك في أي وقت طرح الأمر لدى البنك أو جهة إصدار البطاقة.`,
    },
    {
      heading: 'التواصل',
      body: `النشاط التجاري خلف Aionvia يقع في ${businessLocation()}.

البريد الإلكتروني الرسمي هو ${BUSINESS_EMAIL}، وهو العنوان الذي يتولى طلبات الاسترداد ونزاعات الدفع وطلبات الخصوصية.

صفحة المعلومات التجارية والشروط والأحكام وسياسة الاسترداد متاحة للعامة ويمكن قراءتها دون إنشاء حساب.`,
    },
  ],
};

export function hasApprovedRefundPolicy(): boolean {
  return REFUND_POLICY.approved && REFUND_POLICY.sections.length > 0 &&
    REFUND_POLICY.sections.every((section) => section.heading.trim() && section.body.trim());
}

/** The current version identifier for the existing Privacy Policy. */
export const PRIVACY_VERSION = '2026-11-03';

/** The canonical public path of the Terms & Conditions. */
export const TERMS_PATH = '/terms';

/** The canonical public path of the Privacy Policy. */
export const PRIVACY_PATH = '/privacy';

/** The canonical public path of the Refund Policy. */
export const REFUND_PATH = '/refund-policy';

/** The canonical public path of the Business Information page. */
export const BUSINESS_INFORMATION_PATH = '/business-information';

/** The consent vocabulary stored in public.user_consents.status. */
export type ConsentRecordStatus = 'accepted' | 'withdrawn';

/** How the acceptance happened. */
export type ConsentSource = 'registration' | 'reconsent' | 'settings';

/** One consent acceptance, as stored. */
export interface ConsentRecord {
  id: string;
  userId: string;
  termsVersion: string;
  privacyVersion: string;
  status: ConsentRecordStatus;
  source: ConsentSource | string;
  acceptedAt: string;
  createdAt: string;
}

/** Everything the client needs to decide whether to show the consent gate. */
export interface ConsentState {
  /** The version the user must accept right now. */
  termsVersion: string;
  /** The version the user must accept right now. */
  privacyVersion: string;
  /** True only after the operator supplies and approves Terms content. */
  termsAvailable: boolean;
  /** True when the user's newest acceptance covers both current versions. */
  accepted: boolean;
  /** The newest acceptance, if there is one. */
  current: ConsentRecord | null;
  /** The full history, newest first. */
  history: ConsentRecord[];
  /** The public paths the UI must link to. */
  termsPath: string;
  privacyPath: string;
}

/**
 * True when an acceptance covers the versions that are current now.
 *
 * A withdrawn record is never current, even when its versions match.
 */
export function isCurrentConsent(
  record: Pick<ConsentRecord, 'termsVersion' | 'privacyVersion' | 'status'> | null | undefined,
  termsVersion: string = TERMS_VERSION,
  privacyVersion: string = PRIVACY_VERSION
): boolean {
  if (!record) return false;
  return (
    record.status === 'accepted' &&
    record.termsVersion === termsVersion &&
    record.privacyVersion === privacyVersion
  );
}

/** The empty state used before a request resolves. */
export function emptyConsentState(): ConsentState {
  return {
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    termsAvailable: hasApprovedTerms(),
    accepted: false,
    current: null,
    history: [],
    termsPath: TERMS_PATH,
    privacyPath: PRIVACY_PATH,
  };
}
