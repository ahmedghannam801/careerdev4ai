import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Sparkles, X, Send, Bot, User, ArrowRight, Lightbulb } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { drawerVariants, staggerContainer, staggerItemVariants } from '../../lib/motion';

interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string) => void;
}

export const CopilotDrawer: React.FC<CopilotDrawerProps> = ({ isOpen, onClose, onNavigate }) => {
  const { copilotMessages, sendCopilotMessage, isCopilotTyping, targetRole, analysis, profile, t} = useCareer();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [copilotMessages, isOpen]);

  const handleSend = async (textToSend?: string) => {
    const q = (textToSend || input).trim();
    if (!q || isCopilotTyping) return;
    setInput('');
    await sendCopilotMessage(q);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-label={t('CareerPilot Copilot')}
          className="fixed inset-y-0 end-0 z-50 flex w-full flex-col border-l border-[var(--border-subtle)] bg-[var(--surface-main)] shadow-2xl sm:w-[440px]"
          variants={drawerVariants(reduced)}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
      {/* Drawer Header */}
      <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-surface)] flex items-center justify-center text-[var(--color-primary-text)]">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">{t('CareerPilot Copilot')}</div>
            <div className="text-xs text-[var(--text-secondary)]">{t('Advisor for')} {targetRole.title}</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] rounded-md transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Career Context Summary Pill */}
      <div className="px-4 py-2.5 bg-[var(--surface-secondary)]/60 border-b border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
        <div className="flex items-center gap-1.5 truncate">
          <span className="font-medium text-[var(--text-primary)]">{profile.name}</span>
          <span>·</span>
          <span>{analysis.matchPercentage}% {t('Readiness')}</span>
        </div>
        <button 
          onClick={() => { onNavigate('analysis'); onClose(); }}
          className="text-[var(--color-primary-text)] hover:underline flex items-center gap-1 text-xs shrink-0"
        >
          {t('View Analysis')}
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4">
        <motion.div
          variants={staggerContainer(reduced, 0.06)}
          initial="hidden"
          animate="visible"
          className="space-y-4"
        >
        {copilotMessages.map((msg) => (
          <motion.div
            key={msg.id}
            variants={staggerItemVariants(reduced)}
            className={`flex gap-3 text-sm ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.sender === 'assistant' && (
              <div className="w-7 h-7 rounded-md bg-[var(--accent-surface)] text-[var(--color-primary-text)] flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-xl p-3.5 leading-relaxed text-sm ${
                msg.sender === 'user'
                  ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
                  : 'bg-[var(--surface-secondary)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.text}</div>
              
              {/* Context suggestions attached to assistant messages */}
              {msg.suggestions && msg.suggestions.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] space-y-1.5">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] flex items-center gap-1">
                    <Lightbulb className="w-3 h-3" />
                    {t('Quick Actions:')}
                  </div>
                  {msg.suggestions.map((sug, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(sug)}
                      className="block w-full text-start text-xs text-[var(--color-primary-text)] hover:bg-[var(--accent-surface)] p-1.5 rounded transition-colors"
                    >
                      → {sug}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {msg.sender === 'user' && (
              <div className="w-7 h-7 rounded-md bg-[var(--surface-secondary)] text-[var(--text-secondary)] flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4" />
              </div>
            )}
          </motion.div>
        ))}

        {isCopilotTyping && (
          <div className="flex gap-3 items-center text-xs text-[var(--text-muted)]">
            <div className="w-7 h-7 rounded-md bg-[var(--color-accent-surface)] text-[var(--color-primary-text)] flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <span className="flex items-center gap-2">
              <span aria-live="polite">{t('CareerPilot is analyzing your graph')}</span>
              <span className="flex items-center gap-0.5" aria-hidden="true">
                {[0, 1, 2].map((dot) => (
                  <motion.span
                    key={dot}
                    className="h-1 w-1 rounded-full bg-[var(--color-primary-text)]"
                    animate={reduced ? { opacity: 0.6 } : { opacity: [0.25, 1, 0.25] }}
                    transition={{
                      duration: 1.1,
                      repeat: reduced ? 0 : Infinity,
                      delay: dot * 0.16,
                      ease: 'easeInOut',
                    }}
                  />
                ))}
              </span>
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
        </motion.div>
      </div>

      {/* Quick Prompts Bar */}
      <div className="px-4 py-2 border-t border-[var(--border-subtle)] bg-[var(--surface-main)] flex gap-2 overflow-x-auto text-xs">
        <button
          onClick={() => handleSend(t('copilotPrompt1'))}
          className="whitespace-nowrap px-2.5 py-1 rounded bg-[var(--surface-secondary)] hover:bg-[var(--accent-surface)] text-[var(--text-secondary)] hover:text-[var(--color-primary-text)] transition-colors"
        >
          {t('Today\'s Next Step')}
        </button>
        <button
          onClick={() => handleSend(t('copilotPrompt3'))}
          className="whitespace-nowrap px-2.5 py-1 rounded bg-[var(--surface-secondary)] hover:bg-[var(--accent-surface)] text-[var(--text-secondary)] hover:text-[var(--color-primary-text)] transition-colors"
        >
          {t('Recommend Project')}
        </button>
        <button
          onClick={() => handleSend(t('copilotPrompt4'))}
          className="whitespace-nowrap px-2.5 py-1 rounded bg-[var(--surface-secondary)] hover:bg-[var(--accent-surface)] text-[var(--text-secondary)] hover:text-[var(--color-primary-text)] transition-colors"
        >
          {t('CV Audit')}
        </button>
      </div>

      {/* Input form */}
      <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--surface-main)]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('copilotPlaceholder')}
            className="flex-1 bg-[var(--surface-secondary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
            disabled={isCopilotTyping}
          />
          <button
            type="submit"
            disabled={!input.trim() || isCopilotTyping}
            className="p-2 rounded-lg bg-[var(--accent-primary)] text-[var(--color-on-primary)] hover:bg-[var(--accent-secondary)] disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
