import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  getWorkspaceAccessToken,
  signInWithGoogleWorkspace,
  signOutAccount,
  subscribeAuthState,
} from '../lib/firebase';
import { apiRequest } from '../lib/api';
import { translations, type Language, type TranslationSet } from '../i18n/translations';
import type { CategoryRecord, NotificationRecord, PageId, UserProfile } from '../types/app';
import type { AppMode } from '../utils/domain';

export type ThemeSetting = 'system' | 'light' | 'dark';

export interface ToastNotice {
  id: string;
  tone: 'neutral' | 'success' | 'warning' | 'error';
  message: string;
}

interface AppContextValue {
  firebaseUser: FirebaseUser | null;
  authReady: boolean;
  profile: UserProfile | null;
  hasWorkspaceToken: boolean;
  categories: CategoryRecord[];
  notifications: NotificationRecord[];
  unreadNotifications: number;
  activePage: PageId;
  setActivePage: (page: PageId) => void;
  theme: ThemeSetting;
  resolvedTheme: 'light' | 'dark';
  setTheme: (next: ThemeSetting) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  t: TranslationSet;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  lensDrawerOpen: boolean;
  setLensDrawerOpen: (open: boolean) => void;
  lensPrefillPrompt: string | null;
  askLensWithPrompt: (prompt: string, openFullPage?: boolean) => void;
  clearLensPrefill: () => void;
  refreshTrigger: number;
  triggerDataRefresh: () => void;
  refreshProfile: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  switchMode: (mode: AppMode) => Promise<void>;
  handleGoogleSignIn: () => Promise<boolean>;
  handleSignOut: () => Promise<void>;
  pushToast: (message: string, tone?: ToastNotice['tone']) => void;
  toasts: ToastNotice[];
  dismissToast: (id: string) => void;
  selectedMessageTargetUid: string | null;
  openDirectMessageWith: (uid: string) => void;
  clearMessageTarget: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function getStoredUiPref<T extends string>(key: string, fallback: T): T {
  try {
    const val = window.localStorage.getItem(key);
    return (val as T) || fallback;
  } catch {
    return fallback;
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hasWorkspaceToken, setHasWorkspaceToken] = useState(false);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [activePage, setActivePage] = useState<PageId>('home');
  const [theme, setThemeState] = useState<ThemeSetting>(() =>
    getStoredUiPref<ThemeSetting>('fw_theme', 'system'),
  );
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );
  const [language, setLanguageState] = useState<Language>(() =>
    getStoredUiPref<Language>('fw_lang', 'en'),
  );
  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(() =>
    getStoredUiPref<string>('fw_sidebar', 'open') === 'collapsed',
  );
  const [commandOpen, setCommandOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [lensDrawerOpen, setLensDrawerOpen] = useState(false);
  const [lensPrefillPrompt, setLensPrefillPrompt] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const [selectedMessageTargetUid, setSelectedMessageTargetUid] = useState<string | null>(null);

  const pushToast = useCallback((message: string, tone: ToastNotice['tone'] = 'neutral') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const resolvedTheme: 'light' | 'dark' =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [resolvedTheme]);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = language;
    root.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  const setTheme = useCallback(
    (next: ThemeSetting) => {
      setThemeState(next);
      try {
        window.localStorage.setItem('fw_theme', next);
      } catch {
        // Ignore storage error
      }
      if (profile) {
        apiRequest('/api/profile', {
          method: 'PUT',
          body: JSON.stringify({ preferences: { theme: next } }),
        }).catch(() => {});
      }
    },
    [profile],
  );

  const setLanguage = useCallback(
    (lang: Language) => {
      setLanguageState(lang);
      try {
        window.localStorage.setItem('fw_lang', lang);
      } catch {
        // Ignore storage error
      }
      if (profile) {
        apiRequest('/api/profile', {
          method: 'PUT',
          body: JSON.stringify({ preferredLanguage: lang }),
        }).catch(() => {});
      }
    },
    [profile],
  );

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    try {
      window.localStorage.setItem('fw_sidebar', collapsed ? 'collapsed' : 'open');
    } catch {
      // Ignore storage error
    }
  }, []);

  // Load platform categories
  useEffect(() => {
    apiRequest<{ categories: CategoryRecord[] }>('/api/categories')
      .then((res) => setCategories(res.categories ?? []))
      .catch(() => {});
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!firebaseUser) {
      setNotifications([]);
      return;
    }
    try {
      const res = await apiRequest<{ notifications: NotificationRecord[] }>('/api/notifications');
      setNotifications(res.notifications ?? []);
    } catch {
      // Non-fatal
    }
  }, [firebaseUser]);

  const refreshProfile = useCallback(async () => {
    if (!firebaseUser) {
      setProfile(null);
      return;
    }
    try {
      const res = await apiRequest<{ user: UserProfile }>('/api/profile');
      setProfile(res.user);
      if (res.user.preferredLanguage === 'ar' || res.user.preferredLanguage === 'en') {
        setLanguageState(res.user.preferredLanguage);
      }
      if (res.user.preferences?.theme) {
        setThemeState(res.user.preferences.theme);
      }
    } catch (err) {
      console.error('Failed to sync profile:', err);
    }
  }, [firebaseUser]);

  useEffect(() => {
    const unsubscribe = subscribeAuthState(async (user) => {
      setFirebaseUser(user);
      setHasWorkspaceToken(Boolean(getWorkspaceAccessToken()));
      if (user) {
        try {
          const synced = await apiRequest<{ user: UserProfile }>('/api/auth/sync', {
            method: 'POST',
            body: JSON.stringify({
              email: user.email,
              fullName: user.displayName,
              photoUrl: user.photoURL,
            }),
          });
          setProfile(synced.user);
          if (synced.user.preferredLanguage === 'ar' || synced.user.preferredLanguage === 'en') {
            setLanguageState(synced.user.preferredLanguage);
          }
          if (synced.user.preferences?.theme) {
            setThemeState(synced.user.preferences.theme);
          }
        } catch (err) {
          console.error('Account sync error:', err);
        }
      } else {
        setProfile(null);
        setNotifications([]);
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (firebaseUser) {
      refreshNotifications();
    }
  }, [firebaseUser, refreshNotifications, refreshTrigger]);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const triggerDataRefresh = useCallback(() => {
    setRefreshTrigger((n) => n + 1);
  }, []);

  const switchMode = useCallback(
    async (mode: AppMode) => {
      if (!firebaseUser) {
        setAuthModalOpen(true);
        pushToast('Sign in to persist Work Mode and Sleep Mode.', 'warning');
        return;
      }
      try {
        const res = await apiRequest<{ user: UserProfile }>('/api/mode', {
          method: 'PUT',
          body: JSON.stringify({ mode }),
        });
        setProfile(res.user);
        triggerDataRefresh();
        pushToast(
          mode === 'sleep'
            ? translations[language].modes.sleepDesc
            : translations[language].modes.workDesc,
          'success',
        );
      } catch (error) {
        pushToast(
          error instanceof Error ? error.message : 'Unable to switch operating mode.',
          'error',
        );
      }
    },
    [firebaseUser, language, pushToast, triggerDataRefresh],
  );

  const handleGoogleSignIn = useCallback(async () => {
    try {
      const result = await signInWithGoogleWorkspace();
      setHasWorkspaceToken(Boolean(result.workspaceToken));
      const synced = await apiRequest<{ user: UserProfile }>('/api/auth/sync', {
        method: 'POST',
        body: JSON.stringify({
          email: result.user.email,
          fullName: result.user.displayName,
          photoUrl: result.user.photoURL,
        }),
      });
      setProfile(synced.user);
      setAuthModalOpen(false);
      triggerDataRefresh();
      pushToast(`Signed in as ${synced.user.fullName}`, 'success');
      return true;
    } catch (error) {
      pushToast(
        error instanceof Error ? error.message : 'Google sign-in was cancelled or failed.',
        'error',
      );
      return false;
    }
  }, [pushToast, triggerDataRefresh]);

  const handleSignOut = useCallback(async () => {
    await signOutAccount();
    setProfile(null);
    setHasWorkspaceToken(false);
    setNotifications([]);
    setActivePage('home');
    pushToast('Signed out cleanly.', 'neutral');
  }, [pushToast]);

  const askLensWithPrompt = useCallback((prompt: string, openFullPage = false) => {
    setLensPrefillPrompt(prompt);
    if (openFullPage) {
      setActivePage('lens');
      setLensDrawerOpen(false);
    } else {
      setLensDrawerOpen(true);
    }
  }, []);

  const clearLensPrefill = useCallback(() => setLensPrefillPrompt(null), []);

  const openDirectMessageWith = useCallback((uid: string) => {
    setSelectedMessageTargetUid(uid);
    setActivePage('messages');
  }, []);

  const clearMessageTarget = useCallback(() => setSelectedMessageTargetUid(null), []);

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const value: AppContextValue = {
    firebaseUser,
    authReady,
    profile,
    hasWorkspaceToken,
    categories,
    notifications,
    unreadNotifications,
    activePage,
    setActivePage,
    theme,
    resolvedTheme,
    setTheme,
    language,
    setLanguage,
    t: translations[language],
    sidebarCollapsed,
    setSidebarCollapsed,
    commandOpen,
    setCommandOpen,
    authModalOpen,
    setAuthModalOpen,
    lensDrawerOpen,
    setLensDrawerOpen,
    lensPrefillPrompt,
    askLensWithPrompt,
    clearLensPrefill,
    refreshTrigger,
    triggerDataRefresh,
    refreshProfile,
    refreshNotifications,
    switchMode,
    handleGoogleSignIn,
    handleSignOut,
    pushToast,
    toasts,
    dismissToast,
    selectedMessageTargetUid,
    openDirectMessageWith,
    clearMessageTarget,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
