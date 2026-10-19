import React from 'react';
import { Award, Layers, FolderGit2, Briefcase, Target, ShieldCheck, CheckCircle2, TrendingUp } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';

export const ProgressView: React.FC = () => {
  const { 
    targetRole, 
    skills, 
    roadmapPhases, 
    projects, 
    evidenceItems, 
    applications, 
    interviewSessions, 
    analysis 
  } = useCareer();

  const totalTasks = roadmapPhases.flatMap(p => p.milestones.flatMap(m => m.tasks)).length;
  const completedTasks = roadmapPhases.flatMap(p => p.milestones.flatMap(m => m.tasks.filter(t => t.status === 'completed'))).length;
  const roadmapPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const masteredSkills = skills.filter(s => s.gap === 0);
  const inProgressSkills = skills.filter(s => s.gap > 0);
  const completedProjects = projects.filter(p => p.status === 'completed' || p.status === 'published');
  const activeApplications = applications.filter(a => !['rejected', 'withdrawn'].includes(a.stage));

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)]">MEASURABLE OUTCOMES</div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            Career Progression Dashboard
          </h1>
        </div>

        <div className="text-xs text-[var(--text-muted)]">
          Target Role: <strong className="text-[var(--text-primary)]">{targetRole.title}</strong>
        </div>
      </div>

      {/* 4 Primary Progress Pillars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-2 shadow-xs">
          <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
            <Award className="w-4 h-4 text-[var(--color-success)]" />
            <span>Mastered Skills</span>
          </div>
          <div className="text-3xl font-extrabold font-mono tabular-nums text-[var(--text-primary)]">
            {masteredSkills.length} <span className="text-sm font-normal text-[var(--text-muted)]">/ {skills.length}</span>
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {inProgressSkills.length} actively advancing
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-2 shadow-xs">
          <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-[var(--accent-primary)]" />
            <span>Roadmap Completion</span>
          </div>
          <div className="text-3xl font-extrabold font-mono tabular-nums text-[var(--text-primary)]">
            {roadmapPct}%
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {completedTasks} of {totalTasks} tasks done
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-2 shadow-xs">
          <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
            <FolderGit2 className="w-4 h-4 text-[var(--color-info)]" />
            <span>Shipped Projects</span>
          </div>
          <div className="text-3xl font-extrabold font-mono tabular-nums text-[var(--text-primary)]">
            {completedProjects.length} <span className="text-sm font-normal text-[var(--text-muted)]">/ {projects.length}</span>
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {evidenceItems.length} verified artifacts
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-2 shadow-xs">
          <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
            <Briefcase className="w-4 h-4 text-[var(--color-warning)]" />
            <span>Active Pipeline</span>
          </div>
          <div className="text-3xl font-extrabold font-mono tabular-nums text-[var(--text-primary)]">
            {activeApplications.length}
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {interviewSessions.length} mock sessions recorded
          </div>
        </div>
      </div>

      {/* Progress Breakdown Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Closed Gaps Log */}
        <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 shadow-xs">
          <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" />
            <span>Mastered Skills for {targetRole.title}</span>
          </h3>

          <div className="space-y-2.5">
            {masteredSkills.map((sk) => (
              <div key={sk.id} className="p-3 rounded-lg bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-[var(--text-primary)]">{sk.name}</span>
                  <span className="text-[var(--text-muted)]"> · {sk.category}</span>
                </div>
                <span className="font-mono text-[var(--color-success)] font-medium">
                  Level {sk.currentLevel}/5 (Target Satisfied)
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Shipped Evidence & Deliverables */}
        <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 shadow-xs">
          <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[var(--accent-primary)]" />
            <span>Verifiable Evidence Artifacts</span>
          </h3>

          <div className="space-y-2.5">
            {evidenceItems.map((ev) => (
              <div key={ev.id} className="p-3 rounded-lg bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-[var(--text-primary)]">{ev.title}</span>
                  <span className="text-[var(--text-muted)]"> · {ev.type}</span>
                </div>
                <span className="text-[var(--accent-primary)] font-medium">
                  {ev.skillNames.length} Skills Linked
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
