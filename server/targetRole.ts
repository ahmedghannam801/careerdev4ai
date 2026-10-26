/**
 * Server-side resolution of a hierarchical target-role write.
 *
 * The target role is a TWO-level selection: level 1 is a career domain and
 * level 2 is a specialisation (a catalogue role). This module turns the
 * fields of an incoming write into the canonical values that are persisted,
 * and rejects a selection that is not a real domain/role pair.
 *
 * Every rule lives here so the profile endpoint and the aggregate state
 * endpoint cannot disagree about what a valid target role is.
 */

import { getCareerDomain } from '../shared/careerDomains.ts';
import {
  resolveTargetRole,
  validateTargetRoleSelection,
} from '../shared/targetRoleSelection.ts';

/** The canonical values a validated target-role selection persists to. */
export interface TargetRoleWrite {
  /** The role's canonical title, persisted to `profiles.target_role`. */
  title: string;
  /** The parent domain slug (level 1). */
  domainId: string;
  /** The parent domain label, persisted to `profiles.target_industry`. */
  domainLabel: string;
}

export type TargetRoleWriteOutcome =
  | { ok: true; value: TargetRoleWrite | null }
  | { ok: false; status: 400; code: string; error: string };

export interface TargetRoleWriteInput {
  /** Level 1 — the career domain slug. */
  domainId?: unknown;
  /** Level 2 — the specialisation, as a catalogue role id. */
  roleId?: unknown;
  /** Level 2 — the specialisation, as a catalogue role title. */
  title?: unknown;
}

/** The longest a single catalogue reference may be before it is rejected. */
const MAX_REFERENCE_LENGTH = 200;

/**
 * Reads one catalogue reference out of an untrusted request body.
 *
 * `undefined` and `null` both mean "not supplied". Anything that is not a
 * string, or that is longer than a catalogue reference can be, is rejected
 * instead of being ignored — a bad selection must never look like a
 * successful write.
 */
function readReference(value: unknown): { kind: 'absent' } | { kind: 'invalid' } | { kind: 'value'; value: string } {
  if (value === undefined || value === null) return { kind: 'absent' };
  if (typeof value !== 'string') return { kind: 'invalid' };
  const trimmed = value.trim();
  if (!trimmed) return { kind: 'absent' };
  if (trimmed.length > MAX_REFERENCE_LENGTH) return { kind: 'invalid' };
  return { kind: 'value', value: trimmed };
}

function fail(code: string, error: string): TargetRoleWriteOutcome {
  return { ok: false, status: 400, code, error };
}

/**
 * Validates the target-role fields of a write and returns what to persist.
 *
 * Accepted shapes:
 *   - `domainId` + `roleId`   — the full hierarchical selection.
 *   - `domainId` + `title`    — the same, when the caller has a title.
 *   - `title` alone           — the legacy flat shape; the domain is then
 *                               derived from the role, so a mismatch is
 *                               impossible by construction.
 *
 * Rejected: an unknown domain, an unknown specialisation, a specialisation
 * that belongs to a different domain, and a domain with no specialisation.
 */
export function resolveTargetRoleWrite(input: TargetRoleWriteInput): TargetRoleWriteOutcome {
  const domain = readReference(input.domainId);
  const role = readReference(input.roleId);
  const title = readReference(input.title);

  if (domain.kind === 'invalid' || role.kind === 'invalid' || title.kind === 'invalid') {
    return fail('invalid_request', 'The target role selection is not in a valid format.');
  }

  const domainId = domain.kind === 'value' ? domain.value : '';
  const roleId = role.kind === 'value' ? role.value : '';
  const roleTitle = title.kind === 'value' ? title.value : '';

  const hasDomain = domainId.length > 0;
  const hasRoleId = roleId.length > 0;
  const hasTitle = roleTitle.length > 0;

  if (!hasDomain && !hasRoleId && !hasTitle) {
    // Nothing to write: the caller did not touch the target role.
    return { ok: true, value: null };
  }

  // A domain without a specialisation is an incomplete selection.
  if (hasDomain && !hasRoleId && !hasTitle) {
    return fail('missing_specialization', 'A career specialisation must be selected.');
  }

  // The full hierarchical selection: the pair is validated together, so a
  // specialisation from another domain is rejected here.
  if (hasDomain && (hasRoleId || hasTitle)) {
    const result = validateTargetRoleSelection({
      domainId,
      specializationId: hasRoleId ? roleId : null,
      specializationTitle: hasTitle ? roleTitle : null,
    });
    if (!result.ok) {
      return fail(result.error.code, result.error.message);
    }
    return {
      ok: true,
      value: {
        title: result.role.title,
        domainId: result.domainId,
        domainLabel: getCareerDomain(result.domainId)?.label ?? result.role.category,
      },
    };
  }

  // The legacy flat shape: the domain follows from the role.
  if (hasTitle) {
    const resolved = resolveTargetRole(roleTitle);
    if (!resolved) {
      return fail(
        'invalid_specialization',
        'The selected career specialisation is not part of the career taxonomy.'
      );
    }
    return {
      ok: true,
      value: {
        title: resolved.title,
        domainId: resolved.domainId,
        domainLabel: getCareerDomain(resolved.domainId)?.label ?? resolved.category,
      },
    };
  }

  // A specialisation id without a domain: the domain is implied by the role,
  // but it still has to be a real catalogue role.
  const resolved = resolveTargetRole(roleId);
  if (!resolved) {
    return fail(
      'invalid_specialization',
      'The selected career specialisation is not part of the career taxonomy.'
    );
  }
  return {
    ok: true,
    value: {
      title: resolved.title,
      domainId: resolved.domainId,
      domainLabel: getCareerDomain(resolved.domainId)?.label ?? resolved.category,
    },
  };
}
