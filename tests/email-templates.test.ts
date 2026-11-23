import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderEmail, isTransactionalCategory } from '../server/email/templates.ts';

test('the welcome email is branded, responsive and has no unsubscribe link', () => {
  const rendered = renderEmail({
    template: 'welcome',
    payload: { name: 'Ahmed' },
    locale: 'en',
    preferencesUrl: 'https://aionvia.pages.dev/#/settings?tab=notifications',
  });
  assert.match(rendered.subject, /Welcome to Aionvia/);
  assert.match(rendered.html, /name="viewport"/);
  assert.match(rendered.html, /dir="ltr"/);
  assert.match(rendered.html, /#FF5A36/);
  assert.match(rendered.html, /Hello Ahmed/);
  assert.doesNotMatch(rendered.html, /api\/email\/unsubscribe/);
  assert.match(rendered.text, /Aionvia/);
});

test('the Arabic announcement is a real RTL layout with an unsubscribe link', () => {
  const rendered = renderEmail({
    template: 'announcement',
    payload: { title: 'تحديث المنصة', message: 'مرحباً بكم في التحديث الجديد.' },
    locale: 'ar',
    preferencesUrl: 'https://aionvia.pages.dev/#/settings?tab=notifications',
    unsubscribeUrl: 'https://aionvia.pages.dev/api/email/unsubscribe?token=abc',
  });
  assert.match(rendered.html, /dir="rtl"/);
  assert.match(rendered.html, /lang="ar"/);
  assert.match(rendered.html, /تحديث المنصة/);
  assert.match(rendered.html, /api\/email\/unsubscribe\?token=abc/);
  assert.ok(rendered.text.includes('تحديث المنصة'));
});

test('payload content is escaped rather than injected into the template', () => {
  const rendered = renderEmail({
    template: 'generic_notification',
    payload: {
      title: '<script>alert(1)</script>',
      message: '<img src=x onerror=alert(2)>',
      actionUrl: 'javascript:alert(3)',
    },
    locale: 'en',
    preferencesUrl: 'https://aionvia.pages.dev/#/settings?tab=notifications',
  });
  assert.doesNotMatch(rendered.html, /<script>alert/);
  assert.match(rendered.html, /&lt;script&gt;alert/);
  assert.doesNotMatch(rendered.html, /<img src=x/);
  assert.doesNotMatch(rendered.html, /javascript:alert/);
});

test('a digest renders its sections and links', () => {
  const rendered = renderEmail({
    template: 'digest_daily',
    payload: {
      title: 'Your daily digest',
      message: 'Three things for today.',
      sections: [
        {
          title: 'New jobs',
          items: [{ title: 'Data Analyst', meta: 'Acme · Cairo', url: 'https://example.com/job' }],
        },
      ],
    },
    locale: 'en',
    preferencesUrl: 'https://aionvia.pages.dev/#/settings?tab=notifications',
    unsubscribeUrl: 'https://aionvia.pages.dev/api/email/unsubscribe?token=abc',
  });
  assert.match(rendered.html, /New jobs/);
  assert.match(rendered.html, /Data Analyst/);
  assert.match(rendered.html, /https:\/\/example.com\/job/);
  assert.match(rendered.subject, /daily digest/i);
});

test('transactional categories are named explicitly', () => {
  assert.equal(isTransactionalCategory('transactional'), true);
  assert.equal(isTransactionalCategory('security'), true);
  assert.equal(isTransactionalCategory('billing_receipt'), true);
  assert.equal(isTransactionalCategory('learning_updates'), false);
  assert.equal(isTransactionalCategory('announcements'), false);
});
