import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { FireworkLogo, GoogleSignInButton } from './BrandIcons';
import {
  registerWithEmail,
  requestPasswordReset,
  signInWithEmail,
} from '../lib/firebase';
import { apiRequest } from '../lib/api';
import { sanitizeCsvSkills } from '../utils/domain';

export function AuthModal() {
  const { authModalOpen, setAuthModalOpen, handleGoogleSignIn, refreshProfile, pushToast, language } =
    useApp();
  const [mode, setMode] = useState<'signin' | 'register' | 'reset'>('signin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [accountType, setAccountType] = useState<'freelancer' | 'client'>('freelancer');
  const [country, setCountry] = useState('');
  const [skillsText, setSkillsText] = useState('');
  const [bio, setBio] = useState('');

  if (!authModalOpen) return null;

  const onGoogle = async () => {
    setBusy(true);
    setError(null);
    await handleGoogleSignIn();
    setBusy(false);
  };

  const onEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!email.trim()) {
      setError('Enter your email address.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'reset') {
        await requestPasswordReset(email.trim());
        setInfo('Password recovery email sent if an account exists for this address.');
      } else if (mode === 'signin') {
        if (!password) {
          setError('Enter your password.');
          setBusy(false);
          return;
        }
        await signInWithEmail(email.trim(), password);
        await refreshProfile();
        setAuthModalOpen(false);
        pushToast('Signed in successfully.', 'success');
      } else {
        if (fullName.trim().length < 2) {
          setError('Enter your full name.');
          setBusy(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          setBusy(false);
          return;
        }
        await registerWithEmail(fullName.trim(), email.trim(), password);
        await apiRequest('/api/auth/sync', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim(), fullName: fullName.trim() }),
        });
        await apiRequest('/api/profile', {
          method: 'PUT',
          body: JSON.stringify({
            fullName: fullName.trim(),
            accountType,
            country: country.trim(),
            skills: sanitizeCsvSkills(skillsText),
            bio: bio.trim(),
            preferredLanguage: language,
            onboardingCompleted: true,
          }),
        });
        await refreshProfile();
        setAuthModalOpen(false);
        pushToast('Account created and profile saved.', 'success');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed.';
      if (msg.includes('operation-not-allowed')) {
        setError(
          'Email/Password sign-in is not yet enabled in the Firebase Console for this project. Use Sign in with Google above or enable Email/Password in Firebase Authentication.',
        );
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-heading"
    >
      <div className="glass-popover w-full max-w-md rounded-2xl p-6 text-[#171820] dark:text-[#F2F3F7] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FireworkLogo className="h-7 w-7" />
            <h2 id="auth-modal-heading" className="text-lg font-semibold tracking-tight">
              {mode === 'signin'
                ? 'Sign in to Firework AI'
                : mode === 'register'
                  ? 'Create your account'
                  : 'Reset password'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setAuthModalOpen(false)}
            aria-label="Close sign in dialog"
            className="rounded-lg p-1.5 text-[#777987] hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-2 text-sm text-[#777987] dark:text-[#9B9EAC]">
          Sign in with Google for unified access to your PostgreSQL workspace, Lens AI agent, and Google Workspace tools.
        </p>

        <div className="mt-5">
          <GoogleSignInButton
            onClick={onGoogle}
            disabled={busy}
            className="w-full"
            label="Sign in with Google"
          />
        </div>

        <div className="my-5 flex items-center gap-3 text-xs text-[#777987]">
          <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
          <span>or continue with email</span>
          <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
        </div>

        <form onSubmit={onEmailSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <>
              <div>
                <label htmlFor="auth-fullname" className="block text-xs font-medium text-[#777987] mb-1">
                  Full name
                </label>
                <input
                  id="auth-fullname"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Layla Mansour"
                  className="w-full rounded-lg border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm focus:border-[#7657E8] focus:outline-none"
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-[#777987] mb-1">Account type</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAccountType('freelancer')}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      accountType === 'freelancer'
                        ? 'border-[#7657E8] bg-[#7657E8]/10 text-[#7657E8]'
                        : 'border-black/10 dark:border-white/12 text-[#777987]'
                    }`}
                  >
                    Freelancer
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountType('client')}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      accountType === 'client'
                        ? 'border-[#7657E8] bg-[#7657E8]/10 text-[#7657E8]'
                        : 'border-black/10 dark:border-white/12 text-[#777987]'
                    }`}
                  >
                    Client / Business
                  </button>
                </div>
              </div>
            </>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-xs font-medium text-[#777987] mb-1">
              Email address
            </label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full rounded-lg border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm focus:border-[#7657E8] focus:outline-none"
            />
          </div>

          {mode !== 'reset' && (
            <div>
              <label htmlFor="auth-password" className="block text-xs font-medium text-[#777987] mb-1">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm focus:border-[#7657E8] focus:outline-none"
              />
            </div>
          )}

          {mode === 'register' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="auth-country" className="block text-xs font-medium text-[#777987] mb-1">
                    Country
                  </label>
                  <input
                    id="auth-country"
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="United Arab Emirates"
                    className="w-full rounded-lg border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm focus:border-[#7657E8] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="auth-skills" className="block text-xs font-medium text-[#777987] mb-1">
                    Skills (comma-separated)
                  </label>
                  <input
                    id="auth-skills"
                    type="text"
                    value={skillsText}
                    onChange={(e) => setSkillsText(e.target.value)}
                    placeholder="React, Design, SQL"
                    className="w-full rounded-lg border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm focus:border-[#7657E8] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="auth-bio" className="block text-xs font-medium text-[#777987] mb-1">
                  Short biography
                </label>
                <textarea
                  id="auth-bio"
                  rows={2}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Describe your professional focus..."
                  className="w-full rounded-lg border border-black/10 dark:border-white/12 bg-white dark:bg-[#101116] px-3 py-2 text-sm focus:border-[#7657E8] focus:outline-none"
                />
              </div>
            </>
          )}

          {error && (
            <p className="rounded-lg bg-[#E36C76]/12 px-3 py-2 text-xs text-[#c74954] dark:text-[#f08b94]">
              {error}
            </p>
          )}
          {info && (
            <p className="rounded-lg bg-[#39B982]/12 px-3 py-2 text-xs text-[#238c5e] dark:text-[#63d4a1]">
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-[#7657E8] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6446d6] transition-colors disabled:opacity-50"
          >
            {busy
              ? 'Processing...'
              : mode === 'signin'
                ? 'Sign in with Email'
                : mode === 'register'
                  ? 'Create Account'
                  : 'Send Recovery Link'}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-xs text-[#777987]">
          {mode !== 'register' ? (
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className="hover:text-[#7657E8]"
            >
              Create an account
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
              }}
              className="hover:text-[#7657E8]"
            >
              Already have an account? Sign in
            </button>
          )}

          {mode !== 'reset' && (
            <button
              type="button"
              onClick={() => {
                setMode('reset');
                setError(null);
              }}
              className="hover:text-[#7657E8]"
            >
              Forgot password?
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
