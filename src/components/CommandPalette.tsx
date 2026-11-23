import React, { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  CheckSquare,
  Compass,
  FolderKanban,
  Globe,
  Home,
  MessageSquare,
  Moon,
  Search,
  Settings,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import type { FreelancerSummary, PageId, ProjectRecord, TaskRecord } from '../types/app';
import { LensSymbol } from './BrandIcons';

export function CommandPalette() {
  const {
    commandOpen,
    setCommandOpen,
    setActivePage,
    profile,
    switchMode,
    resolvedTheme,
    setTheme,
    language,
    setLanguage,
    t,
  } = useApp();

  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<{
    projects: ProjectRecord[];
    freelancers: FreelancerSummary[];
    tasks: TaskRecord[];
  }>({ projects: [], freelancers: [], tasks: [] });
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!commandOpen) {
      setQuery('');
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCommandOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commandOpen, setCommandOpen]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!commandOpen || trimmed.length < 2) {
      setSearchResults({ projects: [], freelancers: [], tasks: [] });
      return;
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const data = await apiRequest<{
          projects: ProjectRecord[];
          freelancers: FreelancerSummary[];
          tasks: TaskRecord[];
        }>(`/api/search?q=${encodeURIComponent(trimmed)}`);
        setSearchResults({
          projects: data.projects ?? [],
          freelancers: data.freelancers ?? [],
          tasks: data.tasks ?? [],
        });
        setRecentSearches((prev) => [trimmed, ...prev.filter((r) => r !== trimmed)].slice(0, 4));
      } catch {
        // Ignore transient search error
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, commandOpen]);

  const staticCommands = useMemo(() => {
    const items: Array<{
      id: string;
      label: string;
      group: string;
      icon: React.ReactNode;
      action: () => void;
    }> = [
      {
        id: 'nav-home',
        label: t.nav.home,
        group: 'Navigation',
        icon: <Home className="h-4 w-4" />,
        action: () => setActivePage('home'),
      },
      {
        id: 'nav-workspace',
        label: t.nav.workspace,
        group: 'Navigation',
        icon: <FolderKanban className="h-4 w-4" />,
        action: () => setActivePage('workspace'),
      },
      {
        id: 'nav-projects',
        label: t.nav.discoverProjects,
        group: 'Navigation',
        icon: <Compass className="h-4 w-4" />,
        action: () => setActivePage('discover-projects'),
      },
      {
        id: 'nav-freelancers',
        label: t.nav.findFreelancers,
        group: 'Navigation',
        icon: <Users className="h-4 w-4" />,
        action: () => setActivePage('find-freelancers'),
      },
      {
        id: 'nav-my-projects',
        label: t.nav.myProjects,
        group: 'Navigation',
        icon: <Briefcase className="h-4 w-4" />,
        action: () => setActivePage('my-projects'),
      },
      {
        id: 'nav-tasks',
        label: t.nav.tasks,
        group: 'Navigation',
        icon: <CheckSquare className="h-4 w-4" />,
        action: () => setActivePage('tasks'),
      },
      {
        id: 'nav-messages',
        label: t.nav.messages,
        group: 'Navigation',
        icon: <MessageSquare className="h-4 w-4" />,
        action: () => setActivePage('messages'),
      },
      {
        id: 'nav-lens',
        label: t.nav.lens,
        group: 'Intelligence',
        icon: <LensSymbol className="h-4 w-4" />,
        action: () => setActivePage('lens'),
      },
      {
        id: 'nav-settings',
        label: t.nav.settings,
        group: 'Preferences',
        icon: <Settings className="h-4 w-4" />,
        action: () => setActivePage('settings'),
      },
      {
        id: 'act-mode',
        label: profile?.mode === 'sleep' ? t.modes.switchToWork : t.modes.switchToSleep,
        group: 'Quick Actions',
        icon: profile?.mode === 'sleep' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />,
        action: () => switchMode(profile?.mode === 'sleep' ? 'work' : 'sleep'),
      },
      {
        id: 'act-theme',
        label: resolvedTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode',
        group: 'Preferences',
        icon: resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />,
        action: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
      },
      {
        id: 'act-lang',
        label: language === 'en' ? 'Switch language to Arabic (العربية)' : 'Switch language to English',
        group: 'Preferences',
        icon: <Globe className="h-4 w-4" />,
        action: () => setLanguage(language === 'en' ? 'ar' : 'en'),
      },
    ];
    if (!query.trim()) return items;
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q),
    );
  }, [t, profile?.mode, resolvedTheme, language, query, setActivePage, switchMode, setTheme, setLanguage]);

  if (!commandOpen) return null;

  const runAction = (fn: () => void) => {
    setCommandOpen(false);
    fn();
  };

  const go = (page: PageId) => runAction(() => setActivePage(page));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 pt-20 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Firework AI Command Center"
      onClick={(e) => {
        if (e.target === e.currentTarget) setCommandOpen(false);
      }}
    >
      <div className="glass-popover w-full max-w-xl overflow-hidden rounded-2xl text-[#171820] dark:text-[#F2F3F7]">
        <div className="flex items-center gap-3 border-b border-black/8 dark:border-white/10 px-4 py-3.5">
          <Search className="h-4 w-4 text-[#777987] shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.actions.searchPlaceholder}
            aria-label="Search Firework AI"
            className="w-full bg-transparent text-sm focus:outline-none placeholder:text-[#777987]"
          />
          <button
            type="button"
            onClick={() => setCommandOpen(false)}
            aria-label="Close command center"
            className="rounded-md p-1 text-[#777987] hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto p-2.5 space-y-4">
          {recentSearches.length > 0 && !query.trim() && (
            <div>
              <div className="px-2.5 pb-1 text-xs font-medium text-[#777987]">Recent searches</div>
              <div className="flex flex-wrap gap-1.5 px-2">
                {recentSearches.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => setQuery(term)}
                    className="rounded-md border border-black/8 dark:border-white/10 px-2.5 py-1 text-xs text-[#777987] hover:text-[#171820] dark:hover:text-white"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}

          {searching && (
            <div className="px-3 py-2 text-xs text-[#777987]">Searching platform database...</div>
          )}

          {searchResults.projects.length > 0 && (
            <div>
              <div className="px-2.5 pb-1 text-xs font-medium text-[#777987]">Projects</div>
              {searchResults.projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => go('discover-projects')}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-start text-sm hover:bg-black/5 dark:hover:bg-white/8"
                >
                  <span className="truncate font-medium">{p.title}</span>
                  <span className="text-xs text-[#777987] ms-3 shrink-0">{p.category}</span>
                </button>
              ))}
            </div>
          )}

          {searchResults.freelancers.length > 0 && (
            <div>
              <div className="px-2.5 pb-1 text-xs font-medium text-[#777987]">Freelancers</div>
              {searchResults.freelancers.map((f) => (
                <button
                  key={f.uid}
                  type="button"
                  onClick={() => go('find-freelancers')}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-start text-sm hover:bg-black/5 dark:hover:bg-white/8"
                >
                  <span className="truncate font-medium">{f.fullName}</span>
                  <span className="text-xs text-[#777987] ms-3 shrink-0">{f.title || f.availability}</span>
                </button>
              ))}
            </div>
          )}

          {searchResults.tasks.length > 0 && (
            <div>
              <div className="px-2.5 pb-1 text-xs font-medium text-[#777987]">Your Tasks</div>
              {searchResults.tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => go('tasks')}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-start text-sm hover:bg-black/5 dark:hover:bg-white/8"
                >
                  <span className="truncate font-medium">{task.title}</span>
                  <span className="text-xs text-[#777987] ms-3 shrink-0">{task.status}</span>
                </button>
              ))}
            </div>
          )}

          <div>
            <div className="px-2.5 pb-1 text-xs font-medium text-[#777987]">Commands</div>
            {staticCommands.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-[#777987]">
                No matching commands or records.
              </div>
            ) : (
              staticCommands.map((cmd) => (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => runAction(cmd.action)}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-start text-sm hover:bg-black/5 dark:hover:bg-white/8 transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="text-[#777987]">{cmd.icon}</span>
                    <span>{cmd.label}</span>
                  </span>
                  <span className="text-xs text-[#777987]">{cmd.group}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
