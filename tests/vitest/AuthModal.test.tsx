import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthModal } from '../../src/components/auth/AuthModal';

const mocks = vi.hoisted(() => ({
  career: {
    authModalOpen: true,
    setAuthModalOpen: vi.fn(),
    authRedirectError: null as string | null,
    clearAuthRedirectError: vi.fn(),
    currentUser: null as unknown,
    login: vi.fn(),
    register: vi.fn(),
    t: (value: string) => value,
  },
  trackEvent: vi.fn(),
}));

vi.mock('../../src/context/CareerContext', () => ({ useCareer: () => mocks.career }));
vi.mock('../../src/lib/analytics', () => ({ trackEvent: mocks.trackEvent }));
vi.mock('../../src/lib/overlay', () => ({
  useDismissOnEscape: vi.fn(),
  useFocusTrap: vi.fn(),
  useScrollLock: vi.fn(),
}));
vi.mock('../../src/lib/native', () => ({ isNative: false, OAUTH_DEEP_LINK: 'app://callback' }));
vi.mock('../../src/lib/nativeBridge', () => ({ onNativeOAuthResult: vi.fn() }));
vi.mock('../../src/components/brand/Logo', () => ({ Logo: () => <span>Logo</span> }));

function fillLoginForm() {
  fireEvent.change(screen.getByPlaceholderText('name@company.com'), {
    target: { value: 'candidate@example.test' },
  });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), {
    target: { value: 'correct-horse-battery' },
  });
}

describe('AuthModal behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.career.authModalOpen = true;
    mocks.career.authRedirectError = null;
    mocks.career.currentUser = null;
  });

  it('keeps the dialog open and reports an authentication failure', async () => {
    mocks.career.login.mockResolvedValue({ success: false, error: 'Invalid credentials' });
    render(<AuthModal />);
    fillLoginForm();
    fireEvent.click(screen.getByRole('button', { name: /Sign In/ }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
    expect(mocks.career.login).toHaveBeenCalledWith(
      'candidate@example.test',
      'correct-horse-battery',
    );
    expect(mocks.career.setAuthModalOpen).not.toHaveBeenCalledWith(false);
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  it('closes only after successful login and records the login event', async () => {
    let finishLogin: ((result: { success: boolean }) => void) | undefined;
    mocks.career.login.mockImplementation(
      () => new Promise((resolve) => { finishLogin = resolve; }),
    );
    render(<AuthModal />);
    fillLoginForm();
    fireEvent.click(screen.getByRole('button', { name: /Sign In/ }));

    expect(screen.getByRole('button', { name: /Processing/ })).toBeDisabled();
    expect(mocks.career.setAuthModalOpen).not.toHaveBeenCalledWith(false);
    finishLogin?.({ success: true });

    await waitFor(() => expect(mocks.career.setAuthModalOpen).toHaveBeenCalledWith(false));
    expect(mocks.career.clearAuthRedirectError).toHaveBeenCalled();
    expect(mocks.trackEvent).toHaveBeenCalledWith('login');
  });
});
