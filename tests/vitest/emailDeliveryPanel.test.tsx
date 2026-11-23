/**
 * The email delivery panel's two states before anything is sent.
 *
 * The panel's job is to make a configuration problem legible without a failed
 * request, so these tests drive it with the two settings that matter: no key at
 * all, and a key with the provider's shared testing sender. Both must be
 * visible, and the button must not offer a send that cannot work.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

const fetchAdminEmailStatus = vi.fn();
const sendAdminEmailTest = vi.fn();

vi.mock('../../src/lib/adminApi', () => ({
  fetchAdminEmailStatus: () => fetchAdminEmailStatus(),
  sendAdminEmailTest: () => sendAdminEmailTest(),
}));

vi.mock('../../src/context/CareerContext', () => ({
  useCareer: () => ({ t: (key: string) => key }),
}));

import { EmailDeliveryPanel } from '../../src/components/admin/EmailDeliveryPanel';

const status = (overrides: Record<string, unknown>) => ({
  apiKeyConfigured: true,
  recipientConfigured: true,
  sender: 'Aionvia <onboarding@resend.dev>',
  senderIsSharedTestAddress: true,
  ...overrides,
});

describe('EmailDeliveryPanel', () => {
  beforeEach(() => {
    fetchAdminEmailStatus.mockReset();
    sendAdminEmailTest.mockReset();
  });

  it('offers no send when the deployment has no key, and says who has to add one', async () => {
    fetchAdminEmailStatus.mockResolvedValue(
      status({ apiKeyConfigured: false, recipientConfigured: false })
    );

    render(<EmailDeliveryPanel />);

    // Both settings are reported, so the panel names both.
    await waitFor(() => expect(screen.getAllByText('Not configured').length).toBe(2));
    expect(
      screen.getByText(/no provider key, so no message can be sent yet/i)
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: /Send a test message/ }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('warns that the shared sender only reaches the account owner', async () => {
    fetchAdminEmailStatus.mockResolvedValue(status({}));

    render(<EmailDeliveryPanel />);

    await waitFor(() =>
      expect(screen.getByText(/only delivers to the account owner/i)).toBeTruthy()
    );
    const button = screen.getByRole('button', { name: /Send a test message/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('stays quiet about the sender once a verified address is configured', async () => {
    fetchAdminEmailStatus.mockResolvedValue(
      status({ sender: 'Aionvia <noreply@aionvia.app>', senderIsSharedTestAddress: false })
    );

    render(<EmailDeliveryPanel />);

    await waitFor(() => expect(screen.getByText('Aionvia <noreply@aionvia.app>')).toBeTruthy());
    expect(screen.queryByText(/only delivers to the account owner/i)).toBeNull();
    expect(screen.getAllByText('Configured').length).toBe(2);
  });
});
