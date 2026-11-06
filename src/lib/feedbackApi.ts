// Typed client for the feedback invitation endpoints.
//
// The decision itself lives in `shared/feedback.ts`; this module only carries
// the persisted state between the server and the provider. Answers to the form
// never pass through here — the form is Google's and opens in a new tab.
import { apiRequest as request } from './apiClient';
import type {
  FeedbackEventType,
  FeedbackSource,
  FeedbackState,
} from '../../shared/feedback';

interface FeedbackStateResponse {
  success: boolean;
  state: FeedbackState;
}

/** Reads the persisted invitation state without counting a session. */
export async function fetchFeedbackState(): Promise<FeedbackState> {
  const data = await request<FeedbackStateResponse>('/api/feedback');
  return data.state;
}

/**
 * Counts an active session and returns the state.
 *
 * The server decides whether this visit starts a new session: a reload inside
 * the thirty-minute window does not increment the counter.
 */
export async function registerFeedbackSession(): Promise<{
  state: FeedbackState;
  counted: boolean;
}> {
  const data = await request<{
    success: boolean;
    state: FeedbackState;
    counted: boolean;
  }>('/api/feedback/session', { method: 'POST', body: '{}' });
  return { state: data.state, counted: data.counted };
}

/** Records one of the three permitted events and returns the new state. */
export async function recordFeedbackEvent(
  type: FeedbackEventType,
  source: FeedbackSource
): Promise<FeedbackState> {
  const data = await request<FeedbackStateResponse>('/api/feedback/event', {
    method: 'POST',
    body: JSON.stringify({ type, source }),
  });
  return data.state;
}
