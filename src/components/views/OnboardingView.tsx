import React, { useState, useEffect, useMemo } from 'react';
import { ArrowRight, ArrowLeft, Check, Upload, FileText, Sparkles, Layers, Search } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { CareerState, CareerGoal } from '../../types/career';
import { TARGET_ROLES, CAREER_DOMAINS, searchCareerCatalog } from '../../data/rolesData';
import { Reveal } from '../motion/Motion';
import { CVImportModal } from '../cv/CVImportModal';
import { AvatarSelector, DEFAULT_AVATAR_ID } from '../ui/CareerPilotAvatars';

/**
 * The roles are grouped by career domain. The catalogue spans every major
 * career domain, so a flat list of eighty roles is not browsable; the search
 * box above the list narrows it with the shared fuzzy matcher.
 */
interface OnboardingViewProps {
  onComplete: () => void;
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({ onComplete }) => {
  const { profile, updateProfile, setCareerState, setCareerGoal, setPrimaryTargetRole, skills, updateSkillLevel } = useCareer();
  const [step, setStep] = useState<number>(1);

  // Form states
  const [selectedPersona, setSelectedPersona] = useState<CareerState>(profile.careerState || 'working_professional');
  const [currentTitle, setCurrentTitle] = useState(profile.currentTitle || '');
  const [location, setLocation] = useState(profile.location || '');
  const [selectedGoal, setSelectedGoal] = useState<CareerGoal>(profile.careerGoal || 'get_promoted');
  const [customGoal, setCustomGoal] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [roleQuery, setRoleQuery] = useState('');
  const [showCvModal, setShowCvModal] = useState(false);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>(profile.avatarUrl || DEFAULT_AVATAR_ID);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (profile.currentTitle && !currentTitle) setCurrentTitle(profile.currentTitle);
    if (profile.location && !location) setLocation(profile.location);
    if (profile.avatarUrl && profile.avatarUrl !== selectedAvatarId) setSelectedAvatarId(profile.avatarUrl);
  }, [profile.currentTitle, profile.location, profile.avatarUrl]);

  /**
   * Role search uses the shared catalogue matcher, the same one the global
   * search and the role explorer use. With no query the catalogue stays
   * grouped by domain; a query narrows it to the real matches.
   */
  const roleMatches = useMemo(
    () =>
      roleQuery.trim()
        ? searchCareerCatalog(roleQuery, { limit: 60 }).roles.map((match) => match.role)
        : null,
    [roleQuery]
  );

  const groupedRoles = useMemo(() => {
    const roles = roleMatches ?? TARGET_ROLES;
    return CAREER_DOMAINS.map((domain) => ({
      domain,
      roles: roles.filter((role) => role.domainId === domain.slug),
    })).filter((group) => group.roles.length > 0);
  }, [roleMatches]);

  const selectedRoleTitle =
    TARGET_ROLES.find((role) => role.id === selectedRoleId)?.title ?? '';

  const handleNext = async () => {
    if (isSaving) return;
    if (step === 3 && selectedGoal === 'custom' && !customGoal.trim()) {
      setSaveError('Please describe your custom goal before continuing.');
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    try {
      if (step === 1) {
        await setCareerState(selectedPersona);
        setStep(2);
      } else if (step === 2) {
        await updateProfile({ currentTitle, location });
        setStep(3);
      } else if (step === 3) {
        await setCareerGoal(
          selectedGoal,
          selectedGoal === 'custom' ? customGoal.trim() : ''
        );
        setStep(4);
      } else if (step === 4) {
        if (!selectedRoleId) {
          setSaveError('Choose the role you are targeting before continuing.');
          return;
        }
        const persisted = await setPrimaryTargetRole(selectedRoleId);
        if (!persisted) {
          throw new Error('The target role and roadmap were not persisted');
        }
        setStep(5);
      } else if (step === 5) {
        setStep(6);
      } else if (step === 6) {
        await updateProfile({
          avatarUrl: selectedAvatarId || DEFAULT_AVATAR_ID,
          onboardingCompleted: true,
        });
        onComplete();
      }
    } catch (error) {
      console.error('Onboarding step could not be saved:', error);
      setSaveError('We could not save this step. Check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkipAvatar = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await updateProfile({
        avatarUrl: DEFAULT_AVATAR_ID,
        onboardingCompleted: true,
      });
      onComplete();
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      setSaveError('We could not save your profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (!isSaving && step > 1) setStep(step - 1);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)] flex flex-col justify-between py-12 px-6">
      <div className="max-w-2xl w-full mx-auto space-y-8">
        {/* Step Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span className="font-medium text-[var(--color-primary-text)]">STEP {step} OF 6</span>
            <span>Let's build your career path</span>
          </div>
          <div className="h-1.5 w-full bg-[var(--color-progress-track)] rounded-full overflow-hidden">
            <div 
              className="h-full bg-[var(--color-progress-strong)] transition-all duration-300"
              style={{ width: `${(step / 6) * 100}%` }}
            />
          </div>
        </div>

        {/* Step 1: Persona Selection */}
        {step === 1 && (
          <Reveal onMount delay={0.04} className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                Who are you?
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Select the career persona that best matches your current life stage.
              </p>
            </div>

            <div className="space-y-3">
              {[
                { id: 'student', title: 'Student', desc: 'Focusing on fundamentals, first internships, coursework, and portfolio building.' },
                { id: 'fresh_graduate', title: 'Fresh Graduate', desc: 'Recent graduate bridging academic knowledge to industry expectations.' },
                { id: 'working_professional', title: 'Working Professional', desc: 'Currently employed and looking for promotion, higher impact, or specialization.' },
                { id: 'career_switcher', title: 'Career Switcher', desc: 'Transitioning from another domain with valuable transferable skills.' },
                { id: 'exploring', title: 'Exploring', desc: 'Unsure of your final direction and looking to compare viable career paths.' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedPersona(item.id as CareerState)}
                  className={`w-full p-4 rounded-xl border text-left transition-all flex items-start justify-between ${
                    selectedPersona === item.id
                      ? 'bg-[var(--accent-surface)]/60 border-[var(--accent-primary)] text-[var(--text-primary)] shadow-xs'
                      : 'bg-[var(--surface-main)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="space-y-1 pr-4">
                    <div className="font-semibold text-sm">{item.title}</div>
                    <div className="text-xs text-[var(--text-secondary)] leading-relaxed">{item.desc}</div>
                  </div>
                  {selectedPersona === item.id && (
                    <div className="w-5 h-5 rounded-full bg-[var(--accent-primary)] text-[var(--color-on-primary)] flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </Reveal>
        )}

        {/* Step 2: Current Situation */}
        {step === 2 && (
          <Reveal onMount delay={0.04} className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                Where are you now?
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Provide basic details on your current role and location, or speed up onboarding with your CV.
              </p>
            </div>

            {/* 3 CV Options */}
            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary-text)]" />
                    CV Accelerated Setup (Optional)
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    Your CV automatically populates your profile, experience, and baseline skills.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCvModal(true)}
                  className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:border-[var(--accent-primary)] text-left transition-all flex flex-col justify-between group cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--color-primary-text)]">
                    <Upload className="w-3.5 h-3.5 text-[var(--color-primary-text)]" />
                    Upload My CV
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] mt-1">PDF or Word (.docx)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCvModal(true)}
                  className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:border-[var(--accent-primary)] text-left transition-all flex flex-col justify-between group cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--color-primary-text)]">
                    <FileText className="w-3.5 h-3.5 text-[var(--color-primary-text)]" />
                    Paste My CV
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] mt-1">Paste raw text</span>
                </button>

                <div className="p-3 rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-main)] text-left flex flex-col justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
                    <Check className="w-3.5 h-3.5 text-[var(--color-primary-text)]" />
                    Start From Scratch
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] mt-1">Manual entry below</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Current Title or Degree
                </label>
                <input
                  type="text"
                  value={currentTitle}
                  onChange={(e) => setCurrentTitle(e.target.value)}
                  placeholder="e.g. Junior Frontend Developer or CS Student"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--surface-main)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Location / Preferred Work Mode
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. San Francisco, CA or Remote Worldwide"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--surface-main)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
            </div>
          </Reveal>
        )}

        {/* Step 3: Career Goal */}
        {step === 3 && (
          <Reveal onMount delay={0.04} className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                Where do you want to go?
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                What is your primary milestone over the next 6 to 12 months?
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { id: 'get_first_job', label: 'Land First Full-Time Job' },
                { id: 'get_internship', label: 'Secure a Summer Internship' },
                { id: 'get_promoted', label: 'Get Promoted to Mid/Senior' },
                { id: 'switch_career', label: 'Transition into Tech / New Field' },
                { id: 'become_specialist', label: 'Become a Deep Domain Specialist' },
                { id: 'become_manager', label: 'Move into Engineering / Product Management' },
                { id: 'build_portfolio', label: 'Build a Verifiable Portfolio' },
                { id: 'freelance', label: 'Build a Freelance Practice' },
                { id: 'explore_careers', label: 'Explore & Compare Roles' },
                { id: 'custom', label: 'Set a Custom Goal' },
              ].map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelectedGoal(g.id as CareerGoal)}
                  className={`p-3.5 rounded-xl border text-left text-xs font-medium transition-all flex items-center justify-between ${
                    selectedGoal === g.id
                      ? 'bg-[var(--accent-surface)] border-[var(--accent-primary)] text-[var(--color-primary-text)] font-semibold'
                      : 'bg-[var(--surface-main)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <span>{g.label}</span>
                  {selectedGoal === g.id && <Check className="w-3.5 h-3.5 text-[var(--color-primary-text)]" />}
                </button>
              ))}
            </div>

            {selectedGoal === 'custom' && (
              <div className="space-y-1.5">
                <label
                  htmlFor="custom-goal"
                  className="block text-xs font-semibold text-[var(--text-secondary)]"
                >
                  Describe your goal
                </label>
                <input
                  id="custom-goal"
                  type="text"
                  value={customGoal}
                  onChange={(event) => setCustomGoal(event.target.value)}
                  maxLength={160}
                  placeholder="e.g. Move into a staff-level platform engineering role"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
            )}
          </Reveal>
        )}

        {/* Step 4: Target Role Selection */}
        {step === 4 && (
          <Reveal onMount delay={0.04} className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                What role are you targeting?
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                This choice dynamically defines your skill requirements and roadmap tasks.
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="onboarding-role-search"
                className="block text-xs font-semibold text-[var(--text-secondary)]"
              >
                Search the role catalogue
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="onboarding-role-search"
                  type="search"
                  value={roleQuery}
                  onChange={(event) => setRoleQuery(event.target.value)}
                  placeholder="Try “data analyst”, “HR”, “nurse” or “supply chain”"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
              <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--text-muted)]">
                <span>
                  {roleMatches
                    ? `${roleMatches.length} matching role${roleMatches.length === 1 ? '' : 's'}`
                    : `${TARGET_ROLES.length} roles across ${CAREER_DOMAINS.length} domains`}
                </span>
                {selectedRoleTitle && (
                  <span className="text-[var(--color-primary-text)] font-semibold">
                    Selected: {selectedRoleTitle}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {groupedRoles.length === 0 && (
                <div className="p-4 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 text-xs text-[var(--text-secondary)]">
                  No role matches “{roleQuery.trim()}”. Try a broader term such as the domain
                  (“data”, “design”, “healthcare”) or clear the search to browse every domain.
                </div>
              )}
              {groupedRoles.map((group) => (
                <div key={group.domain.slug} className="space-y-2">
                  <div className="sticky top-0 z-10 flex items-center gap-2 bg-[var(--surface-main)]/95 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] backdrop-blur">
                    <Layers className="h-3 w-3" />
                    <span>{group.domain.label}</span>
                    <span className="font-mono text-[var(--text-muted)]/70">({group.roles.length})</span>
                  </div>
                  {group.roles.map((role) => (
                    <button
                      key={role.id}
                      onClick={() => setSelectedRoleId(role.id)}
                      className={`w-full p-4 rounded-xl border text-left transition-all flex items-start justify-between ${
                        selectedRoleId === role.id
                          ? 'bg-[var(--accent-surface)]/60 border-[var(--accent-primary)] text-[var(--text-primary)]'
                          : 'bg-[var(--surface-main)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <div className="space-y-1 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-[var(--text-primary)]">{role.title}</span>
                          <span className="text-xs text-[var(--text-muted)]">· {role.category}</span>
                        </div>
                        <div className="text-xs text-[var(--text-secondary)] line-clamp-1">{role.overview}</div>
                        <div className="text-[11px] text-[var(--text-muted)] pt-1">
                          Expectation: {role.experienceExpectation}
                        </div>
                      </div>
                      {selectedRoleId === role.id && (
                        <div className="w-5 h-5 rounded-full bg-[var(--accent-primary)] text-[var(--color-on-primary)] flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="w-3 h-3" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </Reveal>
        )}

        {/* Step 5: Initial Skills Assessment */}
        {step === 5 && (
          <Reveal onMount delay={0.04} className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                Rate your starting skills
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Honest self-assessment sets your baseline gap analysis. (1 = Novice, 5 = Expert).
              </p>
            </div>

            <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
              {skills.slice(0, 6).map((sk) => (
                <div key={sk.id} className="p-3.5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--text-primary)]">{sk.name}</span>
                    <span className="text-[var(--text-secondary)] font-mono">
                      Current: {sk.currentLevel}/5 (Target: {sk.targetLevel}/5)
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={sk.currentLevel}
                    onChange={(e) => updateSkillLevel(sk.id, parseInt(e.target.value, 10))}
                    className="w-full accent-[var(--accent-primary)] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
                    <span>1: Novice</span>
                    <span>2: Beginner</span>
                    <span>3: Intermediate</span>
                    <span>4: Advanced</span>
                    <span>5: Expert</span>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        )}

        {/* Step 6: CareerPilot Avatar Selection */}
        {step === 6 && (
          <Reveal onMount delay={0.04} className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                Choose Your CareerPilot Avatar
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Select a calm, professional avatar that represents you across the platform. You can change this anytime.
              </p>
            </div>

            <AvatarSelector
              selectedAvatarId={selectedAvatarId}
              onSelect={(id) => setSelectedAvatarId(id)}
            />
          </Reveal>
        )}

        {/* Step Navigation Controls */}
        <div className="pt-6 border-t border-[var(--border-subtle)] space-y-3">
          {saveError && (
            <div
              role="alert"
              className="rounded-lg border border-[var(--color-danger)]/25 bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]"
            >
              {saveError}
            </div>
          )}
          {step === 4 && !selectedRoleId && !saveError && (
            <p className="text-[11px] text-[var(--text-secondary)]">
              Select the role you are targeting to continue. Your skill gaps and roadmap are
              generated from this choice.
            </p>
          )}
          <div className="flex items-center justify-between">
            {step > 1 ? (
              <button
                onClick={handleBack}
                disabled={isSaving}
                className="px-4 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-3">
              {step === 6 && (
                <button
                  type="button"
                  onClick={handleSkipAvatar}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] transition-colors"
                >
                  Skip for now
                </button>
              )}

              <button
                onClick={handleNext}
                disabled={isSaving}
                className="px-6 py-2.5 rounded-lg bg-[var(--accent-primary)] text-[var(--color-on-primary)] text-xs font-semibold hover:bg-[var(--accent-secondary)] transition-all flex items-center gap-2 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>
                  {isSaving
                    ? 'Saving…'
                    : step === 6
                      ? 'Launch Career Command Center'
                      : 'Continue'}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <CVImportModal
        isOpen={showCvModal}
        onClose={() => setShowCvModal(false)}
        onImportComplete={() => {
          setShowCvModal(false);
        }}
        onStartFromScratch={() => setShowCvModal(false)}
      />
    </div>
  );
};
