import React from 'react';
import { ArrowRight, CheckCircle2, Sparkles, Compass, Target, Layers, FileText, Briefcase, Award, ArrowUpRight } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { TARGET_ROLES } from '../../data/rolesData';

interface LandingViewProps {
  onStartOnboarding: () => void;
  onExploreRoles: () => void;
  onOpenDashboard: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({ onStartOnboarding, onExploreRoles, onOpenDashboard }) => {
  const { profile, t } = useCareer();

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)]">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-[var(--surface-main)]/90 backdrop-blur-md border-b border-[var(--border-subtle)] px-6 py-4 flex items-center justify-between gap-8 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)] text-white flex items-center justify-center font-bold text-base shadow-sm">
            CP
          </div>
          <span className="font-semibold text-base tracking-tight text-[var(--text-primary)] whitespace-nowrap shrink-0">
            CareerPilot AI
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[var(--text-secondary)]">
          <a href="#journey" className="hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0">How It Works</a>
          <a href="#personas" className="hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0">Personas</a>
          <a href="#roles" className="hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0">Target Roles</a>
          <a href="#ecosystem" className="hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0">Career Graph</a>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          {profile.onboardingCompleted ? (
            <button
              onClick={onOpenDashboard}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-secondary)] transition-all whitespace-nowrap shadow-xs"
            >
              Open Career Dashboard
            </button>
          ) : (
            <button
              onClick={onStartOnboarding}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-secondary)] transition-all whitespace-nowrap shadow-xs"
            >
              Start Your Journey
            </button>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-6 pt-16 pb-20 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[var(--accent-surface)] text-[var(--accent-primary)] text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Personal Career Operating System</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[var(--text-primary)] leading-[1.12] text-balance">
              Build a career, not just a CV.
            </h1>

            <p className="text-lg text-[var(--text-secondary)] max-w-2xl leading-relaxed">
              CareerPilot AI connects your goals, skills, roadmap, learning, projects, evidence, CV, applications, and interviews into one intelligent, continuous system.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                onClick={onStartOnboarding}
                className="px-6 py-3 rounded-lg bg-[var(--accent-primary)] text-white font-medium text-sm hover:bg-[var(--accent-secondary)] transition-all flex items-center gap-2 shadow-sm"
              >
                <span>Start Your Career Journey</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={onExploreRoles}
                className="px-6 py-3 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-medium text-sm hover:bg-[var(--surface-main)] transition-all"
              >
                Explore Target Roles
              </button>
            </div>

            <div className="pt-4 flex items-center gap-6 text-xs text-[var(--text-secondary)]">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" />
                <span>Zero fake metrics</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" />
                <span>Bi-directional career graph</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" />
                <span>Bilingual English & Arabic</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="relative rounded-2xl overflow-hidden border border-[var(--border-subtle)] shadow-xl bg-[var(--surface-main)]">
              <img
                src="/src/assets/images/career_command_hero_1792417630769.jpg"
                alt="Career Command Center Preview"
                className="w-full h-80 object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>LIVE CAREER GRAPH</span>
                  <span className="font-mono text-[var(--color-success)]">ACTIVE</span>
                </div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  Next Best Action Engine
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  "Complete Playwright E2E testing drills to close the largest gap for your target Frontend Engineer role."
                </p>
                <div className="pt-2 flex items-center justify-between text-xs font-medium text-[var(--accent-primary)]">
                  <span>84% Target Readiness</span>
                  <span>14 Tasks in Roadmap →</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Connected Career Graph Journey */}
      <section id="journey" className="px-6 py-20 bg-[var(--surface-secondary)]/50 border-y border-[var(--border-subtle)]">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
              One Unified Career Graph
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Changing your target role automatically recalibrates every dependency across your career path.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-center text-xs">
            {[
              { step: '01', title: 'Target Role', desc: 'Market expectations & tools' },
              { step: '02', title: 'Skills & Gaps', desc: 'Dynamic level scoring' },
              { step: '03', title: 'Roadmap', desc: 'Phased actionable tasks' },
              { step: '04', title: 'Projects', desc: 'Proof-of-skill deliverables' },
              { step: '05', title: 'Evidence Hub', desc: 'GitHub & demo links' },
              { step: '06', title: 'CV Studio', desc: 'Target-role ATS polish' },
              { step: '07', title: 'Interviews', desc: 'STAR simulator drills' },
            ].map((item, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] flex flex-col justify-between"
              >
                <div className="font-mono text-xs font-semibold text-[var(--accent-primary)] mb-2">{item.step}</div>
                <div className="font-semibold text-[var(--text-primary)] mb-1">{item.title}</div>
                <div className="text-[11px] text-[var(--text-secondary)] leading-snug">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Personas Section */}
      <section id="personas" className="px-6 py-20 max-w-7xl mx-auto space-y-12">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
            Tailored for Every Career Stage
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            CareerPilot dynamically adapts its priorities, recommendations, and roadmaps based on your persona.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[
            {
              id: 'student',
              title: 'Student',
              focus: 'Fundamentals & Internships',
              desc: 'Foundational coursework, first GitHub repositories, internships, and portfolio development.'
            },
            {
              id: 'fresh_grad',
              title: 'Fresh Graduate',
              focus: 'Employability & Proof',
              desc: 'Bridging academic-to-industry gaps, CV optimization, targeted entry applications, and interview prep.'
            },
            {
              id: 'working_pro',
              title: 'Working Professional',
              focus: 'Progression & Promotion',
              desc: 'Advanced specialization, quantifiable achievements, leadership evidence, and market positioning.'
            },
            {
              id: 'career_switcher',
              title: 'Career Switcher',
              focus: 'Transferable Skills',
              desc: 'Identifying transferable strengths, targeted transition roadmaps, and proof-of-skill portfolio pieces.'
            },
            {
              id: 'exploring',
              title: 'Exploring',
              focus: 'Discovery & Fit',
              desc: 'Comparing emerging disciplines, understanding market compensations, and discovering your optimal path.'
            }
          ].map((persona) => (
            <div
              key={persona.id}
              className="p-5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)]/40 transition-all flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[var(--accent-primary)]">{persona.focus}</div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">{persona.title}</h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{persona.desc}</p>
              </div>
              <button
                onClick={onStartOnboarding}
                className="mt-4 pt-3 border-t border-[var(--border-subtle)] text-xs font-medium text-[var(--accent-primary)] flex items-center justify-between group"
              >
                <span>Select Persona</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Target Roles Preview */}
      <section id="roles" className="px-6 py-20 bg-[var(--surface-secondary)]/50 border-t border-[var(--border-subtle)]">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
                Structured Target Roles
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Explore comprehensive skill profiles, salary benchmarks, and interview topics.
              </p>
            </div>
            <button
              onClick={onExploreRoles}
              className="text-xs font-semibold text-[var(--accent-primary)] flex items-center gap-1 hover:underline"
            >
              <span>View All 8 Roles Catalog</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {TARGET_ROLES.slice(0, 3).map((role) => (
              <div
                key={role.id}
                className="p-6 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-[var(--text-primary)]">{role.title}</h3>
                    <div className="text-xs text-[var(--text-muted)]">{role.category} · {role.level}</div>
                  </div>
                  <span className="text-xs font-mono font-medium text-[var(--color-success)] bg-[var(--color-success)]/10 px-2 py-0.5 rounded">
                    {role.salaryRange.split(' ')[0]}
                  </span>
                </div>

                <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                  {role.overview}
                </p>

                <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Required Skills</div>
                  <div className="flex flex-wrap gap-1.5">
                    {role.requiredSkills.slice(0, 4).map((skill, idx) => (
                      <span key={idx} className="text-xs px-2 py-0.5 rounded bg-[var(--surface-secondary)] text-[var(--text-secondary)]">
                        {skill.name} (Lvl {skill.minLevel})
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  onClick={onExploreRoles}
                  className="w-full py-2 rounded-lg bg-[var(--surface-secondary)] hover:bg-[var(--accent-surface)] text-xs font-medium text-[var(--accent-primary)] transition-colors"
                >
                  View Role Breakdown →
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <section className="px-6 py-20 max-w-4xl mx-auto text-center space-y-6">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--text-primary)]">
          Take command of your career trajectory today.
        </h2>
        <p className="text-sm text-[var(--text-secondary)] max-w-xl mx-auto">
          No generic advice. No disconnected templates. Just one unified operating system designed to get you hired and promoted.
        </p>
        <div className="pt-4">
          <button
            onClick={onStartOnboarding}
            className="px-8 py-3.5 rounded-lg bg-[var(--accent-primary)] text-white font-semibold text-sm hover:bg-[var(--accent-secondary)] transition-all shadow-md inline-flex items-center gap-2"
          >
            <span>Start Your Career Journey</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-[var(--border-subtle)] px-6 py-8 text-xs text-[var(--text-muted)] max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>© 2026 CareerPilot AI. Personal Career Operating System.</div>
        <div className="flex items-center gap-6">
          <span>Privacy</span>
          <span>Terms</span>
          <span>Status</span>
          <span>English / العربية</span>
        </div>
      </footer>
    </div>
  );
};
