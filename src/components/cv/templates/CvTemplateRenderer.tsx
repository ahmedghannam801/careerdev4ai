/**
 * The template renderer.
 *
 * One engine draws all 35 templates. A template supplies a STRUCTURE — where
 * the header sits, which column a section lives in, how an entry is set, how
 * skills are listed, how dense the page is — and this component turns that
 * description into a document. The engine does not know the name of a
 * template: adding a template is adding a structural description, not another
 * component.
 *
 * The same document model feeds the DOCX export (shared/cvTemplateDocument.ts),
 * so the paper and the file cannot drift apart.
 */

import React from 'react';
import type { CVProfile } from '../../../types/career';
import type { ResumeLanguage } from '../../../../shared/resumeLanguage';
import {
  type CvSectionKey,
  type CvTemplateDefinition,
  type CvEntryStyle,
  resolveCvTemplate,
} from '../../../../shared/cvTemplates';
import {
  type CvDocument,
  type CvDocumentEntry,
  type CvDocumentSection,
  type CvDocumentSectionKind,
} from '../../../../shared/cvTemplateDocument';
import {
  CV_INLINE_SEPARATOR,
  CV_INK,
  CV_PAGE_HEIGHT as A4_HEIGHT,
  CV_PAGE_WIDTH as A4_WIDTH,
  CV_TEMPLATE_DENSITY,
  buildCvLayoutPlan,
  cvDividerDecoration,
  cvHeaderDecoration,
  cvHeadingDecoration,
  cvSkillsDecoration,
  type CvLayoutSection,
  type CvLayoutSpec,
} from '../../../../shared/cvLayout';

export { A4_WIDTH, A4_HEIGHT, CV_TEMPLATE_DENSITY };

interface CvTemplateRendererProps {
  cv: CVProfile;
  language?: ResumeLanguage;
  templateId?: string;
  /** A resolved definition, when the caller already has one. */
  template?: CvTemplateDefinition;
  /** The catalogue the id is resolved against. */
  catalog?: readonly CvTemplateDefinition[];
  /**
   * Whether this is the document the print stylesheet should keep.
   *
   * Only the real paper in the studio is printable. A library card draws the
   * same template with sample data, and if it carried the marker a print from
   * the library would put thirty-five sample CVs on the page.
   */
  printable?: boolean;
}

/**
 * The measurements a density describes.
 *
 * Exported so that the preview can work out how many sheets of A4 a document
 * would print as: the page's own margin is part of the measurement.
 */
function headingStyleFor(spec: CvLayoutSpec): React.CSSProperties {
  const decoration = cvHeadingDecoration(spec);
  const base: React.CSSProperties = {
    fontSize: '0.92em',
    fontWeight: decoration.fontWeight,
    letterSpacing: decoration.letterSpacing,
    margin: 0,
    color: CV_INK.heading,
    fontFamily: decoration.font.css,
  };
  if (decoration.smallCaps) base.fontVariant = 'small-caps';
  if (decoration.italic) base.fontStyle = 'italic';
  if (decoration.allCaps) base.textTransform = 'uppercase';
  if (decoration.rule === 'start') {
    base.borderInlineStart = `${decoration.ruleWidthPx}px solid ${decoration.ruleColor}`;
    base.paddingInlineStart = 8;
  }
  if (decoration.rule === 'bottom') {
    base.borderBottom = decoration.ruleDouble
      ? `${decoration.ruleWidthPx}px double ${decoration.ruleColor}`
      : `${decoration.ruleWidthPx}px solid ${decoration.ruleColor}`;
    base.paddingBottom = 3;
  }
  return base;
}

function dividerStyle(spec: CvLayoutSpec): React.CSSProperties {
  const decoration = cvDividerDecoration(spec);
  if (decoration.kind === 'bottom') {
    return {
      borderBottom: decoration.double
        ? `${decoration.widthPx}px double ${decoration.color}`
        : `${decoration.widthPx}px solid ${decoration.color}`,
      paddingBottom: 4,
    };
  }
  if (decoration.kind === 'block') {
    return {
      backgroundColor: decoration.fill ?? undefined,
      borderInlineStart: `${decoration.widthPx}px solid ${decoration.color}`,
      padding: '4px 8px',
    };
  }
  return {};
}

function SectionHeading({
  section,
  number,
  spec,
}: {
  section: CvDocumentSection;
  number: number;
  spec: CvLayoutSpec;
}) {
  const numbered = spec.headingStyle === 'numbered';
  return (
    <div
      className="cv-section-heading"
      style={{
        ...dividerStyle(spec),
        marginBottom: 7,
        breakAfter: 'avoid',
      }}
    >
      <h3 style={headingStyleFor(spec)}>
        {numbered && (
          <span style={{ color: spec.accent, marginInlineEnd: 7 }}>
            {String(number + 1).padStart(2, '0')}
          </span>
        )}
        {spec.showIcons && (
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: 5,
              height: 5,
              backgroundColor: spec.accent,
              marginInlineEnd: 7,
              verticalAlign: 'middle',
            }}
          />
        )}
        {section.heading}
      </h3>
    </div>
  );
}

function Bullets({
  bullets,
  spec,
}: {
  bullets: string[];
  spec: CvLayoutSpec;
}) {
  if (bullets.length === 0) return null;
  const prefix = spec.bulletGlyph;
  if (!prefix) {
    return (
      <div style={{ display: 'grid', gap: 3, marginTop: 3 }}>
        {bullets.map((bullet, index) => (
          <p key={index} style={{ margin: 0 }}>
            {bullet}
          </p>
        ))}
      </div>
    );
  }
  return (
    <ul
      style={{
        margin: '3px 0 0',
        padding: 0,
        listStyle: 'none',
        display: 'grid',
        gap: 3,
      }}
    >
      {bullets.map((bullet, index) => (
        <li
          key={index}
          data-cv-block
          style={{ display: 'flex', gap: 6, breakInside: 'avoid' }}
        >
          <span aria-hidden="true" style={{ color: spec.accent, flexShrink: 0 }}>
            {prefix}
          </span>
          <span>{bullet}</span>
        </li>
      ))}
    </ul>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        flexShrink: 0,
        color: CV_INK.muted,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function EntryBlock({
  entry,
  spec,
}: {
  entry: CvDocumentEntry;
  spec: CvLayoutSpec;
}) {
  const entryStyle: CvEntryStyle = spec.entryStyle;
  const accent = spec.accent;
  const density = spec.density;
  const layout = spec.layout;
  const titleStyle: React.CSSProperties = {
    fontWeight: 700,
    color: CV_INK.heading,
    fontFamily: spec.headingFont.css,
  };
  const subtitle = entry.subtitle ? (
    <span style={{ color: CV_INK.secondary }}>{entry.subtitle}</span>
  ) : null;
  const meta = entry.meta ? <Meta>{entry.meta}</Meta> : null;
  const location = entry.location ? (
    <div style={{ color: CV_INK.muted, fontSize: '0.92em' }}>{entry.location}</div>
  ) : null;
  const description = entry.description ? (
    <p style={{ margin: '2px 0 0', color: CV_INK.body }}>{entry.description}</p>
  ) : null;
  const tags =
    entry.tags.length > 0 ? (
      <div style={{ color: CV_INK.secondary, fontSize: '0.92em', marginTop: 2 }}>
        {entry.tags.join(CV_INLINE_SEPARATOR)}
      </div>
    ) : null;
  const url = entry.url ? (
    <a
      href={entry.url}
      target="_blank"
      rel="noreferrer noopener"
      style={{
        display: 'block',
        color: accent,
        fontSize: '0.92em',
        textDecoration: 'underline',
        wordBreak: 'break-all',
        marginTop: 2,
      }}
    >
      {entry.url}
    </a>
  ) : null;

  const content = (
    <>
      {entryStyle === 'timeline' ? (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span style={titleStyle}>{entry.title}</span>
            {meta}
          </div>
          {/* The employer. A timeline used to print the role alone, which
              quietly dropped the company from every experience entry. */}
          {subtitle && <div style={{ fontSize: '0.96em' }}>{subtitle}</div>}
        </>
      ) : entryStyle === 'inline' || entryStyle === 'grid' ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <span style={titleStyle}>
            {entry.title}
            {subtitle ? <> — {subtitle}</> : null}
          </span>
          {meta}
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span style={titleStyle}>{entry.title}</span>
            {meta}
          </div>
          {subtitle && <div style={{ fontSize: '0.96em' }}>{subtitle}</div>}
        </>
      )}
      {entryStyle !== 'inline' && entryStyle !== 'grid' ? location : null}
      {entryStyle !== 'inline' && entryStyle !== 'grid' ? description : null}
      {entryStyle === 'inline' || entryStyle === 'grid' ? location : null}
      {entryStyle === 'inline' || entryStyle === 'grid' ? description : null}
      <Bullets bullets={entry.bullets} spec={spec} />
      {tags}
      {url}
    </>
  );

  const common: React.CSSProperties = {
    breakInside: 'avoid',
    marginBottom: density === 'compact' ? 7 : density === 'spacious' ? 12 : 9,
    fontSize: '1em',
  };

  // An academic record is set as a record: what the thing was on the left,
  // what it involved on the right. It is a different way of reading the same
  // facts, not a different set of facts.
  if (layout === 'academic') {
    return (
      <div
        data-cv-block
        style={{
          ...common,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 0.95fr) minmax(0, 1.5fr)',
          gap: 10,
          alignItems: 'start',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ ...titleStyle, fontSize: '0.98em' }}>{entry.title}</div>
          {entry.subtitle && (
            <div style={{ color: CV_INK.secondary, fontSize: '0.93em' }}>{entry.subtitle}</div>
          )}
          {meta && <div style={{ marginTop: 2 }}>{meta}</div>}
        </div>
        <div style={{ minWidth: 0 }}>
          {location}
          {description}
          <Bullets bullets={entry.bullets} spec={spec} />
          {tags}
          {url}
        </div>
      </div>
    );
  }

  if (layout === 'cards') {
    return (
      <div
        data-cv-block
        style={{
          ...common,
          border: `1px solid ${CV_INK.rule}`,
          borderInlineStart: `3px solid ${accent}`,
          borderRadius: 6,
          padding: density === 'compact' ? 7 : 10,
          backgroundColor: '#ffffff',
        }}
      >
        {content}
      </div>
    );
  }

  if (entryStyle === 'card') {
    return (
      <div
        data-cv-block
        style={{
          ...common,
          border: `1px solid ${CV_INK.rule}`,
          borderInlineStart: `3px solid ${accent}`,
          borderRadius: 6,
          padding: density === 'compact' ? 7 : 10,
          backgroundColor: '#ffffff',
        }}
      >
        {content}
      </div>
    );
  }

  if (entryStyle === 'grid') {
    return (
      <div
        data-cv-block
        style={{
          ...common,
          border: `1px solid ${CV_INK.rule}`,
          borderRadius: 5,
          padding: density === 'compact' ? 6 : 9,
        }}
      >
        {content}
      </div>
    );
  }

  if (entryStyle === 'timeline') {
    return (
      <div data-cv-block style={{ ...common, display: 'flex', gap: 10 }}>
        <div
          aria-hidden="true"
          style={{
            flexShrink: 0,
            width: 9,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 99,
              border: `2px solid ${accent}`,
              backgroundColor: '#ffffff',
              marginTop: 3,
            }}
          />
          <span style={{ flex: 1, width: 1, backgroundColor: CV_INK.hairline, marginTop: 3 }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>{content}</div>
      </div>
    );
  }

  return (
    <div data-cv-block style={common}>
      {content}
    </div>
  );
}

function SkillsBlock({
  skills,
  spec,
  sectionKey,
}: {
  skills: string[];
  spec: CvLayoutSpec;
  sectionKey?: CvSectionKey;
}) {
  if (skills.length === 0) return null;
  const decoration = cvSkillsDecoration(spec, sectionKey);
  const accent = spec.accent;
  if (decoration.mode === 'chips') {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {skills.map((skill) => (
          <span
            key={skill}
            style={{
              border: `1px solid ${accent}55`,
              backgroundColor: `${accent}0d`,
              borderRadius: 99,
              padding: '1px 7px',
              fontSize: '0.92em',
            }}
          >
            {skill}
          </span>
        ))}
      </div>
    );
  }
  if (decoration.mode === 'bars') {
    return (
      <div style={{ display: 'grid', gap: 4 }}>
        {skills.map((skill) => (
          <div key={skill} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              aria-hidden="true"
              style={{ width: 12, height: 3, backgroundColor: accent, flexShrink: 0 }}
            />
            <span>{skill}</span>
          </div>
        ))}
      </div>
    );
  }
  if (decoration.mode === 'columns') {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${decoration.columns}, minmax(0, 1fr))`,
          gap: '2px 14px',
        }}
      >
        {skills.map((skill) => (
          <span key={skill}>{skill}</span>
        ))}
      </div>
    );
  }
  if (decoration.mode === 'grouped') {
    return (
      <div style={{ display: 'grid', gap: 3 }}>
        {skills.map((skill) => (
          <div key={skill} style={{ display: 'flex', gap: 6 }}>
            <span aria-hidden="true" style={{ color: accent }}>
              {decoration.marker}
            </span>
            <span>{skill}</span>
          </div>
        ))}
      </div>
    );
  }
  return <div>{skills.join(decoration.separator)}</div>;
}

function SectionBody({
  section,
  spec,
}: {
  section: CvDocumentSection;
  spec: CvLayoutSpec;
}) {
  const accent = spec.accent;
  const density = spec.density;
  const layout = spec.layout;

  if (section.kind === 'text') {
    return (
      <p style={{ margin: 0, color: CV_INK.body, whiteSpace: 'pre-wrap' }}>{section.text}</p>
    );
  }
  if (section.kind === 'inline') {
    return (
      <SkillsBlock
        skills={section.inline ?? []}
        spec={spec}
        sectionKey={section.key}
      />
    );
  }

  // A card grid is the layout, not a decoration: the entries are set as
  // cards whether or not the entry style says so.
  const isCardGrid = layout === 'cards' && section.key !== 'links';
  const isGrid = spec.entryStyle === 'grid' && section.key !== 'links';

  // A timeline is the layout, so the rail is drawn whatever the entry style
  // says. Two consecutive entries share one continuous line.
  if (layout === 'timeline') {
    return (
      <div style={{ display: 'grid', gap: density === 'compact' ? 6 : 10 }}>
        {section.entries.map((entry) => (
          <div key={entry.id} style={{ display: 'flex', gap: 10, breakInside: 'avoid' }}>
            <div
              aria-hidden="true"
              style={{
                flexShrink: 0,
                width: 9,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 99,
                  border: `2px solid ${accent}`,
                  backgroundColor: '#ffffff',
                  marginTop: 4,
                }}
              />
              <span style={{ flex: 1, width: 1, backgroundColor: CV_INK.hairline, marginTop: 3 }} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <EntryBlock entry={entry} spec={spec} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      style={
        isCardGrid || isGrid
          ? {
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 8,
            }
          : undefined
      }
    >
      {section.entries.map((entry) => (
        <EntryBlock key={entry.id} entry={entry} spec={spec} />
      ))}
    </div>
  );
}

function SectionList({
  sections,
  spec,
}: {
  sections: CvLayoutSection[];
  spec: CvLayoutSpec;
}) {
  return (
    <div style={{ display: 'grid', gap: spec.metrics.gap }}>
      {sections.map((entry) => (
        <section
          key={entry.section.key}
          data-cv-block
          className="cv-section"
          // A section is allowed to flow across a page boundary: a section
          // longer than one sheet would otherwise be pushed off the page.
          // The heading keeps the entry under it, and the entries keep
          // themselves together.
          style={{ breakInside: 'auto' }}
        >
          <SectionHeading section={entry.section} number={entry.number} spec={spec} />
          <SectionBody section={entry.section} spec={spec} />
        </section>
      ))}
    </div>
  );
}

function ContactLine({
  contact,
  align,
  color,
  gap = 10,
}: {
  contact: string[];
  align: 'start' | 'center' | 'end';
  color: string;
  gap?: number;
}) {
  if (contact.length === 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent:
          align === 'center' ? 'center' : align === 'end' ? 'flex-end' : 'flex-start',
        gap: `2px ${gap}px`,
        color,
        fontSize: '0.94em',
      }}
    >
      {contact.map((value, index) => (
        <span key={`${value}-${index}`} style={{ display: 'inline-flex', gap: 6 }}>
          {index > 0 && <span aria-hidden="true">·</span>}
          {value}
        </span>
      ))}
    </div>
  );
}

/**
 * The professional links of the masthead.
 *
 * Each one is a real anchor, so the link is clickable in the printed PDF and
 * carries its destination into the file. A long URL wraps instead of pushing
 * the masthead wider than the sheet.
 */
function HeaderLinks({
  links,
  align,
  color,
  gap = 10,
}: {
  links: CvDocument['headerLinks'];
  align: 'start' | 'center' | 'end';
  color: string;
  gap?: number;
}) {
  if (links.length === 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent:
          align === 'center' ? 'center' : align === 'end' ? 'flex-end' : 'flex-start',
        gap: `2px ${gap}px`,
        color,
        fontSize: '0.9em',
        marginTop: 3,
        maxWidth: '100%',
      }}
    >
      {links.map((link, index) => (
        <span
          key={`${link.url}-${index}`}
          style={{ display: 'inline-flex', gap: 6, minWidth: 0, maxWidth: '100%' }}
        >
          {index > 0 && <span aria-hidden="true">·</span>}
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer noopener"
            style={{
              color,
              textDecoration: 'underline',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
              minWidth: 0,
            }}
          >
            {link.label || link.url}
          </a>
        </span>
      ))}
    </div>
  );
}

function HeaderDetails({
  document,
  align,
  color,
  gap,
}: {
  document: CvDocument;
  align: 'start' | 'center' | 'end';
  color: string;
  gap?: number;
}) {
  if (document.headerContact.length === 0 && document.headerLinks.length === 0) return null;
  return (
    <>
      <ContactLine contact={document.headerContact} align={align} color={color} gap={gap} />
      <HeaderLinks links={document.headerLinks} align={align} color={color} gap={gap} />
    </>
  );
}

function Header({
  document,
  spec,
}: {
  document: CvDocument;
  spec: CvLayoutSpec;
}) {
  const accent = spec.accent;
  const header = cvHeaderDecoration(spec);
  const nameStyle: React.CSSProperties = {
    margin: 0,
    fontFamily: spec.headingFont.css,
    fontWeight: 800,
    lineHeight: 1.08,
    letterSpacing: '-0.01em',
  };
  const titleStyle: React.CSSProperties = {
    margin: '3px 0 0',
    color: header.titleColor === 'body' ? CV_INK.body : accent,
    fontWeight: 600,
    letterSpacing: header.titleAllCaps ? '0.06em' : 'normal',
    textTransform: header.titleAllCaps ? 'uppercase' : 'none',
    fontStyle: header.titleItalic ? 'italic' : 'normal',
    fontSize: '0.95em',
  };
  const rule: React.CSSProperties = { height: 2, backgroundColor: accent, margin: '9px 0' };
  const gap = spec.metrics.gap;
  const pad = spec.metrics.pad;

  switch (header.kind) {
    case 'left':
      return (
        <header style={{ marginBottom: gap }}>
          <h1 style={{ ...nameStyle, fontSize: header.nameSizePx }}>{document.fullName}</h1>
          {document.title && <p style={titleStyle}>{document.title}</p>}
          <div style={{ marginTop: 6 }}>
            <HeaderDetails document={document} align="start" color={CV_INK.secondary} />
          </div>
          <div style={rule} />
        </header>
      );
    case 'banner':
      return (
        <header
          style={{
            margin: `-${pad}px -${pad}px 0`,
            padding: `${Math.max(20, pad - 6)}px ${pad}px`,
            backgroundColor: accent,
            color: '#ffffff',
            marginBottom: gap,
          }}
        >
          <h1 style={{ ...nameStyle, fontSize: header.nameSizePx, color: '#ffffff' }}>
            {document.fullName}
          </h1>
          {document.title && (
            <p style={{ ...titleStyle, color: '#ffffffdd', marginTop: 4 }}>{document.title}</p>
          )}
          <div style={{ marginTop: 8 }}>
            <HeaderDetails document={document} align="start" color="#ffffffdd" />
          </div>
        </header>
      );
    case 'split':
      return (
        <header style={{ marginBottom: gap }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h1 style={{ ...nameStyle, fontSize: header.nameSizePx }}>{document.fullName}</h1>
              {document.title && <p style={titleStyle}>{document.title}</p>}
            </div>
            <div style={{ textAlign: 'end', maxWidth: '48%' }}>
              <HeaderDetails document={document} align="end" color={CV_INK.secondary} gap={7} />
            </div>
          </div>
          <div style={{ ...rule, marginTop: 10 }} />
        </header>
      );
    case 'monogram': {
      const initials = document.fullName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('');
      return (
        <header
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            marginBottom: gap,
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 48,
              height: 48,
              borderRadius: 99,
              backgroundColor: accent,
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ ...nameStyle, fontSize: header.nameSizePx }}>{document.fullName}</h1>
            {document.title && <p style={{ ...titleStyle, marginTop: 1 }}>{document.title}</p>}
            <div style={{ marginTop: 4 }}>
              <HeaderDetails document={document} align="start" color={CV_INK.secondary} gap={8} />
            </div>
          </div>
        </header>
      );
    }
    case 'stacked':
      return (
        <header style={{ marginBottom: gap }}>
          <div style={{ height: 5, backgroundColor: accent, marginBottom: 9 }} />
          <h1 style={{ ...nameStyle, fontSize: header.nameSizePx }}>{document.fullName}</h1>
          {document.title && <p style={titleStyle}>{document.title}</p>}
          <div style={{ marginTop: 5 }}>
            <HeaderDetails document={document} align="start" color={CV_INK.secondary} />
          </div>
        </header>
      );
    case 'editorial':
      return (
        <header style={{ marginBottom: gap }}>
          <h1
            style={{
              ...nameStyle,
              fontSize: header.nameSizePx,
              fontFamily: spec.headingFont.css,
              fontWeight: 700,
            }}
          >
            {document.fullName}
          </h1>
          {document.title && (
            <p
              style={{
                margin: '4px 0 0',
                color: CV_INK.body,
                fontSize: '1.05em',
                fontStyle: 'italic',
              }}
            >
              {document.title}
            </p>
          )}
          <div style={{ marginTop: 7 }}>
            <HeaderDetails document={document} align="start" color={CV_INK.secondary} />
          </div>
          <div style={{ borderTop: `3px double ${accent}`, marginTop: 9 }} />
        </header>
      );
    case 'compact':
      return (
        <header style={{ marginBottom: gap }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <h1 style={{ ...nameStyle, fontSize: header.nameSizePx }}>{document.fullName}</h1>
            {document.title && (
              <span style={{ color: accent, fontWeight: 600, fontSize: '0.96em' }}>
                {document.title}
              </span>
            )}
          </div>
          <div style={{ marginTop: 3 }}>
            <HeaderDetails document={document} align="start" color={CV_INK.secondary} gap={8} />
          </div>
          <div style={{ height: 1, backgroundColor: CV_INK.hairline, marginTop: 6 }} />
        </header>
      );
    default:
      return (
        <header
          style={{
            marginBottom: gap,
            textAlign: 'center',
            borderBottom: `1px solid ${CV_INK.rule}`,
            paddingBottom: 9,
          }}
        >
          <h1 style={{ ...nameStyle, fontSize: header.nameSizePx }}>{document.fullName}</h1>
          {document.title && <p style={titleStyle}>{document.title}</p>}
          <div style={{ marginTop: 5 }}>
            <HeaderDetails document={document} align="center" color={CV_INK.secondary} />
          </div>
        </header>
      );
  }
}

function AsideBlock({
  sections,
  spec,
}: {
  sections: CvLayoutSection[];
  spec: CvLayoutSpec;
}) {
  const accent = spec.accent;
  return (
    <aside
      style={{
        minWidth: 0,
        borderInlineStart: spec.accentPosition === 'side' ? `2px solid ${accent}` : undefined,
        paddingInlineStart: spec.accentPosition === 'side' ? 12 : 0,
      }}
    >
      <SectionList sections={sections} spec={spec} />
    </aside>
  );
}

export const CvTemplateRenderer: React.FC<CvTemplateRendererProps> = ({
  cv,
  language = 'en',
  templateId,
  template,
  catalog,
  printable = true,
}) => {
  const resolved = template ?? resolveCvTemplate(templateId, catalog);
  const plan = buildCvLayoutPlan({ cv, template: resolved, language });
  const spec = plan.spec;
  const document = plan.document;
  const metrics = spec.metrics;
  const accent = spec.accent;
  const hasAside = plan.aside.length > 0;
  const mainColumn = hasAside ? 'minmax(0, 1fr)' : undefined;
  const asideColumn = hasAside
    ? `minmax(${spec.columns.asideMinPx}px, ${spec.columns.asideFr}fr)`
    : undefined;

  const page: React.CSSProperties = {
    backgroundColor: '#ffffff',
    color: CV_INK.page,
    fontFamily: spec.bodyFont.css,
    fontSize: metrics.font,
    lineHeight: metrics.line,
    padding: metrics.pad,
    width: '100%',
    boxSizing: 'border-box',
    // The page is a sheet of A4. A document longer than one sheet grows, and
    // the preview counts the sheets it would print as.
    minHeight: A4_HEIGHT,
    position: 'relative',
  };

  const asideFirst = spec.asideFirst;

  const body = hasAside ? (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: asideFirst
          ? `${asideColumn} ${mainColumn}`
          : `${mainColumn} ${asideColumn}`,
        gap: spec.columns.gapPx,
        alignItems: 'start',
      }}
    >
      {asideFirst && <AsideBlock sections={plan.aside} spec={spec} />}
      <div style={{ minWidth: 0 }}>
        <SectionList sections={plan.main} spec={spec} />
      </div>
      {!asideFirst && <AsideBlock sections={plan.aside} spec={spec} />}
    </div>
  ) : (
    <SectionList sections={plan.main} spec={spec} />
  );

  // A split or an editorial document reads across two columns rather than
  // down one. It is the difference between a wide sheet of text and a page
  // that behaves like a newspaper, and it is what makes the layout the
  // template's own rather than a wrapper around a list.
  const twoColumn = spec.twoColumn;
  const columnedBody = twoColumn ? (
    <div
      style={{
        columnCount: 2,
        columnGap: spec.density === 'compact' ? 16 : 24,
        columnRule: spec.layout === 'editorial' ? `1px solid ${accent}33` : undefined,
      }}
    >
      {body}
    </div>
  ) : (
    body
  );

  const accentEdge =
    spec.accentPosition === 'border'
      ? { borderTop: `4px solid ${accent}`, paddingTop: metrics.pad - 6 }
      : spec.accentPosition === 'side'
        ? { borderInlineStart: `6px solid ${accent}`, paddingInlineStart: metrics.pad - 8 }
        : undefined;

  return (
    <div
      {...(printable ? { 'data-cv-print': true } : {})}
      data-cv-template={resolved.id}
      dir={document.direction}
      lang={document.language}
      className={`cv-template cv-template-${resolved.id}`}
      style={{ ...page, ...accentEdge }}
    >
      <div data-cv-block>
        <Header document={document} spec={spec} />
      </div>
      {columnedBody}
    </div>
  );
};

/** The heading of a section, exported so tests can assert the order. */
export function cvTemplateSectionKeys(
  cv: CVProfile,
  template: CvTemplateDefinition,
  language: ResumeLanguage = 'en'
): string[] {
  return buildCvLayoutPlan({ cv, template, language }).sections.map((section) => section.key);
}

/** The kind of a section, used by the library to describe a template. */
export function sectionKindLabel(kind: CvDocumentSectionKind): string {
  if (kind === 'text') return 'paragraph';
  if (kind === 'inline') return 'list';
  return 'entries';
}
