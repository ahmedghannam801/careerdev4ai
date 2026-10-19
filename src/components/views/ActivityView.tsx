import React, { useState } from 'react';
import { 
  Activity, 
  CheckCircle2, 
  Briefcase, 
  Target, 
  Award, 
  FolderGit2, 
  FileText, 
  Calendar, 
  Filter, 
  ArrowRight,
  Clock,
  Sparkles
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { ActivityActionType } from '../../types/career';

export const ActivityView: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  const { activities, t } = useCareer();
  const [filterType, setFilterType] = useState<string>('all');

  const getActionIcon = (type: ActivityActionType) => {
    switch (type) {
      case 'completed_task':
      case 'completed_course':
        return CheckCircle2;
      case 'applied_job':
      case 'saved_job':
        return Briefcase;
      case 'mock_interview':
        return Target;
      case 'acquired_skill':
      case 'added_evidence':
        return Award;
      case 'added_project':
        return FolderGit2;
      case 'uploaded_cv':
      case 'document_saved':
        return FileText;
      case 'goal_updated':
        return Target;
      default:
        return Activity;
    }
  };

  const filteredActivities = filterType === 'all'
    ? activities
    : activities.filter(a => {
        if (filterType === 'roadmap') return a.actionType === 'completed_task' || a.actionType === 'completed_course';
        if (filterType === 'jobs') return a.actionType === 'applied_job' || a.actionType === 'saved_job';
        if (filterType === 'interviews') return a.actionType === 'mock_interview';
        if (filterType === 'skills') return a.actionType === 'acquired_skill' || a.actionType === 'added_evidence';
        if (filterType === 'documents') return a.actionType === 'uploaded_cv' || a.actionType === 'document_saved';
        return true;
      });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="p-6 sm:p-8 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[var(--accent-surface)] text-[var(--accent-primary)] text-xs font-semibold mb-2">
            <Activity className="w-3.5 h-3.5" />
            <span>Audit & Verification</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">
            Recent Career Activity
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Verified log of meaningful milestones, application events, roadmap completions, and evidence uploads.
          </p>
        </div>

        <div className="text-xs font-mono text-[var(--text-muted)] bg-[var(--surface-secondary)] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)]">
          {activities.length} Logged Actions
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <span className="text-[var(--text-secondary)] font-medium">Filter Category:</span>
          {[
            { id: 'all', label: 'All Activity' },
            { id: 'roadmap', label: 'Roadmap & Tasks' },
            { id: 'jobs', label: 'Job Applications' },
            { id: 'interviews', label: 'Interviews' },
            { id: 'skills', label: 'Skills & Evidence' },
            { id: 'documents', label: 'CV & Documents' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterType === tab.id
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <span className="text-[11px] text-[var(--text-muted)] font-mono">
          Showing {filteredActivities.length} items
        </span>
      </div>

      {/* Activity List */}
      <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-4">
        {filteredActivities.length === 0 ? (
          <div className="text-center py-12 text-xs text-[var(--text-muted)] space-y-2">
            <Activity className="w-8 h-8 text-[var(--text-muted)] mx-auto opacity-50" />
            <p className="font-semibold text-[var(--text-primary)]">No activity matches this category.</p>
            <p>Complete tasks, submit applications, or drill interview questions to record activity.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredActivities.map((act) => {
              const Icon = getActionIcon(act.actionType);
              return (
                <div 
                  key={act.id}
                  className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:border-[var(--accent-primary)]/40 transition-colors flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[var(--accent-surface)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-bold text-[var(--text-primary)]">
                          {act.title}
                        </h3>
                        {act.relatedObject && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--surface-secondary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                            {act.relatedObject}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {act.subtitle}
                      </p>
                      <div className="text-[10px] font-mono text-[var(--text-muted)] flex items-center gap-1 pt-0.5">
                        <Clock className="w-3 h-3" />
                        <span>{act.timestamp}</span>
                      </div>
                    </div>
                  </div>

                  {act.linkView && (
                    <button
                      onClick={() => onNavigate(act.linkView!)}
                      className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--accent-primary)] flex items-center gap-1 transition-colors shrink-0"
                    >
                      <span>View</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
