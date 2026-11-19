/**
 * The studio on a phone.
 *
 * A split view does not fit a phone: half a sheet of A4 is unreadable and a
 * form squeezed beside it is worse. The studio therefore shows one full-screen
 * pane at a time on a small screen and keeps the split view on a desktop. The
 * editor is hidden rather than unmounted, so the open section, the cursor and
 * the scroll position survive the switch.
 *
 * These tests drive that switch: which pane is on the screen, what the bottom
 * navigation announces, and that the desktop layout is untouched. The heavy
 * children of the studio (the form, the paper, the network panels) are replaced
 * by markers, because the rule being checked is the pane itself.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

vi.mock('../../src/context/CareerContext', async () => {
  const { cvTemplateSample } = await import('../../shared/cvTemplateSample');
  const { FREE_CV_TEMPLATE_ID } = await import('../../shared/cvTemplates');
  const cv = cvTemplateSample('en');
  const career = {
    activeCV: cv,
    updateCV: vi.fn(),
    loadCVFromMyData: vi.fn(),
    cvVersions: [],
    saveCVVersion: vi.fn(),
    deleteCVVersion: vi.fn(),
    runAiCvOptimization: vi.fn(),
    isOptimizingCV: false,
    cvAnalysisError: null,
    dismissCvAnalysisError: vi.fn(),
    targetRole: null,
    aiPreferences: { writingAssistance: false },
    privacyPreferences: { shareAnalyticsWithAi: false },
    profile: cv,
    ownedSkills: [],
    projects: [],
    volunteerExperiences: [],
    learningItems: [],
    learningCatalog: [],
    settings: { cvTemplateId: FREE_CV_TEMPLATE_ID, resumeLanguage: 'en' },
    activeCvId: 'cv-1',
    t: (value: string) => value,
  };
  return { useCareer: () => career };
});

vi.mock('../../src/components/cv/CvSectionEditor', () => ({
  CvSectionEditor: () => <div data-testid="section-editor" />,
}));
vi.mock('../../src/components/cv/CvPreview', () => ({
  CvPreview: () => <div data-testid="preview-paper" />,
}));
vi.mock('../../src/components/cv/studio/CvSectionOrderControl', () => ({
  CvSectionOrderControl: () => <div data-testid="order-control" />,
}));
vi.mock('../../src/components/cv/studio/ResumeLanguagePicker', () => ({
  ResumeLanguagePicker: () => <div data-testid="language-picker" />,
}));
vi.mock('../../src/components/cv/studio/CvSaveStatusIndicator', () => ({
  CvSaveStatusIndicator: () => <div data-testid="save-status" />,
}));
vi.mock('../../src/components/cv/studio/CvDraftRecovery', () => ({
  CvDraftRecovery: () => <div data-testid="draft-recovery" />,
}));
vi.mock('../../src/components/background/BackgroundJobsPanel', () => ({
  BackgroundJobsPanel: () => <div data-testid="background-jobs" />,
}));
vi.mock('../../src/components/cv/CvStudioWorkflow', () => ({
  CvStudioWorkflow: () => <div data-testid="workflow" />,
}));
vi.mock('../../src/components/cv/CvStudioAiQuotaBadge', () => ({
  CvStudioAiQuotaBadge: () => <div data-testid="ai-quota" />,
}));
vi.mock('../../src/components/cv/studio/CvStudioSectionNav', () => ({
  CvStudioSectionNav: () => <div data-testid="section-nav" />,
}));
vi.mock('../../src/components/ui/CareerImage', () => ({
  CareerImage: () => <span />,
}));
vi.mock('../../src/components/motion/Motion', () => ({
  Reveal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../src/lib/cvTemplatesApi', () => ({
  fetchCvTemplateCatalog: () => Promise.resolve({ templates: [] }),
  authorizeCvTemplateExport: () => Promise.resolve({ allowed: true }),
  downloadCvTemplateDocx: vi.fn(),
}));
vi.mock('../../src/lib/tailoredCvHandoff', () => ({
  takeTailoredCv: () => null,
}));

import { CVStudioView } from '../../src/components/views/CVStudioView';

function panes(container: HTMLElement) {
  return {
    edit: container.querySelector<HTMLElement>('[data-cv-pane="edit"]'),
    preview: container.querySelector<HTMLElement>('[data-cv-pane="preview"]'),
  };
}

async function renderStudio() {
  const result = render(<CVStudioView />);
  // The studio asks the server for its template catalogue on mount; let that
  // settle inside act so the test does not leave a state update in flight.
  await act(async () => {
    await Promise.resolve();
  });
  return result;
}

describe('the studio on a phone', () => {
  it('opens on the editor, with the paper one switch away', async () => {
    const { container } = await renderStudio();
    const { edit, preview } = panes(container);

    expect(edit).toBeTruthy();
    expect(preview).toBeTruthy();
    expect(edit!.className).not.toContain('hidden');
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('turns the paper into a full screen with a way back', async () => {
    const { container } = await renderStudio();

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    const { edit, preview } = panes(container);
    // The form is hidden, not unmounted: its state has to survive the switch.
    expect(edit!.className).toContain('hidden');
    expect(edit!.isConnected).toBe(true);
    expect(preview!.className).toContain('fixed');
    expect(preview!.className).toContain('inset-0');
    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByTestId('preview-paper')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to Editing' }));

    expect(panes(container).edit!.className).not.toContain('hidden');
    expect(panes(container).preview!.className).not.toContain('fixed');
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the split view on a desktop whatever the phone last chose', async () => {
    const { container } = await renderStudio();

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    const { edit, preview } = panes(container);
    // The phone classes are neutralised at `lg`: the editor is a column again
    // and the paper returns to its place beside it.
    expect(edit!.className).toContain('lg:block');
    expect(preview!.className).toContain('lg:static');
    expect(container.querySelector('.lg\\:grid-cols-12')).toBeTruthy();
    // The bottom switch belongs to the phone only. It is a labelled group of
    // toggles rather than a second landmark, so the page keeps one navigation.
    const switcher = container.querySelector<HTMLElement>(
      '[role="group"][aria-label="CV editor view"]'
    );
    expect(switcher).toBeTruthy();
    expect(switcher!.className).toContain('lg:hidden');
    // The safe area of a phone with a home bar is respected.
    expect(switcher!.getAttribute('style')).toContain('safe-area-inset-bottom');
    expect(container.querySelectorAll('nav')).toHaveLength(0);
  });

  it('gives both halves of the switch a touch target', async () => {
    await renderStudio();

    for (const name of ['Edit', 'Preview']) {
      expect(screen.getByRole('button', { name }).className).toContain('min-h-[48px]');
    }
  });
});
