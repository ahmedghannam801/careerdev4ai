/**
 * The events that produce an email.
 *
 * Each function here is called from the route or webhook that already changed
 * the underlying record. It only enqueues: the queue owns delivery, retries,
 * preferences and suppression. A failure to enqueue is logged by the caller
 * and never undoes the change the candidate or the payment provider made.
 *
 * Idempotency keys name the event, not the moment: a retried webhook, a
 * double-submitted form and a scheduled sweep all resolve to one row.
 */

import { enqueueEmailForUser } from './queue.ts';
import type { EmailTemplateId } from './templates.ts';

export interface EventEmailInput {
  userId: string;
  template: EmailTemplateId;
  category: string;
  idempotencyKey: string;
  payload?: Record<string, unknown>;
  scheduledFor?: string;
}

/** Enqueues one event email and never throws into the caller's transaction. */
export async function sendEventEmail(input: EventEmailInput): Promise<void> {
  try {
    await enqueueEmailForUser(input);
  } catch (error) {
    console.error(`Could not enqueue ${input.template} email:`, error);
  }
}

export async function sendSecurityAlert(
  userId: string,
  input: { event: string; title: string; message: string; detail?: string },
): Promise<void> {
  await sendEventEmail({
    userId,
    template: 'security_alert',
    category: 'security',
    idempotencyKey: `security:${input.event}:${userId}:${new Date().toISOString().slice(0, 13)}`,
    payload: {
      title: input.title,
      message: input.message,
      detail: input.detail,
      occurredAt: new Date().toISOString(),
      actionUrl: 'https://aionvia.pages.dev/#/settings?tab=security',
      actionLabel: 'Review account security',
    },
  });
}

export async function sendAssessmentResult(
  userId: string,
  input: { skillName: string; score: number; level: number; nextStep?: string; resultId?: string },
): Promise<void> {
  await sendEventEmail({
    userId,
    template: 'assessment_result',
    category: 'assessment_updates',
    idempotencyKey: `assessment:${userId}:${input.resultId ?? input.skillName}:${input.score}`,
    payload: {
      title: `${input.skillName}: ${input.score}%`,
      message: `Your assessment for ${input.skillName} was recorded.`,
      score: `${input.score}%`,
      nextStep: input.nextStep ?? 'Review the skill evidence and pick the next learning step.',
      actionUrl: 'https://aionvia.pages.dev/#/skills',
      actionLabel: 'View skill evidence',
    },
  });
}

export async function sendApplicationUpdate(
  userId: string,
  input: {
    applicationId: string;
    company: string;
    role: string;
    stage: string;
    previousStage?: string;
    nextStep?: string;
  },
): Promise<void> {
  await sendEventEmail({
    userId,
    template: 'application_update',
    category: 'application_updates',
    idempotencyKey: `application:${input.applicationId}:${input.stage}`,
    payload: {
      title: `${input.role || 'Application'} at ${input.company || 'a company'} — ${input.stage}`,
      message:
        input.previousStage && input.previousStage !== input.stage
          ? `Your application moved from ${input.previousStage} to ${input.stage}.`
          : `Your application is now at ${input.stage}.`,
      company: input.company,
      role: input.role,
      stage: input.stage,
      nextStep: input.nextStep,
      actionUrl: 'https://aionvia.pages.dev/#/applications',
      actionLabel: 'Open applications',
    },
  });
}

export async function sendLearningCompleted(
  userId: string,
  input: { courseId: string; courseTitle: string; provider?: string },
): Promise<void> {
  await sendEventEmail({
    userId,
    template: 'learning_update',
    category: 'learning_updates',
    idempotencyKey: `learning:completed:${userId}:${input.courseId}`,
    payload: {
      subject: `You completed ${input.courseTitle}`,
      title: input.courseTitle,
      message: 'Nice work. The completion is recorded in your learning progress and can be used as evidence.',
      provider: input.provider,
      actionUrl: 'https://aionvia.pages.dev/#/learning',
      actionLabel: 'Open learning hub',
    },
  });
}

export async function sendInterviewFeedback(
  userId: string,
  input: {
    sessionId: string;
    role?: string;
    score?: number;
    summary?: string;
    kind: 'live' | 'practice';
  },
): Promise<void> {
  await sendEventEmail({
    userId,
    template: 'interview_update',
    category: 'interview_updates',
    idempotencyKey: `interview:${input.kind}:${input.sessionId}`,
    payload: {
      title: input.role ? `Interview feedback: ${input.role}` : 'Your interview feedback is ready',
      message:
        input.summary ??
        'Your interview has been evaluated. Open the feedback to see what to keep and what to practise next.',
      role: input.role,
      score: input.score === undefined ? undefined : `${Math.round(input.score)}%`,
      actionUrl: 'https://aionvia.pages.dev/#/interviews',
      actionLabel: 'View feedback',
    },
  });
}

export async function sendRoadmapUpdate(
  userId: string,
  input: {
    roadmapId?: string;
    taskId?: string;
    title: string;
    message: string;
    progress?: string;
  },
): Promise<void> {
  await sendEventEmail({
    userId,
    template: 'roadmap_update',
    category: 'roadmap_updates',
    idempotencyKey: `roadmap:${input.roadmapId ?? userId}:${input.taskId ?? input.title}`,
    payload: {
      title: input.title,
      message: input.message,
      progress: input.progress,
      actionUrl: 'https://aionvia.pages.dev/#/roadmap',
      actionLabel: 'Open roadmap',
    },
  });
}

export async function sendProjectUpdate(
  userId: string,
  input: { projectId: string; title: string; message: string },
): Promise<void> {
  await sendEventEmail({
    userId,
    template: 'project_update',
    category: 'project_updates',
    idempotencyKey: `project:${input.projectId}:${input.title}`,
    payload: {
      title: input.title,
      message: input.message,
      actionUrl: 'https://aionvia.pages.dev/#/projects',
      actionLabel: 'Open projects',
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Payment and subscription                                                   */
/* -------------------------------------------------------------------------- */

export type BillingEmailTemplate =
  | 'subscription_activated'
  | 'subscription_expired'
  | 'payment_confirmed'
  | 'payment_failed';

/**
 * One billing email.
 *
 * This is provider-agnostic on purpose: the XPay webhook is the only caller
 * today, and it takes plain values so a receipt never depends on one provider's
 * event shape.
 */
export async function sendBillingEmail(input: {
  userId: string;
  template: BillingEmailTemplate;
  idempotencyKey: string;
  category?: string;
  planName?: string;
  billingCycle?: string;
  periodEnd?: string;
  amount?: string;
  reference?: string;
  reason?: string;
  message?: string;
}): Promise<void> {
  await sendEventEmail({
    userId: input.userId,
    template: input.template,
    category: input.category ?? (input.template.startsWith('payment') ? 'billing_receipt' : 'billing'),
    idempotencyKey: input.idempotencyKey,
    payload: {
      planName: input.planName,
      billingCycle: input.billingCycle,
      periodEnd: input.periodEnd,
      amount: input.amount,
      reference: input.reference,
      reason: input.reason,
      message: input.message,
      date: new Date().toISOString().slice(0, 10),
      actionUrl: 'https://aionvia.pages.dev/#/settings?tab=subscription',
      actionLabel: 'Open subscription',
    },
  });
}

/** A small, safe amount label. The amount is given in minor units (piasters). */
export function formatAmount(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string | undefined {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return undefined;
  const code = (currency ?? '').toUpperCase() || 'EGP';
  const value = amount / 100;
  try {
    return new Intl.NumberFormat('en-EG', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${code}`;
  }
}
