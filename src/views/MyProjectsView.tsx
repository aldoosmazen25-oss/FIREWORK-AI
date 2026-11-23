import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, MessageSquare, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import { formatBudget } from '../utils/domain';
import type { EngagementRecord, ProjectRecord, ProposalRecord } from '../types/app';
import { GoogleSignInButton } from '../components/BrandIcons';

export function MyProjectsView() {
  const {
    firebaseUser,
    profile,
    t,
    handleGoogleSignIn,
    openDirectMessageWith,
    pushToast,
    triggerDataRefresh,
    refreshTrigger,
  } = useApp();

  const [tab, setTab] = useState<'engagements' | 'published' | 'received' | 'sent'>('engagements');
  const [engagements, setEngagements] = useState<EngagementRecord[]>([]);
  const [published, setPublished] = useState<ProjectRecord[]>([]);
  const [received, setReceived] = useState<ProposalRecord[]>([]);
  const [sent, setSent] = useState<ProposalRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneAmount, setMilestoneAmount] = useState('');
  const [addingForId, setAddingForId] = useState<number | null>(null);

  const loadAll = useCallback(async () => {
    if (!firebaseUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [engRes, pubRes, propRes] = await Promise.all([
        apiRequest<{ engagements: EngagementRecord[] }>('/api/engagements'),
        apiRequest<{ projects: ProjectRecord[] }>('/api/projects?mine=true&status=all'),
        apiRequest<{ sent: ProposalRecord[]; received: ProposalRecord[] }>('/api/proposals'),
      ]);
      setEngagements(engRes.engagements ?? []);
      setPublished(pubRes.projects ?? []);
      setSent(propRes.sent ?? []);
      setReceived(propRes.received ?? []);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to load project workspaces.', 'error');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, pushToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll, refreshTrigger]);

  if (!firebaseUser) {
    return (
      <div className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] p-10 text-center space-y-4">
        <h2 className="font-display text-lg font-semibold">{t.nav.myProjects}</h2>
        <p className="text-xs text-[#777987] max-w-md mx-auto">{t.dashboard.signInPrompt}</p>
        <GoogleSignInButton onClick={handleGoogleSignIn} label={t.actions.signIn} />
      </div>
    );
  }

  const updateProposal = async (id: number, status: string) => {
    try {
      await apiRequest(`/api/proposals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      triggerDataRefresh();
      pushToast(`Proposal marked as ${status}.`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to update proposal.', 'error');
    }
  };

  const updateMilestone = async (id: number, status: string) => {
    try {
      await apiRequest(`/api/milestones/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      triggerDataRefresh();
      pushToast('Milestone status updated.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to update milestone.', 'error');
    }
  };

  const handleAddMilestone = async (engagementId: number) => {
    if (!milestoneTitle.trim()) return;
    try {
      await apiRequest(`/api/engagements/${engagementId}/milestones`, {
        method: 'POST',
        body: JSON.stringify({
          title: milestoneTitle.trim(),
          amount: Number(milestoneAmount) || 0,
        }),
      });
      setMilestoneTitle('');
      setMilestoneAmount('');
      setAddingForId(null);
      triggerDataRefresh();
      pushToast('Milestone added.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to add milestone.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{t.nav.myProjects}</h2>
          <p className="text-xs text-[#777987]">
            Active engagements, milestones, published briefs, and proposal lifecycle.
          </p>
        </div>

        <div className="inline-flex rounded-xl bg-black/5 dark:bg-white/6 p-1 text-xs">
          {(
            [
              ['engagements', `Active (${engagements.length})`],
              ['published', `Published (${published.length})`],
              ['received', `Received (${received.length})`],
              ['sent', `Submitted (${sent.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-lg px-3 py-1.5 font-medium transition-colors whitespace-nowrap ${
                tab === key
                  ? 'bg-white dark:bg-[#1A1C24] text-[#171820] dark:text-white shadow-xs'
                  : 'text-[#777987]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] p-8">
          <div className="h-14 rounded-lg bg-black/5 dark:bg-white/5 animate-pulse" />
        </div>
      ) : tab === 'engagements' ? (
        engagements.length === 0 ? (
          <div className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] p-10 text-center text-xs text-[#777987]">
            No active project engagements yet. Accepting a proposal automatically creates a workspace here.
          </div>
        ) : (
          <div className="space-y-4">
            {engagements.map((eng) => {
              const isClientSide = eng.clientUid === profile?.uid;
              return (
                <section
                  key={eng.id}
                  className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] p-6 space-y-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/6 dark:border-white/6 pb-4">
                    <div>
                      <p className="text-xs text-[#777987]">
                        {eng.projectCategory} · {isClientSide ? 'Client Workspace' : 'Freelancer Workspace'} · {eng.status}
                      </p>
                      <h3 className="mt-0.5 font-display text-base font-semibold">
                        {eng.projectTitle}
                      </h3>
                      <p className="mt-1 text-xs text-[#777987]">
                        Partner: {eng.counterpart?.fullName || 'Member'} · Budget:{' '}
                        <span className="font-mono tabular-nums">${eng.agreedBudget.toLocaleString()}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {eng.counterpart && (
                        <button
                          type="button"
                          onClick={() => openDirectMessageWith(eng.counterpart!.uid)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 dark:border-white/12 px-3 py-1.5 text-xs font-medium"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          <span>Message</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setAddingForId(addingForId === eng.id ? null : eng.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#7657E8] px-3 py-1.5 text-xs font-medium text-white"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add Milestone</span>
                      </button>
                    </div>
                  </div>

                  {/* Progress Track */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-[#777987]">Milestone Completion</span>
                      <span className="font-mono font-medium tabular-nums">{eng.progress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-black/8 dark:bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-[#7657E8] transition-all"
                        style={{ width: `${eng.progress}%` }}
                      />
                    </div>
                  </div>

                  {addingForId === eng.id && (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#F9FAFC] dark:bg-[#14161D] p-3">
                      <input
                        type="text"
                        value={milestoneTitle}
                        onChange={(e) => setMilestoneTitle(e.target.value)}
                        placeholder="Milestone title"
                        className="flex-1 min-w-[180px] rounded-lg border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-1.5 text-xs"
                      />
                      <input
                        type="number"
                        value={milestoneAmount}
                        onChange={(e) => setMilestoneAmount(e.target.value)}
                        placeholder="Amount USD"
                        className="w-28 rounded-lg border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-1.5 text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddMilestone(eng.id)}
                        className="rounded-lg bg-[#7657E8] px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Save
                      </button>
                    </div>
                  )}

                  {/* Milestones Table */}
                  <div className="divide-y divide-black/6 dark:divide-white/6 rounded-xl border border-black/8 dark:border-white/8">
                    {eng.milestones.map((ms) => (
                      <div
                        key={ms.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs"
                      >
                        <div>
                          <p className="font-medium">{ms.title}</p>
                          <p className="text-[#777987]">
                            Status: {ms.status} · <span className="font-mono">${ms.amount}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {ms.status !== 'approved' && !isClientSide && (
                            <button
                              type="button"
                              onClick={() => updateMilestone(ms.id, 'submitted')}
                              className="rounded-lg border border-black/10 dark:border-white/12 px-2.5 py-1 hover:border-[#7657E8]"
                            >
                              Mark Submitted
                            </button>
                          )}
                          {ms.status !== 'approved' && isClientSide && (
                            <button
                              type="button"
                              onClick={() => updateMilestone(ms.id, 'approved')}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#39B982] px-2.5 py-1 font-medium text-white"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Approve</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )
      ) : tab === 'published' ? (
        <div className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] overflow-hidden">
          {published.length === 0 ? (
            <p className="p-10 text-center text-xs text-[#777987]">
              You have not published any projects yet.
            </p>
          ) : (
            <div className="divide-y divide-black/6 dark:divide-white/6">
              {published.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-4 px-6 py-4"
                >
                  <div>
                    <p className="text-sm font-semibold">{p.title}</p>
                    <p className="text-xs text-[#777987]">
                      {p.category} · {p.status} · {p.duration}
                    </p>
                  </div>
                  <span className="font-mono text-xs tabular-nums">
                    {formatBudget(p.budgetType, p.budgetMin, p.budgetMax)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === 'received' ? (
        <div className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] overflow-hidden">
          {received.length === 0 ? (
            <p className="p-10 text-center text-xs text-[#777987]">
              No proposals received on your published projects yet.
            </p>
          ) : (
            <div className="divide-y divide-black/6 dark:divide-white/6">
              {received.map((prop) => (
                <div key={prop.id} className="p-6 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-[#777987]">
                        For: {prop.projectTitle} · Status: {prop.status}
                      </p>
                      <h4 className="mt-0.5 text-sm font-semibold">
                        {prop.freelancer?.fullName || 'Applicant'}
                        {prop.freelancer?.title ? ` — ${prop.freelancer.title}` : ''}
                      </h4>
                    </div>
                    <span className="font-mono text-sm font-semibold tabular-nums">
                      ${prop.proposedBudget.toLocaleString()} · {prop.estimatedDuration}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-[#4B4D5A] dark:text-[#C4C6D2]">
                    {prop.approach}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {(prop.status === 'submitted' || prop.status === 'under_review') && (
                      <>
                        <button
                          type="button"
                          onClick={() => updateProposal(prop.id, 'accepted')}
                          className="rounded-lg bg-[#39B982] px-3 py-1.5 text-xs font-medium text-white"
                        >
                          {t.actions.accept}
                        </button>
                        {prop.status === 'submitted' && (
                          <button
                            type="button"
                            onClick={() => updateProposal(prop.id, 'under_review')}
                            className="rounded-lg border border-black/10 dark:border-white/12 px-3 py-1.5 text-xs font-medium"
                          >
                            {t.actions.underReview}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => updateProposal(prop.id, 'rejected')}
                          className="rounded-lg border border-black/10 dark:border-white/12 px-3 py-1.5 text-xs font-medium text-[#E36C76]"
                        >
                          {t.actions.reject}
                        </button>
                      </>
                    )}
                    {prop.freelancer && (
                      <button
                        type="button"
                        onClick={() => openDirectMessageWith(prop.freelancer!.uid)}
                        className="rounded-lg border border-black/10 dark:border-white/12 px-3 py-1.5 text-xs font-medium"
                      >
                        Message Applicant
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] overflow-hidden">
          {sent.length === 0 ? (
            <p className="p-10 text-center text-xs text-[#777987]">
              You have not submitted any proposals yet.
            </p>
          ) : (
            <div className="divide-y divide-black/6 dark:divide-white/6">
              {sent.map((prop) => (
                <div
                  key={prop.id}
                  className="flex flex-wrap items-center justify-between gap-4 px-6 py-4"
                >
                  <div>
                    <p className="text-sm font-semibold">{prop.projectTitle}</p>
                    <p className="text-xs text-[#777987]">
                      Status: {prop.status} · {prop.estimatedDuration}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs tabular-nums">
                      ${prop.proposedBudget.toLocaleString()}
                    </span>
                    {(prop.status === 'submitted' || prop.status === 'under_review') && (
                      <button
                        type="button"
                        onClick={() => updateProposal(prop.id, 'withdrawn')}
                        className="rounded-lg border border-black/10 dark:border-white/12 px-3 py-1 text-xs text-[#E36C76]"
                      >
                        {t.actions.withdraw}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
