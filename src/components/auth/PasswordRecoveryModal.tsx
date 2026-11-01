import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { KeyRound, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { Logo } from '../brand/Logo';
import { backdropVariants, dialogVariants } from '../../lib/motion';
import { useFocusTrap, useScrollLock } from '../../lib/overlay';

/**
 * Shown only when Supabase reports a `PASSWORD_RECOVERY` session, which is
 * created by the link in the reset email. The user must choose a new password
 * before continuing; the recovery session is a real session but the user does
 * not know the current password, so the normal Change Password form cannot be
 * used.
 */
export const PasswordRecoveryModal: React.FC = () => {
  const { passwordRecovery, completePasswordReset, dismissPasswordRecovery, logout, t} = useCareer();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;

  useScrollLock(!!passwordRecovery);
  useFocusTrap(!!passwordRecovery, panelRef);

  // A fresh link must never show a stale password or a previous success state.
  useEffect(() => {
    if (!passwordRecovery) return;
    setPassword('');
    setConfirm('');
    setError(null);
    setSuccess(false);
    setSaving(false);
  }, [passwordRecovery]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setSaving(true);
    try {
      const result = await completePasswordReset(password);
      if (!result.success) {
        setError(result.error || 'Could not update the password');
        return;
      }
      setSuccess(true);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Leave no usable recovery session behind if the user abandons the flow.
    logout();
    dismissPasswordRecovery();
  };

  return (
    <AnimatePresence>
      {passwordRecovery && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-black/50 backdrop-blur-xs"
            variants={backdropVariants(reduced)}
            initial="hidden"
            animate="visible"
            exit="exit"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-recovery-title"
            className="relative w-full max-w-md space-y-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-6 shadow-2xl sm:p-8"
            variants={dialogVariants(reduced)}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
        <Logo variant="full" className="h-10 sm:h-11 w-auto" />
        <div className="flex items-center gap-2.5 border-b border-[var(--border-subtle)] pb-4">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)] text-[var(--color-on-primary)] flex items-center justify-center">
            <KeyRound className="w-4 h-4" />
          </div>
          <div>
            <h2
              id="password-recovery-title"
              className="text-sm font-bold text-[var(--text-primary)]"
            >
              {t('Choose a new password')}
            </h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              {t('Your reset link was accepted. Set a new password to finish.')}
            </p>
          </div>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-xl border border-[var(--color-success)]/25 bg-[var(--color-success)]/10 p-3 text-xs text-[var(--color-success)]">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{t('Your password has been updated. You are signed in.')}</span>
            </div>
            <button
              type="button"
              onClick={dismissPasswordRecovery}
              className="w-full py-2.5 rounded-xl bg-[var(--accent-primary)] text-[var(--color-on-primary)] text-xs font-bold hover:opacity-90"
            >
              {t('Continue to CareerDev4AI')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="recovery-password"
                className="text-[11px] font-semibold text-[var(--text-secondary)]"
              >
                {t('New password')}
              </label>
              <input
                id="recovery-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                placeholder={t('At least 8 characters')}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="recovery-confirm"
                className="text-[11px] font-semibold text-[var(--text-secondary)]"
              >
                {t('Confirm new password')}
              </label>
              <input
                id="recovery-confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                placeholder={t('Repeat the password')}
              />
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-[var(--color-danger)]/25 bg-[var(--color-danger)]/10 p-3 text-xs text-[var(--color-danger)]"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-xl bg-[var(--accent-primary)] text-[var(--color-on-primary)] text-xs font-bold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{saving ? 'Updating…' : 'Update password'}</span>
            </button>

            <button
              type="button"
              onClick={handleCancel}
              className="w-full py-2 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              {t('Cancel and sign out')}
            </button>
          </form>
        )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
