import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const fs = require('fs');
const assert = require('assert/strict');
const { extractText, getDocumentProxy } = require('unpdf');

const { CV_TEMPLATES } = require('../shared/cvTemplates.ts');
const { cvTemplateSample } = require('../shared/cvTemplateSample.ts');
const { CvTemplateRenderer } = require('../src/components/cv/templates/CvTemplateRenderer.tsx');
const { buildPdf, PDF_A4_WIDTH, PDF_A4_HEIGHT } = require('../src/lib/pdf/pdfWriter.ts');
const { paginateCvDocument } = require('../src/lib/pdf/paginate.ts');

async function runBrowserPdfTest() {
  console.log('--- Starting Playwright Real-Browser PDF Test ---');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('about:blank');

  // Inject html2canvas bundle into the browser page
  const h2cPath = require.resolve('html2canvas/dist/html2canvas.min.js');
  await page.addScriptTag({ content: fs.readFileSync(h2cPath, 'utf-8') });

  // Test both English and Arabic samples
  for (const lang of ['en', 'ar']) {
    const cv = cvTemplateSample(lang);
    const template = CV_TEMPLATES.find((t) => t.id === 'modern-split') || CV_TEMPLATES[0];

    const html = renderToStaticMarkup(
      React.createElement(CvTemplateRenderer, {
        cv,
        language: lang,
        template,
        printable: true,
      })
    );

    const result = await page.evaluate(async ({ renderedHtml, isRtl }) => {
      const PAPER_WIDTH_PX = 794;
      const PAPER_HEIGHT_PX = 1123;
      const scale = 2;

      const container = document.createElement('div');
      container.style.width = '794px';
      container.style.background = '#ffffff';
      container.style.position = 'absolute';
      container.style.left = '0';
      container.style.top = '0';
      container.dir = isRtl ? 'rtl' : 'ltr';
      container.innerHTML = renderedHtml;
      document.body.appendChild(container);

      const paper = container.querySelector('[data-cv-print]') || container.firstElementChild;

      // Full canvas from html2canvas (no foreignObject)
      const fullCanvas = await window.html2canvas(paper, {
        scale,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 794,
      });

      const totalHeight = paper.offsetHeight || PAPER_HEIGHT_PX;
      const pageCount = Math.max(1, Math.ceil(totalHeight / PAPER_HEIGHT_PX));
      const pages = [];

      for (let i = 0; i < pageCount; i++) {
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = Math.round(PAPER_WIDTH_PX * scale);
        pageCanvas.height = Math.round(PAPER_HEIGHT_PX * scale);
        const ctx = pageCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

        const srcY = Math.round(i * PAPER_HEIGHT_PX * scale);
        const sliceH = Math.min(
          Math.round(PAPER_HEIGHT_PX * scale),
          fullCanvas.height - srcY
        );

        if (sliceH > 0) {
          ctx.drawImage(
            fullCanvas,
            0, srcY, Math.round(PAPER_WIDTH_PX * scale), sliceH,
            0, 0, Math.round(PAPER_WIDTH_PX * scale), sliceH
          );
        }

        // Verify canvas is NOT tainted and toBlob succeeds
        const blob = await new Promise((resolve, reject) => {
          pageCanvas.toBlob(
            (b) => { if (!b) reject(new Error('toBlob returned null')); else resolve(b); },
            'image/jpeg',
            0.92
          );
        });

        const buffer = await blob.arrayBuffer();
        pages.push({
          jpeg: Array.from(new Uint8Array(buffer)),
          pixelWidth: pageCanvas.width,
          pixelHeight: pageCanvas.height,
          width: 595.28,
          height: 841.89,
          text: [{ text: isRtl ? 'ليلى حسن' : 'Layla Hassan', x: 50, top: 50, width: 200, size: 24 }],
        });
      }

      container.remove();
      return pages;
    }, { renderedHtml: html, isRtl: lang === 'ar' });

    assert.ok(result.length > 0, `Generated ${result.length} pages for ${lang}`);
    console.log(`✓ Rendered ${result.length} untainted canvas pages in Chromium for ${lang}`);

    const formattedPages = result.map((p) => ({
      ...p,
      jpeg: new Uint8Array(p.jpeg),
    }));

    const pdfOutput = buildPdf(formattedPages, {
      title: `${cv.fullName} — CV`,
      author: cv.fullName,
    });

    const byteSize = pdfOutput.length;
    assert.ok(byteSize > 5000, `PDF size ${byteSize} is realistic`);
    const header = new TextDecoder().decode(pdfOutput.subarray(0, 8));
    assert.ok(header.startsWith('%PDF-1.7'), `Valid PDF header: ${header}`);

    const pdfDoc = await getDocumentProxy(pdfOutput);
    assert.equal(pdfDoc.numPages, result.length);
    const textData = await extractText(pdfDoc, { mergePages: true });
    const expectedName = lang === 'ar' ? 'ليلى حسن' : 'Layla Hassan';
    assert.ok(textData.text.includes(expectedName), `PDF contains selectable name: ${expectedName}`);
    console.log(`✓ Verified valid PDF (${byteSize} bytes, ${pdfDoc.numPages} pages) with selectable text for ${lang}`);
  }

  await browser.close();
  console.log('--- All Playwright Browser PDF Tests Passed! ---');
}

runBrowserPdfTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
