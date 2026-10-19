import React from 'react';
import { Bell, X, Check, Calendar, AlertCircle, Award } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string) => void;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({ isOpen, onClose, onNavigate }) => {
  const { notifications, markNotificationRead, clearNotifications } = useCareer();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[380px] bg-[var(--surface-main)] border-l border-[var(--border-subtle)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-[var(--accent-primary)]" />
          <span className="text-sm font-semibold text-[var(--text-primary)]">Notifications</span>
          {notifications.filter(n => !n.read).length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--accent-surface)] text-[var(--accent-primary)] font-medium">
              {notifications.filter(n => !n.read).length} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {notifications.length > 0 && (
            <button
              onClick={clearNotifications}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2 py-1 rounded"
            >
              Clear
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

      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {notifications.length === 0 ? (
          <div className="text-center py-12 text-xs text-[var(--text-muted)]">
            No notifications at this time.
          </div>
        ) : (
          notifications.map(n => (
            <div
              key={n.id}
              className={`p-3 rounded-lg border text-sm transition-all ${
                n.read 
                  ? 'bg-[var(--surface-main)] border-[var(--border-subtle)] text-[var(--text-secondary)]' 
                  : 'bg-[var(--surface-secondary)]/80 border-[var(--border-strong)] text-[var(--text-primary)]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 font-medium text-xs">
                  {n.type === 'interview' && <Calendar className="w-3.5 h-3.5 text-[var(--accent-primary)]" />}
                  {n.type === 'roadmap' && <AlertCircle className="w-3.5 h-3.5 text-[var(--color-warning)]" />}
                  {n.type === 'skill' && <Award className="w-3.5 h-3.5 text-[var(--color-success)]" />}
                  <span>{n.title}</span>
                </div>
                {!n.read && (
                  <button
                    onClick={() => markNotificationRead(n.id)}
                    className="p-0.5 text-[var(--text-muted)] hover:text-[var(--accent-primary)]"
                    title="Mark read"
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
                    className="text-[var(--accent-primary)] hover:underline font-medium"
                  >
                    Take Action →
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
