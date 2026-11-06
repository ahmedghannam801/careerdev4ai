import fs from 'node:fs';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const pairs = [
  ['202610240001_roadmap_task_status_vocabulary.sql', '20261024194909_roadmap_task_status_vocabulary.sql'],
  ['202610240002_learning_hub_catalog_multidomain.sql', '20261024195959_learning_hub_catalog_multidomain.sql'],
  ['202610240003_multidomain_skills_taxonomy.sql', '20261024201058_multidomain_skills_taxonomy.sql'],
  ['20261101000001_certificate_details_and_skills.sql', '20261031221902_certificate_details_and_skills.sql'],
  ['20261103000002_consent_onboarding_and_packages.sql', '20261103135624_consent_onboarding_and_packages.sql'],
  ['20261103000001_announcement_notification_uniqueness.sql', '20261103221213_announcement_notification_uniqueness.sql'],
  ['20261104000001_admin_audit_log_grants.sql', '20261104170741_admin_audit_log_grants.sql'],
  ['20261104000002_background_jobs.sql', '20261104172426_background_jobs.sql'],
  ['20261106000001_background_jobs_queue.sql', '20261105171153_background_jobs_queue.sql'],
  ['20261106000003_cv_measurements.sql', '20261106124759_cv_measurements.sql']
];

console.log('--- RECONCILING 20261023105343 and 202610270002 ---');
const originalHardeningPath = 'supabase/migrations/202610270002_production_security_function_hardening.sql';
const originalHardening = fs.readFileSync(originalHardeningPath, 'utf8');
const originalHash = crypto.createHash('sha256').update(originalHardening).digest('hex');

const targetHardeningPath = 'supabase/migrations/20261023105343_production_security_function_hardening.sql';
fs.writeFileSync(targetHardeningPath, originalHardening, 'utf8');
const targetHash = crypto.createHash('sha256').update(fs.readFileSync(targetHardeningPath, 'utf8')).digest('hex');
console.log(`20261023105343 created: SHA256 matches? ${originalHash === targetHash} (${targetHash})`);

const noopContent = `-- Migration: 202610270002_production_security_function_hardening.sql
--
-- HISTORICAL CONTEXT & DUPLICATE RESOLUTION:
-- This migration was originally applied directly to Supabase Production under
-- migration version 20261023105343 (production_security_function_hardening).
-- When subsequently committed to git in commit f3cbe79 as 202610270002, both
-- version timestamps became recorded in the remote schema_migrations table.
--
-- To guarantee idempotent execution and ensure the security hardening SQL
-- cannot execute twice during any replay or fresh initialization, this file
-- is preserved as a verified no-op. The full functional hardening statements
-- reside authoritatively in 20261023105343_production_security_function_hardening.sql.

DO $$
BEGIN
    -- No-op: hardening was already applied in 20261023105343.
    NULL;
END $$;
`;
fs.writeFileSync(originalHardeningPath, noopContent, 'utf8');
console.log('202610270002 updated to no-op duplicate resolver.');

console.log('\n--- RENAMING 10 MIGRATION FILES USING GIT MV ---');
for (const [src, dst] of pairs) {
  const srcPath = `supabase/migrations/${src}`;
  const dstPath = `supabase/migrations/${dst}`;
  if (!fs.existsSync(srcPath)) {
    console.log(`Source not found: ${srcPath} (already renamed?)`);
    continue;
  }
  const preBuf = fs.readFileSync(srcPath);
  const preHash = crypto.createHash('sha256').update(preBuf).digest('hex');
  
  // Use git mv if tracked, else rename
  try {
    execSync(`git mv "${srcPath}" "${dstPath}"`, { stdio: 'pipe' });
  } catch (err) {
    fs.renameSync(srcPath, dstPath);
    execSync(`git add "${dstPath}"`, { stdio: 'pipe' });
  }

  const postBuf = fs.readFileSync(dstPath);
  const postHash = crypto.createHash('sha256').update(postBuf).digest('hex');
  console.log(`${src} -> ${dst}`);
  console.log(`  SHA256 verified: ${preHash === postHash} (${postHash.substring(0, 16)}...)`);
}

// Stage new 20261023105343 and updated 202610270002
execSync(`git add "${targetHardeningPath}" "${originalHardeningPath}"`, { stdio: 'pipe' });
console.log('\nReconciliation completed and staged in git.');

