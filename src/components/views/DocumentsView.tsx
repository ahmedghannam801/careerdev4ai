import React, { useState } from 'react';
import { 
  FileText, 
  ExternalLink, 
  Trash2, 
  Copy, 
  Check, 
  Sparkles, 
  Filter, 
  Layers, 
  Lock, 
  Unlock, 
  FileCode
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { Reveal, Stagger, StaggerItem } from '../motion/Motion';

export const DocumentsView: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  const { 
    documents, 
    deleteDocument, 
    cvVersions, 
    duplicateCVVersion, 
    renameCVVersion, 
    deleteCVVersion, 
    coverLetters, 
    saveCoverLetter, 
    generateAiCoverLetter, 
    applications,
    aiPreferences,
    privacyPreferences, t} = useCareer();

  // AI requests are opt-in for writing and for sharing the career graph with
  // the provider. Both Settings controls must be on before the button runs.
  const aiWritingEnabled =
    aiPreferences.writingAssistance && privacyPreferences.shareAnalyticsWithAi;

  const [activeTab, setActiveTab] = useState<'documents' | 'cv-versions' | 'cover-letters'>('documents');
  const [docTypeFilter, setDocTypeFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Rename CV Modal
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newCvName, setNewCvName] = useState('');

  // Cover Letter Generator Studio Form
  const [clForm, setClForm] = useState({
    company: '',
    jobTitle: '',
    jobDescription: '',
    tone: 'Professional & Confident'
  });
  const [isGeneratingCl, setIsGeneratingCl] = useState(false);
  const [activeClDraft, setActiveClDraft] = useState<string | null>(null);
  const [clHighlights, setClHighlights] = useState<string[]>([]);
  const [selectedAppForCl, setSelectedAppForCl] = useState<string>('');
  const [clSaveMsg, setClSaveMsg] = useState<{ success: boolean; text: string } | null>(null);

  const filteredDocs = docTypeFilter === 'all' 
    ? documents 
    : documents.filter(d => d.type === docTypeFilter);

  const handleCopyText = async (text: string, id: string) => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch (error) {
      console.error('Clipboard write failed:', error);
    }
  };

  const handleGenerateCoverLetter = async () => {
    if (!clForm.company || !clForm.jobTitle) return;
    setIsGeneratingCl(true);
    setClSaveMsg(null);
    try {
      const res = await generateAiCoverLetter(
        clForm.company,
        clForm.jobTitle,
        clForm.jobDescription,
        clForm.tone
      );
      if (!res.coverLetter.trim()) {
        setClSaveMsg({
          success: false,
          text: 'The AI service did not return a cover letter. Check the AI configuration and try again.',
        });
        return;
      }
      setActiveClDraft(res.coverLetter);
      setClHighlights(res.keyHighlights);
    } catch (e) {
      console.error(e);
      setClSaveMsg({
        success: false,
        text: 'The cover letter could not be generated. Check the AI configuration and try again.',
      });
    } finally {
      setIsGeneratingCl(false);
    }
  };

  const handleSaveActiveCoverLetter = async () => {
    if (!activeClDraft) return;
    setClSaveMsg(null);
    try {
      await saveCoverLetter({
        title: `${clForm.company} — ${clForm.jobTitle}`,
        company: clForm.company,
        role: clForm.jobTitle,
        jobDescription: clForm.jobDescription,
        content: activeClDraft,
        keyHighlights: clHighlights,
        applicationId: selectedAppForCl || undefined
      });
      // The cover letter is stored once, in `cover_letters` (the canonical
      // source). The "My Documents" entry is derived from it — no duplicate
      // record is written.
      setClSaveMsg({ success: true, text: 'Cover letter saved.' });
    } catch (error) {
      console.error('Failed to save cover letter:', error);
      setClSaveMsg({
        success: false,
        text: 'The cover letter could not be saved. Please try again.',
      });
    }
  };

  return (
    <Reveal className="space-y-6">
      {/* Top Header */}
      <div className="p-6 sm:p-8 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[var(--accent-surface)] text-[var(--color-primary-text)] text-xs font-semibold mb-2">
            <FileText className="w-3.5 h-3.5" />
            <span>{t('Document Hub')}</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">
            {t('My Documents & Workspaces')}
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Centralized management for your CV versions, tailored cover letters, certifications, and portfolio assets.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('cv-studio')}
            className="px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{t('Open CV Studio')}</span>
          </button>
        </div>
      </div>

      {/* Workspace Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('documents')}
          className={`px-3.5 py-2 rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'documents'
              ? 'bg-[var(--accent-surface)] text-[var(--color-primary-text)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>All Documents ({documents.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('cv-versions')}
          className={`px-3.5 py-2 rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'cv-versions'
              ? 'bg-[var(--accent-surface)] text-[var(--color-primary-text)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>CV Versions ({cvVersions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('cover-letters')}
          className={`px-3.5 py-2 rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'cover-letters'
              ? 'bg-[var(--accent-surface)] text-[var(--color-primary-text)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Sparkles className="w-4 h-4 text-[var(--color-primary-text)]" />
          <span>Cover Letter Studio ({coverLetters.length})</span>
        </button>
      </div>

      {/* TAB 1: ALL DOCUMENTS */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] text-xs">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <span className="text-[var(--text-secondary)] font-medium">{t('Filter by Type:')}</span>
              {(['all', 'cv', 'cover_letter', 'certificate', 'portfolio'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setDocTypeFilter(type)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors capitalize ${
                    docTypeFilter === type
                      ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
                      : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {type.replace('_', ' ')}
                </button>
              ))}
            </div>

            <span className="text-[11px] text-[var(--text-muted)] font-mono">
              Showing {filteredDocs.length} of {documents.length}
            </span>
          </div>

          {/* Documents Grid */}
          <Stagger inView gap={0.06} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDocs.map((doc) => (
              <StaggerItem
                key={doc.id}
                className="p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:border-[var(--accent-primary)]/40 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-[var(--accent-surface)] text-[var(--color-primary-text)]">
                        <FileText className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[var(--surface-secondary)] text-[var(--text-muted)] font-mono">
                        {doc.type.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        doc.isPublic ? 'bg-[var(--color-success-surface)] text-[var(--color-success-strong)]' : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)]'
                      }`}>
                        {doc.isPublic ? <Unlock className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                        {doc.isPublic ? 'Public' : 'Private'}
                      </span>
                      <button
                        onClick={() => deleteDocument(doc.id)}
                        className="p-1 text-[var(--text-muted)] hover:text-[var(--color-danger)] rounded"
                        title={t('Delete document')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
                    {doc.name}
                  </h3>

                  {doc.contentPreview && (
                    <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                      {doc.contentPreview}
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs">
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    {doc.format.toUpperCase()} • {doc.size}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void handleCopyText(doc.contentPreview || '', doc.id)}
                      disabled={!doc.contentPreview?.trim()}
                      title={doc.contentPreview?.trim() ? 'Copy document notes' : 'No notes to copy'}
                      className="px-2.5 py-1 rounded-md bg-[var(--surface-secondary)] hover:bg-[var(--surface-elevated)] text-[var(--text-primary)] font-semibold text-[11px] flex items-center gap-1 border border-[var(--border-subtle)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {copiedId === doc.id ? (
                        <Check className="w-3 h-3 text-[var(--color-success-strong)]" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      <span>{copiedId === doc.id ? 'Copied' : 'Copy notes'}</span>
                    </button>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      )}

      {/* TAB 2: CV VERSIONS */}
      {activeTab === 'cv-versions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)]">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                {t('Target Role CV Versions')}
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Maintain distinct, tailored versions for specific roles without overwriting your master profile.
              </p>
            </div>
            <button
              onClick={() => onNavigate('cv-studio')}
              className="px-3.5 py-1.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold flex items-center gap-1.5"
            >
              <span>{t('Open CV Studio')}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          <Stagger inView gap={0.06} className="space-y-3">
            {cvVersions.map((version) => (
              <StaggerItem
                key={version.id}
                className="p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:border-[var(--accent-primary)]/40 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">
                      {version.name}
                    </h3>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-[var(--color-success-surface)] text-[var(--color-success-strong)] font-mono">
                      ATS: {version.atsAnalysis ? `${version.atsAnalysis.overallScore}%` : '—'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {t('Target Role:')} <strong className="text-[var(--text-primary)]">{version.targetRoleTitle}</strong> • Created {version.createdAt}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      setRenamingId(version.id);
                      setNewCvName(version.name);
                      setRenameModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)] text-xs font-medium text-[var(--text-primary)]"
                  >
                    {t('Rename')}
                  </button>

                  <button
                    onClick={() => duplicateCVVersion(version.id)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)] text-xs font-medium text-[var(--text-primary)] flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3 text-[var(--text-muted)]" />
                    <span>{t('Duplicate')}</span>
                  </button>

                  <button
                    onClick={() => onNavigate('cv-studio')}
                    className="px-3.5 py-1.5 rounded-lg bg-[var(--accent-surface)] text-[var(--color-primary-text)] font-semibold text-xs hover:bg-[var(--accent-primary)] hover:text-[var(--color-on-primary)] transition-colors"
                  >
                    {t('Edit in CV Studio')}
                  </button>

                  {cvVersions.length > 1 && (
                    <button
                      onClick={() => deleteCVVersion(version.id)}
                      className="p-1.5 rounded-lg hover:bg-[var(--surface-secondary)] text-[var(--text-muted)] hover:text-[var(--color-danger)]"
                      title={t('Delete version')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      )}

      {/* TAB 3: COVER LETTER STUDIO */}
      {activeTab === 'cover-letters' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Generation Workspace Form */}
          <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-4">
            <div className="pb-3 border-b border-[var(--border-subtle)]">
              <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[var(--color-primary-text)]" />
                <span>{t('AI Cover Letter Generator')}</span>
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Generate compelling, tailored cover letters grounded strictly in your verified experiences and metrics.
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">{t('Target Company')}</label>
                <input
                  type="text"
                  value={clForm.company}
                  onChange={(e) => setClForm(prev => ({ ...prev, company: e.target.value }))}
                  placeholder={t('e.g. Acme Corp')}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">{t('Target Job Title')}</label>
                <input
                  type="text"
                  value={clForm.jobTitle}
                  onChange={(e) => setClForm(prev => ({ ...prev, jobTitle: e.target.value }))}
                  placeholder={t('e.g. Frontend Engineer (React / TypeScript)')}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">
                  {t('Job Description / Key Requirements')}
                </label>
                <textarea
                  rows={4}
                  value={clForm.jobDescription}
                  onChange={(e) => setClForm(prev => ({ ...prev, jobDescription: e.target.value }))}
                  placeholder={t('Paste job description keywords or priorities...')}
                  className="w-full p-2.5 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">{t('Tone & Voice')}</label>
                  <select
                    value={clForm.tone}
                    onChange={(e) => setClForm(prev => ({ ...prev, tone: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                  >
                    <option value="Professional & Confident">{t('Professional & Confident')}</option>
                    <option value="Technical & Data-Driven">{t('Technical & Data-Driven')}</option>
                    <option value="Conversational & Authentic">{t('Conversational & Authentic')}</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">{t('Link to Application (Optional)')}</label>
                  <select
                    value={selectedAppForCl}
                    onChange={(e) => setSelectedAppForCl(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                  >
                    <option value="">{t('None (Standalone)')}</option>
                    {applications.map(a => (
                      <option key={a.id} value={a.id}>{a.company} — {a.role}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={handleGenerateCoverLetter}
                disabled={
                  isGeneratingCl || !clForm.company || !clForm.jobTitle || !aiWritingEnabled
                }
                title={
                  aiWritingEnabled
                    ? undefined
                    : 'Enable AI Writing Assistance and Career Graph AI Grounding in Settings.'
                }
                className="w-full py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isGeneratingCl ? 'Synthesizing with Gemini...' : 'Generate Tailored Cover Letter'}</span>
              </button>
              {!aiWritingEnabled && (
                <p className="text-[11px] text-[var(--color-warning)]">
                  AI writing is disabled in Settings. Enable AI Writing Assistance and Career
                  Graph AI Grounding to generate a cover letter.
                </p>
              )}
            </div>
          </div>

          {/* Review & Live Editor */}
          <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">
                  {t('Live Preview & Approval')}
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  {t('Review and approve synthesized content. Never submitted without confirmation.')}
                </p>
              </div>

              {activeClDraft && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleCopyText(activeClDraft, 'draft-cl')}
                    className="px-2.5 py-1 rounded-md border border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)] text-xs text-[var(--text-secondary)] flex items-center gap-1"
                  >
                    {copiedId === 'draft-cl' ? <Check className="w-3 h-3 text-[var(--color-success-strong)]" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedId === 'draft-cl' ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    onClick={handleSaveActiveCoverLetter}
                    className="px-3 py-1 rounded-md bg-[var(--color-success-strong)] hover:bg-[var(--color-success-hover)] text-[var(--color-on-primary)] font-semibold text-xs transition-colors"
                  >
                    {t('Approve & Save')}
                  </button>
                </div>
              )}
            </div>

            {clSaveMsg && (
              <p
                role={clSaveMsg.success ? 'status' : 'alert'}
                className={`text-xs ${clSaveMsg.success ? 'text-[var(--color-success-strong)]' : 'text-[var(--color-danger)]'}`}
              >
                {clSaveMsg.text}
              </p>
            )}

            {activeClDraft ? (
              <div className="space-y-4">
                {clHighlights.length > 0 && (
                  <div className="p-3 rounded-xl bg-[var(--accent-surface)]/40 border border-[var(--accent-primary)]/20 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
                      {t('Strategic Highlights Grounded in Your Background')}
                    </span>
                    <ul className="text-xs text-[var(--text-secondary)] space-y-1">
                      {clHighlights.map((hl, idx) => (
                        <li key={idx} className="flex items-center gap-1.5">
                          <Check className="w-3 h-3 text-[var(--color-success-strong)] shrink-0" />
                          <span>{hl}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <textarea
                  rows={14}
                  value={activeClDraft}
                  onChange={(e) => setActiveClDraft(e.target.value)}
                  className="w-full p-4 rounded-xl bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] leading-relaxed font-sans"
                />
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-[var(--border-subtle)] rounded-xl text-[var(--text-muted)] space-y-2">
                <FileCode className="w-8 h-8 text-[var(--text-muted)]" />
                <p className="text-xs font-medium">{t('No draft generated yet.')}</p>
                <p className="text-[11px] text-[var(--text-muted)] max-w-xs">
                  Fill in the target company and job details on the left, then click Generate to create a tailored letter.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Documents are derived from the canonical sources (CV versions,
          cover letters, certifications and projects); there is no standalone
          document record and therefore no separate "Add Document" form. */}

      {/* MODAL: Rename CV */}
      {renameModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-main)] rounded-2xl border border-[var(--border-subtle)] shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-[var(--text-primary)]">{t('Rename CV Version')}</h3>
            <div>
              <input
                type="text"
                value={newCvName}
                onChange={(e) => setNewCvName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <button onClick={() => setRenameModalOpen(false)} className="px-3 py-1.5 text-xs text-[var(--text-secondary)]">{t('Cancel')}</button>
              <button
                onClick={() => {
                  if (renamingId && newCvName.trim()) {
                    renameCVVersion(renamingId, newCvName.trim());
                  }
                  setRenameModalOpen(false);
                }}
                className="px-3.5 py-1.5 bg-[var(--accent-primary)] text-[var(--color-on-primary)] rounded-lg text-xs font-semibold"
              >
                {t('Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Reveal>
  );
};
