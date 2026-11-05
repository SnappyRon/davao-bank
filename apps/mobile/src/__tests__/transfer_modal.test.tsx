import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { TransferModal } from '../screens/TransferModal';
import { executeTransfer, generateIdempotencyKey } from '@davao-bank/shared';
import type { AccountBalance } from '@davao-bank/shared';

// Mock Supabase
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [] }),
    })),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

// Mock executeTransfer
jest.mock('@davao-bank/shared', () => {
  const actual = jest.requireActual('@davao-bank/shared');
  return {
    ...actual,
    generateIdempotencyKey: jest.fn(actual.generateIdempotencyKey),
    executeTransfer: jest.fn().mockResolvedValue({
      data: {
        id: 'tx-mock-12345678',
        transaction_id: 'tx-mock-12345678',
        amount: 50000,
        status: 'completed',
        idempotent_replay: false,
      },
      error: null,
    }),
  };
});

// Mock settings context
jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    hideBalance: false,
    confirmBiometricPayment: jest.fn().mockResolvedValue({ success: true }),
  }),
}));

describe('TransferModal - F1 State & Receipt Guarantees', () => {
  const initialAccounts: AccountBalance[] = [
    {
      account_id: 'acc-1111-2222',
      user_id: 'user-test',
      account_number: '1012345678',
      type: 'savings',
      currency: 'PHP',
      status: 'active',
      balance: 5000000, // ₱50,000.00
      ledger_entry_count: 5,
      last_activity_at: null,
    },
    {
      account_id: 'acc-3333-4444',
      user_id: 'user-test',
      account_number: '1087654321',
      type: 'checking',
      currency: 'PHP',
      status: 'active',
      balance: 2000000, // ₱20,000.00
      ledger_entry_count: 2,
      last_activity_at: null,
    },
  ];

  it('stays on success step and retains refreshed "Balance now" when accounts prop updates after transfer', async () => {
    const onTransferSuccessMock = jest.fn();
    const onCloseMock = jest.fn();

    // 1. Render TransferModal open with QR prefill with amount (which auto-navigates to review)
    const { rerender } = await render(
      <TransferModal
        visible={true}
        onClose={onCloseMock}
        accounts={initialAccounts}
        onTransferSuccess={onTransferSuccessMock}
        initialRecipientAccount="1099999999"
        initialAmountCentavos={50000}
        initialNote="Lunch split"
      />
    );

    // Should land on Review step directly due to valid QR prefill with amount
    expect(screen.getByText('Transfer · Review')).toBeTruthy();

    // Confirm transfer
    await act(async () => {
      fireEvent.press(screen.getByText('Authorize Transfer'));
    });

    // Should now be on Success step
    expect(screen.getByText('Transfer Sent')).toBeTruthy();
    expect(screen.getByText('Balance now')).toBeTruthy();

    const keyCalls = jest.mocked(generateIdempotencyKey).mock.calls.length;
    const submittedKey = jest.mocked(executeTransfer).mock.calls[0][1].idempotency_key;
    await rerender(
      <TransferModal
        visible={true}
        onClose={onCloseMock}
        accounts={initialAccounts.map((account) => ({ ...account }))}
        onTransferSuccess={onTransferSuccessMock}
        initialRecipientAccount="1099999999"
        initialAmountCentavos={50000}
        initialNote="Lunch split"
      />
    );
    expect(screen.getByText('Transfer Sent')).toBeTruthy();
    expect(generateIdempotencyKey).toHaveBeenCalledTimes(keyCalls);
    expect(executeTransfer).toHaveBeenCalledTimes(1);
    expect(jest.mocked(executeTransfer).mock.calls[0][1].idempotency_key).toBe(
      submittedKey
    );

    // 2. Simulate Home screen loadData() completing and re-rendering with new accounts array reference
    // Source account balance decreased from ₱50,000.00 to ₱49,500.00 (4,950,000 centavos)
    const updatedAccounts: AccountBalance[] = [
      {
        ...initialAccounts[0],
        balance: 4950000, // Refreshed balance
      },
      initialAccounts[1],
    ];

    await act(async () => {
      await rerender(
        <TransferModal
          visible={true}
          onClose={onCloseMock}
          accounts={updatedAccounts}
          onTransferSuccess={onTransferSuccessMock}
          initialRecipientAccount="1099999999"
          initialAmountCentavos={50000}
          initialNote="Lunch split"
        />
      );
    });

    // CRITICAL INVARIANT: Modal must STAY on success screen, NOT jump back to review or recipient
    expect(screen.getByText('Transfer Sent')).toBeTruthy();
    expect(screen.getByText('Balance now')).toBeTruthy();
    expect(screen.getByText('₱49,500.00')).toBeTruthy();
    expect(screen.queryByText('Transfer · Review')).toBeNull();
    expect(screen.queryByText('Transfer · Recipient')).toBeNull();
  });
  it('shows checking status and retains the request key after a dropped response', async () => {
    jest.mocked(executeTransfer).mockClear();
    jest
      .mocked(executeTransfer)
      .mockResolvedValueOnce({ data: null, error: 'TypeError: Network request failed' });
    await render(
      <TransferModal
        visible={true}
        onClose={jest.fn()}
        accounts={initialAccounts}
        onTransferSuccess={jest.fn()}
        initialRecipientAccount="1099999999"
        initialAmountCentavos={50000}
      />
    );
    await fireEvent.press(screen.getByText('Authorize Transfer'));
    await waitFor(() => expect(screen.getByText('Checking status…')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Transfer Sent')).toBeTruthy(), {
      timeout: 3000,
    });
    const calls = jest.mocked(executeTransfer).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toEqual(calls[1][1]);
    expect(screen.queryByText('Checking status…')).toBeNull();
  });
});
