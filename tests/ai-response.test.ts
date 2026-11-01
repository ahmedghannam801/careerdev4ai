/**
 * Behavioural checks for the shared AI response formatter.
 *
 * The copilot answers with model-generated text, and the product decision is
 * that the reader should see a short, clean answer rather than raw markdown.
 * These tests pin the contract the renderer relies on:
 *
 *   - headings stay headings but lose their `#` markers and are capped;
 *   - separators (`---`, `***`) never reach the reader;
 *   - nested bullets are flattened to one readable level;
 *   - numbered steps stay ordered, bullets stay unordered;
 *   - code fences survive intact, including an unterminated one;
 *   - a malformed answer degrades to paragraphs instead of throwing.
 *
 * The parser is pure, so these run without the API server.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aiResponsePreview,
  isArabicText,
  parseAiResponse,
  type AiBlock,
} from '../src/lib/aiResponse.ts';

const types = (blocks: AiBlock[]) => blocks.map((block) => block.type);

describe('parseAiResponse', () => {
  it('returns no blocks for empty or whitespace-only input', () => {
    assert.deepEqual(parseAiResponse(''), []);
    assert.deepEqual(parseAiResponse('   \n\n  '), []);
    assert.deepEqual(parseAiResponse(undefined as unknown as string), []);
  });

  it('turns markdown headings into short headings without the markers', () => {
    const blocks = parseAiResponse('## خطة التعلم\n\nابدأ بـ SQL.');
    assert.deepEqual(types(blocks), ['heading', 'paragraph']);
    assert.equal(blocks[0].type === 'heading' && blocks[0].text, 'خطة التعلم');
  });

  it('keeps a long line that merely starts with # as a paragraph', () => {
    const long = `# ${'كلمة '.repeat(40)}`;
    const blocks = parseAiResponse(long);
    assert.deepEqual(types(blocks), ['paragraph']);
    assert.ok(blocks[0].type === 'paragraph' && !blocks[0].text.startsWith('#'));
  });

  it('drops horizontal rules and repeated separators', () => {
    const blocks = parseAiResponse('الخطوة الأولى\n\n---\n\n***\n\nالخطوة الثانية');
    assert.deepEqual(types(blocks), ['paragraph', 'paragraph']);
    for (const block of blocks) {
      assert.ok(!/^[-*_]{3,}$/.test(block.type === 'paragraph' ? block.text : ''));
    }
  });

  it('parses an unordered list and flattens nested items', () => {
    const blocks = parseAiResponse(
      ['- تعلّم SQL', '  - ابدأ بالاستعلامات البسيطة', '- ابنِ مشروعاً'].join('\n')
    );
    assert.deepEqual(types(blocks), ['list']);
    const list = blocks[0];
    assert.ok(list.type === 'list' && !list.ordered);
    // Nested items become peers at one level rather than a second indent.
    assert.deepEqual(list.type === 'list' && list.items, [
      'تعلّم SQL',
      'ابدأ بالاستعلامات البسيطة',
      'ابنِ مشروعاً',
    ]);
    for (const item of list.type === 'list' ? list.items : []) {
      assert.ok(!/^\s*[-*+•]/.test(item), `nested marker leaked: ${item}`);
    }
  });

  it('keeps numbered steps ordered', () => {
    const blocks = parseAiResponse('1. حدّد هدفك\n2. تعلّم الأساسيات\n3) طبّق مشروعاً');
    assert.deepEqual(types(blocks), ['list']);
    const list = blocks[0];
    assert.ok(list.type === 'list' && list.ordered);
    assert.equal(list.type === 'list' && list.items.length, 3);
    assert.equal(list.type === 'list' && list.items[2], 'طبّق مشروعاً');
  });

  it('preserves fenced code, including its language', () => {
    const blocks = parseAiResponse(
      ['مثال:', '```sql', 'SELECT * FROM jobs;', '```'].join('\n')
    );
    assert.deepEqual(types(blocks), ['paragraph', 'code']);
    const code = blocks[1];
    assert.ok(code.type === 'code');
    assert.equal(code.language, 'sql');
    assert.equal(code.code, 'SELECT * FROM jobs;');
  });

  it('renders an unterminated fence instead of leaking backticks', () => {
    const blocks = parseAiResponse('```js\nconsole.log(1)');
    assert.deepEqual(types(blocks), ['code']);
    assert.equal(blocks[0].type === 'code' && blocks[0].code, 'console.log(1)');
  });

  it('joins wrapped lines into one paragraph', () => {
    const blocks = parseAiResponse('هذه جملة\nتستمر على السطر التالي.');
    assert.deepEqual(types(blocks), ['paragraph']);
    assert.equal(
      blocks[0].type === 'paragraph' && blocks[0].text,
      'هذه جملة تستمر على السطر التالي.'
    );
  });

  it('parses quotes and strips emphasis markers from the line', () => {
    const blocks = parseAiResponse('> نصيحة سريعة');
    assert.deepEqual(types(blocks), ['quote']);
    assert.equal(blocks[0].type === 'quote' && blocks[0].text, 'نصيحة سريعة');
  });

  it('never throws on malformed input', () => {
    for (const input of ['###', '- ', '1.', '>', '```', '****', '\u0000']) {
      assert.doesNotThrow(() => parseAiResponse(input));
    }
  });
});

describe('isArabicText', () => {
  it('detects Arabic script and ignores Latin text', () => {
    assert.equal(isArabicText('أتعلم SQL منين؟'), true);
    assert.equal(isArabicText('Where do I learn SQL?'), false);
  });
});

describe('aiResponsePreview', () => {
  it('removes markdown markers and joins blocks', () => {
    const preview = aiResponsePreview('## الخطة\n\n- **SQL**\n- `Excel`');
    assert.ok(!preview.includes('#'));
    assert.ok(!preview.includes('**'));
    assert.ok(!preview.includes('`'));
    assert.ok(preview.includes('SQL'));
    assert.ok(preview.includes('Excel'));
  });

  it('truncates long answers with an ellipsis', () => {
    const preview = aiResponsePreview('كلمة '.repeat(100), 40);
    assert.ok(preview.length <= 40);
    assert.ok(preview.endsWith('…'));
  });
});
