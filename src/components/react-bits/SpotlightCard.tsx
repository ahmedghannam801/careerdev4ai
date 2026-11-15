import {
  useRef,
  type ComponentPropsWithoutRef,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

type SpotlightCardProps = {
  children: ReactNode;
  className?: string;
  /**
   * The element to render.
   *
   * A card that IS the card — a vacancy, a metric — should keep its own
   * element, because a screen reader is told what that thing is by the tag
   * itself. Wrapping such a card in another element would cost the meaning
   * for nothing.
   */
  as?: 'div' | 'article' | 'section' | 'li';
  /**
   * Whether the glow is clipped to the card.
   *
   * Clipping is right for a card whose background is painted by the glow. A
   * card that opens a popover above itself needs the popover to escape, so it
   * asks for `visible`.
   */
  overflow?: 'hidden' | 'visible';
  /** The element to track the pointer on. */
  ref?: Ref<HTMLElement>;
} & Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'className'>;

export function SpotlightCard({
  children,
  className = '',
  as: Element = 'div',
  overflow = 'hidden',
  ref: forwardedRef,
  ...rest
}: SpotlightCardProps) {
  const card = useRef<HTMLElement>(null);
  const { contextSafe } = useGSAP({ scope: card });

  const assignRef = (element: HTMLElement | null) => {
    card.current = element;
    if (typeof forwardedRef === 'function') {
      forwardedRef(element);
    } else if (forwardedRef) {
      Reflect.set(forwardedRef, 'current', element);
    }
  };

  const moveSpotlight = contextSafe((event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = `${event.clientX - rect.left}px`;
    const y = `${event.clientY - rect.top}px`;
    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      event.currentTarget.style.setProperty('--spotlight-x', x);
      event.currentTarget.style.setProperty('--spotlight-y', y);
      return;
    }
    gsap.to(event.currentTarget, {
      '--spotlight-x': x,
      '--spotlight-y': y,
      duration: 0.25,
      ease: 'power2.out',
    });
  });

  // The element is chosen at runtime, so it is rendered through a tag that
  // carries the union's shared props rather than through any one of them.
  const Tag = Element as React.ElementType;

  return (
    <Tag
      ref={assignRef}
      onPointerMove={moveSpotlight}
      className={`relative ${overflow === 'hidden' ? 'overflow-hidden' : 'overflow-visible'} ${className}`}
      style={{
        backgroundImage:
          'radial-gradient(360px circle at var(--spotlight-x, 50%) var(--spotlight-y, 50%), color-mix(in srgb, var(--accent-primary) 12%, transparent), transparent 72%)',
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
