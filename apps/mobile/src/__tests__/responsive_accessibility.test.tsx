import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { HomeBalanceCard } from '../screens/home/HomeBalanceCard';
import { ReviewCard } from '../components/ReviewCard';
import { ResultView } from '../components/ResultView';
import { FloatingTabBar } from '../components/FloatingTabBar';
import { ActionTile } from '../components/ActionTile';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { typography, type AccountBalance } from '@davao-bank/shared';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const account: AccountBalance = {
  account_id: 'a',
  account_number: '1012348921',
  user_id: 'u',
  type: 'savings',
  currency: 'PHP',
  status: 'active',
  ledger_entry_count: 0,
  last_activity_at: null,
  balance: 10000050000,
};

it.each([360, 400, 440])(
  'fits the home balance on one line at width %i',
  async (width) => {
    Dimensions.set({
      window: { width, height: 800, scale: 1, fontScale: 1 },
      screen: { width, height: 800, scale: 1, fontScale: 1 },
    });
    await render(
      <HomeBalanceCard
        loading={false}
        error={null}
        accounts={[account]}
        selectedAccount={account}
        hideBalance={false}
        onOpenAccountPicker={jest.fn()}
        onToggleHideBalance={jest.fn()}
        onRetry={jest.fn()}
      />
    );
    const amount = screen.getByText('₱100,000,500.00');
    expect(amount.props.numberOfLines).toBe(1);
    expect(amount.props.adjustsFontSizeToFit).toBe(true);
    expect(amount.props.maxFontSizeMultiplier).toBe(1.4);
    expect(amount.props.style.fontSize).toBe(
      width >= 400 ? typography.display.fontSize : typography.amount.fontSize
    );
    expect(screen.getByRole('button', { name: 'Hide balance' })).toBeTruthy();
  }
);

it('fits and caps the review amount', async () => {
  await render(
    <ReviewCard eyebrow="You’re sending" amountCentavos={10000050000} rows={[]} />
  );
  const amount = screen.getByText('₱100,000,500.00');
  expect(amount.props.numberOfLines).toBe(1);
  expect(amount.props.adjustsFontSizeToFit).toBe(true);
  expect(amount.props.maxFontSizeMultiplier).toBe(1.4);
});

it('fits and caps the result amount and exposes Done as a button', async () => {
  await render(
    <ResultView
      outcome="completed"
      title="Done"
      amountCentavos={10000050000}
      onDone={jest.fn()}
    />
  );
  const amount = screen.getByText('₱100,000,500.00');
  expect(amount.props.numberOfLines).toBe(1);
  expect(amount.props.adjustsFontSizeToFit).toBe(true);
  expect(amount.props.maxFontSizeMultiplier).toBe(1.4);
  expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
});

it('caps floating tab labels and exposes the selected tab', async () => {
  const routes = [
    { key: 'home', name: 'Home' },
    { key: 'activity', name: 'Activity' },
  ];
  const props = {
    state: { index: 0, routes },
    descriptors: { home: { options: {} }, activity: { options: {} } },
    navigation: { emit: jest.fn(), navigate: jest.fn() },
  } as unknown as BottomTabBarProps;
  await render(<FloatingTabBar {...props} />);
  expect(screen.getByText('Home').props.maxFontSizeMultiplier).toBe(1.4);
  expect(
    screen.getByRole('tab', { name: 'Home' }).props.accessibilityState.selected
  ).toBe(true);
});

it('exposes a Home action with a scalable, untruncated label', async () => {
  await render(
    <ActionTile label="Add money" color="green" icon={null} onPress={jest.fn()} />
  );
  expect(screen.getByRole('button', { name: 'Add money' })).toBeTruthy();
  expect(screen.getByText('Add money').props.numberOfLines).toBeUndefined();
});
