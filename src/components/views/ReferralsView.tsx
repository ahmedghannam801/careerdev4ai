import React from 'react';
import { useCareer } from '../../context/CareerContext';
import { Reveal } from '../motion/Motion';
import { ReferralPanel } from '../referral/ReferralPanel';

/**
 * The referrals page.
 *
 * One panel and one explanation. The referral programme is a by-product of the
 * platform, not a destination of its own, so it is kept deliberately small.
 */
export const ReferralsView: React.FC = () => {
  const { t } = useCareer();

  return (
    <Reveal className="space-y-6">
      <div className="flex flex-col gap-1 border-b border-[var(--border-subtle)] pb-2">
        <div className="text-xs text-[var(--text-secondary)]">{t('INVITE A FRIEND')}</div>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          {t('Referrals')}
        </h1>
      </div>

      <ReferralPanel />
    </Reveal>
  );
};

export default ReferralsView;
