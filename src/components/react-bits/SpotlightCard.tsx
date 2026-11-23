import {
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type ElementType,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react';

/**
 * A card whose background is lit from the pointer.
 *
 * WHY IT NO LONGER USES GSAP
 * --------------------------
 * Every pointer move used to start a GSAP tween on two custom properties. A
 * grid of twelve cards meant twelve tweens being created and destroyed while
 * the pointer moved across them, which is a lot of work for a glow — and it
 * was measurable while scrolling, because a tween left running keeps the
 * ticker busy.
 *
 * The same effect is now a pair of custom properties written directly to the
 * element, coalesced into one frame with `requestAnimationFrame`. No tween is
 * created, nothing keeps running after the pointer stops, and the browser
 * paints the gradient it was already painting.
 *
 * Cards that do not want the effect at all simply do not use this component:
 * the Skills list, for instance, is a plain list of rows.
 */
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
  const card = useRef<HTMLElement | null>(null);
  const frame = useRef<number | null>(null);

  // A frame scheduled as the pointer left is cancelled with the card, so
  // nothing writes to a node that is no longer on the page.
  useEffect(
    () => () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    },
    [],
  );

  const assignRef = (element: HTMLElement | null) => {
    card.current = element;
    if (typeof forwardedRef === 'function') {
      forwardedRef(element);
    } else if (forwardedRef) {
      Reflect.set(forwardedRef, 'current', element);
    }
  };

  const moveSpotlight = (event: PointerEvent<HTMLElement>) => {
    const node = event.currentTarget;
    const x = event.clientX - node.getBoundingClientRect().left;
    const y = event.clientY - node.getBoundingClientRect().top;

    // One write per frame, however many pointer events arrive.
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      node.style.setProperty('--spotlight-x', `${x}px`);
      node.style.setProperty('--spotlight-y', `${y}px`);
    });
  };

  // The element is chosen at runtime, so it is rendered through a tag that
  // carries the union's shared props rather than through any one of them.
  const Tag = Element as ElementType;

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
