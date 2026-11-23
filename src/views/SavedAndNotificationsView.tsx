import React, { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Bell, Bookmark, Check, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import type { PageId, SavedItemRecord } from '../types/app';
import { formatBudget } from '../utils/domain';

export function SavedItemsView() {
  const {
    firebaseUser,
    setAuthModalOpen,
    setActivePage,
    openDirectMessageWith,
    pushToast,
    refreshTrigger,
    t,
  } = useApp();

  const [items, setItems] = useState<SavedItemRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSaved = useCallback(async () => {
    if (!firebaseUser) return;
    setLoading(true);
    try {
      const res = await apiRequest<{ items: SavedItemRecord[] }>('/api/saved');
      setItems(res.items ?? []);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Unable to load saved items.', 'error');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, pushToast]);

  useEffect(() => {
    if (firebaseUser) loadSaved();
    else setItems([]);
  }, [firebaseUser, refreshTrigger, loadSaved]);

  const removeSaved = async (item: SavedItemRecord) => {
    try {
      await apiRequest('/api/saved/toggle', {
        method: 'POST',
        body: JSON.stringify({ itemType: item.itemType, itemId: item.itemId }),
      });
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      pushToast('Removed from saved items.', 'neutral');
    } catch {
      pushToast('Unable to remove saved item.', 'error');
    }
  };

  if (!firebaseUser) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-8 text-center">
        <Bookmark className="mx-auto h-7 w-7 text-[#777987]" />
        <h2 className="mt-3 text-lg font-semibold text-[#171820] dark:text-[#F2F3F7]">
          {t.nav.saved}
        </h2>
        <p className="mt-2 text-sm text-[#777987] dark:text-[#9B9EAC]">
          Sign in to bookmark projects and freelancers across sessions.
        </p>
        <button
          type="button"
          onClick={() => setAuthModalOpen(true)}
          className="mt-5 rounded-lg bg-[#7657E8] px-4 py-2 text-sm font-medium text-white hover:bg-[#6446d6]"
        >
          {t.actions.signIn}
        </button>
      </div>
    );
  }

  const savedProjects = items.filter((i) => i.itemType === 'project' && i.project);
  const savedFreelancers = items.filter((i) => i.itemType === 'freelancer' && i.freelancer);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-[#171820] dark:text-[#F2F3F7]">
          {t.nav.saved}
        </h1>
        <p className="mt-1 text-sm text-[#777987] dark:text-[#9B9EAC]">
          Bookmarked client projects and independent professionals from your database.
        </p>
      </header>

      {loading && items.length === 0 ? (
        <div className="h-32 rounded-2xl bg-black/[0.04] dark:bg-white/[0.04] animate-pulse" />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-10 text-center">
          <Bookmark className="mx-auto h-7 w-7 text-[#777987]" />
          <p className="mt-3 text-sm font-medium text-[#171820] dark:text-[#F2F3F7]">
            No saved items yet
          </p>
          <p className="mt-1 text-xs text-[#777987] dark:text-[#9B9EAC]">
            Save open projects or freelancer profiles to return to them quickly.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => setActivePage('discover-projects')}
              className="rounded-lg bg-[#7657E8] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#6446d6]"
            >
              {t.nav.discoverProjects}
            </button>
            <button
              type="button"
              onClick={() => setActivePage('find-freelancers')}
              className="rounded-lg border border-black/10 dark:border-white/10 px-3.5 py-2 text-xs font-medium text-[#171820] dark:text-[#F2F3F7] hover:bg-black/5 dark:hover:bg-white/10"
            >
              {t.nav.findFreelancers}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-5">
            <h2 className="text-sm font-semibold text-[#171820] dark:text-[#F2F3F7]">
              Saved Projects ({savedProjects.length})
            </h2>
            <div className="mt-3 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
              {savedProjects.length === 0 ? (
                <p className="py-6 text-xs text-[#777987]">No projects bookmarked.</p>
              ) : (
                savedProjects.map((item) => {
                  const p = item.project!;
                  return (
                    <div key={item.id} className="flex items-start justify-between gap-3 py-3.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#171820] dark:text-[#F2F3F7]">
                          {p.title}
                        </p>
                        <p className="mt-0.5 text-xs text-[#777987] dark:text-[#9B9EAC]">
                          {p.category} · {formatBudget(p.budgetType, p.budgetMin, p.budgetMax)} · {p.duration}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setActivePage('discover-projects')}
                          className="rounded-lg p-1.5 text-[#7657E8] hover:bg-[#7657E8]/10"
                          aria-label="Open in marketplace"
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSaved(item)}
                          className="rounded-lg p-1.5 text-[#777987] hover:bg-[#E36C76]/10 hover:text-[#E36C76]"
                          aria-label="Remove saved project"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-5">
            <h2 className="text-sm font-semibold text-[#171820] dark:text-[#F2F3F7]">
              Saved Freelancers ({savedFreelancers.length})
            </h2>
            <div className="mt-3 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
              {savedFreelancers.length === 0 ? (
                <p className="py-6 text-xs text-[#777987]">No freelancers bookmarked.</p>
              ) : (
                savedFreelancers.map((item) => {
                  const f = item.freelancer!;
                  return (
                    <div key={item.id} className="flex items-start justify-between gap-3 py-3.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#171820] dark:text-[#F2F3F7]">
                          {f.fullName}
                        </p>
                        <p className="mt-0.5 text-xs text-[#777987] dark:text-[#9B9EAC]">
                          {f.title || 'Independent Professional'} · {f.availability}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openDirectMessageWith(f.uid)}
                          className="rounded-lg border border-black/10 dark:border-white/10 px-2.5 py-1 text-xs font-medium text-[#171820] dark:text-[#F2F3F7] hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          {t.actions.contact}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSaved(item)}
                          className="rounded-lg p-1.5 text-[#777987] hover:bg-[#E36C76]/10 hover:text-[#E36C76]"
                          aria-label="Remove saved freelancer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export function NotificationsView() {
  const {
    firebaseUser,
    profile,
    notifications,
    unreadNotifications,
    refreshNotifications,
    setActivePage,
    setAuthModalOpen,
    pushToast,
    t,
  } = useApp();

  const [marking, setMarking] = useState(false);

  const markRead = async (notificationId?: number) => {
    setMarking(true);
    try {
      await apiRequest('/api/notifications/read', {
        method: 'POST',
        body: JSON.stringify(notificationId ? { notificationId } : {}),
      });
      await refreshNotifications();
    } catch {
      pushToast('Unable to update notification status.', 'error');
    } finally {
      setMarking(false);
    }
  };

  if (!firebaseUser) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-8 text-center">
        <Bell className="mx-auto h-7 w-7 text-[#777987]" />
        <h2 className="mt-3 text-lg font-semibold text-[#171820] dark:text-[#F2F3F7]">
          {t.nav.notifications}
        </h2>
        <p className="mt-2 text-sm text-[#777987] dark:text-[#9B9EAC]">
          Sign in to review project alerts, proposal updates, and messages.
        </p>
        <button
          type="button"
          onClick={() => setAuthModalOpen(true)}
          className="mt-5 rounded-lg bg-[#7657E8] px-4 py-2 text-sm font-medium text-white hover:bg-[#6446d6]"
        >
          {t.actions.signIn}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#171820] dark:text-[#F2F3F7]">
            {t.nav.notifications}
          </h1>
          <p className="mt-1 text-sm text-[#777987] dark:text-[#9B9EAC]">
            {profile?.mode === 'sleep'
              ? 'Sleep Mode active: nonessential alerts are muted; critical updates still appear here.'
              : `${unreadNotifications} unread alert${unreadNotifications === 1 ? '' : 's'}`}
          </p>
        </div>
        {unreadNotifications > 0 && (
          <button
            type="button"
            disabled={marking}
            onClick={() => markRead()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 dark:border-white/10 px-3.5 py-2 text-xs font-medium text-[#171820] dark:text-[#F2F3F7] hover:bg-black/5 dark:hover:bg-white/10"
          >
            <Check className="h-3.5 w-3.5" />
            <span>{t.actions.markAllRead}</span>
          </button>
        )}
      </header>

      <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] divide-y divide-black/[0.05] dark:divide-white/[0.06]">
        {notifications.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Bell className="mx-auto h-7 w-7 text-[#777987]" />
            <p className="mt-3 text-sm font-medium text-[#171820] dark:text-[#F2F3F7]">
              All caught up
            </p>
            <p className="mt-1 text-xs text-[#777987] dark:text-[#9B9EAC]">
              Notifications appear when proposals, milestones, or direct messages occur.
            </p>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start justify-between gap-4 px-5 py-4 ${
                n.read ? '' : 'bg-[#7657E8]/[0.04]'
              }`}
            >
              <button
                type="button"
                onClick={async () => {
                  if (!n.read) await markRead(n.id);
                  if (n.targetPage) {
                    setActivePage(n.targetPage as PageId);
                  }
                }}
                className="min-w-0 flex-1 text-start"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#171820] dark:text-[#F2F3F7]">
                    {n.title}
                  </span>
                  {!n.read && (
                    <span className="text-[11px] font-semibold text-[#7657E8]">Unread</span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[#777987] dark:text-[#9B9EAC]">
                  {n.body}
                </p>
                <p className="mt-1.5 font-mono text-[11px] text-[#777987]">
                  {new Date(n.createdAt).toLocaleString()}
                </p>
              </button>
              {!n.read && (
                <button
                  type="button"
                  onClick={() => markRead(n.id)}
                  className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium text-[#7657E8] hover:bg-[#7657E8]/10"
                >
                  Mark read
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
