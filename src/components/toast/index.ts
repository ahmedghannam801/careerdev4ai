/**
 * The toast layer's public surface.
 * ---------------------------------------------------------------------------
 *   * `ToastProvider` — the layer itself. It is mounted once, inside the
 *     application's `CareerProvider`.
 *   * `useToast()` — how a flow shows a confirmation.
 */

export { ToastProvider, useToast } from './ToastProvider';
export type { ToastOptions, ToastProviderProps, ToastVariant } from './ToastProvider';
