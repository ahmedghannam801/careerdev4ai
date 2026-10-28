import React, { useState, useEffect } from 'react';
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
  HeartHandshake
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { GlobalSearchModal } from './GlobalSearchModal';
import { CopilotDrawer } from '../copilot/CopilotDrawer';
import { NotificationsDrawer } from '../notifications/NotificationsDrawer';
import { Logo } from '../brand/Logo';
import { backdropVariants, drawerLeftVariants } from '../../lib/motion';
import { CareerPilotAvatar } from '../ui/CareerPilotAvatars';

interface AppShellProps {
  currentView: string;
  onNavigate: (view: string) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ currentView, onNavigate, children }) => {
  const { profile, targetRole, settings, updateSettings, visibleNotifications, currentUser, logout, t, copilotOpen, setCopilotOpen } = useCareer();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  // B.4 finding C-3: `logout()` existed in the context but had no UI
  // trigger, so a signed-in user could never sign out.
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const reduced = useReducedMotion() ?? false;

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

  const primaryNavItems = [
    { id: 'dashboard', label: t('navHome'), icon: Home },
    { id: 'my-career', label: t('navMyCareer'), icon: Compass },
    { id: 'roadmap', label: t('navRoadmap'), icon: Layers },
    { id: 'skills', label: t('navSkills'), icon: Award },
    { id: 'learning', label: t('navLearn'), icon: BookOpen },
    { id: 'projects', label: t('navProjects'), icon: FolderGit2 },
    { id: 'volunteer', label: t('navVolunteer'), icon: HeartHandshake },
    { id: 'cv-studio', label: t('navCV'), icon: FileText },
    { id: 'jobs', label: t('navJobs'), icon: Briefcase },
    { id: 'applications', label: t('navApplications'), icon: Calendar },
    { id: 'interviews', label: t('navInterviews'), icon: Target },
  ];

  const secondaryNavItems = [
    { id: 'profile', label: t('My Profile'), icon: User },
    { id: 'documents', label: t('My Documents'), icon: FolderClosed },
    { id: 'activity', label: t('Recent Activity'), icon: Activity },
    { id: 'progress', label: t('navProgress'), icon: TrendingUp },
    { id: 'settings', label: t('navSettings'), icon: Settings },
  ];

  const handleNavClick = (viewId: string) => {
    onNavigate(viewId);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)] flex flex-col md:flex-row">
      {/* Desktop Sidebar Rail */}
      <aside className="hidden md:flex flex-col w-64 bg-[var(--surface-main)] border-r border-[var(--border-subtle)] shrink-0 sticky top-0 h-screen select-none">
        {/* Brand Header */}
        <div className="p-5 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <button 
            onClick={() => handleNavClick('dashboard')}
            className="flex items-center gap-2.5 text-start group"
          >
            <Logo variant="icon" className="h-8 w-8" alt="" />
            <div>
              <div className="font-bold text-sm tracking-tight text-[var(--text-primary)]">
                {t('CareerPilot AI')}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] font-mono truncate max-w-[140px]">
                {targetRole.title}
              </div>
            </div>
          </button>
        </div>

        {/* Navigation Links Scroll Container */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          {/* Main Career Navigation */}
          <div className="space-y-1">
            <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
              {t('Career Engine')}
            </div>
            {primaryNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
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

          {/* Personal Workspace Navigation */}
          <div className="space-y-1 pt-2 border-t border-[var(--border-subtle)]">
            <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
              {t('Workspace & Identity')}
            </div>
            {secondaryNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
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
        </div>

        {/* Sidebar Footer: Copilot Quick Launch & Profile Widget */}
        <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 space-y-2">
          <button
            onClick={() => setCopilotOpen(true)}
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
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 bg-[var(--surface-main)]/90 backdrop-blur-md border-b border-[var(--border-subtle)] px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-1.5 md:hidden text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md"
              title={t('Open Navigation')}
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Quick Breadcrumb Trail */}
            <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5 truncate">
              <button 
                onClick={() => onNavigate('dashboard')} 
                className="hover:text-[var(--text-primary)] font-medium"
              >
                {t('CareerPilot')}
              </button>
              <span className="text-[var(--text-muted)]">/</span>
              <span className="font-semibold text-[var(--text-primary)] capitalize">
                {currentView.replace('-', ' ')}
              </span>
            </div>
          </div>

          {/* Top Actions: Search / Command, Language, Theme, Notifications, Profile */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setSearchModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs transition-colors"
              title={t('Search and Command Palette (Ctrl/Cmd + K)')}
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('Search / Actions...')}</span>
              <span className="hidden sm:inline font-mono text-[10px] bg-[var(--surface-main)] px-1 rounded border border-[var(--border-subtle)]">⌘K</span>
            </button>

            {/* Language Switcher */}
            <button
              onClick={() => updateSettings({ language: settings.language === 'en' ? 'ar' : 'en' })}
              className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] text-xs font-semibold"
              title={t('Toggle English / Arabic (RTL)')}
            >
              {settings.language === 'en' ? 'عربي' : 'EN'}
            </button>

            {/* Theme Switcher */}
            <button
              onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
              className="p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]"
              title={t('Toggle Theme')}
            >
              {settings.theme === 'dark' ? <Sun className="w-4 h-4 text-[var(--color-accent)]" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Notifications */}
            <button
              onClick={() => setNotificationsOpen(true)}
              className="p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] relative"
              title={t('Notifications')}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -end-1 w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-pulse" />
              )}
            </button>

            {/* Profile Avatar Button */}
            <button
              onClick={() => onNavigate('profile')}
              className="flex items-center gap-2 ps-2 border-l border-[var(--border-subtle)] group"
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
                className="p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
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
                  <div className="absolute end-0 top-full mt-2 z-50 w-60 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xl overflow-hidden">
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
        <main className="flex-1 p-4 sm:p-8 max-w-7xl mx-auto w-full">
          {children}
        </main>

        {/* Global Authenticated Shell Footer */}
        <footer className="mt-auto border-t border-[var(--border-subtle)] px-4 sm:px-8 py-3 text-xs text-[var(--text-muted)]">
          <div className="flex flex-col sm:flex-row items-center justify-between max-w-7xl mx-auto gap-2">
            <span>© 2026 CareerPilot AI</span>
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
              aria-label={t('Navigation')}
              className="relative flex h-full w-72 flex-col justify-between border-r border-[var(--border-subtle)] bg-[var(--surface-main)] p-4"
              variants={drawerLeftVariants(reduced)}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <Logo variant="icon" className="h-7 w-7" alt="" />
                  <span className="font-bold text-sm text-[var(--text-primary)]">{t('CareerPilot AI')}</span>
                </div>
                <button 
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-1 overflow-y-auto max-h-[70vh]">
                <div className="px-2 text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">{t('Career')}</div>
                {primaryNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-[var(--accent-surface)] text-[var(--color-primary-text)] font-semibold'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}

                <div className="px-2 text-[10px] font-bold uppercase text-[var(--text-muted)] mt-3 mb-1">{t('Workspace')}</div>
                {secondaryNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-[var(--accent-surface)] text-[var(--color-primary-text)] font-semibold'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => { setCopilotOpen(true); setMobileMenuOpen(false); }}
                className="w-full py-2.5 rounded-xl bg-[var(--accent-primary)] text-[var(--color-on-primary)] text-xs font-semibold flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>{t('askCopilot')}</span>
              </button>
              <button
                onClick={() => { setMobileMenuOpen(false); logout(); }}
                className="w-full py-2.5 rounded-xl border border-[var(--color-danger)]/30 text-[var(--color-danger)] text-xs font-semibold flex items-center justify-center gap-2"
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
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--surface-main)]/95 backdrop-blur-md border-t border-[var(--border-subtle)] px-2 py-1.5 flex items-center justify-around text-[10px]">
        {[
          { id: 'dashboard', label: t('Home'), icon: Home },
          { id: 'my-career', label: t('Career'), icon: Compass },
          { id: 'roadmap', label: t('Roadmap'), icon: Layers },
          { id: 'jobs', label: t('Jobs'), icon: Briefcase },
          { id: 'profile', label: t('Profile'), icon: User },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg ${
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
          className="flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <MoreHorizontal className="w-4 h-4" />
          <span>{t('More')}</span>
        </button>
      </div>

      {/* Global Modals & Drawers */}
      <GlobalSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onNavigate={onNavigate}
        onOpenCopilot={() => setCopilotOpen(true)}
      />

      <CopilotDrawer
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        onNavigate={onNavigate}
      />

      <NotificationsDrawer
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onNavigate={onNavigate}
      />
    </div>
  );
};
