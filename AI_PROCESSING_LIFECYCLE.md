# AI request lifecycle

Every AI request that can take more than a moment runs through one shared
lifecycle, so the interface behaves the same way everywhere and never claims
more than actually happened.

## The shared lifecycle

`src/lib/useAIProcessing.tsx` owns the request state and renders
`src/components/ai/AIProcessingModal.tsx`.

A task declares a title, a stage, the work itself, and what to do with the
result:

```ts
await runAIProcessing({
  title: t('ATS Audit'),
  stage: t('Comparing your CV with the role requirements…'),
  run: (signal, setPhase) => runAiCvOptimization({ signal, setPhase }),
  onSuccess: (result) => setAnalysis(result),
});
```

The lifecycle guarantees:

1. **One request at a time.** A second call while a request is running is
   ignored, so a double click cannot start a duplicate.
2. **A late answer never reaches the interface.** `onSuccess` runs only when
   the request was not aborted, so stopping a request and starting another one
   cannot overwrite the newer result with the older one.
3. **The stop control is honest.** `canCancel` is withdrawn once the work has
   entered a phase that cannot be abandoned. The modal then says that a result
   is being saved instead of offering a stop that would not stop anything.
4. **Nothing is saved before it succeeded.** The save happens inside `run`,
   after the answer arrived, and the interface state is only updated in
   `onSuccess`.
5. **The candidate's input is preserved.** A failed or stopped request leaves
   the form, the draft and the previous result in place.
6. **A timeout is a timeout, not a cancellation.** A timed-out request is
   reported as timed out, and the late answer it may still produce is
   discarded.

Stopping a request stops *waiting* for it. The provider may still be computing,
and the interface says so instead of pretending the work was stopped.

## The flows that use it

| Flow | File | Notes |
|---|---|---|
| Interview evaluation | `src/components/views/InterviewsView.tsx` | The session is written in a separate, non-cancellable phase; a failed save is reported. |
| Cover letter | `src/components/views/DocumentsView.tsx` | The previous draft survives a failure or a stop. |
| Professional summary | `src/components/views/ProfileView.tsx` | The draft is only replaced by a real suggestion. |
| ATS audit | `src/components/views/CVStudioView.tsx` | The audit is saved to a CV version; the save phase is announced. |
| Career analysis | `src/components/views/CareerAnalysisView.tsx` | Reads and answers only; nothing is written. |
| Project recommendations and health | `src/components/projects/ProjectAiPanel.tsx` | The deterministic fallback is labelled as such. |
| Job description analysis and tailored CV | `src/components/cv/JobDescriptionPanel.tsx` | Uses its own panel, with the same rules: an aborted answer is never written, and the save phase withdraws the stop control. |
| CV field assistant | `src/components/cv/AiAssist.tsx` | Closing the panel aborts the request; a late answer never reaches the field. |

## The flows that deliberately keep their own behaviour

- **Headline suggestions** (`src/components/cv/HeadlineSuggestions.tsx`) already
  carry their own 12-second timeout and fall back to the deterministic
  generator, so the control always leaves its loading state. A modal for a
  request that cannot outlive twelve seconds would add friction without
  adding safety.
- **The Copilot drawer** (`src/components/copilot/CopilotDrawer.tsx`) is a
  conversation. Each turn shows the typing state and blocks a second send, and
  a modal per turn would interrupt the conversation the candidate is having.
- **Roadmap generation** (`regeneratePersonalizedRoadmap`) is built and stored
  by the server in one operation. There is no partial state to abandon, so
  there is nothing to cancel safely.

## Where the tests are

`tests/ai-processing-contract.test.ts` asserts the guarantees above at the
source level: the abort guard before `onSuccess`, the withdrawn stop control
during a save, the guard before the job description answer is written, the
wiring of every flow, and the reporting of a failed save.
