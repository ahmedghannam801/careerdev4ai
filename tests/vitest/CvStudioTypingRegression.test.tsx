/**
 * The CV Studio must not lose what the candidate is typing.
 *
 * `tests/cv-data-loss.test.ts` proves the rule that broke the studio: the
 * projection that keeps the document in step with the platform's records used
 * to trim the header and let the record win, so a space typed between two
 * words vanished.
 *
 * That test is about the rule. This one is about the screen: it types into the
 * real editor, inside the real studio, and watches the field the candidate is
 * looking at. A rule can be correct and the screen still lose the text — an
 * input that trims it, a field that is remounted on every keystroke, an effect
 * that resets the form, a pane that is torn down when the candidate looks at
 * the paper and comes back.
 *
 * The harness keeps the studio's own contract: the document is updated the
 * moment the candidate types, and the record the profile holds comes back one
 * keystroke later. The projection that the studio runs between those two
 * moments is the real one.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

vi.mock('../../src/context/CareerContext', async () => {
  const React = await import('react');
  const { mergeCanonicalCvDocument } = await import('../../shared/cvProjection');
  const { FREE_CV_TEMPLATE_ID } = await import('../../shared/cvTemplates');

  /** The document the studio starts with. */
  const emptyCv = {
    fullName: '',
    email: '',
    phone: '',
    location: '',
    title: '',
    summary: '',
    experiences: [],
    education: [],
    projects: [],
    volunteering: [],
    certifications: [],
    certificationDetails: [],
    courses: [],
    skillsList: [],
    links: [],
    hiddenRecordIds: [],
    hiddenContactFields: [],
  };

  return {
    useCareer: () => {
      const [cv, setCv] = React.useState<any>(emptyCv);
      // The header values the studio has written to the profile.
      const historyRef = React.useRef<Record<string, string[]>>({});
      // The value whose write is on its way to the server.
      const pendingRef = React.useRef<Record<string, string | undefined>>({});

      const updateCV = React.useCallback((updates: Record<string, unknown>) => {
        setCv((previous: any) => {
          const next = { ...previous, ...updates };
          const profile: Record<string, string> = {};

          for (const [field, value] of Object.entries(updates)) {
            if (typeof value !== 'string') continue;
            // The write that went out before this keystroke lands now, so the
            // record is one keystroke behind the document. This is the exact
            // condition that used to put the older words back on the screen.
            const landed = pendingRef.current[field];
            pendingRef.current[field] = value;
            const history = historyRef.current[field] ?? [];
            if (landed !== undefined && history[history.length - 1] !== landed) {
              history.push(landed);
            }
            historyRef.current[field] = history;
            profile[field] = landed ?? value;
          }

          // The real projection, run between the keystroke and the record.
          return mergeCanonicalCvDocument(
            { profile } as any,
            next,
            { history: historyRef.current }
          );
        });
      }, []);

      return {
        activeCV: cv,
        updateCV,
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
        savedRoles: [],
        saveRole: vi.fn(),
        removeSavedRole: vi.fn(),
        setPrimaryTargetRole: vi.fn(),
        refreshProfileLinks: vi.fn(),
      };
    },
  };
});

// The assistant panels and the network helpers are not part of this rule.
vi.mock('../../src/components/cv/AiAssist', () => ({ AiAssist: () => <div /> }));
vi.mock('../../src/components/cv/HeadlineSuggestions', () => ({
  HeadlineSuggestions: () => <div />,
}));
vi.mock('../../src/components/cv/CvSectionAdvice', () => ({
  CvSectionAdvice: () => <div />,
}));
vi.mock('../../src/lib/coreApi', () => ({
  deleteProfileLink: vi.fn(),
  patchProfileLink: vi.fn(),
  postProfileLink: vi.fn(),
}));
vi.mock('../../src/components/cv/CvPreview', () => ({
  CvPreview: () => <div data-testid="preview-paper" />,
}));
vi.mock('../../src/components/cv/studio/CvDataManager', () => ({
  CvDataManager: () => <div data-testid="data-manager" />,
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
// The section switcher, with the two tabs this test walks between.
vi.mock('../../src/components/cv/studio/CvStudioSectionNav', () => ({
  CvStudioSectionNav: ({
    onSelectTab,
  }: {
    onSelectTab: (tab: string) => void;
  }) => (
    <div data-testid="section-nav">
      <button type="button" onClick={() => onSelectTab('data')}>
        Records
      </button>
      <button type="button" onClick={() => onSelectTab('editor')}>
        Document
      </button>
    </div>
  ),
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

async function renderStudio() {
  // The studio keeps its open tab in the URL, and it only writes a new tab
  // when there is a route to attach it to. The page is opened the way a
  // candidate opens it: at the studio's own address.
  window.location.hash = '#/cv-studio';
  const result = render(<CVStudioView />);
  await act(async () => {
    await Promise.resolve();
  });
  return result;
}

/** The "Full Name" field of the header editor. */
function nameField(container: HTMLElement): HTMLInputElement {
  const label = screen.getByText('Full Name');
  const input = label.parentElement?.querySelector('input');
  if (!input) throw new Error('the header editor has no name field');
  return input as HTMLInputElement;
}

/** The executive summary box. */
function summaryField(container: HTMLElement): HTMLTextAreaElement {
  const textarea = container.querySelector('textarea');
  if (!textarea) throw new Error('the editor has no summary field');
  return textarea as HTMLTextAreaElement;
}

describe('typing in the studio', () => {
  it('keeps the space the candidate types between two words', async () => {
    const { container } = await renderStudio();
    const field = nameField(container);

    // The candidate has typed "Ahmed " and the record has caught up with it.
    fireEvent.change(field, { target: { value: 'Ahmed ' } });

    expect(field.value).toBe('Ahmed ');
  });

  it('keeps every character of a name typed one character at a time', async () => {
    const { container } = await renderStudio();
    const field = nameField(container);
    const typed = 'Ahmed Ghanam';

    for (let length = 1; length <= typed.length; length += 1) {
      const soFar = typed.slice(0, length);
      fireEvent.change(field, { target: { value: soFar } });

      expect(
        field.value,
        `the field showed "${field.value}" after typing "${soFar}"`
      ).toBe(soFar);
    }
  });

  it('does not rebuild the field while the candidate is typing', async () => {
    const { container } = await renderStudio();
    const field = nameField(container);

    fireEvent.change(field, { target: { value: 'Ahmed G' } });

    // The same node is still on the screen: a field that is remounted on every
    // keystroke loses the cursor and the half-typed word with it.
    expect(nameField(container)).toBe(field);
  });

  it('keeps the text when the candidate looks at the paper and comes back', async () => {
    const { container } = await renderStudio();
    const field = nameField(container);

    fireEvent.change(field, { target: { value: 'Ahmed Ghanam' } });

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to Editing' }));

    expect(nameField(container).value).toBe('Ahmed Ghanam');
  });

  it('keeps the text when the candidate visits another part of the studio', async () => {
    const { container } = await renderStudio();

    fireEvent.change(nameField(container), { target: { value: 'Ahmed Ghanam' } });

    // The records are a different tab. The document must be there when the
    // candidate comes back to it.
    fireEvent.click(screen.getByRole('button', { name: 'Records' }));
    expect(screen.getByTestId('data-manager')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Document' }));

    expect(nameField(container).value).toBe('Ahmed Ghanam');
  });

  it('keeps the trailing space and the line breaks of the summary', async () => {
    const { container } = await renderStudio();
    const summary = summaryField(container);

    const text = 'I am a frontend developer.\n\nI am a frontend developer with five years of it. ';
    fireEvent.change(summary, { target: { value: text } });

    expect(summaryField(container).value).toBe(text);
  });
});
