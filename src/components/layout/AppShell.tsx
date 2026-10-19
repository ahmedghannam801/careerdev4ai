import React, { useState, useEffect } from 'react';
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
  ShieldCheck, 
  Target,
  User,
  Activity,
  FolderClosed,
  MoreHorizontal
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { GlobalSearchModal } from './GlobalSearchModal';
import { CopilotDrawer } from '../copilot/CopilotDrawer';
import { NotificationsDrawer } from '../notifications/NotificationsDrawer';

interface AppShellProps {
  currentView: string;
  onNavigate: (view: string) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ currentView, onNavigate, children }) => {
  const { profile, targetRole, settings, updateSettings, notifications, t } = useCareer();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

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
    { id: 'cv-studio', label: t('navCV'), icon: FileText },
    { id: 'jobs', label: t('navJobs'), icon: Briefcase },
    { id: 'applications', label: t('navApplications'), icon: Calendar },
    { id: 'interviews', label: t('navInterviews'), icon: Target },
  ];

  const secondaryNavItems = [
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'documents', label: 'My Documents', icon: FolderClosed },
    { id: 'activity', label: 'Recent Activity', icon: Activity },
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
            className="flex items-center gap-2.5 text-left group"
          >
            <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)] text-white flex items-center justify-center font-bold text-sm shadow-xs group-hover:bg-[var(--accent-secondary)] transition-colors">
              CP
            </div>
            <div>
              <div className="font-bold text-sm tracking-tight text-[var(--text-primary)]">
                CareerPilot AI
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
              Career Engine
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
                      ? 'bg-[var(--accent-surface)] text-[var(--accent-primary)] font-semibold shadow-2xs'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Personal Workspace Navigation */}
          <div className="space-y-1 pt-2 border-t border-[var(--border-subtle)]">
            <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
              Workspace & Identity
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
                      ? 'bg-[var(--accent-surface)] text-[var(--accent-primary)] font-semibold shadow-2xs'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'}`} />
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
            className="w-full py-2.5 px-3 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('askCopilot')}</span>
          </button>

          {/* User mini profile card in sidebar */}
          <button
            onClick={() => handleNavClick('profile')}
            className="w-full p-2 rounded-xl hover:bg-[var(--surface-secondary)] flex items-center justify-between text-left transition-colors group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <img
                src={profile.avatarUrl}
                alt={profile.name}
                className="w-7 h-7 rounded-lg object-cover border border-[var(--border-subtle)]"
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
            <span className="text-[10px] font-mono text-emerald-500 font-bold shrink-0">
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
              title="Open Navigation"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Quick Breadcrumb Trail */}
            <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5 truncate">
              <button 
                onClick={() => onNavigate('dashboard')} 
                className="hover:text-[var(--text-primary)] font-medium"
              >
                CareerPilot
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
              title="Search and Command Palette (Ctrl/Cmd + K)"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Search / Actions...</span>
              <span className="hidden sm:inline font-mono text-[10px] bg-[var(--surface-main)] px-1 rounded border border-[var(--border-subtle)]">⌘K</span>
            </button>

            {/* Language Switcher */}
            <button
              onClick={() => updateSettings({ language: settings.language === 'en' ? 'ar' : 'en' })}
              className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] text-xs font-semibold"
              title="Toggle English / Arabic (RTL)"
            >
              {settings.language === 'en' ? 'عربي' : 'EN'}
            </button>

            {/* Theme Switcher */}
            <button
              onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
              className="p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]"
              title="Toggle Theme"
            >
              {settings.theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Notifications */}
            <button
              onClick={() => setNotificationsOpen(true)}
              className="p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] relative"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-pulse" />
              )}
            </button>

            {/* Profile Avatar Button */}
            <button
              onClick={() => onNavigate('profile')}
              className="flex items-center gap-2 pl-2 border-l border-[var(--border-subtle)] group"
              title="View My Profile"
            >
              <img
                src={profile.avatarUrl}
                alt={profile.name}
                className="w-7 h-7 rounded-full object-cover border border-[var(--border-subtle)] group-hover:border-[var(--accent-primary)] transition-colors"
                referrerPolicy="no-referrer"
              />
              <span className="hidden lg:inline text-xs font-medium text-[var(--text-primary)]">
                {profile.name.split(' ')[0]}
              </span>
            </button>
          </div>
        </header>

        {/* View Content Viewport */}
        <main className="flex-1 p-4 sm:p-8 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden bg-black/50 backdrop-blur-xs flex">
          <div className="w-72 bg-[var(--surface-main)] h-full p-4 flex flex-col justify-between border-r border-[var(--border-subtle)] animate-in slide-in-from-left duration-200">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[var(--accent-primary)] text-white flex items-center justify-center font-bold text-xs">
                    CP
                  </div>
                  <span className="font-bold text-sm text-[var(--text-primary)]">CareerPilot AI</span>
                </div>
                <button 
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-1 overflow-y-auto max-h-[70vh]">
                <div className="px-2 text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1">Career</div>
                {primaryNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-[var(--accent-surface)] text-[var(--accent-primary)] font-semibold'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}

                <div className="px-2 text-[10px] font-bold uppercase text-[var(--text-muted)] mt-3 mb-1">Workspace</div>
                {secondaryNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-[var(--accent-surface)] text-[var(--accent-primary)] font-semibold'
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

            <button
              onClick={() => { setCopilotOpen(true); setMobileMenuOpen(false); }}
              className="w-full py-2.5 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-semibold flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>{t('askCopilot')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--surface-main)]/95 backdrop-blur-md border-t border-[var(--border-subtle)] px-2 py-1.5 flex items-center justify-around text-[10px]">
        {[
          { id: 'dashboard', label: 'Home', icon: Home },
          { id: 'my-career', label: 'Career', icon: Compass },
          { id: 'roadmap', label: 'Roadmap', icon: Layers },
          { id: 'jobs', label: 'Jobs', icon: Briefcase },
          { id: 'profile', label: 'Profile', icon: User },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg ${
                isActive ? 'text-[var(--accent-primary)] font-bold' : 'text-[var(--text-muted)]'
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
          <span>More</span>
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
