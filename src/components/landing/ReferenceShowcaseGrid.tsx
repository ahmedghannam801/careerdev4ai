import React from 'react';
import { useCareer } from '../../context/CareerContext';
import { useReducedMotion } from 'motion/react';

interface ReferenceShowcaseGridProps {
  onStartOnboarding?: () => void;
  onExploreRoles?: () => void;
}

interface ShowcaseCard {
  id: string;
  title: string;
  descKey: string;
  descAr: string;
  image: string;
  imageSm: string;
  altEn: string;
  altAr: string;
  target: string;
}

const SHOWCASE_CARDS: ShowcaseCard[] = [
  {
    id: 'learning',
    title: 'Learning',
    descKey: 'Authentic educational photography.',
    descAr: 'صور تعليمية فوتوغرافية حقيقية.',
    image: '/images/showcase/learning.webp',
    imageSm: '/images/showcase/learning-sm.webp',
    altEn: 'University student studying with a laptop in a modern educational environment',
    altAr: 'طالبة جامعية تدرس بحاسوب محمول في بيئة تعليمية حديثة',
    target: '#how-it-works',
  },
  {
    id: 'hero-3d',
    title: 'Hero 3D',
    descKey: 'Primary element before registration.',
    descAr: 'العنصر الرئيسي قبل التسجيل.',
    image: '/images/showcase/hero-3d.webp',
    imageSm: '/images/showcase/hero-3d-sm.webp',
    altEn: 'Premium 3D abstract geometric composition with charcoal structures and copper details',
    altAr: 'تكوين هندسي تجريدي ثلاثي الأبعاد مع هياكل كحلية وتفاصيل نحاسية',
    target: '#preview',
  },
  {
    id: 'career-opportunities',
    title: 'Career Opportunities',
    descKey: 'Interviews and career opportunities.',
    descAr: 'مقابلات وفرص عمل.',
    image: '/images/showcase/career-opportunities.webp',
    imageSm: '/images/showcase/career-opportunities-sm.webp',
    altEn: 'Professional recruitment meeting and job interview conversation',
    altAr: 'مقابلة عمل مهنية واجتماع توظيف',
    target: '#roles',
  },
  {
    id: 'professional-growth',
    title: 'Professional Growth',
    descKey: 'Collaboration and real work environments.',
    descAr: 'تعاون وبيئة عمل حقيقية.',
    image: '/images/showcase/professional-growth.webp',
    imageSm: '/images/showcase/professional-growth-sm.webp',
    altEn: 'Diverse professional team collaborating in a modern workplace',
    altAr: 'فريق مهني متنوع يتعاون في بيئة عمل عصرية',
    target: '#personas',
  },
];

export const ReferenceShowcaseGrid: React.FC<ReferenceShowcaseGridProps> = ({
  onStartOnboarding,
  onExploreRoles,
}) => {
  const { t, settings } = useCareer();
  const isAr = settings.language === 'ar';
  const reduced = useReducedMotion() ?? false;

  const handleCardClick = (target: string) => {
    if (target.startsWith('#')) {
      const element = document.querySelector(target);
      if (element) {
        element.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        return;
      }
    }
    if (target === '#roles' && onExploreRoles) {
      onExploreRoles();
    } else if (onStartOnboarding) {
      onStartOnboarding();
    }
  };

  return (
    <section
      id="visual-showcase"
      aria-label={t('Visual Showcase')}
      className="scroll-mt-24 bg-black text-white px-6 py-14 sm:py-20 lg:py-24 border-y border-neutral-900"
    >
      <div className="mx-auto max-w-6xl">
        {/* 2x2 Showcase Grid */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-x-8 sm:gap-y-12 lg:gap-x-10 lg:gap-y-14"
          dir="ltr"
        >
          {SHOWCASE_CARDS.map((card) => (
            <article
              key={card.id}
              onClick={() => handleCardClick(card.target)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleCardClick(card.target);
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`${card.title} - ${isAr ? card.descAr : t(card.descKey)}`}
              className="group cursor-pointer rounded-2xl outline-hidden transition-transform duration-200 hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              {/* Landscape 16:9 Image Container with Rounded Corners */}
              <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-neutral-900">
                <picture>
                  <source srcSet={card.imageSm} media="(max-width: 640px)" type="image/webp" />
                  <img
                    src={card.image}
                    alt={isAr ? card.altAr : card.altEn}
                    width="800"
                    height="450"
                    loading="lazy"
                    decoding="async"
                    className={`h-full w-full object-cover transition-transform duration-300 ${
                      reduced ? '' : 'group-hover:scale-[1.015]'
                    }`}
                  />
                </picture>
              </div>

              {/* Title & Description underneath with proper RTL / LTR alignment */}
              <div
                className={`mt-3.5 space-y-1 ${
                  isAr ? 'text-right' : 'text-left'
                }`}
              >
                <h3
                  className="text-sm sm:text-base font-bold text-white tracking-tight"
                  dir="ltr"
                >
                  {card.title}
                </h3>
                <p
                  className="text-xs text-neutral-400 font-normal leading-relaxed"
                  dir={isAr ? 'rtl' : 'ltr'}
                >
                  {isAr ? card.descAr : t(card.descKey)}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
