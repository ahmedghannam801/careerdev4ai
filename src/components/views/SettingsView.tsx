import React, { useState } from 'react';
import { 
  Globe, 
  Moon, 
  Sun, 
  Bell, 
  Shield, 
  Download, 
  RotateCcw, 
  Check, 
  User, 
  Mail, 
  Key, 
  Trash2, 
  Sparkles, 
  Lock, 
  Unlock, 
  ExternalLink, 
  AlertTriangle, 
  X,
  Smartphone,
  Laptop
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';

export const SettingsView: React.FC = () => {
  const { 
    currentUser, 
    authToken, 
    profile, 
    updateProfile, 
    settings, 
    updateSettings, 
    aiPreferences, 
    updateAiPreferences, 
    notificationPreferences, 
    updateNotificationPreferences, 
    privacyPreferences, 
    updatePrivacyPreferences, 
    validateUsername, 
    exportDataJson, 
    resetAllData, 
    t 
  } = useCareer();

  const [activeTab, setActiveTab] = useState<'account' | 'security' | 'privacy' | 'ai' | 'notifications' | 'interface'>('account');

  // Change Password state
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ success?: boolean; text: string } | null>(null);

  // Change Email state
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState(profile.email);
  const [emailMsg, setEmailMsg] = useState<{ success?: boolean; text: string } | null>(null);

  // Delete Account modal state
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Username validation state
  const [usernameInput, setUsernameInput] = useState(profile.username || 'sarah-jenkins');
  const [usernameStatus, setUsernameStatus] = useState<{ available?: boolean; text: string } | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    try {
      const res = await fetch('/api/account/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setPasswordMsg({ success: true, text: 'Password successfully updated!' });
        setTimeout(() => {
          setChangePasswordOpen(false);
          setPasswordMsg(null);
          setCurrentPassword('');
          setNewPassword('');
        }, 1500);
      } else {
        setPasswordMsg({ success: false, text: data.error || 'Failed to update password' });
      }
    } catch (e) {
      setPasswordMsg({ success: false, text: 'Network error updating password' });
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newEmail.includes('@')) return;
    try {
      const res = await fetch('/api/account/change-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ newEmail })
      });
      const data = await res.json();
      if (res.ok) {
        updateProfile({ email: newEmail });
        setEmailMsg({ success: true, text: 'Email successfully updated!' });
        setTimeout(() => {
          setChangeEmailOpen(false);
          setEmailMsg(null);
        }, 1500);
      } else {
        setEmailMsg({ success: false, text: data.error || 'Failed to update email' });
      }
    } catch (e) {
      setEmailMsg({ success: false, text: 'Network error updating email' });
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setIsDeleting(true);
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        localStorage.clear();
        window.location.reload();
      } else {
        alert('Failed to delete account');
      }
    } catch (e) {
      console.error(e);
      alert('Error deleting account');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleValidateUsername = async (val: string) => {
    const clean = val.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    setUsernameInput(clean);
    if (clean.length < 3) {
      setUsernameStatus({ available: false, text: 'Username must be at least 3 characters' });
      return;
    }
    const res = await validateUsername(clean);
    setUsernameStatus({ available: res.available, text: res.message });
    if (res.available) {
      updateProfile({ username: clean });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200 max-w-5xl">
      {/* Top Header */}
      <div className="pb-3 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="text-xs text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
            User Workspace & Controls
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            Account, Security & Preferences
          </h1>
        </div>

        <button
          onClick={exportDataJson}
          className="self-start sm:self-auto px-3.5 py-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5 transition-colors shadow-2xs"
        >
          <Download className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
          <span>Export All Career Data</span>
        </button>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border-subtle)] pb-2 text-xs font-semibold">
        {[
          { id: 'account', label: 'Account', icon: User },
          { id: 'security', label: 'Security & Sessions', icon: Shield },
          { id: 'privacy', label: 'Privacy Center', icon: Lock },
          { id: 'ai', label: 'AI Preferences', icon: Sparkles },
          { id: 'notifications', label: 'Notifications', icon: Bell },
          { id: 'interface', label: 'Localization & Theme', icon: Globe },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                isActive
                  ? 'bg-[var(--accent-surface)] text-[var(--accent-primary)] shadow-2xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: ACCOUNT */}
      {activeTab === 'account' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-5 shadow-xs">
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              Account Overview
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">User Name</span>
                <p className="font-semibold text-[var(--text-primary)]">{profile.name}</p>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Primary Email</span>
                <p className="font-semibold text-[var(--text-primary)]">{profile.email}</p>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Account Status</span>
                <p className="font-semibold text-emerald-500 flex items-center gap-1">
                  <span>● Active Authenticated</span>
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Member Since</span>
                <p className="font-mono text-[var(--text-primary)]">October 2026</p>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Timezone</span>
                <p className="font-semibold text-[var(--text-primary)]">{profile.timezone || 'UTC'}</p>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Language Preference</span>
                <p className="font-semibold text-[var(--text-primary)]">{settings.language === 'ar' ? 'العربية' : 'English'}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => setChangeEmailOpen(true)}
                className="px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5"
              >
                <Mail className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>Change Email</span>
              </button>

              <button
                onClick={() => setChangePasswordOpen(true)}
                className="px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5"
              >
                <Key className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>Change Password</span>
              </button>
            </div>
          </div>

          {/* Danger Zone: Account Deletion */}
          <div className="p-6 rounded-2xl bg-red-500/5 border border-red-500/20 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>Danger Zone — Delete Account</span>
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Permanently deletes your account, personal career profile, active roadmap tasks, project evidence, CV studio versions, and application pipeline history. This action cannot be undone.
              </p>
            </div>

            <button
              onClick={() => setDeleteAccountOpen(true)}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Account & Career Graph</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: SECURITY */}
      {activeTab === 'security' && (
        <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-6 shadow-xs">
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              Security & Active Sessions
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Monitor authentication tokens, connected devices, and active secure sessions.
            </p>
          </div>

          <div className="space-y-3">
            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <Laptop className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[var(--text-primary)]">Current Active Session</div>
                  <div className="text-[11px] text-[var(--text-muted)] font-mono">
                    Token: {authToken ? `${authToken.slice(0, 8)}...${authToken.slice(-6)}` : 'Active'} • Chrome / macOS
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-bold text-emerald-600 font-mono bg-emerald-500/10 px-2 py-0.5 rounded-full">
                Online Now
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] space-y-2 text-xs">
            <span className="font-bold text-[var(--text-primary)] block">Authentication Protocols</span>
            <p className="text-[var(--text-secondary)] leading-relaxed">
              Passwords are salted with cryptographic random bytes and hashed using Node.js scrypt with 64-byte key derivations. Server communication operates over TLS.
            </p>
          </div>
        </div>
      )}

      {/* TAB 3: PRIVACY CENTER */}
      {activeTab === 'privacy' && (
        <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-6 shadow-xs">
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              Privacy & Data Visibility
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Control what is publicly visible and manage how your career data interacts with AI intelligence.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            {/* Public profile toggle */}
            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] flex items-center justify-between">
              <div>
                <span className="font-bold text-[var(--text-primary)] block">Public Career Profile</span>
                <p className="text-[var(--text-secondary)] mt-0.5">
                  Allows sharing a clean resume view at /#/profile/{profile.username || 'username'}. Private notes and applications are never exposed.
                </p>
              </div>
              <input
                type="checkbox"
                checked={profile.isPublic}
                onChange={(e) => updateProfile({ isPublic: e.target.checked })}
                className="w-4 h-4 accent-[var(--accent-primary)] rounded cursor-pointer"
              />
            </div>

            {/* Public username configuration */}
            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] space-y-2">
              <span className="font-bold text-[var(--text-primary)] block">Professional Username Handle</span>
              <div className="flex items-center gap-2 max-w-md">
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => handleValidateUsername(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono"
                />
              </div>
              {usernameStatus && (
                <p className={`text-[11px] ${usernameStatus.available ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {usernameStatus.text}
                </p>
              )}
            </div>

            {/* AI Personalization */}
            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] flex items-center justify-between">
              <div>
                <span className="font-bold text-[var(--text-primary)] block">Career Graph AI Grounding</span>
                <p className="text-[var(--text-secondary)] mt-0.5">
                  Allows Gemini to analyze your roadmap gaps and project deliverables to provide tailored recommendations.
                </p>
              </div>
              <input
                type="checkbox"
                checked={privacyPreferences.shareAnalyticsWithAi}
                onChange={(e) => updatePrivacyPreferences({ shareAnalyticsWithAi: e.target.checked })}
                className="w-4 h-4 accent-[var(--accent-primary)] rounded cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: AI PREFERENCES */}
      {activeTab === 'ai' && (
        <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-6 shadow-xs">
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              AI Copilot & Writing Assistant Controls
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Customize how proactively CareerPilot AI assists with cover letters, mock evaluations, and roadmap planning.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] flex items-center justify-between">
              <div>
                <span className="font-bold text-[var(--text-primary)] block">AI Recommendations</span>
                <p className="text-[var(--text-secondary)]">Suggest next best actions on dashboard and identify missing skills.</p>
              </div>
              <input
                type="checkbox"
                checked={aiPreferences.recommendationsEnabled}
                onChange={(e) => updateAiPreferences({ recommendationsEnabled: e.target.checked })}
                className="w-4 h-4 accent-[var(--accent-primary)] rounded cursor-pointer"
              />
            </div>

            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] flex items-center justify-between">
              <div>
                <span className="font-bold text-[var(--text-primary)] block">AI Writing Assistance</span>
                <p className="text-[var(--text-secondary)]">Enable Gemini assistance in CV bullet rewriting and cover letter drafting.</p>
              </div>
              <input
                type="checkbox"
                checked={aiPreferences.writingAssistance}
                onChange={(e) => updateAiPreferences({ writingAssistance: e.target.checked })}
                className="w-4 h-4 accent-[var(--accent-primary)] rounded cursor-pointer"
              />
            </div>

            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] flex items-center justify-between">
              <div>
                <span className="font-bold text-[var(--text-primary)] block">Proactive Suggestions</span>
                <p className="text-[var(--text-secondary)]">Allow Copilot drawer to propose structured task additions when gaps are detected.</p>
              </div>
              <input
                type="checkbox"
                checked={aiPreferences.proactiveSuggestions}
                onChange={(e) => updateAiPreferences({ proactiveSuggestions: e.target.checked })}
                className="w-4 h-4 accent-[var(--accent-primary)] rounded cursor-pointer"
              />
            </div>

            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] space-y-2">
              <span className="font-bold text-[var(--text-primary)] block">Personalization Depth</span>
              <div className="grid grid-cols-3 gap-2">
                {(['focused', 'balanced', 'comprehensive'] as const).map(lvl => (
                  <button
                    key={lvl}
                    onClick={() => updateAiPreferences({ personalizationLevel: lvl })}
                    className={`py-2 rounded-lg capitalize font-semibold border transition-colors ${
                      aiPreferences.personalizationLevel === lvl
                        ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                        : 'bg-[var(--surface-secondary)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: NOTIFICATIONS */}
      {activeTab === 'notifications' && (
        <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-6 shadow-xs">
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              Notification Preferences
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Control alert frequency for upcoming interviews, roadmap deadlines, and job match opportunities.
            </p>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] flex items-center justify-between">
              <div>
                <span className="font-bold text-[var(--text-primary)]">Interview Reminders</span>
                <p className="text-[var(--text-secondary)]">Alerts 24 hours and 2 hours before scheduled technical or behavioral rounds.</p>
              </div>
              <input
                type="checkbox"
                checked={notificationPreferences.interviewReminders}
                onChange={(e) => updateNotificationPreferences({ interviewReminders: e.target.checked })}
                className="w-4 h-4 accent-[var(--accent-primary)] rounded cursor-pointer"
              />
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] flex items-center justify-between">
              <div>
                <span className="font-bold text-[var(--text-primary)]">Application Pipeline Follow-ups</span>
                <p className="text-[var(--text-secondary)]">Reminders when recruiters have not responded past 7 business days.</p>
              </div>
              <input
                type="checkbox"
                checked={notificationPreferences.applicationReminders}
                onChange={(e) => updateNotificationPreferences({ applicationReminders: e.target.checked })}
                className="w-4 h-4 accent-[var(--accent-primary)] rounded cursor-pointer"
              />
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] flex items-center justify-between">
              <div>
                <span className="font-bold text-[var(--text-primary)]">Roadmap Milestone Reminders</span>
                <p className="text-[var(--text-secondary)]">Notifications when scheduled learning tasks are approaching due date.</p>
              </div>
              <input
                type="checkbox"
                checked={notificationPreferences.roadmapReminders}
                onChange={(e) => updateNotificationPreferences({ roadmapReminders: e.target.checked })}
                className="w-4 h-4 accent-[var(--accent-primary)] rounded cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: INTERFACE & LOCALIZATION */}
      {activeTab === 'interface' && (
        <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-6 shadow-xs">
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              Interface & Localization
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Customize application language, text direction (LTR / RTL), and display theme.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
            <div className="space-y-2">
              <label className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>Language & Direction</span>
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => updateSettings({ language: 'en' })}
                  className={`flex-1 py-2.5 rounded-xl font-semibold border transition-all ${
                    settings.language === 'en'
                      ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                      : 'bg-[var(--surface-secondary)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                  }`}
                >
                  English (LTR)
                </button>
                <button
                  onClick={() => updateSettings({ language: 'ar' })}
                  className={`flex-1 py-2.5 rounded-xl font-semibold border transition-all ${
                    settings.language === 'ar'
                      ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                      : 'bg-[var(--surface-secondary)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                  }`}
                >
                  العربية (RTL)
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                {settings.theme === 'dark' ? <Moon className="w-3.5 h-3.5 text-[var(--accent-primary)]" /> : <Sun className="w-3.5 h-3.5 text-[var(--accent-primary)]" />}
                <span>Display Theme</span>
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => updateSettings({ theme: 'light' })}
                  className={`flex-1 py-2.5 rounded-xl font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                    settings.theme === 'light'
                      ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                      : 'bg-[var(--surface-secondary)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>Light</span>
                </button>
                <button
                  onClick={() => updateSettings({ theme: 'dark' })}
                  className={`flex-1 py-2.5 rounded-xl font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                    settings.theme === 'dark'
                      ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                      : 'bg-[var(--surface-secondary)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>Dark</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Change Password */}
      {changePasswordOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-main)] rounded-2xl border border-[var(--border-subtle)] shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-[var(--text-primary)]">Change Password</h3>
            <form onSubmit={handleChangePassword} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                  required
                />
              </div>
              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                  required
                />
              </div>
              {passwordMsg && (
                <p className={`text-[11px] font-medium ${passwordMsg.success ? 'text-emerald-500' : 'text-red-500'}`}>
                  {passwordMsg.text}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button type="button" onClick={() => setChangePasswordOpen(false)} className="px-3 py-1.5 text-xs text-[var(--text-secondary)]">Cancel</button>
                <button type="submit" className="px-3.5 py-1.5 bg-[var(--accent-primary)] text-white rounded-lg text-xs font-semibold">Update Password</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Change Email */}
      {changeEmailOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-main)] rounded-2xl border border-[var(--border-subtle)] shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-[var(--text-primary)]">Change Account Email</h3>
            <form onSubmit={handleChangeEmail} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">New Email Address</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                  required
                />
              </div>
              {emailMsg && (
                <p className={`text-[11px] font-medium ${emailMsg.success ? 'text-emerald-500' : 'text-red-500'}`}>
                  {emailMsg.text}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button type="button" onClick={() => setChangeEmailOpen(false)} className="px-3 py-1.5 text-xs text-[var(--text-secondary)]">Cancel</button>
                <button type="submit" className="px-3.5 py-1.5 bg-[var(--accent-primary)] text-white rounded-lg text-xs font-semibold">Update Email</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Delete Account Confirmation */}
      {deleteAccountOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-main)] rounded-2xl border border-red-500/30 shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-base font-bold">Permanently Delete Account?</h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              This will irreversibly purge your profile, skills, roadmap milestones, project evidence, applications, and interview data from the persistent server database.
            </p>
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-600">
              To confirm, type <strong className="font-mono">DELETE</strong> below:
            </div>
            <div>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE"
                className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-mono"
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <button onClick={() => setDeleteAccountOpen(false)} className="px-3 py-1.5 text-xs text-[var(--text-secondary)]">Cancel</button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || isDeleting}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold disabled:opacity-40 transition-colors"
              >
                {isDeleting ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
