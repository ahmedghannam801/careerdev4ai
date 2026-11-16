import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CAREER_ROLES, CATALOG_SKILL_NAMES } from '../shared/careerRoles.ts';
import { explainJobMatch, JOB_MATCH_WEIGHTS, shouldFilterSeniorJob, type JobMatchCandidate } from '../shared/jobMatching.ts';
import { normalizeLiveJob } from '../shared/jobs.ts';
function jobWith(overrides: Record<string, unknown> = {}) { const job = normalizeLiveJob({ job_id: 'test', job_title: `Senior ${CAREER_ROLES[0].title}`, employer_name: 'Example', job_required_skills: CAREER_ROLES[0].requiredSkills.map((s) => s.name), job_min_education: 'Bachelor degree', job_is_remote: true, job_description: 'listing', ...overrides }); if (!job) throw new Error('Invalid fixture'); return job; }
const role = CAREER_ROLES[0];
const candidate: JobMatchCandidate = { skillNames: [...role.requiredSkills, ...role.preferredSkills].map((s) => s.name), experienceLevel: 'senior', targetOpportunityType: 'both', educationLevel: 'doctorate', country: 'eg', city: 'Cairo' };
describe('weighted job matching', () => {
  it('weights sum to 100', () => assert.equal(Object.values(JOB_MATCH_WEIGHTS).reduce((sum, n) => sum + n, 0), 100));
  it('scores a perfect candidate 100', () => assert.equal(explainJobMatch(jobWith(), candidate, CATALOG_SKILL_NAMES, CAREER_ROLES).score, 100));
  it('scores no required skill matches as zero', () => assert.equal(explainJobMatch(jobWith(), { ...candidate, skillNames: [] }, CATALOG_SKILL_NAMES, CAREER_ROLES).factors.find((f) => f.factor === 'requiredSkills')?.score, 0));
  it('filters senior roles for a student internship target', () => { const result = explainJobMatch(jobWith(), { ...candidate, experienceLevel: 'student', targetOpportunityType: 'internship' }, CATALOG_SKILL_NAMES, CAREER_ROLES); assert.equal(shouldFilterSeniorJob(result.jobSeniority, result.candidateBand), true); });
  it('scores required and preferred skills separately', () => {
    const requiredOnly = { ...candidate, skillNames: role.requiredSkills.map((skill) => skill.name) };
    const result = explainJobMatch(jobWith(), requiredOnly, CATALOG_SKILL_NAMES, CAREER_ROLES);
    assert.equal(result.factors.find((factor) => factor.factor === 'requiredSkills')?.score, 100);
    assert.ok((result.factors.find((factor) => factor.factor === 'preferredSkills')?.score ?? 100) < 100);
    assert.equal(result.factors.find((factor) => factor.factor === 'requiredSkills')?.weight, 40);
    assert.equal(result.factors.find((factor) => factor.factor === 'preferredSkills')?.weight, 15);
  });
  it('breakdown contributions sum to the fit score', () => { const result = explainJobMatch(jobWith(), candidate, CATALOG_SKILL_NAMES, CAREER_ROLES); assert.equal(Math.round(result.factors.reduce((sum, f) => sum + f.contribution, 0)), result.score); });
});
