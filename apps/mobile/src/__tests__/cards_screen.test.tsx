import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockRouteParams = {
  CardDetail: undefined as unknown,
  CardStatement: undefined as unknown,
};

const mockConfirmMoneyAction = jest.fn();
const mockConfirmBiometricPayment = jest.fn();
const mockFetchMyCards = jest.fn();
const mockFetchCardStatement = jest.fn();
const mockFetchCardTransactions = jest.fn();
const mockFetchAccountBalances = jest.fn();
const mockRevealCardSecrets = jest.fn();
const mockSetCardFrozen = jest.fn();
const mockSetCardOnlinePurchases = jest.fn();
const mockSetCardDailyLimit = jest.fn();
const mockReplaceCard = jest.fn();
const mockPayCardBill = jest.fn();
const mockTriggerChallenge = jest.fn();

jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
    useRoute: () => ({
      params: mockRouteParams.CardDetail ?? mockRouteParams.CardStatement,
    }),
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
    useIsFocused: () => true,
    usePreventRemove: jest.fn(),
  };
});

jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Error: 'error', Warning: 'warning' },
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('../components/Toast', () => ({
  ...jest.requireActual('../components/Toast'),
  useToast: () => ({ show: jest.fn(), dismiss: jest.fn() }),
}));

jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    hideBalance: false,
    confirmMoneyAction: mockConfirmMoneyAction,
    confirmBiometricPayment: mockConfirmBiometricPayment,
  }),
}));

jest.mock('../context/PasswordPromptContext', () => ({
  ...jest.requireActual('../context/PasswordPromptContext'),
  useTotpPrompt: () => jest.fn(async () => ({ success: true })),
}));

jest.mock('../hooks/useFeatureAccounts', () => ({
  useFeatureAccounts: () => ({
    accounts: [
      {
        account_id: 'acc-1',
        user_id: 'usr-1',
        account_number: '1078958921',
        type: 'savings',
        currency: 'PHP',
        status: 'active',
        balance: 1000000,
        ledger_entry_count: 1,
        last_activity_at: null,
      },
    ],
    accountsLoading: false,
    accountError: null,
    loadAccounts: jest.fn(),
  }),
}));

jest.mock('../hooks/useRiskChallenge', () => ({
  useRiskChallenge: () => ({
    triggerChallenge: mockTriggerChallenge,
    challengeSheet: null,
    isChallengeActive: false,
  }),
}));

jest.mock('../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

jest.mock('@davao-bank/shared', () => ({
  ...jest.requireActual('@davao-bank/shared'),
  fetchMyCards: (...args: unknown[]) => mockFetchMyCards(...args),
  fetchCardStatement: (...args: unknown[]) => mockFetchCardStatement(...args),
  fetchCardTransactions: (...args: unknown[]) => mockFetchCardTransactions(...args),
  fetchAccountBalances: (...args: unknown[]) => mockFetchAccountBalances(...args),
  revealCardSecrets: (...args: unknown[]) => mockRevealCardSecrets(...args),
  setCardFrozen: (...args: unknown[]) => mockSetCardFrozen(...args),
  setCardOnlinePurchases: (...args: unknown[]) => mockSetCardOnlinePurchases(...args),
  setCardDailyLimit: (...args: unknown[]) => mockSetCardDailyLimit(...args),
  replaceCard: (...args: unknown[]) => mockReplaceCard(...args),
  payCardBill: (...args: unknown[]) => mockPayCardBill(...args),
}));

import {
  APPLE_WALLET_BUTTON_LABEL,
  APPLE_WALLET_COPY,
  CardsScreen,
  CARD_SIMULATION_COPY,
} from '../screens/CardsScreen';
import { CardDetailScreen } from '../screens/CardDetailScreen';
import { CardStatementScreen } from '../screens/CardStatementScreen';
import { SERVICES_ENABLED } from '../screens/MoreServicesScreen';
import type {
  CardStatement,
  CreditCardSummary,
  DigitalDebitCard,
} from '@davao-bank/shared';

const debitCard: DigitalDebitCard = {
  id: 'debit-1',
  masked_last4: '0003',
  expiry_month: 11,
  expiry_year: 2029,
  status: 'active',
  online_purchases_enabled: true,
  daily_limit_cents: 50000000,
  remaining_card_day_spend_cents: 30000000,
  linked_account_id: 'acc-1',
};

const creditCard: CreditCardSummary = {
  id: 'credit-1',
  biller_id: 'biller-1',
  masked_last4: '0099',
  credit_limit_cents: 10000000,
  status: 'active',
  amount_due_cents: 250000,
  available_credit_cents: 9750000,
  minimum_due_cents: 50000,
  due_date: '2026-12-15',
  statement_id: 'statement-1',
};

const statement: CardStatement = {
  id: 'statement-1',
  period_start: '2026-11-01',
  period_end: '2026-11-30',
  issued_at: '2026-11-30T00:00:00Z',
  due_date: '2026-12-15',
  total_due_cents: 500000,
  minimum_due_cents: 50000,
  amount_due_cents: 250000,
  paid_cents: 250000,
  payment_reference: 'DBCC-12345678',
};

const authorized = { success: true };

describe('Phase 9 · Stage 9I — Cards screens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams.CardDetail = undefined;
    mockRouteParams.CardStatement = undefined;
    mockFetchMyCards.mockResolvedValue({
      data: {
        debit_cards: [debitCard],
        credit_card: creditCard,
        statements: [statement],
      },
      error: null,
    });
    mockFetchCardStatement.mockResolvedValue({ data: statement, error: null });
    mockFetchCardTransactions.mockResolvedValue({
      data: [
        {
          id: 'tx-1',
          label: 'Card merchant payment · Durian City Bakery (demo)',
          reference: 'DB-8F04-3910',
          amount_cents: 12500,
          created_at: '2026-11-26T02:00:00Z',
        },
      ],
      error: null,
    });
    mockConfirmMoneyAction.mockResolvedValue(authorized);
    mockConfirmBiometricPayment.mockResolvedValue(authorized);
    mockRevealCardSecrets.mockResolvedValue({
      data: {
        pan: '9900000000000003',
        cvv: '123',
        expiry: '11/29',
        display_until: null,
      },
      error: null,
    });
    mockSetCardFrozen.mockResolvedValue({ data: { success: true }, error: null });
    mockSetCardOnlinePurchases.mockResolvedValue({
      data: { success: true },
      error: null,
    });
    mockSetCardDailyLimit.mockResolvedValue({ data: { success: true }, error: null });
    mockReplaceCard.mockResolvedValue({ data: { success: true }, error: null });
    mockPayCardBill.mockResolvedValue({
      data: {
        success: true,
        id: 'tx-2',
        transaction_id: 'tx-2',
        reference: 'DB-AB12-CD34',
        amountCents: 250000,
        idempotentReplay: false,
      },
      error: null,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('lists masked cards, derived credit totals and readable activity', async () => {
    await render(<CardsScreen />);

    expect(await screen.findByText('Debit card')).toBeTruthy();
    expect(screen.getByText(/•••• 0003/)).toBeTruthy();
    expect(screen.getByText(/•••• 0099/)).toBeTruthy();
    expect(screen.getByText('₱2,500.00')).toBeTruthy();
    expect(screen.getByText(CARD_SIMULATION_COPY)).toBeTruthy();
    expect(
      screen.getByText('Card merchant payment · Durian City Bakery (demo)')
    ).toBeTruthy();
    expect(screen.getByText('DB-8F04-3910')).toBeTruthy();
  });

  it('opens the exact Apple Wallet disclaimer without PassKit or logo assets', async () => {
    await render(<CardsScreen />);

    expect(SERVICES_ENABLED.has('credit_card')).toBe(true);
    const walletButtons = screen.getAllByRole('button', {
      name: APPLE_WALLET_BUTTON_LABEL,
    });
    expect(walletButtons.length).toBeGreaterThan(0);
    await fireEvent.press(walletButtons[0]);

    expect(screen.getByText(APPLE_WALLET_COPY)).toBeTruthy();
    const source = fs.readFileSync(
      path.join(__dirname, '../screens/CardsScreen.tsx'),
      'utf8'
    );
    expect(source).not.toMatch(/PassKit|pkpass|apple-?logo/i);
  });

  it('reveals secrets only after step-up and hides them after 30 seconds', async () => {
    jest.useFakeTimers();
    mockRouteParams.CardDetail = { card: debitCard };
    await render(<CardDetailScreen />);

    await fireEvent.press(screen.getByRole('button', { name: /Show card details/ }));

    await waitFor(() => {
      expect(mockConfirmMoneyAction).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Reveal card details' })
      );
    });
    expect(mockRevealCardSecrets).toHaveBeenCalledWith(expect.anything(), 'debit-1');
    expect(screen.getByText('9900 0000 0000 0003')).toBeTruthy();
    expect(screen.getByText(/CVV 123/)).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(screen.queryByText('9900 0000 0000 0003')).toBeNull();
  });

  it('routes freeze, online toggle and daily limit through audited RPC wrappers', async () => {
    mockRouteParams.CardDetail = { card: debitCard };
    await render(<CardDetailScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Freeze card' }));
    await waitFor(() => {
      expect(mockSetCardFrozen).toHaveBeenCalledWith(
        expect.anything(),
        'debit-1',
        true,
        debitCard
      );
    });

    await fireEvent(
      screen.getByRole('switch', { name: 'Online purchases' }),
      'valueChange',
      false
    );
    await waitFor(() => {
      expect(mockSetCardOnlinePurchases).toHaveBeenCalledWith(
        expect.anything(),
        'debit-1',
        false,
        expect.objectContaining({ id: 'debit-1' })
      );
    });

    await fireEvent.changeText(screen.getByLabelText('Daily card limit'), '250000');
    await fireEvent.press(screen.getByRole('button', { name: 'Save daily limit' }));
    await waitFor(() => {
      expect(mockSetCardDailyLimit).toHaveBeenCalledWith(
        expect.anything(),
        'debit-1',
        25000000,
        expect.objectContaining({ id: 'debit-1' })
      );
    });
  });

  it('pays a credit statement with one idempotency key after authorization', async () => {
    mockRouteParams.CardStatement = { statement, creditCard };
    await render(<CardStatementScreen />);

    expect(screen.getAllByText('₱2,500.00').length).toBeGreaterThan(0);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Pay from Choose account' })
    );
    await fireEvent.press(screen.getByRole('button', { name: /Savings •• 8921/ }));

    await fireEvent.press(screen.getByRole('button', { name: 'Pay ₱2,500.00' }));

    await waitFor(() => {
      expect(mockConfirmBiometricPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Authorize card payment',
          message: 'Confirm payment of ₱2,500.00 to Davao Bank Card (simulation)',
        })
      );
    });
    await waitFor(() => {
      expect(mockPayCardBill).toHaveBeenCalledTimes(1);
    });
    expect(mockPayCardBill).toHaveBeenCalledWith(expect.anything(), {
      fromAccountId: 'acc-1',
      billerId: 'biller-1',
      reference: 'DBCC-12345678',
      amountCents: 250000,
      idempotencyKey: expect.any(String),
    });
    expect(await screen.findByText('Card payment complete')).toBeTruthy();
  });

  it('does not call the payment RPC when authorization is cancelled', async () => {
    mockRouteParams.CardStatement = { statement, creditCard };
    mockConfirmBiometricPayment.mockResolvedValue({
      success: false,
      cancelled: true,
    });
    await render(<CardStatementScreen />);

    await fireEvent.press(
      screen.getByRole('button', { name: 'Pay from Choose account' })
    );
    await fireEvent.press(screen.getByRole('button', { name: /Savings •• 8921/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Pay ₱2,500.00' }));

    await waitFor(() => {
      expect(screen.getByText('Not authorized. Nothing was sent.')).toBeTruthy();
    });
    expect(mockPayCardBill).not.toHaveBeenCalled();
  });

  it('reuses the same idempotency key when step-up expires mid-payment', async () => {
    mockRouteParams.CardStatement = { statement, creditCard };
    mockPayCardBill
      .mockResolvedValueOnce({ data: null, error: 'STEP_UP_REQUIRED' })
      .mockResolvedValueOnce({
        data: {
          success: true,
          id: 'tx-2',
          transaction_id: 'tx-2',
          reference: null,
          amountCents: 250000,
          idempotentReplay: false,
        },
        error: null,
      });
    await render(<CardStatementScreen />);

    await fireEvent.press(
      screen.getByRole('button', { name: 'Pay from Choose account' })
    );
    await fireEvent.press(screen.getByRole('button', { name: /Savings •• 8921/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Pay ₱2,500.00' }));

    await waitFor(() => {
      expect(mockPayCardBill).toHaveBeenCalledTimes(2);
    });
    const firstKey = mockPayCardBill.mock.calls[0][1].idempotencyKey;
    const secondKey = mockPayCardBill.mock.calls[1][1].idempotencyKey;
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBe(firstKey);
  });
});
