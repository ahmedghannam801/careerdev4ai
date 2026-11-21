import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X, Send, User, ArrowRight, Lightbulb } from 'lucide-react';
import { AiMascot } from './AiMascot';
import { useCareer } from '../../context/CareerContext';
import { drawerLeftVariants, drawerVariants, staggerContainer, staggerItemVariants } from '../../lib/motion';
import { MorphingButton, MorphingOrb } from '../motion/Morph';
import { AiResponse } from './AiResponse';
import { EvidencePanel } from './EvidencePanel';
import { aiButtonLabel } from '../../lib/aiTokenCosts';

interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string) => void;
}

/** How long the confirmation of a sent message stays on the button. */
const SENT_FLASH_MS = 1600;

export const CopilotDrawer: React.FC<CopilotDrawerProps> = ({ isOpen, onClose, onNavigate }) => {
  const { copilotMessages, sendCopilotMessage, isCopilotTyping, targetRole, analysis, settings, identity, t} = useCareer();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;

  /**
   * Whether the last message has just gone out.
   *
   * This is presentation only. The message has genuinely been handed to the
   * assistant by the time this is set — it is set after `sendCopilotMessage`
   * has run — so the tick on the button is a report of something that
   * happened, not a claim that something is about to.
   */
  const [justSent, setJustSent] = useState(false);
  const sentTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (sentTimerRef.current !== null) window.clearTimeout(sentTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [copilotMessages, isOpen]);

  const handleSend = async (textToSend?: string) => {
    const q = (textToSend || input).trim();
    if (!q || isCopilotTyping) return;
    setInput('');
    setJustSent(false);
    await sendCopilotMessage(q);
    setJustSent(true);
    if (sentTimerRef.current !== null) window.clearTimeout(sentTimerRef.current);
    sentTimerRef.current = window.setTimeout(() => setJustSent(false), SENT_FLASH_MS);
  };

  /**
   * The state of the send button.
   *
   * It is read from what the assistant is really doing: the button is working
   * while the assistant is typing, and it reports that the message went out
   * for the moment after it did.
   */
  const sendState = isCopilotTyping ? 'loading' : justSent ? 'success' : 'idle';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-label={t('Aionvia Copilot')}
          data-lenis-prevent
          className="fixed inset-y-0 end-0 z-50 flex w-full flex-col border-s border-[var(--border-subtle)] bg-[var(--surface-main)] shadow-2xl sm:w-[440px]"
          variants={settings.language === 'ar' ? drawerLeftVariants(reduced) : drawerVariants(reduced)}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
      {/* Drawer Header */}
      <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 shrink-0 flex items-center justify-center">
            <AiMascot className="h-9 w-7 object-contain" alt="" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">{t('Aionvia Copilot')}</div>
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              {/*
                The presence of the assistant, as a shape. It is a quiet mark
                when the assistant is idle and opens into a lit disc while it
                is working, so the drawer says who is thinking without saying
                anything in words.
              */}
              <MorphingOrb state={isCopilotTyping ? 'thinking' : 'idle'} size={12} />
              <span className="truncate">
                {t('Advisor for')} {targetRole?.title ?? ''}
              </span>
            </div>
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
          <span className="font-medium text-[var(--text-primary)]">{identity.displayName}</span>
          <span>·</span>
          <span>{analysis.matchPercentage}% {t('Readiness')}</span>
        </div>
        <button 
          onClick={() => { onNavigate('analysis'); onClose(); }}
          className="text-[var(--color-primary-text)] hover:underline flex items-center gap-1 text-xs shrink-0"
        >
          {t('View Analysis')}
          <ArrowRight className="w-3 h-3 rtl:rotate-180" />
        </button>
      </div>

      {/* The records the assistant is reasoning over. */}
      <EvidencePanel onNavigate={onNavigate} />

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4">
        <motion.div
          variants={staggerContainer(reduced, 0.06)}
          initial="hidden"
          animate="visible"
          className="space-y-4"
        >
        {copilotMessages.length === 0 && (
          <div className="flex flex-col items-center px-6 py-8 text-center">
            <AiMascot className="mb-3 h-24 w-16 object-contain" state="idle" alt="" />
            <p className="text-sm font-medium text-[var(--text-primary)]">{t('Aionvia Copilot')}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{t('copilotPlaceholder')}</p>
          </div>
        )}
        {copilotMessages.map((msg) => (
          <motion.div
            key={msg.id}
            variants={staggerItemVariants(reduced)}
            className={`flex gap-3 text-sm ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.sender === 'assistant' && (
              <div className="w-7 h-7 shrink-0 mt-0.5 flex items-center justify-center">
                <AiMascot className="h-7 w-5 object-contain" alt="" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-xl p-3.5 leading-relaxed text-sm ${
                msg.sender === 'user'
                  ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
                  : 'bg-[var(--surface-secondary)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
              }`}
            >
              {msg.sender === 'assistant' ? (
                <AiResponse text={msg.text} />
              ) : (
                <div className="whitespace-pre-wrap">{msg.text}</div>
              )}
              
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
                      disabled={isCopilotTyping}
                      className="block w-full text-start text-xs text-[var(--color-primary-text)] hover:bg-[var(--accent-surface)] p-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span>→ {sug}</span>
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
          <motion.div
            className="flex gap-3 items-center text-xs text-[var(--text-muted)]"
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            {/*
              The assistant, while it is working. It opens out of the small
              mark in the header into a lit disc with a travelling edge, which
              is what makes the drawer feel like it is answering rather than
              like it has stalled.
            */}
            <MorphingOrb state="thinking" size={28} className="w-7 h-7" />
            <span className="flex items-center gap-2">
              <span aria-live="polite">{t('Aionvia is analyzing your graph')}</span>
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
          </motion.div>
        )}
        <div ref={messagesEndRef} />
        </motion.div>
      </div>

      {/* Quick Prompts Bar */}
      <div className="px-4 py-2 border-t border-[var(--border-subtle)] bg-[var(--surface-main)] flex gap-2 overflow-x-auto text-xs">
        <button
          onClick={() => handleSend(t('copilotPrompt1'))}
          disabled={isCopilotTyping}
          className="whitespace-nowrap px-2.5 py-1 rounded bg-[var(--surface-secondary)] hover:bg-[var(--accent-surface)] text-[var(--text-secondary)] hover:text-[var(--color-primary-text)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {aiButtonLabel(t('Today\'s Next Step'), 'career_consultation_chat', t)}
        </button>
        <button
          onClick={() => handleSend(t('copilotPrompt3'))}
          disabled={isCopilotTyping}
          className="whitespace-nowrap px-2.5 py-1 rounded bg-[var(--surface-secondary)] hover:bg-[var(--accent-surface)] text-[var(--text-secondary)] hover:text-[var(--color-primary-text)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {aiButtonLabel(t('Recommend Project'), 'career_consultation_chat', t)}
        </button>
        <button
          onClick={() => handleSend(t('copilotPrompt4'))}
          disabled={isCopilotTyping}
          className="whitespace-nowrap px-2.5 py-1 rounded bg-[var(--surface-secondary)] hover:bg-[var(--accent-surface)] text-[var(--text-secondary)] hover:text-[var(--color-primary-text)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {aiButtonLabel(t('CV Audit'), 'career_consultation_chat', t)}
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
          <MorphingButton
            type="submit"
            iconOnly
            icon={<Send className="h-4 w-4" />}
            state={sendState}
            label={t('Send')}
            loadingLabel={t('Sending…')}
            successLabel={t('Sent')}
            variant="primary"
            className="rounded-lg"
            disabled={!input.trim() || isCopilotTyping}
          />
        </form>
      </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
