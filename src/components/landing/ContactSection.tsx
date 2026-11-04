import React from 'react';
import { ExternalLink, Mail, Scale, ShieldCheck } from 'lucide-react';

import { useCareer } from '../../context/CareerContext';
import {
  SUPPORT_EMAIL,
  OPERATOR_LINKEDIN_URL,
  PUBLIC_PATHS,
} from '../../../shared/contact.ts';

/**
 * Contact and legal links.
 *
 * The contact channels listed here are the ones the platform already
 * publishes elsewhere (Settings › Contact), so this section does not
 * introduce a new promise — it gives the public page the same channels the
 * signed-in product already uses.
 *
 * The legal links point at the server-rendered `/privacy` and `/terms`
 * pages, which are the published documents. They are real anchors with
 * real destinations, not labels that look like links.
 */

export const ContactSection: React.FC = () => {
  const { t } = useCareer();

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {/* Support */}
      <a
        href={`mailto:${SUPPORT_EMAIL}`}
        className="group flex h-full flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:shadow-[var(--shadow-card)]"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-accent-surface)] text-[var(--color-primary-text)]">
          <Mail className="h-4 w-4" />
        </span>
        <h3 className="mt-3.5 text-sm font-bold text-[var(--text-primary)]">{t('Support and feedback')}</h3>
        <p className="mt-1.5 flex-1 text-xs leading-relaxed text-[var(--text-secondary)]">
          {t('Questions, bug reports and feature requests go to the same address the app publishes in Settings.')}
        </p>
        <span className="mt-3 break-all text-[11px] font-semibold text-[var(--color-primary-text)]">
          {SUPPORT_EMAIL}
        </span>
      </a>

      {/* Legal documents */}
      <div className="flex h-full flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-accent-surface)] text-[var(--color-primary-text)]">
          <Scale className="h-4 w-4" />
        </span>
        <h3 className="mt-3.5 text-sm font-bold text-[var(--text-primary)]">{t('Published legal documents')}</h3>
        <p className="mt-1.5 flex-1 text-xs leading-relaxed text-[var(--text-secondary)]">
          {t('The Terms and the Privacy Policy are published in full, at their own addresses, and are versioned.')}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={PUBLIC_PATHS.terms}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--color-border-strong)]"
          >
            {t('Terms')}
            <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href={PUBLIC_PATHS.privacy}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--color-border-strong)]"
          >
            {t('Privacy')}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Operator */}
      <div className="flex h-full flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-accent-surface)] text-[var(--color-primary-text)]">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <h3 className="mt-3.5 text-sm font-bold text-[var(--text-primary)]">{t('Who builds CareerDev4AI')}</h3>
        <p className="mt-1.5 flex-1 text-xs leading-relaxed text-[var(--text-secondary)]">
          {t('The product is built and published by Ahmed Ebrahim, who is also the contact for the legal documents.')}
        </p>
        <a
          href={OPERATOR_LINKEDIN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex w-fit items-center gap-1 text-[11px] font-semibold text-[var(--color-primary-text)] transition-colors hover:underline"
        >
          {t('LinkedIn profile')}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
};

export default ContactSection;
