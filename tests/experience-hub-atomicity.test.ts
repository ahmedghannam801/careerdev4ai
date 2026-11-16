/**
 * The Career Experience Hub's writes are atomic.
 *
 * The defect: the server rewrote `user_experience_progress` and deleted the
 * certificate it supported in two separate statements. A failure between them
 * left the candidate's record half-changed while the API reported an error.
 *
 * The fix moves each multi-row operation into one database function and calls
 * it with one RPC. These checks pin the migration's shape and the server's
 * wiring. The functions themselves are exercised against a database once the
 * migration is applied; this file needs no database.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const migration = read('../supabase/migrations/20261122000001_experience_hub_atomic_writes.sql');
const service = read('../server/db/careerExperiences.ts');
const routes = read('../app.ts');

const FUNCTIONS = [
  { name: 'career_experience_progress_set', signature: 'uuid, text, text, boolean' },
  { name: 'career_experience_progress_delete', signature: 'uuid, text' },
  { name: 'career_experience_certificate_set', signature: 'uuid, text, text' },
];

describe('Experience Hub atomic writes', () => {
  it('defines one database function per multi-row operation', () => {
    for (const fn of FUNCTIONS) {
      assert.match(
        migration,
        new RegExp(`create or replace function public\\.${fn.name}\\(`),
        `${fn.name} is defined`
      );
    }
  });

  it('runs each function as the invoker with an explicit search path', () => {
    const body = migration.toLowerCase();
    assert.equal((body.match(/security invoker/g) ?? []).length, FUNCTIONS.length);
    assert.equal((body.match(/set search_path = public, pg_temp/g) ?? []).length, FUNCTIONS.length);
  });

  it('keeps the functions server-only', () => {
    for (const fn of FUNCTIONS) {
      assert.match(
        migration,
        new RegExp(
          `revoke all on function public\\.${fn.name}\\(${fn.signature.replace(/[()]/g, '\\$&')}\\)`
        ),
        `${fn.name} is revoked from the client roles`
      );
      assert.match(
        migration,
        new RegExp(
          `grant execute on function public\\.${fn.name}\\(${fn.signature.replace(/[()]/g, '\\$&')}\\)\\s*\\n?\\s*to service_role`
        ),
        `${fn.name} is granted to the service role`
      );
    }
    assert.match(migration, /from public, anon, authenticated/);
  });

  it('does not drop, truncate or rewrite an existing table', () => {
    const body = migration.toLowerCase();
    assert.doesNotMatch(body, /drop table/);
    assert.doesNotMatch(body, /\btruncate\s+table\b/);
    assert.doesNotMatch(body, /alter table/);
  });

  it('takes the owner explicitly and keeps the unique-key upserts', () => {
    assert.match(migration, /p_profile_id uuid/);
    assert.match(
      migration,
      /on conflict on constraint user_experience_progress_profile_experience_key/
    );
    assert.match(
      migration,
      /on conflict on constraint user_experience_certificates_profile_experience_key/
    );
  });

  it('locks the progress row before the certificate row in both writers', () => {
    const certificateFn = migration.slice(
      migration.indexOf('career_experience_certificate_set')
    );
    assert.match(
      certificateFn,
      /from public\.user_experience_progress as progress[\s\S]*?for update/
    );
    assert.match(
      certificateFn,
      /from public\.user_experience_certificates as certificate[\s\S]*?for update/
    );
    // The progress writer touches the progress row first, then the certificate.
    const progressFn = migration.slice(
      migration.indexOf('career_experience_progress_set'),
      migration.indexOf('career_experience_progress_delete')
    );
    assert.ok(
      progressFn.indexOf('user_experience_progress') <
        progressFn.indexOf('user_experience_certificates')
    );
  });

  it('has the server call the functions instead of separate statements', () => {
    assert.match(
      service,
      /rpc\('career_experience_progress_set',\s*\{[\s\S]*?p_profile_id: profileId,[\s\S]*?p_status: input\.status,[\s\S]*?p_saved: input\.saved \?\? null/
    );
    assert.match(service, /rpc\('career_experience_progress_delete'/);
    assert.match(
      service,
      /rpc\(\s*'career_experience_certificate_set'[\s\S]*?p_certificate_url: validation\.value/
    );
  });

  it('no longer deletes a certificate inside the progress operations', () => {
    const progressSet = service.slice(
      service.indexOf('export async function upsertExperienceProgress'),
      service.indexOf('export async function listExperienceCertificates')
    );
    assert.doesNotMatch(progressSet, /user_experience_certificates/);

    const progressDelete = service.slice(
      service.indexOf('export async function deleteExperienceProgress'),
      service.indexOf('export async function listExperienceCertificates')
    );
    assert.doesNotMatch(progressDelete, /user_experience_certificates/);
  });

  it('keeps the API contract, including the 409 for a certificate without a completion', () => {
    assert.match(service, /export class CertificateRequiresCompletionError/);
    assert.match(service, /certificate_requires_completion/);
    assert.match(routes, /error instanceof CertificateRequiresCompletionError/);
    assert.match(routes, /return res\.status\(409\)\.json\(\{ error: error\.message \}\)/);
    assert.match(routes, /return res\.json\(\{ success: true, progress \}\)/);
    assert.match(routes, /return res\.json\(\{ success: true \}\)/);
    assert.match(routes, /return res\.status\(201\)\.json\(\{ success: true, certificate \}\)/);
  });

  it('still refuses a link the platform cannot accept before the database is touched', () => {
    assert.match(service, /normalizeCertificateUrl\(certificateUrl\)/);
    assert.match(service, /if \(!validation\.ok \|\| !validation\.value\)/);
  });
});
