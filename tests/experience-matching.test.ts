import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  providerForSimulationUrl,
  normalizeCertificateUrl,
  isSafeExternalUrl,
  isExperienceDifficulty,
  isExperienceProgressStatus,
  type CareerExperience,
} from '../shared/careerExperience.ts';
import {
  rankExperiences,
  scoreExperience,
  selectNextExperience,
  skillKey,
} from '../shared/experienceMatching.ts';

function experience(overrides: Partial<CareerExperience> = {}): CareerExperience {
  return {
    id: 'forage-test-simulation',
    title: 'Test Simulation',
    provider: 'Forage',
    providerUrl: 'https://www.theforage.com',
    description: 'A test simulation.',
    category: 'Software Engineering',
    difficulty: 'intermediate',
    durationHours: 4,
    durationLabel: '3-5 hours',
    url: 'https://www.theforage.com/simulations/test-company/test-simulation-abc1',
    domainIds: ['technology'],
    skills: [
      { name: 'Programming Fundamentals', importance: 5 },
      { name: 'Automated Testing', importance: 4 },
    ],
    roles: [{ roleSlug: 'software-engineer', relevanceScore: 90 }],
    isActive: true,
    isFeatured: false,
    sortOrder: 100,
    ...overrides,
  };
}

describe('career experience provider links', () => {
  it('accepts an official Forage simulation URL', () => {
    const provider = providerForSimulationUrl(
      'https://www.theforage.com/simulations/commonwealth-bank/software-engineering-c4hw'
    );
    assert.equal(provider?.id, 'forage');
  });

  it('rejects insecure, third-party and catalogue URLs', () => {
    assert.equal(
      providerForSimulationUrl('http://www.theforage.com/simulations/a/b'),
      null
    );
    assert.equal(
      providerForSimulationUrl('https://example.com/simulations/a/b'),
      null
    );
    assert.equal(providerForSimulationUrl('https://www.theforage.com/simulations/'), null);
    assert.equal(providerForSimulationUrl('https://www.theforage.com/blog/a/b'), null);
    assert.equal(providerForSimulationUrl('not a URL'), null);
  });

  it('accepts only safe HTTPS certificate links', () => {
    assert.equal(
      normalizeCertificateUrl('https://www.theforage.com/completion-certificates/x/y').ok,
      true
    );
    assert.equal(normalizeCertificateUrl('http://example.com/cert.pdf').ok, false);
    assert.equal(normalizeCertificateUrl('javascript:alert(1)').ok, false);
    assert.equal(normalizeCertificateUrl('https://user:pass@example.com/cert').ok, false);
    assert.equal(normalizeCertificateUrl('').ok, false);
    assert.equal(isSafeExternalUrl('https://example.com'), true);
    assert.equal(isSafeExternalUrl('//example.com'), false);
  });
});

describe('career experience vocabulary', () => {
  it('recognises only the stored difficulty and progress values', () => {
    assert.equal(isExperienceDifficulty('introductory'), true);
    assert.equal(isExperienceDifficulty('expert'), false);
    assert.equal(isExperienceProgressStatus('in_progress'), true);
    assert.equal(isExperienceProgressStatus('saved'), false);
  });
});

describe('career experience matching', () => {
  it('ranks a target-domain, target-role and gap match above an unrelated one', () => {
    const related = experience();
    const unrelated = experience({
      id: 'forage-finance',
      title: 'Finance Simulation',
      domainIds: ['finance'],
      roles: [{ roleSlug: 'financial-analyst', relevanceScore: 80 }],
      skills: [{ name: 'Financial Modelling & Forecasting', importance: 5 }],
    });

    const ranked = rankExperiences(
      [unrelated, related],
      {
        targetRoleSlug: 'software-engineer',
        targetRoleTitle: 'Software Engineer',
        targetDomainId: 'technology',
        requiredSkills: ['Programming Fundamentals'],
        gapSkills: ['Automated Testing'],
        experienceLevel: 'junior',
      }
    );

    assert.equal(ranked[0].experience.id, related.id);
    assert.ok(ranked[0].score > ranked[1].score);
    assert.equal(ranked[0].strongSignal, true);
    assert.deepEqual(
      ranked[0].reasons.map((reason) => reason.code),
      ['target_domain', 'target_role', 'skill_gap', 'level']
    );
    assert.deepEqual(ranked[0].gapSkillsAddressed, ['Automated Testing']);
  });

  it('excludes completed experiences unless asked to include them', () => {
    const item = experience();
    const progress = [
      {
        experienceId: item.id,
        status: 'completed' as const,
        saved: true,
        startedAt: null,
        completedAt: '2026-01-01T00:00:00.000Z',
        createdAt: null,
        updatedAt: null,
      },
    ];

    assert.equal(rankExperiences([item], {}, progress).length, 0);
    assert.equal(
      rankExperiences([item], {}, progress, { includeCompleted: true }).length,
      1
    );
  });

  it('names the roadmap and completed-learning skills that produced a signal', () => {
    const item = experience();
    const match = scoreExperience(item, {
      targetRoleSlug: 'software-engineer',
      targetDomainId: 'technology',
      roadmapSkills: ['Programming Fundamentals'],
      learningSkills: ['Automated Testing'],
    });

    const roadmap = match.reasons.find((reason) => reason.code === 'roadmap');
    const learning = match.reasons.find((reason) => reason.code === 'learning');
    assert.deepEqual(roadmap?.skills, ['Programming Fundamentals']);
    assert.deepEqual(learning?.skills, ['Automated Testing']);
    assert.equal(match.strongSignal, true);
  });

  it('prefers the difficulty that fits the candidate level', () => {
    const introductory = experience({ id: 'intro', difficulty: 'introductory' });
    const advanced = experience({ id: 'advanced', difficulty: 'advanced' });

    const student = scoreExperience(introductory, { experienceLevel: 'student' });
    const studentAdvanced = scoreExperience(advanced, { experienceLevel: 'student' });
    assert.ok(student.score > studentAdvanced.score);

    const lead = scoreExperience(advanced, { experienceLevel: 'lead' });
    const leadIntroductory = scoreExperience(introductory, { experienceLevel: 'lead' });
    assert.ok(lead.score > leadIntroductory.score);
  });

  it('is deterministic and uses the curated order as a tie-break', () => {
    const first = experience({ id: 'a', title: 'A', sortOrder: 10 });
    const second = experience({ id: 'b', title: 'B', sortOrder: 20 });
    const rankedOnce = rankExperiences([second, first], {});
    const rankedTwice = rankExperiences([second, first], {});
    assert.deepEqual(
      rankedOnce.map((match) => match.experience.id),
      rankedTwice.map((match) => match.experience.id)
    );
    assert.deepEqual(
      rankedOnce.map((match) => match.experience.id),
      ['a', 'b']
    );
  });

  it('falls back to an honest exploration reason when nothing matches', () => {
    const match = scoreExperience(experience(), {});
    assert.deepEqual(
      match.reasons.map((reason) => reason.code),
      ['explore']
    );
    assert.equal(match.strongSignal, false);
  });

  it('selects the first strong signal as the next experience', () => {
    const weak = scoreExperience(experience({ id: 'weak', domainIds: ['finance'] }), {});
    const strong = scoreExperience(experience({ id: 'strong' }), {
      targetDomainId: 'technology',
    });
    assert.equal(selectNextExperience([weak, strong])?.experience.id, 'strong');
  });

  it('normalises skill names so casing and punctuation cannot split a match', () => {
    assert.equal(skillKey('  Automated   Testing '), 'automated testing');
    assert.equal(skillKey('C++ / C#'), 'c++ c#');
  });
});
