import React from 'react';
import { ArrowRight, CheckCircle2, Circle, Clock, Sparkles, Layers, ShieldCheck, Target } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';

interface CareerPlanViewProps {
  onNavigate: (view: string) => void;
}

export const CareerPlanView: React.FC<CareerPlanViewProps> = ({ onNavigate }) => {
  const { roadmapPhases, targetRole, profile, analysis } = useCareer();

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)]">PROGRESSION STRATEGY</div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            Personal Career Plan for {targetRole.title}
          </h1>
        </div>

        <button
          onClick={() => onNavigate('roadmap')}
          className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
        >
          <span>Open Interactive Roadmap</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Plan Strategy Summary */}
      <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-3 shadow-xs">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--accent-primary)]">
          <Sparkles className="w-4 h-4" />
          <span>Strategic Trajectory Overview</span>
        </div>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          From {profile.careerState.replace('_', ' ')} to Mid-Level {targetRole.title}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-3xl">
          This 6-phase dynamic career architecture addresses your assessed gaps in priority order. Advancing through each phase unlocks the next tier of proof and prepares you for competitive market applications.
        </p>
      </div>

      {/* 6 Phases Timeline Cards */}
      <div className="space-y-4">
        {roadmapPhases.map((phase, idx) => {
          const totalTasks = phase.milestones.flatMap(m => m.tasks).length;
          const completedTasks = phase.milestones.flatMap(m => m.tasks.filter(t => t.status === 'completed')).length;
          const isFinished = totalTasks > 0 && completedTasks === totalTasks;

          return (
            <div
              key={phase.id}
              className={`p-6 rounded-xl border transition-all ${
                phase.isUnlocked || idx <= 1
                  ? 'bg-[var(--surface-main)] border-[var(--border-subtle)] shadow-xs'
                  : 'bg-[var(--surface-secondary)]/40 border-[var(--border-subtle)]/60 opacity-80'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                    isFinished 
                      ? 'bg-[var(--color-success)] text-white' 
                      : phase.isUnlocked 
                        ? 'bg-[var(--accent-primary)] text-white' 
                        : 'bg-[var(--surface-secondary)] text-[var(--text-muted)]'
                  }`}>
                    {idx + 1}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[var(--text-primary)]">{phase.title}</h3>
                    <p className="text-xs text-[var(--text-secondary)]">{phase.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs shrink-0">
                  <span className="font-mono tabular-nums text-[var(--text-muted)]">
                    {completedTasks} / {totalTasks} Tasks Completed
                  </span>
                  <button
                    onClick={() => onNavigate('roadmap')}
                    className="text-xs font-semibold text-[var(--accent-primary)] hover:underline"
                  >
                    View Tasks →
                  </button>
                </div>
              </div>

              {/* Milestones in this phase */}
              <div className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {phase.milestones.map((milestone) => (
                  <div key={milestone.id} className="p-3.5 rounded-lg bg-[var(--surface-secondary)]/40 border border-[var(--border-subtle)] space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]">
                      <span>{milestone.title}</span>
                      <span className="font-mono text-[var(--text-muted)] text-[11px]">
                        {milestone.completedTasksCount}/{milestone.tasks.length}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      {milestone.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
