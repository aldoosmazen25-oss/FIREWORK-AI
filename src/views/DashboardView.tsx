import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  Calendar,
  CheckSquare,
  Compass,
  Moon,
  Plus,
  Send,
  Sun,
  Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import { formatBudget } from '../utils/domain';
import type {
  ConversationRecord,
  EngagementRecord,
  FreelancerSummary,
  ProjectRecord,
  ProposalRecord,
  SavedItemRecord,
  TaskRecord,
} from '../types/app';
import { GoogleSignInButton, LensSymbol } from '../components/BrandIcons';

interface DashboardPayload {
  stats: {
    activeEngagements: number;
    publishedProjects: number;
    pendingProposals: number;
    receivedProposals: number;
    openTasks: number;
    completedTasks: number;
    savedItems: number;
    unreadMessages: number;
  };
  activeEngagements: EngagementRecord[];
  publishedProjects: ProjectRecord[];
  pendingProposals: ProposalRecord[];
  receivedProposals: ProposalRecord[];
  tasks: TaskRecord[];
  upcomingDeadlines: TaskRecord[];
  recentMessages: ConversationRecord[];
  savedItems: SavedItemRecord[];
  recommendedProjects: ProjectRecord[];
  recommendedFreelancers: FreelancerSummary[];
  recentActivity: Array<{ id: number; action: string; summary: string; createdAt: string }>;
}

export function DashboardView({ modeView = 'home' }: { modeView?: 'home' | 'workspace' }) {
  const {
    firebaseUser,
    profile,
    language,
    t,
    setActivePage,
    switchMode,
    handleGoogleSignIn,
    askLensWithPrompt,
    refreshTrigger,
  } = useApp();

  const [data, setData] = useState<DashboardPayload | null>(null);
  const [publicProjects, setPublicProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickLensInput, setQuickLensInput] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    if (firebaseUser) {
      apiRequest<DashboardPayload>('/api/dashboard')
        .then((res) => {
          if (active) setData(res);
        })
        .catch(() => {})
        .finally(() => {
          if (active) setLoading(false);
        });
    } else {
      apiRequest<{ projects: ProjectRecord[] }>('/api/projects?status=open')
        .then((res) => {
          if (active) setPublicProjects((res.projects ?? []).slice(0, 6));
        })
        .catch(() => {})
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [firebaseUser, refreshTrigger]);

  const handleQuickLens = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickLensInput.trim()) return;
    askLensWithPrompt(quickLensInput.trim(), false);
    setQuickLensInput('');
  };

  // Unauthenticated Welcome Workspace (No fake stats — real public projects + direct Sign In)
  if (!firebaseUser) {
    return (
      <div className="space-y-8">
        <section className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] p-6 lg:p-8">
          <div className="grid gap-8 lg:grid-cols-12 items-start">
            <div className="lg:col-span-7 space-y-4">
              <p className="text-xs font-medium text-[#7657E8]">Firework AI · Lens AI</p>
              <h2 className="font-display text-2xl lg:text-3xl font-semibold tracking-tight text-balance">
                {t.dashboard.guestHeading}
              </h2>
              <p className="max-w-xl text-sm leading-relaxed text-[#777987] dark:text-[#9B9EAC]">
                {t.dashboard.guestSub}
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <GoogleSignInButton onClick={handleGoogleSignIn} label={t.actions.signIn} />
                <button
                  type="button"
                  onClick={() => setActivePage('discover-projects')}
                  className="inline-flex items-center gap-2 rounded-xl border border-black/10 dark:border-white/12 px-4 py-2.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/6 transition-colors whitespace-nowrap"
                >
                  <Compass className="h-4 w-4 text-[#7657E8]" />
                  <span>{t.nav.discoverProjects}</span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-5 divide-y divide-black/6 dark:divide-white/6 rounded-xl border border-black/8 dark:border-white/8 bg-[#F9FAFC] dark:bg-[#14161D]">
              <div className="p-4">
                <p className="text-xs font-medium text-[#171820] dark:text-white">
                  {language === 'ar' ? 'وكيل مساحة العمل لينز AI' : 'Lens AI Workspace Agent'}
                </p>
                <p className="mt-1 text-xs text-[#777987]">
                  {language === 'ar'
                    ? 'بدّل بين وضع العمل والسكون، واستعلم عن مشاريع قاعدة البيانات، وأنشئ المهام، وتحدث صوتياً مباشرة.'
                    : 'Switch Work/Sleep Mode, query PostgreSQL projects, create tasks, and speak live with Gemini 3.8 Live.'}
                </p>
              </div>
              <div className="p-4">
                <p className="text-xs font-medium text-[#171820] dark:text-white">
                  {language === 'ar' ? 'مسارات مخصصة للعملاء والمستقلين' : 'Role-Aware Freelancer & Client Flows'}
                </p>
                <p className="mt-1 text-xs text-[#777987]">
                  {language === 'ar'
                    ? 'انشر تفاصيل المشاريع، وقيّم العروض، وتابع المعالم، وتواصل عبر محادثات خاصة منظمة.'
                    : 'Publish structured briefs, evaluate proposals, track milestones, and collaborate in private threads.'}
                </p>
              </div>
              <div className="p-4">
                <p className="text-xs font-medium text-[#171820] dark:text-white">
                  {language === 'ar' ? 'تكامل مباشر مع Google Workspace' : 'Google Workspace Native Integration'}
                </p>
                <p className="mt-1 text-xs text-[#777987]">
                  {language === 'ar'
                    ? 'اربط Gmail ومستندات Google ومهام Google ونماذج Google وGoogle Meet مباشرة من الشريط الجانبي.'
                    : 'Connect Gmail, Google Docs, Google Tasks, Google Forms, and Google Meet directly from your sidebar.'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Live Public Marketplace Preview */}
        <section className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24]">
          <div className="flex items-center justify-between border-b border-black/6 dark:border-white/6 px-6 py-4">
            <div>
              <h3 className="text-sm font-semibold">{t.nav.discoverProjects}</h3>
              <p className="text-xs text-[#777987]">
                {language === 'ar'
                  ? 'المشاريع المفتوحة المسجلة في قاعدة البيانات'
                  : 'Live open projects from the database'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActivePage('discover-projects')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#7657E8] hover:underline"
            >
              <span>{language === 'ar' ? 'عرض الكل' : 'View all'}</span>
              <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </button>
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              <div className="h-10 rounded-lg bg-black/5 dark:bg-white/5 animate-pulse" />
              <div className="h-10 rounded-lg bg-black/5 dark:bg-white/5 animate-pulse" />
            </div>
          ) : publicProjects.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm font-medium">{t.projects.emptyTitle}</p>
              <p className="mt-1 text-xs text-[#777987]">{t.projects.emptyDesc}</p>
            </div>
          ) : (
            <div className="divide-y divide-black/6 dark:divide-white/6">
              {publicProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setActivePage('discover-projects')}
                  className="flex w-full items-center justify-between gap-4 px-6 py-3.5 text-start hover:bg-[#F9FAFC] dark:hover:bg-white/3 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{project.title}</p>
                    <p className="mt-0.5 text-xs text-[#777987]">
                      {project.category} · {project.duration} · {project.experienceLevel}
                    </p>
                  </div>
                  <span className="font-mono text-xs font-medium tabular-nums shrink-0">
                    {formatBudget(project.budgetType, project.budgetMin, project.budgetMax)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  const isClient = profile?.accountType === 'client';
  const isSleep = profile?.mode === 'sleep';
  const stats = data?.stats;

  const kpiItems = isClient
    ? [
        { label: t.dashboard.publishedProjects, value: stats?.publishedProjects ?? 0 },
        { label: t.dashboard.activeProjects, value: stats?.activeEngagements ?? 0 },
        { label: t.dashboard.receivedProposals, value: stats?.receivedProposals ?? 0 },
        { label: t.dashboard.openTasks, value: stats?.openTasks ?? 0 },
      ]
    : [
        { label: t.dashboard.activeProjects, value: stats?.activeEngagements ?? 0 },
        { label: t.dashboard.pendingProposals, value: stats?.pendingProposals ?? 0 },
        { label: t.dashboard.openTasks, value: stats?.openTasks ?? 0 },
        { label: t.dashboard.savedItems, value: stats?.savedItems ?? 0 },
      ];

  return (
    <div className="space-y-6">
      {/* Top Greeting & Compact Tabular KPI Strip (No Repetitive Card Grid) */}
      <section className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 border-b border-black/6 dark:border-white/6">
          <div>
            <p className="text-xs text-[#777987]">
              {isClient ? t.roles.client : t.roles.freelancer} ·{' '}
              {isSleep ? t.modes.offline : t.modes.available}
            </p>
            <h2 className="mt-0.5 font-display text-xl font-semibold tracking-tight">
              {modeView === 'workspace'
                ? `${profile?.fullName || ''}'s Workspace`
                : `${t.dashboard.welcomeBack}, ${profile?.fullName || ''}`}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {isClient ? (
              <button
                type="button"
                onClick={() => setActivePage('discover-projects')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#7657E8] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#6446d6] transition-colors whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{t.actions.newProject}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActivePage('discover-projects')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#7657E8] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#6446d6] transition-colors whitespace-nowrap"
              >
                <Compass className="h-3.5 w-3.5" />
                <span>{t.nav.discoverProjects}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setActivePage('tasks')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 dark:border-white/12 px-3.5 py-2 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/6 transition-colors whitespace-nowrap"
            >
              <CheckSquare className="h-3.5 w-3.5 text-[#777987]" />
              <span>{t.actions.newTask}</span>
            </button>
          </div>
        </div>

        {/* Single-Elevation Tabular KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-black/6 dark:divide-white/6">
          {kpiItems.map((metric) => (
            <div key={metric.label} className="px-6 py-4">
              <p className="text-xs text-[#777987]">{metric.label}</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
                {loading ? '—' : metric.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Asymmetric 2-Column Editorial Workspace */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Left Main Stream (8 columns) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Lens AI Command Strip */}
          <form
            onSubmit={handleQuickLens}
            className="flex items-center gap-3 rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] px-4 py-3"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#7657E8]/12 text-[#7657E8] shrink-0">
              <LensSymbol className="h-4 w-4" />
            </span>
            <input
              type="text"
              value={quickLensInput}
              onChange={(e) => setQuickLensInput(e.target.value)}
              placeholder={t.lens.placeholder}
              aria-label="Quick command to Lens AI"
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-[#777987]"
            />
            <button
              type="submit"
              disabled={!quickLensInput.trim()}
              aria-label="Run Lens AI command"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7657E8] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#6446d6] disabled:opacity-45 whitespace-nowrap"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{t.lensAi}</span>
            </button>
          </form>

          {/* Active Engagements or Published Projects */}
          <section className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24]">
            <div className="flex items-center justify-between border-b border-black/6 dark:border-white/6 px-6 py-4">
              <h3 className="text-sm font-semibold">
                {isClient ? t.dashboard.publishedProjects : t.dashboard.activeProjects}
              </h3>
              <button
                type="button"
                onClick={() => setActivePage('my-projects')}
                className="text-xs font-medium text-[#7657E8] hover:underline"
              >
                Manage all
              </button>
            </div>

            {isClient ? (
              (data?.publishedProjects ?? []).length === 0 ? (
                <div className="px-6 py-8 text-center">
                  <p className="text-sm font-medium">{t.dashboard.emptyDataTitle}</p>
                  <p className="mt-1 text-xs text-[#777987]">
                    Publish your first project brief to receive proposals from freelancers.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActivePage('discover-projects')}
                    className="mt-4 rounded-lg bg-[#7657E8] px-4 py-2 text-xs font-medium text-white"
                  >
                    {t.actions.newProject}
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-black/6 dark:divide-white/6">
                  {data?.publishedProjects.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-4 px-6 py-3.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.title}</p>
                        <p className="mt-0.5 text-xs text-[#777987]">
                          {p.category} · {p.status} · {p.duration}
                        </p>
                      </div>
                      <span className="font-mono text-xs tabular-nums shrink-0">
                        {formatBudget(p.budgetType, p.budgetMin, p.budgetMax)}
                      </span>
                    </div>
                  ))}
                </div>
              )
            ) : (data?.activeEngagements ?? []).length === 0 ? (
              <div className="px-6 py-8 text-center">
                <p className="text-sm font-medium">{t.dashboard.emptyDataTitle}</p>
                <p className="mt-1 text-xs text-[#777987]">{t.dashboard.emptyDataDesc}</p>
              </div>
            ) : (
              <div className="divide-y divide-black/6 dark:divide-white/6">
                {data?.activeEngagements.map((eng) => (
                  <div
                    key={eng.id}
                    className="flex items-center justify-between gap-4 px-6 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{eng.projectTitle}</p>
                      <p className="mt-0.5 text-xs text-[#777987]">
                        {eng.counterpart?.fullName || 'Workspace'} · {eng.status}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="w-24 h-1.5 rounded-full bg-black/8 dark:bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-[#7657E8]"
                          style={{ width: `${eng.progress}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs tabular-nums">{eng.progress}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recommendations Section (Paused cleanly when in Sleep Mode) */}
          <section className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24]">
            <div className="flex items-center justify-between border-b border-black/6 dark:border-white/6 px-6 py-4">
              <h3 className="text-sm font-semibold">
                {isClient ? t.dashboard.recommendedFreelancers : t.dashboard.recommendedProjects}
              </h3>
              <button
                type="button"
                onClick={() =>
                  setActivePage(isClient ? 'find-freelancers' : 'discover-projects')
                }
                className="text-xs font-medium text-[#7657E8] hover:underline"
              >
                Explore directory
              </button>
            </div>

            {isSleep ? (
              <div className="px-6 py-8 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Proactive recommendations paused</p>
                  <p className="mt-0.5 text-xs text-[#777987]">
                    Sleep Mode is active. Switch back to Work Mode to resume tailored matches.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => switchMode('work')}
                  className="rounded-lg border border-black/10 dark:border-white/12 px-3 py-1.5 text-xs font-medium whitespace-nowrap"
                >
                  {t.modes.switchToWork}
                </button>
              </div>
            ) : isClient ? (
              (data?.recommendedFreelancers ?? []).length === 0 ? (
                <div className="px-6 py-8 text-center text-xs text-[#777987]">
                  No discoverable freelancer profiles in the database yet.
                </div>
              ) : (
                <div className="divide-y divide-black/6 dark:divide-white/6">
                  {data?.recommendedFreelancers.map((f) => (
                    <div
                      key={f.uid}
                      className="flex items-center justify-between gap-4 px-6 py-3.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{f.fullName}</p>
                        <p className="mt-0.5 text-xs text-[#777987] truncate">
                          {f.title || 'Independent Professional'} · {(f.skills ?? []).slice(0, 3).join(', ') || 'General'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActivePage('find-freelancers')}
                        className="text-xs font-medium text-[#7657E8] hover:underline shrink-0"
                      >
                        Inspect
                      </button>
                    </div>
                  ))}
                </div>
              )
            ) : (data?.recommendedProjects ?? []).length === 0 ? (
              <div className="px-6 py-8 text-center text-xs text-[#777987]">
                No open projects match yet. Add skills in Settings or browse the marketplace.
              </div>
            ) : (
              <div className="divide-y divide-black/6 dark:divide-white/6">
                {data?.recommendedProjects.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-4 px-6 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.title}</p>
                      <p className="mt-0.5 text-xs text-[#777987]">
                        {p.category} · {p.duration}
                        {p.matchScore ? ` · ${p.matchScore}% skill overlap` : ''}
                      </p>
                    </div>
                    <span className="font-mono text-xs tabular-nums shrink-0">
                      {formatBudget(p.budgetType, p.budgetMin, p.budgetMax)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Control & Timeline Rail (4 columns) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Operating Mode Panel */}
          <section className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#777987]">Operating Mode</span>
              <span
                className={`text-xs font-medium ${
                  isSleep ? 'text-[#E6AE53]' : 'text-[#39B982]'
                }`}
              >
                {isSleep ? t.modes.sleep : t.modes.work}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[#777987]">
              {isSleep ? t.modes.sleepDesc : t.modes.workDesc}
            </p>
            <button
              type="button"
              onClick={() => switchMode(isSleep ? 'work' : 'sleep')}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-black/10 dark:border-white/12 px-3.5 py-2 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/6 transition-colors"
            >
              {isSleep ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              <span>{isSleep ? t.modes.switchToWork : t.modes.switchToSleep}</span>
            </button>
          </section>

          {/* Upcoming Deadlines */}
          <section className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24]">
            <div className="flex items-center justify-between border-b border-black/6 dark:border-white/6 px-5 py-3.5">
              <h3 className="text-sm font-semibold">{t.dashboard.upcomingDeadlines}</h3>
              <button
                type="button"
                onClick={() => setActivePage('tasks')}
                className="text-xs text-[#7657E8] hover:underline"
              >
                Tasks
              </button>
            </div>
            {(data?.upcomingDeadlines ?? []).length === 0 ? (
              <p className="px-5 py-6 text-xs text-[#777987]">No scheduled deadlines.</p>
            ) : (
              <div className="divide-y divide-black/6 dark:divide-white/6">
                {data?.upcomingDeadlines.map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{task.title}</p>
                      <p className="text-[11px] text-[#777987]">{task.status} · {task.priority}</p>
                    </div>
                    <span className="font-mono text-[11px] tabular-nums text-[#777987] shrink-0">
                      {task.dueDate}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recent Activity Log */}
          <section className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24]">
            <div className="border-b border-black/6 dark:border-white/6 px-5 py-3.5">
              <h3 className="text-sm font-semibold">{t.dashboard.recentActivity}</h3>
            </div>
            {(data?.recentActivity ?? []).length === 0 ? (
              <p className="px-5 py-6 text-xs text-[#777987]">Activity records will appear here.</p>
            ) : (
              <div className="divide-y divide-black/6 dark:divide-white/6">
                {data?.recentActivity.slice(0, 6).map((act) => (
                  <div key={act.id} className="px-5 py-3">
                    <p className="text-xs text-[#171820] dark:text-[#E5E7F0]">{act.summary}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-[#777987]">
                      {new Date(act.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Quick Shortcuts */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setActivePage('calendar')}
              className="flex items-center gap-2 rounded-xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] px-3.5 py-2.5 text-xs font-medium hover:border-[#7657E8]/40"
            >
              <Calendar className="h-3.5 w-3.5 text-[#7657E8]" />
              <span>{t.nav.calendar}</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePage('integrations')}
              className="flex items-center gap-2 rounded-xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] px-3.5 py-2.5 text-xs font-medium hover:border-[#7657E8]/40"
            >
              <Briefcase className="h-3.5 w-3.5 text-[#7DA9FF]" />
              <span>Workspace Hub</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
