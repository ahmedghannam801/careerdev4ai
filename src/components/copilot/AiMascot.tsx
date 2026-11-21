import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface AiMascotProps {
  className?: string;
  state?: 'idle' | 'thinking' | 'still';
  alt?: string;
}

export const AiMascot: React.FC<AiMascotProps> = ({ className, state = 'still', alt = 'Aionvia AI assistant' }) => {
  const reduced = useReducedMotion() ?? false;
  const animate = reduced || state === 'still'
    ? { y: 0, rotate: 0, scale: 1 }
    : state === 'thinking'
      ? { y: [0, -1, 0], rotate: [0, -1, 0, 1, 0], scale: [1, 1.025, 1] }
      : { y: [0, -2, 0], rotate: 0, scale: 1 };

  return (
    <motion.img
      src="/brand/aionvia-ai-mascot.webp"
      alt={alt}
      aria-hidden={alt === '' ? true : undefined}
      className={className}
      width={348}
      height={490}
      draggable={false}
      animate={animate}
      transition={{ duration: state === 'thinking' ? 1.8 : 3.2, repeat: reduced || state === 'still' ? 0 : Infinity, ease: 'easeInOut' }}
    />
  );
};
