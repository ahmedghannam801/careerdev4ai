import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X, Lock, Mail, User, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { getBrowserSupabase, isSupabaseConfigured } from '../../lib/supabase';
import { Logo } from '../brand/Logo';
import { backdropVariants, dialogVariants } from '../../lib/motion';
import { useDismissOnEscape, useFocusTrap, useScrollLock } from '../../lib/overlay';

type OAuthProvider = 'google' | 'linkedin_oidc' | 'github';

/**
 * GitHub returns to a dedicated path so the callback is easy to allowlist in
 * Supabase. The SPA fallback in both `server.ts` and the Pages Worker serves
 * `index.html` for this path, and the existing Supabase client
 * (`detectSessionInUrl`) plus the auth listener complete the session.
 */
const GITHUB_OAUTH_CALLBACK_PATH = '/auth/callback';

export const AuthModal: React.FC = () => {
  const {
    authModalOpen,
    setAuthModalOpen,
    authRedirectError,
    clearAuthRedirectError,
    login,
    register,
  } = useCareer();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthProvider, setOauthProvider] = useState<OAuthProvider | null>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;

  const close = () => {
    clearAuthRedirectError();
    setAuthModalOpen(false);
  };

  useDismissOnEscape(authModalOpen, close);
  useScrollLock(authModalOpen);
  useFocusTrap(authModalOpen, panelRef);

  const switchMode = (next: 'login' | 'register' | 'forgot') => {
    setMode(next);
    setError(null);
    setSuccessMsg(null);
    clearAuthRedirectError();
  };

  /**
   * Starts the Supabase OAuth flow. Google and LinkedIn return to this origin;
   * GitHub returns to `/auth/callback`. `detectSessionInUrl` in the Supabase
   * client exchanges the code and the existing auth listener signs the user in.
   * The return URL must be listed in Supabase → Authentication → URL
   * Configuration.
   */
  const handleOAuth = async (provider: OAuthProvider) => {
    setError(null);
    setSuccessMsg(null);
    clearAuthRedirectError();

    if (!isSupabaseConfigured) {
      setError('Authentication is not configured');
      return;
    }

    setOauthProvider(provider);
    try {
      const redirectTo =
        provider === 'github'
          ? `${window.location.origin}${GITHUB_OAUTH_CALLBACK_PATH}`
          : window.location.origin;
      const { error: oauthError } = await getBrowserSupabase().auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (oauthError) {
        setOauthProvider(null);
        setError(oauthError.message || 'Could not start sign-in');
      }
      // On success the browser navigates to the provider; leave the button in
      // its loading state so it cannot be clicked twice.
    } catch (err) {
      setOauthProvider(null);
      setError('Network error, please try again.');
    }
  };

  const displayedError = error ?? authRedirectError;
  const emailFormVisible = mode !== 'forgot';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    if (mode === 'login') {
      const res = await login(email, password);
      setLoading(false);
      if (res.success) {
        close();
      } else {
        setError(res.error || 'Failed to authenticate');
      }
    } else if (mode === 'register') {
      if (!name.trim()) {
        setError('Please enter your full name');
        setLoading(false);
        return;
      }
      const res = await register(name, email, password);
      setLoading(false);
      if (res.success) {
        if (res.error) {
          // Email confirmation is required: the account was created, but the
          // user is not signed in yet. Keep the dialog open so the
          // instruction is actually visible instead of closing silently.
          setSuccessMsg(res.error);
          setMode('login');
          setPassword('');
        } else {
          close();
        }
      } else {
        setError(res.error || 'Registration failed');
      }
    } else if (mode === 'forgot') {
      try {
        const { error } = await getBrowserSupabase().auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) {
          setLoading(false);
          setError(error.message || 'Failed to send reset link');
          return;
        }
        setLoading(false);
        setSuccessMsg('If an account matches this email, a reset link has been dispatched.');
      } catch (err) {
        setLoading(false);
        setError('Network error, please try again.');
      }
    }
  };

  return (
    <AnimatePresence>
      {authModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-black/50 backdrop-blur-xs"
            variants={backdropVariants(reduced)}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={close}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="CareerPilot AI sign in"
            className="relative w-full max-w-md space-y-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-6 shadow-2xl sm:p-8"
            variants={dialogVariants(reduced)}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
          {/* Close button */}
          <button
            onClick={close}
            aria-label="Close modal"
            className="absolute top-4 right-4 sm:top-5 sm:right-5 p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--surface-secondary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Centered header */}
          <div className="flex flex-col items-center text-center gap-3 border-b border-[var(--border-subtle)] pb-4 pt-1">
            <Logo variant="full" className="h-11 sm:h-12 w-auto mx-auto" />
            <div>
              <h3 className="font-bold text-base text-[var(--text-primary)]">
                {mode === 'login' ? 'Sign in to CareerPilot' : mode === 'register' ? 'Create Your Account' : 'Reset Password'}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">Secure career state sync</p>
            </div>
          </div>

          {displayedError && (
            <div className="p-3 rounded-lg bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/20 text-xs text-[var(--color-danger)] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{displayedError}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-lg bg-[var(--color-success-surface)] border border-[var(--color-success-strong)]/20 text-xs text-[var(--color-success-strong)] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {emailFormVisible && isSupabaseConfigured && (
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => handleOAuth('google')}
                disabled={oauthProvider !== null}
                className="w-full py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] hover:bg-[var(--surface-main)] text-[var(--text-primary)] text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                <GoogleIcon />
                <span>{oauthProvider === 'google' ? 'Redirecting…' : 'Continue with Google'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleOAuth('linkedin_oidc')}
                disabled={oauthProvider !== null}
                className="w-full py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] hover:bg-[var(--surface-main)] text-[var(--text-primary)] text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                <LinkedInIcon />
                <span>{oauthProvider === 'linkedin_oidc' ? 'Redirecting…' : 'Continue with LinkedIn'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleOAuth('github')}
                disabled={oauthProvider !== null}
                className="w-full py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] hover:bg-[var(--surface-main)] text-[var(--text-primary)] text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                <GitHubIcon />
                <span>{oauthProvider === 'github' ? 'Redirecting…' : 'Continue with GitHub'}</span>
              </button>
              <div className="flex items-center gap-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                <span className="h-px flex-1 bg-[var(--border-subtle)]" />
                <span>or continue with email</span>
                <span className="h-px flex-1 bg-[var(--border-subtle)]" />
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {mode === 'register' && (
              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Alex Morgan"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block font-semibold text-[var(--text-secondary)] mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
            </div>

            {mode !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-[var(--text-secondary)]">Password</label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-[11px] text-[var(--color-primary-text)] hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] font-semibold flex items-center justify-center gap-2 transition-all shadow-xs disabled:opacity-50"
            >
              <span>{loading ? 'Processing...' : mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Send Reset Link'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="pt-2 border-t border-[var(--border-subtle)] text-center text-xs text-[var(--text-secondary)]">
            {mode === 'login' ? (
              <p>
                Don't have an account yet?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="text-[var(--color-primary-text)] font-semibold hover:underline"
                >
                  Sign up free
                </button>
              </p>
            ) : (
              <p>
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="text-[var(--color-primary-text)] font-semibold hover:underline"
                >
                  Sign in
                </button>
              </p>
            )}
            <div className="mt-2.5 pt-2 border-t border-[var(--border-subtle)]/40 text-[11px] text-[var(--text-muted)]">
              <span>Developed by </span>
              <a
                href="https://www.linkedin.com/in/ahmed-ebrahim2"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline transition-colors"
              >
                Ahmed Ebrahim
              </a>
            </div>
          </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

// Brand marks are inlined (Lucide does not ship brand icons) and marked
// aria-hidden because the adjacent text already names the provider.
const GoogleIcon: React.FC = () => (
  <svg viewBox="0 0 48 48" className="w-4 h-4" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

const LinkedInIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true" focusable="false">
    <path
      fill="#0A66C2"
      fillRule="evenodd"
      d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z"
    />
  </svg>
);

// The GitHub mark is a brand mark, so it is inlined (like the Google and
// LinkedIn marks above) and inherits the current text colour to stay legible
// in both the light and dark Palette 2 themes.
const GitHubIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
    />
  </svg>
);
