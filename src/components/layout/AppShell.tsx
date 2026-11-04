import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { 
  Home, 
  Compass, 
  Layers, 
  Award, 
  BookOpen, 
  FolderGit2, 
  FileText, 
  Briefcase, 
  Calendar, 
  Sparkles, 
  TrendingUp, 
  Settings, 
  Search, 
  Bell, 
  Menu, 
  X, 
  Sun, 
  Moon, 
  Target,
  User,
  Activity,
  FolderClosed,
  MoreHorizontal,
  LogOut,
  HeartHandshake,
  GraduationCap,
  ShieldCheck
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { AiLanguageSelector } from '../ui/AiLanguageSelector';
import { Logo } from '../brand/Logo';
import { backdropVariants, drawerLeftVariants, drawerVariants } from '../../lib/motion';
import { useRouteParam } from '../../lib/useRouteParams';
import { CareerPilotAvatar } from '../ui/CareerPilotAvatars';
import { useAdminAccess } from '../../lib/useAdminAccess';

const GlobalSearchModal = lazy(() =>
  import('./GlobalSearchModal').then((module) => ({ default: module.GlobalSearchModal }))
);
const CopilotDrawer = lazy(() =>
  import('../copilot/CopilotDrawer').then((module) => ({ default: module.CopilotDrawer }))
);
const NotificationsDrawer = lazy(() =>
  import('../notifications/NotificationsDrawer').then((module) => ({ default: module.NotificationsDrawer }))
);

const OverlayChunkFallback: React.FC<{ label: string }> = ({ label }) => (
  <div
    className="pointer-events-none fixed inset-0 z-[100] flex items-start justify-center p-6"
    role="status"
    aria-live="polite"
  >
    <span className="rounded-lg bg-[var(--surface-main)] px-3 py-2 text-xs text-[var(--text-secondary)] shadow-lg">
      {label}
    </span>
  </div>
);

interface AppShellProps {
  currentView: string;
  onNavigate: (view: string) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ currentView, onNavigate, children }) => {
  const { profile, targetRole, settings, updateSettings, visibleNotifications, currentUser, logout, t, copilotOpen, setCopilotOpen } = useCareer();
  // The Admin Center entry is only offered to a verified administrator. The
  // server still re-checks every admin action; this is a navigation hint.
  const { admin } = useAdminAccess();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  // B.4 finding C-3: `logout()` existed in the context but had no UI
  // trigger, so a signed-in user could never sign out.
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const reduced = useReducedMotion() ?? false;

  // The copilot is a panel over the page, but the URL names it: a refresh
  // reopens it on the page it was opened over, rather than on a bare
  // dashboard.
  const [copilotParam, setCopilotParam] = useRouteParam<'1' | ''>('copilot', ['1'], '');

  useEffect(() => {
    if (copilotParam === '1' && !copilotOpen) setCopilotOpen(true);
  }, [copilotParam, copilotOpen, setCopilotOpen]);

  const openCopilot = useCallback(() => {
    setCopilotOpen(true);
    setCopilotParam('1');
  }, [setCopilotOpen, setCopilotParam]);

  const closeCopilot = useCallback(() => {
    setCopilotOpen(false);
    setCopilotParam('');
  }, [setCopilotOpen, setCopilotParam]);

  const unreadCount = visibleNotifications.filter(n => !n.read).length;

  const displayName = currentUser?.name || profile.name || t('Signed in');

  // Global Ctrl/Cmd + K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchModalOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Navigation is grouped into five destinations rather than two long
  // lists. Every existing route is still reachable; the grouping only says
  // what kind of thing it is.
  const navGroups = [
    {
      id: 'home',
      label: t('Home'),
      items: [{ id: 'dashboard', label: t('navHome'), icon: Home }],
    },
    {
      id: 'career',
      label: t('Career'),
      items: [
        { id: 'my-career', label: t('navMyCareer'), icon: Compass },
        { id: 'roadmap', label: t('navRoadmap'), icon: Layers },
        { id: 'skills', label: t('navSkills'), icon: Award },
        { id: 'progress', label: t('navProgress'), icon: TrendingUp },
      ],
    },
    {
      id: 'learn',
      label: t('Learn'),
      items: [
        { id: 'learning', label: t('navLearn'), icon: BookOpen },
        { id: 'projects', label: t('navProjects'), icon: FolderGit2 },
        { id: 'volunteer', label: t('navOpportunities'), icon: HeartHandshake },
      ],
    },
    {
      id: 'tools',
      label: t('Career Tools'),
      items: [
        { id: 'cv-studio', label: t('navCV'), icon: FileText },
        { id: 'jobs', label: t('navJobs'), icon: GraduationCap },
        { id: 'applications', label: t('navApplications'), icon: Calendar },
        { id: 'interviews', label: t('navInterviews'), icon: Target },
        { id: 'documents', label: t('My Documents'), icon: FolderClosed },
      ],
    },
    {
      id: 'profile',
      label: t('Profile'),
      items: [
        { id: 'profile', label: t('My Profile'), icon: User },
        { id: 'activity', label: t('Recent Activity'), icon: Activity },
        { id: 'settings', label: t('navSettings'), icon: Settings },
      ],
    },
  ];

  if (admin && admin.status === 'active') {
    navGroups.push({
      id: 'administration',
      label: t('Administration'),
      items: [{ id: 'admin', label: t('Admin Center'), icon: ShieldCheck }],
    });
  }

  const allNavItems = navGroups.flatMap((group) => group.items);
  const handleNavClick = (viewId: string) => {
    onNavigate(viewId);
    setMobileMenuOpen(false);
  };

  // The breadcrumb shows the name of the current page rather than its route
  // id, so a phone shows a word that fits instead of "cv-studio".
  const currentViewLabel =
    allNavItems.find((item) => item.id === currentView)?.label ??
    currentView
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

  // The language and the theme are one control each, used both in the header
  // and in the mobile drawer, so a phone is not asked to fit them in a bar
  // that is 320 pixels wide.
  const languageToggle = (
    <button
      type="button"
      onClick={() => updateSettings({ language: settings.language === 'en' ? 'ar' : 'en' })}
      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
      title={t('Toggle English / Arabic (RTL)')}
    >
      {settings.language === 'en' ? 'عربي' : 'EN'}
    </button>
  );

  const themeToggle = (
    <button
      type="button"
      onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
      title={t('Toggle Theme')}
      aria-label={t('Toggle Theme')}
    >
      {settings.theme === 'dark' ? <Sun className="w-4 h-4 text-[var(--color-accent)]" /> : <Moon className="w-4 h-4" />}
    </button>
  );

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)] flex flex-col md:flex-row">
      {/* Skip to content. A keyboard user reaching the navigation first has
          to be able to jump past it to the page they asked for. The link is
          off-screen until it takes focus, so it never disturbs the layout. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-[var(--color-primary)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--color-on-primary)] focus:shadow-lg"
      >
        {t('Skip to content')}
      </a>
      {/* Desktop Sidebar Rail */}
      <aside className="hidden md:flex flex-col w-64 bg-[var(--surface-main)] border-e border-[var(--border-subtle)] shrink-0 sticky top-0 h-screen select-none">
        {/* Brand Header */}
        <div className="p-5 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <button 
            onClick={() => handleNavClick('dashboard')}
            className="flex items-center gap-2.5 text-start group"
          >
            <Logo variant="icon" className="h-8 w-8" alt="" />
            <div>
              <div className="font-bold text-sm tracking-tight text-[var(--text-primary)]">
                {t('CareerDev4AI')}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] font-mono truncate max-w-[140px]">
                {targetRole.title}
              </div>
            </div>
          </button>
        </div>

        {/* Navigation Links Scroll Container */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          {navGroups.map((group, groupIndex) => (
            <div
              key={group.id}
              className={`space-y-1 ${groupIndex > 0 ? 'pt-2 border-t border-[var(--border-subtle)]' : ''}`}
            >
              <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                {group.label}
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-[var(--accent-surface)] text-[var(--color-primary-text)] font-semibold shadow-2xs'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[var(--color-primary-text)]' : 'text-[var(--text-muted)]'}`} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Sidebar Footer: Copilot Quick Launch & Profile Widget */}
        <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 space-y-2">
          <button
            onClick={openCopilot}
            className="w-full py-2.5 px-3 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('askCopilot')}</span>
          </button>

          {/* User mini profile card in sidebar */}
          <button
            onClick={() => handleNavClick('profile')}
            className="w-full p-2 rounded-xl hover:bg-[var(--surface-secondary)] flex items-center justify-between text-start transition-colors group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <CareerPilotAvatar
                avatarId={profile.avatarUrl}
                className="w-7 h-7 rounded-lg border border-[var(--border-subtle)]"
              />
              <div className="min-w-0">
                <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                  {profile.name}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] truncate">
                  @{profile.username || 'user'}
                </div>
              </div>
            </div>
            <span className="text-[10px] font-mono text-[var(--color-success-strong)] font-bold shrink-0">
              ●
            </span>
          </button>
        </div>
      </aside>

      {/* Main Content Area & Top Bar */}
      <div className="flex-1 flex flex-col min-w-0 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-0">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 bg-[var(--surface-main)]/90 backdrop-blur-md border-b border-[var(--border-subtle)] px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
              title={t('Open Navigation')}
              aria-label={t('Open Navigation')}
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Quick Breadcrumb Trail */}
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <button 
                onClick={() => onNavigate('dashboard')} 
                className="hidden shrink-0 font-medium hover:text-[var(--text-primary)] sm:inline"
              >
                {t('CareerDev4AI')}
              </button>
              <span className="hidden shrink-0 text-[var(--text-muted)] sm:inline">/</span>
              <span className="truncate font-semibold text-[var(--text-primary)]">
                {currentViewLabel}
              </span>
            </div>
          </div>

          {/* Top Actions: Search / Command, Language, Theme, Notifications, Profile */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setSearchModalOpen(true)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] sm:hidden"
              title={t('Search and Command Palette (Ctrl/Cmd + K)')}
              aria-label={t('Search and Command Palette (Ctrl/Cmd + K)')}
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSearchModalOpen(true)}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs transition-colors"
              title={t('Search and Command Palette (Ctrl/Cmd + K)')}
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">{t('Search / Actions...')}</span>
              <span className="hidden lg:inline font-mono text-[10px] bg-[var(--surface-main)] px-1 rounded border border-[var(--border-subtle)]">⌘K</span>
            </button>

            {/* Language & theme stay in the header from tablet width; phones use the drawer. */}
            <div className="hidden items-center gap-2 md:flex">
              <AiLanguageSelector />
              {languageToggle}
              {themeToggle}
            </div>

            {/* Notifications */}
            <button
              onClick={() => setNotificationsOpen(true)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] relative"
              title={t('Notifications')}
              aria-label={t('Notifications')}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-2 end-2 w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-pulse" />
              )}
            </button>

            {/* Profile Avatar Button */}
            <button
              onClick={() => onNavigate('profile')}
              className="hidden sm:flex items-center gap-2 ps-2 border-s border-[var(--border-subtle)] group"
              title={t('View My Profile')}
            >
              <CareerPilotAvatar
                avatarId={profile.avatarUrl}
                className="w-7 h-7 rounded-full border border-[var(--border-subtle)] group-hover:border-[var(--accent-primary)] transition-colors"
              />
              <span className="hidden lg:inline text-xs font-medium text-[var(--text-primary)]">
                {displayName.split(' ')[0]}
              </span>
            </button>

            {/* Account menu — the sign-out control (B.4 finding C-3). */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(prev => !prev)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
                title={t('Account menu')}
                aria-label={t('Account menu')}
                aria-expanded={userMenuOpen}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {userMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setUserMenuOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="absolute end-0 top-full z-50 mt-2 w-60 max-w-[calc(100vw-1.5rem)] rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
                      <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                        {currentUser?.email || displayName}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] truncate">
                        @{profile.username || t('no username set')}
                      </div>
                    </div>
                    <button
                      onClick={() => { setUserMenuOpen(false); onNavigate('profile'); }}
                      className="w-full px-4 py-2.5 text-start text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)] flex items-center gap-2"
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>{t('My Profile')}</span>
                    </button>
                    <button
                      onClick={() => { setUserMenuOpen(false); onNavigate('settings'); }}
                      className="w-full px-4 py-2.5 text-start text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)] flex items-center gap-2"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>{t('Settings')}</span>
                    </button>
                    <button
                      onClick={() => { setUserMenuOpen(false); logout(); }}
                      className="w-full px-4 py-2.5 text-start text-xs font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 flex items-center gap-2 border-t border-[var(--border-subtle)]"
                      data-testid="logout-button"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>{t('Sign out')}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* View Content Viewport */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 w-full min-w-0 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8"
        >
          {children}
        </main>

        {/* Global Authenticated Shell Footer */}
        <footer className="mt-auto border-t border-[var(--border-subtle)] px-4 sm:px-8 py-3 text-xs text-[var(--text-muted)]">
          <div className="flex flex-col sm:flex-row items-center justify-between max-w-7xl mx-auto gap-2">
            <span>© 2026 CareerDev4AI</span>
            <span>
              {t('Developed by')}{' '}
              <a
                href="https://www.linkedin.com/in/ahmed-ebrahim2"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline transition-colors"
              >
                {t('Ahmed Ebrahim')}
              </a>
            </span>
          </div>
        </footer>
      </div>

      {/* Mobile Drawer Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <motion.div
              aria-hidden="true"
              className="absolute inset-0 bg-black/50 backdrop-blur-xs"
              variants={backdropVariants(reduced)}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={t('Navigation')}
              className="relative flex h-full w-[86vw] max-w-xs flex-col border-e border-[var(--border-subtle)] bg-[var(--surface-main)] shadow-2xl"
              variants={settings.language === 'ar' ? drawerVariants(reduced) : drawerLeftVariants(reduced)}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <Logo variant="icon" className="h-7 w-7" alt="" />
                <span className="font-bold text-sm text-[var(--text-primary)]">{t('CareerDev4AI')}</span>
              </div>
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
                aria-label={t('Close Navigation')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

              <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-4">
                {navGroups.map((group, groupIndex) => (
                  <div
                    key={group.id}
                    className={groupIndex > 0 ? 'border-t border-[var(--border-subtle)] pt-3' : ''}
                  >
                    <div className="px-2 text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">
                      {group.label}
                    </div>
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = currentView === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleNavClick(item.id)}
                          aria-current={isActive ? 'page' : undefined}
                          className={`w-full min-h-11 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            isActive
                              ? 'bg-[var(--accent-surface)] text-[var(--color-primary-text)] font-semibold'
                              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'
                          }`}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

            <div className="space-y-2 border-t border-[var(--border-subtle)] px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <div className="flex items-center justify-between gap-2 pb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  {t('Display')}
                </span>
                <div className="flex items-center gap-2">
                  {languageToggle}
                  {themeToggle}
                </div>
              </div>
              <AiLanguageSelector />
              <button
                onClick={() => { openCopilot(); setMobileMenuOpen(false); }}
                className="w-full min-h-11 rounded-xl bg-[var(--accent-primary)] text-[var(--color-on-primary)] text-xs font-semibold flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>{t('askCopilot')}</span>
              </button>
              <button
                onClick={() => { setMobileMenuOpen(false); logout(); }}
                className="w-full min-h-11 rounded-xl border border-[var(--color-danger)]/30 text-[var(--color-danger)] text-xs font-semibold flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>{t('Sign out')}</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label={t('Primary')}
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--surface-main)]/95 backdrop-blur-md border-t border-[var(--border-subtle)] px-1 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] flex items-stretch justify-around text-[10px]"
      >
        {[
          { id: 'dashboard', label: t('Home'), icon: Home },
          { id: 'my-career', label: t('Career'), icon: Compass },
          { id: 'learning', label: t('Learn'), icon: BookOpen },
          { id: 'cv-studio', label: t('Tools'), icon: Briefcase },
          { id: 'profile', label: t('Profile'), icon: User },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 ${
                isActive ? 'text-[var(--color-primary-text)] font-bold' : 'text-[var(--text-muted)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          aria-label={t('Open all navigation')}
        >
          <MoreHorizontal className="w-4 h-4" />
          <span>{t('More')}</span>
        </button>
      </nav>

      {/* Global Modals & Drawers */}
      {searchModalOpen && (
        <Suspense fallback={<OverlayChunkFallback label={t('Loading…')} />}>
          <GlobalSearchModal
            isOpen
            onClose={() => setSearchModalOpen(false)}
            onNavigate={onNavigate}
            onOpenCopilot={openCopilot}
          />
        </Suspense>
      )}

      {copilotOpen && (
        <Suspense fallback={<OverlayChunkFallback label={t('Loading…')} />}>
          <CopilotDrawer
            isOpen
            onClose={closeCopilot}
            onNavigate={onNavigate}
          />
        </Suspense>
      )}

      {notificationsOpen && (
        <Suspense fallback={<OverlayChunkFallback label={t('Loading…')} />}>
          <NotificationsDrawer
            isOpen
            onClose={() => setNotificationsOpen(false)}
            onNavigate={onNavigate}
          />
        </Suspense>
      )}
    </div>
  );
};
