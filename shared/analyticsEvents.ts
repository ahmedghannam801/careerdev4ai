/**
 * The analytics event taxonomy.
 *
 * The list lives in `shared/` because both halves of the measurement need it:
 * the browser reports these events, and the server reads them back from the
 * property to draw the funnel. One list means the two can never disagree
 * about what a step is called.
 *
 * `sign_up` and `login` are Google's own recommended event names. The rest
 * are custom events registered under the same names.
 */
export const ANALYTICS_EVENTS = [
  'sign_up',
  'login',
  'select_career',
  'roadmap_enroll',
  'learning_start',
  'learning_complete',
  'project_start',
  'opportunity_view',
  'opportunity_click',
  // Feedback invitations. These three are the only feedback events: an
  // invitation was seen, it was dismissed, or the form was opened. Submitting
  // the form happens on Google's own domain and is not reported here.
  'feedback_invitation_impression',
  'feedback_invitation_dismissed',
  'feedback_form_opened',
] as const;

/** The name of an event the application reports. */
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

/**
 * The values an event may carry.
 *
 * Every one of them is a category, a level or a count. There is deliberately
 * no field for a name, an email address, a document, a free-text note or a
 * user id: the type itself is the guarantee that such a value cannot be
 * passed by accident.
 */
export interface AnalyticsParams {
  /** The career domain, e.g. "technology". */
  career_domain?: string;
  /** The learning catalogue category, e.g. "AI". */
  learning_category?: string;
  /** The opportunity category, e.g. "fellowship". */
  opportunity_category?: string;
  /** The seniority level, e.g. "Mid". */
  level?: string;
  /** Whether the outcome was completed or abandoned. */
  outcome?: 'completed' | 'started' | 'abandoned';
  /** How the session arrived. */
  source?: string;
  /** The surface that showed or opened the feedback form, e.g. "settings". */
  feedback_invitation_source?: string;
  /** The number of items in a batch, when the event describes a batch. */
  count?: number;
}

/**
 * The funnel, in the order the steps happen.
 *
 * The server uses this to draw the conversion funnel, so the order is stated
 * once rather than being implied by the order of a report.
 */
export const ANALYTICS_FUNNEL = [
  { step: 'Registered', event: 'sign_up' },
  { step: 'Chose a career', event: 'select_career' },
  { step: 'Enrolled in a roadmap', event: 'roadmap_enroll' },
  { step: 'Started learning', event: 'learning_start' },
  { step: 'Completed learning', event: 'learning_complete' },
  { step: 'Started a project', event: 'project_start' },
  { step: 'Saw opportunities', event: 'opportunity_view' },
  { step: 'Clicked through', event: 'opportunity_click' },
] as const;
