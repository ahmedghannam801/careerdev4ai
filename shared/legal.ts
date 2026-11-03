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
      heading: 'CareerDev4AI — Terms of Service',
      body: `Last Updated: November 4, 2026
Effective Date: November 4, 2026`,
    },
    {
      heading: '1. Acceptance of Terms',
      body: `Welcome to CareerDev4AI.

These Terms of Service govern your access to and use of the CareerDev4AI platform, website, applications, and related services.

By creating an account, accessing the platform, or using its services, you acknowledge that you have read and understood these Terms.

If you do not agree with these Terms, you must discontinue using the platform.`,
    },
    {
      heading: '2. About CareerDev4AI',
      body: `CareerDev4AI is an AI-powered career development platform designed to help users improve their professional profiles, prepare for employment opportunities, and develop career-related skills.

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
      body: `You agree to use CareerDev4AI only for lawful and legitimate purposes.

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
      body: `CareerDev4AI uses artificial intelligence to generate analyses, recommendations, documents, and other career-related outputs.

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
      body: `You retain ownership of the documents and information you upload to CareerDev4AI, subject to any third-party rights.

By uploading content, you grant CareerDev4AI the limited permission necessary to:

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
      body: `The CareerDev4AI platform, including its branding, logos, design, software, interface, and original platform materials, is protected by applicable intellectual property laws.

You may not copy, reproduce, distribute, or commercially exploit protected platform materials without prior authorization.

Your uploaded documents remain yours, subject to any applicable third-party rights.

Ownership and permitted use of AI-generated outputs are subject to applicable law and any relevant third-party service terms.`,
    },
    {
      heading: '8. Third-Party Services',
      body: `CareerDev4AI may rely on third-party services and providers to operate certain features.

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
      body: `We aim to provide reliable and secure access to CareerDev4AI.

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
      body: `You may stop using CareerDev4AI at any time.

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
      body: `To the maximum extent permitted by applicable law, CareerDev4AI shall not be liable for indirect, incidental, special, or consequential damages arising from your use of the platform.

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
      body: `For questions, complaints, or requests concerning these Terms, please contact the CareerDev4AI platform administration through the official contact channels published on our website.

By using CareerDev4AI, you acknowledge that you have read and understood these Terms of Service.`,
    },
  ],
};

export function hasApprovedTerms(): boolean {
  return TERMS_DOCUMENT.approved && TERMS_DOCUMENT.sections.length > 0 &&
    TERMS_DOCUMENT.sections.every((section) => section.heading.trim() && section.body.trim());
}

/** The current version identifier for the existing Privacy Policy. */
export const PRIVACY_VERSION = '2026-11-03';

/** The canonical public path of the Terms & Conditions. */
export const TERMS_PATH = '/terms';

/** The canonical public path of the Privacy Policy. */
export const PRIVACY_PATH = '/privacy';

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
