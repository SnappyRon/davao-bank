import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MfaForm } from '../app/mfa/MfaForm';

const mockVerify = jest.fn();
const mockUnenroll = jest.fn().mockResolvedValue({ error: null });
const mockClient = {
  auth: {
    mfa: {
      listFactors: jest.fn().mockResolvedValue({ data: { totp: [], all: [] } }),
      enroll: jest.fn().mockResolvedValue({
        data: {
          id: 'test-factor',
          totp: {
            secret: 'TESTONLYTESTONLY',
            qr_code: 'data:image/svg+xml,test',
            uri: 'otpauth://totp/test',
          },
        },
      }),
      challengeAndVerify: mockVerify,
      unenroll: mockUnenroll,
    },
    signOut: jest.fn().mockResolvedValue({ error: null }),
  },
};
const mockRouter = { replace: jest.fn(), refresh: jest.fn() };
jest.mock('@/lib/supabase-browser', () => ({
  createAdminBrowserClient: () => mockClient,
}));
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
  });
});
async function enroll() {
  render(<MfaForm setup />);
  fireEvent.click(screen.getByRole('button', { name: 'Set up authenticator' }));
  await screen.findByRole('button', { name: 'Show setup key' });
}
it('hides the key by default, reveals grouped blocks, and announces successful copying', async () => {
  await enroll();
  expect(screen.getAllByText('TEST')[0]).not.toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Show setup key' }));
  expect(screen.getAllByText('TEST')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Hide setup key' }));
  expect(screen.getAllByText('TEST')[0]).not.toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Copy setup key' }));
  expect(await screen.findByText('Copied')).toHaveAttribute('aria-live', 'polite');
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('TESTONLYTESTONLY');
});
it('reports clipboard failure without claiming it copied', async () => {
  await enroll();
  jest.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('denied'));
  fireEvent.click(screen.getByRole('button', { name: 'Copy setup key' }));
  expect(await screen.findByText(/Could not copy/)).toBeInTheDocument();
  expect(screen.queryByText('Copied')).not.toBeInTheDocument();
});
it('shows verification progress, prevents repeat submission, and recovers after a rejected code', async () => {
  let finish!: (value: { error: object }) => void;
  mockVerify.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await enroll();
  fireEvent.change(screen.getByRole('textbox', { name: 'Authenticator code' }), {
    target: { value: '123456' },
  });
  expect(screen.getByRole('button', { name: 'Verifying…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel and sign out' })).toBeDisabled();
  expect(mockVerify).toHaveBeenCalledTimes(1);
  finish({ error: {} });
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Code not accepted')
  );
  expect(screen.getByRole('textbox', { name: 'Authenticator code' })).toBeEnabled();
});
