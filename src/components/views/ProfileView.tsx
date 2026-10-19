import React, { useState } from 'react';
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Globe, 
  Briefcase, 
  GraduationCap, 
  Award, 
  Languages, 
  Link as LinkIcon, 
  Edit3, 
  Plus, 
  Trash2, 
  Sparkles, 
  CheckCircle2, 
  ExternalLink, 
  Eye, 
  Share2, 
  Lock, 
  Unlock, 
  Copy, 
  Check, 
  FileText,
  AlertCircle,
  X,
  Camera
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { 
  UserExperienceEntry, 
  UserEducationEntry, 
  UserCertificationEntry, 
  UserLanguageEntry 
} from '../../types/career';

export const ProfileView: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  const { 
    profile, 
    updateProfile, 
    profileCompleteness, 
    skills, 
    projects, 
    suggestAiSummary, 
    validateUsername, 
    t 
  } = useCareer();

  // Modals state
  const [editBasicOpen, setEditBasicOpen] = useState(false);
  const [editSummaryOpen, setEditSummaryOpen] = useState(false);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryDraft, setAiSummaryDraft] = useState('');
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [usernameCheckMessage, setUsernameCheckMessage] = useState('');
  const [isUsernameValid, setIsUsernameValid] = useState<boolean | null>(null);

  // Form states for Experience modal
  const [expModalOpen, setExpModalOpen] = useState(false);
  const [editingExp, setEditingExp] = useState<UserExperienceEntry | null>(null);
  const [expForm, setExpForm] = useState({
    role: '',
    company: '',
    employmentType: 'Full-time' as UserExperienceEntry['employmentType'],
    location: '',
    startDate: '',
    endDate: '',
    isCurrent: false,
    description: '',
    achievements: '',
    skillsUsed: ''
  });

  // Form states for Education modal
  const [eduModalOpen, setEduModalOpen] = useState(false);
  const [editingEdu, setEditingEdu] = useState<UserEducationEntry | null>(null);
  const [eduForm, setEduForm] = useState({
    institution: '',
    degree: '',
    field: '',
    startDate: '',
    endDate: '',
    current: false,
    gpa: '',
    coursework: ''
  });

  // Form states for Certifications modal
  const [certModalOpen, setCertModalOpen] = useState(false);
  const [editingCert, setEditingCert] = useState<UserCertificationEntry | null>(null);
  const [certForm, setCertForm] = useState({
    name: '',
    provider: '',
    issueDate: '',
    expiryDate: '',
    credentialId: '',
    credentialUrl: ''
  });

  // Form states for Language modal
  const [langModalOpen, setLangModalOpen] = useState(false);
  const [langForm, setLangForm] = useState({
    language: '',
    proficiency: 'Professional' as const
  });

  // Basic info form
  const [basicForm, setBasicForm] = useState({
    name: profile.name,
    preferredName: profile.preferredName || '',
    email: profile.email,
    phone: profile.phone || '',
    location: profile.location,
    city: profile.city || '',
    country: profile.country || '',
    timezone: profile.timezone || 'UTC',
    headline: profile.headline || '',
    currentPosition: profile.currentPosition || '',
    currentCompany: profile.currentCompany || '',
    yearsOfExperience: profile.yearsOfExperience || '',
    industry: profile.industry || '',
    username: profile.username || '',
    isPublic: profile.isPublic ?? true,
    linkedin: profile.links?.linkedin || '',
    github: profile.links?.github || '',
    portfolio: profile.links?.portfolio || '',
    personalWebsite: profile.links?.personalWebsite || ''
  });

  const handleCopyPublicLink = () => {
    const url = `${window.location.origin}/#/profile/${profile.username || 'sarah-jenkins'}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleUsernameChange = async (val: string) => {
    const clean = val.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    setBasicForm(prev => ({ ...prev, username: clean }));
    if (clean.length < 3) {
      setUsernameCheckMessage('Username must be at least 3 characters');
      setIsUsernameValid(false);
      return;
    }
    const res = await validateUsername(clean);
    setIsUsernameValid(res.available);
    setUsernameCheckMessage(res.message);
  };

  const handleSaveBasic = () => {
    updateProfile({
      name: basicForm.name,
      preferredName: basicForm.preferredName,
      email: basicForm.email,
      phone: basicForm.phone,
      location: basicForm.location,
      city: basicForm.city,
      country: basicForm.country,
      timezone: basicForm.timezone,
      headline: basicForm.headline,
      currentPosition: basicForm.currentPosition,
      currentCompany: basicForm.currentCompany,
      yearsOfExperience: basicForm.yearsOfExperience,
      industry: basicForm.industry,
      username: basicForm.username,
      isPublic: basicForm.isPublic,
      links: {
        linkedin: basicForm.linkedin,
        github: basicForm.github,
        portfolio: basicForm.portfolio,
        personalWebsite: basicForm.personalWebsite
      }
    });
    setEditBasicOpen(false);
  };

  const handleGenerateSummary = async () => {
    setAiSummaryLoading(true);
    try {
      const suggested = await suggestAiSummary();
      setAiSummaryDraft(suggested);
    } catch (e) {
      console.error(e);
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const handleConfirmSummary = () => {
    if (aiSummaryDraft.trim()) {
      updateProfile({ professionalSummary: aiSummaryDraft.trim() });
    }
    setEditSummaryOpen(false);
  };

  // Experience handlers
  const handleOpenAddExp = () => {
    setEditingExp(null);
    setExpForm({
      role: '',
      company: '',
      employmentType: 'Full-time',
      location: '',
      startDate: '',
      endDate: '',
      isCurrent: false,
      description: '',
      achievements: '',
      skillsUsed: ''
    });
    setExpModalOpen(true);
  };

  const handleOpenEditExp = (exp: UserExperienceEntry) => {
    setEditingExp(exp);
    setExpForm({
      role: exp.role,
      company: exp.company,
      employmentType: exp.employmentType,
      location: exp.location,
      startDate: exp.startDate,
      endDate: exp.endDate,
      isCurrent: exp.isCurrent,
      description: exp.description,
      achievements: exp.achievements.join('\n'),
      skillsUsed: exp.skillsUsed.join(', ')
    });
    setExpModalOpen(true);
  };

  const handleSaveExp = () => {
    const achList = expForm.achievements.split('\n').map(s => s.trim()).filter(Boolean);
    const skillList = expForm.skillsUsed.split(',').map(s => s.trim()).filter(Boolean);

    if (editingExp) {
      const updated = profile.experiences.map(e => e.id === editingExp.id ? {
        ...e,
        role: expForm.role,
        company: expForm.company,
        employmentType: expForm.employmentType,
        location: expForm.location,
        startDate: expForm.startDate,
        endDate: expForm.isCurrent ? 'Present' : expForm.endDate,
        isCurrent: expForm.isCurrent,
        description: expForm.description,
        achievements: achList,
        skillsUsed: skillList
      } : e);
      updateProfile({ experiences: updated });
    } else {
      const newExp: UserExperienceEntry = {
        id: `exp-${Date.now()}`,
        role: expForm.role,
        company: expForm.company,
        employmentType: expForm.employmentType,
        location: expForm.location,
        startDate: expForm.startDate,
        endDate: expForm.isCurrent ? 'Present' : expForm.endDate,
        isCurrent: expForm.isCurrent,
        description: expForm.description,
        achievements: achList,
        skillsUsed: skillList
      };
      updateProfile({ experiences: [...profile.experiences, newExp] });
    }
    setExpModalOpen(false);
  };

  const handleDeleteExp = (id: string) => {
    updateProfile({ experiences: profile.experiences.filter(e => e.id !== id) });
  };

  // Education handlers
  const handleOpenAddEdu = () => {
    setEditingEdu(null);
    setEduForm({
      institution: '',
      degree: '',
      field: '',
      startDate: '',
      endDate: '',
      current: false,
      gpa: '',
      coursework: ''
    });
    setEduModalOpen(true);
  };

  const handleOpenEditEdu = (edu: UserEducationEntry) => {
    setEditingEdu(edu);
    setEduForm({
      institution: edu.institution,
      degree: edu.degree,
      field: edu.field,
      startDate: edu.startDate,
      endDate: edu.endDate,
      current: edu.current,
      gpa: edu.gpa || '',
      coursework: edu.coursework ? edu.coursework.join(', ') : ''
    });
    setEduModalOpen(true);
  };

  const handleSaveEdu = () => {
    const courseList = eduForm.coursework.split(',').map(s => s.trim()).filter(Boolean);
    if (editingEdu) {
      const updated = profile.education.map(e => e.id === editingEdu.id ? {
        ...e,
        institution: eduForm.institution,
        degree: eduForm.degree,
        field: eduForm.field,
        startDate: eduForm.startDate,
        endDate: eduForm.current ? 'Present' : eduForm.endDate,
        current: eduForm.current,
        gpa: eduForm.gpa,
        coursework: courseList
      } : e);
      updateProfile({ education: updated });
    } else {
      const newEdu: UserEducationEntry = {
        id: `edu-${Date.now()}`,
        institution: eduForm.institution,
        degree: eduForm.degree,
        field: eduForm.field,
        startDate: eduForm.startDate,
        endDate: eduForm.current ? 'Present' : eduForm.endDate,
        current: eduForm.current,
        gpa: eduForm.gpa,
        coursework: courseList
      };
      updateProfile({ education: [...profile.education, newEdu] });
    }
    setEduModalOpen(false);
  };

  const handleDeleteEdu = (id: string) => {
    updateProfile({ education: profile.education.filter(e => e.id !== id) });
  };

  // Certification handlers
  const handleSaveCert = () => {
    if (editingCert) {
      const updated = profile.certifications.map(c => c.id === editingCert.id ? {
        ...c,
        name: certForm.name,
        provider: certForm.provider,
        issueDate: certForm.issueDate,
        expiryDate: certForm.expiryDate,
        credentialId: certForm.credentialId,
        credentialUrl: certForm.credentialUrl
      } : c);
      updateProfile({ certifications: updated });
    } else {
      const newCert: UserCertificationEntry = {
        id: `cert-${Date.now()}`,
        name: certForm.name,
        provider: certForm.provider,
        issueDate: certForm.issueDate,
        expiryDate: certForm.expiryDate,
        credentialId: certForm.credentialId,
        credentialUrl: certForm.credentialUrl
      };
      updateProfile({ certifications: [...profile.certifications, newCert] });
    }
    setCertModalOpen(false);
  };

  const handleDeleteCert = (id: string) => {
    updateProfile({ certifications: profile.certifications.filter(c => c.id !== id) });
  };

  // Language handlers
  const handleSaveLang = () => {
    if (!langForm.language.trim()) return;
    const newLang: UserLanguageEntry = {
      id: `lang-${Date.now()}`,
      language: langForm.language.trim(),
      proficiency: langForm.proficiency
    };
    updateProfile({ languages: [...profile.languages, newLang] });
    setLangModalOpen(false);
    setLangForm({ language: '', proficiency: 'Professional' });
  };

  const handleDeleteLang = (id: string) => {
    updateProfile({ languages: profile.languages.filter(l => l.id !== id) });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Profile Header Card */}
      <div className="p-6 sm:p-8 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs relative overflow-hidden">
        {/* Subtle accent backdrop */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--accent-primary)]/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="relative group">
              <img
                src={profile.avatarUrl}
                alt={profile.name}
                className="w-24 h-24 rounded-2xl object-cover border-2 border-[var(--border-subtle)] shadow-xs group-hover:border-[var(--accent-primary)] transition-colors"
              />
              <button
                onClick={() => setEditBasicOpen(true)}
                className="absolute -bottom-2 -right-2 p-1.5 rounded-lg bg-[var(--surface-main)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] shadow-xs"
                title="Change Photo / Edit Profile"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">
                  {profile.name}
                </h1>
                {profile.preferredName && profile.preferredName !== profile.name && (
                  <span className="text-sm text-[var(--text-muted)] font-medium">
                    ({profile.preferredName})
                  </span>
                )}
                {profile.username && (
                  <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-[var(--surface-secondary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                    @{profile.username}
                  </span>
                )}
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  profile.isPublic ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600'
                }`}>
                  {profile.isPublic ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  {profile.isPublic ? 'Public Profile' : 'Private'}
                </span>
              </div>

              <p className="text-sm font-medium text-[var(--accent-primary)]">
                {profile.headline || profile.currentTitle}
              </p>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  {profile.location || 'San Francisco, CA'}
                </span>
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  {profile.email}
                </span>
                {profile.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    {profile.phone}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto">
            <button
              onClick={() => setPreviewModalOpen(true)}
              className="flex-1 md:flex-none px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--text-primary)] flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
            >
              <Eye className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <span>Preview</span>
            </button>

            {profile.isPublic && (
              <button
                onClick={handleCopyPublicLink}
                className="flex-1 md:flex-none px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--text-primary)] flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                title="Copy shareable link"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                <span>{copiedLink ? 'Copied Link' : 'Share'}</span>
              </button>
            )}

            <button
              onClick={() => {
                setBasicForm({
                  name: profile.name,
                  preferredName: profile.preferredName || '',
                  email: profile.email,
                  phone: profile.phone || '',
                  location: profile.location,
                  city: profile.city || '',
                  country: profile.country || '',
                  timezone: profile.timezone || 'UTC',
                  headline: profile.headline || '',
                  currentPosition: profile.currentPosition || '',
                  currentCompany: profile.currentCompany || '',
                  yearsOfExperience: profile.yearsOfExperience || '',
                  industry: profile.industry || '',
                  username: profile.username || '',
                  isPublic: profile.isPublic ?? true,
                  linkedin: profile.links?.linkedin || '',
                  github: profile.links?.github || '',
                  portfolio: profile.links?.portfolio || '',
                  personalWebsite: profile.links?.personalWebsite || ''
                });
                setEditBasicOpen(true);
              }}
              className="flex-1 md:flex-none px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Profile</span>
            </button>
          </div>
        </div>

        {/* Profile Completeness Bar & Missing Checklist */}
        <div className="mt-8 pt-6 border-t border-[var(--border-subtle)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Profile Completeness
              </span>
              <span className="text-sm font-bold text-[var(--text-primary)]">
                {profileCompleteness.overallPercent}%
              </span>
            </div>
            <span className="text-xs text-[var(--text-secondary)]">
              {profileCompleteness.overallPercent === 100 
                ? 'Your career identity is fully calibrated and verified!' 
                : `${profileCompleteness.missingItems.length} recommendations to reach 100%`}
            </span>
          </div>

          <div className="w-full h-2 rounded-full bg-[var(--surface-secondary)] overflow-hidden">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-[var(--accent-primary)] to-emerald-500 transition-all duration-500"
              style={{ width: `${profileCompleteness.overallPercent}%` }}
            />
          </div>

          {/* Missing items pill checklist with 1-click CTA */}
          {profileCompleteness.missingItems.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--text-muted)] font-medium mr-1">
                Improve your profile:
              </span>
              {profileCompleteness.missingItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.targetView === 'profile') {
                      if (item.id === 'summary') setEditSummaryOpen(true);
                      else setEditBasicOpen(true);
                    } else {
                      onNavigate(item.targetView);
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--surface-secondary)] hover:bg-[var(--accent-surface)] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] border border-[var(--border-subtle)] transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3 h-3 text-[var(--accent-primary)]" />
                  <span>{item.label}</span>
                  <span className="text-[10px] text-emerald-600 font-mono">+{item.impactWeight}%</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Career Identity Command Center Card */}
      <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent-surface)] text-[var(--accent-primary)] flex items-center justify-center font-bold text-sm">
              CI
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Career Identity Matrix
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                The strategic synthesis of your identity, direction, proof, and market positioning.
              </p>
            </div>
          </div>
          <button 
            onClick={() => onNavigate('my-career')}
            className="text-xs font-semibold text-[var(--accent-primary)] hover:underline flex items-center gap-1"
          >
            <span>Open My Career</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Who You Are
            </span>
            <p className="font-semibold text-[var(--text-primary)]">
              {profile.careerIdentity?.whoYouAre || `${profile.careerState.replace('_', ' ')} with web engineering foundations`}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-primary)]">
              Where You're Going
            </span>
            <p className="font-semibold text-[var(--text-primary)]">
              {profile.careerIdentity?.whereYoureGoing || profile.currentTitle}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Why (Career Goal)
            </span>
            <p className="font-semibold text-[var(--text-primary)]">
              {profile.careerIdentity?.why || profile.careerGoal.replace('_', ' ')}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
              What You're Missing
            </span>
            <p className="font-semibold text-[var(--text-primary)]">
              {profile.careerIdentity?.whatYoureMissing || 'Automated test suite (Jest/Playwright) and CI/CD pipelines'}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
              What You're Building
            </span>
            <p className="font-semibold text-[var(--text-primary)]">
              {profile.careerIdentity?.whatYoureBuilding || 'Accessible Design System & E2E Testing Suite'}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500">
              Where You're Applying
            </span>
            <p className="font-semibold text-[var(--text-primary)]">
              {profile.careerIdentity?.whereApplying || 'Vanguard Systems & Nexus Cloud'}
            </p>
          </div>
        </div>
      </div>

      {/* Professional Summary Section */}
      <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[var(--accent-primary)]" />
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              Professional Summary
            </h2>
          </div>
          <button
            onClick={() => {
              setAiSummaryDraft(profile.professionalSummary || '');
              setEditSummaryOpen(true);
            }}
            className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            <span>Refine / Suggest with AI</span>
          </button>
        </div>

        <p className="text-sm text-[var(--text-secondary)] leading-relaxed bg-[var(--surface-secondary)]/40 p-4 rounded-xl border border-[var(--border-subtle)]">
          {profile.professionalSummary || 'No professional summary provided yet. Click "Suggest with AI" to generate a calibrated summary.'}
        </p>
      </div>

      {/* Experience Section */}
      <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-[var(--accent-primary)]" />
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              Work Experience ({profile.experiences.length})
            </h2>
          </div>
          <button
            onClick={handleOpenAddExp}
            className="px-3 py-1.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-xs font-semibold flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Experience</span>
          </button>
        </div>

        {profile.experiences.length === 0 ? (
          <div className="text-center py-8 text-xs text-[var(--text-muted)]">
            No work experience logged yet. Add your past or current positions to substantiate your career trajectory.
          </div>
        ) : (
          <div className="space-y-4">
            {profile.experiences.map((exp) => (
              <div 
                key={exp.id}
                className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:border-[var(--accent-primary)]/40 transition-colors space-y-2.5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[var(--text-primary)]">
                        {exp.role}
                      </h3>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-[var(--surface-secondary)] text-[var(--text-secondary)]">
                        {exp.employmentType}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-[var(--accent-primary)]">
                      {exp.company} • {exp.location}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditExp(exp)}
                      className="p-1.5 rounded-md hover:bg-[var(--surface-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      title="Edit entry"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteExp(exp.id)}
                      className="p-1.5 rounded-md hover:bg-[var(--surface-secondary)] text-[var(--text-muted)] hover:text-red-500"
                      title="Delete entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="text-[11px] font-mono text-[var(--text-muted)]">
                  {exp.startDate} – {exp.endDate} {exp.isCurrent && '(Current)'}
                </div>

                {exp.description && (
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {exp.description}
                  </p>
                )}

                {exp.achievements.length > 0 && (
                  <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
                    {exp.achievements.map((ach, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-[var(--accent-primary)] font-bold">•</span>
                        <span>{ach}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {exp.skillsUsed.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {exp.skillsUsed.map((sk, idx) => (
                      <span 
                        key={idx}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-[var(--surface-secondary)] text-[var(--text-secondary)] font-mono border border-[var(--border-subtle)]"
                      >
                        {sk}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Education & Certifications Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Education */}
        <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-[var(--accent-primary)]" />
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Education ({profile.education.length})
              </h2>
            </div>
            <button
              onClick={handleOpenAddEdu}
              className="px-2.5 py-1 rounded-lg bg-[var(--surface-secondary)] hover:bg-[var(--accent-surface)] text-[var(--text-primary)] hover:text-[var(--accent-primary)] text-xs font-semibold flex items-center gap-1 transition-colors border border-[var(--border-subtle)]"
            >
              <Plus className="w-3 h-3" />
              <span>Add</span>
            </button>
          </div>

          <div className="space-y-3">
            {profile.education.map((edu) => (
              <div 
                key={edu.id}
                className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] space-y-1.5"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-[var(--text-primary)]">
                      {edu.degree} in {edu.field}
                    </h3>
                    <p className="text-xs text-[var(--accent-primary)] font-medium">
                      {edu.institution}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleOpenEditEdu(edu)} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button onClick={() => handleDeleteEdu(edu.id)} className="p-1 text-[var(--text-muted)] hover:text-red-500">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="text-[10px] font-mono text-[var(--text-muted)]">
                  {edu.startDate} – {edu.endDate} {edu.gpa && `• GPA: ${edu.gpa}`}
                </div>
                {edu.coursework && edu.coursework.length > 0 && (
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    <span className="font-medium text-[var(--text-primary)]">Coursework:</span> {edu.coursework.join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Certifications */}
        <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-[var(--accent-primary)]" />
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Certifications ({profile.certifications.length})
              </h2>
            </div>
            <button
              onClick={() => {
                setEditingCert(null);
                setCertForm({
                  name: '',
                  provider: '',
                  issueDate: '',
                  expiryDate: '',
                  credentialId: '',
                  credentialUrl: ''
                });
                setCertModalOpen(true);
              }}
              className="px-2.5 py-1 rounded-lg bg-[var(--surface-secondary)] hover:bg-[var(--accent-surface)] text-[var(--text-primary)] hover:text-[var(--accent-primary)] text-xs font-semibold flex items-center gap-1 transition-colors border border-[var(--border-subtle)]"
            >
              <Plus className="w-3 h-3" />
              <span>Add</span>
            </button>
          </div>

          <div className="space-y-3">
            {profile.certifications.map((cert) => (
              <div 
                key={cert.id}
                className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] space-y-1.5"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-[var(--text-primary)]">
                      {cert.name}
                    </h3>
                    <p className="text-xs text-[var(--accent-primary)] font-medium">
                      {cert.provider} • Issued {cert.issueDate}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleDeleteCert(cert.id)} className="p-1 text-[var(--text-muted)] hover:text-red-500">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                {cert.credentialId && (
                  <div className="text-[10px] font-mono text-[var(--text-muted)]">
                    ID: {cert.credentialId}
                  </div>
                )}
                {cert.credentialUrl && (
                  <a
                    href={cert.credentialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[var(--accent-primary)] hover:underline flex items-center gap-1"
                  >
                    <span>Verify Credential</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Languages & Professional Links Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Languages */}
        <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <Languages className="w-4 h-4 text-[var(--accent-primary)]" />
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Languages ({profile.languages.length})
              </h2>
            </div>
            <button
              onClick={() => setLangModalOpen(true)}
              className="px-2.5 py-1 rounded-lg bg-[var(--surface-secondary)] hover:bg-[var(--accent-surface)] text-[var(--text-primary)] hover:text-[var(--accent-primary)] text-xs font-semibold flex items-center gap-1 transition-colors border border-[var(--border-subtle)]"
            >
              <Plus className="w-3 h-3" />
              <span>Add</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {profile.languages.map((l) => (
              <div 
                key={l.id}
                className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-[var(--text-primary)]">
                    {l.language}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    {l.proficiency}
                  </div>
                </div>
                <button 
                  onClick={() => handleDeleteLang(l.id)}
                  className="p-1 text-[var(--text-muted)] hover:text-red-500"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Links */}
        <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-[var(--accent-primary)]" />
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Professional Links
              </h2>
            </div>
            <button
              onClick={() => setEditBasicOpen(true)}
              className="text-xs font-semibold text-[var(--accent-primary)] hover:underline"
            >
              Update Links
            </button>
          </div>

          <div className="space-y-2 text-xs">
            {profile.links?.linkedin ? (
              <a 
                href={profile.links.linkedin}
                target="_blank" 
                rel="noopener noreferrer"
                className="p-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)] flex items-center justify-between text-[var(--text-primary)] transition-colors"
              >
                <span className="font-medium">LinkedIn</span>
                <span className="font-mono text-[11px] text-[var(--text-muted)] truncate max-w-[200px]">
                  {profile.links.linkedin.replace('https://', '')}
                </span>
              </a>
            ) : (
              <div className="p-2 text-xs text-[var(--text-muted)]">No LinkedIn link connected yet.</div>
            )}

            {profile.links?.github && (
              <a 
                href={profile.links.github}
                target="_blank" 
                rel="noopener noreferrer"
                className="p-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)] flex items-center justify-between text-[var(--text-primary)] transition-colors"
              >
                <span className="font-medium">GitHub</span>
                <span className="font-mono text-[11px] text-[var(--text-muted)] truncate max-w-[200px]">
                  {profile.links.github.replace('https://', '')}
                </span>
              </a>
            )}

            {profile.links?.portfolio && (
              <a 
                href={profile.links.portfolio}
                target="_blank" 
                rel="noopener noreferrer"
                className="p-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)] flex items-center justify-between text-[var(--text-primary)] transition-colors"
              >
                <span className="font-medium">Portfolio</span>
                <span className="font-mono text-[11px] text-[var(--text-muted)] truncate max-w-[200px]">
                  {profile.links.portfolio.replace('https://', '')}
                </span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: Edit Basic Information */}
      {editBasicOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-main)] rounded-2xl border border-[var(--border-subtle)] shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                Edit Personal & Professional Identity
              </h3>
              <button onClick={() => setEditBasicOpen(false)} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">Full Name</label>
                  <input
                    type="text"
                    value={basicForm.name}
                    onChange={(e) => setBasicForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">Preferred Name</label>
                  <input
                    type="text"
                    value={basicForm.preferredName}
                    onChange={(e) => setBasicForm(prev => ({ ...prev, preferredName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">Professional Headline</label>
                <input
                  type="text"
                  value={basicForm.headline}
                  onChange={(e) => setBasicForm(prev => ({ ...prev, headline: e.target.value }))}
                  placeholder="e.g. Frontend Engineer | React 19, TypeScript & Accessible Design Systems"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">Email</label>
                  <input
                    type="email"
                    value={basicForm.email}
                    onChange={(e) => setBasicForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">Phone</label>
                  <input
                    type="text"
                    value={basicForm.phone}
                    onChange={(e) => setBasicForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">Location / City</label>
                  <input
                    type="text"
                    value={basicForm.location}
                    onChange={(e) => setBasicForm(prev => ({ ...prev, location: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">Timezone</label>
                  <input
                    type="text"
                    value={basicForm.timezone}
                    onChange={(e) => setBasicForm(prev => ({ ...prev, timezone: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                  />
                </div>
              </div>

              {/* Username & Privacy */}
              <div className="p-4 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] space-y-3">
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">
                    Profile Username (Public URL: /profile/{basicForm.username || 'username'})
                  </label>
                  <input
                    type="text"
                    value={basicForm.username}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-main)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono"
                  />
                  {usernameCheckMessage && (
                    <p className={`text-[11px] mt-1 ${isUsernameValid ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {usernameCheckMessage}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div>
                    <div className="font-semibold text-[var(--text-primary)]">Public Profile Visibility</div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      Allow employers and peers to view your public profile page. Private notes and applications are never exposed.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={basicForm.isPublic}
                    onChange={(e) => setBasicForm(prev => ({ ...prev, isPublic: e.target.checked }))}
                    className="w-4 h-4 accent-[var(--accent-primary)] rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* Social Links */}
              <div className="space-y-3 pt-2">
                <span className="font-semibold text-[var(--text-primary)] block">Professional Links</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block mb-1">LinkedIn URL</label>
                    <input
                      type="url"
                      value={basicForm.linkedin}
                      onChange={(e) => setBasicForm(prev => ({ ...prev, linkedin: e.target.value }))}
                      placeholder="https://linkedin.com/in/..."
                      className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block mb-1">GitHub URL</label>
                    <input
                      type="url"
                      value={basicForm.github}
                      onChange={(e) => setBasicForm(prev => ({ ...prev, github: e.target.value }))}
                      placeholder="https://github.com/..."
                      className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block mb-1">Portfolio Website</label>
                    <input
                      type="url"
                      value={basicForm.portfolio}
                      onChange={(e) => setBasicForm(prev => ({ ...prev, portfolio: e.target.value }))}
                      placeholder="https://myportfolio.dev"
                      className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block mb-1">Personal Blog / Site</label>
                    <input
                      type="url"
                      value={basicForm.personalWebsite}
                      onChange={(e) => setBasicForm(prev => ({ ...prev, personalWebsite: e.target.value }))}
                      placeholder="https://myblog.com"
                      className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => setEditBasicOpen(false)}
                className="px-4 py-2 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--text-secondary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBasic}
                className="px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-xs font-semibold"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: AI Summary Suggestion & Review */}
      {editSummaryOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-main)] rounded-2xl border border-[var(--border-subtle)] shadow-xl w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[var(--accent-primary)]" />
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  AI Professional Summary Assistant
                </h3>
              </div>
              <button onClick={() => setEditSummaryOpen(false)} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Gemini analyzes your career target ({profile.currentTitle}), experience entries, and assessed skills to synthesize an authentic executive summary. You review and approve before saving.
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[var(--text-primary)]">
                  Summary Draft
                </label>
                <button
                  onClick={handleGenerateSummary}
                  disabled={aiSummaryLoading}
                  className="px-2.5 py-1 rounded-lg bg-[var(--accent-surface)] text-[var(--accent-primary)] text-xs font-semibold hover:bg-[var(--accent-primary)] hover:text-white transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>{aiSummaryLoading ? 'Generating...' : 'Generate New Draft'}</span>
                </button>
              </div>

              <textarea
                rows={5}
                value={aiSummaryDraft}
                onChange={(e) => setAiSummaryDraft(e.target.value)}
                placeholder="Click 'Generate New Draft' or edit your summary text..."
                className="w-full p-3 rounded-xl bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => setEditSummaryOpen(false)}
                className="px-4 py-2 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSummary}
                disabled={!aiSummaryDraft.trim()}
                className="px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-xs font-semibold disabled:opacity-50"
              >
                Approve & Save Summary
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add / Edit Experience */}
      {expModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-main)] rounded-2xl border border-[var(--border-subtle)] shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                {editingExp ? 'Edit Experience' : 'Add Experience Entry'}
              </h3>
              <button onClick={() => setExpModalOpen(false)} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">Job Title / Role</label>
                  <input
                    type="text"
                    value={expForm.role}
                    onChange={(e) => setExpForm(prev => ({ ...prev, role: e.target.value }))}
                    placeholder="e.g. Frontend Engineer"
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">Company</label>
                  <input
                    type="text"
                    value={expForm.company}
                    onChange={(e) => setExpForm(prev => ({ ...prev, company: e.target.value }))}
                    placeholder="e.g. Meridian Tech"
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">Employment Type</label>
                  <select
                    value={expForm.employmentType}
                    onChange={(e: any) => setExpForm(prev => ({ ...prev, employmentType: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                  >
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Contract">Contract</option>
                    <option value="Internship">Internship</option>
                    <option value="Freelance">Freelance</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">Location</label>
                  <input
                    type="text"
                    value={expForm.location}
                    onChange={(e) => setExpForm(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="e.g. San Francisco / Remote"
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">Start Date</label>
                  <input
                    type="text"
                    value={expForm.startDate}
                    onChange={(e) => setExpForm(prev => ({ ...prev, startDate: e.target.value }))}
                    placeholder="e.g. 2024-03"
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">End Date</label>
                  <input
                    type="text"
                    disabled={expForm.isCurrent}
                    value={expForm.endDate}
                    onChange={(e) => setExpForm(prev => ({ ...prev, endDate: e.target.value }))}
                    placeholder="e.g. 2026-10"
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] disabled:opacity-40"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isCurrent"
                  checked={expForm.isCurrent}
                  onChange={(e) => setExpForm(prev => ({ ...prev, isCurrent: e.target.checked }))}
                  className="rounded accent-[var(--accent-primary)] cursor-pointer"
                />
                <label htmlFor="isCurrent" className="text-xs text-[var(--text-primary)] cursor-pointer">
                  I currently work here
                </label>
              </div>

              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">Role Description</label>
                <textarea
                  rows={2}
                  value={expForm.description}
                  onChange={(e) => setExpForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Summary of responsibilities and scope..."
                  className="w-full p-2.5 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">
                  Key Achievements (one per line)
                </label>
                <textarea
                  rows={3}
                  value={expForm.achievements}
                  onChange={(e) => setExpForm(prev => ({ ...prev, achievements: e.target.value }))}
                  placeholder="Spearheaded design system adoption across 3 squads...&#10;Reduced LCP from 3.2s to 1.1s..."
                  className="w-full p-2.5 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">
                  Skills Used (comma-separated)
                </label>
                <input
                  type="text"
                  value={expForm.skillsUsed}
                  onChange={(e) => setExpForm(prev => ({ ...prev, skillsUsed: e.target.value }))}
                  placeholder="React, TypeScript, Tailwind CSS, Playwright"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => setExpModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveExp}
                disabled={!expForm.role || !expForm.company}
                className="px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-xs font-semibold disabled:opacity-50"
              >
                Save Experience
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Profile Preview */}
      {previewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-main)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-[var(--accent-primary)]" />
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Executive Career Profile Preview
                </h3>
              </div>
              <button onClick={() => setPreviewModalOpen(false)} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 rounded-xl bg-[var(--surface-secondary)]/30 border border-[var(--border-subtle)] space-y-6">
              {/* Header Preview */}
              <div className="flex items-center gap-5">
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  className="w-20 h-20 rounded-2xl object-cover border border-[var(--border-subtle)]"
                />
                <div className="space-y-1">
                  <h1 className="text-xl font-bold text-[var(--text-primary)]">
                    {profile.name}
                  </h1>
                  <p className="text-xs font-semibold text-[var(--accent-primary)]">
                    {profile.headline || profile.currentTitle}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {profile.location} • {profile.email}
                  </p>
                </div>
              </div>

              {/* Summary */}
              {profile.professionalSummary && (
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">About</h4>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {profile.professionalSummary}
                  </p>
                </div>
              )}

              {/* Core Competencies */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Core Skills</h4>
                <div className="flex flex-wrap gap-1.5">
                  {skills.slice(0, 8).map(sk => (
                    <span key={sk.id} className="text-xs px-2.5 py-1 rounded-md bg-[var(--surface-main)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-medium">
                      {sk.name} (L{sk.currentLevel})
                    </span>
                  ))}
                </div>
              </div>

              {/* Experience */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Experience</h4>
                {profile.experiences.map(e => (
                  <div key={e.id} className="space-y-1 text-xs">
                    <div className="flex items-center justify-between font-bold text-[var(--text-primary)]">
                      <span>{e.role} — {e.company}</span>
                      <span className="text-[11px] font-mono text-[var(--text-muted)] font-normal">{e.startDate} – {e.endDate}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)]">{e.description}</p>
                  </div>
                ))}
              </div>

              {/* Projects */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Featured Proof-of-Skill Projects</h4>
                {projects.slice(0, 2).map(p => (
                  <div key={p.id} className="p-3 rounded-lg bg-[var(--surface-main)] border border-[var(--border-subtle)] text-xs space-y-1">
                    <div className="font-bold text-[var(--text-primary)]">{p.title}</div>
                    <p className="text-[11px] text-[var(--text-secondary)]">{p.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setPreviewModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-semibold"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Education */}
      {eduModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-main)] rounded-2xl border border-[var(--border-subtle)] shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-bold text-[var(--text-primary)]">
              {editingEdu ? 'Edit Education' : 'Add Education'}
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">Institution / University</label>
                <input
                  type="text"
                  value={eduForm.institution}
                  onChange={(e) => setEduForm(prev => ({ ...prev, institution: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">Degree</label>
                  <input
                    type="text"
                    value={eduForm.degree}
                    onChange={(e) => setEduForm(prev => ({ ...prev, degree: e.target.value }))}
                    placeholder="B.S. / M.S."
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">Field of Study</label>
                  <input
                    type="text"
                    value={eduForm.field}
                    onChange={(e) => setEduForm(prev => ({ ...prev, field: e.target.value }))}
                    placeholder="Computer Science"
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">Start Date</label>
                  <input
                    type="text"
                    value={eduForm.startDate}
                    onChange={(e) => setEduForm(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">Graduation Date</label>
                  <input
                    type="text"
                    value={eduForm.endDate}
                    onChange={(e) => setEduForm(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">GPA (optional)</label>
                <input
                  type="text"
                  value={eduForm.gpa}
                  onChange={(e) => setEduForm(prev => ({ ...prev, gpa: e.target.value }))}
                  placeholder="e.g. 3.8/4.0"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <button onClick={() => setEduModalOpen(false)} className="px-3 py-1.5 text-xs text-[var(--text-secondary)]">
                Cancel
              </button>
              <button onClick={handleSaveEdu} className="px-3.5 py-1.5 bg-[var(--accent-primary)] text-white rounded-lg text-xs font-semibold">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Certification */}
      {certModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-main)] rounded-2xl border border-[var(--border-subtle)] shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-bold text-[var(--text-primary)]">
              Add Professional Certification
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">Certificate Name</label>
                <input
                  type="text"
                  value={certForm.name}
                  onChange={(e) => setCertForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Meta Front-End Developer Certificate"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                />
              </div>
              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">Issuing Organization</label>
                <input
                  type="text"
                  value={certForm.provider}
                  onChange={(e) => setCertForm(prev => ({ ...prev, provider: e.target.value }))}
                  placeholder="e.g. Meta / Coursera"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">Issue Date</label>
                  <input
                    type="text"
                    value={certForm.issueDate}
                    onChange={(e) => setCertForm(prev => ({ ...prev, issueDate: e.target.value }))}
                    placeholder="2024-02"
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">Credential ID</label>
                  <input
                    type="text"
                    value={certForm.credentialId}
                    onChange={(e) => setCertForm(prev => ({ ...prev, credentialId: e.target.value }))}
                    placeholder="CERT-12345"
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">Verification URL</label>
                <input
                  type="url"
                  value={certForm.credentialUrl}
                  onChange={(e) => setCertForm(prev => ({ ...prev, credentialUrl: e.target.value }))}
                  placeholder="https://coursera.org/verify/..."
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <button onClick={() => setCertModalOpen(false)} className="px-3 py-1.5 text-xs text-[var(--text-secondary)]">
                Cancel
              </button>
              <button onClick={handleSaveCert} className="px-3.5 py-1.5 bg-[var(--accent-primary)] text-white rounded-lg text-xs font-semibold">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Language */}
      {langModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-main)] rounded-2xl border border-[var(--border-subtle)] shadow-xl w-full max-w-xs p-6 space-y-4">
            <h3 className="text-base font-bold text-[var(--text-primary)]">Add Language</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">Language</label>
                <input
                  type="text"
                  value={langForm.language}
                  onChange={(e) => setLangForm(prev => ({ ...prev, language: e.target.value }))}
                  placeholder="e.g. French"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                />
              </div>
              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">Proficiency</label>
                <select
                  value={langForm.proficiency}
                  onChange={(e: any) => setLangForm(prev => ({ ...prev, proficiency: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                >
                  <option value="Native">Native</option>
                  <option value="Fluent">Fluent</option>
                  <option value="Professional">Professional</option>
                  <option value="Conversational">Conversational</option>
                  <option value="Basic">Basic</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <button onClick={() => setLangModalOpen(false)} className="px-3 py-1.5 text-xs text-[var(--text-secondary)]">Cancel</button>
              <button onClick={handleSaveLang} className="px-3.5 py-1.5 bg-[var(--accent-primary)] text-white rounded-lg text-xs font-semibold">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
