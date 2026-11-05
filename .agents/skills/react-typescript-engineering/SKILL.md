---
name: react-typescript-engineering
description: Enforces React 19 best practices, strict TypeScript correctness, component architecture, hooks discipline, and performance optimizations for CareerDev4AI.
---

# React & TypeScript Engineering Skill

This skill governs component architecture, state management patterns, React 19 capabilities, and strict TypeScript compliance across CareerDev4AI.

## When to Use

Activate this skill when:
- Creating or refactoring React components in `src/components/`.
- Managing shared state or updating `src/context/CareerContext.tsx`.
- Writing or typing custom React hooks.
- Troubleshooting React re-renders, lifecycle bugs, or hydration/mounting mismatches.
- Resolving TypeScript compiler diagnostics during `npm run lint` (`tsc --noEmit`).

## Core Principles & Patterns

1. **Strict TypeScript Without Compromise**:
   - Every prop, state variable, callback, and API response must have an explicit interface or type alias.
   - Forbid `any`. When the type is unknown, use `unknown` with type narrowing guards (`typeof`, `instanceof`, or custom type predicates).
   - Discourage non-null assertions (`!`) unless guaranteed by earlier guard statements.

2. **React 19 Standards**:
   - Use standard React 19 patterns.
   - Leverage `useTransition` or `useActionState` for non-blocking UI transitions where applicable.
   - Clean up event listeners and timers in `useEffect` return functions.
   - Avoid duplicate state: derive values directly during render instead of syncing redundant state in effects.

3. **Context & State Management (`CareerContext`)**:
   - `CareerContext.tsx` is the single authoritative source of truth for user profile, roadmaps, goals, and localization.
   - When modifying profile state, always dispatch immutable updates and persist via the designated Supabase client helper.
   - Ensure components consuming context only trigger re-renders when their required slice changes.

4. **Component Decoupling & Reusability**:
   - Separate container (data/state) components from presentation (UI/layout) components.
   - Avoid prop drilling: pass compound children or extract dedicated sub-components.

## Step-by-Step Workflow

1. **Define Types First**:
   - Draft interfaces in dedicated types files or at the top of the component file before writing JSX.
   ```typescript
   export interface HeroVisualProps {
     imageSrc: string;
     photographerName: string;
     photographerUrl: string;
     className?: string;
   }
   ```
2. **Implement Presentation & State**:
   - Write clean, functional components with typed props: `export const HeroVisual: React.FC<HeroVisualProps> = ({ ... }) => { ... }`.
   - Implement loading and error states gracefully.
3. **Audit Performance & Re-renders**:
   - Memoize expensive calculations with `useMemo`.
   - Memoize event handlers passed to heavy children with `useCallback`.
4. **Compile & Lint Verification**:
   - Run `npm run lint` (`tsc --noEmit`) to verify 0 errors.

## Quality Checklist

- [ ] Does `npm run lint` pass with 0 errors?
- [ ] Are all component props typed explicitly?
- [ ] Are hooks called at the top level and following the Rules of Hooks?
- [ ] Are cleanup functions provided for all `useEffect` subscriptions or timers?
- [ ] Are keys in mapped lists unique, persistent, and not using array index?
- [ ] Are error boundaries in place for fault-tolerant UI degradation?

## Common Failure Patterns to Avoid

- **Unsafe Type Casting**: Using `(foo as any).bar` to bypass compiler checks instead of refining the type.
- **State-Effect Loops**: Setting state inside `useEffect` with that same state variable in the dependency array.
- **Prop Mutability**: Mutating array or object props directly instead of cloning (`[...items]`).
