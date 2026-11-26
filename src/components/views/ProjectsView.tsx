import React, { useMemo, useState, useRef } from 'react';
import {
  Plus,
  ExternalLink,
  Github,
  X,
  HeartHandshake,
  ListChecks,
  Star,
  Edit3,
  Trash2,
  Upload,
  Calendar,
  Search,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { PROJECT_STATUS_FILTERS } from '../../lib/routing';
import { useRouteParam } from '../../lib/useRouteParams';
import { CareerProject, ProjectCategory, ProjectStatus } from '../../types/career';
import {
  PROJECT_LIFECYCLE_STATUSES,
  PROJECT_STATUS_LABELS,
} from '../../../shared/projectLifecycle';
import { BarChart, ChartCard, DonutChart, chartColor, formatCount, type ChartDatum } from '../charts';
import { Reveal, Stagger, StaggerItem } from '../motion/Motion';
import { EmptyState } from '../ui/EmptyState';
import { useToast } from '../toast/ToastProvider';
import { ProjectAiPanel } from '../projects/ProjectAiPanel';
import { uploadPortfolioAttachment } from '../../lib/coreApi';
import { CareerImage } from '../ui/CareerImage';

/** The user-facing label of each project status. */
const STATUS_LABELS: Record<string, string> = {
  idea: 'Idea',
  planned: 'Planned',
  in_progress: 'In Progress',
  completed: 'Completed',
  published: 'Published',
};

const CATEGORY_LABELS: Record<ProjectCategory, string> = {
  academic: 'Academic',
  personal: 'Personal',
  professional: 'Professional',
  volunteer: 'Volunteer',
  team: 'Team',
};

export const ProjectsView: React.FC = () => {
  const {
    projects,
    addProject,
    updateProject,
    deleteProject,
    evidenceItems,
    addEvidence,
    targetRole,
    volunteerExperiences,
    t,
  } = useCareer();
  const { showToast } = useToast();
  const defaultProjectSkills = useMemo(
    () => (targetRole?.requiredSkills ?? []).slice(0, 3).map((s) => s.name).join(', '),
    [targetRole]
  );
  const [statusFilter, setStatusFilter] = useRouteParam<string>('status', PROJECT_STATUS_FILTERS, 'all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  // The search, the difficulty and the order are the candidate's own way of
  // narrowing the list. They are read from the records, never from a preset.
  const [projectSearch, setProjectSearch] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');
  const [projectSort, setProjectSort] = useState<'recent' | 'title' | 'difficulty'>('recent');
  
  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProject, setEditingProject] = useState<CareerProject | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<CareerProject | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ProjectCategory>('personal');
  const [role, setRole] = useState('');
  const [responsibilitiesStr, setResponsibilitiesStr] = useState('');
  const [difficulty, setDifficulty] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Intermediate');
  const [status, setStatus] = useState<ProjectStatus>('in_progress');
  const [skillsStr, setSkillsStr] = useState(defaultProjectSkills);
  const [repoUrl, setRepoUrl] = useState('');
  const [demoUrl, setDemoUrl] = useState('');
  const [startDate, setStartDate] = useState('');
  const [completedAt, setCompletedAt] = useState('');
  const [isFeatured, setIsFeatured] = useState(false);
  const [includeInPortfolio, setIncludeInPortfolio] = useState(true);
  const [thumbnailUrl, setThumbnailUrl] = useState('');

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredProjects = useMemo(() => {
    const term = projectSearch.trim().toLowerCase();
    const matched = projects.filter((p) => {
      const matchesStatus = statusFilter === 'all' ? true : p.status === statusFilter;
      const matchesCategory =
        categoryFilter === 'all' ? true : (p.category ?? 'personal') === categoryFilter;
      const matchesDifficulty =
        difficultyFilter === 'all' ? true : p.difficulty === difficultyFilter;
      if (!matchesStatus || !matchesCategory || !matchesDifficulty) return false;
      if (term) {
        // The search reads what a candidate would remember the project by:
        // its name, what it is for, the skills it uses and its own role in it.
        const haystack = [
          p.title,
          p.goal ?? '',
          p.description ?? '',
          p.role ?? '',
          (p.skills ?? []).join(' '),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });

    // The order is the candidate's choice, and it is applied to what survived
    // the filters rather than to the whole list.
    const difficultyRank: Record<string, number> = {
      Beginner: 0,
      Intermediate: 1,
      Advanced: 2,
    };
    return matched.sort((a, b) => {
      if (projectSort === 'title') return a.title.localeCompare(b.title);
      if (projectSort === 'difficulty') {
        const difference =
          (difficultyRank[a.difficulty] ?? 0) - (difficultyRank[b.difficulty] ?? 0);
        if (difference !== 0) return difference;
      }
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    });
  }, [
    projects,
    statusFilter,
    categoryFilter,
    difficultyFilter,
    projectSearch,
    projectSort,
  ]);

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

  /**
   * What the portfolio actually proves, measured against the role the
   * candidate is aiming at.
   *
   * A list of projects is not a portfolio. What matters is whether the skills
   * the target role asks for are demonstrated by something that shipped, and
   * whether that work can be opened by a stranger. This is computed from the
   * candidate's own records, so the number moves as they finish real work.
   */
  const portfolio = useMemo(() => {
    const shipped = projects.filter(
      (project) => project.status === 'completed' || project.status === 'published'
    );
    const provenSkills = new Set<string>();
    shipped.forEach((project) => {
      (project.skills ?? []).forEach((skill) => provenSkills.add(skill.trim().toLowerCase()));
    });
    const targetSkills = (targetRole?.requiredSkills ?? [])
      .map((skill) => skill.name)
      .filter(Boolean);
    const covered = targetSkills.filter((skill) => provenSkills.has(skill.trim().toLowerCase()));
    const uncovered = targetSkills.filter((skill) => !provenSkills.has(skill.trim().toLowerCase()));
    const linkable = shipped.filter((project) => project.repositoryUrl || project.demoUrl);
    return {
      shippedCount: shipped.length,
      liveCount: linkable.length,
      provenCount: provenSkills.size,
      targetSkills,
      covered,
      uncovered,
      coverage:
        targetSkills.length > 0 ? Math.round((covered.length / targetSkills.length) * 100) : 0,
    };
  }, [projects, targetRole]);

  /**
   * The portfolio, split by the stage each project is really at.
   *
   * The status filter above says which projects match a stage; this says how
   * the whole portfolio is distributed across the stages, which is the part a
   * candidate cannot see by looking at one card at a time.
   */
  const statusDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of projects) {
      const status = project.status ?? 'planned';
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return PROJECT_LIFECYCLE_STATUSES.map((status) => ({
      key: status,
      label: t(PROJECT_STATUS_LABELS[status]),
      value: counts.get(status) ?? 0,
    })).filter((entry) => entry.value > 0);
  }, [projects, t]);

  /**
   * How many finished projects stand behind each skill the role asks for.
   *
   * A skill with one project is proof; a skill with three is a pattern. This
   * counts the shipped work behind each of the first eight target skills, so
   * the candidate can see where the portfolio is deep and where it is thin.
   */
  const proofBySkill: ChartDatum[] = useMemo(() => {
    const shipped = projects.filter(
      (project) => project.status === 'completed' || project.status === 'published'
    );
    return portfolio.targetSkills
      .slice(0, 8)
      .map((skill) => {
        const lowered = skill.trim().toLowerCase();
        const value = shipped.filter((project) =>
          (project.skills ?? []).some((entry) => entry.trim().toLowerCase() === lowered)
        ).length;
        return { key: skill, label: skill, value };
      })
      .sort((a, b) => b.value - a.value);
  }, [projects, portfolio.targetSkills]);

  /**
   * Opens the project form already aimed at a skill the portfolio cannot yet
   * prove. The wording is a starting point the candidate edits, not content
   * that gets saved behind their back.
   */
  const startProjectForSkill = (skill: string) => {
    resetForm();
    setTitle(`${skill}: proof-of-skill project`);
    setGoal(
      `Prove ${skill} with one small, documented piece of work: the question you answered, the approach you took, the result you got and what you would change next time.`
    );
    setSkillsStr(skill);
    setDifficulty('Intermediate');
    setStatus('planned');
    setShowAddModal(true);
  };

  const resetForm = () => {
    setTitle('');
    setGoal('');
    setDescription('');
    setCategory('personal');
    setRole('');
    setResponsibilitiesStr('');
    setDifficulty('Intermediate');
    setStatus('in_progress');
    setSkillsStr(defaultProjectSkills);
    setRepoUrl('');
    setDemoUrl('');
    setStartDate('');
    setCompletedAt('');
    setIsFeatured(false);
    setIncludeInPortfolio(true);
    setThumbnailUrl('');
    setSubmitError(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (project: CareerProject) => {
    setSubmitError(null);
    setEditingProject(project);
    setTitle(project.title);
    setGoal(project.goal);
    setDescription(project.description);
    setCategory(project.category ?? 'personal');
    setRole(project.role ?? '');
    setResponsibilitiesStr((project.responsibilities ?? []).join('\n'));
    setDifficulty(project.difficulty);
    setStatus(project.status);
    setSkillsStr((project.skills ?? []).join(', '));
    setRepoUrl(project.repositoryUrl ?? '');
    setDemoUrl(project.demoUrl ?? '');
    setStartDate(project.startDate ?? '');
    setCompletedAt(project.completedAt ?? '');
    setIsFeatured(project.isFeatured ?? false);
    setIncludeInPortfolio(project.includeInPortfolio !== false);
    setThumbnailUrl(project.thumbnailUrl ?? '');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setSubmitError(null);
    try {
      const res = await uploadPortfolioAttachment(file);
      setThumbnailUrl(res.publicUrl);
    } catch (err: any) {
      setSubmitError(err?.message || t('Failed to upload file. Please try again.'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const responsibilities = responsibilitiesStr
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      await addProject({
        title: title.trim(),
        goal: goal.trim(),
        description: description.trim(),
        category,
        role: role.trim() || undefined,
        responsibilities,
        difficulty,
        skills: skillsStr.split(',').map((s) => s.trim()).filter(Boolean),
        tasks: [t('Scaffold repository structure'), t('Implement core features'), t('Add unit and e2e tests')],
        deliverables: [t('Production demo'), t('Public GitHub repository')],
        status,
        repositoryUrl: repoUrl.trim() || undefined,
        demoUrl: demoUrl.trim() || undefined,
        startDate: startDate.trim() || undefined,
        completedAt: completedAt.trim() || undefined,
        isFeatured,
        includeInPortfolio,
        thumbnailUrl: thumbnailUrl.trim() || undefined,
      });

      resetForm();
      setShowAddModal(false);
    } catch (error: any) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : t('The project could not be saved. Please try again.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const maybeCreateProjectEvidence = async (proj: {
    id?: string;
    title: string;
    goal?: string;
    status: ProjectStatus;
    skills: string[];
    repositoryUrl?: string;
    demoUrl?: string;
  }) => {
    const done = proj.status === 'completed' || proj.status === 'published';
    const artifactUrl = proj.repositoryUrl?.trim() || proj.demoUrl?.trim();
    if (!done || !artifactUrl) return;
    const alreadyExists = evidenceItems.some(
      (item) =>
        (proj.id && item.projectId === proj.id) ||
        item.url === artifactUrl ||
        item.title.trim().toLowerCase() === proj.title.trim().toLowerCase()
    );
    if (alreadyExists) return;
    try {
      await addEvidence({
        title: `${proj.title} — ${t('Project Deliverable')}`,
        type: proj.repositoryUrl?.trim() ? 'github' : 'demo',
        description: proj.goal?.trim() || t('Completed portfolio project with public artifact link.'),
        url: artifactUrl,
        verified: false,
        projectId: proj.id,
        skillNames: proj.skills,
      });
      showToast({
        variant: 'success',
        title: t('Portfolio evidence recorded'),
        description: t('"{title}" was linked in Evidence & Portfolio to substantiate your skills.').replace('{title}', proj.title),
      });
    } catch {
      // Evidence creation is additive; do not block project update if it fails.
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject || !title.trim() || isSubmitting) return;

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const responsibilities = responsibilitiesStr
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const parsedSkills = skillsStr.split(',').map((s) => s.trim()).filter(Boolean);
      const nextRepo = repoUrl.trim() || undefined;
      const nextDemo = demoUrl.trim() || undefined;

      await updateProject(editingProject.id, {
        title: title.trim(),
        goal: goal.trim(),
        description: description.trim(),
        category,
        role: role.trim() || undefined,
        responsibilities,
        difficulty,
        status,
        skills: parsedSkills,
        repositoryUrl: nextRepo,
        demoUrl: nextDemo,
        startDate: startDate.trim() || undefined,
        completedAt: completedAt.trim() || undefined,
        isFeatured,
        includeInPortfolio,
        thumbnailUrl: thumbnailUrl.trim() || undefined,
      });

      await maybeCreateProjectEvidence({
        id: editingProject.id,
        title: title.trim(),
        goal: goal.trim(),
        status,
        skills: parsedSkills,
        repositoryUrl: nextRepo,
        demoUrl: nextDemo,
      });

      setEditingProject(null);
      resetForm();
    } catch (error: any) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : t('Failed to update project. Please try again.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!projectToDelete) return;
    try {
      await deleteProject(projectToDelete.id);
      setProjectToDelete(null);
    } catch (error: any) {
      console.error('Failed to delete project:', error);
    }
  };

  return (
    <Reveal className="space-y-8">
      {/* Header */}
      <div data-guide="projects" className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)]">{t('PORTFOLIO & EVIDENCE ARTIFACTS')}</div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            {t('Practical Proof-of-Skill Projects')}
          </h1>
        </div>

        <button
          data-tour="add-project-button"
          onClick={openAddModal}
          className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>{t('New Project')}</span>
        </button>
      </div>

      {/* The AI advisor */}
      <ProjectAiPanel />

      {/* Filter Tabs: Status & Category */}
      <div className="space-y-3 pb-1">
        {/* The search and the order. The search reads the candidate's own
            records, so a project is found by anything they would remember it
            by — its name, what it is for, or a skill it uses. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute start-2.5 top-2.5 text-[var(--text-muted)]"
            />
            <input
              value={projectSearch}
              onChange={(event) => setProjectSearch(event.target.value)}
              placeholder={t('Search your projects by name, goal or skill')}
              aria-label={t('Search your projects by name, goal or skill')}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] py-2 ps-8 pe-3 text-sm text-[var(--text-primary)]"
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
            <span className="sr-only sm:not-sr-only">{t('Difficulty')}</span>
            <select
              value={difficultyFilter}
              onChange={(event) => setDifficultyFilter(event.target.value)}
              aria-label={t('Difficulty')}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-2.5 py-2 text-xs font-medium text-[var(--text-primary)]"
            >
              <option value="all">{t('All difficulties')}</option>
              {['Beginner', 'Intermediate', 'Advanced'].map((level) => (
                <option key={level} value={level}>
                  {t(level)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
            <span className="sr-only sm:not-sr-only">{t('Sort by')}</span>
            <select
              value={projectSort}
              onChange={(event) =>
                setProjectSort(event.target.value as 'recent' | 'title' | 'difficulty')
              }
              aria-label={t('Sort by')}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-2.5 py-2 text-xs font-medium text-[var(--text-primary)]"
            >
              <option value="recent">{t('Most recent first')}</option>
              <option value="title">{t('Name (A–Z)')}</option>
              <option value="difficulty">{t('Difficulty')}</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-[var(--text-secondary)] me-2">{t('Status')}:</span>
          {['all', 'planned', 'in_progress', 'completed', 'published'].map((st) => (
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

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-[var(--text-secondary)] me-2">{t('Category')}:</span>
          {['all', 'personal', 'academic', 'professional', 'volunteer', 'team'].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors border ${
                categoryFilter === cat
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-surface)] text-[var(--color-primary-text)] font-bold'
                  : 'border-[var(--border-subtle)] bg-[var(--surface-main)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {cat === 'all' ? t('All Categories') : t(CATEGORY_LABELS[cat as ProjectCategory] ?? cat)}
            </button>
          ))}
        </div>
      </div>

      {/* Projects List */}
      {filteredProjects.length === 0 ? (
        <EmptyState
          icon={Plus}
          title={
            projects.length === 0
              ? t('No projects yet')
              : t('No projects with this filter')
          }
          description={
            projects.length === 0
              ? t('A project is the strongest proof of a skill. Add one you have built, or ask the advisor for one that closes a gap in your target role. Every project you link to a skill moves your Role Readiness up.')
              : t('Try another status or category filter, or add a project in this state.')
          }
          actionLabel={projects.length === 0 ? t('+ Add Your First Project') : undefined}
          onAction={projects.length === 0 ? openAddModal : undefined}
        />
      ) : (
        <Stagger inView gap={0.06} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredProjects.map((project) => {
            const projectCat = (project.category as ProjectCategory) || 'personal';
            return (
              <StaggerItem
                key={project.id}
                className="overflow-hidden rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] flex flex-col shadow-xs hover:border-[var(--border-strong)] transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                {/* Project Header Cover */}
                {project.thumbnailUrl ? (
                  <div className="relative h-32 w-full overflow-hidden bg-[var(--surface-secondary)] border-b border-[var(--border-subtle)]">
                    <img
                      src={project.thumbnailUrl}
                      alt={project.title}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    {project.isFeatured && (
                      <div className="absolute top-3 start-3 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/90 text-white text-[11px] font-bold shadow-xs">
                        <Star className="w-3 h-3 fill-current" />
                        <span>{t('Featured')}</span>
                      </div>
                    )}
                    <div className="absolute bottom-2 start-4 end-4 flex items-center justify-between text-white">
                      <span className="text-xs font-semibold capitalize bg-black/40 px-2 py-0.5 rounded backdrop-blur-xs">
                        {t(CATEGORY_LABELS[projectCat] ?? projectCat)}
                      </span>
                      {project.role && (
                        <span className="text-[11px] font-medium opacity-90 truncate max-w-[140px]">
                          {project.role}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="relative h-32 w-full overflow-hidden bg-[var(--surface-secondary)] border-b border-[var(--border-subtle)]">
                    <CareerImage
                      category={project.skills?.[0] || project.category || project.title}
                      size="sm"
                      aspectRatio="16/9"
                      rounded="rounded-none"
                      className="h-full w-full object-cover"
                    >
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/10" />
                      {project.isFeatured && (
                        <div className="absolute top-3 start-3 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/90 text-white text-[11px] font-bold shadow-xs">
                          <Star className="w-3 h-3 fill-current" />
                          <span>{t('Featured')}</span>
                        </div>
                      )}
                      <div className="absolute bottom-2 start-4 end-4 flex items-center justify-between text-white">
                        <span className="text-xs font-semibold capitalize bg-black/50 px-2 py-0.5 rounded backdrop-blur-xs">
                          {t(CATEGORY_LABELS[projectCat] ?? projectCat)}
                        </span>
                        {project.role && (
                          <span className="text-[11px] font-medium opacity-90 truncate max-w-[140px]">
                            {project.role}
                          </span>
                        )}
                      </div>
                    </CareerImage>
                  </div>
                )}

                <div className="flex flex-1 flex-col justify-between gap-4 p-6">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs text-[var(--text-muted)] flex items-center gap-2">
                          <span className="font-medium">{project.difficulty}</span>
                          <span>·</span>
                          <span className="capitalize">{t(STATUS_LABELS[project.status] ?? project.status)}</span>
                          {project.startDate && (
                            <>
                              <span>·</span>
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="w-2.5 h-2.5" />
                                {project.startDate}
                              </span>
                            </>
                          )}
                        </div>
                        <h3 className="text-base font-bold text-[var(--text-primary)] mt-0.5">
                          {project.title}
                        </h3>
                      </div>

                      <select
                        value={project.status}
                        onChange={(e) => {
                          const nextStatus = e.target.value as ProjectStatus;
                          updateProject(project.id, { status: nextStatus });
                          void maybeCreateProjectEvidence({
                            id: project.id,
                            title: project.title,
                            goal: project.goal,
                            status: nextStatus,
                            skills: project.skills,
                            repositoryUrl: project.repositoryUrl,
                            demoUrl: project.demoUrl,
                          });
                        }}
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

                    {/* Responsibilities */}
                    {project.responsibilities && project.responsibilities.length > 0 && (
                      <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1">
                        <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">
                          {t('Responsibilities')}
                        </div>
                        <ul className="text-xs text-[var(--text-secondary)] space-y-1">
                          {project.responsibilities.slice(0, 3).map((resp, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span className="text-[var(--color-primary-text)] mt-0.5">•</span>
                              <span>{resp}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Skills Tags */}
                    <div data-tour="project-tech-tags" className="flex flex-wrap gap-1.5 pt-1">
                      {project.skills.map((skill, i) => (
                        <span
                          key={i}
                          className="text-[11px] px-2 py-0.5 rounded bg-[var(--surface-secondary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>

                    {/* Deliverables List */}
                    {project.deliverables && project.deliverables.length > 0 && (
                      <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1">
                        <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">
                          {t('Key Deliverables')}
                        </div>
                        <ul className="text-xs text-[var(--text-secondary)] space-y-1">
                          {project.deliverables.slice(0, 3).map((deliv, i) => (
                            <li key={i} className="flex items-center gap-1.5">
                              <span className="text-[var(--color-primary-text)] font-bold">✍</span>
                              <span>{deliv}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Persisted task list */}
                    {project.tasks.length > 0 && (
                      <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-muted)] uppercase">
                          <span className="inline-flex items-center gap-1.5">
                            <ListChecks className="h-3 w-3" /> {t('Task checklist')}
                          </span>
                          <span>
                            {project.tasks.length} {t('tasks')}
                          </span>
                        </div>
                        <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
                          {project.tasks.slice(0, 3).map((task, i) => {
                            const done = project.status === 'completed' || project.status === 'published';
                            return (
                              <li key={i} className="flex items-start gap-1.5">
                                <span
                                  aria-hidden
                                  className={`mt-0.5 inline-flex h-3 w-3 shrink-0 items-center justify-center rounded border ${
                                    done
                                      ? 'border-[var(--color-success-strong)] bg-[var(--color-success-strong)] text-white'
                                      : 'border-[var(--border-strong)]'
                                  }`}
                                >
                                  {done ? '✓' : ''}
                                </span>
                                <span className={done ? 'line-through opacity-70' : ''}>{task}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {/* Volunteering link */}
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
                  <div data-tour="project-portfolio-sync" className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs">
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

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(project)}
                        aria-label={t('Edit')}
                        className="p-1 text-[var(--text-muted)] hover:text-[var(--color-primary-text)] transition-colors rounded"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setProjectToDelete(project)}
                        aria-label={t('Delete')}
                        className="p-1 text-[var(--text-muted)] hover:text-[var(--color-danger)] transition-colors rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}

      {/* Portfolio coverage. It closes the page: the records come first, and
          this is what they add up to against the role the candidate is
          chasing. */}
      <div className="grid gap-4 lg:grid-cols-[1.15fr,1fr]">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {t('Portfolio coverage')}
              </div>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {portfolio.targetSkills.length > 0
                  ? t('How much of your target role you can already show, not just claim.')
                  : t('Completed work appears here as proof you can hand to an employer.')}
              </p>
            </div>
            <span className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">
              {portfolio.targetSkills.length > 0 ? `${portfolio.coverage}%` : portfolio.shippedCount}
              <span className="ms-1 text-[11px] font-medium text-[var(--text-muted)]">
                {portfolio.targetSkills.length > 0 ? t('covered') : t('shipped')}
              </span>
            </span>
          </div>

          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-secondary)]"
            role="progressbar"
            aria-valuenow={portfolio.coverage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('Portfolio coverage')}
          >
            <div
              className="h-full rounded-full bg-[var(--accent-primary)] transition-[width] duration-500"
              style={{ width: `${portfolio.targetSkills.length > 0 ? portfolio.coverage : 0}%` }}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)]">
            <span>
              <strong className="text-[var(--text-primary)]">{portfolio.shippedCount}</strong>{' '}
              {t('shipped projects')}
            </span>
            <span>
              <strong className="text-[var(--text-primary)]">{portfolio.liveCount}</strong>{' '}
              {t('openable links')}
            </span>
            <span>
              <strong className="text-[var(--text-primary)]">{portfolio.provenCount}</strong>{' '}
              {t('skills evidenced')}
            </span>
          </div>

          {portfolio.targetSkills.length > 0 && portfolio.covered.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--border-subtle)] pt-3">
              {portfolio.covered.slice(0, 6).map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--color-success)]/25 bg-[var(--color-success-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-success-strong)]"
                >
                  <span aria-hidden>✓</span>
                  {skill}
                </span>
              ))}
              {portfolio.covered.length > 6 ? (
                <span className="text-[10px] text-[var(--text-muted)]">
                  +{portfolio.covered.length - 6}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {portfolio.uncovered.length > 0
              ? t('Where the proof is thin')
              : t('Proof looks complete')}
          </div>
          {portfolio.uncovered.length > 0 ? (
            <>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {t('These role skills have no finished project behind them yet:')}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {portfolio.uncovered.slice(0, 3).map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full border border-[var(--accent-primary)]/30 bg-[var(--accent-surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary-text)]"
                  >
                    {skill}
                  </span>
                ))}
                {portfolio.uncovered.length > 3 ? (
                  <span className="text-[10px] text-[var(--text-muted)]">
                    +{portfolio.uncovered.length - 3}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => startProjectForSkill(portfolio.uncovered[0])}
                className="mt-3 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-on-primary)] hover:bg-[var(--accent-secondary)]"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('Start a project for')} {portfolio.uncovered[0]}
              </button>
            </>
          ) : (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {portfolio.shippedCount > 0
                ? t('Every skill your target role asks for is demonstrated by finished work. Keep the links current and the write-ups short.')
                : t('Finish one project to turn a plan into proof. A shipped, linked project is worth more than three unfinished ones.')}
            </p>
          )}
        </div>
      </div>

      {/* The portfolio, measured. Both charts read the records above them. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={t('Where your projects stand')}
          description={t('Every project you have recorded, at the stage it is really at.')}
          badge={formatCount(projects.length)}
          empty={statusDistribution.length === 0}
          emptyMessage={t('Record your first project and this chart will show the stage it reaches.')}
          testId="projects-status-chart"
        >
          <DonutChart
            data={statusDistribution.map((entry, index) => ({
              ...entry,
              color: chartColor(index),
            }))}
            centerValue={formatCount(projects.length)}
            centerLabel={t('projects')}
            ariaLabel={t('Where your projects stand')}
          />
        </ChartCard>

        <ChartCard
          title={t('How much proof each skill has')}
          description={t(
            'The finished projects behind the skills your target role asks for.'
          )}
          empty={proofBySkill.length === 0}
          emptyMessage={t(
            'Choose a target role and add the skills you want to prove; this chart will count the finished work behind each one.'
          )}
          footnote={t('Only finished and published projects count as proof.')}
          testId="projects-proof-chart"
        >
          <BarChart
            data={proofBySkill}
            ariaLabel={t('How much proof each skill has')}
            max={Math.max(1, ...proofBySkill.map((entry) => entry.value))}
          />
        </ChartCard>
      </div>

      {/* ADD / EDIT PROJECT MODAL */}
      {(showAddModal || Boolean(editingProject)) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-lg bg-[var(--surface-main)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                {editingProject ? t('Edit Project') : t('Add Proof-of-Skill Project')}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingProject(null);
                }}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={editingProject ? handleEditSubmit : handleAddSubmit} className="space-y-4">
              {submitError && (
                <div
                  role="alert"
                  className="rounded-lg border border-[var(--color-danger)]/25 bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]"
                >
                  {submitError}
                </div>
              )}

              {/* Title & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    {t('Project Title')} *
                  </label>
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
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    {t('Category')}
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ProjectCategory)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                  >
                    <option value="personal">{t('Personal')}</option>
                    <option value="academic">{t('Academic')}</option>
                    <option value="professional">{t('Professional')}</option>
                    <option value="volunteer">{t('Volunteer')}</option>
                    <option value="team">{t('Team')}</option>
                  </select>
                </div>
              </div>

              {/* Role & Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    {t('Your Role')}
                  </label>
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder={t('e.g. Lead Engineer')}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    {t('Start Date')}
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    {t('Completion Date')}
                  </label>
                  <input
                    type="date"
                    value={completedAt}
                    onChange={(e) => setCompletedAt(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                  />
                </div>
              </div>

              {/* Goal / Summary */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('Goal / Executive Summary')} *
                </label>
                <textarea
                  required
                  rows={2}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder={t('What problem does this solve and what evidence does it provide?')}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              {/* Responsibilities */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('Responsibilities & Achievements (one per line)')}
                </label>
                <textarea
                  rows={2}
                  value={responsibilitiesStr}
                  onChange={(e) => setResponsibilitiesStr(e.target.value)}
                  placeholder={t('Architected real-time WebSocket protocol...\nAchieved 99.9% test coverage...')}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              {/* Difficulty & Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    {t('Difficulty')}
                  </label>
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
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    {t('Status')}
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                  >
                    <option value="idea">{t('Idea')}</option>
                    <option value="planned">{t('Planned')}</option>
                    <option value="in_progress">{t('In Progress')}</option>
                    <option value="completed">{t('Completed')}</option>
                    <option value="published">{t('Published')}</option>
                  </select>
                </div>
              </div>

              {/* Skills */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('Skills / Technologies (comma separated)')}
                </label>
                <input
                  type="text"
                  value={skillsStr}
                  onChange={(e) => setSkillsStr(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                />
              </div>

              {/* URLs (Optional) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    {t('GitHub Repo URL (Optional)')}
                  </label>
                  <input
                    type="url"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/..."
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    {t('Live Demo URL (Optional)')}
                  </label>
                  <input
                    type="url"
                    value={demoUrl}
                    onChange={(e) => setDemoUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                  />
                </div>
              </div>

              {/* Screenshot / Thumbnail Upload */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('Project Screenshot or Thumbnail')}
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="url"
                    value={thumbnailUrl}
                    onChange={(e) => setThumbnailUrl(e.target.value)}
                    placeholder="https://... or upload below"
                    className="flex-1 px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--accent-surface)] hover:text-[var(--color-primary-text)] flex items-center gap-1 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploading ? t('Uploading…') : t('Upload')}</span>
                  </button>
                </div>
                {thumbnailUrl && (
                  <div className="mt-2 relative inline-block">
                    <img
                      src={thumbnailUrl}
                      alt="Thumbnail preview"
                      className="h-16 w-28 object-cover rounded-md border border-[var(--border-subtle)]"
                    />
                    <button
                      type="button"
                      onClick={() => setThumbnailUrl('')}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-xs hover:bg-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Toggles */}
              <div className="space-y-2 pt-1 border-t border-[var(--border-subtle)]">
                <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => setIsFeatured(e.target.checked)}
                    className="rounded border-[var(--border-strong)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)]"
                  />
                  <span className="font-semibold">{t('Feature this project on my portfolio')}</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeInPortfolio}
                    onChange={(e) => setIncludeInPortfolio(e.target.checked)}
                    className="rounded border-[var(--border-strong)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)]"
                  />
                  <span>{t('Include in generated portfolio outputs & CV suggestions')}</span>
                </label>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-[var(--border-subtle)] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingProject(null);
                  }}
                  className="px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
                >
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isUploading}
                  className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] text-[var(--color-on-primary)] text-xs font-semibold hover:bg-[var(--accent-secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting
                    ? t('Saving…')
                    : editingProject
                    ? t('Save Changes')
                    : t('Create Project')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-[var(--surface-main)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-[var(--text-primary)]">
              {t('Delete Project')}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {t('Are you sure you want to delete')} <span className="font-bold text-[var(--text-primary)]">"{projectToDelete.title}"</span>? {t('This action cannot be undone.')}
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => setProjectToDelete(null)}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)]"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={confirmDelete}
                className="px-3 py-1.5 rounded-lg bg-[var(--color-danger)] text-white text-xs font-semibold hover:opacity-90"
              >
                {t('Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Reveal>
  );
};
