/**
 * The words a notification is shown in.
 *
 * A notification is written once by the server and read by candidates in more
 * than one language. The server records the source text of the title and the
 * values that fill the message; the reader's language is applied here.
 *
 * Two things have to hold. A notification must never show a key where a
 * label belongs, and a message must be translated *before* its values are
 * filled in, so the wording comes from the reader's language while the values
 * keep the spelling they had when they were recorded.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  fillTemplate,
  resolveNotificationMessage,
  resolveNotificationTitle,
} from '../src/lib/notificationText.ts';
import { AR_STRINGS } from '../src/translations/sourceStrings.ts';
import {
  NEW_OPPORTUNITY_MESSAGE_TEMPLATE,
  NEW_OPPORTUNITY_TITLE_KEY,
} from '../server/opportunities/notify.ts';

/** The translator the application uses: the English source in, the words out. */
function translator(language: 'en' | 'ar') {
  return (key: string): string => {
    if (language === 'en') return key;
    return AR_STRINGS[key] ?? key;
  };
}

describe('the words a notification is shown in', () => {
  it('shows the literal title when the notification has no source text', () => {
    assert.equal(
      resolveNotificationTitle({ title: 'Interview tomorrow', titleKey: null }, translator('ar')),
      'Interview tomorrow'
    );
  });

  it('shows the source text of the title in the reader’s language', () => {
    assert.equal(
      resolveNotificationTitle({ title: 'anything', titleKey: 'New opportunity' }, translator('en')),
      'New opportunity'
    );
    assert.equal(
      resolveNotificationTitle({ title: 'anything', titleKey: 'New opportunity' }, translator('ar')),
      'فرصة جديدة'
    );
  });

  it('falls back to the literal title when the key is a name the translator does not know', () => {
    // A dotted name is a catalogue entry rather than a wording. Showing
    // "notification.foo" in a candidate's inbox would be worse than showing
    // the English the server wrote.
    assert.equal(
      resolveNotificationTitle(
        { title: 'Referral reward earned', titleKey: 'notification.referralReward' },
        translator('ar')
      ),
      'Referral reward earned'
    );
  });

  it('shows the literal message when the notification has no template', () => {
    assert.equal(
      resolveNotificationMessage(
        { message: 'A friend you referred has joined.', params: {} },
        translator('ar')
      ),
      'A friend you referred has joined.'
    );
  });

  it('translates the message and then fills in the values', () => {
    const params = {
      messageTemplate: NEW_OPPORTUNITY_MESSAGE_TEMPLATE,
      organization: 'Ministry of Communications',
      opportunityTitle: 'Data Analyst Internship',
    };

    assert.equal(
      resolveNotificationMessage({ message: '', params }, translator('ar')),
      'فرصة جديدة من Ministry of Communications: Data Analyst Internship'
    );
  });

  it('leaves a placeholder that has no value as it is', () => {
    assert.equal(
      fillTemplate('A {one} and a {two}', { one: 'first' }),
      'A first and a {two}'
    );
  });

  it('has an Arabic entry for the title and the message the pipeline writes', () => {
    assert.ok(
      AR_STRINGS[NEW_OPPORTUNITY_TITLE_KEY],
      `the title has no Arabic entry: ${NEW_OPPORTUNITY_TITLE_KEY}`
    );
    assert.ok(
      AR_STRINGS[NEW_OPPORTUNITY_MESSAGE_TEMPLATE],
      `the message has no Arabic entry: ${NEW_OPPORTUNITY_MESSAGE_TEMPLATE}`
    );
  });

  it('keeps the placeholders of the message in the Arabic entry', () => {
    const source = NEW_OPPORTUNITY_MESSAGE_TEMPLATE.match(/\{[^}]+\}/g) ?? [];
    const translation = AR_STRINGS[NEW_OPPORTUNITY_MESSAGE_TEMPLATE] ?? '';
    const translated = translation.match(/\{[^}]+\}/g) ?? [];

    for (const token of source) {
      assert.ok(
        translated.includes(token),
        `the Arabic entry is missing ${token}: ${translation}`
      );
    }
  });
});
