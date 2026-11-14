/**
 * One identity, everywhere.
 *
 * The QA audit's BUG-01: the same candidate was called "Nour" in the topbar
 * and something else in the sidebar, and editing the name in Profile did not
 * reach the other screens. These tests pin the resolution rules so the
 * surfaces cannot drift apart again.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  resolveDisplayName,
  resolveFirstName,
  resolveIdentity,
  resolveInitials,
} from '../shared/identity.ts';

describe('the candidate identity', () => {
  describe('the name', () => {
    it('prefers the name the candidate chose', () => {
      assert.equal(
        resolveDisplayName({
          name: 'Nour Hassan',
          preferredName: 'Nour',
          accountName: 'nour.h',
        }),
        'Nour'
      );
    });

    it('falls back to the profile name, then the account name', () => {
      assert.equal(
        resolveDisplayName({ name: 'Nour Hassan', accountName: 'nour.h' }),
        'Nour Hassan'
      );
      assert.equal(resolveDisplayName({ accountName: 'nour.h' }), 'nour.h');
    });

    it('treats a blank name as no name', () => {
      assert.equal(resolveDisplayName({ name: '   ', preferredName: '', accountName: 'x' }), 'x');
      assert.equal(resolveDisplayName({}), '');
    });

    it('trims the name it returns', () => {
      assert.equal(resolveDisplayName({ name: '  Nour Hassan  ' }), 'Nour Hassan');
    });

    it('gives the same answer to every surface', () => {
      const identity = resolveIdentity({
        name: 'Nour Hassan',
        preferredName: 'Nour',
        accountName: 'nour.h',
      });

      // The topbar, the sidebar and the Dashboard all read this.
      assert.equal(identity.displayName, 'Nour');
      assert.equal(identity.isAnonymous, false);
    });

    it('reports an anonymous candidate honestly', () => {
      const identity = resolveIdentity({});
      assert.equal(identity.displayName, '');
      assert.equal(identity.isAnonymous, true);
      assert.equal(identity.initials, '');
    });
  });

  describe('the initials', () => {
    it('takes the first and last word', () => {
      assert.equal(resolveInitials('Nour Hassan'), 'NH');
      assert.equal(resolveInitials('Nour Abdelrahman Hassan'), 'NH');
    });

    it('takes two letters from a single name', () => {
      assert.equal(resolveInitials('Nour'), 'NO');
    });

    it('handles Arabic names', () => {
      assert.equal(resolveInitials('نور حسن'), 'نح');
      assert.equal(resolveInitials('نور'), 'نو');
    });

    it('returns nothing for a blank name', () => {
      assert.equal(resolveInitials(''), '');
      assert.equal(resolveInitials('   '), '');
      assert.equal(resolveInitials(null), '');
    });
  });

  describe('the first name', () => {
    it('keeps only the first word', () => {
      assert.equal(resolveFirstName('Nour Hassan'), 'Nour');
      assert.equal(resolveFirstName('  Nour Hassan  '), 'Nour');
    });

    it('returns nothing for a blank name', () => {
      assert.equal(resolveFirstName(''), '');
    });
  });
});
