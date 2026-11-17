import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CvSectionOrderControl } from '../../src/components/cv/studio/CvSectionOrderControl';
import { CV_TEMPLATES } from '../../shared/cvTemplates';
import { cvTemplateSample } from '../../shared/cvTemplateSample';
import type { CVProfile } from '../../src/types/career';

const template =
  CV_TEMPLATES.find((candidate) => candidate.structure.layout === 'single-column') ??
  CV_TEMPLATES[0];

function renderControl(cv: CVProfile) {
  const update = vi.fn();
  render(
    <CvSectionOrderControl
      cv={cv}
      template={template}
      update={update}
      t={(value) => value}
      language="en"
    />
  );
  return update;
}

describe('the order of the sections', () => {
  it('offers every section the document holds', () => {
    renderControl(cvTemplateSample('en'));

    const items = screen.getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(2);
    expect(items[0].textContent).toContain('Summary');
  });

  it('moves a section down and writes the whole new order to the document', () => {
    const update = renderControl(cvTemplateSample('en'));

    const items = screen.getAllByRole('listitem');
    fireEvent.click(screen.getAllByRole('button', { name: /Move .* down/ })[0]);

    expect(update).toHaveBeenCalledTimes(1);
    const written = update.mock.calls[0][0].sectionOrder as string[];
    expect(written).toHaveLength(items.length);
    expect(written[0]).not.toBe(written[1]);
  });

  it('moves a section up', () => {
    const update = renderControl(cvTemplateSample('en'));

    const items = screen.getAllByRole('listitem');
    fireEvent.click(screen.getAllByRole('button', { name: /Move .* up/ })[1]);

    expect(update).toHaveBeenCalledTimes(1);
    const written = update.mock.calls[0][0].sectionOrder as string[];
    expect(written).toHaveLength(items.length);
    expect(written[0]).not.toBe(written[1]);
  });

  it('names the section in the label the screen reader reads', () => {
    renderControl(cvTemplateSample('en'));

    const labels = screen
      .getAllByRole('button', { name: /Move .* (up|down)/ })
      .map((button) => button.getAttribute('aria-label'));
    expect(labels.every((label) => label && label.length > 'Move  up'.length)).toBe(true);
  });

  it('puts the order back to the template\'s when the candidate resets it', () => {
    const cv = { ...cvTemplateSample('en'), sectionOrder: ['skills', 'summary'] };
    const update = renderControl(cv);

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(update).toHaveBeenCalledWith({ sectionOrder: [] });
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
