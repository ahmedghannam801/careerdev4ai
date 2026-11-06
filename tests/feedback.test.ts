/**
 * The feedback invitation policy.
 *
 * The policy is deliberately conservative, so these tests are mostly about
 * what the platform must NOT do: invite a new account, interrupt a focused
 * task, ask twice in one period, or let a dashboard-card dismissal silence the
 * contextual invitation.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EMPTY_FEEDBACK_STATE,
  FEEDBACK_FORM_URL,
  FEEDBACK_POLICY,
  applyFeedbackEvent,
  countMeaningfulActions,
  evaluateFeedbackEligibility,
  isContextualFeedbackView,
  isFeedbackCardVisible,
  isFeedbackEventType,
  isFeedbackSource,
  type FeedbackEligibilityInput,
  type FeedbackState,
} from '../shared/feedback.ts';

const NOW = Date.parse('2026-11-06T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const ago = (ms: number) => new Date(NOW - ms).toISOString();

function input(overrides: Partial<FeedbackEligibilityInput> = {}): FeedbackEligibilityInput {
  return {
    now: NOW,
    accountCreatedAt: ago(30 * DAY),
    state: { ...EMPTY_FEEDBACK_STATE, sessionCount: 2, lastSessionAt: ago(HOUR) },
    meaningfulActionCount: 1,
    invitationSeenThisSession: false,
    isAuthenticated: true,
    isOnboarding: false,
    isContextualView: true,
    ...overrides,
  };
}

describe('the feedback invitation policy', () => {
  it('uses the exact form the product was given', () => {
    assert.equal(FEEDBACK_FORM_URL, 'https://forms.gle/fhhiyJSM55vUgnWY6');
  });

  it('never invites a visitor without an account', () => {
    const result = evaluateFeedbackEligibility(input({ isAuthenticated: false }));
    assert.deepEqual(result, { eligible: false, reason: 'anonymous' });
  });

  it('never invites during onboarding or a focused task', () => {
    assert.equal(
      evaluateFeedbackEligibility(input({ isOnboarding: true })).reason,
      'onboarding'
    );
    assert.equal(
      evaluateFeedbackEligibility(input({ isContextualView: false })).reason,
      'focused_task'
    );
  });

  it('lets an eligible account through', () => {
    assert.deepEqual(evaluateFeedbackEligibility(input()), {
      eligible: true,
      reason: 'eligible',
    });
  });

  it('refuses an account younger than the one-hour floor', () => {
    assert.equal(
      evaluateFeedbackEligibility(input({ accountCreatedAt: ago(30 * 60 * 1000) })).reason,
      'account_too_new'
    );
    assert.equal(
      evaluateFeedbackEligibility(input({ accountCreatedAt: null })).reason,
      'account_too_new'
    );
  });

  it('needs either a meaningful action or two sessions after a day', () => {
    assert.equal(
      evaluateFeedbackEligibility(
        input({
          meaningfulActionCount: 0,
          state: { ...EMPTY_FEEDBACK_STATE, sessionCount: 1, lastSessionAt: ago(HOUR) },
        })
      ).reason,
      'not_enough_engagement'
    );

    // Two sessions on their own are not enough during the first day.
    assert.equal(
      evaluateFeedbackEligibility(
        input({
          meaningfulActionCount: 0,
          accountCreatedAt: ago(12 * HOUR),
          state: { ...EMPTY_FEEDBACK_STATE, sessionCount: 2, lastSessionAt: ago(HOUR) },
        })
      ).reason,
      'not_enough_engagement'
    );

    // After a day, two sessions are enough.
    assert.equal(
      evaluateFeedbackEligibility(
        input({
          meaningfulActionCount: 0,
          accountCreatedAt: ago(2 * DAY),
          state: { ...EMPTY_FEEDBACK_STATE, sessionCount: 2, lastSessionAt: ago(HOUR) },
        })
      ).eligible,
      true
    );
  });

  it('does not show a second invitation in the same session', () => {
    assert.equal(
      evaluateFeedbackEligibility(input({ invitationSeenThisSession: true })).reason,
      'already_invited_this_session'
    );
  });

  it('postpones the next invitation for seven days after a dismissal', () => {
    const state: FeedbackState = {
      ...EMPTY_FEEDBACK_STATE,
      sessionCount: 2,
      lastDismissedAt: ago(3 * DAY),
    };
    assert.equal(evaluateFeedbackEligibility(input({ state })).reason, 'dismissed_recently');

    assert.equal(
      evaluateFeedbackEligibility(
        input({
          state: { ...state, lastDismissedAt: ago(FEEDBACK_POLICY.dismissalPostponeDays * DAY) },
        })
      ).eligible,
      true
    );
  });

  it('holds the thirty-day cooldown after an invitation was shown', () => {
    const state: FeedbackState = {
      ...EMPTY_FEEDBACK_STATE,
      sessionCount: 2,
      lastShownAt: ago(10 * DAY),
    };
    assert.equal(evaluateFeedbackEligibility(input({ state })).reason, 'shown_recently');
  });

  it('does not ask again after the form was opened', () => {
    const state: FeedbackState = {
      ...EMPTY_FEEDBACK_STATE,
      sessionCount: 2,
      lastOpenedAt: ago(10 * DAY),
    };
    assert.equal(evaluateFeedbackEligibility(input({ state })).reason, 'opened_recently');
  });

  it('keeps focused screens out of the contextual view list', () => {
    for (const view of ['dashboard', 'assessment', 'interviews', 'cv-studio', 'onboarding', 'admin']) {
      assert.equal(isContextualFeedbackView(view), false, view);
    }
    for (const view of ['my-career', 'roadmap', 'skills', 'progress', 'settings']) {
      assert.equal(isContextualFeedbackView(view), true, view);
    }
  });
});

describe('the persisted feedback state', () => {
  it('counts every distinct kind of completed action once', () => {
    assert.equal(
      countMeaningfulActions({
        completedRoadmapTasks: 5,
        completedLearningItems: 0,
        cvCount: 2,
        optimizedCvCount: 1,
        applicationsCount: 3,
        projectsCount: 0,
        assessmentAttempts: 1,
      }),
      5
    );
  });

  it('does not let a dashboard-card impression start the automatic cooldown', () => {
    const next = applyFeedbackEvent(
      EMPTY_FEEDBACK_STATE,
      'impression',
      'dashboard_card',
      NOW
    );
    assert.equal(next.lastShownAt, null);

    const contextual = applyFeedbackEvent(
      EMPTY_FEEDBACK_STATE,
      'impression',
      'contextual_invitation',
      NOW
    );
    assert.equal(contextual.lastShownAt, new Date(NOW).toISOString());
  });

  it('keeps a card dismissal separate from an invitation dismissal', () => {
    const card = applyFeedbackEvent(EMPTY_FEEDBACK_STATE, 'dismissed', 'dashboard_card', NOW);
    assert.equal(card.cardDismissedAt, new Date(NOW).toISOString());
    assert.equal(card.lastDismissedAt, null);

    const invitation = applyFeedbackEvent(
      EMPTY_FEEDBACK_STATE,
      'dismissed',
      'contextual_invitation',
      NOW
    );
    assert.equal(invitation.lastDismissedAt, new Date(NOW).toISOString());
    assert.equal(invitation.cardDismissedAt, null);
  });

  it('hides the card for the card-dismissal period only', () => {
    const state = applyFeedbackEvent(EMPTY_FEEDBACK_STATE, 'dismissed', 'dashboard_card', NOW);
    assert.equal(isFeedbackCardVisible(state, NOW + DAY), false);
    assert.equal(
      isFeedbackCardVisible(state, NOW + FEEDBACK_POLICY.cardDismissalDays * DAY),
      true
    );
  });
});

describe('the feedback vocabulary', () => {
  it('accepts only the known sources and events', () => {
    assert.equal(isFeedbackSource('settings'), true);
    assert.equal(isFeedbackSource('somewhere_else'), false);
    assert.equal(isFeedbackEventType('opened'), true);
    assert.equal(isFeedbackEventType('submitted'), false);
  });
});
