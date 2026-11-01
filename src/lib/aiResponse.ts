/**
 * Shared AI response formatting.
 *
 * The copilot used to render the model's text with `whitespace-pre-wrap`,
 * which meant every `##`, `**` and `---` the model produced reached the user
 * as literal punctuation. A career answer is read on a phone, often in
 * Arabic, and a wall of markdown symbols makes it harder to act on.
 *
 * This module turns the model's text into a small, explicit block model:
 * short headings, paragraphs, one level of bullets, numbered steps, code and
 * quotes. It deliberately does NOT try to be a full markdown renderer:
 *
 *   - headings are demoted, so a model that answers with `#`/`##`/`###` still
 *     produces a compact hierarchy;
 *   - horizontal rules and repeated separators are dropped;
 *   - nested bullets are flattened, because a nested list on a 320px screen
 *     is unreadable;
 *   - emphasis markers are kept only where they carry meaning (bold, inline
 *     code, links) and are rendered as elements, never as raw symbols.
 *
 * The renderer (`AiResponse.tsx`) consumes this model, so the sanitisation is
 * shared by every AI surface instead of being re-implemented per component.
 */

export type AiBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; language: string | null; code: string }
  | { type: 'quote'; text: string };

const SEPARATOR = /^\s*(?:[-*_]\s*){3,}$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*\S)\s*$/;
const BULLET = /^(\s*)[-*+•]\s+(.*\S)\s*$/;
const NUMBERED = /^(\s*)\d{1,2}[.)]\s+(.*\S)\s*$/;
const FENCE = /^\s*```([A-Za-z0-9+#-]*)\s*$/;
const QUOTE = /^\s*>\s?(.*\S)\s*$/;

/** Removes markdown noise the block parser does not render as elements. */
function cleanLine(line: string): string {
  return line
    .replace(/^\s*#{1,6}\s*/, '')
    .replace(/\s+#{1,6}\s*$/, '')
    .replace(/^\s*[-*_]{3,}\s*$/, '')
    .trim();
}

/** Flattens a nested bullet into a single readable item. */
function flattenItem(_indent: string, text: string): string {
  // Nested bullets are flattened to one level: the renderer already draws a
  // bullet, so adding a second dash would read as "• – item".
  return text.trim();
}

/**
 * Parses the model's text into blocks.
 *
 * The function is pure and never throws: malformed markdown degrades to
 * paragraphs rather than to an empty answer.
 */
export function parseAiResponse(raw: string): AiBlock[] {
  const text = (raw ?? '').replace(/\r\n?/g, '\n').trim();
  if (!text) return [];

  const lines = text.split('\n');
  const blocks: AiBlock[] = [];

  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let code: { language: string | null; lines: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const joined = paragraph.join(' ').replace(/\s+/g, ' ').trim();
    if (joined) blocks.push({ type: 'paragraph', text: joined });
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    if (list.items.length > 0) blocks.push({ type: 'list', ...list });
    list = null;
  };

  for (const line of lines) {
    // A fenced code block owns every line until its closing fence.
    if (code) {
      if (FENCE.test(line)) {
        blocks.push({
          type: 'code',
          language: code.language,
          code: code.lines.join('\n').replace(/\s+$/, ''),
        });
        code = null;
      } else {
        code.lines.push(line);
      }
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      flushParagraph();
      flushList();
      code = { language: fence[1] || null, lines: [] };
      continue;
    }

    if (!line.trim() || SEPARATOR.test(line)) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      flushParagraph();
      flushList();
      const value = cleanLine(heading[2]);
      // Keep headings short: a model paragraph accidentally prefixed with
      // `#` should still read as a paragraph, not a giant title.
      if (value) {
        if (value.length > 90) blocks.push({ type: 'paragraph', text: value });
        else blocks.push({ type: 'heading', text: value });
      }
      continue;
    }

    const bullet = line.match(BULLET);
    if (bullet) {
      flushParagraph();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      const item = flattenItem(bullet[1], bullet[2]);
      if (item) list.items.push(item);
      continue;
    }

    const numbered = line.match(NUMBERED);
    if (numbered) {
      flushParagraph();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      const item = flattenItem(numbered[1], numbered[2]);
      if (item) list.items.push(item);
      continue;
    }

    const quote = line.match(QUOTE);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'quote', text: cleanLine(quote[1]) });
      continue;
    }

    // A plain line continues the current list item when it is indented,
    // otherwise it starts/continues a paragraph.
    if (list && /^\s{2,}/.test(line)) {
      const last = list.items.length - 1;
      if (last >= 0) list.items[last] = `${list.items[last]} ${line.trim()}`.trim();
      continue;
    }

    flushList();
    paragraph.push(cleanLine(line));
  }

  // An unterminated fence still renders its content, never as raw text.
  if (code) {
    blocks.push({
      type: 'code',
      language: code.language,
      code: code.lines.join('\n').replace(/\s+$/, ''),
    });
  }
  flushParagraph();
  flushList();

  return blocks;
}

/** True when the text contains Arabic letters. */
export function isArabicText(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

/**
 * Produces a short plain-text preview of an AI answer, for a notification or
 * a card that cannot render blocks. Markdown symbols are removed.
 */
export function aiResponsePreview(raw: string, maxLength = 160): string {
  const plain = parseAiResponse(raw)
    .map((block) => {
      if (block.type === 'list') return block.items.join(' · ');
      if (block.type === 'code') return block.code;
      return block.text;
    })
    .join(' ')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
