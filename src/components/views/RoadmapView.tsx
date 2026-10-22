import React, { useState } from 'react';
import { CheckCircle2, Clock, SkipForward, AlertCircle, Circle, Calendar, Sparkles, Filter, Plus, BookOpen, ExternalLink } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { RoadmapTaskStatus, RoadmapTask } from '../../types/career';

interface RoadmapViewProps {
  onNavigate?: (view: string) => void;
}

export const RoadmapView: React.FC<RoadmapViewProps> = ({ onNavigate }) => {
  const {
    roadmapPhases,
    updateTaskStatus,
    isEnrolledInRoadmap,
    enrollInRoadmap,
    targetRole,
    t,
    learningCatalog,
    learningRecommendations,
    getLearningItem,
    saveLearningCourse,
    startLearningCourse,
  } = useCareer();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const coursesForSkill = (skillName: string | null) => {
    if (!skillName) return [];
    const normalized = skillName.toLowerCase();
    const recommended = learningRecommendations.filter((rec) =>
      rec.course.skills.some((skill) => skill.name.toLowerCase() === normalized)
    );
    if (recommended.length > 0) {
      return recommended.slice(0, 2).map((rec) => ({ course: rec.course, rec }));
    }
    return learningCatalog
      .filter((course) =>
        course.skills.some((skill) => skill.name.toLowerCase() === normalized)
      )
      .slice(0, 2)
      .map((course) => ({ course, rec: undefined }));
  };

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

                            {/* B.5 — a roadmap skill gap leads directly to
                                concrete, persisted learning resources. */}
                            {task.status !== 'completed' && (() => {
                              const options = coursesForSkill(task.skillName ?? null);
                              if (options.length === 0) return null;
                              return (
                                <div className="mt-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)]/60 p-2.5">
                                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                    <BookOpen className="h-3 w-3" />
                                    Learning for this gap
                                  </div>
                                  <div className="mt-1.5 space-y-1.5">
                                    {options.map(({ course, rec }) => {
                                      const item = getLearningItem(course.id);
                                      return (
                                        <div
                                          key={course.id}
                                          className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between"
                                        >
                                          <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                              <span className="truncate text-[11px] font-medium text-[var(--text-primary)]">
                                                {course.title}
                                              </span>
                                              {rec && (
                                                <span className="rounded-full bg-[var(--accent-primary)]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--accent-primary)]">
                                                  {Math.round(rec.score)}% match
                                                </span>
                                              )}
                                              {item && (
                                                <span className="rounded-full bg-[var(--surface-secondary)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)] capitalize">
                                                  {item.status.replace('_', ' ')}
                                                </span>
                                              )}
                                            </div>
                                            <div className="text-[10px] text-[var(--text-muted)]">
                                              {course.provider} · {course.availability.replace(/_/g, ' ')}
                                            </div>
                                          </div>
                                          <div className="flex shrink-0 items-center gap-1.5">
                                            {!item && (
                                              <button
                                                type="button"
                                                onClick={() => void saveLearningCourse(course.id, rec?.reason)}
                                                className="rounded border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                              >
                                                Save
                                              </button>
                                            )}
                                            {item?.status !== 'completed' && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  void startLearningCourse(course.id, rec?.reason);
                                                  updateTaskStatus(task.id, 'in_progress');
                                                }}
                                                className="rounded bg-[var(--accent-primary)] px-1.5 py-0.5 text-[10px] font-semibold text-white hover:opacity-90"
                                              >
                                                Start
                                              </button>
                                            )}
                                            <a
                                              href={course.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-[var(--text-muted)] hover:text-[var(--accent-primary)]"
                                              aria-label={`Open ${course.title}`}
                                            >
                                              <ExternalLink className="h-3 w-3" />
                                            </a>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {onNavigate && (
                                    <button
                                      type="button"
                                      onClick={() => onNavigate('learning')}
                                      className="mt-2 text-[10px] font-medium text-[var(--accent-primary)] hover:underline"
                                    >
                                      Open the Learning Hub →
                                    </button>
                                  )}
                                </div>
                              );
                            })()}
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
