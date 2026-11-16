import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyField } from '../../src/components/payment/CopyField';

describe('CopyField', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('copies the displayed value and announces successful feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText },
    });

    render(
      <CopyField
        label="Payment address"
        value="example-wallet-123"
        copyLabel="Copy"
        copiedLabel="Copied"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('example-wallet-123'));
    expect(await screen.findByRole('status')).toHaveTextContent('Copied');
  });

  it('keeps the displayed value available if clipboard access is denied', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Clipboard permission denied'));
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText },
    });

    render(
      <CopyField
        label="Payment address"
        value="example-wallet-123"
        copyLabel="Copy"
        copiedLabel="Copied"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('example-wallet-123'));
    expect(screen.getByText('example-wallet-123')).toBeVisible();
  });
});
