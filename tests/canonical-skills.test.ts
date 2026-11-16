import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalSkillId, resolveCanonicalSkill } from '../shared/canonicalSkills.ts';

test('canonical skill ids normalize aliases and compound names', () => {
  assert.equal(canonicalSkillId('JS'), 'javascript');
  assert.equal(canonicalSkillId('React.js'), 'react');
  assert.equal(canonicalSkillId('Pandas & NumPy'), 'python-data-stack');
  assert.equal(canonicalSkillId('Amazon Web Services'), 'aws');
});

test('canonical skill resolution rejects empty or non-skill section labels', () => {
  assert.equal(resolveCanonicalSkill(''), null);
  assert.equal(resolveCanonicalSkill('Technical Skills'), null);
});
