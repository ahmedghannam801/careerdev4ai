/**
 * The feedback invitation provider.
 *
 * One provider owns the policy state for the whole signed-in application:
 * the dashboard card, the contextual toast, the account menu and Settings all
 * read the same state, call the same `evaluateFeedbackEligibility` and record
 * the same three events. This is what stops two surfaces from inviting the
 * same person twice.
 *
 * The state is persisted per account by the server; the "already invited in
 * this browser session" flag is kept in `sessionStorage`, so a reload does not
 * produce a second invitation even before the next server request returns.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FEEDBACK_FORM_URL,
  EMPTY_FEEDBACK_STATE,
  applyFeedbackEvent,
  countMeaningfulActions,
  evaluateFeedbackEligibility,
  isContextualFeedbackView,
  isFeedbackCardVisible,
  type FeedbackEligibility,
  type FeedbackEventType,
  type FeedbackSource,
  type FeedbackState,
} from '../../shared/feedback';
import { trackEvent } from '../lib/analytics';
import {
  fetchFeedbackState,
  recordFeedbackEvent,
  registerFeedbackSession,
} from '../lib/feedbackApi';
import { useCareer } from './CareerContext';

const SESSION_KEY_PREFIX = 'careerdev4ai_feedback_invited:';

function readSessionInvite(userId: string): boolean {
  try {
    return window.sessionStorage.getItem(`${SESSION_KEY_PREFIX}${userId}`) === '1';
  } catch {
    return false;
  }
}

function writeSessionInvite(userId: string): void {
  try {
    window.sessionStorage.setItem(`${SESSION_KEY_PREFIX}${userId}`, '1');
  } catch {
    // A private-mode browser may refuse the write. The provider still marks
    // the invitation in memory, so this tab cannot show it twice.
  }
}

/** Reads the locally stored assessment attempts, which are not in the API. */
function readAssessmentAttempts(): number {
  try {
    const stored = window.localStorage.getItem('careerdev_assessments');
    if (!stored) return 0;
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

interface FeedbackContextValue {
  state: FeedbackState;
  /** True once the persisted state has been read. */
  isReady: boolean;
  /** Whether the dashboard card should be shown right now. */
  isCardVisible: boolean;
  /** True when any invitation surface has already been used in this tab. */
  isInvitedThisSession: boolean;
  /** Decides whether a contextual invitation may appear on a view. */
  evaluateInvitation: (view: string) => FeedbackEligibility;
  /** Records that the dashboard card was seen (per tab, not the 30-day cap). */
  markCardImpression: () => void;
  /** Records that an automatic invitation was displayed. */
  markInvitationShown: () => void;
  /** Hides the dashboard card for the card-dismissal period. */
  dismissCard: () => void;
  /** Dismisses the contextual invitation and postpones the next one. */
  dismissInvitation: () => void;
  /** Records an open before an anchor navigates to the form. */
  markOpened: (source: FeedbackSource) => void;
  /** Opens the form in a new tab and records the open. */
  openForm: (source: FeedbackSource) => void;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    currentUser,
    profile,
    roadmapPhases,
    learningItems,
    cvVersions,
    applications,
    projects,
  } = useCareer();

  const [state, setState] = useState<FeedbackState>(EMPTY_FEEDBACK_STATE);
  const [isReady, setIsReady] = useState(false);
  const [isInvitedThisSession, setIsInvitedThisSession] = useState(false);
  // A synchronous mirror of `isInvitedThisSession`. Two effects in the same
  // render (or React's development-mode double invocation) must not both be
  // able to record an impression before the state update has landed.
  const invitedRef = useRef(false);

  // Count the completed actions the platform already knows about. Nothing here
  // is a page view: these are real outcomes the candidate produced.
  const meaningfulActionCount = useMemo(
    () =>
      countMeaningfulActions({
        completedRoadmapTasks: roadmapPhases.reduce(
          (total, phase) =>
            total +
            phase.milestones.reduce(
              (phaseTotal, milestone) =>
                phaseTotal +
                milestone.tasks.filter((task) => task.status === 'completed').length,
              0
            ),
          0
        ),
        completedLearningItems: learningItems.filter((item) => item.status === 'completed').length,
        cvCount: cvVersions.length,
        optimizedCvCount: cvVersions.filter((version) => Boolean(version.atsAnalysis)).length,
        applicationsCount: applications.length,
        projectsCount: projects.length,
        assessmentAttempts: readAssessmentAttempts(),
      }),
    [roadmapPhases, learningItems, cvVersions, applications, projects]
  );

  // Load the account state and count this session. One request does both: the
  // server knows whether the previous session is older than the window.
  useEffect(() => {
    const userId = currentUser?.id ?? null;
    if (!userId) {
      invitedRef.current = false;
      setState(EMPTY_FEEDBACK_STATE);
      setIsReady(false);
      setIsInvitedThisSession(false);
      return;
    }

    let cancelled = false;
    setIsReady(false);
    const alreadyInvited = readSessionInvite(userId);
    invitedRef.current = alreadyInvited;
    setIsInvitedThisSession(alreadyInvited);

    const load = async () => {
      try {
        const result = await registerFeedbackSession();
        if (cancelled) return;
        setState(result.state);
        setIsReady(true);
      } catch {
        // The session write failed. Try the read-only endpoint once; if that
        // also fails, stay not-ready, which disables automatic invitations
        // rather than showing them without knowing the caps.
        try {
          const persisted = await fetchFeedbackState();
          if (cancelled) return;
          setState(persisted);
          setIsReady(true);
        } catch {
          if (!cancelled) setIsReady(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  /** Applies an event locally, reports it, and persists it. */
  const recordEvent = useCallback(
    (type: FeedbackEventType, source: FeedbackSource) => {
      const now = Date.now();
      setState((current) => applyFeedbackEvent(current, type, source, now));

      if (type === 'impression') {
        trackEvent('feedback_invitation_impression', {
          feedback_invitation_source: source,
        });
      } else if (type === 'dismissed') {
        trackEvent('feedback_invitation_dismissed', {
          feedback_invitation_source: source,
        });
      } else {
        trackEvent('feedback_form_opened', {
          feedback_invitation_source: source,
        });
      }

      // The dashboard card impression is a local, per-tab notification. It is
      // reported to analytics but deliberately does not consume the automatic
      // thirty-day cap, so there is nothing to persist and no request to send.
      if (type === 'impression' && source === 'dashboard_card') return;

      void recordFeedbackEvent(type, source)
        .then((saved) => setState(saved))
        .catch(() => {
          // The local state already reflects the action. A failed write means
          // this tab behaves correctly and the next session may ask again;
          // it must not block the interface or show an error for feedback.
        });
    },
    []
  );

  const markSessionInvited = useCallback(() => {
    const userId = currentUser?.id;
    if (!userId) return;
    invitedRef.current = true;
    writeSessionInvite(userId);
    setIsInvitedThisSession(true);
  }, [currentUser?.id]);

  const markCardImpression = useCallback(() => {
    if (!isReady || invitedRef.current) return;
    markSessionInvited();
    recordEvent('impression', 'dashboard_card');
  }, [isReady, markSessionInvited, recordEvent]);

  const markInvitationShown = useCallback(() => {
    if (!isReady || invitedRef.current) return;
    markSessionInvited();
    recordEvent('impression', 'contextual_invitation');
  }, [isReady, markSessionInvited, recordEvent]);

  const dismissCard = useCallback(() => {
    recordEvent('dismissed', 'dashboard_card');
  }, [recordEvent]);

  const dismissInvitation = useCallback(() => {
    recordEvent('dismissed', 'contextual_invitation');
  }, [recordEvent]);

  const markOpened = useCallback(
    (source: FeedbackSource) => {
      recordEvent('opened', source);
    },
    [recordEvent]
  );

  const openForm = useCallback(
    (source: FeedbackSource) => {
      markOpened(source);
      if (typeof document === 'undefined') return;
      // A real anchor with `target="_blank"` keeps the external-link behaviour
      // the native bridge already understands, and `noopener noreferrer`
      // keeps the form from reaching back into this window.
      const anchor = document.createElement('a');
      anchor.href = FEEDBACK_FORM_URL;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    },
    [markOpened]
  );

  const isCardVisible = useMemo(
    () => isFeedbackCardVisible(state, Date.now()),
    [state]
  );

  const evaluateInvitation = useCallback(
    (view: string): FeedbackEligibility => {
      if (!isReady) return { eligible: false, reason: 'not_ready' };
      return evaluateFeedbackEligibility({
        now: Date.now(),
        accountCreatedAt: currentUser?.createdAt ?? null,
        state,
        meaningfulActionCount,
        invitationSeenThisSession: isInvitedThisSession,
        isAuthenticated: Boolean(currentUser),
        isOnboarding: view === 'onboarding' || profile.onboardingStatus === 'started',
        isContextualView: isContextualFeedbackView(view),
      });
    },
    [
      isReady,
      currentUser,
      state,
      meaningfulActionCount,
      isInvitedThisSession,
      profile.onboardingStatus,
    ]
  );

  const value = useMemo<FeedbackContextValue>(
    () => ({
      state,
      isReady,
      isCardVisible,
      isInvitedThisSession,
      evaluateInvitation,
      markCardImpression,
      markInvitationShown,
      dismissCard,
      dismissInvitation,
      markOpened,
      openForm,
    }),
    [
      state,
      isReady,
      isCardVisible,
      isInvitedThisSession,
      evaluateInvitation,
      markCardImpression,
      markInvitationShown,
      dismissCard,
      dismissInvitation,
      markOpened,
      openForm,
    ]
  );

  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
};

export function useFeedback(): FeedbackContextValue {
  const value = useContext(FeedbackContext);
  if (!value) {
    throw new Error('useFeedback must be used inside FeedbackProvider');
  }
  return value;
}
