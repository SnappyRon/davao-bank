declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { FXConverter } from '../screens/fx/FXConverter';
import { formatFXAmount } from '@davao-bank/shared';

const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

const renderConverter = async (props: {
  pair?: 'USD/PHP' | 'EUR/PHP' | 'JPY/PHP';
  rate?: number | null;
  rateDate?: string | null;
  stale?: boolean;
  loading?: boolean;
}) => {
  announceSpy.mockClear();
  return await render(
    <FXConverter
      pair={props.pair ?? 'USD/PHP'}
      rate={props.rate === undefined ? 58.95 : props.rate}
      rateDate={props.rateDate === undefined ? '2026-11-20' : props.rateDate}
      stale={props.stale ?? false}
      loading={props.loading ?? false}
    />
  );
};

describe('FXConverter — simulation banner (permanent, every state)', () => {
  it('shows the exact simulation copy when loaded', async () => {
    await renderConverter({});
    expect(
      screen.getByText('Simulation — reference rate only. No money moves.')
    ).toBeTruthy();
    expect(screen.getByTestId('fx-simulation-banner')).toBeTruthy();
  });

  it('keeps the simulation banner while loading', async () => {
    await renderConverter({ loading: true });
    expect(
      screen.getByText('Simulation — reference rate only. No money moves.')
    ).toBeTruthy();
  });

  it('keeps the simulation banner when the rate is unavailable', async () => {
    await renderConverter({ rate: null, rateDate: null });
    expect(
      screen.getByText('Simulation — reference rate only. No money moves.')
    ).toBeTruthy();
  });
});

describe('FXConverter — stale rate notice (full date, alert role)', () => {
  it('displays the full date including the year', async () => {
    await renderConverter({ rateDate: '2026-11-20', stale: true });
    expect(screen.getByText('Nov 20, 2026')).toBeTruthy();
  });

  it('renders the stale notice as an alert', async () => {
    await renderConverter({ rateDate: '2026-11-20', stale: true });
    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();
    expect(alert.props.accessibilityLabel).toContain(
      'Stale rate. Rate last updated Nov 20, 2026.'
    );
  });

  it('announces the stale rate on mount', async () => {
    await renderConverter({ rateDate: '2026-11-20', stale: true });
    expect(announceSpy).toHaveBeenCalledWith(
      expect.stringContaining('Stale rate. Rate last updated Nov 20, 2026.')
    );
  });

  it('does not show a stale notice when the rate is fresh', async () => {
    await renderConverter({ rateDate: '2026-11-26', stale: false });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('FXConverter — rate unavailable (EmptyState + Try again)', () => {
  it('shows an EmptyState with a Try again action when rate is null', async () => {
    await renderConverter({ rate: null, rateDate: null });
    expect(screen.getByText('Rate unavailable')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('FXConverter — amount input (2 decimals, currency formatting)', () => {
  it('limits typed input to 2 decimal places', async () => {
    await renderConverter({});
    const input = screen.getByLabelText('Amount (PHP)');
    fireEvent.changeText(input, '123.456');
    expect(screen.getByLabelText('Amount (PHP)').props.value).toBe('123.45');
  });

  it('shows helper text limiting input to 2 decimals', async () => {
    await renderConverter({});
    expect(screen.getByText('Up to 2 decimal places.')).toBeTruthy();
  });

  it('formats JPY results with 0 decimals', async () => {
    await renderConverter({ pair: 'JPY/PHP', rate: 0.4061 });
    const input = screen.getByLabelText('Amount (PHP)');
    fireEvent.changeText(input, '100');
    expect(screen.getByText(/246/)).toBeTruthy();
  });

  it('formats USD results with 2 decimals', async () => {
    await renderConverter({ pair: 'USD/PHP', rate: 58.95 });
    const input = screen.getByLabelText('Amount (PHP)');
    fireEvent.changeText(input, '100');
    expect(screen.getByText(/1\.70/)).toBeTruthy();
  });
});
