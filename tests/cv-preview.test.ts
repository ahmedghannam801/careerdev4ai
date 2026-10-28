/**
 * The CV paper preview, rendered.
 *
 * The preview is what the candidate prints and what an employer reads, so
 * two things are protected here:
 *
 *   - it reflects the document. Everything the editor holds appears on the
 *     page, in the order the editor put it in;
 *   - it is honest. A section with nothing in it is not shown at all,
 *     because a heading with an empty space under it reads as an omission
 *     rather than as an absence.
 *
 * The component is rendered to a string rather than driven through a
 * browser: the rule being checked is which sections appear, and that is
 * settled by the markup.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

import { CvPreview } from '../src/components/cv/CvPreview.tsx';
import type { CVProfile } from '../src/types/career.ts';

const emptyCv: CVProfile = {
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
};

const fullCv: CVProfile = {
  fullName: 'Dana Okonkwo',
  email: 'dana@example.com',
  phone: '+44 7700 900000',
  location: 'Manchester, UK',
  title: 'Backend Engineer',
  summary: 'Backend engineer focused on reliable payments systems.',
  experiences: [
    {
      id: 'e1',
      company: 'Meridian Health',
      role: 'Backend Engineer',
      period: 'Jan 2023 – Present',
      location: 'Manchester, UK',
      bullets: ['Built the billing service.', 'Cut reporting time by 30%.'],
    },
  ],
  education: [
    {
      id: 'ed1',
      institution: 'Northgate University',
      degree: 'BSc',
      field: 'Computer Science',
      period: '2019 – 2022',
      description: 'Focus on distributed systems.',
    },
  ],
  projects: [
    {
      id: 'p1',
      title: 'Demand forecast',
      role: 'Owner',
      technologies: ['Python', 'SQL'],
      bullets: ['Forecast quarterly demand.'],
    },
  ],
  skillsList: ['Python', 'SQL', 'PostgreSQL'],
  certifications: ['ECBA'],
  certificationDetails: [
    {
      name: 'ECBA',
      issuer: 'IIBA',
      issueDate: '2024',
      description: 'Business analysis certification.',
    },
  ],
  links: [
    { id: 'l1', kind: 'linkedin', label: 'LinkedIn', url: 'https://linkedin.com/in/dana', enabled: true },
    { id: 'l2', kind: 'github', label: 'GitHub', url: 'https://github.com/dana', enabled: false },
  ],
  volunteering: [
    {
      id: 'v1',
      organization: 'Refugee Support',
      role: 'Mentor',
      period: '2022 – 2023',
      description: 'Mentored students.',
      bullets: ['Mentored 12 students.'],
    },
  ],
  courses: [
    {
      id: 'c1',
      title: 'Intro to SQL',
      provider: 'Coursera',
      description: 'Querying relational databases.',
    },
  ],
};

const render = (cv: CVProfile) => renderToStaticMarkup(React.createElement(CvPreview, { cv }));

describe('cv paper preview', () => {
  it('shows every section the document holds', () => {
    const html = render(fullCv);
    for (const heading of [
      'Professional Summary',
      'Work Experience',
      'Volunteering',
      'Projects',
      'Education',
      'Core Skills &amp; Technologies',
      'Certifications',
      'Completed Courses',
    ]) {
      assert.ok(html.includes(heading), `the preview must show "${heading}"`);
    }
  });

  it('shows the content of each section', () => {
    const html = render(fullCv);
    assert.ok(html.includes('Dana Okonkwo'));
    assert.ok(html.includes('Backend Engineer'));
    assert.ok(html.includes('Meridian Health'));
    assert.ok(html.includes('Built the billing service.'));
    assert.ok(html.includes('Northgate University'));
    assert.ok(html.includes('Python'));
    assert.ok(html.includes('Refugee Support'));
    assert.ok(html.includes('Mentored 12 students.'));
    assert.ok(html.includes('Intro to SQL'));
  });

  it('shows no section at all when the document is empty', () => {
    const html = render(emptyCv);
    for (const heading of [
      'Professional Summary',
      'Work Experience',
      'Volunteering',
      'Projects',
      'Education',
      'Core Skills',
      'Certifications',
      'Completed Courses',
    ]) {
      assert.ok(!html.includes(heading), `an empty section must not show "${heading}"`);
    }
  });

  it('shows a link the candidate switched on', () => {
    const html = render(fullCv);
    assert.ok(html.includes('https://linkedin.com/in/dana'));
  });

  it('does not show a link the candidate switched off', () => {
    const html = render(fullCv);
    assert.ok(!html.includes('https://github.com/dana'));
  });

  it('does not show an empty contact separator', () => {
    const html = render(emptyCv);
    assert.ok(!html.includes('·'), 'no separator may be printed without a value');
  });

  it('carries the print marker so the print stylesheet can find it', () => {
    const html = render(fullCv);
    assert.ok(html.includes('data-cv-print'));
  });
});
