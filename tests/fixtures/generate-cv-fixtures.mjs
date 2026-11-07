/**
 * Generates real PDF and DOCX CV fixtures for the CV pipeline tests.
 *
 * The PDFs use an embedded TrueType font and a two-column layout so the test
 * exercises the same class of document that broke the old hand-written parser:
 * compressed streams, embedded font programs, and text drawn out of reading
 * order. The DOCX fixtures use real OOXML packages (including a table) rather
 * than hand-assembled XML so the ZIP reader is tested against real archives.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import PDFDocument from 'pdfkit';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
} from 'docx';
import { writeLegacyDoc } from './legacyDocWriter.mjs';

let outDir = path.resolve('.tmp-qa/fixtures');

const fontCandidates = [
  'C:\\Windows\\Fonts\\arial.ttf',
  'C:\\Windows\\Fonts\\calibri.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
];
const embeddedFont = fontCandidates.find((candidate) => fs.existsSync(candidate));

function pdfToFile(fileName, draw) {
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'Sara Hassan CV' } });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  if (embeddedFont) doc.registerFont('Embedded', embeddedFont);
  draw(doc, embeddedFont ? 'Embedded' : 'Helvetica');
  doc.end();
  return done.then((buffer) => {
    fs.writeFileSync(path.join(outDir, fileName), buffer);
    return { fileName, bytes: buffer.length };
  });
}

async function twoColumnPdf() {
  return pdfToFile('modern-two-column.pdf', (doc, font) => {
    const leftX = 48;
    const rightX = 250;
    const width = 300;

    doc.font(font).fontSize(22).fillColor('#111827').text('SARA HASSAN', rightX, 44, { width });
    doc.fontSize(10).fillColor('#4b5563').text('Data Analyst', rightX, 74, { width });

    // Sidebar first, then the main column: visual reading order differs from
    // the content-stream order on purpose.
    doc.font(font).fontSize(9).fillColor('#111827').text('CONTACT', leftX, 44, { width: 170 });
    doc.fontSize(8.5).fillColor('#374151').text('sara.hassan@example.com', leftX, 60, { width: 170 });
    doc.text('+20 100 555 0142', leftX, 74, { width: 170 });
    doc.text('Cairo, Egypt', leftX, 88, { width: 170 });
    doc.text('linkedin.com/in/sarahassan', leftX, 102, { width: 170 });

    doc.font(font).fontSize(9).fillColor('#111827').text('SKILLS', leftX, 132, { width: 170 });
    doc.fontSize(8.5).fillColor('#374151').text('SQL, Python, Tableau, Power BI, Excel, A/B Testing', leftX, 148, { width: 170 });

    doc.font(font).fontSize(9).fillColor('#111827').text('LANGUAGES', leftX, 196, { width: 170 });
    doc.fontSize(8.5).fillColor('#374151').text('Arabic (Native), English (Fluent)', leftX, 212, { width: 170 });

    doc.font(font).fontSize(9).fillColor('#111827').text('PROFILE', rightX, 104, { width });
    doc.fontSize(8.5).fillColor('#374151').text(
      'Data analyst with four years of experience turning operational data into decisions. Built reporting pipelines used by product and marketing teams.',
      rightX,
      120,
      { width, lineGap: 2 }
    );

    doc.font(font).fontSize(9).fillColor('#111827').text('EXPERIENCE', rightX, 178, { width });
    doc.fontSize(8.5).fillColor('#111827').text('Senior Data Analyst — Nile Retail Group', rightX, 194, { width });
    doc.fillColor('#4b5563').text('Jan 2022 – Present | Cairo, Egypt', rightX, 206, { width });
    doc.fillColor('#374151').text('• Built a churn model that reduced monthly churn by 12%.', rightX, 220, { width });
    doc.text('• Automated weekly executive reporting in Power BI.', rightX, 232, { width });
    doc.text('• Partnered with marketing on campaign attribution.', rightX, 244, { width });

    doc.font(font).fontSize(8.5).fillColor('#111827').text('Data Analyst — Delta Logistics', rightX, 268, { width });
    doc.fillColor('#4b5563').text('Jun 2020 – Dec 2021 | Alexandria, Egypt', rightX, 280, { width });
    doc.fillColor('#374151').text('• Rebuilt the KPI dashboard in Tableau for 40+ operators.', rightX, 294, { width });
    doc.text('• Wrote SQL transformations for the daily shipment fact table.', rightX, 306, { width });

    doc.font(font).fontSize(9).fillColor('#111827').text('EDUCATION', rightX, 338, { width });
    doc.fontSize(8.5).fillColor('#374151').text('BSc Statistics — Cairo University', rightX, 354, { width });
    doc.text('2016 – 2020 | GPA 3.7/4.0', rightX, 366, { width });

    doc.font(font).fontSize(9).fillColor('#111827').text('PROJECTS', rightX, 398, { width });
    doc.fontSize(8.5).fillColor('#374151').text('Customer Churn Dashboard — Python, SQL, Power BI', rightX, 414, { width });
    doc.text('Published a dashboard and case study identifying the top three churn drivers.', rightX, 426, { width, lineGap: 2 });

    doc.font(font).fontSize(9).fillColor('#111827').text('CERTIFICATIONS', rightX, 470, { width });
    doc.fontSize(8.5).fillColor('#374151').text('Google Data Analytics Professional Certificate (2023)', rightX, 486, { width });
  });
}

async function scannedPdf() {
  return pdfToFile('scanned-image-only.pdf', (doc) => {
    const imagePath = path.resolve('public/brand/icon-512.png');
    // Cover the page with an image and draw no text at all. This is what a
    // scan looks like to an extractor: a valid PDF with no text layer.
    doc.image(imagePath, 80, 80, { width: 430 });
  });
}

function docxParagraphs() {
  const contact = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 38, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ children: [new TextRun({ text: 'CONTACT', bold: true })] }),
              new Paragraph('sara.hassan@example.com'),
              new Paragraph('+20 100 555 0142'),
              new Paragraph('Cairo, Egypt'),
              new Paragraph('linkedin.com/in/sarahassan'),
              new Paragraph(''),
              new Paragraph({ children: [new TextRun({ text: 'SKILLS', bold: true })] }),
              new Paragraph('SQL · Python · Tableau · Power BI · Excel · A/B Testing'),
            ],
          }),
          new TableCell({
            width: { size: 62, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ text: 'SARA HASSAN', heading: HeadingLevel.TITLE }),
              new Paragraph({ children: [new TextRun({ text: 'Data Analyst', bold: true })] }),
              new Paragraph(''),
              new Paragraph({ children: [new TextRun({ text: 'PROFILE', bold: true })] }),
              new Paragraph(
                'Data analyst with four years of experience turning operational data into decisions. Built reporting pipelines used by product and marketing teams.'
              ),
            ],
          }),
        ],
      }),
    ],
  });

  return [
    contact,
    new Paragraph({ children: [new TextRun({ text: 'EXPERIENCE', bold: true })] }),
    new Paragraph({ children: [new TextRun({ text: 'Senior Data Analyst — Nile Retail Group', bold: true })] }),
    new Paragraph('Jan 2022 – Present | Cairo, Egypt'),
    new Paragraph({ text: 'Built a churn model that reduced monthly churn by 12%.', bullet: { level: 0 } }),
    new Paragraph({ text: 'Automated weekly executive reporting in Power BI.', bullet: { level: 0 } }),
    new Paragraph({ text: 'Partnered with marketing on campaign attribution.', bullet: { level: 0 } }),
    new Paragraph({ children: [new TextRun({ text: 'Data Analyst — Delta Logistics', bold: true })] }),
    new Paragraph('Jun 2020 – Dec 2021 | Alexandria, Egypt'),
    new Paragraph({ text: 'Rebuilt the KPI dashboard in Tableau for 40+ operators.', bullet: { level: 0 } }),
    new Paragraph({ text: 'Wrote SQL transformations for the daily shipment fact table.', bullet: { level: 0 } }),
    new Paragraph({ children: [new TextRun({ text: 'EDUCATION', bold: true })] }),
    new Paragraph({ children: [new TextRun({ text: 'BSc Statistics — Cairo University', bold: true })] }),
    new Paragraph('2016 – 2020 | GPA 3.7/4.0'),
    new Paragraph({ children: [new TextRun({ text: 'PROJECTS', bold: true })] }),
    new Paragraph({ children: [new TextRun({ text: 'Customer Churn Dashboard — Python, SQL, Power BI', bold: true })] }),
    new Paragraph('Published a dashboard and case study identifying the top three churn drivers.'),
    new Paragraph({ children: [new TextRun({ text: 'CERTIFICATIONS', bold: true })] }),
    new Paragraph('Google Data Analytics Professional Certificate (2023)'),
  ];
}

async function normalDocx() {
  const doc = new Document({
    sections: [{ properties: {}, children: docxParagraphs() }],
  });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(outDir, 'modern-two-column.docx'), buffer);
  return { fileName: 'modern-two-column.docx', bytes: buffer.length };
}

async function ambiguousLocationDocx() {
  const children = [
    new Paragraph({ text: 'OMAR KHALED', heading: HeadingLevel.TITLE }),
    new Paragraph('Software Engineer'),
    new Paragraph('omar.khaled@example.com | +20 111 222 3344 | github.com/omarkhaled'),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'EDUCATION', bold: true })] }),
    new Paragraph('BSc Computer Science — Cairo University'),
    new Paragraph('2017 – 2021'),
    new Paragraph('Coursework included databases, algorithms and distributed systems.'),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'EXPERIENCE', bold: true })] }),
    new Paragraph({ children: [new TextRun({ text: 'Backend Engineer — Nile Retail Group', bold: true })] }),
    new Paragraph('2021 – Present'),
    new Paragraph({ text: 'Built Node.js services and PostgreSQL schemas for the Cairo fulfilment centre.', bullet: { level: 0 } }),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'SKILLS', bold: true })] }),
    new Paragraph('TypeScript · Node.js · PostgreSQL · Docker'),
  ];
  const doc = new Document({ sections: [{ properties: {}, children }] });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(outDir, 'ambiguous-location.docx'), buffer);
  return { fileName: 'ambiguous-location.docx', bytes: buffer.length };
}

async function noContactDocx() {
  const children = [
    new Paragraph({ text: 'PROFESSIONAL SUMMARY', heading: HeadingLevel.HEADING_1 }),
    new Paragraph('Operations coordinator with experience in scheduling, vendor management and process documentation.'),
    new Paragraph({ text: 'EXPERIENCE', heading: HeadingLevel.HEADING_1 }),
    new Paragraph('Operations Coordinator — Atlas Services'),
    new Paragraph('2020 – 2023'),
    new Paragraph({ text: 'Maintained the vendor register and weekly delivery schedule.', bullet: { level: 0 } }),
    new Paragraph({ text: 'EDUCATION', heading: HeadingLevel.HEADING_1 }),
    new Paragraph('BA Business Administration — Alexandria University'),
  ];
  const doc = new Document({ sections: [{ properties: {}, children }] });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(outDir, 'no-contact.docx'), buffer);
  return { fileName: 'no-contact.docx', bytes: buffer.length };
}

/**
 * An Arabic CV.
 *
 * The headings are the ones an Arabic CV really uses, not translations of
 * the English ones. A parser that only knows English headings reads this
 * document as one long undifferentiated block, which is the failure this
 * fixture exists to catch.
 */
async function arabicDocx() {
  const children = [
    new Paragraph({ text: 'سارة حسن', heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: 'محلل بيانات', bold: true })] }),
    new Paragraph('sara.hassan@example.com | +20 100 555 0142 | القاهرة، مصر'),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'الملخص المهني', bold: true })] }),
    new Paragraph(
      'محلل بيانات بخبرة أربع سنوات في تحويل البيانات التشغيلية إلى قرارات، وبناء تقارير تستخدمها فرق المنتج والتسويق.'
    ),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'الخبرة العملية', bold: true })] }),
    new Paragraph({
      children: [new TextRun({ text: 'محلل بيانات أول — مجموعة النيل للتجزئة', bold: true })],
    }),
    new Paragraph('يناير 2022 – حتى الآن | القاهرة، مصر'),
    new Paragraph({ text: 'بنيت نموذجاً للفاقد قلّل المعدل الشهري بنسبة 12%.', bullet: { level: 0 } }),
    new Paragraph({ text: 'أتمتت التقارير الأسبوعية للإدارة في Power BI.', bullet: { level: 0 } }),
    new Paragraph({ children: [new TextRun({ text: 'محلل بيانات — دلتا للخدمات اللوجستية', bold: true })] }),
    new Paragraph('يونيو 2020 – ديسمبر 2021 | الإسكندرية، مصر'),
    new Paragraph({ text: 'أعدت بناء لوحة المؤشرات في Tableau لأكثر من 40 مشغّلاً.', bullet: { level: 0 } }),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'المؤهلات العلمية', bold: true })] }),
    new Paragraph({ children: [new TextRun({ text: 'بكالوريوس الإحصاء — جامعة القاهرة', bold: true })] }),
    new Paragraph('2016 – 2020 | معدل 3.7 من 4'),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'المهارات', bold: true })] }),
    new Paragraph('SQL · Python · Tableau · Power BI · Excel · اختبار A/B'),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'اللغات', bold: true })] }),
    new Paragraph('العربية (اللغة الأم) · الإنجليزية (طلقة)'),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'الشهادات', bold: true })] }),
    new Paragraph('شهادة تحليلات البيانات من Google (2023)'),
  ];
  const doc = new Document({ sections: [{ properties: {}, children }] });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(outDir, 'arabic-cv.docx'), buffer);
  return { fileName: 'arabic-cv.docx', bytes: buffer.length };
}

/**
 * A CV written in both languages.
 *
 * Egyptian employers write in both, and the headings switch halfway
 * through. The reader has to find the Arabic sections and the English ones
 * in the same document.
 */
async function mixedLanguageDocx() {
  const children = [
    new Paragraph({ text: 'Omar Khaled', heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: 'Software Engineer', bold: true })] }),
    new Paragraph('omar.khaled@example.com | +20 111 222 3344 | Cairo, Egypt'),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'PROFESSIONAL SUMMARY', bold: true })] }),
    new Paragraph(
      'Backend engineer with six years building payment and logistics systems for the Egyptian market.'
    ),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'الخبرة العملية', bold: true })] }),
    new Paragraph({
      children: [new TextRun({ text: 'مهندس خلفية — مجموعة النيل للتجزئة', bold: true })],
    }),
    new Paragraph('2021 – Present | Cairo, Egypt'),
    new Paragraph({
      text: 'Built Node.js services and PostgreSQL schemas for the Cairo fulfilment centre.',
      bullet: { level: 0 },
    }),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'SKILLS', bold: true })] }),
    new Paragraph('TypeScript · Node.js · PostgreSQL · Docker'),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'المؤهلات العلمية', bold: true })] }),
    new Paragraph({ children: [new TextRun({ text: 'بكالوريوس علوم الحاسب — جامعة القاهرة', bold: true })] }),
    new Paragraph('2017 – 2021 | GPA 3.6/4.0'),
  ];
  const doc = new Document({ sections: [{ properties: {}, children }] });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(outDir, 'mixed-language-cv.docx'), buffer);
  return { fileName: 'mixed-language-cv.docx', bytes: buffer.length };
}

/**
 * A CV that is more than one page.
 *
 * A single-page CV never exercises the boundary between pages, and a reader
 * that loses the thread at the boundary loses a whole section.
 */
async function multiPagePdf() {
  return pdfToFile('multi-page.pdf', (doc, font) => {
    const width = 500;
    doc.font(font).fontSize(20).fillColor('#111827').text('SARA HASSAN', 48, 44, { width });
    doc.fontSize(10).fillColor('#4b5563').text('Data Analyst', 48, 72, { width });
    doc.fontSize(9).fillColor('#111827').text('sara.hassan@example.com | +20 100 555 0142 | Cairo, Egypt', 48, 88, { width });
    doc.fontSize(9).fillColor('#111827').text('PROFILE', 48, 110, { width });
    doc.fontSize(8.5).fillColor('#374151').text(
      'Data analyst with four years of experience turning operational data into decisions.',
      48,
      124,
      { width, lineGap: 2 }
    );
    doc.fontSize(9).fillColor('#111827').text('EXPERIENCE', 48, 170, { width });
    doc.fontSize(8.5).fillColor('#111827').text('Senior Data Analyst — Nile Retail Group', 48, 186, { width });
    doc.fillColor('#4b5563').text('Jan 2022 – Present | Cairo, Egypt', 48, 198, { width });
    doc.fillColor('#374151').text('• Built a churn model that reduced monthly churn by 12%.', 48, 212, { width });

    doc.addPage();
    doc.font(font).fontSize(9).fillColor('#111827').text('EDUCATION', 48, 44, { width });
    doc.fontSize(8.5).fillColor('#111827').text('BSc Statistics — Cairo University', 48, 60, { width });
    doc.fillColor('#4b5563').text('2016 – 2020 | GPA 3.7/4.0', 48, 72, { width });
    doc.fontSize(9).fillColor('#111827').text('PROJECTS', 48, 104, { width });
    doc.fontSize(8.5).fillColor('#111827').text('Customer Churn Dashboard — Python, SQL, Power BI', 48, 120, { width });
    doc.fillColor('#374151').text('Published a dashboard and case study on churn drivers.', 48, 132, { width });
    doc.fontSize(9).fillColor('#111827').text('CERTIFICATIONS', 48, 164, { width });
    doc.fontSize(8.5).fillColor('#374151').text('Google Data Analytics Professional Certificate (2023)', 48, 180, { width });
  });
}

/**
 * A CV whose whole body is a table.
 *
 * Tables are how a lot of CVs are actually written, and a reader that only
 * looks at paragraphs reads a table as one long line.
 */
async function tableLayoutDocx() {
  const heading = (text) => new Paragraph({ children: [new TextRun({ text, bold: true })] });
  const rows = [
    new TableRow({
      children: [
        new TableCell({
          width: { size: 30, type: WidthType.PERCENTAGE },
          children: [
            heading('Period'),
            new Paragraph('Jan 2022 – Present'),
            new Paragraph('Jun 2020 – Dec 2021'),
          ],
        }),
        new TableCell({
          width: { size: 34, type: WidthType.PERCENTAGE },
          children: [
            heading('Role'),
            new Paragraph('Senior Data Analyst'),
            new Paragraph('Data Analyst'),
          ],
        }),
        new TableCell({
          width: { size: 36, type: WidthType.PERCENTAGE },
          children: [
            heading('Company'),
            new Paragraph('Nile Retail Group'),
            new Paragraph('Delta Logistics'),
          ],
        }),
      ],
    }),
  ];

  const children = [
    new Paragraph({ text: 'SARA HASSAN', heading: HeadingLevel.TITLE }),
    new Paragraph('Data Analyst | sara.hassan@example.com | Cairo, Egypt'),
    new Paragraph(''),
    heading('EXPERIENCE'),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
    }),
    new Paragraph(''),
    heading('SKILLS'),
    new Paragraph('SQL, Python, Tableau, Power BI, Excel'),
  ];
  const doc = new Document({ sections: [{ properties: {}, children }] });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(outDir, 'table-layout-cv.docx'), buffer);
  return { fileName: 'table-layout-cv.docx', bytes: buffer.length };
}

/**
 * The awkward cases, in one document.
 *
 * Two roles at the same company, two roles that overlap in time, a role
 * with no dates at all, and the sections a CV is expected to carry beyond
 * work and study: internships, courses, languages, awards and publications.
 */
async function edgeCaseDocx() {
  const children = [
    new Paragraph({ text: 'NOUR ALI', heading: HeadingLevel.TITLE }),
    new Paragraph('Business Analyst | nour.ali@example.com | +20 122 333 4455 | Alexandria, Egypt'),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'PROFESSIONAL SUMMARY', bold: true })] }),
    new Paragraph('Business analyst with three years in retail operations and pricing analysis.'),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'EXPERIENCE', bold: true })] }),
    new Paragraph({ children: [new TextRun({ text: 'Business Analyst — Delta Logistics', bold: true })] }),
    new Paragraph('Jan 2021 – Present | Alexandria, Egypt'),
    new Paragraph({ text: 'Rebuilt the pricing model for 120 stores.', bullet: { level: 0 } }),
    new Paragraph({ children: [new TextRun({ text: 'Business Analyst — Delta Logistics', bold: true })] }),
    new Paragraph('Jun 2020 – Dec 2020 | Alexandria, Egypt'),
    new Paragraph({ text: 'Supported the pricing team through the peak season.', bullet: { level: 0 } }),
    new Paragraph({ children: [new TextRun({ text: 'Operations Coordinator', bold: true })] }),
    new Paragraph('Cairo, Egypt'),
    new Paragraph({ text: 'Maintained the vendor register.', bullet: { level: 0 } }),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'INTERNSHIPS', bold: true })] }),
    new Paragraph({ children: [new TextRun({ text: 'Marketing Intern — Nile Retail Group', bold: true })] }),
    new Paragraph('Summer 2019 | Cairo, Egypt'),
    new Paragraph({ text: 'Ran the summer campaign report.', bullet: { level: 0 } }),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'EDUCATION', bold: true })] }),
    new Paragraph({ children: [new TextRun({ text: 'BA Business Administration — Alexandria University', bold: true })] }),
    new Paragraph('2016 – 2020 | GPA 3.4/4.0'),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'PROJECTS', bold: true })] }),
    new Paragraph({ children: [new TextRun({ text: 'Retail Pricing Study — Python, SQL', bold: true })] }),
    new Paragraph('Modelled price elasticity across three categories.'),
    new Paragraph({ children: [new TextRun({ text: 'Inventory Dashboard — Excel, Power BI', bold: true })] }),
    new Paragraph('Tracked stock cover for the whole catalogue.'),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'SKILLS', bold: true })] }),
    new Paragraph('Excel, SQL, Python, Power BI, Pricing'),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'CERTIFICATIONS', bold: true })] }),
    new Paragraph('Microsoft Excel Specialist (2022)'),
    new Paragraph('Google Data Analytics Certificate (2023)'),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'COURSES', bold: true })] }),
    new Paragraph('Financial Modelling — Coursera'),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'LANGUAGES', bold: true })] }),
    new Paragraph('Arabic (Native) · English (Fluent) · French (Basic)'),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'AWARDS', bold: true })] }),
    new Paragraph('Top Graduate Award — Alexandria University (2020)'),
    new Paragraph(''),
    new Paragraph({ children: [new TextRun({ text: 'PUBLICATIONS', bold: true })] }),
    new Paragraph('Pricing elasticity in Egyptian retail — Journal of Applied Operations (2022)'),
  ];
  const doc = new Document({ sections: [{ properties: {}, children }] });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(outDir, 'edge-cases-cv.docx'), buffer);
  return { fileName: 'edge-cases-cv.docx', bytes: buffer.length };
}

/**
 * A legacy Word document.
 *
 * The reader for these has to open a compound file and follow a piece table,
 * so the fixture has to be one. The writer produces a real file.
 */
async function legacyDoc() {
  const buffer = writeLegacyDoc([
    'SARA HASSAN',
    'Data Analyst',
    'sara.hassan@example.com',
    '+20 100 555 0142',
    'Cairo, Egypt',
    'PROFILE',
    'Data analyst with four years of experience turning operational data into decisions.',
    'EXPERIENCE',
    'Senior Data Analyst — Nile Retail Group',
    'Jan 2022 – Present | Cairo, Egypt',
    'Built a churn model that reduced monthly churn by 12%.',
    'Data Analyst — Delta Logistics',
    'Jun 2020 – Dec 2021 | Alexandria, Egypt',
    'Rebuilt the KPI dashboard in Tableau for 40+ operators.',
    'EDUCATION',
    'BSc Statistics — Cairo University',
    '2016 – 2020 | GPA 3.7/4.0',
    'SKILLS',
    'SQL, Python, Tableau, Power BI, Excel',
    'CERTIFICATIONS',
    'Google Data Analytics Professional Certificate (2023)',
  ]);
  fs.writeFileSync(path.join(outDir, 'legacy-word.doc'), buffer);
  return { fileName: 'legacy-word.doc', bytes: buffer.length };
}

/**
 * Writes every fixture into `destination` (created if needed) and returns the
 * files that were produced. Exported so the automated test can generate real
 * documents on a clean checkout instead of depending on committed binaries.
 */
export async function generateCvFixtures(destination = path.resolve('.tmp-qa/fixtures')) {
  outDir = destination;
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  results.push(await twoColumnPdf());
  results.push(await scannedPdf());
  results.push(await normalDocx());
  results.push(await ambiguousLocationDocx());
  results.push(await noContactDocx());
  results.push(await arabicDocx());
  results.push(await mixedLanguageDocx());
  results.push(await multiPagePdf());
  results.push(await tableLayoutDocx());
  results.push(await edgeCaseDocx());
  results.push(await legacyDoc());
  return { outDir, embeddedFont, results };
}

const invokedDirectly =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const result = await generateCvFixtures();
  console.log(JSON.stringify(result, null, 2));
}
