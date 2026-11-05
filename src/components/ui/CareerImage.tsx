import React, { useState } from 'react';
import { getIndustryVisual, type PlatformVisualAsset } from '../../lib/imageAssets';
import { useCareer } from '../../context/CareerContext';

export interface CareerImageProps {
  /** Category, domain ID, role slug, or keyword used to resolve the visual */
  category?: string;
  /** Explicit source URL. If provided and valid, it takes precedence over the category asset */
  src?: string | null;
  /** Custom accessible alt text. If omitted, uses the localized asset description */
  alt?: string;
  /** Aspect ratio preset */
  aspectRatio?: 'video' | '16/9' | '4/3' | 'square' | '16/10' | '21/9' | 'auto';
  /** Size tier: 'sm' loads the 400w thumbnail; 'md'/'lg' loads the 800w master */
  size?: 'sm' | 'md' | 'lg';
  /** Above-the-fold high-priority flag. False by default for lazy loading */
  priority?: boolean;
  /** Display discreet photographer attribution pill */
  showAttribution?: boolean;
  /** Additional Tailwind class names */
  className?: string;
  /** Rounded corners styling override */
  rounded?: string;
  /** Overlay element rendered on top of the image */
  children?: React.ReactNode;
}

const ASPECT_CLASSES: Record<NonNullable<CareerImageProps['aspectRatio']>, string> = {
  video: 'aspect-video',
  '16/9': 'aspect-video',
  '4/3': 'aspect-[4/3]',
  square: 'aspect-square',
  '16/10': 'aspect-[16/10]',
  '21/9': 'aspect-[21/9]',
  auto: '',
};

export const CareerImage: React.FC<CareerImageProps> = ({
  category,
  src: explicitSrc,
  alt: explicitAlt,
  aspectRatio = '16/10',
  size = 'md',
  priority = false,
  showAttribution = false,
  className = '',
  rounded = 'rounded-xl',
  children,
}) => {
  const { settings } = useCareer();
  const isAr = settings.language === 'ar';
  const [loadError, setLoadError] = useState(false);

  // Resolve matching platform asset
  const asset: PlatformVisualAsset = getIndustryVisual(category);

  // Determine source path
  let finalSrc = explicitSrc && explicitSrc.trim().length > 0 ? explicitSrc : null;
  if (!finalSrc || loadError) {
    finalSrc = size === 'sm' ? asset.srcSm : asset.src;
  }

  // Determine alt text
  const finalAlt =
    explicitAlt && explicitAlt.trim().length > 0
      ? explicitAlt
      : isAr
      ? asset.altAr
      : asset.altEn;

  const aspectClass = ASPECT_CLASSES[aspectRatio];

  return (
    <div
      className={`group relative overflow-hidden bg-[var(--color-surface-secondary)] ${rounded} ${aspectClass} ${className}`}
    >
      <img
        src={finalSrc}
        alt={finalAlt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        onError={() => setLoadError(true)}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
      />

      {/* Optional photographer attribution pill */}
      {showAttribution && asset.photographer && (
        <div className="pointer-events-none absolute bottom-2 end-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-medium text-white/90 backdrop-blur-md">
          <span>{asset.source} / {asset.photographer}</span>
        </div>
      )}

      {/* Children overlay (badges, titles, action buttons) */}
      {children && <div className="absolute inset-0">{children}</div>}
    </div>
  );
};

export default CareerImage;
