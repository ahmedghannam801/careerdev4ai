/**
 * The PDF export of the CV Studio.
 *
 * A PDF is produced by the browser's own print engine, from the REAL rendered
 * template — not from a picture of it and not from a second layout. That is
 * the only engine on the web that lays out the document exactly the way the
 * preview did, including Arabic shaping, the template's fonts, its colours,
 * its columns and its page breaks. The exported file is a text PDF: its words
 * are selectable and searchable, because every glyph comes from the document
 * itself.
 *
 * The document is printed from an off-screen frame rather than from the
 * application window. The frame holds nothing but the paper, so a menu, a
 * drawer, a toast or a background animation cannot end up in the file, and a
 * template can be exported from a screen that is scrolled anywhere. The same
 * stylesheets the preview used are copied into the frame, so the paper is the
 * paper.
 *
 * The browser's print dialog is where "Save as PDF" lives. The frame is opened
 * with the document's own name as its title, so the suggested file name is the
 * candidate's name and the template, not "CareerDev4AI".
 */

export interface CvPrintStyles {
  /** Absolute or root-relative stylesheet URLs, in load order. */
  links: string[];
  /** Inline stylesheet text from the application document. */
  inline: string[];
}

export interface CvPrintDocumentInput {
  /** The `<div data-cv-print>` element, serialised. */
  paperHtml: string;
  /** The document title; the browser offers it as the PDF file name. */
  title: string;
  language: string;
  direction: 'ltr' | 'rtl';
  styles: CvPrintStyles;
  /** The application's base URL, so relative asset URLs resolve in the frame. */
  baseHref?: string;
}

/** Escapes a string for use inside an HTML text node or attribute. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The print rules the export adds on top of the application's stylesheet.
 *
 * They are deliberately small. The page is A4 with no printer margin, because
 * the template's own padding IS the margin — the same padding the preview
 * showed. Colour is never dropped by the printer, and a section may flow
 * across a page boundary while an entry and a heading stay with their content.
 */
const EXPORT_CSS = `
@page { size: A4; margin: 0; }
html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; }
body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
*, *::before, *::after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
[data-cv-print] {
  width: 794px !important;
  max-width: none !important;
  /* The preview reserves A4 as a minimum height. On paper that minimum would
     print a second, empty sheet when the document is a fraction short of a
     page, so it is removed for the export. */
  min-height: 0 !important;
  margin: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  background: #ffffff !important;
}
[data-cv-print] .cv-section { break-inside: auto; page-break-inside: auto; }
[data-cv-print] .cv-section-heading { break-after: avoid; page-break-after: avoid; break-inside: avoid; }
[data-cv-print] h3 { break-after: avoid; page-break-after: avoid; }
[data-cv-print] li { break-inside: avoid; page-break-inside: avoid; }
`;

/**
 * Builds the standalone document the frame prints.
 *
 * Exported so the test suite can assert what the export is made of without a
 * browser: that it carries only the paper, the real stylesheets, A4 page rules
 * and the document's own text.
 */
export function buildCvPrintHtml(input: CvPrintDocumentInput): string {
  const links = input.styles.links
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join('\n');
  const inline = input.styles.inline
    .map((css) => `<style>${css}</style>`)
    .join('\n');

  return `<!doctype html>
<html lang="${escapeHtml(input.language)}" dir="${input.direction}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title)}</title>
${input.baseHref ? `<base href="${escapeHtml(input.baseHref)}">` : ''}
${links}
${inline}
<style>${EXPORT_CSS}</style>
</head>
<body>${input.paperHtml}</body>
</html>`;
}

/** Waits for the frame's fonts and images before printing. */
async function waitForFrameAssets(win: Window): Promise<void> {
  const doc = win.document;
  const timeout = (ms: number) =>
    new Promise<void>((resolve) => {
      win.setTimeout(resolve, ms);
    });
  const nextFrame = () =>
    new Promise<void>((resolve) => {
      const raf = (win as Window & { requestAnimationFrame?: (cb: () => void) => number })
        .requestAnimationFrame;
      if (raf) raf(() => resolve());
      else win.setTimeout(resolve, 16);
    });

  // The stylesheets are part of the document. A frame whose `load` has fired
  // has usually loaded them, but a slow network can still leave one pending;
  // printing before it lands would print the template without its styles.
  try {
    const pending = Array.from(
      doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
    ).filter((link) => !link.sheet);
    if (pending.length > 0) {
      await Promise.race([
        Promise.all(
          pending.map(
            (link) =>
              new Promise<void>((resolve) => {
                link.addEventListener('load', () => resolve(), { once: true });
                link.addEventListener('error', () => resolve(), { once: true });
              })
          )
        ),
        timeout(4000),
      ]);
    }
  } catch {
    // A browser that cannot answer is still allowed to print.
  }

  try {
    const fontSet = (doc as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    if (fontSet?.ready) {
      await Promise.race([fontSet.ready, timeout(4000)]);
    }
  } catch {
    // A browser without the Font Loading API is still allowed to print.
  }

  const images = Array.from(doc.images ?? []);
  await Promise.all(
    images.map((image) =>
      image.complete
        ? Promise.resolve()
        : Promise.race([
            new Promise<void>((resolve) => {
              image.addEventListener('load', () => resolve(), { once: true });
              image.addEventListener('error', () => resolve(), { once: true });
            }),
            timeout(4000),
          ])
    )
  );
  // Two frames let the layout settle after the fonts and images swap in.
  await nextFrame();
  await nextFrame();
}

function removeFrame(frame: HTMLIFrameElement): void {
  try {
    frame.remove();
  } catch {
    // The element may already be gone.
  }
}

/**
 * Prints one document from an off-screen frame.
 *
 * Resolves when the print dialog has been opened and the frame has been
 * cleaned up. It does not resolve to a file: the browser owns the save step,
 * because the browser is the only part of the system that can produce a PDF of
 * this quality without rasterising the page.
 */
export async function printCvFromFrame(input: CvPrintDocumentInput): Promise<void> {
  if (typeof document === 'undefined') {
    throw new Error('The PDF export needs a browser.');
  }

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('title', 'CV PDF export');
  frame.tabIndex = -1;
  // Off-screen rather than `display:none`: a display:none frame is laid out at
  // zero size and some browsers print it blank. It is fully sized and moved
  // out of view.
  frame.style.position = 'fixed';
  frame.style.left = '-10000px';
  frame.style.top = '0';
  frame.style.width = '794px';
  frame.style.height = '1123px';
  frame.style.border = '0';
  frame.style.opacity = '0';
  frame.style.pointerEvents = 'none';
  frame.srcdoc = buildCvPrintHtml(input);

  const loaded = new Promise<void>((resolve) => {
    frame.addEventListener('load', () => resolve(), { once: true });
  });

  document.body.appendChild(frame);
  await loaded;

  const win = frame.contentWindow;
  if (!win) {
    removeFrame(frame);
    throw new Error('The PDF export could not open a print frame.');
  }

  await waitForFrameAssets(win);

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    win.removeEventListener('afterprint', cleanup);
    // Give the browser a moment to take its snapshot before the frame is
    // removed. Removing it immediately cancels the print in some browsers.
    window.setTimeout(() => removeFrame(frame), 1000);
  };

  win.addEventListener('afterprint', cleanup);
  // A browser that never fires `afterprint` still gets its frame removed.
  window.setTimeout(cleanup, 60_000);

  try {
    win.focus();
    win.print();
  } catch (error) {
    cleanup();
    throw error instanceof Error
      ? error
      : new Error('The browser could not start the PDF export.');
  }
}
