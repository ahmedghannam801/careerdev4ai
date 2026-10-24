import React, { useState, useRef } from 'react';
import { Upload, FileText, Check, AlertCircle, X, ChevronDown, ChevronUp, Sparkles, ArrowRight } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { CVProfile } from '../../types/career';

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
  const { uploadCvFile, pasteCvText, importExtractedCvData } = useCareer();

  const [activeTab, setActiveTab] = useState<'upload' | 'paste' | 'scratch'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  // Review step state
  const [extractedData, setExtractedData] = useState<CVProfile | null>(null);
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
        setExtractionError('Legacy .doc binary format is not supported. Please open your document in Microsoft Word, Google Docs, or LibreOffice and choose "Save As" .docx or "Export As" .pdf to upload.');
        setSelectedFile(null);
        return;
      }
      if (!validExtensions.includes(ext)) {
        setExtractionError('Unsupported file type. Please upload a .pdf, .docx, .txt, or .json file.');
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
      setExtractionError(null);
    }
  };

  const handleExtract = async () => {
    setExtractionError(null);
    setIsExtracting(true);

    try {
      if (activeTab === 'upload') {
        if (!selectedFile) {
          setExtractionError('Please select a CV file to upload.');
          setIsExtracting(false);
          return;
        }
        const res = await uploadCvFile(selectedFile);
        if (!res.success || !res.cv) {
          throw new Error(res.error || 'Failed to extract CV information.');
        }
        setExtractedData(res.cv);
        setStep('review');
      } else if (activeTab === 'paste') {
        if (!pastedText.trim() || pastedText.trim().length < 20) {
          setExtractionError('Please paste at least 20 characters of your CV text.');
          setIsExtracting(false);
          return;
        }
        const res = await pasteCvText(pastedText.trim());
        if (!res.success || !res.cv) {
          throw new Error(res.error || 'Failed to extract pasted CV information.');
        }
        setExtractedData(res.cv);
        setStep('review');
      }
    } catch (err: any) {
      console.error('CV Extraction Error:', err);
      setExtractionError(err.message || 'Unable to extract information from your CV. Please verify the content and try again.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!extractedData) return;
    setIsImporting(true);
    try {
      await importExtractedCvData(extractedData, selectedSections);
      if (onImportComplete) {
        onImportComplete();
      }
      onClose();
    } catch (err: any) {
      console.error('CV Import Failed:', err);
      setExtractionError(err.message || 'Failed to apply imported CV data.');
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              {step === 'input' ? 'Import Your Career CV' : 'Review Extracted Information'}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {step === 'input'
                ? 'Upload your resume or paste its text to automatically populate your profile and calibrate your roadmap.'
                : 'Select the information you want to import. We prevent duplicate skills and records automatically.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]"
            aria-label="Close"
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
                  <span>Upload File</span>
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
                  <span>Paste Text</span>
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
                  <span>Start Scratch</span>
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
                      {selectedFile ? selectedFile.name : 'Click to select your CV from device'}
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                      {selectedFile
                        ? `${(selectedFile.size / 1024).toFixed(1)} KB — Ready for extraction`
                        : 'Supported formats: PDF, DOCX, TXT, JSON (max 10MB)'}
                    </p>
                  </div>
                </div>
              )}

              {/* Tab 2: Paste Text */}
              {activeTab === 'paste' && (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                    Paste Complete Resume / CV Content
                  </label>
                  <textarea
                    rows={8}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Paste your work history, education, skills, and summary here..."
                    className="w-full p-3.5 rounded-xl bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] leading-relaxed focus:outline-hidden focus:border-[var(--accent-primary)] font-mono"
                  />
                  <div className="text-[11px] text-[var(--text-muted)] flex justify-between">
                    <span>Parsed safely through the extraction pipeline</span>
                    <span>{pastedText.length} characters</span>
                  </div>
                </div>
              )}

              {/* Tab 3: Start From Scratch */}
              {activeTab === 'scratch' && (
                <div className="p-6 rounded-2xl bg-[var(--surface-secondary)]/40 border border-[var(--border-subtle)] space-y-3 text-center">
                  <h4 className="text-sm font-bold text-[var(--text-primary)]">Continue Without a CV</h4>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-md mx-auto">
                    You can manually configure your profile, self-assess skills, and set your career target. You can always import or upload a CV later in CV Studio.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (onStartFromScratch) onStartFromScratch();
                      onClose();
                    }}
                    className="mt-2 px-5 py-2 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--text-primary)]"
                  >
                    Proceed from Scratch
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Review Step */
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[var(--color-success-surface)] border border-[var(--color-success-strong)]/20 text-xs text-[var(--color-success-strong)] flex items-center justify-between">
                <span className="font-semibold">✓ Information extracted successfully!</span>
                <span className="text-[11px] opacity-80">Choose what to apply to your profile</span>
              </div>

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
                    <span className="text-xs font-bold text-[var(--text-primary)]">Personal Details</span>
                  </div>
                  {expandedSections.personal ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
                </div>
                {expandedSections.personal && extractedData && (
                  <div className="p-4 space-y-2 text-xs border-t border-[var(--border-subtle)] bg-[var(--surface-main)]">
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div><span className="text-[var(--text-muted)]">Name:</span> <strong className="text-[var(--text-primary)]">{extractedData.fullName || 'Not specified'}</strong></div>
                      <div><span className="text-[var(--text-muted)]">Title:</span> <strong className="text-[var(--text-primary)]">{extractedData.title || 'Not specified'}</strong></div>
                      <div><span className="text-[var(--text-muted)]">Location:</span> <strong className="text-[var(--text-primary)]">{extractedData.location || 'Not specified'}</strong></div>
                      <div><span className="text-[var(--text-muted)]">Email:</span> <strong className="text-[var(--text-primary)]">{extractedData.email || 'Not specified'}</strong></div>
                    </div>
                    {extractedData.summary && (
                      <p className="text-[11px] text-[var(--text-secondary)] italic pt-1 border-t border-[var(--border-subtle)]">
                        "{extractedData.summary}"
                      </p>
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
                      Work Experience ({extractedData?.experiences?.length || 0})
                    </span>
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
                      Education ({extractedData?.education?.length || 0})
                    </span>
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
                      Skills ({extractedData?.skillsList?.length || 0})
                    </span>
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
                        Projects ({extractedData.projects.length})
                      </span>
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
                Cancel
              </button>
              {activeTab !== 'scratch' && (
                <button
                  type="button"
                  onClick={handleExtract}
                  disabled={isExtracting || (activeTab === 'upload' && !selectedFile) || (activeTab === 'paste' && !pastedText.trim())}
                  className="px-5 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isExtracting ? 'Analyzing with AI…' : 'Extract CV Information'}</span>
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep('input')}
                className="px-4 py-2 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
              >
                Back to Upload
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={isImporting}
                className="px-6 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors shadow-xs"
              >
                <Check className="w-4 h-4" />
                <span>{isImporting ? 'Importing Data…' : 'Import Selected Data & Personalize'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
