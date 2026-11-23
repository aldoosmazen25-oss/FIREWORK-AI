import React, { useState } from 'react';
import {
  Bell,
  Bookmark,
  Briefcase,
  Calendar,
  CheckSquare,
  Compass,
  FolderKanban,
  Globe,
  Home,
  Layers,
  Menu,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Shield,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { PageId } from '../types/app';
import { FireworkLogo, LensSymbol } from './BrandIcons';
import { LensPanel } from './LensPanel';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const {
    profile,
    firebaseUser,
    activePage,
    setActivePage,
    sidebarCollapsed,
    setSidebarCollapsed,
    setCommandOpen,
    setAuthModalOpen,
    lensDrawerOpen,
    setLensDrawerOpen,
    resolvedTheme,
    setTheme,
    language,
    setLanguage,
    unreadNotifications,
    switchMode,
    t,
    toasts,
    dismissToast,
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: Array<{ id: PageId; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'home', label: t.nav.home, icon: <Home className="h-4 w-4" /> },
    { id: 'workspace', label: t.nav.workspace, icon: <FolderKanban className="h-4 w-4" /> },
    { id: 'discover-projects', label: t.nav.discoverProjects, icon: <Compass className="h-4 w-4" /> },
    { id: 'find-freelancers', label: t.nav.findFreelancers, icon: <Users className="h-4 w-4" /> },
    { id: 'my-projects', label: t.nav.myProjects, icon: <Briefcase className="h-4 w-4" /> },
    { id: 'messages', label: t.nav.messages, icon: <MessageSquare className="h-4 w-4" /> },
    { id: 'tasks', label: t.nav.tasks, icon: <CheckSquare className="h-4 w-4" /> },
    { id: 'calendar', label: t.nav.calendar, icon: <Calendar className="h-4 w-4" /> },
    { id: 'saved', label: t.nav.saved, icon: <Bookmark className="h-4 w-4" /> },
    { id: 'lens', label: t.nav.lens, icon: <LensSymbol className="h-4 w-4" /> },
    { id: 'integrations', label: t.nav.integrations, icon: <Layers className="h-4 w-4" /> },
    {
      id: 'notifications',
      label: t.nav.notifications,
      icon: <Bell className="h-4 w-4" />,
      badge: unreadNotifications > 0 ? unreadNotifications : undefined,
    },
    { id: 'settings', label: t.nav.settings, icon: <Settings className="h-4 w-4" /> },
  ];

  if (profile?.role === 'admin') {
    navItems.push({
      id: 'admin',
      label: t.nav.admin,
      icon: <Shield className="h-4 w-4" />,
    });
  }

  const currentTitle = navItems.find((i) => i.id === activePage)?.label ?? t.brand;
  const isSleep = profile?.mode === 'sleep';

  const navigate = (id: PageId) => {
    setActivePage(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="flex min-h-screen w-full bg-[#F5F6F8] dark:bg-[#101116] text-[#171820] dark:text-[#F2F3F7]">
      {/* Desktop macOS Liquid Glass Sidebar */}
      <aside
        aria-label="Primary navigation"
        className={`glass-surface hidden md:flex flex-col shrink-0 border-e border-black/8 dark:border-white/8 sticky top-0 h-screen transition-[width] duration-200 ${
          sidebarCollapsed ? 'w-[72px]' : 'w-[248px]'
        }`}
      >
        <div className="flex h-14 items-center justify-between px-4 border-b border-black/6 dark:border-white/6">
          <button
            type="button"
            onClick={() => navigate('home')}
            className="flex items-center gap-2.5 min-w-0 text-start"
          >
            <FireworkLogo className="h-7 w-7 shrink-0" />
            {!sidebarCollapsed && (
              <span className="font-display text-sm font-semibold tracking-tight whitespace-nowrap truncate">
                {t.brand}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="rounded-lg p-1.5 text-[#777987] hover:bg-black/5 dark:hover:bg-white/8 shrink-0"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5">
          {navItems.map((item) => {
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#7657E8] text-white font-medium'
                    : 'text-[#4B4D5A] dark:text-[#B4B7C5] hover:bg-black/5 dark:hover:bg-white/7 hover:text-[#171820] dark:hover:text-white'
                } ${sidebarCollapsed ? 'justify-center px-0' : 'justify-between'}`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className="shrink-0">{item.icon}</span>
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                </span>
                {!sidebarCollapsed && item.badge !== undefined && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      active ? 'text-white/90' : 'text-[#7657E8]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Persistent Work / Sleep Mode Switch in Sidebar */}
        <div className="border-t border-black/6 dark:border-white/6 p-3">
          {sidebarCollapsed ? (
            <button
              type="button"
              onClick={() => switchMode(isSleep ? 'work' : 'sleep')}
              aria-label={isSleep ? t.modes.switchToWork : t.modes.switchToSleep}
              title={isSleep ? t.modes.sleep : t.modes.work}
              className={`flex h-10 w-full items-center justify-center rounded-xl text-xs font-medium transition-colors ${
                isSleep
                  ? 'bg-[#E6AE53]/15 text-[#b57c1c] dark:text-[#E6AE53]'
                  : 'bg-[#39B982]/14 text-[#238c5e] dark:text-[#39B982]'
              }`}
            >
              {isSleep ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[#171820] dark:text-[#F2F3F7]">
                  {isSleep ? t.modes.sleep : t.modes.work}
                </span>
                <span className={isSleep ? 'text-[#E6AE53]' : 'text-[#39B982]'}>
                  {isSleep
                    ? language === 'ar'
                      ? 'متوقف'
                      : 'Paused'
                    : language === 'ar'
                      ? 'نشط'
                      : 'Active'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/5 dark:bg-white/6 p-1">
                <button
                  type="button"
                  onClick={() => switchMode('work')}
                  className={`rounded-md py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    !isSleep
                      ? 'bg-white dark:bg-[#1A1C24] text-[#171820] dark:text-white shadow-xs'
                      : 'text-[#777987]'
                  }`}
                >
                  {language === 'ar' ? 'العمل' : 'Work'}
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('sleep')}
                  className={`rounded-md py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    isSleep
                      ? 'bg-white dark:bg-[#1A1C24] text-[#171820] dark:text-white shadow-xs'
                      : 'text-[#777987]'
                  }`}
                >
                  {language === 'ar' ? 'السكون' : 'Sleep'}
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Navigation Bar (Single-Row Liquid Glass) */}
        <header className="glass-surface sticky top-0 z-30 flex h-14 items-center justify-between gap-2 sm:gap-4 border-b border-black/8 dark:border-white/8 px-3 sm:px-4 lg:px-6">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg p-2 text-[#777987] hover:bg-black/5 dark:hover:bg-white/8 md:hidden shrink-0"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="font-display text-base font-semibold tracking-tight whitespace-nowrap truncate">
              {currentTitle}
            </h1>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              aria-label="Open global search and command center"
              className="hidden sm:inline-flex items-center gap-3 rounded-xl border border-black/8 dark:border-white/10 bg-white/80 dark:bg-[#101116]/70 px-3 py-1.5 text-xs text-[#777987] hover:border-black/15 dark:hover:border-white/20 transition-colors whitespace-nowrap"
            >
              <Search className="h-3.5 w-3.5" />
              <span>{t.actions.searchPlaceholder}</span>
              <kbd className="font-mono text-[11px] text-[#777987]/80">{t.actions.commandShortcut}</kbd>
            </button>

            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              aria-label="Search"
              className="sm:hidden rounded-lg p-2 text-[#777987] hover:bg-black/5 dark:hover:bg-white/8"
            >
              <Search className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setLensDrawerOpen(!lensDrawerOpen)}
              aria-label="Toggle Lens AI assistant"
              className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                lensDrawerOpen
                  ? 'bg-[#7657E8] text-white'
                  : 'border border-black/8 dark:border-white/10 bg-white/80 dark:bg-[#1A1C24] text-[#171820] dark:text-[#F2F3F7] hover:border-[#7657E8]/40'
              }`}
            >
              <LensSymbol className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.lensAi}</span>
            </button>

            <button
              type="button"
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              aria-label={language === 'en' ? 'Switch to Arabic' : 'Switch to English'}
              className="hidden sm:inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-[#777987] hover:bg-black/5 dark:hover:bg-white/8 hover:text-[#171820] dark:hover:text-white whitespace-nowrap"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>{language === 'en' ? 'AR' : 'EN'}</span>
            </button>

            <button
              type="button"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              aria-label={resolvedTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="hidden sm:inline-flex rounded-lg p-2 text-[#777987] hover:bg-black/5 dark:hover:bg-white/8 hover:text-[#171820] dark:hover:text-white"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate('notifications')}
              aria-label="Open notifications"
              className="hidden sm:inline-flex relative rounded-lg p-2 text-[#777987] hover:bg-black/5 dark:hover:bg-white/8 hover:text-[#171820] dark:hover:text-white"
            >
              <Bell className="h-4 w-4" />
              {unreadNotifications > 0 && (
                <span className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full bg-[#7657E8]" />
              )}
            </button>

            {firebaseUser ? (
              <button
                type="button"
                onClick={() => navigate('settings')}
                aria-label="Open account settings"
                className="flex items-center gap-2 rounded-xl border border-black/8 dark:border-white/10 bg-white/80 dark:bg-[#1A1C24] ps-1.5 pe-2.5 py-1 hover:border-black/15 transition-colors"
              >
                {profile?.photoUrl ? (
                  <img
                    src={profile.photoUrl}
                    alt={profile.fullName}
                    referrerPolicy="no-referrer"
                    className="h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#7657E8] text-xs font-semibold text-white">
                    {(profile?.fullName || firebaseUser.email || 'U').charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="hidden lg:inline max-w-[110px] truncate text-xs font-medium">
                  {profile?.fullName || firebaseUser.email}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="rounded-xl bg-[#7657E8] px-3 sm:px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#6446d6] transition-colors whitespace-nowrap"
              >
                {language === 'ar' ? 'تسجيل الدخول' : 'Sign In'}
              </button>
            )}
          </div>
        </header>

        {/* Main Workspace Viewport */}
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 lg:px-8">
          {children}
        </main>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex md:hidden bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          <div className="glass-popover flex w-72 max-w-[85vw] flex-col h-full p-4">
            <div className="flex items-center justify-between pb-4 border-b border-black/8 dark:border-white/8">
              <div className="flex items-center gap-2.5">
                <FireworkLogo className="h-7 w-7" />
                <span className="font-display text-sm font-semibold">{t.brand}</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="rounded-lg p-1.5 text-[#777987]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-3 space-y-1">
              {navItems.map((item) => {
                const active = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm ${
                      active
                        ? 'bg-[#7657E8] text-white font-medium'
                        : 'text-[#171820] dark:text-[#D5D7E0] hover:bg-black/5 dark:hover:bg-white/8'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      {item.icon}
                      <span>{item.label}</span>
                    </span>
                    {item.badge !== undefined && (
                      <span className="font-mono text-xs tabular-nums">{item.badge}</span>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="border-t border-black/8 dark:border-white/8 pt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-black/10 dark:border-white/12 px-3 py-2 text-xs font-medium"
                >
                  <Globe className="h-3.5 w-3.5" />
                  <span>{language === 'en' ? 'العربية' : 'English'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-black/10 dark:border-white/12 px-3 py-2 text-xs font-medium"
                >
                  {resolvedTheme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                  <span>{resolvedTheme === 'dark' ? t.settings.light : t.settings.dark}</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => switchMode(isSleep ? 'work' : 'sleep')}
                className="w-full rounded-xl border border-black/10 dark:border-white/12 px-3 py-2 text-xs font-medium"
              >
                {isSleep ? t.modes.switchToWork : t.modes.switchToSleep}
              </button>
            </div>
          </div>
          <button
            type="button"
            aria-label="Dismiss navigation"
            className="flex-1"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      {/* Compact Floating Lens AI Liquid Glass Panel */}
      {lensDrawerOpen && activePage !== 'lens' && (
        <div
          aria-label="Lens AI Quick Assistant"
          className="glass-popover fixed bottom-5 end-5 z-40 flex h-[540px] max-h-[82vh] w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl"
        >
          <LensPanel compact onClose={() => setLensDrawerOpen(false)} />
        </div>
      )}

      {/* Toast Notifications Stack */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-5 start-5 z-50 flex flex-col gap-2 max-w-sm"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="glass-popover flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-xs"
            >
              <span
                className={
                  toast.tone === 'error'
                    ? 'text-[#c74954] dark:text-[#f08b94]'
                    : toast.tone === 'success'
                      ? 'text-[#238c5e] dark:text-[#63d4a1]'
                      : toast.tone === 'warning'
                        ? 'text-[#b57c1c] dark:text-[#E6AE53]'
                        : 'text-[#171820] dark:text-[#F2F3F7]'
                }
              >
                {toast.message}
              </span>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
                className="text-[#777987] hover:text-[#171820] dark:hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
