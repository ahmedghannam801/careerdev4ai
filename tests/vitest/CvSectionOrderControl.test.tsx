import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CvSectionOrderControl } from '../../src/components/cv/studio/CvSectionOrderControl';
import { CV_TEMPLATES } from '../../shared/cvTemplates';
import { cvTemplateSample } from '../../shared/cvTemplateSample';
import type { CVProfile } from '../../src/types/career';

const singleColumnTemplate =
  CV_TEMPLATES.find((candidate) => candidate.structure.layout === 'single-column') ??
  CV_TEMPLATES[0];

const sidebarTemplate =
  CV_TEMPLATES.find((candidate) => candidate.structure.layout === 'sidebar-right') ??
  CV_TEMPLATES.find((candidate) => candidate.structure.layout === 'sidebar-left') ??
  CV_TEMPLATES[0];

function renderControl(cv: CVProfile, template = singleColumnTemplate) {
  const update = vi.fn();
  const { container } = render(
    <CvSectionOrderControl
      cv={cv}
      template={template}
      update={update}
      t={(value) => value}
      language="en"
    />
  );
  /**
   * The rows of the SECTION list.
   *
   * The professional links are drawn in a list of their own, so every list item
   * on the screen is not a section; the sections are the rows the layout editor
   * marks as such.
   */
  const sectionRows = (): HTMLElement[] =>
    Array.from(
      container.querySelectorAll<HTMLElement>(
        'li[data-cv-layout-section]:not([data-cv-layout-entry])'
      )
    );
  return { update, container, sectionRows };
}

describe('the order of the sections', () => {
  it('offers every section the document holds', () => {
    const { sectionRows } = renderControl(cvTemplateSample('en'));

    expect(sectionRows().length).toBeGreaterThan(2);
    expect(sectionRows()[0].textContent).toContain('Summary');
  });

  it('moves a section down and writes the whole new order to the document', () => {
    const { update, sectionRows } = renderControl(cvTemplateSample('en'));

    const rows = sectionRows();
    fireEvent.click(screen.getAllByRole('button', { name: /Move .* down/ })[0]);

    expect(update).toHaveBeenCalledTimes(1);
    const written = update.mock.calls[0][0].sectionOrder as string[];
    expect(written).toHaveLength(rows.length);
    expect(written[0]).not.toBe(written[1]);
  });

  it('moves a section up', () => {
    const { update, sectionRows } = renderControl(cvTemplateSample('en'));

    const rows = sectionRows();
    fireEvent.click(screen.getAllByRole('button', { name: /Move .* up/ })[1]);

    expect(update).toHaveBeenCalledTimes(1);
    const written = update.mock.calls[0][0].sectionOrder as string[];
    expect(written).toHaveLength(rows.length);
    expect(written[0]).not.toBe(written[1]);
  });

  it('names the section in the label the screen reader reads', () => {
    renderControl(cvTemplateSample('en'));

    const labels = screen
      .getAllByRole('button', { name: /Move .* (up|down)/ })
      .map((button) => button.getAttribute('aria-label'));
    expect(labels.every((label) => label && label.length > 'Move  up'.length)).toBe(true);
  });

  it('gives every section a drag handle for the pointer', () => {
    const { sectionRows } = renderControl(cvTemplateSample('en'));

    const handles = screen.getAllByRole('button', { name: /^Drag / });
    // One handle per section, plus one per entry row once a section is opened.
    expect(handles.length).toBeGreaterThanOrEqual(sectionRows().length);
  });

  it('puts the order back to the template\'s when the candidate resets it', () => {
    const cv = { ...cvTemplateSample('en'), sectionOrder: ['skills', 'summary'] };
    const { update } = renderControl(cv);

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ sectionOrder: [], layout: {} })
    );
  });

  it('says so when there is nothing to reorder', () => {
    const cv: CVProfile = {
      fullName: '',
      email: '',
      phone: '',
      location: '',
      title: '',
      summary: '',
      experiences: [],
      education: [],
      projects: [],
      skillsList: [],
      certifications: [],
      volunteering: [],
      courses: [],
      internships: [],
      languages: [],
      awards: [],
      publications: [],
      research: [],
      leadership: [],
      links: [],
    };
    renderControl(cv);

    expect(
      screen.getByText('Your CV has one section, so there is nothing to reorder.')
    ).toBeInTheDocument();
  });
});

describe('undoing a layout change', () => {
  it('offers no undo before anything has been changed', () => {
    renderControl(cvTemplateSample('en'));

    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('puts the previous layout back when the candidate undoes a move', () => {
    const cv = { ...cvTemplateSample('en'), sectionOrder: ['skills', 'summary'] };
    const { update } = renderControl(cv);

    fireEvent.click(screen.getAllByRole('button', { name: /Move .* down/ })[0]);
    expect(update).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1][0]).toMatchObject({
      sectionOrder: cv.sectionOrder,
      layout: cv.layout,
      links: cv.links,
    });
  });
});

describe('the contact details and the links', () => {
  it('moves the contact details out of the header into a section of their own', () => {
    const { update } = renderControl(cvTemplateSample('en'));

    const contactRow = screen.getByText('Contact details').closest('div');
    const sectionButton = screen
      .getAllByRole('button', { name: 'Section' })
      .find((button) => contactRow?.contains(button));
    expect(sectionButton).toBeDefined();

    fireEvent.click(sectionButton!);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ layout: expect.objectContaining({ contactPlacement: 'section' }) })
    );
  });

  it('moves one link on its own, without moving the others', () => {
    const { update } = renderControl(cvTemplateSample('en'));

    const linkRow = screen.getByText('GitHub').closest('li');
    const headerButton = screen
      .getAllByRole('button', { name: 'Header' })
      .find((button) => linkRow?.contains(button));
    expect(headerButton).toBeDefined();

    fireEvent.click(headerButton!);

    const written = update.mock.calls[0][0].links as Array<{ id: string; placement?: string }>;
    expect(written.find((link) => link.id === 'link-2')?.placement).toBe('header');
    expect(written.find((link) => link.id === 'link-1')?.placement).toBeUndefined();
    expect(written.find((link) => link.id === 'link-3')?.placement).toBeUndefined();
  });

  it('keeps the links in their own section by default', () => {
    const { update } = renderControl(cvTemplateSample('en'));

    const linksRow = screen.getByText('Professional links').closest('div');
    const sectionButton = screen
      .getAllByRole('button', { name: 'Section' })
      .find((button) => linksRow?.contains(button));
    expect(sectionButton).toBeDefined();

    fireEvent.click(sectionButton!);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ layout: expect.objectContaining({ linksPlacement: 'section' }) })
    );
  });

  it('takes the placement off every link when the layout is reset', () => {
    const cv: CVProfile = {
      ...cvTemplateSample('en'),
      links: (cvTemplateSample('en').links ?? []).map((link) => ({
        ...link,
        placement: 'header' as const,
      })),
    };
    const { update } = renderControl(cv);

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    const written = update.mock.calls[0][0].links as Array<{ placement?: string }>;
    expect(written.every((link) => link.placement === undefined)).toBe(true);
  });
});

describe('the columns of a template that has two', () => {
  it('offers no column control for a template with one column', () => {
    renderControl(cvTemplateSample('en'), singleColumnTemplate);

    expect(screen.queryByRole('button', { name: /to the (side|main) column/ })).toBeNull();
  });

  it('moves a section into the side column of a template that has one', () => {
    const { update } = renderControl(cvTemplateSample('en'), sidebarTemplate);

    const toSide = screen.getAllByRole('button', { name: /to the side column/ })[0];
    fireEvent.click(toSide);

    const written = update.mock.calls[0][0].layout as {
      sectionColumns: Record<string, string>;
    };
    expect(Object.values(written.sectionColumns)).toContain('aside');
  });
});
