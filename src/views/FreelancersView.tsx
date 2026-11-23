import React, { useCallback, useEffect, useState } from 'react';
import { Bookmark, ExternalLink, MessageSquare, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import type { FreelancerSummary } from '../types/app';
import { LensSymbol } from '../components/BrandIcons';

export function FreelancersView() {
  const {
    firebaseUser,
    categories,
    language,
    t,
    setAuthModalOpen,
    openDirectMessageWith,
    askLensWithPrompt,
    pushToast,
    refreshTrigger,
  } = useApp();

  const [freelancers, setFreelancers] = useState<FreelancerSummary[]>([]);
  const [selected, setSelected] = useState<FreelancerSummary | null>(null);
  const [savedUids, setSavedUids] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [skill, setSkill] = useState('');
  const [category, setCategory] = useState('all');
  const [availability, setAvailability] = useState('all');
  const [experience, setExperience] = useState('all');

  const loadFreelancers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (skill.trim()) params.set('skill', skill.trim());
      if (category !== 'all') params.set('category', category);
      if (availability !== 'all') params.set('availability', availability);
      if (experience !== 'all') params.set('experienceLevel', experience);

      const res = await apiRequest<{ freelancers: FreelancerSummary[] }>(
        `/api/freelancers?${params}`,
      );
      const list = res.freelancers ?? [];
      setFreelancers(list);
      setSelected((prev) => {
        if (!list.length) return null;
        if (prev) {
          const match = list.find((f) => f.uid === prev.uid);
          if (match) return match;
        }
        return list[0];
      });
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to load freelancers.', 'error');
    } finally {
      setLoading(false);
    }
  }, [query, skill, category, availability, experience, pushToast]);

  useEffect(() => {
    loadFreelancers();
  }, [loadFreelancers, refreshTrigger]);

  useEffect(() => {
    if (!firebaseUser) {
      setSavedUids(new Set());
      return;
    }
    apiRequest<{ items: Array<{ itemType: string; itemId: string }> }>('/api/saved')
      .then((res) => {
        setSavedUids(
          new Set((res.items ?? []).filter((i) => i.itemType === 'freelancer').map((i) => i.itemId)),
        );
      })
      .catch(() => {});
  }, [firebaseUser, refreshTrigger]);

  const handleToggleSave = async (uid: string) => {
    if (!firebaseUser) {
      setAuthModalOpen(true);
      return;
    }
    try {
      const res = await apiRequest<{ saved: boolean }>('/api/saved/toggle', {
        method: 'POST',
        body: JSON.stringify({ itemType: 'freelancer', itemId: uid }),
      });
      setSavedUids((prev) => {
        const next = new Set(prev);
        if (res.saved) next.add(uid);
        else next.delete(uid);
        return next;
      });
      pushToast(res.saved ? 'Saved freelancer profile.' : 'Removed from saved items.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to save freelancer.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      {/* Directory Filter Bar */}
      <div className="rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] p-5 space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold">{t.freelancers.title}</h2>
          <p className="text-xs text-[#777987]">{t.freelancers.subtitle}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-[#777987]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or title..."
              aria-label="Search freelancers"
              className="w-full rounded-xl border border-black/10 dark:border-white/12 bg-[#F9FAFC] dark:bg-[#101116] py-2 ps-9 pe-3 text-xs focus:border-[#7657E8] focus:outline-none"
            />
          </div>

          <input
            type="text"
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            placeholder="Skill (e.g. React, UI)"
            aria-label="Filter freelancers by skill"
            className="rounded-xl border border-black/10 dark:border-white/12 bg-[#F9FAFC] dark:bg-[#101116] px-3 py-2 text-xs focus:border-[#7657E8] focus:outline-none"
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter freelancers by category"
            className="rounded-xl border border-black/10 dark:border-white/12 bg-[#F9FAFC] dark:bg-[#101116] px-3 py-2 text-xs"
          >
            <option value="all">{t.projects.allCategories}</option>
            {categories.map((cat) => (
              <option key={cat.slug} value={cat.slug}>
                {language === 'ar' ? cat.nameAr : cat.nameEn}
              </option>
            ))}
          </select>

          <select
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            aria-label="Filter by availability"
            className="rounded-xl border border-black/10 dark:border-white/12 bg-[#F9FAFC] dark:bg-[#101116] px-3 py-2 text-xs"
          >
            <option value="all">All Availability</option>
            <option value="available">Available</option>
            <option value="busy">Busy</option>
            <option value="offline">Offline / Sleep</option>
          </select>

          <select
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            aria-label="Filter by experience"
            className="rounded-xl border border-black/10 dark:border-white/12 bg-[#F9FAFC] dark:bg-[#101116] px-3 py-2 text-xs"
          >
            <option value="all">All Experience</option>
            <option value="entry">Entry</option>
            <option value="mid">Mid-level</option>
            <option value="senior">Senior</option>
            <option value="principal">Principal</option>
          </select>
        </div>
      </div>

      {/* Directory List + Inspector Split */}
      <div className="grid gap-5 lg:grid-cols-12 items-start">
        <div className="lg:col-span-6 rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] overflow-hidden">
          {loading ? (
            <div className="p-5 space-y-3">
              <div className="h-14 rounded-lg bg-black/5 dark:bg-white/5 animate-pulse" />
              <div className="h-14 rounded-lg bg-black/5 dark:bg-white/5 animate-pulse" />
            </div>
          ) : freelancers.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium">{t.freelancers.emptyTitle}</p>
              <p className="mt-1 text-xs text-[#777987]">{t.freelancers.emptyDesc}</p>
            </div>
          ) : (
            <div className="divide-y divide-black/6 dark:divide-white/6">
              {freelancers.map((f) => {
                const isSelected = selected?.uid === f.uid;
                return (
                  <button
                    key={f.uid}
                    type="button"
                    onClick={() => setSelected(f)}
                    className={`flex w-full items-start gap-3.5 px-5 py-4 text-start transition-colors ${
                      isSelected ? 'bg-[#7657E8]/8' : 'hover:bg-[#F9FAFC] dark:hover:bg-white/3'
                    }`}
                  >
                    {f.photoUrl ? (
                      <img
                        src={f.photoUrl}
                        alt={f.fullName}
                        referrerPolicy="no-referrer"
                        className="h-10 w-10 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7657E8]/15 font-semibold text-sm text-[#7657E8] shrink-0">
                        {f.fullName.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold truncate">{f.fullName}</p>
                        <span
                          className={`text-xs font-medium shrink-0 ${
                            f.availability === 'available'
                              ? 'text-[#39B982]'
                              : f.availability === 'busy'
                                ? 'text-[#E6AE53]'
                                : 'text-[#777987]'
                          }`}
                        >
                          {f.availability}
                        </span>
                      </div>
                      <p className="text-xs text-[#777987] truncate">
                        {f.title || 'Independent Professional'}
                        {f.country ? ` · ${f.country}` : ''}
                      </p>
                      {(f.skills ?? []).length > 0 && (
                        <p className="mt-1.5 text-[11px] text-[#777987] truncate">
                          {f.skills.slice(0, 5).join(' · ')}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-6 rounded-2xl border border-black/8 dark:border-white/8 bg-white dark:bg-[#1A1C24] p-6">
          {!selected ? (
            <div className="py-16 text-center text-xs text-[#777987]">
              Select a freelancer to inspect their profile, skills, and portfolio items.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4 border-b border-black/6 dark:border-white/6 pb-5">
                <div className="flex items-center gap-3.5">
                  {selected.photoUrl ? (
                    <img
                      src={selected.photoUrl}
                      alt={selected.fullName}
                      referrerPolicy="no-referrer"
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#7657E8] text-base font-semibold text-white">
                      {selected.fullName.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div>
                    <h3 className="font-display text-lg font-semibold">{selected.fullName}</h3>
                    <p className="text-xs text-[#777987]">
                      {selected.title || 'Independent Professional'} · {selected.experienceLevel}
                      {selected.hourlyRate ? ` · $${selected.hourlyRate}/hr` : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSave(selected.uid)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    savedUids.has(selected.uid)
                      ? 'border-[#7657E8] bg-[#7657E8]/10 text-[#7657E8]'
                      : 'border-black/10 dark:border-white/12 text-[#777987]'
                  }`}
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  <span>{savedUids.has(selected.uid) ? t.actions.saved : t.actions.save}</span>
                </button>
              </div>

              {selected.bio && (
                <div>
                  <h4 className="text-xs font-semibold text-[#777987] mb-1">Biography</h4>
                  <p className="text-sm leading-relaxed text-[#171820] dark:text-[#E5E7F0]">
                    {selected.bio}
                  </p>
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold text-[#777987] mb-1">Skills</h4>
                <p className="text-xs text-[#171820] dark:text-[#E5E7F0]">
                  {(selected.skills ?? []).length > 0
                    ? selected.skills.join(' · ')
                    : 'No skills listed yet.'}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-[#777987] mb-2">
                  {t.freelancers.portfolio}
                </h4>
                {(selected.portfolio ?? []).length === 0 ? (
                  <p className="text-xs text-[#777987]">No portfolio entries added yet.</p>
                ) : (
                  <div className="divide-y divide-black/6 dark:divide-white/6 rounded-xl border border-black/8 dark:border-white/8">
                    {selected.portfolio.map((item) => (
                      <div key={item.id} className="p-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold">{item.title}</p>
                          {item.url && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-[#7657E8] hover:underline"
                            >
                              <span>Open</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-[#777987]">{item.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-black/6 dark:border-white/6">
                <button
                  type="button"
                  onClick={() => {
                    if (!firebaseUser) {
                      setAuthModalOpen(true);
                      return;
                    }
                    openDirectMessageWith(selected.uid);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#7657E8] px-4 py-2 text-xs font-medium text-white hover:bg-[#6446d6]"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>{t.actions.contact}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    askLensWithPrompt(
                      `Evaluate freelancer ${selected.fullName} (UID ${selected.uid}) for relevance to my active projects and requirements.`,
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 dark:border-white/12 px-3.5 py-2 text-xs font-medium hover:border-[#7657E8]/50"
                >
                  <LensSymbol className="h-3.5 w-3.5 text-[#7657E8]" />
                  <span>{t.freelancers.evaluateWithLens}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
