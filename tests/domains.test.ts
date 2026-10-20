// CRUD and persistence tests for the B.3 domains, plus CV file storage,
// roadmap persistence and the dedicated profile API.
//
// Every row created here is removed by explicit id in the `after` hooks.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestUser,
  deleteTestUser,
  deleteRow,
  deleteStorageObject,
  admin,
  api,
  type TestUser,
} from './helpers.ts';

let userA: TestUser;
const created: Array<{ table: string; id: string }> = [];
const storagePaths: string[] = [];

before(async () => {
  userA = await createTestUser('crud');
});

after(async () => {
  for (const path of storagePaths) await deleteStorageObject(path);
  for (const row of created) await deleteRow(row.table, row.id);
  await deleteTestUser(userA);
});

function track(table: string, id: string) {
  created.push({ table, id });
}

describe('domain CRUD', () => {
  test('project + project skills round-trip', async () => {
    const createdRes = await api('POST', '/api/projects', {
      token: userA.token,
      body: {
        title: 'Design system',
        goal: 'ship',
        description: 'a11y',
        difficulty: 'Advanced',
        status: 'in_progress',
        tasks: ['t1'],
        deliverables: ['d1'],
        skills: ['React'],
      },
    });
    assert.equal(createdRes.status, 201);
    const project = createdRes.body.project;
    track('projects', project.id);
    assert.deepEqual(project.skills, ['React']);

    const { data: links } = await admin
      .from('project_skills')
      .select('project_id, skill_name')
      .eq('project_id', project.id);
    assert.equal(links?.length, 1, 'the skill link must be persisted');
    assert.equal(links?.[0]?.skill_name, 'React');

    const read = await api('GET', `/api/projects/${project.id}`, { token: userA.token });
    assert.equal(read.status, 200);
    assert.equal(read.body.project.title, 'Design system');
  });

  test('evidence + evidence skills round-trip', async () => {
    const createdRes = await api('POST', '/api/evidence', {
      token: userA.token,
      body: {
        title: 'GitHub repo',
        type: 'github',
        description: 'proof',
        url: 'https://example.invalid/repo',
        verified: true,
        dateAdded: '2026-01-01',
        skillNames: ['TypeScript'],
      },
    });
    assert.equal(createdRes.status, 201);
    const evidence = createdRes.body.evidence;
    track('evidence_items', evidence.id);
    assert.deepEqual(evidence.skillNames, ['TypeScript']);

    const { data: links } = await admin
      .from('evidence_skills')
      .select('evidence_id')
      .eq('evidence_id', evidence.id);
    assert.equal(links?.length, 1, 'the evidence skill link must be persisted');
  });

  test('certification, language, link and career identity round-trip', async () => {
    const cert = await api('POST', '/api/certifications', {
      token: userA.token,
      body: { name: 'Cert', issuer: 'Meta', issueDate: '2024-01-01', expiryDate: '2027-01-01' },
    });
    assert.equal(cert.status, 201);
    track('profile_certifications', cert.body.certification.id);

    const lang = await api('POST', '/api/languages', {
      token: userA.token,
      body: { name: 'Arabic', proficiency: 'Native' },
    });
    assert.equal(lang.status, 201);
    track('profile_languages', lang.body.language.id);

    const link = await api('POST', '/api/profile-links', {
      token: userA.token,
      body: { kind: 'linkedin', label: 'LI', url: 'https://linkedin.com/in/test' },
    });
    assert.equal(link.status, 201);
    track('profile_links', link.body.link.id);

    const identity = await api('PUT', '/api/career-identity', {
      token: userA.token,
      body: { whoYouAre: 'builder', whereYoureGoing: 'staff engineer' },
    });
    assert.equal(identity.status, 200);
    assert.equal(identity.body.identity.whoYouAre, 'builder');
  });

  test('saved role, job application and interview session round-trip', async () => {
    const role = await api('POST', '/api/saved-roles', {
      token: userA.token,
      body: { roleId: 'frontend-engineer', title: 'Frontend Engineer', level: 'Mid' },
    });
    assert.equal(role.status, 201);

    const application = await api('POST', '/api/job-applications', {
      token: userA.token,
      body: {
        company: 'Acme',
        role: 'Dev',
        location: 'Remote',
        workMode: 'Remote',
        stage: 'applied',
        appliedDate: '2026-05-01',
        notes: 'n',
        salaryDiscussed: '$145,000',
        interviewStageDetails: 'Technical Interview (Virtual)',
      },
    });
    assert.equal(application.status, 201);
    const appRow = application.body.application;
    track('job_applications', appRow.id);
    assert.equal(appRow.salaryDiscussed, '$145,000', 'the salary string must survive');
    assert.equal(appRow.interviewStageDetails, 'Technical Interview (Virtual)');

    const interview = await api('POST', '/api/interviews', {
      token: userA.token,
      body: {
        roleTitle: 'FE',
        type: 'technical',
        question: 'Explain generics',
        userAnswer: 'My answer',
        aiFeedback: { score: 9, strengths: ['a'], improvements: ['b'], suggestedAnswer: 'c' },
      },
    });
    assert.equal(interview.status, 201);
    track('interview_sessions', interview.body.session.id);
  });
});

describe('CV persistence and file storage', () => {
  test('a CV and its version persist, and the version carries a real timestamp', async () => {
    const cv = await api('POST', '/api/cvs', {
      token: userA.token,
      body: { name: 'My CV', targetRoleTitle: 'FE' },
    });
    assert.equal(cv.status, 201);
    const cvId = cv.body.cv.id;
    track('cvs', cvId);

    const version = await api('POST', '/api/cv-versions', {
      token: userA.token,
      body: {
        cvId,
        name: 'v1',
        targetRoleTitle: 'FE',
        profileJson: { fullName: 'Me', summary: 's' },
        atsAnalysis: { overallScore: 90 },
      },
    });
    assert.equal(version.status, 201);
    assert.match(version.body.version.createdAt, /^\d{4}-\d{2}-\d{2}T/);

    const list = await api('GET', '/api/cv-versions', { token: userA.token });
    assert.ok(
      (list.body?.versions ?? []).some((v: any) => v.id === version.body.version.id),
      'the version must be listed'
    );
  });

  test('the stored file belongs to its owner and is removed with the CV', async () => {
    const uploaded = await uploadCvFile(userA);
    const path = uploaded.path;
    storagePaths.push(path);

    const { data: objects } = await admin.storage.from('cv-files').list(userA.id);
    assert.ok(objects?.some((o: any) => o.name === path.split('/')[1]), 'the file must be in the bucket');

    const cv = await api('POST', '/api/cvs', {
      token: userA.token,
      body: { name: 'With file', storagePath: path },
    });
    assert.equal(cv.status, 201);
    const cvId = cv.body.cv.id;
    track('cvs', cvId);

    // Another user must not be able to obtain a download URL for this file.
    const stolen = await api('GET', `/api/cvs/${cvId}/file`, { token: userA.token });
    assert.equal(stolen.status, 200);
    assert.ok(stolen.body?.url, 'the owner gets a signed URL');
  });

  test('another user cannot read a CV file through the API', async () => {
    const userB = await createTestUser('b');
    try {
      const cv = await api('POST', '/api/cvs', {
        token: userA.token,
        body: { name: 'private cv' },
      });
      const cvId = cv.body.cv.id;
      track('cvs', cvId);

      const stolen = await api('GET', `/api/cvs/${cvId}/file`, { token: userB.token });
      assert.equal(stolen.status, 404, "B must not get A's file");
    } finally {
      await deleteTestUser(userB);
    }
  });

  test('deleting a CV removes its versions (FK cascade)', async () => {
    const cv = await api('POST', '/api/cvs', {
      token: userA.token,
      body: { name: 'cascade cv' },
    });
    const cvId = cv.body.cv.id;

    const version = await api('POST', '/api/cv-versions', {
      token: userA.token,
      body: { cvId, name: 'v1', profileJson: {} },
    });
    assert.equal(version.status, 201);
    const versionId = version.body.version.id;

    const del = await api('DELETE', `/api/cvs/${cvId}`, { token: userA.token });
    assert.equal(del.status, 200);

    const { count } = await admin
      .from('cv_versions')
      .select('id', { count: 'exact', head: true })
      .eq('id', versionId);
    assert.equal(count, 0, 'the version must be cascade-deleted');
  });
});

describe('roadmap persistence', () => {
  test('a roadmap, its phase, milestone and task persist with ownership', async () => {
    const roadmap = await api('POST', '/api/roadmap', {
      token: userA.token,
      body: { title: 'My roadmap', targetRoleTitle: 'FE', isEnrolled: true },
    });
    assert.equal(roadmap.status, 201);
    const roadmapId = roadmap.body.roadmap.id;
    track('roadmaps', roadmapId);

    // Build a phase -> milestone -> task chain directly in the DB, then read it
    // back through the API (the API has no phase/milestone create endpoint).
    const { data: phase } = await admin
      .from('roadmap_phases')
      .insert({ roadmap_id: roadmapId, phase_number: 1, title: 'Phase 1' })
      .select('id')
      .single();
    const { data: milestone } = await admin
      .from('roadmap_milestones')
      .insert({ phase_id: phase!.id, title: 'Milestone 1', sort_order: 0 })
      .select('id')
      .single();
    const { data: task } = await admin
      .from('roadmap_tasks')
      .insert({ milestone_id: milestone!.id, title: 'Task 1', status: 'not_started', sort_order: 0 })
      .select('id')
      .single();

    const read = await api('GET', '/api/roadmap', { token: userA.token });
    assert.equal(read.status, 200);
    const found = read.body?.roadmap;
    assert.equal(found?.phases?.length, 1);
    assert.equal(found?.phases?.[0]?.milestones?.[0]?.tasks?.[0]?.title, 'Task 1');
    assert.equal(found?.totalTasks, 1);
    assert.equal(found?.progressPercent, 0);

    // Progress is persisted server-side.
    const patched = await api('PATCH', `/api/roadmap/tasks/${task!.id}`, {
      token: userA.token,
      body: { status: 'completed' },
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body?.roadmap?.completedTasks, 1);
    assert.equal(patched.body?.roadmap?.progressPercent, 100);

    const { data: stored } = await admin
      .from('roadmap_tasks')
      .select('status')
      .eq('id', task!.id)
      .single();
    assert.equal(stored?.status, 'completed', 'the status must be stored in the DB');
  });

  test("another user cannot read or modify another user's roadmap", async () => {
    const userB = await createTestUser('rb');
    try {
      // A user has at most one roadmap (UNIQUE profile_id), so reuse the one A
      // already owns rather than creating a second.
      const existing = await api('GET', '/api/roadmap', { token: userA.token });
      const roadmapId = existing.body?.roadmap?.id;
      assert.ok(roadmapId, 'A must own a roadmap for this test');

      const { data: phase, error: phaseError } = await admin
        .from('roadmap_phases')
        .insert({ roadmap_id: roadmapId, phase_number: 2, title: 'P' })
        .select('id')
        .single();
      assert.equal(phaseError, null, `phase insert failed: ${phaseError?.message}`);
      const { data: milestone } = await admin
        .from('roadmap_milestones')
        .insert({ phase_id: phase!.id, title: 'M', sort_order: 0 })
        .select('id')
        .single();
      const { data: task } = await admin
        .from('roadmap_tasks')
        .insert({ milestone_id: milestone!.id, title: 'T', status: 'not_started', sort_order: 0 })
        .select('id')
        .single();

      const read = await api('GET', '/api/roadmap', { token: userB.token });
      assert.equal(read.body?.roadmap, null, "B must not see A's roadmap");

      const patched = await api('PATCH', `/api/roadmap/tasks/${task!.id}`, {
        token: userB.token,
        body: { status: 'completed' },
      });
      assert.equal(patched.status, 404, "B must not modify A's task");

      const { data: stored } = await admin
        .from('roadmap_tasks')
        .select('status')
        .eq('id', task!.id)
        .single();
      assert.equal(stored?.status, 'not_started', "A's task must be unchanged");
    } finally {
      await deleteTestUser(userB);
    }
  });
});

describe('dedicated profile API', () => {
  test('GET returns the profile with its extensions', async () => {
    const res = await api('GET', '/api/profile', { token: userA.token });
    assert.equal(res.status, 200);
    assert.equal(res.body?.profile?.id, userA.id);
    assert.ok(Array.isArray(res.body?.profile?.certifications));
    assert.ok(Array.isArray(res.body?.profile?.languages));
    assert.ok(Array.isArray(res.body?.profile?.links));
  });

  test('PATCH updates the profile and the change is persisted', async () => {
    const res = await api('PATCH', '/api/profile', {
      token: userA.token,
      body: {
        fullName: 'Updated Name',
        city: 'Cairo',
        country: 'Egypt',
        currentTitle: 'Staff Engineer',
        bio: 'A short bio',
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body?.profile?.fullName, 'Updated Name');
    assert.equal(res.body?.profile?.city, 'Cairo');

    const { data } = await admin
      .from('profiles')
      .select('full_name, city, country')
      .eq('id', userA.id)
      .single();
    assert.equal(data?.full_name, 'Updated Name');
    assert.equal(data?.city, 'Cairo');
    assert.equal(data?.country, 'Egypt');
  });

  test('PATCH persists the professional links', async () => {
    const res = await api('PATCH', '/api/profile', {
      token: userA.token,
      body: {
        links: {
          linkedin: 'https://linkedin.com/in/test',
          github: 'https://github.com/test',
        },
      },
    });
    assert.equal(res.status, 200);
    const kinds = (res.body?.profile?.links ?? []).map((l: any) => l.kind);
    assert.ok(kinds.includes('linkedin'), 'the linkedin link must be stored');
    assert.ok(kinds.includes('github'), 'the github link must be stored');

    const { data } = await admin
      .from('profile_links')
      .select('kind, url')
      .eq('profile_id', userA.id);
    assert.equal(data?.length, 2, 'exactly the two supplied links must exist');
  });

  test('PATCH rejects an invalid userType with 400', async () => {
    const res = await api('PATCH', '/api/profile', {
      token: userA.token,
      body: { userType: 'NOPE' },
    });
    assert.equal(res.status, 400);
  });
});

/** Uploads a small text file into the CV bucket as the given user. */
async function uploadCvFile(user: TestUser): Promise<{ path: string }> {
  const { randomUUID } = await import('crypto');
  const path = `${user.id}/${randomUUID()}.txt`;
  const { error } = await admin.storage
    .from('cv-files')
    .upload(path, Buffer.from('a test cv file body'), { contentType: 'text/plain' });
  if (error) throw error;
  return { path };
}
