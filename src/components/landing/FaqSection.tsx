import React from 'react';
import { ChevronDown } from 'lucide-react';

import { useCareer } from '../../context/CareerContext';

/**
 * Frequently asked questions.
 *
 * The accordion is built on native `details` and `summary` elements, so it
 * works without JavaScript, is keyboard operable out of the box, is
 * announced correctly by a screen reader, and needs no JavaScript state to
 * stay in sync with the page.
 *
 * The answers describe what the product actually does today. Where the
 * product does not do something, the answer says that instead of leaving
 * the question open.
 */

export const FaqSection: React.FC = () => {
  const { t } = useCareer();

  // Translated as literal calls so the localisation audit can see them.
  const FAQS: { question: string; answer: string }[] = [
    {
      question: t('Do I need to already know which career I want?'),
      answer: t(
        'No. You can start from a domain, a set of skills you already have, or a role you are curious about. The platform compares what you have recorded against the role and shows you the gap, so the direction can sharpen as you go.'
      ),
    },
    {
      question: t('Where does the learning content come from?'),
      answer: t(
        'Each resource in the catalogue carries the provider that published it and a link to the original page. The catalogue only shows resources that address a gap in your profile for your target role, and nothing is recommended to you that the platform cannot point you to.'
      ),
    },
    {
      question: t('Can I get a job or an offer through CareerDev4AI?'),
      answer: t(
        'No, and no career platform can honestly promise that. The platform keeps your applications, your tailored documents and your interview preparation in one place so you can apply consistently and prepare properly. It also has no live vacancy feed, so it will not show you a vacancy it cannot verify.'
      ),
    },
    {
      question: t('What happens to my original CV?'),
      answer: t(
        'It is never overwritten. A tailored version is created as a separate record that keeps a snapshot of the CV it was built from, so you can always see what changed and revert to the original.'
      ),
    },
    {
      question: t('Is my data private?'),
      answer: t(
        'Your records are private to your account, enforced by row-level security on the database. Your uploaded documents live in a private storage bucket. You can export your data, review your consents, or delete your account and your data from Settings.'
      ),
    },
    {
      question: t('Does it work in Arabic?'),
      answer: t(
        'Yes. The entire interface is available in English and Arabic, including right-to-left layout, and the platform is built for the Egyptian and regional market rather than translated into it after the fact.'
      ),
    },
    {
      question: t('Do I need a paid plan?'),
      answer: t(
        'There is no paid plan and no billing. Everything the platform offers is available from the moment you finish onboarding.'
      ),
    },
    {
      question: t('Can I start on my phone?'),
      answer: t(
        'Yes. The dashboard, roadmaps, CV upload, application tracking and the AI assistant are all built to work on a phone, and the same product is available as an Android application.'
      ),
    },
  ];

  return (
    <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      {FAQS.map(({ question, answer }) => (
        <details key={question} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-start text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--color-surface-secondary)]/60">
            <span>{question}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="px-5 pb-5 pe-5 text-xs leading-relaxed text-[var(--text-secondary)]">{answer}</div>
        </details>
      ))}
    </div>
  );
};

export default FaqSection;
