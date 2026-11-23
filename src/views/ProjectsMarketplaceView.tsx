import React, { useCallback, useEffect, useState } from 'react';
import {
  Bookmark,
  Flag,
  Plus,
  Search,
  Share2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import type { ProjectRecord } from '../types/app';
import {
  formatBudget,
  sanitizeCsvSkills,
  validateProjectInput,
  validateProposalInput,
} from '../utils/domain';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LensSymbol } from '../components/BrandIcons';

export function ProjectsMarketplaceView() {
  const {
    firebaseUser,
    profile,
    categories,
    language,
    t,
    setAuthModalOpen,
    askLensWithPrompt,
    pushToast,
    triggerDataRefresh,
    refreshTrigger,
  } = useApp();

  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [selected, setSelected] = useState<ProjectRecord | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Filters
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [skillFilter, setSkillFilter] = useState('');
  const [experience, setExperience] = useState('all');
  const [projectType, setProjectType] = useState('all');
  const [remoteOnly, setRemoteOnly] = useState(false);

  // Create Project Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCategory, setFormCategory] = useState('software-engineering');
  const [formSkills, setFormSkills] = useState('');
  const [formBudgetType, setFormBudgetType] = useState<'fixed' | 'hourly'>('fixed');
  const [formBudgetMin, setFormBudgetMin] = useState('');
  const [formBudgetMax, setFormBudgetMax] = useState('');
  const [formDuration, setFormDuration] = useState('4 weeks');
  const [formExperience, setFormExperience] = useState('mid');
  const [formType, setFormType] = useState('one-time');
  const [formRemote, setFormRemote] = useState(true);
  const [formRequirements, setFormRequirements] = useState('');
  const [formDeadline, setFormDeadline] = useState('');

  // Proposal Modal
  const [proposalOpen, setProposalOpen] = useState(false);
  const [propApproach, setPropApproach] = useState('');
  const [propDuration, setPropDuration] = useState('');
  const [propBudget, setPropBudget] = useState('');
  const [propErrors, setPropErrors] = useState<Record<string, string>>({});
  const [propBusy, setPropBusy] = useState(false);

  // Report Modal
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('Inappropriate or misleading listing');
  const [reportDetails, setReportDetails] = useState('');

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (category !== 'all') params.set('category', category);
      if (skillFilter.trim()) params.set('skill', skillFilter.trim());
      if (experience !== 'all') params.set('experienceLevel', experience);
      if (projectType !== 'all') params.set('projectType', projectType);
      if (remoteOnly) params.set('remote', 'true');
      params.set('status', 'open');

      const res = await apiRequest<{ projects: ProjectRecord[] }>(`/api/projects?${params}`);
      const list = res.projects ?? [];
      setProjects(list);
      setSelected((prev) => {
        if (!list.length) return null;
        if (prev) {
          const match = list.find((p) => p.id === prev.id);
          if (match) return match;
        }
        return list[0];
      });
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to load projects.', 'error');
    } finally {
      setLoading(false);
    }
  }, [query, category, skillFilter, experience, projectType, remoteOnly, pushToast]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects, refreshTrigger]);

  useEffect(() => {
    if (!firebaseUser) {
      setSavedIds(new Set());
      return;
    }
    apiRequest<{ items: Array<{ itemType: string; itemId: string }> }>('/api/saved')
      .then((res) => {
        const ids = new Set(
          (res.items ?? []).filter((i) => i.itemType === 'project').map((i) => i.itemId),
        );
        setSavedIds(ids);
      })
      .catch(() => {});
  }, [firebaseUser, refreshTrigger]);

  const handleToggleSave = async (projectId: number) => {
    if (!firebaseUser) {
      setAuthModalOpen(true);
      return;
    }
    try {
      const res = await apiRequest<{ saved: boolean }>('/api/saved/toggle', {
        method: 'POST',
        body: JSON.stringify({ itemType: 'project', itemId: String(projectId) }),
      });
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (res.saved) next.add(String(projectId));
        else next.delete(String(projectId));
        return next;
      });
      pushToast(res.saved ? 'Saved project to your account.' : 'Removed from saved items.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to update saved items.', 'error');
    }
  };

  const handleValidateBeforePublish = (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateProjectInput({
      title: formTitle,
      description: formDesc,
      category: formCategory,
      budgetMin: formBudgetMin,
      budgetMax: formBudgetMax || null,
      duration: formDuration,
    });
    setCreateErrors(check.errors);
    if (!check.valid) return;
    setConfirmPublishOpen(true);
  };

  const handlePublishConfirmed = async () => {
    setCreateBusy(true);
    try {
      await apiRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          title: formTitle.trim(),
          description: formDesc.trim(),
          category: formCategory,
          skills: sanitizeCsvSkills(formSkills),
          budgetType: formBudgetType,
          budgetMin: Number(formBudgetMin),
          budgetMax: formBudgetMax ? Number(formBudgetMax) : null,
          duration: formDuration.trim(),
          experienceLevel: formExperience,
          projectType: formType,
          remote: formRemote,
          requirements: formRequirements.trim(),
          deadline: formDeadline || null,
          status: 'open',
        }),
      });
      setConfirmPublishOpen(false);
      setCreateOpen(false);
      setFormTitle('');
      setFormDesc('');
      setFormSkills('');
      setFormBudgetMin('');
      setFormBudgetMax('');
      setFormRequirements('');
      setFormDeadline('');
      triggerDataRefresh();
      pushToast('Project published to the marketplace.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to publish project.', 'error');
    } finally {
      setCreateBusy(false);
    }
  };

  const handleSubmitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const check = validateProposalInput({
      projectId: selected.id,
      approach: propApproach,
      estimatedDuration: propDuration,
      proposedBudget: propBudget,
    });
    setPropErrors(check.errors);
    if (!check.valid) return;

    setPropBusy(true);
    try {
      await apiRequest('/api/proposals', {
        method: 'POST',
        body: JSON.stringify({
          projectId: selected.id,
          approach: propApproach.trim(),
          estimatedDuration: propDuration.trim(),
          proposedBudget: Number(propBudget),
        }),
      });
      setProposalOpen(false);
      setPropApproach('');
      setPropDuration('');
      setPropBudget('');
      triggerDataRefresh();
      pushToast('Proposal submitted and client notified.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to submit proposal.', 'error');
    } finally {
      setPropBusy(false);
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    try {
      await apiRequest('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'project',
          targetId: String(selected.id),
          reason: reportReason,
          details: reportDetails,
        }),
      });
      setReportOpen(false);
      setReportDetails('');
      pushToast('Report submitted for moderation review.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to submit report.', 'error');
    }
  };

  const handleShare = async (project: ProjectRecord) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?project=${project.id}`);
      pushToast('Project link copied.', 'success');
    } catch {
      pushToast('Unable to copy link.', 'warning');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Filter Bar */}
      <div className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">{t.projects.title}</h2>
            <p className="text-xs text-[#777987]">{t.projects.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!firebaseUser) {
                setAuthModalOpen(true);
                return;
              }
              setCreateOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#7657E8] px-4 py-2 text-xs font-medium text-white hover:bg-[#6446d6] transition-colors whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t.actions.newProject}</span>
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-[#777987]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title or brief..."
              aria-label="Search projects"
              className="w-full rounded-xl border border-black/10 dark:border-white/12 bg-[#F9FAFC] dark:bg-[#101116] py-2 ps-9 pe-3 text-xs focus:border-[#7657E8] focus:outline-none"
            />
          </div>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter by category"
            className="rounded-xl border border-black/10 dark:border-white/12 bg-[#F9FAFC] dark:bg-[#101116] px-3 py-2 text-xs focus:border-[#7657E8] focus:outline-none"
          >
            <option value="all">{t.projects.allCategories}</option>
            {categories.map((cat) => (
              <option key={cat.slug} value={cat.slug}>
                {language === 'ar' ? cat.nameAr : cat.nameEn}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={skillFilter}
            onChange={(e) => setSkillFilter(e.target.value)}
            placeholder="Filter skill..."
            aria-label="Filter by skill"
            className="rounded-xl border border-black/10 dark:border-white/12 bg-[#F9FAFC] dark:bg-[#101116] px-3 py-2 text-xs focus:border-[#7657E8] focus:outline-none"
          />

          <select
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            aria-label="Filter by experience level"
            className="rounded-xl border border-black/10 dark:border-white/12 bg-[#F9FAFC] dark:bg-[#101116] px-3 py-2 text-xs focus:border-[#7657E8] focus:outline-none"
          >
            <option value="all">All Experience</option>
            <option value="entry">Entry</option>
            <option value="mid">Mid-level</option>
            <option value="senior">Senior</option>
            <option value="principal">Principal</option>
          </select>

          <div className="flex items-center gap-2">
            <select
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
              aria-label="Filter by project type"
              className="flex-1 rounded-xl border border-black/10 dark:border-white/12 bg-[#F9FAFC] dark:bg-[#101116] px-2.5 py-2 text-xs focus:border-[#7657E8] focus:outline-none"
            >
              <option value="all">All Types</option>
              <option value="one-time">One-time</option>
              <option value="ongoing">Ongoing</option>
              <option value="retainer">Retainer</option>
            </select>
            <label className="inline-flex items-center gap-1.5 text-xs text-[#777987] whitespace-nowrap cursor-pointer">
              <input
                type="checkbox"
                checked={remoteOnly}
                onChange={(e) => setRemoteOnly(e.target.checked)}
                className="accent-[#7657E8]"
              />
              <span>Remote</span>
            </label>
          </div>
        </div>
      </div>

      {/* Split Master-Detail Marketplace Layout */}
      <div className="grid gap-5 lg:grid-cols-12 items-start">
        {/* Project List (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] overflow-hidden">
          {loading ? (
            <div className="p-5 space-y-3">
              <div className="h-14 rounded-lg bg-black/5 dark:bg-white/5 animate-pulse" />
              <div className="h-14 rounded-lg bg-black/5 dark:bg-white/5 animate-pulse" />
              <div className="h-14 rounded-lg bg-black/5 dark:bg-white/5 animate-pulse" />
            </div>
          ) : projects.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium">{t.projects.emptyTitle}</p>
              <p className="mt-1 text-xs text-[#777987]">{t.projects.emptyDesc}</p>
            </div>
          ) : (
            <div className="divide-y divide-black/6 dark:divide-white/6 max-h-[680px] overflow-y-auto">
              {projects.map((p) => {
                const isSelected = selected?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelected(p)}
                    className={`w-full px-5 py-4 text-start transition-colors ${
                      isSelected
                        ? 'bg-[#7657E8]/8'
                        : 'hover:bg-[#F9FAFC] dark:hover:bg-white/3'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-semibold text-[#171820] dark:text-[#F2F3F7]">
                        {p.title}
                      </h3>
                      <span className="font-mono text-xs font-medium tabular-nums shrink-0 text-[#7657E8]">
                        {formatBudget(p.budgetType, p.budgetMin, p.budgetMax)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-[#777987]">{p.description}</p>
                    <div className="mt-2 text-[11px] text-[#777987]">
                      {p.category} · {p.duration} · {p.experienceLevel}
                      {p.remote ? ' · Remote' : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Sticky Specification Pane (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] p-6">
          {!selected ? (
            <div className="py-16 text-center text-xs text-[#777987]">
              Select a project from the list to inspect full scope, budget, and client details.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/6 dark:border-white/6 pb-5">
                <div className="space-y-1">
                  <p className="text-xs text-[#777987]">
                    {selected.category} · {selected.projectType} · Posted{' '}
                    {new Date(selected.createdAt).toLocaleDateString()}
                  </p>
                  <h3 className="font-display text-xl font-semibold tracking-tight">
                    {selected.title}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleToggleSave(selected.id)}
                    aria-label={savedIds.has(String(selected.id)) ? 'Remove saved project' : 'Save project'}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 ${
                      savedIds.has(String(selected.id))
                        ? 'border-[#7657E8] bg-[#7657E8]/10 text-[#7657E8]'
                        : 'border-black/10 dark:border-white/12 text-[#777987]'
                    }`}
                  >
                    <Bookmark className="h-3.5 w-3.5" />
                    <span>{savedIds.has(String(selected.id)) ? t.actions.saved : t.actions.save}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShare(selected)}
                    aria-label="Share project link"
                    className="rounded-lg border border-black/10 dark:border-white/12 p-2 text-[#777987] hover:text-[#171820] dark:hover:text-white"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!firebaseUser) {
                        setAuthModalOpen(true);
                        return;
                      }
                      setReportOpen(true);
                    }}
                    aria-label="Report listing"
                    className="rounded-lg border border-black/10 dark:border-white/12 p-2 text-[#777987] hover:text-[#E36C76]"
                  >
                    <Flag className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Structured Metadata Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-b border-black/6 dark:border-white/6 pb-5 text-xs">
                <div>
                  <span className="text-[#777987]">{t.projects.budget}</span>
                  <p className="mt-1 font-mono font-semibold tabular-nums">
                    {formatBudget(selected.budgetType, selected.budgetMin, selected.budgetMax)}
                  </p>
                </div>
                <div>
                  <span className="text-[#777987]">{t.projects.duration}</span>
                  <p className="mt-1 font-medium">{selected.duration}</p>
                </div>
                <div>
                  <span className="text-[#777987]">{t.projects.experience}</span>
                  <p className="mt-1 font-medium capitalize">{selected.experienceLevel}</p>
                </div>
                <div>
                  <span className="text-[#777987]">{t.projects.deadline}</span>
                  <p className="mt-1 font-mono tabular-nums">{selected.deadline || 'Flexible'}</p>
                </div>
              </div>

              {/* Description & Requirements */}
              <div className="space-y-4 text-sm leading-relaxed">
                <div>
                  <h4 className="text-xs font-semibold text-[#777987] mb-1.5">Project Brief</h4>
                  <p className="whitespace-pre-wrap text-[#171820] dark:text-[#E5E7F0]">
                    {selected.description}
                  </p>
                </div>

                {selected.requirements && (
                  <div>
                    <h4 className="text-xs font-semibold text-[#777987] mb-1.5">
                      {t.projects.requirements}
                    </h4>
                    <p className="whitespace-pre-wrap text-xs text-[#4B4D5A] dark:text-[#C4C6D2]">
                      {selected.requirements}
                    </p>
                  </div>
                )}

                {(selected.skills ?? []).length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-[#777987] mb-1.5">
                      {t.projects.skills}
                    </h4>
                    <p className="text-xs text-[#171820] dark:text-[#E5E7F0]">
                      {selected.skills.join(' · ')}
                    </p>
                  </div>
                )}
              </div>

              {/* Client Summary & Actions */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-black/6 dark:border-white/6 pt-5">
                <div className="text-xs">
                  <span className="text-[#777987]">{t.projects.clientInfo}: </span>
                  <span className="font-medium">{selected.client?.fullName || 'Client'}</span>
                  {selected.client?.country ? ` · ${selected.client.country}` : ''}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      askLensWithPrompt(
                        `Analyze project #${selected.id} ("${selected.title}") and tell me how well it matches my skills and what approach I should take.`,
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 dark:border-white/12 px-3.5 py-2 text-xs font-medium hover:border-[#7657E8]/50 whitespace-nowrap"
                  >
                    <LensSymbol className="h-3.5 w-3.5 text-[#7657E8]" />
                    <span>{t.actions.askLens}</span>
                  </button>

                  {selected.clientUid !== profile?.uid && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!firebaseUser) {
                          setAuthModalOpen(true);
                          return;
                        }
                        setPropBudget(String(selected.budgetMin));
                        setPropDuration(selected.duration);
                        setProposalOpen(true);
                      }}
                      className="rounded-xl bg-[#7657E8] px-4 py-2 text-xs font-medium text-white hover:bg-[#6446d6] transition-colors whitespace-nowrap"
                    >
                      {t.projects.submitProposal}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Project Modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-project-heading"
        >
          <div className="glass-popover w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-black/8 dark:border-white/8">
              <h3 id="create-project-heading" className="text-base font-semibold">
                {t.projects.createTitle}
              </h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label="Close publish project modal"
                className="rounded-lg p-1.5 text-[#777987]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleValidateBeforePublish} className="mt-4 space-y-4">
              <div>
                <label htmlFor="proj-title" className="block text-xs font-medium text-[#777987] mb-1">
                  Project title
                </label>
                <input
                  id="proj-title"
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Design System & Web Architecture for B2B Portal"
                  className="w-full rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm focus:border-[#7657E8] focus:outline-none"
                />
                {createErrors.title && (
                  <p className="mt-1 text-xs text-[#E36C76]">{createErrors.title}</p>
                )}
              </div>

              <div>
                <label htmlFor="proj-desc" className="block text-xs font-medium text-[#777987] mb-1">
                  Description
                </label>
                <textarea
                  id="proj-desc"
                  rows={4}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Outline project scope, deliverables, and success criteria..."
                  className="w-full rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm focus:border-[#7657E8] focus:outline-none"
                />
                {createErrors.description && (
                  <p className="mt-1 text-xs text-[#E36C76]">{createErrors.description}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="proj-cat" className="block text-xs font-medium text-[#777987] mb-1">
                    Category
                  </label>
                  <select
                    id="proj-cat"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm"
                  >
                    {categories.map((cat) => (
                      <option key={cat.slug} value={cat.slug}>
                        {language === 'ar' ? cat.nameAr : cat.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="proj-skills" className="block text-xs font-medium text-[#777987] mb-1">
                    Required skills (comma-separated)
                  </label>
                  <input
                    id="proj-skills"
                    type="text"
                    value={formSkills}
                    onChange={(e) => setFormSkills(e.target.value)}
                    placeholder="TypeScript, React, PostgreSQL"
                    className="w-full rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="proj-btype" className="block text-xs font-medium text-[#777987] mb-1">
                    Budget Type
                  </label>
                  <select
                    id="proj-btype"
                    value={formBudgetType}
                    onChange={(e) => setFormBudgetType(e.target.value as 'fixed' | 'hourly')}
                    className="w-full rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm"
                  >
                    <option value="fixed">Fixed Price</option>
                    <option value="hourly">Hourly</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="proj-bmin" className="block text-xs font-medium text-[#777987] mb-1">
                    Min Budget (USD)
                  </label>
                  <input
                    id="proj-bmin"
                    type="number"
                    min={1}
                    value={formBudgetMin}
                    onChange={(e) => setFormBudgetMin(e.target.value)}
                    className="w-full rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm font-mono"
                  />
                  {createErrors.budgetMin && (
                    <p className="mt-1 text-xs text-[#E36C76]">{createErrors.budgetMin}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="proj-bmax" className="block text-xs font-medium text-[#777987] mb-1">
                    Max Budget (USD)
                  </label>
                  <input
                    id="proj-bmax"
                    type="number"
                    min={1}
                    value={formBudgetMax}
                    onChange={(e) => setFormBudgetMax(e.target.value)}
                    className="w-full rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm font-mono"
                  />
                  {createErrors.budgetMax && (
                    <p className="mt-1 text-xs text-[#E36C76]">{createErrors.budgetMax}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="proj-dur" className="block text-xs font-medium text-[#777987] mb-1">
                    Duration
                  </label>
                  <input
                    id="proj-dur"
                    type="text"
                    value={formDuration}
                    onChange={(e) => setFormDuration(e.target.value)}
                    className="w-full rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="proj-exp" className="block text-xs font-medium text-[#777987] mb-1">
                    Experience
                  </label>
                  <select
                    id="proj-exp"
                    value={formExperience}
                    onChange={(e) => setFormExperience(e.target.value)}
                    className="w-full rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm"
                  >
                    <option value="entry">Entry</option>
                    <option value="mid">Mid-level</option>
                    <option value="senior">Senior</option>
                    <option value="principal">Principal</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="proj-deadline" className="block text-xs font-medium text-[#777987] mb-1">
                    Deadline
                  </label>
                  <input
                    id="proj-deadline"
                    type="date"
                    value={formDeadline}
                    onChange={(e) => setFormDeadline(e.target.value)}
                    className="w-full rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="proj-req" className="block text-xs font-medium text-[#777987] mb-1">
                  Deliverables & Requirements
                </label>
                <textarea
                  id="proj-req"
                  rows={2}
                  value={formRequirements}
                  onChange={(e) => setFormRequirements(e.target.value)}
                  className="w-full rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="inline-flex items-center gap-2 text-xs text-[#777987]">
                  <input
                    type="checkbox"
                    checked={formRemote}
                    onChange={(e) => setFormRemote(e.target.checked)}
                    className="accent-[#7657E8]"
                  />
                  <span>Remote collaboration supported</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="rounded-lg border border-black/10 dark:border-white/12 px-4 py-2 text-xs font-medium"
                  >
                    {t.actions.cancel}
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-[#7657E8] px-4 py-2 text-xs font-medium text-white hover:bg-[#6446d6]"
                  >
                    Review & Publish
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Proposal Modal */}
      {proposalOpen && selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="proposal-modal-title"
        >
          <div className="glass-popover w-full max-w-lg rounded-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-black/8 dark:border-white/8">
              <h3 id="proposal-modal-title" className="text-base font-semibold">
                Submit Proposal — {selected.title}
              </h3>
              <button
                type="button"
                onClick={() => setProposalOpen(false)}
                aria-label="Close proposal modal"
                className="rounded-lg p-1.5 text-[#777987]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitProposal} className="mt-4 space-y-4">
              <div>
                <label htmlFor="prop-approach" className="block text-xs font-medium text-[#777987] mb-1">
                  Technical & Delivery Approach
                </label>
                <textarea
                  id="prop-approach"
                  rows={4}
                  value={propApproach}
                  onChange={(e) => setPropApproach(e.target.value)}
                  placeholder="Detail your methodology, key milestones, and relevant experience..."
                  className="w-full rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm"
                />
                {propErrors.approach && (
                  <p className="mt-1 text-xs text-[#E36C76]">{propErrors.approach}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="prop-budget" className="block text-xs font-medium text-[#777987] mb-1">
                    Proposed Budget (USD)
                  </label>
                  <input
                    id="prop-budget"
                    type="number"
                    min={1}
                    value={propBudget}
                    onChange={(e) => setPropBudget(e.target.value)}
                    className="w-full rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm font-mono"
                  />
                  {propErrors.proposedBudget && (
                    <p className="mt-1 text-xs text-[#E36C76]">{propErrors.proposedBudget}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="prop-duration" className="block text-xs font-medium text-[#777987] mb-1">
                    Estimated Duration
                  </label>
                  <input
                    id="prop-duration"
                    type="text"
                    value={propDuration}
                    onChange={(e) => setPropDuration(e.target.value)}
                    placeholder="3 weeks"
                    className="w-full rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm"
                  />
                  {propErrors.estimatedDuration && (
                    <p className="mt-1 text-xs text-[#E36C76]">{propErrors.estimatedDuration}</p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setProposalOpen(false)}
                  className="rounded-lg border border-black/10 dark:border-white/12 px-4 py-2 text-xs font-medium"
                >
                  {t.actions.cancel}
                </button>
                <button
                  type="submit"
                  disabled={propBusy}
                  className="rounded-lg bg-[#7657E8] px-4 py-2 text-xs font-medium text-white hover:bg-[#6446d6] disabled:opacity-50"
                >
                  {propBusy ? 'Submitting...' : t.projects.submitProposal}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {reportOpen && selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="glass-popover w-full max-w-md rounded-2xl p-6">
            <h3 className="text-base font-semibold">Report Listing</h3>
            <form onSubmit={handleReportSubmit} className="mt-4 space-y-3">
              <div>
                <label htmlFor="rep-reason" className="block text-xs text-[#777987] mb-1">
                  Reason
                </label>
                <input
                  id="rep-reason"
                  type="text"
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="rep-details" className="block text-xs text-[#777987] mb-1">
                  Details
                </label>
                <textarea
                  id="rep-details"
                  rows={3}
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  className="w-full rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReportOpen(false)}
                  className="rounded-lg border border-black/10 dark:border-white/12 px-3 py-1.5 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#E36C76] px-3.5 py-1.5 text-xs font-medium text-white"
                >
                  Submit Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmPublishOpen}
        title={t.projects.confirmPublishTitle}
        description={t.projects.confirmPublishBody}
        confirmLabel="Publish Project"
        cancelLabel={t.actions.cancel}
        busy={createBusy}
        onConfirm={handlePublishConfirmed}
        onCancel={() => setConfirmPublishOpen(false)}
      />
    </div>
  );
}
