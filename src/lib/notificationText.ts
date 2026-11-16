// The words a notification is shown in.
//
// A notification is written once, by the server, and read by candidates in
// more than one language. The server therefore records the *source text* of
// the title rather than a translated string, together with the values that
// fill the message. The reader's own language is applied here, where the
// interface language is known.
//
// The rules are deliberately narrow:
//
//   - A title with a source text is shown through the translator. The source
//     text is the English wording, so a reader in English sees exactly that.
//   - A title whose key is a dotted name from the legacy catalogue — one that
//     the translator does not know — is not a label at all, so the literal
//     title the server wrote is used instead. Showing "notification.foo" in a
//     candidate's inbox would be worse than showing English.
//   - A message with a template is translated and then filled in. A message
//     without one is the literal the server wrote.

/** The translation the caller provides: the English source in, the words out. */
export type Translate = (key: string) => string;

/** The parts of a notification this module needs. */
export interface NotificationText {
  title: string;
  message?: string | null;
  titleKey?: string | null;
  params?: Record<string, unknown> | null;
}

/** True when the key is a name from a catalogue rather than a wording. */
function isCatalogueName(key: string): boolean {
  return key.includes('.');
}

/**
 * The title a notification is shown under.
 *
 * The literal title is the answer whenever the notification does not carry a
 * source text of its own, or when the source text is a catalogue name that
 * the translator does not know.
 */
export function resolveNotificationTitle(
  notification: Pick<NotificationText, 'title' | 'titleKey'>,
  translate: Translate
): string {
  const key = notification.titleKey?.trim();
  if (!key) return notification.title;

  const translated = translate(key);
  // The translator returns the key unchanged when it has no entry for it. A
  // catalogue name that comes back unchanged is not a wording, so the literal
  // title is used instead.
  if (translated === key && isCatalogueName(key)) return notification.title;
  return translated;
}

/**
 * Fills the placeholders of a template with the values that were recorded.
 *
 * A placeholder with no value is left as it is, so a missing value shows as
 * an obvious gap rather than as the word "undefined".
 */
export function fillTemplate(
  template: string,
  params: Record<string, unknown> | null | undefined
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === null || value === undefined || value === '') return match;
    return String(value);
  });
}

/**
 * The message a notification is shown with.
 *
 * A message that carries a template is translated first and filled in
 * afterwards, so the wording comes from the reader's language and the values
 * keep the spelling they had when they were recorded.
 */
export function resolveNotificationMessage(
  notification: Pick<NotificationText, 'message' | 'params'>,
  translate: Translate
): string {
  const template = notification.params?.messageTemplate;
  if (typeof template !== 'string' || template.trim() === '') {
    return notification.message ?? '';
  }
  return fillTemplate(translate(template), notification.params);
}
