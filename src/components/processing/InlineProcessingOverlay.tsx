/**
 * The processing surface, placed over one section of a page.
 * ---------------------------------------------------------------------------
 * Some flows belong to a part of the screen rather than to the whole
 * application: a CV panel that is being rewritten, a card that is being
 * saved. Those flows ask for the `inline` presentation and place this
 * component over their own section instead of opening a dialog.
 *
 * ```tsx
 * const { runOperation } = useProcessing();
 *
 * <div className="relative">
 *   <MyPanel />
 *   <InlineProcessingOverlay operationId="my-panel-save" />
 * </div>
 * ```
 *
 * The parent must be `relative`, so the overlay covers exactly that section
 * and not the page.
 */

import React from 'react';
import { ProcessingPanel } from './ProcessingOverlay';
import { useProcessing } from './ProcessingProvider';

export interface InlineProcessingOverlayProps {
  /** The id of the operation this overlay shows. */
  operationId: string;
  /** Extra classes for the covering layer. */
  className?: string;
}

export const InlineProcessingOverlay: React.FC<InlineProcessingOverlayProps> = ({
  operationId,
  className = '',
}) => {
  const { getOperation, cancel, retry, dismiss } = useProcessing();
  const operation = getOperation(operationId);

  if (!operation) return null;

  return (
    <div
      className={`absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-[var(--surface-main)]/90 p-4 backdrop-blur-sm ${className}`}
    >
      <div className="w-full max-w-sm">
        <ProcessingPanel
          modal={false}
          operation={operation}
          onCancel={() => cancel(operation.id)}
          onRetry={() => retry(operation.id)}
          onDismiss={() => dismiss(operation.id)}
        />
      </div>
    </div>
  );
};

export default InlineProcessingOverlay;
