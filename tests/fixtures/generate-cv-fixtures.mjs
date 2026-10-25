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
  return { outDir, embeddedFont, results };
}

const invokedDirectly =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const result = await generateCvFixtures();
  console.log(JSON.stringify(result, null, 2));
}
