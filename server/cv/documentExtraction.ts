/**
 * Document extraction for the CV import pipeline.
 *
 * The old pipeline hand-parsed PDF content streams and DOCX XML with regular
 * expressions. That approach failed on real documents: compressed/embedded
 * fonts produced no text, two-column layouts were read in content-stream order
 * (sidebar before the candidate's name), and DOCX entities were never decoded.
 *
 * This module is the deterministic first stage of the staged pipeline:
 *
 *   file bytes -> format-specific extraction -> positioned text blocks
 *
 * PDF text is read with PDF.js (through unpdf), which understands embedded
 * fonts and returns positioned text items. Lines are rebuilt from their real
 * coordinates. When a page has more than one column, the column with the most
 * content is emitted first so the candidate's name and main history precede the
 * sidebar; this preserves semantic reading order for two-column CVs.
 *
 * DOCX text is read from the real OOXML ZIP package (fflate), decoding XML
 * entities, tabs, line breaks, list markers, headings and tables. A layout
 * table (the common sidebar/main CV table) is emitted cell-by-cell with the
 * main cell first instead of being flattened into one unparseable line.
 *
 * A scanned/image-only PDF is detected explicitly. OCR is NOT implemented, and
 * the result says so instead of pretending the document was unreadable for an
 * unrelated reason.
 */
import { extractTextItems, type StructuredTextItem } from 'unpdf';
import { strFromU8, unzipSync } from 'fflate';

export type DocumentFormat = 'pdf' | 'docx' | 'txt' | 'json';
export type DocumentLayout = 'single-column' | 'two-column' | 'multi-column';
export type DocumentStatus = 'ok' | 'scanned' | 'empty' | 'unsupported';

export interface DocumentBlock {
  text: string;
  page: number;
  /** Horizontal position in PDF points (0 for text formats). */
  x: number;
  /** Vertical position in PDF points, origin bottom-left (0 for text formats). */
  y: number;
  width: number;
  fontSize: number;
  /** True when the block looks like a heading (size or style). */
  heading: boolean;
  source: 'text' | 'table' | 'heading';
}

export interface DocumentExtraction {
  format: DocumentFormat;
  status: DocumentStatus;
  text: string;
  blocks: DocumentBlock[];
  pageCount: number;
  characterCount: number;
  wordCount: number;
  layout: DocumentLayout;
  /** True only when the document is a PDF with no usable text layer. */
  isScanned: boolean;
  warnings: string[];
  errorMessage?: string;
}

export interface DocumentQualityAssessment {
  isAcceptable: boolean;
  isScannedPdf: boolean;
  quality: 'high' | 'medium' | 'low' | 'failed';
  errorMessage?: string;
}

const PDF_SCANNED_MESSAGE =
  'This PDF appears to be a scanned or image-only document with no text layer. ' +
  'OCR is not supported for scanned PDFs. Please upload a text-based PDF or ' +
  'DOCX, or paste your CV text.';

const PDF_UNREADABLE_MESSAGE =
  'The PDF could not be read. It may be encrypted, password-protected or ' +
  'corrupted. Please upload an unprotected text-based PDF or DOCX.';

const DOCX_UNREADABLE_MESSAGE =
  'The DOCX file could not be read. It may be corrupted or password-protected. ' +
  'Please export a fresh .docx from Word, Google Docs or LibreOffice and try again.';

const EMPTY_DOCUMENT_MESSAGE =
  'The document contains no readable text. Please upload a text-based PDF or ' +
  'DOCX, or paste your CV text.';

const MIN_READABLE_CHARACTERS = 50;

/* -------------------------------------------------------------------------- */
/* Text helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Normalises line endings and removes control characters that PostgreSQL, the
 * UI and the parser should never see, while keeping meaningful newlines.
 */
export function normalizeDocumentText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function wordCount(text: string): number {
  const matches = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu);
  return matches?.length ?? 0;
}

function countReadableCharacters(text: string): number {
  return text.replace(/\s/g, '').length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/* -------------------------------------------------------------------------- */
/* PDF                                                                        */
/* -------------------------------------------------------------------------- */

interface PdfLine {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

interface PdfColumn {
  minX: number;
  maxRight: number;
  characterCount: number;
  items: StructuredTextItem[];
}

function clusterColumns(items: StructuredTextItem[]): PdfColumn[] {
  const positioned = items
    .filter((item) => item.str.trim().length > 0)
    .sort((a, b) => a.x - b.x);

  if (positioned.length === 0) return [];

  // Text in one column shares (approximately) the same left edge. A genuine
  // gutter is at least 24pt wide in every CV layout we have seen; a smaller
  // gap is indentation (a bullet or a hanging line), not a new column.
  const groups: StructuredTextItem[][] = [];
  let current: StructuredTextItem[] = [];
  let lastX = positioned[0].x;
  for (const item of positioned) {
    if (current.length > 0 && item.x - lastX > 24) {
      groups.push(current);
      current = [];
    }
    current.push(item);
    lastX = item.x;
  }
  if (current.length > 0) groups.push(current);

  const columns = groups
    .map((group) => {
      const characterCount = group.reduce(
        (total, item) => total + item.str.replace(/\s/g, '').length,
        0
      );
      return {
        minX: Math.min(...group.map((item) => item.x)),
        maxRight: Math.max(...group.map((item) => item.x + item.width)),
        characterCount,
        items: group,
      };
    })
    .filter((column) => column.characterCount > 0);

  // Merge tiny fragments caused by a single indented run (for example a
  // page number or a right-aligned date) into the nearest real column.
  const substantial = columns.filter((column) => column.characterCount >= 12);
  if (substantial.length <= 1) {
    return [
      {
        minX: Math.min(...positioned.map((item) => item.x)),
        maxRight: Math.max(...positioned.map((item) => item.x + item.width)),
        characterCount: positioned.reduce(
          (total, item) => total + item.str.replace(/\s/g, '').length,
          0
        ),
        items: positioned,
      },
    ];
  }
  return columns;
}

function groupItemsIntoLines(items: StructuredTextItem[]): PdfLine[] {
  const sorted = [...items]
    .filter((item) => item.str.trim().length > 0)
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: Array<{ y: number; items: StructuredTextItem[] }> = [];
  for (const item of sorted) {
    const tolerance = Math.max(2, Math.min(6, item.fontSize * 0.35));
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - item.y) <= tolerance) {
      last.items.push(item);
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }

  return lines.map((line) => {
    const ordered = [...line.items].sort((a, b) => a.x - b.x);
    let text = '';
    let previous: StructuredTextItem | null = null;
    for (const item of ordered) {
      if (previous) {
        const gap = item.x - (previous.x + previous.width);
        const needsSpace =
          gap > Math.max(1, Math.min(previous.fontSize, item.fontSize) * 0.15) &&
          !/\s$/.test(text) &&
          !/^\s/.test(item.str);
        if (needsSpace) text += ' ';
      }
      text += item.str;
      previous = item;
    }
    return {
      text: text.replace(/\s+/g, ' ').trim(),
      x: ordered[0]?.x ?? 0,
      y: line.y,
      width:
        (ordered[ordered.length - 1]?.x ?? 0) +
        (ordered[ordered.length - 1]?.width ?? 0) -
        (ordered[0]?.x ?? 0),
      fontSize: median(ordered.map((item) => item.fontSize)) || 10,
    };
  });
}

async function extractPdf(buffer: Uint8Array): Promise<DocumentExtraction> {
  let totalPages = 0;
  let pageItems: StructuredTextItem[][] = [];
  try {
    // A plain Buffer can fail structured cloning inside PDF.js. Copying the
    // bytes into a plain Uint8Array is the supported input shape.
    const result = await extractTextItems(Uint8Array.from(buffer));
    totalPages = result.totalPages;
    pageItems = result.items;
  } catch (error) {
    console.warn('[cv-extraction] PDF could not be parsed:', error);
    return {
      format: 'pdf',
      status: 'unsupported',
      text: '',
      blocks: [],
      pageCount: 0,
      characterCount: 0,
      wordCount: 0,
      layout: 'single-column',
      isScanned: false,
      warnings: [],
      errorMessage: PDF_UNREADABLE_MESSAGE,
    };
  }

  const pageBlocks: DocumentBlock[] = [];
  let layout: DocumentLayout = 'single-column';

  for (let pageIndex = 0; pageIndex < pageItems.length; pageIndex += 1) {
    const items = pageItems[pageIndex] ?? [];
    const columns = clusterColumns(items);

    // A page with two substantial, spatially separate columns is a two-column
    // layout. The main column is the one carrying most of the text; emitting
    // it first is what puts the candidate's name before the sidebar.
    const substantialColumns = columns.filter((column) => column.characterCount >= 30);
    const hasColumns = substantialColumns.length >= 2;
    if (hasColumns) {
      layout = substantialColumns.length > 2 ? 'multi-column' : 'two-column';
    }

    const orderedColumns = hasColumns
      ? [...columns].sort((a, b) => b.characterCount - a.characterCount || a.minX - b.minX)
      : columns;

    for (const column of orderedColumns) {
      const lines = groupItemsIntoLines(column.items);
      const pageMedianFont = median(lines.map((line) => line.fontSize)) || 10;
      for (const line of lines) {
        if (!line.text) continue;
        pageBlocks.push({
          text: line.text,
          page: pageIndex + 1,
          x: line.x,
          y: line.y,
          width: line.width,
          fontSize: line.fontSize,
          heading: line.fontSize >= pageMedianFont * 1.18,
          source: 'text',
        });
      }
    }
  }

  // Reading order across pages: page by page, and within a page the column
  // order chosen above. groupItemsIntoLines already returned top-to-bottom.
  const text = normalizeDocumentText(pageBlocks.map((block) => block.text).join('\n'));
  const readable = countReadableCharacters(text);

  if (readable < 20) {
    return {
      format: 'pdf',
      status: 'scanned',
      text,
      blocks: pageBlocks,
      pageCount: totalPages,
      characterCount: readable,
      wordCount: wordCount(text),
      layout: 'single-column',
      isScanned: true,
      warnings: ['No text layer was found on any page; the PDF is image-only.'],
      errorMessage: PDF_SCANNED_MESSAGE,
    };
  }

  return {
    format: 'pdf',
    status: readable < 50 ? 'empty' : 'ok',
    text,
    blocks: pageBlocks,
    pageCount: totalPages,
    characterCount: readable,
    wordCount: wordCount(text),
    layout,
    isScanned: false,
    warnings: readable < 50 ? ['The PDF text layer is very short.'] : [],
    errorMessage: readable < 50 ? EMPTY_DOCUMENT_MESSAGE : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* DOCX                                                                       */
/* -------------------------------------------------------------------------- */

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return XML_ENTITIES[entity] ?? match;
  });
}

function docxParagraphText(paragraphXml: string): string {
  const withoutDeleted = paragraphXml
    .replace(/<w:del\b[\s\S]*?<\/w:del>/g, '')
    .replace(/<w:moveFrom\b[\s\S]*?<\/w:moveFrom>/g, '');

  const withBreaks = withoutDeleted
    .replace(/<w:tab\b[^>]*\/?>/g, '\t')
    .replace(/<w:br\b[^>]*\/?>/g, '\n')
    .replace(/<w:cr\b[^>]*\/?>/g, '\n');

  const pieces: string[] = [];
  const textRegex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:(tab|br|cr)\b[^>]*\/?>/g;
  let match: RegExpExecArray | null;
  while ((match = textRegex.exec(withBreaks)) !== null) {
    if (match[1] !== undefined) {
      pieces.push(decodeXmlEntities(match[1]));
    } else if (match[2] === 'tab') {
      pieces.push('\t');
    } else {
      pieces.push('\n');
    }
  }
  return pieces.join('').replace(/\u00A0/g, ' ');
}

function isHeadingParagraph(paragraphXml: string, text: string): boolean {
  const style = paragraphXml.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/i)?.[1] ?? '';
  if (/heading|title|subtitle/i.test(style)) return true;
  return false;
}

function isListParagraph(paragraphXml: string): boolean {
  return /<w:numPr\b[^>]*>/i.test(paragraphXml);
}

interface DocxTableResult {
  blocks: DocumentBlock[];
  isLayout: boolean;
}

function parseDocxTable(tableXml: string, page: number): DocxTableResult {
  const tableBlocks: DocumentBlock[] = [];
  const rowRegex = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/gi;
  let rowMatch: RegExpExecArray | null;
  let layoutSignals = 0;

  while ((rowMatch = rowRegex.exec(tableXml)) !== null) {
    const rowXml = rowMatch[1];
    const cellRegex = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/gi;
    const cells: Array<{ paragraphs: string[]; text: string; characterCount: number }> = [];
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowXml)) !== null) {
      const cellXml = cellMatch[1];
      const paragraphRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/gi;
      const paragraphs: string[] = [];
      let paragraphMatch: RegExpExecArray | null;
      while ((paragraphMatch = paragraphRegex.exec(cellXml)) !== null) {
        const text = docxParagraphText(paragraphMatch[0]).replace(/\s+/g, ' ').trim();
        if (text) paragraphs.push(text);
      }
      const text = paragraphs.join('\n');
      if (
        paragraphs.length >= 2 ||
        paragraphs.some((paragraph) =>
          /^(contact|profile|summary|skills|languages|experience|education)\b/i.test(paragraph)
        )
      ) {
        layoutSignals += 1;
      }
      cells.push({ paragraphs, text, characterCount: text.replace(/\s/g, '').length });
    }

    // A layout table (CV sidebar/main) has several paragraphs per cell and a
    // section heading in a cell. Emitting the richest cell first preserves the
    // candidate's name and main history; flattening the row into
    // "CONTACT | SARA HASSAN" is what broke the old parser.
    const isLayout = cells.length >= 2 && cells.length <= 3 && layoutSignals >= 1;
    if (isLayout) {
      const ordered = [...cells].sort(
        (a, b) => b.characterCount - a.characterCount
      );
      for (const cell of ordered) {
        for (const paragraph of cell.paragraphs) {
          tableBlocks.push({
            text: paragraph,
            page,
            x: 0,
            y: 0,
            width: 0,
            fontSize: 0,
            heading: false,
            source: 'table',
          });
        }
      }
    } else if (cells.length > 0) {
      const line = cells
        .map((cell) => cell.text.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join(' | ');
      if (line) {
        tableBlocks.push({
          text: line,
          page,
          x: 0,
          y: 0,
          width: 0,
          fontSize: 0,
          heading: false,
          source: 'table',
        });
      }
    }
  }

  return {
    blocks: tableBlocks,
    isLayout: layoutSignals > 0 && tableBlocks.length > 0,
  };
}

function parseDocxXml(
  documentXml: string,
  page: number
): { blocks: DocumentBlock[]; hasLayoutTable: boolean } {
  const blocks: DocumentBlock[] = [];
  // Paragraphs and tables must be visited in document order. Matching them
  // together (rather than replacing tables first) preserves the position of
  // the contact sidebar relative to the main column.
  const tokenRegex = /<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/gi;
  let token: RegExpExecArray | null;
  let hasLayoutTable = false;

  while ((token = tokenRegex.exec(documentXml)) !== null) {
    const fragment = token[0];
    if (/^<w:tbl\b/i.test(fragment)) {
      const table = parseDocxTable(fragment, page);
      blocks.push(...table.blocks);
      hasLayoutTable = hasLayoutTable || table.isLayout;
      continue;
    }

    const text = docxParagraphText(fragment).replace(/\s+$/g, '');
    if (!text.trim()) continue;
    const list = isListParagraph(fragment);
    const heading = isHeadingParagraph(fragment, text);
    const output = list && !/^[•\-*]\s/.test(text.trim()) ? `• ${text.trim()}` : text.trim();
    blocks.push({
      text: output,
      page,
      x: 0,
      y: 0,
      width: 0,
      fontSize: 0,
      heading,
      source: heading ? 'heading' : 'text',
    });
  }

  return { blocks, hasLayoutTable };
}

function parseDocx(buffer: Uint8Array): DocumentExtraction {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(Uint8Array.from(buffer));
  } catch (error) {
    console.warn('[cv-extraction] DOCX ZIP could not be opened:', error);
    return {
      format: 'docx',
      status: 'unsupported',
      text: '',
      blocks: [],
      pageCount: 0,
      characterCount: 0,
      wordCount: 0,
      layout: 'single-column',
      isScanned: false,
      warnings: [],
      errorMessage: DOCX_UNREADABLE_MESSAGE,
    };
  }

  const documentEntry = files['word/document.xml'];
  if (!documentEntry) {
    return {
      format: 'docx',
      status: 'unsupported',
      text: '',
      blocks: [],
      pageCount: 0,
      characterCount: 0,
      wordCount: 0,
      layout: 'single-column',
      isScanned: false,
      warnings: [],
      errorMessage: DOCX_UNREADABLE_MESSAGE,
    };
  }

  const blocks: DocumentBlock[] = [];

  // Header text is where candidates often put contact details. Include it
  // before the body so the contact extractor sees it in the header region.
  for (const name of Object.keys(files).sort()) {
    if (!/^word\/header\d*\.xml$/i.test(name)) continue;
    const { blocks: headerBlocks } = parseDocxXml(strFromU8(files[name]), 0);
    blocks.push(...headerBlocks);
  }

  const { blocks: bodyBlocks, hasLayoutTable } = parseDocxXml(
    strFromU8(documentEntry),
    1
  );
  blocks.push(...bodyBlocks);

  const text = normalizeDocumentText(blocks.map((block) => block.text).join('\n'));
  const readable = countReadableCharacters(text);

  return {
    format: 'docx',
    status: readable < MIN_READABLE_CHARACTERS ? 'empty' : 'ok',
    text,
    blocks,
    pageCount: 1,
    characterCount: readable,
    wordCount: wordCount(text),
    layout: hasLayoutTable ? 'two-column' : 'single-column',
    isScanned: false,
    warnings:
      readable < MIN_READABLE_CHARACTERS
        ? ['The DOCX contains no usable text after extraction.']
        : [],
    errorMessage:
      readable < MIN_READABLE_CHARACTERS ? EMPTY_DOCUMENT_MESSAGE : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* TXT / JSON                                                                 */
/* -------------------------------------------------------------------------- */

function jsonCvToText(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const cv = value as Record<string, unknown>;
  const lines: string[] = [];
  const push = (line: unknown) => {
    if (typeof line === 'string' && line.trim()) lines.push(line.trim());
  };

  push(cv.fullName);
  push(cv.title);
  for (const key of ['email', 'phone', 'location', 'linkedin', 'github', 'website']) {
    push(cv[key]);
  }
  if (typeof cv.summary === 'string' && cv.summary.trim()) {
    lines.push('SUMMARY');
    lines.push(cv.summary.trim());
  }

  if (Array.isArray(cv.experiences) && cv.experiences.length > 0) {
    lines.push('EXPERIENCE');
    for (const entry of cv.experiences) {
      if (typeof entry !== 'object' || entry === null) continue;
      const experience = entry as Record<string, unknown>;
      const role = typeof experience.role === 'string' ? experience.role.trim() : '';
      const company = typeof experience.company === 'string' ? experience.company.trim() : '';
      if (role || company) lines.push([role, company].filter(Boolean).join(' — '));
      const period = typeof experience.period === 'string' ? experience.period.trim() : '';
      const location = typeof experience.location === 'string' ? experience.location.trim() : '';
      if (period || location) lines.push([period, location].filter(Boolean).join(' | '));
      if (Array.isArray(experience.bullets)) {
        for (const bullet of experience.bullets) {
          if (typeof bullet === 'string' && bullet.trim()) lines.push(`• ${bullet.trim()}`);
        }
      }
    }
  }

  if (Array.isArray(cv.education) && cv.education.length > 0) {
    lines.push('EDUCATION');
    for (const entry of cv.education) {
      if (typeof entry !== 'object' || entry === null) continue;
      const education = entry as Record<string, unknown>;
      const degree = typeof education.degree === 'string' ? education.degree.trim() : '';
      const field = typeof education.field === 'string' ? education.field.trim() : '';
      const institution =
        typeof education.institution === 'string' ? education.institution.trim() : '';
      const degreeText = [degree, field && !degree.toLowerCase().includes(field.toLowerCase()) ? field : '']
        .filter(Boolean)
        .join(' ');
      if (degreeText || institution) lines.push([degreeText, institution].filter(Boolean).join(' — '));
      const period = typeof education.period === 'string' ? education.period.trim() : '';
      const gpa = typeof education.gpa === 'string' ? education.gpa.trim() : '';
      if (period || gpa) lines.push([period, gpa ? `GPA ${gpa}` : ''].filter(Boolean).join(' | '));
    }
  }

  if (Array.isArray(cv.projects) && cv.projects.length > 0) {
    lines.push('PROJECTS');
    for (const entry of cv.projects) {
      if (typeof entry !== 'object' || entry === null) continue;
      const project = entry as Record<string, unknown>;
      const title = typeof project.title === 'string' ? project.title.trim() : '';
      const technologies = Array.isArray(project.technologies)
        ? project.technologies.filter((technology) => typeof technology === 'string')
        : [];
      if (title) lines.push([title, technologies.join(', ')].filter(Boolean).join(' — '));
      if (Array.isArray(project.bullets)) {
        for (const bullet of project.bullets) {
          if (typeof bullet === 'string' && bullet.trim()) lines.push(`• ${bullet.trim()}`);
        }
      }
    }
  }

  const skills = Array.isArray(cv.skillsList)
    ? cv.skillsList.filter((skill): skill is string => typeof skill === 'string')
    : [];
  if (skills.length > 0) {
    lines.push('SKILLS');
    lines.push(skills.join(', '));
  }

  const certifications = Array.isArray(cv.certifications)
    ? cv.certifications.filter((certification): certification is string => typeof certification === 'string')
    : [];
  if (certifications.length > 0) {
    lines.push('CERTIFICATIONS');
    for (const certification of certifications) lines.push(certification);
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

function extractPlainText(buffer: Uint8Array, format: 'txt' | 'json'): DocumentExtraction {
  const raw = strFromU8(buffer).replace(/^\uFEFF/, '');
  let text = raw;
  if (format === 'json') {
    try {
      const parsed = JSON.parse(raw);
      text = jsonCvToText(parsed) ?? raw;
    } catch {
      // A .json file that is not valid JSON is still text; the parser below
      // will decide whether it looks like a CV.
      text = raw;
    }
  }

  const normalized = normalizeDocumentText(text);
  const blocks = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      text: line,
      page: 1,
      x: 0,
      y: 0,
      width: 0,
      fontSize: 0,
      heading: false,
      source: 'text' as const,
    }));
  const readable = countReadableCharacters(normalized);

  return {
    format,
    status: readable < MIN_READABLE_CHARACTERS ? 'empty' : 'ok',
    text: normalized,
    blocks,
    pageCount: 1,
    characterCount: readable,
    wordCount: wordCount(normalized),
    layout: 'single-column',
    isScanned: false,
    warnings: readable < MIN_READABLE_CHARACTERS ? ['The document contains very little text.'] : [],
    errorMessage: readable < MIN_READABLE_CHARACTERS ? EMPTY_DOCUMENT_MESSAGE : undefined,
  };
}

/**
 * Normalises text that the user pasted instead of uploading a file. It is
 * exposed separately so the parser receives the same block shape as an
 * uploaded TXT document and every downstream stage remains identical.
 */
export function extractTextDocument(text: string): DocumentExtraction {
  return extractPlainText(Buffer.from(text, 'utf8'), 'txt');
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export function hasPdfSignature(buffer: Uint8Array): boolean {
  return (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  );
}

export function hasDocxSignature(buffer: Uint8Array): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08)
  );
}

/**
 * Extracts text from a CV upload. The caller has already verified that the
 * extension and declared MIME type agree; this function verifies the bytes.
 */
export async function extractDocument(
  buffer: Uint8Array,
  format: DocumentFormat
): Promise<DocumentExtraction> {
  if (format === 'pdf') {
    if (!hasPdfSignature(buffer)) {
      return {
        format,
        status: 'unsupported',
        text: '',
        blocks: [],
        pageCount: 0,
        characterCount: 0,
        wordCount: 0,
        layout: 'single-column',
        isScanned: false,
        warnings: [],
        errorMessage:
          'The file extension is .pdf but the file content is not a PDF. Please upload the original PDF file.',
      };
    }
    return extractPdf(buffer);
  }

  if (format === 'docx') {
    if (!hasDocxSignature(buffer)) {
      return {
        format,
        status: 'unsupported',
        text: '',
        blocks: [],
        pageCount: 0,
        characterCount: 0,
        wordCount: 0,
        layout: 'single-column',
        isScanned: false,
        warnings: [],
        errorMessage:
          'The file extension is .docx but the file content is not a DOCX package. Please export the document again as .docx.',
      };
    }
    return parseDocx(buffer);
  }

  return extractPlainText(buffer, format);
}

/**
 * Assesses whether the extracted text is usable as a CV.
 *
 * The check is deliberately conservative: a scanned PDF, an empty document,
 * binary noise and a non-CV document each produce a specific, actionable
 * message rather than the generic "could not decode" error.
 */
export function assessDocumentQuality(
  extraction: DocumentExtraction
): DocumentQualityAssessment {
  if (extraction.isScanned) {
    return {
      isAcceptable: false,
      isScannedPdf: true,
      quality: 'failed',
      errorMessage: extraction.errorMessage ?? PDF_SCANNED_MESSAGE,
    };
  }

  if (extraction.status === 'unsupported') {
    return {
      isAcceptable: false,
      isScannedPdf: false,
      quality: 'failed',
      errorMessage: extraction.errorMessage ?? EMPTY_DOCUMENT_MESSAGE,
    };
  }

  const text = extraction.text.trim();
  const totalLength = text.length;
  if (totalLength < MIN_READABLE_CHARACTERS) {
    return {
      isAcceptable: false,
      isScannedPdf: false,
      quality: 'failed',
      errorMessage: extraction.errorMessage ?? EMPTY_DOCUMENT_MESSAGE,
    };
  }

  const printableMatches =
    text.match(/[\x20-\x7E\n\r\t\u00A0-\u024F\u0600-\u06FF\u0400-\u04FF]/g) ?? [];
  const printableRatio = printableMatches.length / totalLength;
  if (printableRatio < 0.6) {
    return {
      isAcceptable: false,
      isScannedPdf: false,
      quality: 'failed',
      errorMessage:
        'The document text could not be decoded cleanly. Please re-export it as a standard PDF or DOCX, or paste your CV text.',
    };
  }

  const cvSignalRegex =
    /\b(experience|education|skills|projects|employment|curriculum\s+vitae|resume|qualification|university|college|bachelor|master|degree|engineer|analyst|developer|manager|specialist|consultant|responsibilities|achievements)\b/i;
  const contactSignalRegex =
    /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\+?\d[\d\s.-]{8,}\d|linkedin\.com|github\.com)\b/i;
  const hasCvSignals = cvSignalRegex.test(text);
  const hasContact = contactSignalRegex.test(text);

  if (!hasCvSignals && !hasContact && totalLength < 300) {
    return {
      isAcceptable: false,
      isScannedPdf: false,
      quality: 'failed',
      errorMessage:
        'The document does not appear to be a CV or resume. Please upload your CV.',
    };
  }

  let quality: 'high' | 'medium' | 'low' = 'low';
  if (totalLength > 400 && hasCvSignals && hasContact) quality = 'high';
  else if (totalLength > 200 && (hasCvSignals || hasContact)) quality = 'medium';

  return { isAcceptable: true, isScannedPdf: false, quality };
}
