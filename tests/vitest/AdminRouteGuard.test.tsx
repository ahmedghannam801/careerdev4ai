import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminRouteGuard } from '../../src/components/admin/AdminRouteGuard';

const mocks = vi.hoisted(() => ({
  access: { admin: null as null | { status: string }, loading: true },
  translate: (value: string) => value,
}));

vi.mock('../../src/context/CareerContext', () => ({
  useCareer: () => ({ t: mocks.translate }),
}));
vi.mock('../../src/lib/useAdminAccess', () => ({ useAdminAccess: () => mocks.access }));

function SecretAdminSurface() {
  return <div>Private admin records</div>;
}

describe('AdminRouteGuard behavior', () => {
  beforeEach(() => {
    mocks.access.admin = null;
    mocks.access.loading = true;
  });

  it('does not mount the admin surface while authorization is unresolved', () => {
    render(<AdminRouteGuard><SecretAdminSurface /></AdminRouteGuard>);

    expect(screen.getByText('Checking administrator access…')).toBeVisible();
    expect(screen.queryByText('Private admin records')).not.toBeInTheDocument();
  });

  it('keeps the admin surface unmounted when access is denied', () => {
    mocks.access.loading = false;
    mocks.access.admin = null;
    render(<AdminRouteGuard><SecretAdminSurface /></AdminRouteGuard>);

    expect(screen.getByRole('heading', { name: 'Administrator access required' })).toBeVisible();
    expect(screen.queryByText('Private admin records')).not.toBeInTheDocument();
  });

  it('denies disabled administrators and mounts content only for active authorization', () => {
    mocks.access.loading = false;
    mocks.access.admin = { status: 'disabled' };
    const { rerender } = render(<AdminRouteGuard><SecretAdminSurface /></AdminRouteGuard>);
    expect(screen.queryByText('Private admin records')).not.toBeInTheDocument();

    mocks.access.admin = { status: 'active' };
    rerender(<AdminRouteGuard><SecretAdminSurface /></AdminRouteGuard>);
    expect(screen.getByText('Private admin records')).toBeVisible();
  });
});
