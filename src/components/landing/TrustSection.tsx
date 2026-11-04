import React from 'react';
import { Database, Gauge, Lock, ShieldCheck } from 'lucide-react';

import { useCareer } from '../../context/CareerContext';

/**
 * Trust and transparency.
 *
 * The platform makes claims about what it knows about a user's career, so
 * it has to be equally clear about how it reaches those claims and what it
 * cannot do. Four questions, answered plainly.
 *
 * There are no testimonials here. The product has no customer quotes to
 * publish, and inventing them would undermine the exact point this section
 * is making.
 */

export const TrustSection: React.FC = () => {
  const { t } = useCareer();

  // Translated as literal calls so the localisation audit can see them.
  const TRUST_ITEMS = [
    {
      icon: Gauge,
      title: t('How career readiness is calculated'),
      body: t(
        'Readiness is a measured comparison between the skills a role requires and the skills you have actually recorded, weighted by which requirements are core and which are preferred. It is a score against a benchmark, not a prediction of how an interview will go.'
      ),
    },
    {
      icon: Database,
      title: t('How AI recommendations work'),
      body: t(
        'Recommendations are drawn from your own goals, skills, evidence, roadmap and application history. When the assistant reasons about something it cannot source from those records, it says so instead of filling the gap. Nothing you did not enter is treated as something you did.'
      ),
    },
    {
      icon: Lock,
      title: t('How your data is handled'),
      body: t(
        'Your records are private to your account. Access is enforced by row-level security on the database, and your CV files live in a private storage bucket that only your account can read. Consent is versioned and recorded, and you can export or delete your data at any time.'
      ),
    },
    {
      icon: ShieldCheck,
      title: t('What the platform cannot guarantee'),
      body: t(
        'It cannot promise you a job, an interview, a salary or an offer. It cannot verify a certificate you did not earn. It has no live vacancy feed, so it will not show you a job that may already be closed. What it does is make your own position clearer and keep the next step honest.'
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {TRUST_ITEMS.map(({ icon: Icon, title, body }) => (
        <div
          key={title}
          className="flex h-full gap-3.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-surface)] text-[var(--color-primary-text)]">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">{body}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TrustSection;
