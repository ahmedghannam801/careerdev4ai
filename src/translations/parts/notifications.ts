/**
 * Arabic strings for the notifications drawer.
 *
 * Every entry is keyed by the exact English source string used in the
 * components or written by the server. Keep the two identical.
 *
 * The message template is the interesting one. It carries placeholders, and
 * the placeholders are filled in after the translation — so the wording comes
 * from the reader's language while the values keep the spelling they had when
 * they were recorded. The placeholders must survive the translation, and the
 * localisation test checks exactly that.
 */

export const notificationsAr: Record<string, string> = {
  'New opportunity': 'فرصة جديدة',
  'A new opportunity from {organization}: {opportunityTitle}':
    'فرصة جديدة من {organization}: {opportunityTitle}',
  'A new opportunity was published.': 'تم نشر فرصة جديدة.',
  'New opportunities are available for your target role.': 'تتوفر فرص جديدة تناسب دورك المستهدف.',
  'Notification': 'إشعار',
};
