import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import {
  fetchAccountBalances,
  fetchHealthCheck,
  fetchTransactionHistory,
  fetchUserProfile,
  size,
  type AccountBalance,
} from '@davao-bank/shared';

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
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

const mockToastShow = jest.fn();
jest.mock('../components/Toast', () => ({
  ...jest.requireActual('../components/Toast'),
  useToast: () => ({ show: mockToastShow, dismiss: jest.fn() }),
}));

jest.mock('../context/AppLockContext', () => ({
  useAppLock: () => ({ enabled: false, setEnabled: jest.fn(async () => undefined) }),
}));

jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    biometricEnabled: true,
    setBiometricEnabled: jest.fn(async () => true),
    isBiometricSupported: true,
    biometricType: 'Face ID',
    hideBalance: false,
    toggleHideBalance: jest.fn(async () => undefined),
  }),
}));

const defaultSecuritySettings = {
  daily_transfer_limit_centavos: 5_000_000,
  spent_today_centavos: 0,
  remaining_today_centavos: 5_000_000,
  locked: false,
};

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { id: 'usr-1' } } })),
      signOut: jest.fn(async () => ({ error: null })),
      mfa: {
        listFactors: jest.fn(async () => ({
          data: { totp: [{ id: 'f-1', status: 'verified' }] },
          error: null,
        })),
      },
    },
    rpc: jest.fn(async () => ({ data: defaultSecuritySettings, error: null })),
    from: () => {
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'order', 'limit']) {
        builder[method] = () => builder;
      }
      builder.then = (
        resolve: (v: unknown) => unknown,
        reject: (e: unknown) => unknown
      ) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve, reject);
      return builder;
    },
  },
}));

jest.mock('@davao-bank/shared', () => {
  const actual = jest.requireActual('@davao-bank/shared');
  return {
    ...actual,
    fetchUserProfile: jest.fn(),
    fetchAccountBalances: jest.fn(),
    fetchTransactionHistory: jest.fn(),
    fetchHealthCheck: jest.fn(),
  };
});

import {
  MORE_SERVICES_OFFLINE_COPY,
  MORE_SERVICE_SECTIONS,
  MoreServicesScreen,
  SERVICES_ENABLED,
  SERVICE_UNAVAILABLE_COPY,
  UnavailableServiceScreen,
  type ServiceId,
} from '../screens/MoreServicesScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import {
  SERVICE_SIMULATION_MESSAGE,
  ServiceResult,
  ServiceSimulationBanner,
} from '../components/ServiceSimulation';
import { reportNetworkOffline, reportNetworkOnline } from '../lib/networkStatus';

const savingsAccount: AccountBalance = {
  account_id: 'acc-1',
  user_id: 'usr-1',
  account_number: '1078958921',
  type: 'savings',
  currency: 'PHP',
  status: 'active',
  balance: 1234567,
  ledger_entry_count: 1,
  last_activity_at: null,
};

describe('Phase 9 · Stage 9A — More services hub', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    reportNetworkOnline();
    jest.mocked(fetchUserProfile).mockResolvedValue({
      data: {
        id: 'usr-1',
        full_name: 'Maria Santos',
        phone: null,
        role: 'customer',
        status: 'active',
        created_at: '2026-11-01T00:00:00Z',
      },
      error: null,
    });
    jest.mocked(fetchAccountBalances).mockResolvedValue({
      data: [savingsAccount],
      error: null,
    });
    jest.mocked(fetchTransactionHistory).mockResolvedValue({ data: [], error: null });
    jest.mocked(fetchHealthCheck).mockResolvedValue({ data: null, error: null });
  });

  describe('MoreServicesScreen sections, Simulation badges and gating', () => {
    it('renders all four sections and labels every service with Simulation', async () => {
      await render(<MoreServicesScreen />);

      for (const heading of [
        'More services',
        'Money tools',
        'Requests & appointments',
        'Cards & credit',
        'Learn',
      ]) {
        expect(screen.getByRole('header', { name: heading })).toBeTruthy();
      }

      const totalRows = MORE_SERVICE_SECTIONS.reduce(
        (sum, section) => sum + section.items.length,
        0
      );
      // 1 Simulation badge in the top banner + 1 Simulation badge on every row.
      expect(screen.getAllByText('Simulation')).toHaveLength(totalRows + 1);
      expect(screen.getByText(SERVICE_SIMULATION_MESSAGE)).toBeTruthy();

      for (const section of MORE_SERVICE_SECTIONS) {
        for (const item of section.items) {
          expect(screen.getByText(item.title)).toBeTruthy();
          expect(screen.getByText(item.subtitle)).toBeTruthy();
          const row = screen.getByTestId(`more-service-row-${item.id}`);
          expect(row.props.accessibilityRole).toBe('button');
          expect(screen.getByText(item.title).props.maxFontSizeMultiplier).toBe(1.4);
        }
      }
    });

    it('opens FXRates in convert mode when FX converter is pressed', async () => {
      await render(<MoreServicesScreen />);

      expect(SERVICES_ENABLED.has('fx_converter')).toBe(true);
      const fxButton = screen.getByRole('button', { name: /^FX converter, Simulation/ });
      await fireEvent.press(fxButton);

      expect(mockNavigate).toHaveBeenCalledWith('FXRates', { mode: 'convert' });
      expect(mockToastShow).not.toHaveBeenCalled();
    });

    it('marks unbuilt services as "Not available in this demo yet" and never navigates to a broken route', async () => {
      await render(<MoreServicesScreen />);

      const unbuiltItems = MORE_SERVICE_SECTIONS.flatMap((s) => s.items).filter(
        (item) => !SERVICES_ENABLED.has(item.id)
      );
      expect(screen.getAllByText(SERVICE_UNAVAILABLE_COPY)).toHaveLength(
        unbuiltItems.length
      );

      for (const item of unbuiltItems) {
        const button = screen.getByRole('button', {
          name: new RegExp(`^${item.title}, Simulation.*${SERVICE_UNAVAILABLE_COPY}$`),
        });
        await fireEvent.press(button);
      }

      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockToastShow).toHaveBeenCalledTimes(unbuiltItems.length);
      expect(mockToastShow).toHaveBeenLastCalledWith(SERVICE_UNAVAILABLE_COPY);
    });

    it('navigates to each registered Phase 9 route once added to enabledServices', async () => {
      const allEnabled = new Set<ServiceId>([
        'fx_converter',
        'savings_goals',
        'time_deposit_planner',
        'service_requests',
        'branch_appointments',
        'credit_card',
        'installment_calculator',
        'remittance_tracker',
      ]);
      await render(<MoreServicesScreen enabledServices={allEnabled} />);

      await fireEvent.press(
        screen.getByRole('button', { name: /^Savings goals, Simulation/ })
      );
      expect(mockNavigate).toHaveBeenLastCalledWith('SavingsGoals', undefined);

      await fireEvent.press(
        screen.getByRole('button', { name: /^Time deposit planner, Simulation/ })
      );
      expect(mockNavigate).toHaveBeenLastCalledWith('TimeDepositPlanner', undefined);

      await fireEvent.press(
        screen.getByRole('button', { name: /^Service requests, Simulation/ })
      );
      expect(mockNavigate).toHaveBeenLastCalledWith('ServiceRequests', undefined);

      await fireEvent.press(
        screen.getByRole('button', { name: /^Branch appointments, Simulation/ })
      );
      expect(mockNavigate).toHaveBeenLastCalledWith('BranchAppointments', undefined);

      await fireEvent.press(
        screen.getByRole('button', { name: /^Credit card, Simulation/ })
      );
      expect(mockNavigate).toHaveBeenLastCalledWith('Cards', undefined);

      await fireEvent.press(
        screen.getByRole('button', { name: /^Installment calculator, Simulation/ })
      );
      expect(mockNavigate).toHaveBeenLastCalledWith('InstallmentCalculator', undefined);

      await fireEvent.press(
        screen.getByRole('button', { name: /^Remittance tracker, Simulation/ })
      );
      expect(mockNavigate).toHaveBeenLastCalledWith('NewServiceRequest', {
        initialType: 'remit_status',
      });
    });
  });

  describe('UX states: skeleton, empty, error + Try again, offline', () => {
    it('renders skeletons while loading', async () => {
      await render(<MoreServicesScreen loading />);
      expect(screen.getByTestId('more-services-skeleton')).toBeTruthy();
      expect(screen.queryByText('Money tools')).toBeNull();
    });

    it('renders EmptyState when sections are empty', async () => {
      await render(<MoreServicesScreen sections={[]} />);
      expect(screen.getByText('No services available')).toBeTruthy();
      expect(screen.getByText('Simulated services will appear here.')).toBeTruthy();
    });

    it('maps errors through toUserMessage and wires Try again', async () => {
      const onRetry = jest.fn();
      await render(
        <MoreServicesScreen
          error={new Error('psql raw syntax failure')}
          onRetry={onRetry}
        />
      );
      expect(screen.getByText('Services unavailable')).toBeTruthy();
      expect(screen.getByText('Something went wrong. Try again.')).toBeTruthy();
      expect(screen.queryByText(/psql/)).toBeNull();

      await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('shows an offline alert banner when network connectivity drops', async () => {
      await render(<MoreServicesScreen />);
      expect(screen.queryByTestId('more-services-offline-notice')).toBeNull();

      await act(async () => {
        reportNetworkOffline();
      });

      expect(screen.getByTestId('more-services-offline-notice')).toBeTruthy();
      expect(screen.getByText(MORE_SERVICES_OFFLINE_COPY)).toBeTruthy();

      await act(async () => {
        reportNetworkOnline();
      });
      expect(screen.queryByTestId('more-services-offline-notice')).toBeNull();
    });

    it('UnavailableServiceScreen renders safe fallback and Go back button', async () => {
      await render(<UnavailableServiceScreen />);
      expect(screen.getByText(SERVICE_UNAVAILABLE_COPY)).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Go back' }));
      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('Entry points on HomeScreen and ProfileScreen', () => {
    it('renders "More services" row under Home action grid without disturbing balance card or Bantay row', async () => {
      await render(<HomeScreen />);
      expect(await screen.findByText('₱12,345.67')).toBeTruthy();

      // Balance card and Bantay indicator remain intact.
      expect(
        screen.getByRole('button', { name: 'Available balance, see My accounts' })
      ).toBeTruthy();
      expect(
        screen.getByRole('button', { name: 'Bantay is watching your account' })
      ).toBeTruthy();

      const homeRow = screen.getByTestId('home-more-services-row');
      expect(homeRow.props.style).toEqual(
        expect.objectContaining({ minHeight: expect.any(Number) })
      );
      expect(homeRow.props.style.minHeight).toBeGreaterThanOrEqual(size.touch);

      await fireEvent.press(
        screen.getByRole('button', {
          name: 'More services, Simulation, FX converter, requests and calculators',
        })
      );
      expect(mockNavigate).toHaveBeenCalledWith('MoreServices');
    });

    it('renders "More services" inside Profile Money section and opens MoreServices', async () => {
      await render(<ProfileScreen profile={null} userEmail="customer@davaobank.ph" />);

      const moneyGroup = screen.getByTestId('profile-group-money');
      const moreRow = within(moneyGroup).getByRole('button', {
        name: 'More services, Simulation — tools, requests and calculators',
      });
      await fireEvent.press(moreRow);
      expect(mockNavigate).toHaveBeenCalledWith('MoreServices');
    });
  });

  describe('Shared ServiceSimulationBanner and ServiceResult wrappers', () => {
    it('formats UUID reference via formatReferenceId and attaches REVIEW_FOOTNOTE', async () => {
      const onDone = jest.fn();
      await render(
        <ServiceResult
          title="Request submitted"
          referenceId="8f043910-1234-4abc-9def-000000000000"
          details={[{ label: 'Type', value: 'Bank certificate' }]}
          onDone={onDone}
        />
      );

      expect(screen.getByText('Simulation')).toBeTruthy();
      expect(screen.getByText('DB-8F04-3910')).toBeTruthy();
      expect(screen.queryByText(/8f043910-1234/)).toBeNull();
      expect(screen.getByText('Simulated money — no real funds move.')).toBeTruthy();

      await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('renders custom simulation message and maps failed error with Try again', async () => {
      const onRetry = jest.fn();
      await render(<ServiceSimulationBanner message="Simulation — sample rates only." />);
      expect(screen.getByText('Simulation — sample rates only.')).toBeTruthy();

      await render(
        <ServiceResult
          outcome="failed"
          title="Could not submit"
          error={new Error('Network request failed')}
          onRetry={onRetry}
          onDone={jest.fn()}
        />
      );
      expect(
        screen.getByText('You appear to be offline. Check your connection and try again.')
      ).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });
});
