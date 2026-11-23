import React, { useEffect, useState } from 'react';
import {
  Bell,
  LogOut,
  Moon,
  Palette,
  Plus,
  Shield,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  User,
} from 'lucide-react';
import { useApp, type ThemeSetting } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import {
  DEFAULT_USER_PREFERENCES,
  type PortfolioItem,
  type UserPreferences,
  type WorkHistoryItem,
} from '../db/schema';
import type { UserProfile } from '../types/app';
import type { AccountType, AvailabilityStatus } from '../utils/domain';

type SettingsSection = 'account' | 'appearance' | 'preferences' | 'notifications' | 'privacy' | 'ai';

export function SettingsView() {
  const {
    firebaseUser,
    profile,
    refreshProfile,
    setAuthModalOpen,
    handleSignOut,
    theme,
    setTheme,
    language,
    setLanguage,
    switchMode,
    pushToast,
    t,
  } = useApp();

  const [section, setSection] = useState<SettingsSection>('account');
  const [saving, setSaving] = useState(false);

  // Profile fields
  const [fullName, setFullName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('freelancer');
  const [title, setTitle] = useState('');
  const [bio, setBio] = useState('');
  const [country, setCountry] = useState('');
  const [availability, setAvailability] = useState<AvailabilityStatus>('available');
  const [experienceLevel, setExperienceLevel] = useState('mid');
  const [hourlyRate, setHourlyRate] = useState('');
  const [skillsText, setSkillsText] = useState('');
  const [website, setWebsite] = useState('');
  const [github, setGithub] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [workHistory, setWorkHistory] = useState<WorkHistoryItem[]>([]);

  // Quick add portfolio / work history
  const [newPortTitle, setNewPortTitle] = useState('');
  const [newPortUrl, setNewPortUrl] = useState('');
  const [newPortDesc, setNewPortDesc] = useState('');
  const [newWorkRole, setNewWorkRole] = useState('');
  const [newWorkOrg, setNewWorkOrg] = useState('');
  const [newWorkPeriod, setNewWorkPeriod] = useState('');

  // Preferences
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_USER_PREFERENCES);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.fullName || '');
    setAccountType(profile.accountType || 'freelancer');
    setTitle(profile.title || '');
    setBio(profile.bio || '');
    setCountry(profile.country || '');
    setAvailability(profile.availability || 'available');
    setExperienceLevel(profile.experienceLevel || 'mid');
    setHourlyRate(profile.hourlyRate ? String(profile.hourlyRate) : '');
    setSkillsText((profile.skills || []).join(', '));
    setWebsite(profile.socialLinks?.website || '');
    setGithub(profile.socialLinks?.github || '');
    setLinkedin(profile.socialLinks?.linkedin || '');
    setPortfolio(profile.portfolio || []);
    setWorkHistory(profile.workHistory || []);
    if (profile.preferences) {
      setPrefs(profile.preferences);
    }
  }, [profile]);

  const saveProfile = async (patch: Record<string, unknown>, successMsg = 'Settings saved.') => {
    if (!firebaseUser) {
      setAuthModalOpen(true);
      return;
    }
    setSaving(true);
    try {
      await apiRequest<{ user: UserProfile }>('/api/profile', {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      await refreshProfile();
      pushToast(successMsg, 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Unable to save settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedSkills = skillsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    await saveProfile(
      {
        fullName: fullName.trim() || profile?.fullName,
        accountType,
        title: title.trim(),
        bio: bio.trim(),
        country: country.trim(),
        availability,
        experienceLevel,
        hourlyRate: hourlyRate.trim() ? Number(hourlyRate) : null,
        skills: parsedSkills,
        socialLinks: {
          website: website.trim() || undefined,
          github: github.trim() || undefined,
          linkedin: linkedin.trim() || undefined,
        },
        portfolio,
        workHistory,
        onboardingCompleted: true,
      },
      'Account profile updated.',
    );
  };

  const updatePref = async <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    if (firebaseUser) {
      await saveProfile({ preferences: { [key]: value } }, 'Preference updated.');
    }
  };

  const navItems: Array<{ id: SettingsSection; label: string; icon: React.ReactNode }> = [
    { id: 'account', label: t.settings.account, icon: <User className="h-4 w-4" /> },
    { id: 'appearance', label: t.settings.appearance, icon: <Palette className="h-4 w-4" /> },
    { id: 'preferences', label: t.settings.preferences, icon: <Sliders className="h-4 w-4" /> },
    { id: 'notifications', label: t.settings.notifications, icon: <Bell className="h-4 w-4" /> },
    { id: 'privacy', label: t.settings.privacy, icon: <Shield className="h-4 w-4" /> },
    { id: 'ai', label: t.settings.ai, icon: <Sparkles className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-[#171820] dark:text-[#F2F3F7]">
          {t.settings.title}
        </h1>
        <p className="mt-1 text-sm text-[#777987] dark:text-[#9B9EAC]">
          Manage your Firework AI profile, theme, bilingual interface, privacy, and Lens AI controls.
        </p>
      </header>

      {/* macOS System Settings 2-pane layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="h-fit rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-2">
          <nav className="space-y-0.5">
            {navItems.map((item) => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[#7657E8] text-white'
                      : 'text-[#171820] dark:text-[#F2F3F7] hover:bg-[#F5F6F8] dark:hover:bg-white/[0.06]'
                  }`}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {firebaseUser && (
            <div className="mt-3 border-t border-black/[0.06] dark:border-white/[0.08] pt-2">
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-[#E36C76] hover:bg-[#E36C76]/10 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span>{t.actions.signOut}</span>
              </button>
            </div>
          )}
        </aside>

        <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24] p-6">
          {/* ACCOUNT & PROFILE */}
          {section === 'account' &&
            (!firebaseUser ? (
              <div className="py-8 text-center">
                <p className="text-sm text-[#777987] dark:text-[#9B9EAC]">
                  Sign in to configure your professional profile, portfolio, and skills.
                </p>
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true)}
                  className="mt-4 rounded-lg bg-[#7657E8] px-4 py-2 text-sm font-medium text-white hover:bg-[#6446d6]"
                >
                  {language === 'ar' ? 'تسجيل الدخول' : 'Sign In'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleAccountSubmit} className="space-y-6">
                <div>
                  <h2 className="text-base font-semibold text-[#171820] dark:text-[#F2F3F7]">
                    {t.settings.account}
                  </h2>
                  <p className="mt-0.5 text-xs text-[#777987] dark:text-[#9B9EAC]">
                    {profile?.email} · Role: {profile?.role}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-[#777987] dark:text-[#9B9EAC]">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#777987] dark:text-[#9B9EAC]">
                      Account Type
                    </label>
                    <select
                      value={accountType}
                      onChange={(e) => setAccountType(e.target.value as AccountType)}
                      className="mt-1 w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                    >
                      <option value="freelancer">{t.roles.freelancer}</option>
                      <option value="client">{t.roles.client}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#777987] dark:text-[#9B9EAC]">
                      Professional Title
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Senior Full-Stack Engineer"
                      className="mt-1 w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#777987] dark:text-[#9B9EAC]">
                      Country / Timezone
                    </label>
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="e.g. Saudi Arabia / Remote"
                      className="mt-1 w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#777987] dark:text-[#9B9EAC]">
                      Availability
                    </label>
                    <select
                      value={availability}
                      onChange={(e) => setAvailability(e.target.value as AvailabilityStatus)}
                      className="mt-1 w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                    >
                      <option value="available">{t.modes.available}</option>
                      <option value="busy">{t.modes.busy}</option>
                      <option value="offline">{t.modes.offline}</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#777987] dark:text-[#9B9EAC]">
                        Experience
                      </label>
                      <select
                        value={experienceLevel}
                        onChange={(e) => setExperienceLevel(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                      >
                        <option value="junior">Junior</option>
                        <option value="mid">Mid-level</option>
                        <option value="senior">Senior</option>
                        <option value="lead">Lead / Principal</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#777987] dark:text-[#9B9EAC]">
                        Hourly Rate (USD)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={hourlyRate}
                        onChange={(e) => setHourlyRate(e.target.value)}
                        placeholder="75"
                        className="mt-1 w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#777987] dark:text-[#9B9EAC]">
                    Bio & Expertise Summary
                  </label>
                  <textarea
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Concise overview of your focus areas and delivery track record..."
                    className="mt-1 w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#777987] dark:text-[#9B9EAC]">
                    Skills (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={skillsText}
                    onChange={(e) => setSkillsText(e.target.value)}
                    placeholder="React, TypeScript, PostgreSQL, UI Architecture"
                    className="mt-1 w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="Website URL"
                    className="rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-xs text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                  />
                  <input
                    type="url"
                    value={github}
                    onChange={(e) => setGithub(e.target.value)}
                    placeholder="GitHub URL"
                    className="rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-xs text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                  />
                  <input
                    type="url"
                    value={linkedin}
                    onChange={(e) => setLinkedin(e.target.value)}
                    placeholder="LinkedIn URL"
                    className="rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-xs text-[#171820] dark:text-[#F2F3F7] focus:border-[#7657E8] focus:outline-none"
                  />
                </div>

                {/* Portfolio Editor */}
                <div className="border-t border-black/[0.06] dark:border-white/[0.08] pt-5 space-y-3">
                  <h3 className="text-sm font-semibold text-[#171820] dark:text-[#F2F3F7]">
                    Portfolio Items ({portfolio.length})
                  </h3>
                  {portfolio.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 rounded-xl bg-[#F5F6F8] dark:bg-[#101116] px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#171820] dark:text-[#F2F3F7]">
                          {item.title}
                        </p>
                        <p className="text-xs text-[#777987]">{item.description}</p>
                        {item.url && <p className="text-[11px] text-[#7657E8]">{item.url}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPortfolio((prev) => prev.filter((p) => p.id !== item.id))}
                        className="rounded-lg p-1 text-[#777987] hover:text-[#E36C76]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      type="text"
                      value={newPortTitle}
                      onChange={(e) => setNewPortTitle(e.target.value)}
                      placeholder="Project title"
                      className="rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-1.5 text-xs text-[#171820] dark:text-[#F2F3F7]"
                    />
                    <input
                      type="url"
                      value={newPortUrl}
                      onChange={(e) => setNewPortUrl(e.target.value)}
                      placeholder="https://case-study..."
                      className="rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-1.5 text-xs text-[#171820] dark:text-[#F2F3F7]"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newPortDesc}
                        onChange={(e) => setNewPortDesc(e.target.value)}
                        placeholder="Short outcome"
                        className="min-w-0 flex-1 rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-1.5 text-xs text-[#171820] dark:text-[#F2F3F7]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!newPortTitle.trim()) return;
                          setPortfolio((prev) => [
                            ...prev,
                            {
                              id: String(Date.now()),
                              title: newPortTitle.trim(),
                              url: newPortUrl.trim(),
                              description: newPortDesc.trim(),
                              category: 'general',
                              year: String(new Date().getFullYear()),
                            },
                          ]);
                          setNewPortTitle('');
                          setNewPortUrl('');
                          setNewPortDesc('');
                        }}
                        className="inline-flex items-center rounded-lg border border-black/10 dark:border-white/10 px-2.5 py-1.5 text-xs font-medium text-[#171820] dark:text-[#F2F3F7] hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Work History Editor */}
                <div className="border-t border-black/[0.06] dark:border-white/[0.08] pt-5 space-y-3">
                  <h3 className="text-sm font-semibold text-[#171820] dark:text-[#F2F3F7]">
                    Work History ({workHistory.length})
                  </h3>
                  {workHistory.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 rounded-xl bg-[#F5F6F8] dark:bg-[#101116] px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#171820] dark:text-[#F2F3F7]">
                          {item.role} · {item.company}
                        </p>
                        <p className="text-[11px] text-[#777987]">{item.period}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWorkHistory((prev) => prev.filter((w) => w.id !== item.id))}
                        className="rounded-lg p-1 text-[#777987] hover:text-[#E36C76]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      type="text"
                      value={newWorkRole}
                      onChange={(e) => setNewWorkRole(e.target.value)}
                      placeholder="Role"
                      className="rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-1.5 text-xs text-[#171820] dark:text-[#F2F3F7]"
                    />
                    <input
                      type="text"
                      value={newWorkOrg}
                      onChange={(e) => setNewWorkOrg(e.target.value)}
                      placeholder="Organization"
                      className="rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-1.5 text-xs text-[#171820] dark:text-[#F2F3F7]"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newWorkPeriod}
                        onChange={(e) => setNewWorkPeriod(e.target.value)}
                        placeholder="2023 - Present"
                        className="min-w-0 flex-1 rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-1.5 text-xs text-[#171820] dark:text-[#F2F3F7]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!newWorkRole.trim() || !newWorkOrg.trim()) return;
                          setWorkHistory((prev) => [
                            ...prev,
                            {
                              id: String(Date.now()),
                              role: newWorkRole.trim(),
                              company: newWorkOrg.trim(),
                              period: newWorkPeriod.trim(),
                              summary: '',
                            },
                          ]);
                          setNewWorkRole('');
                          setNewWorkOrg('');
                          setNewWorkPeriod('');
                        }}
                        className="inline-flex items-center rounded-lg border border-black/10 dark:border-white/10 px-2.5 py-1.5 text-xs font-medium text-[#171820] dark:text-[#F2F3F7] hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-[#7657E8] px-5 py-2 text-sm font-medium text-white hover:bg-[#6446d6] disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : t.actions.save}
                  </button>
                </div>
              </form>
            ))}

          {/* APPEARANCE */}
          {section === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-[#171820] dark:text-[#F2F3F7]">
                  {t.settings.appearance}
                </h2>
                <p className="mt-1 text-xs text-[#777987] dark:text-[#9B9EAC]">
                  Choose between Light, Dark, or macOS System appearance and interface density.
                </p>
              </div>

              <div className="space-y-2.5">
                <label className="block text-xs font-medium text-[#777987] dark:text-[#9B9EAC]">
                  Theme Mode
                </label>
                <div className="grid grid-cols-3 gap-2.5 max-w-md">
                  {(['light', 'dark', 'system'] as ThemeSetting[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setTheme(mode)}
                      className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                        theme === mode
                          ? 'border-[#7657E8] bg-[#7657E8] text-white'
                          : 'border-black/10 dark:border-white/10 text-[#171820] dark:text-[#F2F3F7] hover:bg-[#F5F6F8] dark:hover:bg-white/[0.06]'
                      }`}
                    >
                      {mode === 'light' && <Sun className="h-4 w-4" />}
                      {mode === 'dark' && <Moon className="h-4 w-4" />}
                      <span>
                        {mode === 'light'
                          ? t.settings.light
                          : mode === 'dark'
                            ? t.settings.dark
                            : t.settings.system}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <label className="block text-xs font-medium text-[#777987] dark:text-[#9B9EAC]">
                  Interface Density
                </label>
                <div className="grid grid-cols-2 gap-2.5 max-w-sm">
                  {(['comfortable', 'compact'] as const).map((density) => (
                    <button
                      key={density}
                      type="button"
                      onClick={() => updatePref('density', density)}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                        prefs.density === density
                          ? 'border-[#7657E8] bg-[#7657E8] text-white'
                          : 'border-black/10 dark:border-white/10 text-[#171820] dark:text-[#F2F3F7] hover:bg-[#F5F6F8] dark:hover:bg-white/[0.06]'
                      }`}
                    >
                      {density === 'comfortable' ? t.settings.comfortable : t.settings.compact}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* PREFERENCES & MODES */}
          {section === 'preferences' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-[#171820] dark:text-[#F2F3F7]">
                  {t.settings.preferences}
                </h2>
                <p className="mt-1 text-xs text-[#777987] dark:text-[#9B9EAC]">
                  Switch between English (LTR) and Arabic (RTL), and manage Work Mode / Sleep Mode behavior.
                </p>
              </div>

              <div className="space-y-2.5">
                <label className="block text-xs font-medium text-[#777987] dark:text-[#9B9EAC]">
                  Display Language & Layout Direction
                </label>
                <div className="grid grid-cols-2 gap-2.5 max-w-sm">
                  <button
                    type="button"
                    onClick={() => setLanguage('en')}
                    className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
                      language === 'en'
                        ? 'border-[#7657E8] bg-[#7657E8] text-white'
                        : 'border-black/10 dark:border-white/10 text-[#171820] dark:text-[#F2F3F7]'
                    }`}
                  >
                    {t.settings.english} (LTR)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLanguage('ar')}
                    className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
                      language === 'ar'
                        ? 'border-[#7657E8] bg-[#7657E8] text-white'
                        : 'border-black/10 dark:border-white/10 text-[#171820] dark:text-[#F2F3F7]'
                    }`}
                  >
                    {t.settings.arabic} (RTL)
                  </button>
                </div>
              </div>

              <div className="border-t border-black/[0.06] dark:border-white/[0.08] pt-5 space-y-3">
                <h3 className="text-sm font-semibold text-[#171820] dark:text-[#F2F3F7]">
                  Operating Mode
                </h3>
                <p className="text-xs text-[#777987] dark:text-[#9B9EAC]">
                  Current mode: {profile?.mode === 'sleep' ? t.modes.sleep : t.modes.work}
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => switchMode('work')}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      profile?.mode !== 'sleep'
                        ? 'bg-[#7657E8] text-white'
                        : 'border border-black/10 dark:border-white/10 text-[#171820] dark:text-[#F2F3F7]'
                    }`}
                  >
                    {t.modes.work}
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('sleep')}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      profile?.mode === 'sleep'
                        ? 'bg-[#7657E8] text-white'
                        : 'border border-black/10 dark:border-white/10 text-[#171820] dark:text-[#F2F3F7]'
                    }`}
                  >
                    {t.modes.sleep}
                  </button>
                </div>
                <label className="flex items-center gap-3 pt-2 text-sm text-[#171820] dark:text-[#F2F3F7]">
                  <input
                    type="checkbox"
                    checked={prefs.sleepModeMuteNonEssential}
                    onChange={(e) => updatePref('sleepModeMuteNonEssential', e.target.checked)}
                    className="h-4 w-4 accent-[#7657E8]"
                  />
                  <span>Mute nonessential notifications automatically in Sleep Mode</span>
                </label>
              </div>
            </div>
          )}

          {/* NOTIFICATIONS */}
          {section === 'notifications' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-semibold text-[#171820] dark:text-[#F2F3F7]">
                  {t.settings.notifications}
                </h2>
                <p className="mt-1 text-xs text-[#777987] dark:text-[#9B9EAC]">
                  Control which categories deliver real-time alerts to your account.
                </p>
              </div>
              <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {(
                  [
                    ['notifyMessages', 'Direct Messages', 'Alerts when clients or freelancers message you'],
                    ['notifyProposals', 'Proposal Decisions', 'Alerts when proposals are submitted, reviewed, or accepted'],
                    ['notifyProjects', 'Project Milestones', 'Updates on active engagement deliverables'],
                    ['notifyDeadlines', 'Upcoming Deadlines', 'Reminders for tasks and milestone due dates'],
                    ['notifyAi', 'Lens AI Action Alerts', 'Notifications for automated assistant actions and briefs'],
                  ] as const
                ).map(([key, label, desc]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between gap-4 py-3.5 cursor-pointer"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#171820] dark:text-[#F2F3F7]">{label}</p>
                      <p className="text-xs text-[#777987] dark:text-[#9B9EAC]">{desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={prefs[key]}
                      onChange={(e) => updatePref(key, e.target.checked)}
                      className="h-4 w-4 accent-[#7657E8]"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* PRIVACY */}
          {section === 'privacy' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-semibold text-[#171820] dark:text-[#F2F3F7]">
                  {t.settings.privacy}
                </h2>
                <p className="mt-1 text-xs text-[#777987] dark:text-[#9B9EAC]">
                  Manage how your profile appears in the Freelancer Directory and search results.
                </p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#777987] dark:text-[#9B9EAC]">
                    Profile Visibility
                  </label>
                  <select
                    value={prefs.profileVisibility}
                    onChange={(e) =>
                      updatePref(
                        'profileVisibility',
                        e.target.value as UserPreferences['profileVisibility'],
                      )
                    }
                    className="mt-1 max-w-xs w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7]"
                  >
                    <option value="public">Public across Firework AI</option>
                    <option value="members">Visible to signed-in members</option>
                    <option value="private">Private (hidden from directory)</option>
                  </select>
                </div>
                <label className="flex items-center gap-3 text-sm text-[#171820] dark:text-[#F2F3F7]">
                  <input
                    type="checkbox"
                    checked={prefs.discoverable}
                    onChange={(e) => updatePref('discoverable', e.target.checked)}
                    className="h-4 w-4 accent-[#7657E8]"
                  />
                  <span>Allow discovery via skill matching and Lens AI recommendations</span>
                </label>
              </div>
            </div>
          )}

          {/* LENS AI SETTINGS */}
          {section === 'ai' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-semibold text-[#171820] dark:text-[#F2F3F7]">
                  {t.settings.ai}
                </h2>
                <p className="mt-1 text-xs text-[#777987] dark:text-[#9B9EAC]">
                  Configure how Lens AI communicates and accesses your workspace context.
                </p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#777987] dark:text-[#9B9EAC]">
                    Response Style
                  </label>
                  <select
                    value={prefs.aiResponseStyle}
                    onChange={(e) =>
                      updatePref(
                        'aiResponseStyle',
                        e.target.value as UserPreferences['aiResponseStyle'],
                      )
                    }
                    className="mt-1 max-w-xs w-full rounded-lg border border-black/10 dark:border-white/10 bg-[#F5F6F8] dark:bg-[#101116] px-3 py-2 text-sm text-[#171820] dark:text-[#F2F3F7]"
                  >
                    <option value="concise">Concise (direct bullet answers)</option>
                    <option value="detailed">Detailed (structured breakdowns)</option>
                    <option value="technical">Technical (architecture & specs)</option>
                  </select>
                </div>
                <label className="flex items-center gap-3 text-sm text-[#171820] dark:text-[#F2F3F7]">
                  <input
                    type="checkbox"
                    checked={prefs.aiUseContext}
                    onChange={(e) => updatePref('aiUseContext', e.target.checked)}
                    className="h-4 w-4 accent-[#7657E8]"
                  />
                  <span>Allow Lens AI to query my active projects, tasks, and profile via database tools</span>
                </label>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
