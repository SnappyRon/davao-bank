import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useIsFocused: () => true,
  usePreventRemove: jest.fn(),
}));

jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockSend = jest.fn();
const mockClear = jest.fn();
jest.mock('../lib/bantayChatClient', () => ({
  bantayChatClient: {
    send: (...args: unknown[]) => mockSend(...args),
    clear: (...args: unknown[]) => mockClear(...args),
  },
}));

let mockNetworkListener: ((offline: boolean) => void) | null = null;
jest.mock('../lib/networkStatus', () => ({
  getIsOffline: () => false,
  subscribeNetworkStatus: (listener: (offline: boolean) => void) => {
    mockNetworkListener = listener;
    return () => {
      mockNetworkListener = null;
    };
  },
}));

import {
  BantayChatScreen,
  CHAT_ACTION_LABELS,
  CHAT_CLEAR_FAILURE_COPY,
  CHAT_DAILY_LIMIT_COPY,
  CHAT_DISCLAIMER,
  CHAT_MINUTE_LIMIT_COPY,
  CHAT_OFFLINE_COPY,
  CHAT_QUICK_REPLIES,
  CHAT_SOURCE_CAPTION,
  CHAT_TYPING_LABEL,
} from '../screens/BantayChatScreen';

const REPLY = 'Open Bantay to review your security.';
const okResponse = (overrides: Record<string, unknown> = {}) => ({
  reply: REPLY,
  actions: ['open_bantay'],
  source: 'ai',
  session_id: 'session-1',
  quota_remaining: 29,
  ...overrides,
});

function sendButton() {
  return screen.getByRole('button', { name: 'Send message' });
}

describe('Phase 8 · Stage 8O — Bantay AI chat screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNetworkListener = null;
    mockSend.mockResolvedValue({ ok: true, data: okResponse() });
    mockClear.mockResolvedValue(true);
  });

  it('shows the disclaimer greeting, fixed chips, and a disabled Send with the exact state', async () => {
    await render(<BantayChatScreen />);

    expect(screen.getAllByText(CHAT_DISCLAIMER)).toHaveLength(2);
    CHAT_QUICK_REPLIES.forEach((reply) =>
      expect(screen.getByRole('button', { name: reply })).toBeTruthy()
    );
    expect(sendButton().props.accessibilityState).toEqual({ disabled: true });

    await fireEvent.changeText(
      screen.getByLabelText('Message'),
      'How do I lock my account?'
    );
    expect(sendButton().props.accessibilityState).toEqual({ disabled: false });
  });

  it('sends quick replies verbatim and shows the typing label while waiting', async () => {
    let resolveSend!: (value: unknown) => void;
    mockSend.mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve;
      })
    );

    await render(<BantayChatScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Is my account locked?' }));

    expect(mockSend).toHaveBeenCalledWith({
      message: 'Is my account locked?',
      session_id: undefined,
    });
    expect(screen.getByText('Sending…')).toBeTruthy();
    expect(screen.getByLabelText(CHAT_TYPING_LABEL)).toBeTruthy();
    expect(sendButton().props.accessibilityState).toEqual({ disabled: true });

    await act(async () => {
      resolveSend({ ok: true, data: okResponse() });
    });
    expect(await screen.findByLabelText(`Bantay says: ${REPLY}`)).toBeTruthy();
    expect(screen.queryByLabelText(CHAT_TYPING_LABEL)).toBeNull();
  });

  it('renders the guide caption only for articles, above actions and in one a11y label', async () => {
    mockSend.mockResolvedValueOnce({
      ok: true,
      data: okResponse({
        source: 'article',
        reply: 'Open Bantay and tap Lock my account.',
      }),
    });

    await render(<BantayChatScreen />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Why was my payment checked?' })
    );

    const replyText = 'Open Bantay and tap Lock my account.';
    const caption = await screen.findByText(CHAT_SOURCE_CAPTION);
    expect(caption.props.accessible).toBeUndefined();
    expect(caption.parent?.props.accessible).toBe(false);
    expect(
      screen.getByLabelText(`Bantay says: ${replyText} ${CHAT_SOURCE_CAPTION}`)
    ).toBeTruthy();

    const answer = screen.getAllByTestId('bantay-chat-answer').at(-1)!;
    const actions = screen.getByTestId('bantay-chat-actions');
    const row = answer.parent;
    expect(row?.children.indexOf(answer)).toBeLessThan(
      row?.children.indexOf(actions) ?? -1
    );
    const order = answer
      .queryAll((node) => typeof node.props.children === 'string')
      .map((node) => node.props.children);
    expect(order.indexOf(replyText)).toBeLessThan(order.indexOf(CHAT_SOURCE_CAPTION));

    const action = screen.getByRole('button', { name: 'Open Bantay' });
    await fireEvent.press(action);
    expect(mockNavigate).toHaveBeenCalledWith('BantaySecurity');
  });

  it('shows the offline banner, disables Send, and clears on Try again or reconnect', async () => {
    mockSend
      .mockResolvedValueOnce({ ok: false, reason: 'offline' })
      .mockResolvedValueOnce({ ok: true, data: okResponse() });

    await render(<BantayChatScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Safety tips' }));

    expect(await screen.findByText(CHAT_OFFLINE_COPY)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Message'), 'Another question');
    expect(sendButton().props.accessibilityState).toEqual({ disabled: true });

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText(`Bantay says: ${REPLY}`)).toBeTruthy();
    expect(screen.queryByText(CHAT_OFFLINE_COPY)).toBeNull();

    mockSend.mockResolvedValueOnce({ ok: false, reason: 'offline' });
    await fireEvent.press(screen.getByRole('button', { name: 'Safety tips' }));
    expect(await screen.findByText(CHAT_OFFLINE_COPY)).toBeTruthy();
    await act(async () => {
      mockNetworkListener?.(false);
    });
    expect(screen.queryByText(CHAT_OFFLINE_COPY)).toBeNull();
  });

  it('announces the exact daily-limit copy once and replaces the composer', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    mockSend.mockResolvedValue({
      ok: true,
      data: okResponse({ quota_remaining: 0, reply: 'Daily limit reached.' }),
    });

    await render(<BantayChatScreen />);
    await fireEvent.press(screen.getByRole('button', { name: "What's my daily limit?" }));

    expect(await screen.findByText(CHAT_DAILY_LIMIT_COPY)).toBeTruthy();
    expect(screen.getByTestId('bantay-chat-limit')).toBeTruthy();
    expect(screen.queryByLabelText('Message')).toBeNull();
    expect(sendButton().props.accessibilityState).toEqual({ disabled: true });
    expect(
      announce.mock.calls.filter(([message]) => message === CHAT_DAILY_LIMIT_COPY)
    ).toHaveLength(1);
    announce.mockRestore();
  });

  it('uses the exact per-minute copy and announces it once', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    mockSend.mockResolvedValueOnce({ ok: false, reason: 'rate_limited' });

    await render(<BantayChatScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Safety tips' }));

    expect(await screen.findByText(CHAT_MINUTE_LIMIT_COPY)).toBeTruthy();
    expect(
      announce.mock.calls.filter(([message]) => message === CHAT_MINUTE_LIMIT_COPY)
    ).toHaveLength(1);
    announce.mockRestore();
  });

  it('clears the chat and keeps history untouched with exact failure copy', async () => {
    await render(<BantayChatScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Safety tips' }));
    expect(await screen.findByLabelText(`Bantay says: ${REPLY}`)).toBeTruthy();

    mockClear.mockResolvedValueOnce(false);
    await fireEvent.press(screen.getByTestId('bantay-chat-clear'));
    await fireEvent.press(screen.getAllByRole('button', { name: 'Clear chat' }).at(-1)!);

    expect(await screen.findByText(CHAT_CLEAR_FAILURE_COPY)).toBeTruthy();
    expect(mockClear).toHaveBeenCalledWith('session-1');
    expect(screen.getByLabelText('You said: Safety tips')).toBeTruthy();
    expect(screen.getByLabelText(`Bantay says: ${REPLY}`)).toBeTruthy();

    await fireEvent.press(screen.getAllByRole('button', { name: 'Try again' }).at(-1)!);
    await waitFor(() => expect(screen.queryByText(CHAT_CLEAR_FAILURE_COPY)).toBeNull());
    expect(screen.queryByLabelText(`Bantay says: ${REPLY}`)).toBeNull();
  });

  it('retries a failed message without adding a duplicate user bubble', async () => {
    mockSend
      .mockResolvedValueOnce({ ok: false, reason: 'server' })
      .mockResolvedValueOnce({ ok: true, data: okResponse() });

    await render(<BantayChatScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Safety tips' }));
    expect(await screen.findByText("Couldn't send. Try again.")).toBeTruthy();
    expect(screen.getAllByLabelText('You said: Safety tips')).toHaveLength(1);

    await fireEvent.press(screen.getByRole('button', { name: 'Retry message' }));
    await waitFor(() =>
      expect(screen.getAllByLabelText(`Bantay says: ${REPLY}`)).toHaveLength(1)
    );
    expect(screen.getAllByLabelText('You said: Safety tips')).toHaveLength(1);
  });

  it('maps every action id to one labelled UI destination', () => {
    expect(Object.keys(CHAT_ACTION_LABELS)).toHaveLength(7);
    expect(Object.values(CHAT_ACTION_LABELS)).toEqual([
      'Open Bantay',
      'Security settings',
      'Send money',
      'See activity',
      'Pay bills',
      'Scheduled payments',
      'Contact support',
    ]);
  });

  it('opens the fixed support sheet for open_support without navigating', async () => {
    mockSend.mockResolvedValueOnce({
      ok: true,
      data: okResponse({ actions: ['open_support'], source: 'refusal' }),
    });

    await render(<BantayChatScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Safety tips' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Contact support' }));

    expect(await screen.findByRole('header', { name: 'Contact support' })).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
