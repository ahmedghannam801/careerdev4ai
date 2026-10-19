import React, { useState } from 'react';
import { 
  FileText, 
  Sparkles, 
  Download, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Clock, 
  Upload, 
  Printer,
  Edit3
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';

export const CVStudioView: React.FC = () => {
  const { activeCV, updateCV, cvVersions, saveCVVersion, runAiCvOptimization, isOptimizingCV, targetRole } = useCareer();
  const [activeTab, setActiveTab] = useState<'editor' | 'ats' | 'versions'>('editor');
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [versionName, setVersionName] = useState('');
  const [uploadText, setUploadText] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);

  const latestAnalysis = cvVersions[0]?.atsAnalysis;

  const handlePrint = () => {
    window.print();
  };

  const handleSaveVersion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!versionName.trim()) return;
    saveCVVersion(versionName.trim());
    setVersionName('');
    setShowVersionModal(false);
  };

  const handleParsePastedCV = () => {
    if (!uploadText.trim()) return;
    // Extract basic summary and update activeCV
    updateCV({
      summary: uploadText.slice(0, 400),
    });
    setShowUploadModal(false);
    setUploadText('');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)]">CV WORKSPACE & ATS OPTIMIZER</div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            CV Studio for {targetRole.title}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:bg-[var(--surface-secondary)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import / Paste</span>
          </button>

          <button
            onClick={runAiCvOptimization}
            disabled={isOptimizingCV}
            className="px-3.5 py-1.5 rounded-lg bg-[var(--surface-secondary)] hover:bg-[var(--accent-surface)] text-[var(--accent-primary)] border border-[var(--border-subtle)] text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isOptimizingCV ? 'animate-spin' : ''}`} />
            <span>{isOptimizingCV ? 'Analyzing ATS Keywords...' : 'Run ATS Audit'}</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-4 py-1.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / Export PDF</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 border-b border-[var(--border-subtle)] pb-2">
        <button
          onClick={() => setActiveTab('editor')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'editor'
              ? 'bg-[var(--accent-primary)] text-white shadow-xs'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Document Editor & Preview
        </button>
        <button
          onClick={() => setActiveTab('ats')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'ats'
              ? 'bg-[var(--accent-primary)] text-white shadow-xs'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          ATS Analysis & Recommendations ({latestAnalysis?.overallScore || 84}%)
        </button>
        <button
          onClick={() => setActiveTab('versions')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'versions'
              ? 'bg-[var(--accent-primary)] text-white shadow-xs'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Version History ({cvVersions.length})
        </button>
      </div>

      {/* TAB 1: DOCUMENT EDITOR */}
      {activeTab === 'editor' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Form Controls (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Contact & Header</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">Full Name</label>
                  <input
                    type="text"
                    value={activeCV.fullName}
                    onChange={(e) => updateCV({ fullName: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">Target Role Headline</label>
                  <input
                    type="text"
                    value={activeCV.title}
                    onChange={(e) => updateCV({ title: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">Email</label>
                    <input
                      type="email"
                      value={activeCV.email}
                      onChange={(e) => updateCV({ email: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">Location</label>
                    <input
                      type="text"
                      value={activeCV.location}
                      onChange={(e) => updateCV({ location: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Executive Summary</h3>
              <textarea
                rows={4}
                value={activeCV.summary}
                onChange={(e) => updateCV({ summary: e.target.value })}
                className="w-full p-3 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] leading-relaxed"
              />
              <div className="text-[11px] text-[var(--text-muted)]">
                Tip: Quantify your results using the X-Y-Z format: "Accomplished [X], as measured by [Y], by doing [Z]".
              </div>
            </div>

            <button
              onClick={() => setShowVersionModal(true)}
              className="w-full py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--text-primary)] transition-colors"
            >
              Save as New Version Snapshot
            </button>
          </div>

          {/* Right Clean Paper Preview (7 cols) */}
          <div className="lg:col-span-7">
            <div className="p-8 sm:p-12 rounded-2xl bg-white border border-[var(--border-subtle)] shadow-md text-slate-900 font-sans space-y-6">
              {/* Paper Header */}
              <div className="border-b border-slate-200 pb-4 text-center space-y-1">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">{activeCV.fullName}</h2>
                <div className="text-xs font-semibold text-[#6D5EF5] tracking-wide uppercase">{activeCV.title}</div>
                <div className="text-xs text-slate-500 flex items-center justify-center gap-2 pt-1">
                  <span>{activeCV.email}</span>
                  <span>·</span>
                  <span>{activeCV.phone}</span>
                  <span>·</span>
                  <span>{activeCV.location}</span>
                </div>
              </div>

              {/* Summary */}
              <div className="space-y-1.5">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-1">
                  Professional Summary
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  {activeCV.summary}
                </p>
              </div>

              {/* Experience */}
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-1">
                  Work Experience
                </div>
                <div className="space-y-3">
                  {activeCV.experiences.map((exp) => (
                    <div key={exp.id} className="space-y-1 text-xs">
                      <div className="flex justify-between font-bold text-slate-900">
                        <span>{exp.role} — {exp.company}</span>
                        <span className="font-mono text-slate-500 font-normal">{exp.period}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">{exp.location}</div>
                      <ul className="list-disc list-inside space-y-1 text-slate-700 pt-0.5">
                        {exp.bullets.map((b, i) => (
                          <li key={i} className="leading-relaxed">{b}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              {/* Education */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-1">
                  Education
                </div>
                {activeCV.education.map((edu) => (
                  <div key={edu.id} className="flex justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-900">{edu.degree} in {edu.field}</span>
                      <span className="text-slate-500"> — {edu.institution}</span>
                    </div>
                    <span className="font-mono text-slate-500">{edu.period}</span>
                  </div>
                ))}
              </div>

              {/* Skills */}
              <div className="space-y-1.5">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-1">
                  Core Skills & Technologies
                </div>
                <div className="text-xs text-slate-700">
                  {activeCV.skillsList.join(' · ')}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ATS ANALYSIS */}
      {activeTab === 'ats' && latestAnalysis && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-primary)]">ATS Match Diagnostic</span>
                <h2 className="text-xl font-bold text-[var(--text-primary)] mt-0.5">
                  Alignment for {targetRole.title}
                </h2>
              </div>
              <div className="text-right">
                <div className="text-3xl font-extrabold font-mono tabular-nums text-[var(--accent-primary)]">
                  {latestAnalysis.overallScore} / 100
                </div>
                <div className="text-xs text-[var(--text-muted)]">Benchmark Passing Score: 75</div>
              </div>
            </div>

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
                <div className="text-xs font-bold text-[var(--color-success)] flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Matched Keywords ({latestAnalysis.matchedKeywords.length})</span>
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
                  <span>Missing Role Keywords ({latestAnalysis.missingKeywords.length})</span>
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
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Actionable Bullet Point Improvements</h3>
              <div className="space-y-3">
                {latestAnalysis.actionableImprovements.map((imp, i) => (
                  <div key={i} className="p-4 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] space-y-2 text-xs">
                    {imp.currentText && (
                      <div>
                        <span className="font-semibold text-[var(--text-muted)]">Current: </span>
                        <span className="line-through text-[var(--text-secondary)]">{imp.currentText}</span>
                      </div>
                    )}
                    <div>
                      <span className="font-semibold text-[var(--color-success)]">Suggested: </span>
                      <span className="font-medium text-[var(--text-primary)]">{imp.suggestedText}</span>
                    </div>
                    <div className="text-[11px] text-[var(--accent-primary)] font-medium pt-1">
                      Reason: {imp.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: VERSIONS */}
      {activeTab === 'versions' && (
        <div className="space-y-4">
          <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 shadow-xs">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Saved CV Snapshots</h3>
            <div className="space-y-3">
              {cvVersions.map((v) => (
                <div key={v.id} className="p-4 rounded-xl bg-[var(--surface-secondary)]/40 border border-[var(--border-subtle)] flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-sm text-[var(--text-primary)]">{v.name}</div>
                    <div className="text-[var(--text-muted)]">Target: {v.targetRoleTitle} · Created {v.createdAt}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {v.atsAnalysis && (
                      <span className="font-mono font-bold text-[var(--accent-primary)]">
                        ATS {v.atsAnalysis.overallScore}%
                      </span>
                    )}
                    <button
                      onClick={() => updateCV(v.profile)}
                      className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--text-primary)]"
                    >
                      Restore Snapshot
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
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Save CV Version</h3>
            <form onSubmit={handleSaveVersion} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Version Name</label>
                <input
                  type="text"
                  required
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                  placeholder="e.g. Frontend Engineer - Tech Focus v2"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowVersionModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[var(--accent-primary)] text-white text-xs font-semibold"
                >
                  Save Snapshot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import / Paste Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[var(--surface-main)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Import / Paste CV Text</h3>
            <textarea
              rows={6}
              value={uploadText}
              onChange={(e) => setUploadText(e.target.value)}
              placeholder="Paste raw text from your existing CV here..."
              className="w-full p-3 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-secondary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleParsePastedCV}
                className="px-4 py-1.5 rounded-lg bg-[var(--accent-primary)] text-white text-xs font-semibold"
              >
                Extract to Editor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
