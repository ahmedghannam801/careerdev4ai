import React, { useState, useRef } from 'react';
import { Upload, FileText, Check, AlertCircle, AlertTriangle, Info, X, ChevronDown, ChevronUp, Sparkles, ArrowRight, ExternalLink } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import {
  CVProfile,
  CvExtractionMetadata,
  CvExtractionQuality,
  CvImportResult,
} from '../../types/career';

interface CVImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
  onStartFromScratch?: () => void;
}

export const CVImportModal: React.FC<CVImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  onStartFromScratch,
}) => {
  const { uploadCvFile, pasteCvText, importExtractedCvData, t } = useCareer();

  const [activeTab, setActiveTab] = useState<'upload' | 'paste' | 'scratch'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  // Review step state
  const [extractedData, setExtractedData] = useState<CVProfile | null>(null);
  const [extraction, setExtraction] = useState<CvExtractionMetadata | null>(null);
  const [extractionQuality, setExtractionQuality] = useState<CvExtractionQuality | null>(null);
  const [importResult, setImportResult] = useState<CvImportResult | null>(null);
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [isImporting, setIsImporting] = useState(false);

  // Section selection toggles for review step
  const [selectedSections, setSelectedSections] = useState({
    personal: true,
    experience: true,
    education: true,
    skills: true,
    projects: true,
    certifications: true,
  });

  // Collapsible accordion states
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    personal: true,
    experience: true,
    education: true,
    skills: true,
    projects: false,
    certifications: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validExtensions = ['.pdf', '.docx', '.txt', '.json'];
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (ext === '.doc') {
        setExtractionError(t('Legacy .doc binary format is not supported. Please open your document in Microsoft Word, Google Docs, or LibreOffice and choose "Save As" .docx or "Export As" .pdf to upload.'));
        setSelectedFile(null);
        return;
      }
      if (!validExtensions.includes(ext)) {
        setExtractionError(t('Unsupported file type. Please upload a .pdf, .docx, .txt, or .json file.'));
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
      setExtractionError(null);
    }
  };

  const handleExtract = async () => {
    setExtractionError(null);
    setImportResult(null);
    setIsExtracting(true);

    try {
      if (activeTab === 'upload') {
        if (!selectedFile) {
          setExtractionError(t('Please select a CV file to upload.'));
          setIsExtracting(false);
          return;
        }
        const res = await uploadCvFile(selectedFile);
        if (!res.success || !res.cv) {
          throw new Error(res.error || t('Failed to extract CV information.'));
        }
        setExtractedData(res.cv);
        setExtraction(res.extraction ?? null);
        setExtractionQuality(res.extractionQuality ?? null);
        setStep('review');
      } else if (activeTab === 'paste') {
        if (!pastedText.trim() || pastedText.trim().length < 20) {
          setExtractionError(t('Please paste at least 20 characters of your CV text.'));
          setIsExtracting(false);
          return;
        }
        const res = await pasteCvText(pastedText.trim());
        if (!res.success || !res.cv) {
          throw new Error(res.error || t('Failed to extract pasted CV information.'));
        }
        setExtractedData(res.cv);
        setExtraction(res.extraction ?? null);
        setExtractionQuality(res.extractionQuality ?? null);
        setStep('review');
      }
    } catch (err: any) {
      console.error('CV Extraction Error:', err);
      setExtractionError(err.message || t('Unable to extract information from your CV. Please verify the content and try again.'));
    } finally {
      setIsExtracting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!extractedData || isImporting) return;
    if (!Object.values(selectedSections).some(Boolean)) {
      setExtractionError(t('Select at least one section to import.'));
      return;
    }
    setImportResult(null);
    setExtractionError(null);
    setIsImporting(true);
    try {
      const result = await importExtractedCvData(extractedData, selectedSections);
      setImportResult(result);
      if (!result.success) {
        setExtractionError(
          t('Some selected information could not be imported. The rows that already succeeded are listed below; retrying only adds what is still missing.')
        );
        return;
      }
      if (onImportComplete) {
        onImportComplete();
      }
      onClose();
    } catch (err: any) {
      console.error('CV Import Failed:', err);
      setExtractionError(
        err?.message ||
          t('The reviewed information could not be imported. Nothing was hidden: check the fields and try again.')
      );
    } finally {
      setIsImporting(false);
    }
  };

  const toggleSection = (key: keyof typeof selectedSections) => {
    setSelectedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAccordion = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const overallConfidence = extraction ? Math.round(extraction.confidence.overall) : null;
  const quality: CvExtractionQuality | null =
    extractionQuality ??
    (overallConfidence === null
      ? null
      : overallConfidence >= 80
        ? 'high'
        : overallConfidence >= 55
          ? 'medium'
          : 'low');
  const result = importResult;
  const hasSelection = Object.values(selectedSections).some(Boolean);

  const confidenceBadge = (score: number | null) => {
    if (score === null) return null;
    const tone =
      score >= 80
        ? 'text-[var(--color-success-strong)] border-[var(--color-success-strong)]/25 bg-[var(--color-success-surface)]/40'
        : score >= 55
          ? 'text-[var(--color-warning)] border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10'
          : 'text-[var(--color-danger)] border-[var(--color-danger)]/25 bg-[var(--color-danger)]/10';
    return (
      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${tone}`}>
        {score}% {t('confidence')}
      </span>
    );
  };

  const sectionConfidence = (key: keyof CvExtractionMetadata['confidence']) =>
    extraction ? Math.round(extraction.confidence[key] ?? 0) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              {step === 'input' ? t('Import Your Career CV') : t('Review Extracted Information')}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {step === 'input'
                ? t('Upload your resume or paste its text. We extract the document and show the evidence before anything is imported.')
                : t('Select the information you want to import. Existing profile values and records are never overwritten.')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]"
            aria-label={t('Close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 grow">
          {extractionError && (
            <div role="alert" className="p-3 rounded-xl bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/20 text-xs text-[var(--color-danger)] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{extractionError}</span>
            </div>
          )}

          {step === 'input' ? (
            <div className="space-y-6">
              {/* Tab Navigation */}
              <div className="grid grid-cols-3 gap-2 p-1 bg-[var(--surface-secondary)] rounded-xl border border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => { setActiveTab('upload'); setExtractionError(null); }}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    activeTab === 'upload'
                      ? 'bg-[var(--surface-main)] text-[var(--color-primary-text)] shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{t('Upload File')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab('paste'); setExtractionError(null); }}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    activeTab === 'paste'
                      ? 'bg-[var(--surface-main)] text-[var(--color-primary-text)] shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{t('Paste Text')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab('scratch'); setExtractionError(null); }}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    activeTab === 'scratch'
                      ? 'bg-[var(--surface-main)] text-[var(--color-primary-text)] shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>{t('Start Scratch')}</span>
                </button>
              </div>

              {/* Tab 1: Upload File */}
              {activeTab === 'upload' && (
                <div className="space-y-4">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--accent-primary)] rounded-2xl p-8 text-center cursor-pointer transition-colors bg-[var(--surface-secondary)]/30 group"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,.txt,.json"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <div className="w-12 h-12 rounded-2xl bg-[var(--accent-surface)] text-[var(--color-primary-text)] flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition-transform">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div className="text-sm font-semibold text-[var(--text-primary)]">
                      {selectedFile ? selectedFile.name : t('Click to select your CV from device')}
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                      {selectedFile
                        ? `${(selectedFile.size / 1024).toFixed(1)} KB — ${t('Ready for extraction')}`
                        : t('Supported formats: PDF, DOCX, TXT, JSON (max 10MB)')}
                    </p>
                  </div>
                </div>
              )}

              {/* Tab 2: Paste Text */}
              {activeTab === 'paste' && (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                    {t('Paste Complete Resume / CV Content')}
                  </label>
                  <textarea
                    rows={8}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder={t('Paste your work history, education, skills, and summary here...')}
                    className="w-full p-3.5 rounded-xl bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] leading-relaxed focus:outline-hidden focus:border-[var(--accent-primary)] font-mono"
                  />
                  <div className="text-[11px] text-[var(--text-muted)] flex justify-between">
                    <span>{t('Parsed safely through the extraction pipeline')}</span>
                    <span>{pastedText.length} {t('characters')}</span>
                  </div>
                </div>
              )}

              {/* Tab 3: Start From Scratch */}
              {activeTab === 'scratch' && (
                <div className="p-6 rounded-2xl bg-[var(--surface-secondary)]/40 border border-[var(--border-subtle)] space-y-3 text-center">
                  <h4 className="text-sm font-bold text-[var(--text-primary)]">{t('Continue Without a CV')}</h4>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-md mx-auto">
                    {t('You can manually configure your profile, self-assess skills, and set your career target. You can always import or upload a CV later in CV Studio.')}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (onStartFromScratch) onStartFromScratch();
                      onClose();
                    }}
                    className="mt-2 px-5 py-2 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--text-primary)]"
                  >
                    {t('Proceed from Scratch')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Review Step */
            <div className="space-y-4">
              {result && (
                <div
                  role={result.failed > 0 ? 'alert' : 'status'}
                  className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                    result.failed > 0
                      ? 'bg-[var(--color-danger)]/10 border-[var(--color-danger)]/25 text-[var(--color-danger)]'
                      : 'bg-[var(--color-success-surface)] border-[var(--color-success-strong)]/20 text-[var(--color-success-strong)]'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {result.failed > 0 ? (
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    ) : (
                      <Check className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-0.5">
                      <div className="font-semibold">
                        {result.failed > 0
                          ? t('Some information was not imported')
                          : t('Import completed')}
                      </div>
                      <div className="opacity-90">
                        {result.imported} {t('added')} · {result.skipped} {t('already existed')} ·{' '}
                        {result.failed} {t('failed')}
                      </div>
                    </div>
                  </div>
                  {result.failed > 0 && (
                    <div className="space-y-2 pt-1">
                      {result.sections
                        .filter((section) => section.failed > 0)
                        .map((section) => (
                          <div key={section.section}>
                            <div className="font-semibold capitalize">{section.section}</div>
                            <ul className="list-disc ps-4 space-y-0.5">
                              {section.errors.slice(0, 5).map((message, index) => (
                                <li key={index}>{message}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-[var(--color-success-surface)] text-[var(--color-success-strong)] flex items-center justify-center shrink-0">
                      <Check className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--text-primary)]">
                        {quality === 'high'
                          ? t('Document parsed successfully')
                          : quality === 'medium'
                            ? t('Document parsed — please review the fields')
                            : t('Document parsed with limited confidence')}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                        {extraction
                          ? `${extraction.format.toUpperCase()} · ${extraction.pageCount} ${
                              extraction.pageCount === 1 ? t('page') : t('pages')
                            } · ${extraction.layout.replace('-', ' ')} · ${extraction.wordCount.toLocaleString()} ${t('words')}`
                          : t('Choose which extracted sections to apply to your profile.')}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {quality && (
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${
                          quality === 'high'
                            ? 'text-[var(--color-success-strong)] border-[var(--color-success-strong)]/25 bg-[var(--color-success-surface)]/40'
                            : quality === 'medium'
                              ? 'text-[var(--color-warning)] border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10'
                              : 'text-[var(--color-danger)] border-[var(--color-danger)]/25 bg-[var(--color-danger)]/10'
                        }`}
                      >
                        {t(quality)} {t('quality')}
                      </span>
                    )}
                    {overallConfidence !== null && (
                      <span className="text-[10px] font-mono text-[var(--text-muted)]">
                        {overallConfidence}% {t('overall confidence')}
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-[11px] text-[var(--text-secondary)]">
                  {t('Review what was found, untick anything you do not want, then confirm. Existing profile values and records are never overwritten.')}
                </p>

                {extraction && extraction.warnings.length > 0 && (
                  <div className="rounded-lg border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 p-2.5">
                    <div className="text-[11px] font-semibold text-[var(--color-warning)] flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>{t('Before you import')}</span>
                    </div>
                    <ul className="list-disc ps-4 mt-1 space-y-0.5 text-[11px] text-[var(--text-secondary)]">
                      {extraction.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {extraction && extraction.evidence.length > 0 && (
                  <details className="text-[11px]">
                    <summary className="cursor-pointer font-semibold text-[var(--color-primary-text)] flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5" />
                      <span>{t('Why these fields?')} ({extraction.evidence.length} {t('evidence snippets')})</span>
                    </summary>
                    <div className="mt-2 max-h-40 overflow-y-auto space-y-1 pe-1">
                      {extraction.evidence.slice(0, 12).map((item, index) => (
                        <div key={index} className="text-[var(--text-secondary)]">
                          <span className="font-mono text-[var(--text-muted)]">
                            {item.field}
                            {item.page ? ` · p.${item.page}` : ''}:
                          </span>{' '}
                          <span>“{item.text}”</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>

              {result && result.failed > 0 && (
                <p className="text-[11px] text-[var(--text-secondary)]">
                  {t('Retry only creates the records that are still missing. Rows that already succeeded are skipped, so nothing is duplicated.')}
                </p>
              )}

              {/* Section 1: Personal Details */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/20 overflow-hidden">
                <div className="p-3.5 flex items-center justify-between bg-[var(--surface-secondary)]/40 cursor-pointer" onClick={() => toggleAccordion('personal')}>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={selectedSections.personal}
                      onChange={(e) => { e.stopPropagation(); toggleSection('personal'); }}
                      className="rounded accent-[var(--accent-primary)] cursor-pointer"
                    />
                    <span className="text-xs font-bold text-[var(--text-primary)]">{t('Personal Details')}</span>
                    {confidenceBadge(sectionConfidence('personal'))}
                  </div>
                  {expandedSections.personal ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
                </div>
                {expandedSections.personal && extractedData && (
                  <div className="p-4 space-y-2 text-xs border-t border-[var(--border-subtle)] bg-[var(--surface-main)]">
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div><span className="text-[var(--text-muted)]">{t('Name:')}</span> <strong className="text-[var(--text-primary)]">{extractedData.fullName || t('Not specified')}</strong></div>
                      <div><span className="text-[var(--text-muted)]">{t('Title:')}</span> <strong className="text-[var(--text-primary)]">{extractedData.title || t('Not specified')}</strong></div>
                      <div><span className="text-[var(--text-muted)]">{t('Location:')}</span> <strong className="text-[var(--text-primary)]">{extractedData.location || t('Not specified')}</strong></div>
                      <div><span className="text-[var(--text-muted)]">{t('Email:')}</span> <strong className="text-[var(--text-primary)]">{extractedData.email || t('Not specified')}</strong></div>
                      <div><span className="text-[var(--text-muted)]">{t('Phone:')}</span> <strong className="text-[var(--text-primary)]">{extractedData.phone || t('Not specified')}</strong></div>
                    </div>
                    {(extractedData.linkedin || extractedData.github || extractedData.website) && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {extractedData.linkedin && (
                          <a href={extractedData.linkedin} target="_blank" rel="noopener noreferrer" className="text-[10px] px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-secondary)] text-[var(--color-primary-text)] inline-flex items-center gap-1">
                            {t('LinkedIn')} <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                        {extractedData.github && (
                          <a href={extractedData.github} target="_blank" rel="noopener noreferrer" className="text-[10px] px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-secondary)] text-[var(--color-primary-text)] inline-flex items-center gap-1">
                            {t('GitHub')} <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                        {extractedData.website && (
                          <a href={extractedData.website} target="_blank" rel="noopener noreferrer" className="text-[10px] px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-secondary)] text-[var(--color-primary-text)] inline-flex items-center gap-1">
                            {t('Website')} <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    )}
                    {extractedData.summary && (
                      <div className="pt-1 border-t border-[var(--border-subtle)] space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t('Summary')}</span>
                          {confidenceBadge(sectionConfidence('summary'))}
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] italic">
                          "{extractedData.summary}"
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Section 2: Experience */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/20 overflow-hidden">
                <div className="p-3.5 flex items-center justify-between bg-[var(--surface-secondary)]/40 cursor-pointer" onClick={() => toggleAccordion('experience')}>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={selectedSections.experience}
                      onChange={(e) => { e.stopPropagation(); toggleSection('experience'); }}
                      className="rounded accent-[var(--accent-primary)] cursor-pointer"
                    />
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      {t('Work Experience')} ({extractedData?.experiences?.length || 0})
                    </span>
                    {confidenceBadge(sectionConfidence('experience'))}
                  </div>
                  {expandedSections.experience ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
                </div>
                {expandedSections.experience && extractedData?.experiences && (
                  <div className="p-4 space-y-3 text-xs border-t border-[var(--border-subtle)] bg-[var(--surface-main)]">
                    {extractedData.experiences.map((exp, idx) => (
                      <div key={idx} className="space-y-1 pb-2 border-b border-[var(--border-subtle)] last:border-0 last:pb-0">
                        <div className="font-semibold text-[var(--text-primary)] flex justify-between">
                          <span>{exp.role} @ {exp.company}</span>
                          <span className="text-[10px] text-[var(--text-muted)] font-mono">{exp.period}</span>
                        </div>
                        {exp.bullets?.[0] && <p className="text-[11px] text-[var(--text-secondary)]">{exp.bullets[0]}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 3: Education */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/20 overflow-hidden">
                <div className="p-3.5 flex items-center justify-between bg-[var(--surface-secondary)]/40 cursor-pointer" onClick={() => toggleAccordion('education')}>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={selectedSections.education}
                      onChange={(e) => { e.stopPropagation(); toggleSection('education'); }}
                      className="rounded accent-[var(--accent-primary)] cursor-pointer"
                    />
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      {t('Education')} ({extractedData?.education?.length || 0})
                    </span>
                    {confidenceBadge(sectionConfidence('education'))}
                  </div>
                  {expandedSections.education ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
                </div>
                {expandedSections.education && extractedData?.education && (
                  <div className="p-4 space-y-2 text-xs border-t border-[var(--border-subtle)] bg-[var(--surface-main)]">
                    {extractedData.education.map((edu, idx) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <div>
                          <strong className="text-[var(--text-primary)]">{edu.degree} in {edu.field}</strong>
                          <div className="text-[11px] text-[var(--text-secondary)]">{edu.institution}</div>
                        </div>
                        <span className="text-[10px] text-[var(--text-muted)] font-mono">{edu.period}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 4: Skills */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/20 overflow-hidden">
                <div className="p-3.5 flex items-center justify-between bg-[var(--surface-secondary)]/40 cursor-pointer" onClick={() => toggleAccordion('skills')}>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={selectedSections.skills}
                      onChange={(e) => { e.stopPropagation(); toggleSection('skills'); }}
                      className="rounded accent-[var(--accent-primary)] cursor-pointer"
                    />
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      {t('Skills')} ({extractedData?.skillsList?.length || 0})
                    </span>
                    {confidenceBadge(sectionConfidence('skills'))}
                  </div>
                  {expandedSections.skills ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
                </div>
                {expandedSections.skills && extractedData?.skillsList && (
                  <div className="p-4 flex flex-wrap gap-1.5 border-t border-[var(--border-subtle)] bg-[var(--surface-main)]">
                    {extractedData.skillsList.map((skill, idx) => (
                      <span key={idx} className="text-xs px-2.5 py-1 rounded-md bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 5: Projects */}
              {extractedData?.projects && extractedData.projects.length > 0 && (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/20 overflow-hidden">
                  <div className="p-3.5 flex items-center justify-between bg-[var(--surface-secondary)]/40 cursor-pointer" onClick={() => toggleAccordion('projects')}>
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={selectedSections.projects}
                        onChange={(e) => { e.stopPropagation(); toggleSection('projects'); }}
                        className="rounded accent-[var(--accent-primary)] cursor-pointer"
                      />
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        {t('Projects')} ({extractedData.projects.length})
                      </span>
                      {confidenceBadge(sectionConfidence('projects'))}
                    </div>
                    {expandedSections.projects ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
                  </div>
                  {expandedSections.projects && (
                    <div className="p-4 space-y-2 border-t border-[var(--border-subtle)] bg-[var(--surface-main)] text-xs">
                      {extractedData.projects.map((proj, idx) => (
                        <div key={idx} className="space-y-0.5">
                          <strong className="text-[var(--text-primary)]">{proj.title}</strong>
                          <p className="text-[11px] text-[var(--text-secondary)]">{proj.bullets?.[0]}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Section 6: Certifications */}
              {extractedData?.certifications && extractedData.certifications.length > 0 && (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/20 overflow-hidden">
                  <div className="p-3.5 flex items-center justify-between bg-[var(--surface-secondary)]/40 cursor-pointer" onClick={() => toggleAccordion('certifications')}>
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={selectedSections.certifications}
                        onChange={(e) => { e.stopPropagation(); toggleSection('certifications'); }}
                        className="rounded accent-[var(--accent-primary)] cursor-pointer"
                      />
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        {t('Certifications')} ({extractedData.certifications.length})
                      </span>
                      {confidenceBadge(sectionConfidence('certifications'))}
                    </div>
                    {expandedSections.certifications ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
                  </div>
                  {expandedSections.certifications && (
                    <div className="p-4 space-y-2 border-t border-[var(--border-subtle)] bg-[var(--surface-main)] text-xs">
                      {extractedData.certifications.map((name, idx) => {
                        const detail = extractedData.certificationDetails?.find(
                          (entry) => entry.name.toLowerCase().trim() === name.toLowerCase().trim()
                        );
                        const meta = [detail?.issuer, detail?.issueDate].filter(Boolean).join(' · ');
                        return (
                          <div key={idx} className="space-y-0.5">
                            <strong className="text-[var(--text-primary)]">{name}</strong>
                            {meta && (
                              <p className="text-[11px] text-[var(--text-secondary)]">{meta}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 flex items-center justify-between shrink-0">
          {step === 'input' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
              >
                {t('Cancel')}
              </button>
              {activeTab !== 'scratch' && (
                <button
                  type="button"
                  onClick={handleExtract}
                  disabled={isExtracting || (activeTab === 'upload' && !selectedFile) || (activeTab === 'paste' && !pastedText.trim())}
                  className="px-5 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isExtracting ? t('Extracting text and structure…') : t('Extract CV Information')}</span>
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep('input')}
                disabled={isImporting}
                className="px-4 py-2 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] disabled:opacity-50"
              >
                {t('Back to Upload')}
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={isImporting || !hasSelection}
                className="px-6 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors shadow-xs"
              >
                <Check className="w-4 h-4" />
                <span>
                  {isImporting
                    ? t('Importing Data…')
                    : result && result.failed > 0
                      ? t('Retry Failed Items')
                      : t('Import Selected Information')}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
