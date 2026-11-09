import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Upload,
  Printer,
  Download,
  Loader2,
  PenLine,
  LayoutTemplate,
  Database,
  History
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { BuiltCvPanel } from '../cv/BuiltCvPanel';
import { JobDescriptionPanel, type JobDescriptionPanelState } from '../cv/JobDescriptionPanel';
import { CvPreview } from '../cv/CvPreview';
import { CvTemplateLibrary } from '../cv/templates/CvTemplateLibrary';
import { CvSectionEditor } from '../cv/CvSectionEditor';
import { Reveal } from '../motion/Motion';
import { CvMeasuredAnalysis } from '../cv/CvMeasuredAnalysis';
import { CvAnalysisPanel } from '../cv/CvAnalysisPanel';
import { CvReviewWorkspace } from '../cv/CvReviewWorkspace';
import { CvStudioWorkflow } from '../cv/CvStudioWorkflow';
import { formatRetryDelay, resolveAtsAnalysisRole } from '../../../shared/atsAnalysis';
import type { CvAnalysisReport } from '../../../shared/cvAnalysis';
import { CV_STUDIO_TABS, cvStudioStepForTab, type CvStudioTab } from '../../lib/routing';
import { useRouteParam } from '../../lib/useRouteParams';
import { useAIProcessing } from '../../lib/useAIProcessing';
import { BackgroundJobsPanel } from '../background/BackgroundJobsPanel';
import { CvDataManager } from '../cv/studio/CvDataManager';
import { CvStudioSectionNav, type CvStudioSection } from '../cv/studio/CvStudioSectionNav';
import { ResumeLanguagePicker } from '../cv/studio/ResumeLanguagePicker';
import { CareerImage } from '../ui/CareerImage';
import {
  authorizeCvTemplateExport,
  downloadCvTemplateDocx,
} from '../../lib/cvTemplatesApi';
import { takeTailoredCv } from '../../lib/tailoredCvHandoff';
import { fetchCvTemplateCatalog } from '../../lib/cvTemplatesApi';
import type { CvTemplateDefinition } from '../../../shared/cvTemplates';

export const CVStudioView: React.FC<{ onNavigate?: (view: string) => void }> = () => {
  const {
    activeCV,
    updateCV,
    loadCVFromMyData,
    cvVersions,
    saveCVVersion,
    runAiCvOptimization,
    isOptimizingCV,
    cvAnalysisError,
    dismissCvAnalysisError,
    targetRole,
    aiPreferences,
    privacyPreferences,
    profile,
    ownedSkills,
    projects,
    volunteerExperiences,
    learningItems,
    learningCatalog,
    settings,
    t } = useCareer();
  const aiWritingEnabled =
    aiPreferences.writingAssistance && privacyPreferences.shareAnalyticsWithAi;
  // The open tab is part of the page, so it lives in the URL: a refresh, a
  // shared link and the Back button all land on the same tab.
  const [activeTab, setActiveTab] = useRouteParam<CvStudioTab>('tab', CV_STUDIO_TABS, 'editor');
  // The step the open tab belongs to. "My CV" owns the document, the records
  // it is built from and its history, so those three tabs all highlight the
  // same step.
  const activeStep = cvStudioStepForTab(activeTab);
  // The secondary views of the "My CV" step. They are revealed from inside
  // the step rather than listed as a navigation of their own, and each one
  // is a button the candidate can press: an icon tells them apart, the
  // open one is filled with the brand colour, and the history carries the
  // number of snapshots it holds.
  const secondarySections: CvStudioSection[] = [
    { tab: 'editor', label: t('Document Editor & Preview'), icon: PenLine },
    { tab: 'templates', label: t('Templates'), icon: LayoutTemplate },
    { tab: 'data', label: t('My Data'), icon: Database },
    { tab: 'versions', label: t('Version History'), icon: History, badge: cvVersions.length },
  ];
  const [showVersionModal, setShowVersionModal] = useState(false);
  // The evidence behind the ATS score is revealed on demand. The score is the
  // answer; the breakdown, the keywords and the rewritten bullets are the
  // reasoning behind it.
  const [showAtsDetails, setShowAtsDetails] = useState(false);
  const [versionName, setVersionName] = useState('');
  // The measurement of this document. The editor shows the advice it holds
  // next to the section each piece of advice is about, so the two cannot
  // drift apart: they come from the same report.
  const [measuredReport, setMeasuredReport] = useState<CvAnalysisReport | null>(null);
  const { run: runAIProcessing, isRunning: isAtsAuditRunning, modal: aiProcessingModal } = useAIProcessing();

  /**
   * Runs the ATS audit through the shared request lifecycle: the request can be
   * stopped while the model is working, and the save phase reports itself so
   * the interface never claims a cancelled save stopped.
   */
  const handleRunAtsAudit = async () => {
    if (isAtsAuditRunning || isOptimizingCV) return;
    await runAIProcessing({
      title: t('ATS Audit'),
      stage: t('Comparing your CV with the role requirements…'),
      failureMessage: t('The ATS audit could not be completed. Please try again.'),
      timeoutMessage: t('The ATS audit timed out. Check your connection and try again.'),
      run: (signal, setPhase) => runAiCvOptimization({ signal, setPhase }),
      onSuccess: () => undefined,
    });
  };

  /**
   * The catalogue the studio draws from.
   *
   * It is the catalogue the SERVER sent, not the one the bundle carries: the
   * server withholds the layout of a template the candidate may not use, so
   * the studio cannot draw a premium template for an account that has not
   * paid for it. An account whose stored choice is such a template simply
   * sees the free one.
   */
  const [studioTemplateCatalog, setStudioTemplateCatalog] = useState<CvTemplateDefinition[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchCvTemplateCatalog()
      .then((catalog) => {
        if (cancelled) return;
        setStudioTemplateCatalog(
          catalog.templates
            .filter((template) => template.structure !== null)
            .map((template) => ({ ...template, structure: template.structure! }))
        );
      })
      .catch((error) => {
        console.error('Failed to load the CV template catalogue for the studio:', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The job description and its analysis live here rather than inside the
  // panel, so a trip to the editor tab does not throw away the advertisement
  // the candidate pasted or the result they already read.
  const [jobDescriptionState, setJobDescriptionState] = useState<JobDescriptionPanelState>({
    jobDescription: '',
    company: '',
    analysis: null,
    match: null,
    generated: null,
    isAnalyzing: false,
    isGenerating: false,    error: null,
    applied: false,
    packageId: null,
  });

  // A vacancy handed over from the Live Jobs screen.
  //
  // The posting arrives with its description and its employer, so the studio
  // opens ready to tailor rather than ready to be told what the job is. The
  // candidate can still change any of it: the panel edits the same state.
  const [tailoredCvNotice, setTailoredCvNotice] = useState<{
    title: string;
    company: string;
  } | null>(null);

  useEffect(() => {
    const request = takeTailoredCv();
    if (!request) return;

    setJobDescriptionState((previous) => ({
      ...previous,
      // The panel is the place the candidate edits, so the handover fills
      // the fields rather than replacing the panel's own state.
      jobDescription: request.description,
      company: request.company,
      // A posting that has not been analysed yet must not look as though it
      // had been: the analysis belongs to the posting that was pasted.
      analysis: null,
      match: null,
      generated: null,
      applied: false,
    }));
    setTailoredCvNotice({ title: request.title, company: request.company });
  }, []);

  const latestVersion = cvVersions[0];
  const latestAnalysis = latestVersion?.atsAnalysis;
  const analysisRole = resolveAtsAnalysisRole(
    latestVersion?.targetRoleTitle,
    targetRole.title
  );
  const analysisRoleLabel = analysisRole.roleTitle ?? t('your saved CV');
  const retryDelay = formatRetryDelay(cvAnalysisError?.retryAfterSeconds);

  // The records the editor writes from. Only a course the candidate has
  // actually completed is offered, because an in-progress course is not a
  // line on a CV.
  const completedCourses = learningItems
    .filter((item) => item.status === 'completed')
    .map((item) => {
      const course = learningCatalog.find((entry) => entry.id === item.courseId);
      return course
        ? { id: item.id, title: course.title, provider: course.provider }
        : null;
    })
    .filter((entry): entry is { id: string; title: string; provider: string } => entry !== null);

  const editorSource = {
    experiences: profile.experiences.map((entry) => ({
      id: entry.id,
      role: entry.role,
      company: entry.company,
    })),
    projects: projects.map((entry) => ({ id: entry.id, title: entry.title })),
    volunteering: volunteerExperiences.map((entry) => ({
      id: entry.id,
      organization: entry.organization,
      role: entry.role,
    })),
    certifications: profile.certifications.map((entry) => ({ id: entry.id, name: entry.name })),
    courses: completedCourses,
  };

  // The skills the candidate has actually rated. The assistant is told to
  // choose from these and from nothing else: a skill the candidate has not
  // claimed is not theirs to put on a CV.
  const ratedSkills = ownedSkills.map((skill) => skill.name);
  // Export state. A PDF is produced by the browser printing the real
  // template, so the server is asked first; a DOCX is built by the server.
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExportingDocx, setIsExportingDocx] = useState(false);

  /**
   * Prints the CV.
   *
   * The paper is the browser's print of the real rendered template — that is
   * what preserves Arabic shaping, the selected text and the exact layout. The
   * server still decides whether this candidate may export the template, so
   * the print starts only after the authorisation route says yes.
   */
  const handlePrint = async () => {
    setExportError(null);
    try {
      const result = await authorizeCvTemplateExport(settings.cvTemplateId);
      if (!result.allowed) {
        setExportError(t('This template is not available on your plan.'));
        return;
      }
      window.print();
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : t('The PDF export could not be authorised. Please try again.')
      );
    }
  };

  /** Downloads the editable Word file built by the server. */
  const handleDocxExport = async () => {
    if (isExportingDocx) return;
    setIsExportingDocx(true);
    setExportError(null);
    try {
      await downloadCvTemplateDocx({
        templateId: settings.cvTemplateId,
        cv: activeCV,
        language: settings.resumeLanguage,
        fileName: `${activeCV.fullName?.trim() || 'CV'}.docx`,
      });
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : t('The Word export could not be completed. Please try again.')
      );
    } finally {
      setIsExportingDocx(false);
    }
  };

  const handleSaveVersion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!versionName.trim()) return;
    saveCVVersion(versionName.trim());
    setVersionName('');
    setShowVersionModal(false);
  };

  return (
    <Reveal className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-3.5">
          <CareerImage
            src="/images/features/cv-studio.webp"
            alt="CV Studio"
            size="sm"
            aspectRatio="square"
            rounded="rounded-xl"
            className="hidden h-14 w-14 shrink-0 border border-[var(--border-subtle)] object-cover shadow-xs sm:block"
          />
          <div>
            <div className="text-xs text-[var(--text-secondary)]">{t('CV WORKSPACE & ATS OPTIMIZER')}</div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
              {t('CV Studio for')} {targetRole.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('review')}
            className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:bg-[var(--surface-secondary)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{t('Import / Paste')}</span>
          </button>

          {/* The audit belongs to the step that reads its result, so it is
              offered there rather than in every step of the studio. */}
          {activeStep === 'analyze' && (
            <button
              onClick={handleRunAtsAudit}
              disabled={isOptimizingCV || !aiWritingEnabled}
              title={
                aiWritingEnabled
                  ? undefined
                  : t('Enable AI Writing Assistance and Career Graph AI Grounding in Settings.')
              }
              className="px-3.5 py-1.5 rounded-lg bg-[var(--surface-secondary)] hover:bg-[var(--accent-surface)] text-[var(--color-primary-text)] border border-[var(--border-subtle)] text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isOptimizingCV ? 'animate-spin' : ''}`} />
              <span>{isOptimizingCV ? t('Analyzing ATS Keywords...') : t('Run ATS Audit')}</span>
            </button>
          )}

          {/* Printing and the editable Word file are offered only where
              there is a document to export. The print stylesheet keeps the
              paper preview and nothing else, so an export started from
              another tab would come out blank. */}
          {activeTab === 'editor' && (
            <>
              <button
                onClick={handleDocxExport}
                disabled={isExportingDocx}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {isExportingDocx ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>{isExportingDocx ? t('Preparing Word file...') : t('Download Word (DOCX)')}</span>
              </button>
              <button
                onClick={handlePrint}
                className="px-4 py-1.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{t('Print / Export PDF')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* The language of the document.
          It is a studio setting, not a header one: the language the CV is
          written in is a property of the CV, and the interface language is a
          separate setting that this must never move. */}
      <ResumeLanguagePicker />

      {/* The background jobs of this candidate. The list is read back from the
          server, so a CV that finished while the tab was closed is still
          here when the studio is opened again. */}
      <BackgroundJobsPanel />

      {exportError && (
        <div
          role="alert"
          className="p-4 rounded-xl border border-[var(--color-danger)]/25 bg-[var(--color-danger)]/10 flex items-start gap-3"
        >
          <AlertCircle className="w-4 h-4 text-[var(--color-danger)] shrink-0 mt-0.5" />
          <p className="flex-1 text-xs text-[var(--text-secondary)] leading-relaxed">{exportError}</p>
          <button
            onClick={() => setExportError(null)}
            className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            {t('Dismiss')}
          </button>
        </div>
      )}

      {/* A failed audit is shown where the user started it, with the real
          provider reason and any retry window. It is never only logged. */}
      {cvAnalysisError && (
        <div
          role="alert"
          className="p-4 rounded-xl border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 flex items-start gap-3"
        >
          <AlertCircle className="w-4 h-4 text-[var(--color-warning)] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-1">
            <div className="text-xs font-bold text-[var(--text-primary)]">
              {t('ATS audit unavailable')}
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {cvAnalysisError.message}
            </p>
            {retryDelay && (
              <p className="text-[11px] text-[var(--color-warning)] font-medium">
                {t('Try again in about')} {retryDelay}.
              </p>
            )}
          </div>
          <button
            onClick={dismissCvAnalysisError}
            className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            {t('Dismiss')}
          </button>
        </div>
      )}

      {/* The path through the studio. Every step is a part of this workspace,
          so a candidate never has to open somewhere else to finish the job.
          This is the studio's only navigation: the steps below are the whole
          of it. */}
      <CvStudioWorkflow
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        t={t}
      />

      {/* The two secondary views of "My CV": the records the document is built
          from and the history of its versions. They belong to the step, so
          they are revealed from inside it rather than offered as a second
          navigation of their own. */}
      {activeStep === 'cv' && (
        <CvStudioSectionNav
          sections={secondarySections}
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab)}
          t={t}
        />
      )}

      {/* TAB 0: THE RECORDS THE CV IS BUILT FROM */}
      {activeTab === 'data' && <CvDataManager />}

      {/* The structure of the document. Choosing a template changes the
          presentation only; the content is rebuilt from the same records. */}
      {activeTab === 'templates' && (
        <CvTemplateLibrary onOpenEditor={() => setActiveTab('editor')} />
      )}

      {/* The import that is also a review. The document is read first and
          nothing is written until the candidate has looked at it. */}
      {activeTab === 'review' && (
        <CvReviewWorkspace
          onApplied={() => {
            setActiveTab('editor');
          }}
        />
      )}

      {/* TAB 0: THE CV ASSEMBLED FROM THE USER'S OWN RECORDS */}
      {activeTab === 'built' && <BuiltCvPanel />}

      {/* TAB 1: THE JOB DESCRIPTION */}
      {activeTab === 'job' && (
        <div className="space-y-4">
          {/* The posting that came from the Live Jobs screen. It says where
              the description came from, because a description the candidate
              did not write themselves must look different from one they
              pasted. */}
          {tailoredCvNotice && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-2xl border border-[var(--accent-primary)]/25 bg-[var(--accent-surface)] px-4 py-3"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-primary)]" />
              <div className="min-w-0 text-xs">
                <p className="font-semibold text-[var(--text-primary)]">
                  {t('Brought over from Live Jobs')}
                </p>
                <p className="mt-0.5 text-[var(--text-secondary)]">
                  {t('{title} at {company}').replace('{title}', tailoredCvNotice.title).replace('{company}', tailoredCvNotice.company)}
                </p>
                <p className="mt-1 text-[var(--text-muted)]">
                  {t('The posting has been filled in for you. Edit it here if you want to change anything before the CV is tailored to it.')}
                </p>
              </div>
            </div>
          )}
          <JobDescriptionPanel state={jobDescriptionState} setState={setJobDescriptionState} />
        </div>
      )}

      {/* TAB 1: DOCUMENT EDITOR */}
      {activeTab === 'editor' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Form Controls (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <CvSectionEditor
              cv={activeCV}
              update={updateCV}
              targetRoleTitle={targetRole.title}
              source={editorSource}
              ratedSkills={ratedSkills}
              advice={measuredReport}
            />

            <button
              onClick={() => setShowVersionModal(true)}
              className="w-full py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--text-primary)] transition-colors"
            >
              {t('Save as New Version Snapshot')}
            </button>

            <button
              onClick={loadCVFromMyData}
              className="w-full py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--text-primary)] transition-colors flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" />
              {t('Fill from my records')}
            </button>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed -mt-2">
              {t(
                'Brings in your experience, education, projects, volunteering, completed courses, certificates and rated skills. Anything you have already written is kept.'
              )}
            </p>
          </div>

          {/* Right Clean Paper Preview (7 cols) */}
          <div className="lg:col-span-7">
            <CvPreview
              cv={activeCV}
              language={settings.resumeLanguage}
              templateId={settings.cvTemplateId}
              catalog={studioTemplateCatalog}
            />
          </div>
        </div>
      )}

      {/* STEP "Analyze": the two systems that read the document, kept apart.
          The score for the target role is the answer the candidate came for,
          so it comes first; the evidence behind it is revealed on demand. */}
      {activeTab === 'ats' && (
        <div className="space-y-6">
          {latestAnalysis ? (
            <>
              {analysisRole.isStale && (
                <div className="p-4 rounded-xl border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 flex flex-col sm:flex-row sm:items-center gap-3">
                  <AlertCircle className="w-4 h-4 text-[var(--color-warning)] shrink-0" />
                  <div className="flex-1 text-xs text-[var(--text-secondary)] leading-relaxed">
                    <span className="font-bold text-[var(--text-primary)]">
                      {t('This analysis is out of date for your target role.')}
                    </span>{' '}
                    {t('It was generated for')} {analysisRoleLabel}
                    {t(', but your current target is')} {targetRole.title}
                    {t('. The score below has not been applied to your current readiness.')}
                  </div>
                  <button
                    onClick={handleRunAtsAudit}
                    disabled={isOptimizingCV || !aiWritingEnabled}
                    title={
                      aiWritingEnabled
                        ? undefined
                        : t('Enable AI Writing Assistance and Career Graph AI Grounding in Settings.')
                    }
                    className="px-3 py-1.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-[11px] font-semibold whitespace-nowrap disabled:opacity-50"
                  >
                    {isOptimizingCV ? t('Analyzing…') : `${t('Audit for')} ${targetRole.title}`}
                  </button>
                </div>
              )}
              <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary-text)]">{t('ATS Match Diagnostic')}</span>
                    <h2 className="text-xl font-bold text-[var(--text-primary)] mt-0.5">
                      {t('Alignment for')} {analysisRoleLabel}
                    </h2>
                    {analysisRole.isStale && (
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        {t('Current target:')} {targetRole.title}
                      </p>
                    )}
                  </div>
                  <div className="text-end">
                    <div className="text-3xl font-extrabold font-mono tabular-nums text-[var(--color-primary-text)]">
                      {latestAnalysis.overallScore} / 100
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">{t('Benchmark Passing Score: 75')}</div>
                  </div>
                </div>

                {/* The score is the answer. The breakdown, the keywords and the
                    rewritten bullets are the evidence behind it, so they are
                    revealed when the candidate asks for them instead of
                    crowding the answer. */}
                <button
                  type="button"
                  onClick={() => setShowAtsDetails((open) => !open)}
                  aria-expanded={showAtsDetails}
                  className="text-xs font-semibold text-[var(--color-primary-text)] hover:underline"
                >
                  {showAtsDetails ? t('Hide') : t('Show details')}
                </button>

                {showAtsDetails && (
                  <div className="space-y-6">
                    {/* Breakdown bars */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-[var(--border-subtle)]">
                      {Object.entries(latestAnalysis.breakdown).map(([key, val]) => (
                        <div key={key} className="p-3.5 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)]">
                          <div className="text-[11px] text-[var(--text-secondary)] capitalize">{key.replace(/([A-Z])/g, ' $1')}</div>
                          <div className="text-xl font-bold font-mono tabular-nums text-[var(--text-primary)] mt-1">{val}%</div>
                        </div>
                      ))}
                    </div>

                    {/* Matched vs Missing Keywords */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                      <div className="p-4 rounded-xl bg-[var(--surface-secondary)]/30 border border-[var(--border-subtle)] space-y-2">
                        <div className="text-xs font-bold text-[var(--color-success-strong)] flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{t('Matched Keywords')} ({latestAnalysis.matchedKeywords.length})</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {latestAnalysis.matchedKeywords.map((kw, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded bg-[var(--surface-main)] border border-[var(--border-subtle)] text-[var(--text-primary)]">
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-[var(--surface-secondary)]/30 border border-[var(--border-subtle)] space-y-2">
                        <div className="text-xs font-bold text-[var(--color-warning)] flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4" />
                          <span>{t('Missing Role Keywords')} ({latestAnalysis.missingKeywords.length})</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {latestAnalysis.missingKeywords.map((kw, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded bg-[var(--surface-main)] border border-[var(--border-subtle)] text-[var(--color-warning)] font-medium">
                              + {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Bullet Point Improvements */}
                    <div className="space-y-3 pt-2">
                      <h3 className="text-sm font-bold text-[var(--text-primary)]">{t('Actionable Bullet Point Improvements')}</h3>
                      <div className="space-y-3">
                        {latestAnalysis.actionableImprovements.map((imp, i) => (
                          <div key={i} className="p-4 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] space-y-2 text-xs">
                            {imp.currentText && (
                              <div>
                                <span className="font-semibold text-[var(--text-muted)]">{t('Current:')} </span>
                                <span className="line-through text-[var(--text-secondary)]">{imp.currentText}</span>
                              </div>
                            )}
                            <div>
                              <span className="font-semibold text-[var(--color-success-strong)]">{t('Suggested:')} </span>
                              <span className="font-medium text-[var(--text-primary)]">{imp.suggestedText}</span>
                            </div>
                            <div className="text-[11px] text-[var(--color-primary-text)] font-medium pt-1">
                              {t('Reason:')} {imp.reason}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Empty ATS state: a missing analysis must be explained, not a
               blank tab. */
            <div className="p-8 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] text-center space-y-3">
              <Sparkles className="w-6 h-6 text-[var(--color-primary-text)] mx-auto" />
              <h2 className="text-lg font-bold text-[var(--text-primary)]">{t('No ATS analysis yet')}</h2>
              <p className="text-xs text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
                {t('Run an ATS audit to compare this CV against the keywords and requirements for')}{' '}
                {targetRole.title}.
              </p>
              <button
                onClick={handleRunAtsAudit}
                disabled={isOptimizingCV || !aiWritingEnabled}
                title={
                  aiWritingEnabled
                    ? undefined
                    : t('Enable AI Writing Assistance and Career Graph AI Grounding in Settings.')
                }
                className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold disabled:opacity-50"
              >
                {isOptimizingCV ? t('Analyzing…') : t('Run ATS Audit')}
              </button>
              {!aiWritingEnabled && (
                <p className="text-[11px] text-[var(--color-warning)]">
                  {t('Enable AI Writing Assistance and Career Graph AI Grounding in Settings to run an audit.')}
                </p>
              )}
            </div>
          )}

          {/* The measured analysis is counted from the document itself, so it
              does not wait for a model and it does not change because a
              provider was busy. It is its own system, and it is not the AI ATS
              score above. */}
          <CvMeasuredAnalysis
            cv={activeCV}
            targetRoleTitle={targetRole.title}
            targetRoleSkills={targetRole.requiredSkills.map(s => s.name)}
            onMeasured={setMeasuredReport}
          />
          {/* The analyzer's own run, now part of the studio.
              The CV Analyzer page used to be a separate place with a
              separate upload; this is the same measurement, with the same
              stages and the same history, reachable without leaving the
              document the candidate is working on. The upload and the
              saved-CV picker come with it, so a candidate can measure a
              document they have not imported yet without leaving the studio
              either — and measuring a file never replaces the CV they are
              working on. */}
          <CvAnalysisPanel
            cv={activeCV}
            jobDescription={jobDescriptionState.jobDescription}
            showUpload
          />
        </div>
      )}

      {/* TAB 3: VERSIONS */}
      {activeTab === 'versions' && (
        <div className="space-y-4">
          <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 shadow-xs">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">{t('Saved CV Snapshots')}</h3>
            <div className="space-y-3">
              {cvVersions.map((v) => (
                <div key={v.id} className="p-4 rounded-xl bg-[var(--surface-secondary)]/40 border border-[var(--border-subtle)] flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-sm text-[var(--text-primary)]">{v.name}</div>
                    <div className="text-[var(--text-muted)]">
                      {t('Target:')} {v.targetRoleTitle || t('Not recorded')} · {t('Created')} {v.createdAt}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {v.atsAnalysis && (
                      <span className="font-mono font-bold text-[var(--color-primary-text)]">
                        ATS {v.atsAnalysis.overallScore}%
                      </span>
                    )}
                    <button
                      onClick={() => updateCV(v.profile)}
                      className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--text-primary)]"
                    >
                      {t('Restore Snapshot')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Snapshot Modal */}
      {showVersionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-[var(--surface-main)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">{t('Save CV Version')}</h3>
            <form onSubmit={handleSaveVersion} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">{t('Version Name')}</label>
                <input
                  type="text"
                  required
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                  placeholder={t('e.g. Frontend Engineer - Tech Focus v2')}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowVersionModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-secondary)]"
                >
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[var(--accent-primary)] text-[var(--color-on-primary)] text-xs font-semibold hover:bg-[var(--accent-secondary)] hover:shadow-sm transition-[background-color,box-shadow]"
                >
                  {t('Save Snapshot')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {aiProcessingModal}
    </Reveal>
  );
};
