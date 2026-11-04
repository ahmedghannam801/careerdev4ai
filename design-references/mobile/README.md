# Mobile

The Capacitor native shell and the mobile-specific design decisions it implies.

## What belongs here

- The native shell configuration and its store metadata.
- Mobile-specific navigation (bottom bar vs. drawer vs. the desktop sidebar).
- Touch target sizing and the thumb-zone asymmetry in RTL.
- Offline and slow-network behaviour.
- Native surfaces: splash screen, deep links, browser in-app (`@capacitor/browser`).
- Responsive behaviour of every authenticated surface.

## Current implementation

`package.json` includes `@capacitor/android` ^8.5.3, `@capacitor/core` ^8.1.2, `@capacitor/app`, `@capacitor/browser`, `@capacitor/splash-screen`, `@capacitor/cli`.
`capacitor.config.ts` documents the intent: *"The Android application is a native wrapper around the very same build that is deployed to https://careerdev4ai.pages.dev. Nothing about the web application changes: the bundle, the branding, the routes, the backend and the authentication behaviour are the ones that already exist."*

## References

| Ref | URL | Note |
| --- | --- | --- |
| V2 | https://mafeshsho8l.com/ | Native iOS + Android apps shipped alongside the web product — the market baseline |
| V9 | https://www.coursera.org/ | Native apps with their own store presence and deep-link surface |
| V14 | https://www.webversearena.com/blog/arabic-website-design-rtl-best-practices-2026 | 44px touch targets; the right side is the primary thumb zone in RTL |
| V1 | https://wuzzuftop.com/ | RTL-native nav with the country picker and flag/dial-code treatment |

## Design rules

- **The shell reuses the web build.** Do not fork the UI. Any change must land in the web app and flow to the app.
- Touch targets: **minimum 44×44px** on all interactive elements.
- In RTL the **right side is the primary thumb zone** on a right-handed phone — the mirror of LTR. A right-aligned primary CTA in an LTR layout must not become left-aligned in RTL if it is meant to sit in the thumb zone.
- Bottom navigation, if added, must have a safe-area inset for the gesture bar.
- The desktop sidebar does not survive on a phone. Decide per surface: drawer, bottom tabs, or stacked single-column.
- Offline: the copilot, the roadmap, and the CV all depend on the network. Each needs an honest offline state, not a spinner.
- The splash screen must not imply the app is ready before authentication has resolved.

## Open work

- No mobile-specific UI has been designed yet — this category is a placeholder for that work.
- Gap **G14** is deliberately **Low** priority: the shell is done; the mobile *UX* is not, and it should not be gold-plated before the web product is solid.
