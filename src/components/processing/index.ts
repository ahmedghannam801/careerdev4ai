/**
 * The global processing layer.
 * ---------------------------------------------------------------------------
 * The public surface of the processing feature:
 *
 *   * `ProcessingProvider` — the layer itself. It is mounted once, inside the
 *     application's `CareerProvider`.
 *   * `useProcessing()` — how a flow starts an operation, cancels it, retries
 *     it, and reads its state.
 *   * `ProcessingOverlay` — the screen surface the provider renders.
 *   * `InlineProcessingOverlay` — the same surface over one section of a page.
 */

export { ProcessingProvider, useProcessing } from './ProcessingProvider';
export type { ProcessingContextValue, ProcessingProviderProps } from './ProcessingProvider';
export { ProcessingOverlay, ProcessingPanel } from './ProcessingOverlay';
export type { ProcessingOverlayProps } from './ProcessingOverlay';
export { InlineProcessingOverlay } from './InlineProcessingOverlay';
export type { InlineProcessingOverlayProps } from './InlineProcessingOverlay';
export type {
  ProcessingOperationView,
  ProcessingRunContext,
  ProcessingRunResult,
  ProcessingStage,
  ProcessingStatus,
  RunOperationOptions,
} from './processingTypes';
