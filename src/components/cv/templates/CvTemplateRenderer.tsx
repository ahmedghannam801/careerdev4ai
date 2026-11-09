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
  type CvTemplateDefinition,
  type CvTemplateStructure,
  type CvTemplateLayout,
  type CvDensity,
  type CvHeadingStyle,
  type CvEntryStyle,
  type CvSkillsStyle,
  type CvTypography,
  resolveCvTemplate,
} from '../../../../shared/cvTemplates';
import {
  buildCvTemplateDocument,
  orderCvSections,
  splitCvSections,
  type CvDocument,
  type CvDocumentEntry,
  type CvDocumentSection,
  type CvDocumentSectionKind,
} from '../../../../shared/cvTemplateDocument';

/**
 * A sheet of A4 at 96dpi.
 *
 * The renderer lays the document out at this width, and the preview scales it
 * to whatever space it has. The page box is a real A4 sheet rather than a
 * guessed minimum, so a preview can say how many pages a document will print
 * as and a thumbnail can show the whole document rather than a cropped top.
 */
export const A4_WIDTH = 794;
export const A4_HEIGHT = 1123;

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
export const CV_TEMPLATE_DENSITY: Record<
  CvDensity,
  { font: number; line: number; gap: number; pad: number }
> = {
  compact: { font: 10.2, line: 1.36, gap: 9, pad: 26 },
  standard: { font: 11.4, line: 1.46, gap: 14, pad: 34 },
  spacious: { font: 12.3, line: 1.6, gap: 19, pad: 42 },
};

function fontFamily(typography: CvTypography, part: 'body' | 'heading'): string {
  if (typography === 'serif') return 'Georgia, "Times New Roman", serif';
  if (typography === 'mono') return 'ui-monospace, "SFMono-Regular", Menlo, monospace';
  if (typography === 'mixed') {
    return part === 'heading'
      ? 'Georgia, "Times New Roman", serif'
      : 'Inter, ui-sans-serif, system-ui, sans-serif';
  }
  return 'Inter, ui-sans-serif, system-ui, sans-serif';
}

function headingStyleFor(
  style: CvHeadingStyle,
  accent: string,
  dividers: CvTemplateStructure['dividers']
): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: '0.92em',
    fontWeight: 700,
    letterSpacing: '0.08em',
    margin: 0,
    color: '#0f172a',
  };
  switch (style) {
    case 'uppercase':
      return { ...base, textTransform: 'uppercase' };
    case 'smallcaps':
      return { ...base, fontVariant: 'small-caps', letterSpacing: '0.05em' };
    case 'serif':
      return {
        ...base,
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontStyle: 'italic',
        fontWeight: 700,
        letterSpacing: '0.01em',
      };
    case 'numbered':
      return { ...base, letterSpacing: '0.03em' };
    case 'bar':
      return {
        ...base,
        textTransform: 'uppercase',
        borderInlineStart: `3px solid ${accent}`,
        paddingInlineStart: 8,
      };
    case 'underline':
      return {
        ...base,
        textTransform: 'uppercase',
        borderBottom: `1px solid ${accent}`,
        paddingBottom: 3,
        borderBlockEnd:
          dividers === 'double' ? `3px double ${accent}` : `1px solid ${accent}`,
      };
    default:
      return base;
  }
}

function dividerStyle(
  dividers: CvTemplateStructure['dividers'],
  accent: string
): React.CSSProperties {
  switch (dividers) {
    case 'line':
      return { borderBottom: '1px solid #e2e8f0', paddingBottom: 4 };
    case 'double':
      return { borderBottom: `3px double ${accent}`, paddingBottom: 4 };
    case 'accent':
      return { borderBottom: `2px solid ${accent}`, paddingBottom: 4 };
    case 'block':
      return {
        backgroundColor: `${accent}12`,
        borderInlineStart: `3px solid ${accent}`,
        padding: '4px 8px',
      };
    default:
      return {};
  }
}

function bulletPrefix(style: CvTemplateStructure['bulletStyle']): string | null {
  switch (style) {
    case 'disc':
      return '•';
    case 'dash':
      return '–';
    case 'square':
      return '▪';
    case 'arrow':
      return '→';
    default:
      return null;
  }
}

function SectionHeading({
  section,
  index,
  structure,
  accent,
  typography,
}: {
  section: CvDocumentSection;
  index: number;
  structure: CvTemplateStructure;
  accent: string;
  typography: CvTypography;
}) {
  const numbered = structure.headingStyle === 'numbered';
  return (
    <div
      className="cv-section-heading"
      style={{
        ...dividerStyle(structure.dividers, accent),
        marginBottom: 7,
        breakAfter: 'avoid',
      }}
    >
      <h3 style={{ ...headingStyleFor(structure.headingStyle, accent, structure.dividers), fontFamily: fontFamily(typography, 'heading') }}>
        {numbered && (
          <span style={{ color: accent, marginInlineEnd: 7 }}>
            {String(index + 1).padStart(2, '0')}
          </span>
        )}
        {structure.showIcons && (
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: 5,
              height: 5,
              backgroundColor: accent,
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
  structure,
  accent,
}: {
  bullets: string[];
  structure: CvTemplateStructure;
  accent: string;
}) {
  if (bullets.length === 0) return null;
  const prefix = bulletPrefix(structure.bulletStyle);
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
        <li key={index} style={{ display: 'flex', gap: 6, breakInside: 'avoid' }}>
          <span aria-hidden="true" style={{ color: accent, flexShrink: 0 }}>
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
        color: '#64748b',
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
  structure,
  accent,
  density,
  typography,
  layout,
}: {
  entry: CvDocumentEntry;
  structure: CvTemplateStructure;
  accent: string;
  density: CvDensity;
  typography: CvTypography;
  layout: CvTemplateLayout;
}) {
  const entryStyle: CvEntryStyle = structure.entryStyle;
  const titleStyle: React.CSSProperties = {
    fontWeight: 700,
    color: '#0f172a',
    fontFamily: fontFamily(typography, 'heading'),
  };
  const subtitle = entry.subtitle ? (
    <span style={{ color: '#475569' }}>{entry.subtitle}</span>
  ) : null;
  const meta = entry.meta ? <Meta>{entry.meta}</Meta> : null;
  const location = entry.location ? (
    <div style={{ color: '#64748b', fontSize: '0.92em' }}>{entry.location}</div>
  ) : null;
  const description = entry.description ? (
    <p style={{ margin: '2px 0 0', color: '#334155' }}>{entry.description}</p>
  ) : null;
  const tags =
    entry.tags.length > 0 ? (
      <div style={{ color: '#475569', fontSize: '0.92em', marginTop: 2 }}>
        {entry.tags.join(' · ')}
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
      <Bullets bullets={entry.bullets} structure={structure} accent={accent} />
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
            <div style={{ color: '#475569', fontSize: '0.93em' }}>{entry.subtitle}</div>
          )}
          {meta && <div style={{ marginTop: 2 }}>{meta}</div>}
        </div>
        <div style={{ minWidth: 0 }}>
          {location}
          {description}
          <Bullets bullets={entry.bullets} structure={structure} accent={accent} />
          {tags}
          {url}
        </div>
      </div>
    );
  }

  if (layout === 'cards') {
    return (
      <div
        style={{
          ...common,
          border: '1px solid #e2e8f0',
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
        style={{
          ...common,
          border: '1px solid #e2e8f0',
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
        style={{
          ...common,
          border: '1px solid #e2e8f0',
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
      <div style={{ ...common, display: 'flex', gap: 10 }}>
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
          <span style={{ flex: 1, width: 1, backgroundColor: '#cbd5e1', marginTop: 3 }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>{content}</div>
      </div>
    );
  }

  return <div style={common}>{content}</div>;
}

function SkillsBlock({
  skills,
  style,
  accent,
}: {
  skills: string[];
  style: CvSkillsStyle;
  accent: string;
}) {
  if (skills.length === 0) return null;
  if (style === 'chips') {
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
  if (style === 'bars') {
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
  if (style === 'columns') {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '2px 14px',
        }}
      >
        {skills.map((skill) => (
          <span key={skill}>{skill}</span>
        ))}
      </div>
    );
  }
  if (style === 'grouped') {
    return (
      <div style={{ display: 'grid', gap: 3 }}>
        {skills.map((skill) => (
          <div key={skill} style={{ display: 'flex', gap: 6 }}>
            <span aria-hidden="true" style={{ color: accent }}>
              /
            </span>
            <span>{skill}</span>
          </div>
        ))}
      </div>
    );
  }
  return <div>{skills.join(' · ')}</div>;
}

function SectionBody({
  section,
  structure,
  accent,
  density,
  typography,
  layout,
}: {
  section: CvDocumentSection;
  structure: CvTemplateStructure;
  accent: string;
  density: CvDensity;
  typography: CvTypography;
  layout: CvTemplateLayout;
}) {
  if (section.kind === 'text') {
    return (
      <p style={{ margin: 0, color: '#334155', whiteSpace: 'pre-wrap' }}>{section.text}</p>
    );
  }
  if (section.kind === 'inline') {
    return (
      <SkillsBlock
        skills={section.inline ?? []}
        style={section.key === 'skills' ? structure.skillsStyle : 'inline'}
        accent={accent}
      />
    );
  }

  // A card grid is the layout, not a decoration: the entries are set as
  // cards whether or not the entry style says so.
  const isCardGrid = layout === 'cards' && section.key !== 'links';
  const isGrid = structure.entryStyle === 'grid' && section.key !== 'links';

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
              <span style={{ flex: 1, width: 1, backgroundColor: '#cbd5e1', marginTop: 3 }} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <EntryBlock
                entry={entry}
                structure={structure}
                accent={accent}
                density={density}
                typography={typography}
                layout={layout}
              />
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
        <EntryBlock
          key={entry.id}
          entry={entry}
          structure={structure}
          accent={accent}
          density={density}
          typography={typography}
          layout={layout}
        />
      ))}
    </div>
  );
}

function SectionList({
  sections,
  structure,
  accent,
  density,
  typography,
  startIndex = 0,
  layout,
}: {
  sections: CvDocumentSection[];
  structure: CvTemplateStructure;
  accent: string;
  density: CvDensity;
  typography: CvTypography;
  startIndex?: number;
  layout: CvTemplateLayout;
}) {
  return (
    <div style={{ display: 'grid', gap: CV_TEMPLATE_DENSITY[density].gap }}>
      {sections.map((section, index) => (
        <section key={section.key} className="cv-section" style={{ breakInside: 'avoid-page' }}>
          <SectionHeading
            section={section}
            index={startIndex + index}
            structure={structure}
            accent={accent}
            typography={typography}
          />
          <SectionBody
            section={section}
            structure={structure}
            accent={accent}
            density={density}
            typography={typography}
            layout={layout}
          />
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

function Header({
  document,
  structure,
  accent,
  typography,
}: {
  document: CvDocument;
  structure: CvTemplateStructure;
  accent: string;
  typography: CvTypography;
}) {
  const nameStyle: React.CSSProperties = {
    margin: 0,
    fontFamily: fontFamily(typography, 'heading'),
    fontWeight: 800,
    lineHeight: 1.08,
    letterSpacing: '-0.01em',
  };
  const titleStyle: React.CSSProperties = {
    margin: '3px 0 0',
    color: accent,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    fontSize: '0.95em',
  };
  const rule: React.CSSProperties = { height: 2, backgroundColor: accent, margin: '9px 0' };

  switch (structure.header) {
    case 'left':
      return (
        <header style={{ marginBottom: CV_TEMPLATE_DENSITY[structure.density].gap }}>
          <h1 style={{ ...nameStyle, fontSize: 30 }}>{document.fullName}</h1>
          {document.title && <p style={titleStyle}>{document.title}</p>}
          <div style={{ marginTop: 6 }}>
            <ContactLine contact={document.contact} align="start" color="#475569" />
          </div>
          <div style={rule} />
        </header>
      );
    case 'banner':
      return (
        <header
          style={{
            margin: `-${CV_TEMPLATE_DENSITY[structure.density].pad}px -${CV_TEMPLATE_DENSITY[structure.density].pad}px 0`,
            padding: `${Math.max(20, CV_TEMPLATE_DENSITY[structure.density].pad - 6)}px ${CV_TEMPLATE_DENSITY[structure.density].pad}px`,
            backgroundColor: accent,
            color: '#ffffff',
            marginBottom: CV_TEMPLATE_DENSITY[structure.density].gap,
          }}
        >
          <h1 style={{ ...nameStyle, fontSize: 33, color: '#ffffff' }}>{document.fullName}</h1>
          {document.title && (
            <p style={{ ...titleStyle, color: '#ffffffdd', marginTop: 4 }}>{document.title}</p>
          )}
          <div style={{ marginTop: 8 }}>
            <ContactLine contact={document.contact} align="start" color="#ffffffdd" />
          </div>
        </header>
      );
    case 'split':
      return (
        <header style={{ marginBottom: CV_TEMPLATE_DENSITY[structure.density].gap }}>
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
              <h1 style={{ ...nameStyle, fontSize: 31 }}>{document.fullName}</h1>
              {document.title && <p style={titleStyle}>{document.title}</p>}
            </div>
            <div style={{ textAlign: 'end', maxWidth: '48%' }}>
              <ContactLine contact={document.contact} align="end" color="#475569" gap={7} />
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
            marginBottom: CV_TEMPLATE_DENSITY[structure.density].gap,
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
            <h1 style={{ ...nameStyle, fontSize: 27 }}>{document.fullName}</h1>
            {document.title && <p style={{ ...titleStyle, marginTop: 1 }}>{document.title}</p>}
            <div style={{ marginTop: 4 }}>
              <ContactLine contact={document.contact} align="start" color="#475569" gap={8} />
            </div>
          </div>
        </header>
      );
    }
    case 'stacked':
      return (
        <header style={{ marginBottom: CV_TEMPLATE_DENSITY[structure.density].gap }}>
          <div style={{ height: 5, backgroundColor: accent, marginBottom: 9 }} />
          <h1 style={{ ...nameStyle, fontSize: 30 }}>{document.fullName}</h1>
          {document.title && <p style={titleStyle}>{document.title}</p>}
          <div style={{ marginTop: 5 }}>
            <ContactLine contact={document.contact} align="start" color="#475569" />
          </div>
        </header>
      );
    case 'editorial':
      return (
        <header style={{ marginBottom: CV_TEMPLATE_DENSITY[structure.density].gap }}>
          <h1
            style={{
              ...nameStyle,
              fontSize: 38,
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontWeight: 700,
            }}
          >
            {document.fullName}
          </h1>
          {document.title && (
            <p
              style={{
                margin: '4px 0 0',
                color: '#334155',
                fontSize: '1.05em',
                fontStyle: 'italic',
              }}
            >
              {document.title}
            </p>
          )}
          <div style={{ marginTop: 7 }}>
            <ContactLine contact={document.contact} align="start" color="#475569" />
          </div>
          <div style={{ borderTop: `3px double ${accent}`, marginTop: 9 }} />
        </header>
      );
    case 'compact':
      return (
        <header style={{ marginBottom: CV_TEMPLATE_DENSITY[structure.density].gap }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <h1 style={{ ...nameStyle, fontSize: 24 }}>{document.fullName}</h1>
            {document.title && (
              <span style={{ color: accent, fontWeight: 600, fontSize: '0.96em' }}>
                {document.title}
              </span>
            )}
          </div>
          <div style={{ marginTop: 3 }}>
            <ContactLine contact={document.contact} align="start" color="#475569" gap={8} />
          </div>
          <div style={{ height: 1, backgroundColor: '#cbd5e1', marginTop: 6 }} />
        </header>
      );
    default:
      return (
        <header
          style={{
            marginBottom: CV_TEMPLATE_DENSITY[structure.density].gap,
            textAlign: 'center',
            borderBottom: '1px solid #e2e8f0',
            paddingBottom: 9,
          }}
        >
          <h1 style={{ ...nameStyle, fontSize: 29 }}>{document.fullName}</h1>
          {document.title && <p style={titleStyle}>{document.title}</p>}
          <div style={{ marginTop: 5 }}>
            <ContactLine contact={document.contact} align="center" color="#475569" />
          </div>
        </header>
      );
  }
}

function AsideBlock({
  sections,
  structure,
  accent,
  density,
  typography,
}: {
  sections: CvDocumentSection[];
  structure: CvTemplateStructure;
  accent: string;
  density: CvDensity;
  typography: CvTypography;
}) {
  return (
    <aside
      style={{
        minWidth: 0,
        borderInlineStart: structure.accentPosition === 'side' ? `2px solid ${accent}` : undefined,
        paddingInlineStart: structure.accentPosition === 'side' ? 12 : 0,
      }}
    >
      <SectionList
        sections={sections}
        structure={{ ...structure, entryStyle: 'stacked', skillsStyle: structure.skillsStyle }}
        accent={accent}
        density={density}
        typography={typography}
        layout={structure.layout}
      />
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
  const structure = resolved.structure;
  const density = structure.density;
  const metrics = CV_TEMPLATE_DENSITY[density];
  const accent = resolved.accent;
  const document = buildCvTemplateDocument(cv, language);
  const ordered = orderCvSections(document.sections, structure.sectionOrder);
  const { main, aside } = splitCvSections(ordered, structure.sidebarSections);
  const hasAside = aside.length > 0;
  const mainColumn = hasAside ? 'minmax(0, 1fr)' : undefined;
  const asideColumn = hasAside
    ? density === 'compact'
      ? 'minmax(118px, 0.42fr)'
      : 'minmax(132px, 0.46fr)'
    : undefined;

  const page: React.CSSProperties = {
    backgroundColor: '#ffffff',
    color: '#1e293b',
    fontFamily: fontFamily(resolved.typography, 'body'),
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

  const asideFirst =
    structure.layout === 'sidebar-left' || (structure.layout === 'editorial' && hasAside);

  const body = hasAside ? (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: asideFirst
          ? `${asideColumn} ${mainColumn}`
          : `${mainColumn} ${asideColumn}`,
        gap: density === 'compact' ? 14 : density === 'spacious' ? 26 : 20,
        alignItems: 'start',
      }}
    >
      {asideFirst && (
        <AsideBlock
          sections={aside}
          structure={structure}
          accent={accent}
          density={density}
          typography={resolved.typography}
        />
      )}
      <div style={{ minWidth: 0 }}>
        <SectionList
          sections={main}
          structure={structure}
          accent={accent}
          density={density}
          typography={resolved.typography}
          layout={structure.layout}
        />
      </div>
      {!asideFirst && (
        <AsideBlock
          sections={aside}
          structure={structure}
          accent={accent}
          density={density}
          typography={resolved.typography}
        />
      )}
    </div>
  ) : (
    <SectionList
      sections={main}
      structure={structure}
      accent={accent}
      density={density}
      typography={resolved.typography}
      layout={structure.layout}
    />
  );

  // A split or an editorial document reads across two columns rather than
  // down one. It is the difference between a wide sheet of text and a page
  // that behaves like a newspaper, and it is what makes the layout the
  // template's own rather than a wrapper around a list.
  const twoColumn = !hasAside && (structure.layout === 'split' || structure.layout === 'editorial');
  const columnedBody = twoColumn ? (
    <div
      style={{
        columnCount: 2,
        columnGap: density === 'compact' ? 16 : 24,
        columnRule: structure.layout === 'editorial' ? `1px solid ${accent}33` : undefined,
      }}
    >
      {body}
    </div>
  ) : (
    body
  );

  const accentEdge =
    structure.accentPosition === 'border'
      ? { borderTop: `4px solid ${accent}`, paddingTop: metrics.pad - 6 }
      : structure.accentPosition === 'side'
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
      <Header
        document={document}
        structure={structure}
        accent={accent}
        typography={resolved.typography}
      />
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
  const document = buildCvTemplateDocument(cv, language);
  return orderCvSections(document.sections, template.structure.sectionOrder).map(
    (section) => section.key
  );
}

/** The kind of a section, used by the library to describe a template. */
export function sectionKindLabel(kind: CvDocumentSectionKind): string {
  if (kind === 'text') return 'paragraph';
  if (kind === 'inline') return 'list';
  return 'entries';
}
