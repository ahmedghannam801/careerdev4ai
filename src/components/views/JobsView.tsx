import React, { useState } from 'react';
import { 
  Search, 
  Briefcase, 
  MapPin, 
  DollarSign, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  Calendar,
  FileText,
  X
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { JobListing } from '../../types/career';

interface JobsViewProps {
  onNavigate: (view: string) => void;
}

export const JobsView: React.FC<JobsViewProps> = ({ onNavigate }) => {
  const { 
    jobs, 
    skills, 
    applications, 
    addApplication, 
    targetRole, 
    bookmarkedJobIds, 
    toggleBookmarkJob,
    logActivity
  } = useCareer();

  const [searchQuery, setSearchQuery] = useState('');
  const [workModeFilter, setWorkModeFilter] = useState<string>('all');
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);
  const [notesModalJob, setNotesModalJob] = useState<JobListing | null>(null);
  const [customNote, setCustomNote] = useState('');

  const filteredJobs = jobs.filter(j => {
    const matchesSearch = j.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.skillsRequired.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesMode = workModeFilter === 'all' ? true : j.workMode.toLowerCase() === workModeFilter.toLowerCase();
    const matchesBookmark = showBookmarksOnly ? bookmarkedJobIds.includes(j.id) : true;
    return matchesSearch && matchesMode && matchesBookmark;
  });

  const isApplied = (jobId: string) => applications.some(a => a.jobId === jobId);

  const calculateJobSkillsMatch = (required: string[]) => {
    const userSkillNames = skills.filter(s => s.currentLevel >= 3).map(s => s.name.toLowerCase());
    const matched = required.filter(r => userSkillNames.includes(r.toLowerCase()));
    const missing = required.filter(r => !userSkillNames.includes(r.toLowerCase()));
    const matchPercentage = Math.round((matched.length / required.length) * 100);
    return { matched, missing, matchPercentage };
  };

  const handleTrackApplication = (job: JobListing, noteText?: string) => {
    addApplication({
      jobId: job.id,
      company: job.company,
      role: job.title,
      location: job.location,
      workMode: job.workMode,
      stage: 'saved',
      notes: noteText || 'Saved from Job Market matches.',
      nextAction: 'Tailor CV in CV Studio and apply'
    });
    logActivity({
      actionType: 'saved_job',
      title: 'Converted Job to Application',
      subtitle: `${job.title} at ${job.company}`,
      linkView: 'applications'
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
            Market Match Engine
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            Target Job Matches for {targetRole.title}
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Match percentages automatically computed against your verified Skills Center competencies.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBookmarksOnly(prev => !prev)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
              showBookmarksOnly
                ? 'bg-[var(--accent-surface)] text-[var(--accent-primary)] border-[var(--accent-primary)]'
                : 'border-[var(--border-subtle)] bg-[var(--surface-main)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Saved Jobs ({bookmarkedJobIds.length})</span>
          </button>

          <button
            onClick={() => onNavigate('applications')}
            className="px-4 py-2 rounded-xl bg-[var(--surface-secondary)] hover:bg-[var(--accent-surface)] text-xs font-semibold text-[var(--accent-primary)] border border-[var(--border-subtle)] flex items-center gap-1.5 transition-colors"
          >
            <span>Applications Pipeline ({applications.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search & Work Mode Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search jobs by title, company, or skill..."
            className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          {['all', 'remote', 'hybrid', 'on-site'].map((mode) => (
            <button
              key={mode}
              onClick={() => setWorkModeFilter(mode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap capitalize transition-colors ${
                workModeFilter === mode
                  ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                  : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Jobs Grid */}
      <div className="space-y-4">
        {filteredJobs.length === 0 ? (
          <div className="text-center py-12 p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] space-y-2">
            <Briefcase className="w-8 h-8 text-[var(--text-muted)] mx-auto opacity-40" />
            <p className="font-bold text-[var(--text-primary)]">No matching jobs found.</p>
            <p>Try resetting search filters or unchecking "Saved Jobs".</p>
          </div>
        ) : (
          filteredJobs.map((job) => {
            const { matched, missing, matchPercentage } = calculateJobSkillsMatch(job.skillsRequired);
            const alreadyTracked = isApplied(job.id);
            const isBookmarked = bookmarkedJobIds.includes(job.id);

            return (
              <div
                key={job.id}
                className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 shadow-xs hover:border-[var(--accent-primary)]/40 transition-all"
              >
                {/* Top Row */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-[var(--text-primary)]">{job.title}</span>
                      <span className="text-xs font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded font-mono">
                        {matchPercentage}% Match
                      </span>
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] flex flex-wrap items-center gap-2">
                      <span className="font-medium text-[var(--text-primary)]">{job.company}</span>
                      <span aria-hidden="true">·</span>
                      <span>{job.location}</span>
                      <span aria-hidden="true">·</span>
                      <span>{job.workMode}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-emerald-600">{job.salaryRange.split(' ')[0]}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleBookmarkJob(job.id)}
                      className={`p-2 rounded-lg border transition-colors ${
                        isBookmarked
                          ? 'bg-[var(--accent-surface)] text-[var(--accent-primary)] border-[var(--accent-primary)]'
                          : 'border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                      title={isBookmarked ? 'Remove bookmark' : 'Bookmark job'}
                    >
                      {isBookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                    </button>

                    {alreadyTracked ? (
                      <button
                        onClick={() => onNavigate('applications')}
                        className="px-3 py-1.5 rounded-lg bg-[var(--surface-secondary)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        Tracked in Applications
                      </button>
                    ) : (
                      <button
                        onClick={() => handleTrackApplication(job)}
                        className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-xs font-semibold shadow-xs transition-colors"
                      >
                        Track in Pipeline
                      </button>
                    )}

                    <a
                      href={job.applicationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      title="External application link"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                  {job.description}
                </p>

                {/* Skills Match Breakdown */}
                <div className="pt-3 border-t border-[var(--border-subtle)] grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <div className="font-semibold text-emerald-600 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Matching Skills ({matched.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {matched.map((m, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded bg-[var(--surface-secondary)] text-[var(--text-primary)]">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="font-semibold text-amber-500 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Missing / Gap Skills ({missing.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {missing.map((m, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded bg-[var(--surface-secondary)] text-amber-500">
                          + {m}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
