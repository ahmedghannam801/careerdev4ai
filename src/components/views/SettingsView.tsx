import React, { useEffect, useState } from 'react';
import { 
  Globe, 
  Moon, 
  Sun, 
  Bell, 
  Shield, 
  Download, 
  User, 
  Mail, 
  Key, 
  Trash2, 
  Sparkles, 
  Lock, 
  AlertTriangle, 
  Laptop,
  Info,
  Phone,
  Linkedin,
  Github,
  ExternalLink
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { getAccessToken, getBrowserSupabase, isSupabaseConfigured } from '../../lib/supabase';
import { Reveal } from '../motion/Motion';

/**
 * A short, honest description of the browser this session is running in.
 * It used to be the hard-coded "Chrome / macOS", which described somebody
 * else's machine rather than the user's.
 */
const getClientLabel = (): string => {
  if (typeof navigator === 'undefined') return 'Unknown client';
  const ua = navigator.userAgent || '';
  const browser = /\bEdg\//.test(ua) ? 'Edge'
    : /\bOPR\//.test(ua) ? 'Opera'
    : /\bChrome\//.test(ua) ? 'Chrome'
    : /\bFirefox\//.test(ua) ? 'Firefox'
    : /\bSafari\//.test(ua) ? 'Safari'
    : 'Browser';
  const os = /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua) ? 'macOS'
    : /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad|iOS/i.test(ua) ? 'iOS'
    : /Linux/i.test(ua) ? 'Linux'
    : 'Unknown OS';
  return `${browser} / ${os}`;
};

export const SettingsView: React.FC = () => {
  const {
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
  } = useCareer();

  const [activeTab, setActiveTab] = useState<'account' | 'security' | 'privacy' | 'ai' | 'notifications' | 'interface' | 'about'>('account');

  // Change Password state
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ success?: boolean; text: string } | null>(null);

  // Change Email state
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState(profile.email);
  const [emailPassword, setEmailPassword] = useState('');
  const [emailMsg, setEmailMsg] = useState<{ success?: boolean; text: string } | null>(null);

  // Delete Account modal state
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Username validation state. The username is saved only when the user
  // presses Save — it must never be written on every keystroke.
  const [usernameInput, setUsernameInput] = useState(profile.username || '');
  const [usernameStatus, setUsernameStatus] = useState<{ available?: boolean; text: string } | null>(null);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameSaved, setUsernameSaved] = useState(false);
  const [publicSaving, setPublicSaving] = useState(false);
  const [publicError, setPublicError] = useState<string | null>(null);

  // "Member Since" is the user's own account creation date, read from the
  // Supabase auth session. It was a hard-coded "October 2026" before.
  const [memberSince, setMemberSince] = useState<string | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    getBrowserSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (cancelled) return;
        const created = data.session?.user?.created_at;
        if (!created) return;
        const parsed = new Date(created);
        if (Number.isNaN(parsed.getTime())) return;
        setMemberSince(parsed.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
      })
      .catch(() => {
        // The creation date is informational only — a failure to read it
        // must not break the account tab.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/account/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
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
    if (!emailPassword) {
      setEmailMsg({ success: false, text: 'Enter your current password to change your email' });
      return;
    }
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/account/change-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ newEmail, currentPassword: emailPassword })
      });
      const data = await res.json();
      if (res.ok) {
        updateProfile({ email: newEmail });
        setEmailMsg({ success: true, text: 'Email successfully updated!' });
        setTimeout(() => {
          setChangeEmailOpen(false);
          setEmailMsg(null);
          setEmailPassword('');
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
    setDeleteError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        // The auth user is already deleted. Clear the local Supabase session
        // before reloading; otherwise the browser would restore a session for
        // an identity that no longer exists and every API call would 401.
        if (isSupabaseConfigured) {
          await getBrowserSupabase().auth.signOut().catch(() => {});
        }
        // B.4 finding L-1: `localStorage.clear()` also wiped the Supabase
        // auth session. The account is already deleted, so the session is
        // dead anyway; the cache keys are cleared explicitly instead.
        for (const key of [
          'careerpilot_profile',
          'careerpilot_target_role',
          'careerpilot_skills',
          'careerpilot_settings',
          'careerpilot_ai_preferences',
          'careerpilot_notification_preferences',
          'careerpilot_privacy_preferences',
        ]) {
          localStorage.removeItem(key);
        }
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        setDeleteError(
          typeof data?.error === 'string' ? data.error : 'Failed to delete account'
        );
      }
    } catch (e) {
      console.error(e);
      setDeleteError('Network error while deleting the account. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUsernameChange = (value: string) => {
    const clean = value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30);
    setUsernameInput(clean);
    setUsernameStatus(null);
    setUsernameSaved(false);
  };

  const handleSaveUsername = async () => {
    if (usernameSaving) return;
    setUsernameStatus(null);
    setUsernameSaved(false);
    if (usernameInput.length < 3) {
      setUsernameStatus({ available: false, text: 'Username must be at least 3 characters' });
      return;
    }
    if (usernameInput === profile.username) {
      setUsernameStatus({ available: true, text: 'This is already your username' });
      return;
    }
    setUsernameSaving(true);
    try {
      const res = await validateUsername(usernameInput);
      setUsernameStatus({ available: res.available, text: res.message });
      if (!res.available) return;
      await updateProfile({ username: usernameInput });
      setUsernameSaved(true);
    } catch (error) {
      console.error('Failed to save username:', error);
      setUsernameStatus({
        available: false,
        text: 'Could not save the username. Please try again.',
      });
    } finally {
      setUsernameSaving(false);
    }
  };

  const handlePublicToggle = async (checked: boolean) => {
    setPublicError(null);
    setPublicSaving(true);
    try {
      await updateProfile({ isPublic: checked });
    } catch (error) {
      console.error('Failed to update public profile visibility:', error);
      setPublicError('Could not update the public profile setting. Please try again.');
    } finally {
      setPublicSaving(false);
    }
  };

  return (
    <Reveal className="space-y-6 max-w-5xl">
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
          <Download className="w-3.5 h-3.5 text-[var(--color-primary-text)]" />
          <span>Export All Career Data</span>
        </button>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border-subtle)] pb-2 text-xs font-semibold">
        {[
          { id: 'account', label: 'Account', icon: User },
          { id: 'security', label: 'Security', icon: Shield },
          { id: 'privacy', label: 'Privacy Center', icon: Lock },
          { id: 'ai', label: 'AI Preferences', icon: Sparkles },
          { id: 'notifications', label: 'Notifications', icon: Bell },
          { id: 'interface', label: 'Localization & Theme', icon: Globe },
          { id: 'about', label: 'About & Developer', icon: Info },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                isActive
                  ? 'bg-[var(--accent-surface)] text-[var(--color-primary-text)] shadow-2xs'
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
                <p className="font-semibold text-[var(--color-success-strong)] flex items-center gap-1">
                  <span>● Active Authenticated</span>
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Member Since</span>
                <p className="font-mono text-[var(--text-primary)]">{memberSince || 'Not available'}</p>
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
                <Mail className="w-3.5 h-3.5 text-[var(--color-primary-text)]" />
                <span>Change Email</span>
              </button>

              <button
                onClick={() => setChangePasswordOpen(true)}
                className="px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5"
              >
                <Key className="w-3.5 h-3.5 text-[var(--color-primary-text)]" />
                <span>Change Password</span>
              </button>
            </div>
          </div>

          {/* Danger Zone: Account Deletion */}
          <div className="p-6 rounded-2xl bg-[var(--color-danger)]/5 border border-[var(--color-danger)]/20 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-[var(--color-danger)] flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>Danger Zone — Delete Account</span>
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Permanently deletes your account, personal career profile, active roadmap tasks, project evidence, CV studio versions, and application pipeline history. This action cannot be undone.
              </p>
            </div>

            <button
              onClick={() => setDeleteAccountOpen(true)}
              className="px-4 py-2 rounded-xl bg-[var(--color-danger)] hover:bg-[var(--color-danger-hover)] text-[var(--color-on-primary)] text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Account & Career Graph</span>
            </button>
            {deleteError && (
              <p role="alert" className="text-xs text-[var(--color-danger)]">
                {deleteError}
              </p>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SECURITY */}
      {activeTab === 'security' && (
        <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-6 shadow-xs">
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              Security & Active Session
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Review the current authenticated session and how credentials are handled.
            </p>
          </div>

          <div className="space-y-3">
            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[var(--color-success-surface)] text-[var(--color-success-strong)] flex items-center justify-center">
                  <Laptop className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[var(--text-primary)]">Current Active Session</div>
                  <div className="text-[11px] text-[var(--text-muted)] font-mono">
                    Supabase session • {getClientLabel()}
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-bold text-[var(--color-success-strong)] font-mono bg-[var(--color-success-surface)] px-2 py-0.5 rounded-full">
                Online Now
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] space-y-2 text-xs">
            <span className="font-bold text-[var(--text-primary)] block">Authentication Protocols</span>
            <p className="text-[var(--text-secondary)] leading-relaxed">
              Credentials are handled by Supabase Auth; the application never stores a raw
              password. Deployments must be served over HTTPS so session tokens are encrypted
              in transit.
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
            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] flex items-center justify-between gap-4">
              <div>
                <span className="font-bold text-[var(--text-primary)] block">Public Career Profile</span>
                <p className="text-[var(--text-secondary)] mt-0.5">
                  Share a read-only resume view at /#/profile/{profile.username || 'username'}.
                  Private notes, applications and interview sessions are never exposed.
                </p>
                {!profile.username && (
                  <p className="text-[11px] text-[var(--color-warning)] mt-1">
                    Save a username below before enabling the public profile.
                  </p>
                )}
                {publicError && (
                  <p role="alert" className="text-[11px] text-[var(--color-danger)] mt-1">
                    {publicError}
                  </p>
                )}
              </div>
              <input
                type="checkbox"
                checked={profile.isPublic}
                onChange={(e) => void handlePublicToggle(e.target.checked)}
                disabled={publicSaving || !profile.username}
                aria-label="Enable public career profile"
                className="w-4 h-4 accent-[var(--accent-primary)] rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Public username configuration */}
            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] space-y-2">
              <span className="font-bold text-[var(--text-primary)] block">Professional Username Handle</span>
              <div className="flex items-center gap-2 max-w-md">
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  maxLength={30}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleSaveUsername();
                    }
                  }}
                  aria-label="Professional username handle"
                  className="flex-1 px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono"
                />
                <button
                  type="button"
                  onClick={() => void handleSaveUsername()}
                  disabled={
                    usernameSaving ||
                    usernameInput.length < 3 ||
                    usernameInput === profile.username
                  }
                  className="px-3 py-2 rounded-lg bg-[var(--accent-primary)] text-[var(--color-on-primary)] text-xs font-semibold hover:bg-[var(--accent-secondary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {usernameSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
              {usernameStatus && (
                <p className={`text-[11px] ${usernameStatus.available ? 'text-[var(--color-success-strong)]' : 'text-[var(--color-warning)]'}`}>
                  {usernameStatus.text}
                </p>
              )}
              {usernameSaved && (
                <p className="text-[11px] text-[var(--color-success-strong)]">Username saved.</p>
              )}
              <p className="text-[11px] text-[var(--text-muted)]">
                Use 3–30 lowercase letters, numbers, hyphens or underscores. The public profile link is
                /#/profile/{profile.username || 'username'}.
              </p>
            </div>

            {/* AI Personalization */}
            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] flex items-center justify-between">
              <div>
                <span className="font-bold text-[var(--text-primary)] block">Career Graph AI Grounding</span>
                <p className="text-[var(--text-secondary)] mt-0.5">
                  Allows Gemini to analyze your roadmap gaps and project deliverables when you
                  start an AI action. When off, AI buttons that need this context are disabled.
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
              These preferences are stored in this browser and control which AI actions you can
              start. AI requests are never sent in the background.
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
                        ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)] border-[var(--accent-primary)]'
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
              Choose which notification types appear in your Notifications drawer. These
              preferences are stored in this browser; scheduled email delivery is not enabled in
              this release.
            </p>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] flex items-center justify-between">
              <div>
                <span className="font-bold text-[var(--text-primary)]">In-app Notifications</span>
                <p className="text-[var(--text-secondary)]">Master switch for the Notifications drawer.</p>
              </div>
              <input
                type="checkbox"
                checked={notificationPreferences.inAppNotifications}
                onChange={(e) => updateNotificationPreferences({ inAppNotifications: e.target.checked })}
                className="w-4 h-4 accent-[var(--accent-primary)] rounded cursor-pointer"
              />
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] flex items-center justify-between">
              <div>
                <span className="font-bold text-[var(--text-primary)]">Interview Updates</span>
                <p className="text-[var(--text-secondary)]">Show interview-related notifications in the drawer.</p>
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
                <span className="font-bold text-[var(--text-primary)]">Application Pipeline Updates</span>
                <p className="text-[var(--text-secondary)]">Show application-stage notifications in the drawer.</p>
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
                <span className="font-bold text-[var(--text-primary)]">Roadmap Updates</span>
                <p className="text-[var(--text-secondary)]">Show roadmap and milestone notifications in the drawer.</p>
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
                <Globe className="w-3.5 h-3.5 text-[var(--color-primary-text)]" />
                <span>Language & Direction</span>
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => updateSettings({ language: 'en' })}
                  className={`flex-1 py-2.5 rounded-xl font-semibold border transition-all ${
                    settings.language === 'en'
                      ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)] border-[var(--accent-primary)]'
                      : 'bg-[var(--surface-secondary)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                  }`}
                >
                  English (LTR)
                </button>
                <button
                  onClick={() => updateSettings({ language: 'ar' })}
                  className={`flex-1 py-2.5 rounded-xl font-semibold border transition-all ${
                    settings.language === 'ar'
                      ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)] border-[var(--accent-primary)]'
                      : 'bg-[var(--surface-secondary)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                  }`}
                >
                  العربية (RTL)
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                {settings.theme === 'dark' ? <Moon className="w-3.5 h-3.5 text-[var(--color-primary-text)]" /> : <Sun className="w-3.5 h-3.5 text-[var(--color-primary-text)]" />}
                <span>Display Theme</span>
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => updateSettings({ theme: 'light' })}
                  className={`flex-1 py-2.5 rounded-xl font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                    settings.theme === 'light'
                      ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)] border-[var(--accent-primary)]'
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
                      ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)] border-[var(--accent-primary)]'
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

      {/* TAB 7: ABOUT & DEVELOPER */}
      {activeTab === 'about' && (
        <div className="space-y-6">
          {/* Platform Overview */}
          <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-3 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">
                  CareerPilot AI
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Your Personal Career Operating System: goals, skills, roadmaps, learning, projects, evidence, CVs, job applications, and interview practice in one unified workspace.
                </p>
              </div>
              <span className="self-start sm:self-auto shrink-0 px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold bg-[var(--accent-surface)] text-[var(--color-primary-text)] border border-[var(--border-subtle)]">
                v1.0.0 GA
              </span>
            </div>
          </div>

          {/* Developer Information Card */}
          <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-6 shadow-xs">
            <div className="border-b border-[var(--border-subtle)] pb-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Developed by
              </div>
              <h3 className="text-xl font-bold text-[var(--text-primary)] mt-1">
                Ahmed Ebrahim
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Software Engineer & Creator of CareerPilot AI
              </p>
            </div>

            {/* Contact Information */}
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Contact
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <a
                  href="mailto:ahmedghannam801@gmail.com"
                  className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 hover:bg-[var(--surface-secondary)] hover:border-[var(--color-primary-text)]/30 transition-all flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-[var(--surface-main)] text-[var(--color-primary-text)] border border-[var(--border-subtle)]">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--text-primary)]">Email</div>
                      <div className="text-[11px] text-[var(--text-secondary)] truncate">
                        ahmedghannam801@gmail.com
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors shrink-0" />
                </a>

                <a
                  href="tel:+201027053876"
                  className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 hover:bg-[var(--surface-secondary)] hover:border-[var(--color-primary-text)]/30 transition-all flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-[var(--surface-main)] text-[var(--color-primary-text)] border border-[var(--border-subtle)]">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--text-primary)]">Phone</div>
                      <div className="text-[11px] text-[var(--text-secondary)] truncate font-mono">
                        +201027053876
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors shrink-0" />
                </a>
              </div>
            </div>

            {/* Profiles */}
            <div className="space-y-3 pt-2">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Profiles
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <a
                  href="https://www.linkedin.com/in/ahmed-ebrahim2"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 hover:bg-[var(--surface-secondary)] hover:border-[#0A66C2]/40 transition-all flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-[var(--surface-main)] text-[#0A66C2] border border-[var(--border-subtle)]">
                      <Linkedin className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--text-primary)]">LinkedIn</div>
                      <div className="text-[11px] text-[var(--text-secondary)] truncate">
                        ahmed-ebrahim2
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors shrink-0" />
                </a>

                <a
                  href="https://github.com/ahmedghannam801"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 hover:bg-[var(--surface-secondary)] hover:border-[var(--color-primary-text)]/30 transition-all flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-[var(--surface-main)] text-[var(--text-primary)] border border-[var(--border-subtle)]">
                      <Github className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--text-primary)]">GitHub</div>
                      <div className="text-[11px] text-[var(--text-secondary)] truncate">
                        ahmedghannam801
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors shrink-0" />
                </a>
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
                <p className={`text-[11px] font-medium ${passwordMsg.success ? 'text-[var(--color-success-strong)]' : 'text-[var(--color-danger)]'}`}>
                  {passwordMsg.text}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button type="button" onClick={() => setChangePasswordOpen(false)} className="px-3 py-1.5 text-xs text-[var(--text-secondary)]">Cancel</button>
                <button type="submit" className="px-3.5 py-1.5 bg-[var(--accent-primary)] text-[var(--color-on-primary)] rounded-lg text-xs font-semibold hover:bg-[var(--accent-secondary)] hover:shadow-sm transition-[background-color,box-shadow]">Update Password</button>
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
              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">Current Password</label>
                <input
                  type="password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                  autoComplete="current-password"
                  required
                />
              </div>
              {emailMsg && (
                <p className={`text-[11px] font-medium ${emailMsg.success ? 'text-[var(--color-success-strong)]' : 'text-[var(--color-danger)]'}`}>
                  {emailMsg.text}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button type="button" onClick={() => setChangeEmailOpen(false)} className="px-3 py-1.5 text-xs text-[var(--text-secondary)]">Cancel</button>
                <button type="submit" className="px-3.5 py-1.5 bg-[var(--accent-primary)] text-[var(--color-on-primary)] rounded-lg text-xs font-semibold hover:bg-[var(--accent-secondary)] hover:shadow-sm transition-[background-color,box-shadow]">Update Email</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Delete Account Confirmation */}
      {deleteAccountOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-main)] rounded-2xl border border-[var(--color-danger)]/30 shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-2 text-[var(--color-danger)]">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-base font-bold">Permanently Delete Account?</h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              This will irreversibly purge your profile, skills, roadmap milestones, project evidence, applications, and interview data from the persistent server database.
            </p>
            <div className="p-3 rounded-lg bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/20 text-xs text-[var(--color-danger)]">
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
                className="px-4 py-1.5 bg-[var(--color-danger)] hover:bg-[var(--color-danger-hover)] text-[var(--color-on-primary)] rounded-lg text-xs font-semibold disabled:opacity-40 transition-colors"
              >
                {isDeleting ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Reveal>
  );
};
