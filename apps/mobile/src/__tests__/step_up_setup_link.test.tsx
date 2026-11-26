import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

import { StepUpSetupLink } from '../components/StepUpSetupLink';

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('StepUpSetupLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when error does not require step up', async () => {
    const onClose = jest.fn();
    await render(<StepUpSetupLink error="Insufficient funds" onClose={onClose} />);
    expect(screen.queryByRole('button', { name: 'Set up now' })).toBeNull();
  });

  it('renders "Set up now" button and navigates directly to TwoStepSetup (not Profile)', async () => {
    const onClose = jest.fn();
    await render(
      <StepUpSetupLink
        error="Set up two-step verification in Profile before sending money."
        onClose={onClose}
      />
    );

    const btn = screen.getByRole('button', { name: 'Set up now' });
    expect(btn).toBeTruthy();

    fireEvent.press(btn);

    expect(onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('TwoStepSetup');
  });
});
