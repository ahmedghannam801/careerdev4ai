import React, { useState } from 'react';
import { CheckCircle2, Clock, SkipForward, AlertCircle, Circle, Calendar, Sparkles, Filter, Plus } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { RoadmapTaskStatus, RoadmapTask } from '../../types/career';

export const RoadmapView: React.FC = () => {
  const { roadmapPhases, updateTaskStatus, isEnrolledInRoadmap, enrollInRoadmap, targetRole, t } = useCareer();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const totalTasks = roadmapPhases.flatMap(p => p.milestones.flatMap(m => m.tasks)).length;
  const completedTasks = roadmapPhases.flatMap(p => p.milestones.flatMap(m => m.tasks.filter(t => t.status === 'completed'))).length;
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const statusColors: Record<RoadmapTaskStatus, string> = {
    not_started: 'text-[var(--text-muted)]',
    in_progress: 'text-[var(--color-warning)]',
    completed: 'text-[var(--color-success)]',
    skipped: 'text-[var(--text-muted)]',
    blocked: 'text-[var(--color-danger)]'
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)]">EXECUTION TIMELINE</div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            Personal Career Roadmap
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-[var(--text-muted)]">Roadmap Completion</div>
            <div className="text-base font-bold font-mono tabular-nums text-[var(--accent-primary)]">
              {completedTasks} / {totalTasks} Tasks ({progressPct}%)
            </div>
          </div>
          {!isEnrolledInRoadmap && (
            <button
              onClick={enrollInRoadmap}
              className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-xs font-semibold shadow-xs"
            >
              Enroll in Roadmap
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {['all', 'in_progress', 'completed', 'not_started', 'blocked'].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap capitalize transition-colors ${
              statusFilter === st
                ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {st === 'all' ? `All Tasks (${totalTasks})` : st.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Phases and Milestones List */}
      <div className="space-y-6">
        {roadmapPhases.map((phase) => (
          <div
            key={phase.id}
            className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-6 shadow-xs"
          >
            {/* Phase Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--accent-primary)] font-bold">
                  PHASE {phase.phaseNumber}
                </span>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">{phase.title}</h2>
                <p className="text-xs text-[var(--text-secondary)]">{phase.description}</p>
              </div>
            </div>

            {/* Milestones inside Phase */}
            <div className="space-y-6">
              {phase.milestones.map((milestone) => {
                const visibleTasks = milestone.tasks.filter(t => 
                  statusFilter === 'all' ? true : t.status === statusFilter
                );

                if (visibleTasks.length === 0 && statusFilter !== 'all') return null;

                return (
                  <div key={milestone.id} className="space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-[var(--text-primary)]">
                      <span>{milestone.title}</span>
                      <span className="font-mono text-[var(--text-muted)] text-[11px]">
                        {milestone.completedTasksCount}/{milestone.tasks.length} Completed
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {visibleTasks.map((task) => (
                        <div
                          key={task.id}
                          className="p-3.5 rounded-xl bg-[var(--surface-secondary)]/40 border border-[var(--border-subtle)] flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-semibold text-sm ${task.status === 'completed' ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
                                {task.title}
                              </span>
                              {task.skillName && (
                                <span className="text-[11px] text-[var(--accent-primary)]">· {task.skillName}</span>
                              )}
                            </div>
                            <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
                              {task.description}
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)] pt-0.5">
                              {task.deadline && (
                                <span className="flex items-center gap-1 font-mono">
                                  <Calendar className="w-3 h-3" />
                                  Due {task.deadline}
                                </span>
                              )}
                              <span>·</span>
                              <span>Est. {task.estimatedHours}h</span>
                            </div>
                          </div>

                          {/* Action Selector: Status Controls */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {(['not_started', 'in_progress', 'completed', 'skipped', 'blocked'] as RoadmapTaskStatus[]).map((status) => (
                              <button
                                key={status}
                                onClick={() => updateTaskStatus(task.id, status)}
                                className={`px-2 py-1 rounded text-[11px] font-medium capitalize transition-colors ${
                                  task.status === status
                                    ? 'bg-[var(--accent-primary)] text-white font-semibold'
                                    : 'bg-[var(--surface-main)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                }`}
                              >
                                {status.replace('_', ' ')}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
