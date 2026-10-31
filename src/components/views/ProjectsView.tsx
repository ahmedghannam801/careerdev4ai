import React, { useMemo, useState } from 'react';
import { Plus, ExternalLink, Github, X, HeartHandshake } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { PROJECT_STATUS_FILTERS } from '../../lib/routing';
import { useRouteParam } from '../../lib/useRouteParams';
import { ProjectStatus } from '../../types/career';
import { Reveal, Stagger, StaggerItem } from '../motion/Motion';
import { ProjectAiPanel } from '../projects/ProjectAiPanel';

/** The user-facing label of each project status. */
const STATUS_LABELS: Record<string, string> = {
  idea: 'Idea',
  planned: 'Planned',
  in_progress: 'In Progress',
  completed: 'Completed',
  published: 'Published',
};

export const ProjectsView: React.FC = () => {
  const { projects, addProject, updateProject, deleteProject, volunteerExperiences, t } = useCareer();
  const [statusFilter, setStatusFilter] = useRouteParam<string>('status', PROJECT_STATUS_FILTERS, 'all');
  const [showAddModal, setShowAddModal] = useState(false);

  // New project state
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Intermediate');
  const [skillsStr, setSkillsStr] = useState('React, TypeScript, Tailwind CSS');
  const [repoUrl, setRepoUrl] = useState('');
  const [demoUrl, setDemoUrl] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredProjects = projects.filter(p =>
    statusFilter === 'all' ? true : p.status === statusFilter
  );

  /**
   * The volunteering stints each project is evidence for — the other
   * direction of the volunteer <-> project link.
   *
   * The volunteer records already carry the ids of the projects they evidence,
   * so the reverse map is derived here instead of being fetched per project.
   */
  const volunteeringByProject = useMemo(() => {
    const map = new Map<string, { organization: string; role: string }[]>();
    for (const entry of volunteerExperiences) {
      for (const projectId of entry.projectIds) {
        const list = map.get(projectId) ?? [];
        list.push({ organization: entry.organization, role: entry.role });
        map.set(projectId, list);
      }
    }
    return map;
  }, [volunteerExperiences]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await addProject({
        title: title.trim(),
        goal: goal.trim(),
        description: description.trim(),
        difficulty,
        skills: skillsStr.split(',').map(s => s.trim()).filter(Boolean),
        tasks: [t('Scaffold repository structure'), t('Implement core features'), t('Add unit and e2e tests')],
        deliverables: [t('Production demo'), t('Public GitHub repository')],
        status: 'in_progress',
        repositoryUrl: repoUrl.trim() || undefined,
        demoUrl: demoUrl.trim() || undefined
      });

      setTitle('');
      setGoal('');
      setDescription('');
      setRepoUrl('');
      setDemoUrl('');
      setShowAddModal(false);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : t('The project could not be saved. Please try again.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Reveal className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)]">{t('PORTFOLIO & EVIDENCE ARTIFACTS')}</div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            {t('Practical Proof-of-Skill Projects')}
          </h1>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>{t('New Project')}</span>
        </button>
      </div>

      {/* The AI advisor: what to build next, and what is wrong with what is
          already there. It sits above the list so it is the first thing the
          candidate sees when they arrive to build something. */}
      <ProjectAiPanel />

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {['all', 'in_progress', 'completed', 'planned', 'idea', 'published'].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap capitalize transition-colors ${
              statusFilter === st
                ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)] shadow-xs'
                : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {st === 'all' ? `${t('All Projects')} (${projects.length})` : t(STATUS_LABELS[st] ?? st)}
          </button>
        ))}
      </div>

      {/* Projects List */}
      <Stagger inView gap={0.06} className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredProjects.map((project) => (
          <StaggerItem
            key={project.id}
            className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 flex flex-col justify-between shadow-xs hover:border-[var(--border-strong)] transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-[var(--text-muted)] flex items-center gap-2">
                    <span>{project.difficulty}</span>
                    <span>·</span>
                    <span className="capitalize">{t(STATUS_LABELS[project.status] ?? project.status)}</span>
                  </div>
                  <h3 className="text-base font-bold text-[var(--text-primary)] mt-0.5">{project.title}</h3>
                </div>

                <select
                  value={project.status}
                  onChange={(e) => updateProject(project.id, { status: e.target.value as ProjectStatus })}
                  className="text-xs bg-[var(--surface-secondary)] border border-[var(--border-subtle)] rounded-lg px-2 py-1 text-[var(--text-primary)] font-medium focus:outline-none"
                >
                  <option value="idea">{t('Idea')}</option>
                  <option value="planned">{t('Planned')}</option>
                  <option value="in_progress">{t('In Progress')}</option>
                  <option value="completed">{t('Completed')}</option>
                  <option value="published">{t('Published')}</option>
                </select>
              </div>

              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {project.goal}
              </p>

              {/* Skills Tags */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {project.skills.map((skill, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-[var(--surface-secondary)] text-[var(--text-secondary)]">
                    {skill}
                  </span>
                ))}
              </div>

              {/* Deliverables List */}
              <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1">
                <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">{t('Key Deliverables')}</div>
                <ul className="text-xs text-[var(--text-secondary)] space-y-1">
                  {project.deliverables.map((deliv, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <span className="text-[var(--color-primary-text)] font-bold">✍</span>
                      <span>{deliv}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* The volunteering this project is evidence for. */}
              {(volunteeringByProject.get(project.id) ?? []).length > 0 && (
                <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase flex items-center gap-1.5">
                    <HeartHandshake className="w-3 h-3" />
                    {t('Volunteering')}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(volunteeringByProject.get(project.id) ?? []).map((entry, i) => (
                      <span
                        key={i}
                        className="text-[11px] px-2 py-0.5 rounded bg-[var(--accent-surface)] text-[var(--color-primary-text)]"
                      >
                        {entry.role} · {entry.organization}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Links & Actions */}
            <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                {project.repositoryUrl && (
                  <a
                    href={project.repositoryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[var(--text-primary)] hover:text-[var(--color-primary-text)] font-medium"
                  >
                    <Github className="w-3.5 h-3.5" />
                    <span>{t('Repository')}</span>
                  </a>
                )}
                {project.demoUrl && (
                  <a
                    href={project.demoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[var(--color-primary-text)] hover:underline font-medium"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{t('Live Demo')}</span>
                  </a>
                )}
              </div>

              <button
                onClick={() => deleteProject(project.id)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--color-danger)] transition-colors"
              >
                {t('Delete')}
              </button>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      {/* Add Project Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-[var(--surface-main)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-base font-bold text-[var(--text-primary)]">{t('Add Proof-of-Skill Project')}</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              {submitError && (
                <div
                  role="alert"
                  className="rounded-lg border border-[var(--color-danger)]/25 bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]"
                >
                  {submitError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">{t('Project Title')}</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('e.g. Distributed Task Queue or Accessible Design System')}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">{t('Goal / Executive Summary')}</label>
                <textarea
                  required
                  rows={2}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder={t('What problem does this solve and what evidence does it provide?')}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">{t('Difficulty')}</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                  >
                    <option value="Beginner">{t('Beginner')}</option>
                    <option value="Intermediate">{t('Intermediate')}</option>
                    <option value="Advanced">{t('Advanced')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">{t('Skills (comma separated)')}</label>
                  <input
                    type="text"
                    value={skillsStr}
                    onChange={(e) => setSkillsStr(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">{t('GitHub Repo URL')}</label>
                  <input
                    type="url"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/..."
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">{t('Live Demo URL')}</label>
                  <input
                    type="url"
                    value={demoUrl}
                    onChange={(e) => setDemoUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
                >
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] text-[var(--color-on-primary)] text-xs font-semibold hover:bg-[var(--accent-secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? t('Creating…') : t('Create Project')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Reveal>
  );
};
