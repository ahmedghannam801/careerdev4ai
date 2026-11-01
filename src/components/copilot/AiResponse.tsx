import React from 'react';
import { parseAiResponse, type AiBlock } from '../../lib/aiResponse';

interface AiResponseProps {
  text: string;
  className?: string;
}

const SAFE_URL = /^https?:\/\//i;

/**
 * Renders inline emphasis, inline code and links without ever inserting raw
 * HTML. Only http(s) links become anchors; anything else is shown as text.
 */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)]+)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;

    if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(
        <strong key={key} className="font-semibold text-[var(--text-primary)]">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`')) {
      nodes.push(
        <code
          key={key}
          dir="ltr"
          className="rounded bg-[var(--surface-main)] px-1 py-0.5 font-mono text-[0.85em] text-[var(--text-primary)]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[')) {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link && SAFE_URL.test(link[2])) {
        nodes.push(
          <a
            key={key}
            href={link[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[var(--color-primary-text)] underline underline-offset-2 break-words"
          >
            {link[1]}
          </a>
        );
      } else {
        nodes.push(token);
      }
    } else if (SAFE_URL.test(token)) {
      nodes.push(
        <a
          key={key}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[var(--color-primary-text)] underline underline-offset-2 break-words"
        >
          {token}
        </a>
      );
    } else {
      nodes.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function Block({ block, index }: { block: AiBlock; index: number }) {
  switch (block.type) {
    case 'heading':
      return (
        <h4 className="mt-1 text-[13px] font-semibold leading-snug text-[var(--text-primary)]">
          {renderInline(block.text, `h-${index}`)}
        </h4>
      );
    case 'list':
      return block.ordered ? (
        <ol className="ms-4 list-decimal space-y-1.5">
          {block.items.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {renderInline(item, `ol-${index}-${i}`)}
            </li>
          ))}
        </ol>
      ) : (
        <ul className="ms-4 list-disc space-y-1.5">
          {block.items.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {renderInline(item, `ul-${index}-${i}`)}
            </li>
          ))}
        </ul>
      );
    case 'code':
      return (
        <pre
          dir="ltr"
          className="overflow-x-auto rounded-lg bg-[var(--surface-main)] p-2.5 text-[11px] leading-relaxed"
        >
          <code>{block.code}</code>
        </pre>
      );
    case 'quote':
      return (
        <blockquote className="border-s-2 border-[var(--border-strong)] ps-2.5 text-[var(--text-secondary)]">
          {renderInline(block.text, `q-${index}`)}
        </blockquote>
      );
    default:
      return <p className="leading-relaxed">{renderInline(block.text, `p-${index}`)}</p>;
  }
}

/**
 * The single renderer for AI answers.
 *
 * The blocks are spaced with `space-y`, so a short answer is one line and a
 * longer answer stays scannable without the model's own blank-line padding.
 */
export const AiResponse: React.FC<AiResponseProps> = ({ text, className }) => {
  const blocks = parseAiResponse(text);
  if (blocks.length === 0) return null;

  return (
    <div className={`space-y-2.5 break-words ${className ?? ''}`}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} index={index} />
      ))}
    </div>
  );
};
