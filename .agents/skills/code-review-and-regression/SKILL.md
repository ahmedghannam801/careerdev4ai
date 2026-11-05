---
name: code-review-and-regression
description: Governs rigorous code review, git diff inspection, regression prevention, test coverage enforcement, and safe pair programming for CareerDev4AI.
---

# Code Review & Regression Prevention Skill

This skill governs pre-commit code review, diff inspection, regression prevention, test coverage verification, and preservation of existing working functionality across CareerDev4AI.

## When to Use

Activate this skill when:
- Reviewing code changes prior to staging and committing.
- Inspecting `git diff` to ensure no unintended modifications or deleted features exist.
- Verifying backward compatibility with existing database records, APIs, and client routes.
- Checking that new code follows established architectural patterns and naming conventions.
- Preventing regressions in previously solved features (bilingual translations, free business model, authentic metrics).

## Core Principles of Code Review

1. **First, Do No Harm**:
   - Inspect existing implementations before rewriting or replacing them.
   - Reuse working components and libraries.
   - Do not discard or rebuild completed features without clear evidence of a defect.
   - Preserve existing user records and configurations.

2. **Clean, Minimal Diff Discipline**:
   - Every changed line in `git diff` must directly contribute to the stated objective.
   - Avoid indiscriminate automated formatting that touches hundreds of unrelated files.
   - Keep whitespace, indentation, and comment conventions consistent with surrounding code.

3. **Regression Detection & Test Guardrails**:
   - Every bug fix should be accompanied or verified by an automated test case.
   - Run relevant tests in `tests/runner.mjs` before committing.
   - Verify that localization coverage remains 100% and no untranslated strings have been introduced.

4. **Preserve Non-Negotiable Business Rules**:
   - CareerDev4AI is 100% free with no paywalls or subscriptions.
   - Zero fake metrics: no fabricated course percentages, fake jobs, or artificial activity.
   - Bilingual Arabic (RTL) & English (LTR) parity must always be maintained.

## Step-by-Step Code Review Workflow

1. **Review Git Status & Modified Files**:
   ```powershell
   git status -s
   ```
   Identify all modified, added, or deleted files. Confirm each one is intentional.
2. **Inspect Detailed Diff**:
   ```powershell
   git diff
   ```
   Check for:
   - Accidental debug code (`console.log`, `debugger`, commented-out blocks).
   - Accidental credentials or environment variable hardcoding.
   - Unwanted formatting changes.
   - Potential null-pointer exceptions or unhandled error cases.
3. **Run Typecheck & Automated Test Suite**:
   ```powershell
   npm run lint
   node tests/runner.mjs
   ```
4. **Draft Clean Semantic Commit**:
   - Format: `<type>(<scope>): <concise description in present tense>`.
   - Examples: `fix(hero): repair card overlap and integrate genuine photography`, `feat(skills): add workspace antigravity skills library`.

## Quality Checklist

- [ ] Does `git diff` contain only relevant, intentional modifications?
- [ ] Are all newly added strings registered in the translation dictionaries?
- [ ] Are existing working features preserved and unaffected?
- [ ] Does `npm run lint` pass with 0 errors?
- [ ] Are commit messages clear, descriptive, and accurately summarizing the change?

## Common Failure Patterns to Avoid

- **The Big Bang Commit**: Bundling unrelated feature additions, refactoring, and bug fixes into a single unreadable commit.
- **Accidental Deletions**: Deleting working components or helper utilities because they were not immediately understood.
- **Breaking Changes Without Fallbacks**: Modifying an API response shape that older client versions or workers rely upon.

