/**
 * The one loading surface.
 * ---------------------------------------------------------------------------
 * Every meaningful wait in the product is shown with this component, so the
 * platform never invents a second spinner and the candidate always sees the
 * same friendly face while the platform works.
 *
 * THE OFFICIAL MASCOT, AND ONLY THE OFFICIAL MASCOT
 * The artwork is the platform's own `roadmapak-ai-mascot.webp`. It is not
 * redrawn, not replaced by a generic robot and not substituted by another
 * illustration: the file is served from `/brand/`, the same place the AI
 * assistant's avatar is loaded from, so there is exactly one mascot in the
 * product.
 *
 * THE MESSAGE FOLLOWS THE INTERFACE
 * The message is an English source string that the caller hands over; the
 * component runs it through the platform's own translator, so an Arabic reader
 * is told the same thing in Arabic without the component knowing anything
 * about languages.
 *
 * THE WAIT IS HONEST
 * The component never claims a percentage and never pretends to know how much
 * is left. It says that things are being prepared, it moves gently while the
 * work runs, and it stops the moment the work is over.
 *
 * Nothing moves when the reader asked for reduced motion: the mascot is still
 * there, the message is still read, and only the movement is dropped.
 */

import React from 'react';
import { motion } from 'motion/react';

import { useCareer } from '../../context/CareerContext';
import { useMotionVariants } from '../../lib/motion';

export type MascotLoaderSize = 'sm' | 'md' | 'lg';

export interface MascotLoaderProps {
  /** The size of the mascot. `sm` fits inside a section, `lg` is the hero. */
  size?: MascotLoaderSize;
  /**
   * The English source string shown under the mascot. It is translated by the
   * platform, so the caller writes it once.
   */
  message?: string;
  /** An extra class for the wrapper. */
  className?: string;
  /** The accessible description of the mascot. */
  alt?: string;
  /** Whether the message is shown at all. */
  showMessage?: boolean;
}

const SIZES: Record<MascotLoaderSize, { image: string; halo: string }> = {
  sm: { image: 'h-10 w-8', halo: 'h-14 w-14' },
  md: { image: 'h-16 w-12', halo: 'h-20 w-20' },
  lg: { image: 'h-24 w-[4.5rem]', halo: 'h-32 w-32' },
};

/** The default message, in the two languages the platform speaks. */
export const MASCOT_LOADING_MESSAGE = "Please wait, I'm getting things ready for you...";

export const MascotLoader: React.FC<MascotLoaderProps> = ({
  size = 'md',
  message = MASCOT_LOADING_MESSAGE,
  className = '',
  alt = 'Roadmapak assistant',
  showMessage = true,
}) => {
  const { t } = useCareer();
  const { reduced } = useMotionVariants();
  const dimensions = SIZES[size];

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className={`relative flex ${dimensions.halo} items-center justify-center`}>
        {/*
          A soft halo behind the mascot. It is a gradient, not a blur filter:
          it costs nothing to paint and it never forces the browser to
          composite a large blurred surface.
        */}
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-[var(--accent-primary)]/12"
          animate={reduced ? { scale: 1, opacity: 0.5 } : { scale: [0.92, 1.06, 0.92], opacity: [0.35, 0.6, 0.35] }}
          transition={{ duration: 2.4, repeat: reduced ? 0 : Infinity, ease: 'easeInOut' }}
        />
        <motion.img
          src="/brand/roadmapak-ai-mascot.webp"
          alt={alt}
          width={348}
          height={490}
          draggable={false}
          className={`${dimensions.image} relative object-contain`}
          animate={reduced ? { y: 0 } : { y: [0, -4, 0] }}
          transition={{ duration: 2.2, repeat: reduced ? 0 : Infinity, ease: 'easeInOut' }}
        />
      </div>

      {showMessage ? (
        <p className="max-w-[18rem] text-center text-xs font-medium leading-relaxed text-[var(--text-secondary)]">
          {t(message)}
        </p>
      ) : null}
    </div>
  );
};

export default MascotLoader;
