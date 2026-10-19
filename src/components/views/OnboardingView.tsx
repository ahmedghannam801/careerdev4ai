import React, { useState } from 'react';
import { ArrowRight, ArrowLeft, Check, Sparkles, User, Briefcase, Target, Award, Compass } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { CareerState, CareerGoal } from '../../types/career';
import { TARGET_ROLES } from '../../data/rolesData';

interface OnboardingViewProps {
  onComplete: () => void;
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({ onComplete }) => {
  const { profile, updateProfile, setCareerState, setCareerGoal, setPrimaryTargetRole, targetRole, skills, updateSkillLevel, t } = useCareer();
  const [step, setStep] = useState<number>(1);

  // Form states
  const [selectedPersona, setSelectedPersona] = useState<CareerState>(profile.careerState || 'working_professional');
  const [currentTitle, setCurrentTitle] = useState(profile.currentTitle || 'Junior Developer');
  const [location, setLocation] = useState(profile.location || 'San Francisco, CA');
  const [selectedGoal, setSelectedGoal] = useState<CareerGoal>(profile.careerGoal || 'get_promoted');
  const [customGoal, setCustomGoal] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState(targetRole.id || 'frontend-engineer');

  const handleNext = () => {
    if (step === 1) {
      setCareerState(selectedPersona);
      setStep(2);
    } else if (step === 2) {
      updateProfile({ currentTitle, location });
      setStep(3);
    } else if (step === 3) {
      setCareerGoal(selectedGoal, customGoal);
      setStep(4);
    } else if (step === 4) {
      setPrimaryTargetRole(selectedRoleId);
      setStep(5);
    } else if (step === 5) {
      updateProfile({ onboardingCompleted: true });
      onComplete();
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)] flex flex-col justify-between py-12 px-6">
      <div className="max-w-2xl w-full mx-auto space-y-8">
        {/* Step Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span className="font-medium text-[var(--accent-primary)]">STEP {step} OF 5</span>
            <span>Let's build your career path</span>
          </div>
          <div className="h-1.5 w-full bg-[var(--surface-secondary)] rounded-full overflow-hidden">
            <div 
              className="h-full bg-[var(--accent-primary)] transition-all duration-300" 
              style={{ width: `${(step / 5) * 100}%` }}
            />
          </div>
        </div>

        {/* Step 1: Persona Selection */}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in duration-200">
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
                    <div className="w-5 h-5 rounded-full bg-[var(--accent-primary)] text-white flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Current Situation */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                Where are you now?
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Provide basic details on your current role, study program, and location.
              </p>
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
          </div>
        )}

        {/* Step 3: Career Goal */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in duration-200">
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
                { id: 'explore_careers', label: 'Explore & Compare Roles' },
              ].map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelectedGoal(g.id as CareerGoal)}
                  className={`p-3.5 rounded-xl border text-left text-xs font-medium transition-all flex items-center justify-between ${
                    selectedGoal === g.id
                      ? 'bg-[var(--accent-surface)] border-[var(--accent-primary)] text-[var(--accent-primary)] font-semibold'
                      : 'bg-[var(--surface-main)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <span>{g.label}</span>
                  {selectedGoal === g.id && <Check className="w-3.5 h-3.5 text-[var(--accent-primary)]" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Target Role Selection */}
        {step === 4 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                What role are you targeting?
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                This choice dynamically defines your skill requirements, roadmap tasks, and job matches.
              </p>
            </div>

            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {TARGET_ROLES.map((role) => (
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
                    <div className="w-5 h-5 rounded-full bg-[var(--accent-primary)] text-white flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Initial Skills Assessment */}
        {step === 5 && (
          <div className="space-y-6 animate-in fade-in duration-200">
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
          </div>
        )}

        {/* Step Navigation Controls */}
        <div className="pt-6 border-t border-[var(--border-subtle)] flex items-center justify-between">
          {step > 1 ? (
            <button
              onClick={handleBack}
              className="px-4 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          ) : <div />}

          <button
            onClick={handleNext}
            className="px-6 py-2.5 rounded-lg bg-[var(--accent-primary)] text-white text-xs font-semibold hover:bg-[var(--accent-secondary)] transition-all flex items-center gap-2 shadow-xs"
          >
            <span>{step === 5 ? 'Launch Career Command Center' : 'Continue'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
