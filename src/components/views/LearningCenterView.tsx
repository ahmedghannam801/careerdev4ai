import React, { useState } from 'react';
import { ExternalLink, BookOpen, Clock, DollarSign, CheckCircle2, BookmarkPlus, BookmarkCheck } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';

export const LearningCenterView: React.FC = () => {
  const { learningResources, enrolledResourceIds, toggleResourceEnrollment, analysis, targetRole } = useCareer();
  const [levelFilter, setLevelFilter] = useState<string>('all');

  const filtered = learningResources.filter(r => 
    levelFilter === 'all' ? true : r.level.toLowerCase() === levelFilter.toLowerCase()
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)]">CURATED CURRICULA</div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            Learning Recommendations for {targetRole.title}
          </h1>
        </div>
        <div className="text-xs text-[var(--text-muted)]">
          {enrolledResourceIds.length} Active Courses Enrolled
        </div>
      </div>

      {/* Level Filters */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {['all', 'beginner', 'intermediate', 'advanced'].map((lvl) => (
          <button
            key={lvl}
            onClick={() => setLevelFilter(lvl)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap capitalize transition-colors ${
              levelFilter === lvl
                ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {lvl === 'all' ? 'All Levels' : lvl}
          </button>
        ))}
      </div>

      {/* Course Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filtered.map((res) => {
          const isEnrolled = enrolledResourceIds.includes(res.id);

          return (
            <div
              key={res.id}
              className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 flex flex-col justify-between shadow-xs hover:border-[var(--border-strong)] transition-all"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold text-[var(--accent-primary)]">{res.provider}</span>
                    <h3 className="text-base font-bold text-[var(--text-primary)] mt-0.5">{res.title}</h3>
                  </div>
                  <button
                    onClick={() => toggleResourceEnrollment(res.id)}
                    className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--surface-secondary)]"
                    title={isEnrolled ? 'Enrolled' : 'Save / Enroll'}
                  >
                    {isEnrolled ? (
                      <BookmarkCheck className="w-5 h-5 text-[var(--accent-primary)]" />
                    ) : (
                      <BookmarkPlus className="w-5 h-5" />
                    )}
                  </button>
                </div>

                {/* Metadata Row */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
                  <span>Target: <strong className="text-[var(--text-primary)]">{res.skill}</strong></span>
                  <span aria-hidden="true">·</span>
                  <span>{res.level}</span>
                  <span aria-hidden="true">·</span>
                  <span>{res.duration}</span>
                  <span aria-hidden="true">·</span>
                  <span className={res.cost === 'Free' ? 'text-[var(--color-success)] font-medium' : ''}>{res.cost}</span>
                </div>

                {/* "Why am I seeing this?" rationale block (Mandatory per Prompt) */}
                <div className="p-3 rounded-lg bg-[var(--surface-secondary)]/60 border border-[var(--border-subtle)] text-xs space-y-1">
                  <div className="font-semibold text-[var(--text-primary)]">Why am I seeing this?</div>
                  <div className="text-[var(--text-secondary)] leading-relaxed">
                    {res.recommendationReason}
                  </div>
                </div>

                {/* Prerequisites */}
                {res.prerequisites.length > 0 && (
                  <div className="text-[11px] text-[var(--text-muted)]">
                    <span>Prerequisites: </span>
                    <span>{res.prerequisites.join(', ')}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
                <button
                  onClick={() => toggleResourceEnrollment(res.id)}
                  className={`text-xs font-medium flex items-center gap-1 ${isEnrolled ? 'text-[var(--color-success)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isEnrolled ? 'Enrolled in Plan' : 'Track in My Plan'}</span>
                </button>

                <a
                  href={res.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 rounded-lg bg-[var(--surface-secondary)] hover:bg-[var(--accent-surface)] text-xs font-semibold text-[var(--accent-primary)] flex items-center gap-1.5 transition-colors"
                >
                  <span>Open Resource</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
