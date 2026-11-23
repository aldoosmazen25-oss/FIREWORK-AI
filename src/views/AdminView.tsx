import React, { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import type { CategoryRecord, ProjectRecord, UserProfile } from '../types/app';

interface ReportRow {
  id: number;
  reporterUid: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string;
  status: string;
  createdAt: string;
}

interface ActivityRow {
  id: number;
  userUid: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  createdAt: string;
}

interface AdminOverview {
  analytics: {
    totalUsers: number;
    totalProjects: number;
    openProjects: number;
    totalProposals: number;
    totalEngagements: number;
    totalTasks: number;
    openReports: number;
  };
  users: UserProfile[];
  projects: ProjectRecord[];
  reports: ReportRow[];
  categories: CategoryRecord[];
  activityLogs: ActivityRow[];
}

type AdminTab = 'users' | 'projects' | 'reports' | 'categories' | 'activity';

export function AdminView() {
  const { profile, firebaseUser, pushToast, t } = useApp();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<AdminTab>('users');

  // Add category form
  const [slug, setSlug] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [description, setDescription] = useState('');
  const [creatingCat, setCreatingCat] = useState(false);

  const isAdmin = profile?.role === 'admin';

  const loadOverview = useCallback(async () => {
    if (!firebaseUser || !isAdmin) return;
    setLoading(true);
    try {
      const data = await apiRequest<AdminOverview>('/api/admin/overview');
      setOverview(data);
    } catch (error) {
      pushToast(
        error instanceof Error ? error.message : 'Unable to load administration console.',
        'error',
      );
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, isAdmin, pushToast]);

  useEffect(() => {
    if (isAdmin) loadOverview();
  }, [isAdmin, loadOverview]);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-10 text-center">
        <ShieldAlert className="mx-auto h-7 w-7 text-[#E36C76]" />
        <h2 className="mt-3 text-base font-semibold text-[#171820] dark:text-[#F2F3F7]">
          {t.admin.title}
        </h2>
        <p className="mt-1.5 text-sm text-[#777987] dark:text-[#9B9EAC]">{t.admin.denied}</p>
      </div>
    );
  }

  const updateUser = async (
    uid: string,
    patch: Partial<{ accountStatus: 'active' | 'suspended'; role: 'user' | 'admin' }>,
  ) => {
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(uid)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      pushToast('User updated.', 'success');
      await loadOverview();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Unable to update user.', 'error');
    }
  };

  const toggleProjectStatus = async (project: ProjectRecord) => {
    const nextStatus = project.status === 'open' ? 'closed' : 'open';
    try {
      await apiRequest(`/api/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      pushToast(`Project marked ${nextStatus}.`, 'success');
      await loadOverview();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Unable to update project.', 'error');
    }
  };

  const updateReportStatus = async (id: number, status: string) => {
    try {
      await apiRequest(`/api/admin/reports/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      pushToast(`Report marked ${status}.`, 'success');
      await loadOverview();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Unable to update report.', 'error');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug.trim() || !nameEn.trim() || !nameAr.trim()) return;
    setCreatingCat(true);
    try {
      await apiRequest('/api/admin/categories', {
        method: 'POST',
        body: JSON.stringify({
          slug: slug.trim().toLowerCase().replace(/\s+/g, '-'),
          nameEn: nameEn.trim(),
          nameAr: nameAr.trim(),
          description: description.trim(),
        }),
      });
      setSlug('');
      setNameEn('');
      setNameAr('');
      setDescription('');
      pushToast('Category created.', 'success');
      await loadOverview();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Unable to create category.', 'error');
    } finally {
      setCreatingCat(false);
    }
  };

  const analytics = overview?.analytics;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#171820] dark:text-[#F2F3F7]">
            {t.admin.title}
          </h1>
          <p className="mt-1 text-sm text-[#777987] dark:text-[#9B9EAC]">
            Live PostgreSQL platform oversight, moderation, and category governance.
          </p>
        </div>
        <button
          type="button"
          onClick={loadOverview}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 dark:border-white/10 px-3.5 py-2 text-xs font-medium text-[#171820] dark:text-[#F2F3F7] hover:bg-black/5 dark:hover:bg-white/10"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{t.actions.refresh}</span>
        </button>
      </header>

      {/* Compact single-strip tabular analytics bar */}
      {analytics && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.06] dark:bg-white/[0.08] sm:grid-cols-4 lg:grid-cols-7">
          {[
            ['Users', analytics.totalUsers],
            ['Projects', analytics.totalProjects],
            ['Open', analytics.openProjects],
            ['Proposals', analytics.totalProposals],
            ['Engagements', analytics.totalEngagements],
            ['Tasks', analytics.totalTasks],
            ['Open Reports', analytics.openReports],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-white dark:bg-[#1A1C24] px-4 py-3.5">
              <p className="text-[11px] font-medium text-[#777987] dark:text-[#9B9EAC]">{label}</p>
              <p className="mt-1 font-mono text-lg font-semibold text-[#171820] dark:text-[#F2F3F7]">
                {value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-black/[0.07] dark:border-white/[0.08] pb-2">
        {(
          [
            ['users', t.admin.users],
            ['projects', t.admin.projects],
            ['reports', t.admin.reports],
            ['categories', t.admin.categories],
            ['activity', t.admin.activity],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${
              tab === id
                ? 'bg-[#7657E8] text-white'
                : 'text-[#777987] dark:text-[#9B9EAC] hover:bg-black/5 dark:hover:bg-white/10'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* USERS TABLE */}
      {tab === 'users' && (
        <div className="overflow-x-auto rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24]">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-black/[0.06] dark:border-white/[0.08] text-xs text-[#777987]">
              <tr>
                <th className="px-4 py-3 text-start font-medium">Member</th>
                <th className="px-4 py-3 text-start font-medium">Type</th>
                <th className="px-4 py-3 text-start font-medium">Role</th>
                <th className="px-4 py-3 text-start font-medium">Status</th>
                <th className="px-4 py-3 text-end font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
              {(overview?.users ?? []).map((u) => (
                <tr key={u.uid}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#171820] dark:text-[#F2F3F7]">{u.fullName}</p>
                    <p className="text-xs text-[#777987]">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#777987]">{u.accountType}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[#171820] dark:text-[#F2F3F7]">
                    {u.role}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span
                      className={
                        u.accountStatus === 'active' ? 'text-[#39B982]' : 'text-[#E36C76]'
                      }
                    >
                      {u.accountStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() =>
                        updateUser(u.uid, {
                          accountStatus: u.accountStatus === 'active' ? 'suspended' : 'active',
                        })
                      }
                      className="rounded-lg border border-black/10 dark:border-white/10 px-2.5 py-1 text-xs font-medium text-[#171820] dark:text-[#F2F3F7] hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      {u.accountStatus === 'active' ? 'Suspend' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateUser(u.uid, { role: u.role === 'admin' ? 'user' : 'admin' })
                      }
                      className="rounded-lg border border-black/10 dark:border-white/10 px-2.5 py-1 text-xs font-medium text-[#7657E8] hover:bg-[#7657E8]/10"
                    >
                      {u.role === 'admin' ? 'Demote' : 'Make Admin'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* PROJECTS TABLE */}
      {tab === 'projects' && (
        <div className="overflow-x-auto rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24]">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-black/[0.06] dark:border-white/[0.08] text-xs text-[#777987]">
              <tr>
                <th className="px-4 py-3 text-start font-medium">Project</th>
                <th className="px-4 py-3 text-start font-medium">Category</th>
                <th className="px-4 py-3 text-start font-medium">Status</th>
                <th className="px-4 py-3 text-end font-medium">Moderation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
              {(overview?.projects ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-xs text-[#777987]">
                    No projects in the database yet.
                  </td>
                </tr>
              ) : (
                (overview?.projects ?? []).map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-medium text-[#171820] dark:text-[#F2F3F7]">
                      {p.title}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#777987]">{p.category}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#171820] dark:text-[#F2F3F7]">
                      {p.status}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <button
                        type="button"
                        onClick={() => toggleProjectStatus(p)}
                        className="rounded-lg border border-black/10 dark:border-white/10 px-2.5 py-1 text-xs font-medium text-[#171820] dark:text-[#F2F3F7] hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        {p.status === 'open' ? 'Close Listing' : 'Reopen'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* REPORTS QUEUE */}
      {tab === 'reports' && (
        <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {(overview?.reports ?? []).length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-[#777987]">No moderation reports.</p>
          ) : (
            (overview?.reports ?? []).map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-[#171820] dark:text-[#F2F3F7]">
                    {r.targetType} #{r.targetId} · {r.reason}
                  </p>
                  {r.details && <p className="mt-1 text-xs text-[#777987]">{r.details}</p>}
                  <p className="mt-1 font-mono text-[11px] text-[#777987]">
                    Status: {r.status} · {new Date(r.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {(['reviewed', 'resolved', 'dismissed'] as const).map((next) => (
                    <button
                      key={next}
                      type="button"
                      onClick={() => updateReportStatus(r.id, next)}
                      className="rounded-lg border border-black/10 dark:border-white/10 px-2.5 py-1 text-xs font-medium text-[#171820] dark:text-[#F2F3F7] hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      {next}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* CATEGORIES */}
      {tab === 'categories' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {(overview?.categories ?? []).map((c) => (
              <div key={c.id} className="px-5 py-3.5">
                <p className="text-sm font-medium text-[#171820] dark:text-[#F2F3F7]">
                  {c.nameEn} · {c.nameAr}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-[#777987]">
                  {c.slug} {c.description ? `· ${c.description}` : ''}
                </p>
              </div>
            ))}
          </div>

          <form
            onSubmit={handleAddCategory}
            className="h-fit rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-5 space-y-3"
          >
            <h3 className="text-sm font-semibold text-[#171820] dark:text-[#F2F3F7]">
              Add Platform Category
            </h3>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="slug (e.g. cloud-security)"
              className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7]"
            />
            <input
              type="text"
              required
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="English Name"
              className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7]"
            />
            <input
              type="text"
              required
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              placeholder="الاسم بالعربية"
              className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7]"
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description"
              className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7]"
            />
            <button
              type="submit"
              disabled={creatingCat}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7657E8] px-4 py-2 text-sm font-medium text-white hover:bg-[#6446d6] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              <span>{creatingCat ? 'Adding...' : 'Add Category'}</span>
            </button>
          </form>
        </div>
      )}

      {/* PLATFORM ACTIVITY */}
      {tab === 'activity' && (
        <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {(overview?.activityLogs ?? []).length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-[#777987]">No platform activity yet.</p>
          ) : (
            (overview?.activityLogs ?? []).map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-4 px-5 py-3 text-xs">
                <div>
                  <span className="font-mono text-[#7657E8]">{log.action}</span>
                  <span className="mx-2 text-[#777987]">·</span>
                  <span className="text-[#171820] dark:text-[#F2F3F7]">{log.summary}</span>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-[#777987]">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
