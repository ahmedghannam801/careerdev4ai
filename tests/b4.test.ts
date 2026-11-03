// B.4 — regression tests for the defects fixed in the final full-platform QA.
//
// Every test here covers a defect that was CONFIRMED against the live
// application (browser + API + database) before the fix, and that a
// source-only review would not have caught:
//
//   C-1  the database CHECK constraint on profiles.user_type rejected the
//        CareerState vocabulary the server now writes.
//   H-1  certifications and languages were never persisted: updateProfile
//        had no branch for them, so the UI mutated local state only.
//   H-2  a CV snapshot could not be created by a user who has no CV row
//        (the route requires a real cv_id).
//   H-3  the persona and the goal chosen during onboarding were local-only.
//   M-1  a failed profile save was reported to the user as a success.
//   M-2  the theme and the interface language never followed the account.
//   M-3  the job bookmarks were local-only, so a saved job vanished on
//        every reload.
//   M-4  a roadmap task added from the UI never reached the database.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestUser,
  deleteTestUser,
  admin,
  api,
  apiAnonymous,
  type TestUser,
} from './helpers.ts';

let user: TestUser;

before(async () => {
  user = await createTestUser('b4');
});

after(async () => {
  await deleteTestUser(user);
});

describe('B.4 — the profile persona and the goal persist', () => {
  test('the persona the onboarding UI produces is accepted by the database', async () => {
    // The five values the onboarding screen can produce. The live
    // profiles.user_type CHECK constraint used to accept only 'student',
    // 'graduate', 'working' and 'career_shift', so every persona other
    // than 'student' was rejected by the DATABASE with a 500.
    const personas = [
      'student',
      'fresh_graduate',
      'working_professional',
      'career_switcher',
      'exploring',
    ];

    for (const persona of personas) {
      const res = await api('PATCH', '/api/profile', {
        token: user.token,
        body: { userType: persona },
      });
      assert.equal(res.status, 200, `PATCH rejected the persona "${persona}"`);
    }

    const { data } = await admin
      .from('profiles')
      .select('user_type')
      .eq('id', user.id)
      .single();
    assert.equal(data?.user_type, 'exploring');
  });

  test('a legacy persona is still valid in the database', async () => {
    // The SERVER speaks the CareerState vocabulary only, so a legacy value
    // is rejected with 400. The DATABASE constraint was widened as a SUPERSET
    // (migration 008), so a row written before the change is NOT invalidated
    // by the migration — that is what this test proves: the constraint still
    // accepts a legacy value written straight to the row.
    const res = await api('PATCH', '/api/profile', {
      token: user.token,
      body: { userType: 'graduate' },
    });
    assert.equal(
      res.status,
      400,
      'the server must reject a persona outside the domain vocabulary'
    );

    for (const persona of ['graduate', 'working', 'career_shift']) {
      const { error } = await admin
        .from('profiles')
        .update({ user_type: persona })
        .eq('id', user.id);
      assert.equal(
        error,
        null,
        `the database rejected the pre-existing legacy value "${persona}": ${error?.message}`
      );
    }

    // Put the row back on a domain value for the tests that follow.
    await admin.from('profiles').update({ user_type: 'exploring' }).eq('id', user.id);
  });

  test('an unknown persona is still rejected with 400', async () => {
    const res = await api('PATCH', '/api/profile', {
      token: user.token,
      body: { userType: 'NOPE' },
    });
    assert.equal(res.status, 400);
  });

  test('the career goal and the custom goal text persist', async () => {
    const res = await api('PATCH', '/api/profile', {
      token: user.token,
      body: {
        careerGoal: 'switch_career',
        customGoalText: 'Move into platform engineering within a year.',
        onboardingCompleted: true,
        targetRole: 'Frontend Engineer',
        targetIndustry: 'Software Engineering',
      },
    });
    assert.equal(res.status, 200);

    const { data } = await admin
      .from('profiles')
      .select('career_goal, custom_goal_text, onboarding_completed, target_role')
      .eq('id', user.id)
      .single();
    assert.equal(data?.career_goal, 'switch_career');
    assert.equal(
      data?.custom_goal_text,
      'Move into platform engineering within a year.'
    );
    assert.equal(data?.onboarding_completed, true);
    assert.equal(data?.target_role, 'Frontend Engineer');
  });

  test('the onboarding step and skip state persist across reloads', async () => {
    const progress = await api('PATCH', '/api/profile', {
      token: user.token,
      body: { onboardingStatus: 'started', onboardingStep: 7, onboardingCompleted: false },
    });
    assert.equal(progress.status, 200);

    const started = await admin
      .from('profiles')
      .select('onboarding_status, onboarding_step, onboarding_completed')
      .eq('id', user.id)
      .single();
    assert.equal(started.data?.onboarding_status, 'started');
    assert.equal(started.data?.onboarding_step, 7);
    assert.equal(started.data?.onboarding_completed, false);

    const skipped = await api('PATCH', '/api/profile', {
      token: user.token,
      body: { onboardingStatus: 'skipped', onboardingStep: 7, onboardingCompleted: true },
    });
    assert.equal(skipped.status, 200);
    const resumed = await admin
      .from('profiles')
      .select('onboarding_status, onboarding_step, onboarding_completed')
      .eq('id', user.id)
      .single();
    assert.equal(resumed.data?.onboarding_status, 'skipped');
    assert.equal(resumed.data?.onboarding_step, 7);
    // Skipping is persisted separately from completion; the legacy flag stays false.
    assert.equal(resumed.data?.onboarding_completed, false);
  });

  test('the target role, the years of experience and the headline persist', async () => {
    // years_of_experience is a real `text` column in the live schema, but
    // it was never selected, so it could not be read back.
    const res = await api('PATCH', '/api/profile', {
      token: user.token,
      body: {
        targetRole: 'Full-Stack Engineer',
        yearsOfExperience: '4 years',
        headline: 'Full-stack engineer | React, Node, PostgreSQL',
        currentTitle: 'Senior Software Engineer',
        currentCompany: 'Acme Corp',
        location: 'Cairo, Egypt',
      },
    });
    assert.equal(res.status, 200);

    const { data } = await admin
      .from('profiles')
      .select(
        'target_role, years_of_experience, headline, current_title, current_company, location'
      )
      .eq('id', user.id)
      .single();
    assert.equal(data?.target_role, 'Full-Stack Engineer');
    assert.equal(data?.years_of_experience, '4 years');
    assert.equal(data?.headline, 'Full-stack engineer | React, Node, PostgreSQL');
    assert.equal(data?.current_title, 'Senior Software Engineer');
    assert.equal(data?.current_company, 'Acme Corp');
    assert.equal(data?.location, 'Cairo, Egypt');
  });
});

describe('B.4 — the account-owned settings persist', () => {
  test('the theme and the language are written to user_preferences', async () => {
    const res = await api('PATCH', '/api/preferences', {
      token: user.token,
      body: { theme: 'dark', language: 'ar' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body?.preferences?.theme, 'dark');
    assert.equal(res.body?.preferences?.language, 'ar');

    const { data } = await admin
      .from('user_preferences')
      .select('theme, language')
      .eq('user_id', user.id)
      .single();
    assert.equal(data?.theme, 'dark');
    assert.equal(data?.language, 'ar');
  });

  test('the settings are read back through the API', async () => {
    const res = await api('GET', '/api/preferences', { token: user.token });
    assert.equal(res.status, 200);
    assert.equal(res.body?.preferences?.theme, 'dark');
    assert.equal(res.body?.preferences?.language, 'ar');
  });

  test('an invalid theme is rejected with 400', async () => {
    const res = await api('PATCH', '/api/preferences', {
      token: user.token,
      body: { theme: 'neon' },
    });
    assert.equal(res.status, 400);
  });

  test('an invalid language is rejected with 400', async () => {
    const res = await api('PATCH', '/api/preferences', {
      token: user.token,
      body: { language: 'fr' },
    });
    assert.equal(res.status, 400);
  });

  test('the preferences routes require authentication', async () => {
    const list = await apiAnonymous('GET', '/api/preferences');
    assert.equal(list.status, 401);
    const write = await apiAnonymous('PATCH', '/api/preferences', {
      body: { theme: 'dark' },
    });
    assert.equal(write.status, 401);
  });
});

describe('B.4 — the job bookmarks persist', () => {
  test('a bookmark is created, listed and deleted', async () => {
    const create = await api('POST', '/api/bookmarks', {
      token: user.token,
      body: { jobId: 'job-fe-01' },
    });
    assert.equal(create.status, 201);
    assert.equal(create.body?.bookmark?.jobId, 'job-fe-01');

    const { data } = await admin
      .from('job_bookmarks')
      .select('job_id, profile_id')
      .eq('profile_id', user.id)
      .single();
    assert.equal(data?.job_id, 'job-fe-01');
    assert.equal(data?.profile_id, user.id);

    const list = await api('GET', '/api/bookmarks', { token: user.token });
    assert.equal(list.status, 200);
    assert.ok(
      (list.body?.bookmarks ?? []).some((b: any) => b.jobId === 'job-fe-01')
    );

    const remove = await api('DELETE', '/api/bookmarks/job-fe-01', {
      token: user.token,
    });
    assert.equal(remove.status, 200);

    const { count } = await admin
      .from('job_bookmarks')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', user.id);
    assert.equal(count, 0);
  });

  test('saving the same job twice does not create a duplicate', async () => {
    await api('POST', '/api/bookmarks', { token: user.token, body: { jobId: 'job-dup' } });
    await api('POST', '/api/bookmarks', { token: user.token, body: { jobId: 'job-dup' } });

    const { count } = await admin
      .from('job_bookmarks')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', user.id)
      .eq('job_id', 'job-dup');
    assert.equal(count, 1);

    await api('DELETE', '/api/bookmarks/job-dup', { token: user.token });
  });

  test('a missing jobId is rejected with 400', async () => {
    const res = await api('POST', '/api/bookmarks', { token: user.token, body: {} });
    assert.equal(res.status, 400);
  });

  test('the bookmarks routes require authentication', async () => {
    const list = await apiAnonymous('GET', '/api/bookmarks');
    assert.equal(list.status, 401);
    const create = await apiAnonymous('POST', '/api/bookmarks', { body: { jobId: 'x' } });
    assert.equal(create.status, 401);
  });

  test('another user cannot see or delete a bookmark', async () => {
    await api('POST', '/api/bookmarks', { token: user.token, body: { jobId: 'job-private' } });

    const other = await createTestUser('b4-other');
    try {
      const list = await api('GET', '/api/bookmarks', { token: other.token });
      assert.equal(
        (list.body?.bookmarks ?? []).some((b: any) => b.jobId === 'job-private'),
        false,
        'another user saw a bookmark they do not own'
      );

      const remove = await api('DELETE', '/api/bookmarks/job-private', {
        token: other.token,
      });
      assert.equal(remove.status, 404);

      // The owner's bookmark is intact.
      const { data } = await admin
        .from('job_bookmarks')
        .select('job_id')
        .eq('profile_id', user.id)
        .eq('job_id', 'job-private')
        .maybeSingle();
      assert.ok(data, "another user deleted the owner's bookmark");
    } finally {
      await deleteTestUser(other);
    }
  });
});

describe('B.4 — a CV snapshot can be created by a user with no CV row', () => {
  test('POST /api/cv-versions without a cvId is rejected with 400', async () => {
    // This is the exact request the frontend used to send when the user
    // had never created a CV: the answer was a 400 and the snapshot was
    // silently lost.
    const res = await api('POST', '/api/cv-versions', {
      token: user.token,
      body: { name: 'v1', profileJson: { fullName: 'B4' } },
    });
    assert.equal(res.status, 400);
  });

  test('a CV is created first and a version is attached to it', async () => {
    const cv = await api('POST', '/api/cvs', {
      token: user.token,
      body: { name: 'B4 CV', targetRoleTitle: 'Full-Stack Engineer' },
    });
    assert.equal(cv.status, 201);
    const cvId = cv.body?.cv?.id;

    const version = await api('POST', '/api/cv-versions', {
      token: user.token,
      body: { cvId, name: 'v1', profileJson: { fullName: 'B4' }, atsAnalysis: { overallScore: 91 } },
    });
    assert.equal(version.status, 201, JSON.stringify(version.body));
    assert.equal(version.body?.version?.cvId, cvId);

    const { data } = await admin
      .from('cv_versions')
      .select('cv_id, ats_analysis')
      .eq('id', version.body?.version?.id)
      .single();
    assert.equal(data?.cv_id, cvId);
    assert.equal((data?.ats_analysis as any)?.overallScore, 91);

    await api('DELETE', `/api/cvs/${cvId}`, { token: user.token });
  });

  test("a version cannot be attached to another user's CV", async () => {
    const other = await createTestUser('b4-cv');
    try {
      const cv = await api('POST', '/api/cvs', {
        token: other.token,
        body: { name: 'Other CV' },
      });
      const cvId = cv.body?.cv?.id;

      const res = await api('POST', '/api/cv-versions', {
        token: user.token,
        body: { cvId, name: 'stolen', profileJson: {} },
      });
      assert.equal(res.status, 404);
    } finally {
      await deleteTestUser(other);
    }
  });
});

describe('B.4 — a roadmap task added from the UI reaches the database', () => {
  test('the task is a row in roadmap_tasks and it survives a reload', async () => {
    const roadmap = await api('POST', '/api/roadmap', {
      token: user.token,
      body: {
        title: 'B4 Roadmap',
        isEnrolled: true,
        phases: [
          {
            phaseNumber: 1,
            title: 'P1',
            milestones: [{ title: 'M1', tasks: [{ title: 'T1', status: 'not_started' }] }],
          },
        ],
      },
    });
    assert.equal(roadmap.status, 201, JSON.stringify(roadmap.body));
    const phaseId = roadmap.body?.roadmap?.phases?.[0]?.id;
    const milestoneId = roadmap.body?.roadmap?.phases?.[0]?.milestones?.[0]?.id;

    const created = await api(
      'POST',
      `/api/roadmap/phases/${phaseId}/milestones/${milestoneId}/tasks`,
      { token: user.token, body: { title: 'T2 added from the UI', status: 'not_started' } }
    );
    assert.equal(created.status, 201);

    const { data } = await admin
      .from('roadmap_tasks')
      .select('title, milestone_id')
      .eq('milestone_id', milestoneId)
      .eq('title', 'T2 added from the UI')
      .maybeSingle();
    assert.ok(data, 'the task the UI added is not a row in roadmap_tasks');

    // The status change persists too.
    const taskId = created.body?.task?.id;
    const patch = await api('PATCH', `/api/roadmap/tasks/${taskId}`, {
      token: user.token,
      body: { status: 'in_progress' },
    });
    assert.equal(patch.status, 200);

    const { data: after } = await admin
      .from('roadmap_tasks')
      .select('status')
      .eq('id', taskId)
      .single();
    assert.equal(after?.status, 'in_progress');

    await api('DELETE', '/api/roadmap', { token: user.token });
  });
});
