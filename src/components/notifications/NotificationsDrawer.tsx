import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Bell, X, Check, Calendar, AlertCircle, Award } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { drawerLeftVariants, drawerVariants, staggerContainer, staggerItemVariants } from '../../lib/motion';

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string) => void;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({ isOpen, onClose, onNavigate }) => {
  const { notifications, visibleNotifications, markNotificationRead, clearNotifications, settings, t } =
    useCareer();
  const reduced = useReducedMotion() ?? false;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-label={t('Notifications')}
          className="fixed inset-y-0 end-0 z-50 flex w-full flex-col border-s border-[var(--border-subtle)] bg-[var(--surface-main)] shadow-2xl sm:w-[380px]"
          variants={settings.language === 'ar' ? drawerLeftVariants(reduced) : drawerVariants(reduced)}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
      <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-[var(--color-primary-text)]" />
          <span className="text-sm font-semibold text-[var(--text-primary)]">{t('Notifications')}</span>
          {visibleNotifications.filter(n => !n.read).length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--accent-surface)] text-[var(--color-primary-text)] font-medium">
              {visibleNotifications.filter(n => !n.read).length} {t('new')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {notifications.length > 0 && (
            <button
              onClick={clearNotifications}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2 py-1 rounded"
            >
              {t('Clear')}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {visibleNotifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)]">
              <Bell className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {t('You are all caught up')}
            </p>
            <p className="max-w-[15rem] text-xs leading-relaxed text-[var(--text-muted)]">
              {t('Roadmap deadlines, interview stages and milestones will appear here as they happen.')}
            </p>
          </div>
        ) : (
          <motion.div
            variants={staggerContainer(reduced, 0.05)}
            initial="hidden"
            animate="visible"
            className="space-y-2.5"
          >
            {visibleNotifications.map(n => (
              <motion.div
                key={n.id}
                variants={staggerItemVariants(reduced)}
                className={`p-3 rounded-lg border text-sm transition-colors ${
                  n.read
                    ? 'bg-[var(--surface-main)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                    : 'bg-[var(--surface-secondary)]/80 border-[var(--color-border-strong)] text-[var(--text-primary)]'
                }`}
              >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 font-medium text-xs">
                  {n.type === 'interview' && <Calendar className="w-3.5 h-3.5 text-[var(--color-primary-text)]" />}
                  {n.type === 'roadmap' && <AlertCircle className="w-3.5 h-3.5 text-[var(--color-warning)]" />}
                  {n.type === 'achievement' && <Award className="w-3.5 h-3.5 text-[var(--color-success-strong)]" />}
                  <span>{n.title}</span>
                </div>
                {!n.read && (
                  <button
                    onClick={() => markNotificationRead(n.id)}
                    className="p-0.5 text-[var(--text-muted)] hover:text-[var(--color-primary-text)]"
                    title={t('Mark read')}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed">{n.message}</p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                <span>{n.timestamp}</span>
                {n.linkAction && (
                  <button
                    onClick={() => { onNavigate(n.linkAction!); onClose(); }}
                    className="text-[var(--color-primary-text)] hover:underline font-medium"
                  >
                    {t('Take Action →')}
                  </button>
                )}
              </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
