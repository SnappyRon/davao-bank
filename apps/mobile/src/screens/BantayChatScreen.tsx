import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MessageCircle, Send, Trash2 } from 'lucide-react-native';
import { useReducedMotion } from 'react-native-reanimated';
import {
  colors,
  radius,
  size,
  spacing,
  normalizeBantayChatMessage,
  type BantayChatActionId,
  type BantayChatSource,
} from '@davao-bank/shared';
import type { RootStackParamList } from '../../App';
import { MASCOT_BANTAY } from '../assets/illustrations';
import {
  Button,
  Chip,
  FeatureScreen,
  Pressable,
  Sheet,
  Text,
  TextField,
} from '../components';
import { bantayChatClient } from '../lib/bantayChatClient';
import { getIsOffline, subscribeNetworkStatus } from '../lib/networkStatus';
import { useConfirmSheet } from '../hooks/useConfirmSheet';

/** Exact copy from spec §7.2 (and §3.4 for the fallback). */
export const CHAT_DISCLAIMER =
  "Bantay AI can make mistakes. It can't move money or change your account.";
export const CHAT_OFFLINE_COPY = "You're offline. Reconnect to keep chatting.";
export const CHAT_DAILY_LIMIT_COPY =
  "You've reached today's chat limit. Try again tomorrow.";
export const CHAT_MINUTE_LIMIT_COPY =
  "You've reached the chat limit for this minute. Try again in a moment.";
export const CHAT_CLEAR_FAILURE_COPY = "Couldn't clear chat. Try again.";
export const CHAT_SOURCE_CAPTION = "Answer from Bantay's guide";
export const CHAT_FALLBACK_COPY =
  "I can't answer that right now. You can check Bantay for your security, or try again in a moment.";
export const CHAT_SEND_FAILURE_COPY = "Couldn't send. Try again.";
export const CHAT_CLEARED_COPY = 'Chat cleared';
export const CHAT_TYPING_LABEL = 'Bantay is typing';

export const CHAT_QUICK_REPLIES = [
  'Why was my payment checked?',
  "What's my daily limit?",
  'Is my account locked?',
  'How do I turn on two-step?',
  'How do I hide my balance?',
  'Safety tips',
] as const;

/** The complete UI map: every allow-listed action has one fixed destination. */
export const CHAT_ACTION_LABELS: Record<BantayChatActionId, string> = {
  open_bantay: 'Open Bantay',
  open_profile_security: 'Security settings',
  open_transfer: 'Send money',
  open_activity: 'See activity',
  open_bills: 'Pay bills',
  open_schedules: 'Scheduled payments',
  open_support: 'Contact support',
};

type ChatMessageStatus = 'sending' | 'sent' | 'failed';
type ChatLimit = 'none' | 'minute' | 'daily';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  status?: ChatMessageStatus;
  source?: BantayChatSource;
  actions?: BantayChatActionId[];
}

function announce(message: string): void {
  if (typeof AccessibilityInfo.announceForAccessibility === 'function') {
    AccessibilityInfo.announceForAccessibility(message);
  }
}

export function BantayChatScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const reduceMotion = useReducedMotion();
  const { showConfirmation, confirmSheet } = useConfirmSheet();

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'greeting', role: 'assistant', text: CHAT_DISCLAIMER, status: 'sent' },
  ]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [limit, setLimit] = useState<ChatLimit>('none');
  const [clearFailed, setClearFailed] = useState(false);
  const [supportVisible, setSupportVisible] = useState(false);

  const counterRef = useRef(0);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const announcedRef = useRef<string | null>(null);
  const dotOpacity = useRef(new Animated.Value(0.4)).current;

  const announceOnce = useCallback((key: string, message: string) => {
    if (announcedRef.current === key) return;
    announcedRef.current = key;
    announce(message);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeNetworkStatus((isOfflineNow) => {
      if (!isOfflineNow) {
        setOffline(false);
        announcedRef.current = null;
      }
    });
    if (!getIsOffline()) setOffline(false);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!busy || reduceMotion) {
      dotOpacity.setValue(0.4);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(dotOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(dotOpacity, {
          toValue: 0.4,
          duration: 400,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [busy, dotOpacity, reduceMotion]);

  const sendMessage = useCallback(
    async (text: string, retryId?: string, bypass = false) => {
      const message = normalizeBantayChatMessage(text);
      if (!message) return;
      if (!bypass && (busy || offline || limit !== 'none')) return;

      const id = retryId ?? `user-${++counterRef.current}`;
      setBusy(true);
      if (!retryId) setDraft('');
      setMessages((previous) =>
        retryId
          ? previous.map((item) =>
              item.id === retryId ? { ...item, status: 'sending' } : item
            )
          : [
              ...previous,
              { id, role: 'user', text: message, status: 'sending' } as ChatMessage,
            ]
      );

      const result = await bantayChatClient.send({
        message,
        session_id: sessionIdRef.current,
      });
      setBusy(false);

      if (result.ok) {
        const response = result.data;
        sessionIdRef.current = response.session_id;
        setOffline(false);
        setMessages((previous) => [
          ...previous.map((item) =>
            item.id === id ? { ...item, status: 'sent' as const } : item
          ),
          {
            id: `assistant-${++counterRef.current}`,
            role: 'assistant',
            text: response.reply,
            source: response.source,
            actions: response.actions,
            status: 'sent',
          },
        ]);
        announce(response.reply);

        if (response.quota_remaining === 0) {
          setLimit('daily');
          announceOnce('daily', CHAT_DAILY_LIMIT_COPY);
        } else {
          setLimit('none');
          announcedRef.current = null;
        }
        return;
      }

      setMessages((previous) =>
        previous.map((item) =>
          item.id === id ? { ...item, status: 'failed' as const } : item
        )
      );
      switch (result.reason) {
        case 'offline':
          setOffline(true);
          announceOnce('offline', CHAT_OFFLINE_COPY);
          break;
        case 'rate_limited':
          setLimit('minute');
          announceOnce('minute', CHAT_MINUTE_LIMIT_COPY);
          break;
        case 'daily_limit':
          setLimit('daily');
          announceOnce('daily', CHAT_DAILY_LIMIT_COPY);
          break;
        case 'invalid':
        case 'server':
        default:
          setMessages((previous) => [
            ...previous,
            {
              id: `assistant-${++counterRef.current}`,
              role: 'assistant',
              text: CHAT_FALLBACK_COPY,
              source: 'fallback',
              status: 'sent',
            },
          ]);
          announceOnce('fallback', CHAT_FALLBACK_COPY);
          break;
      }
    },
    [announceOnce, busy, limit, offline]
  );

  const retryFailedMessage = useCallback(() => {
    const failed = [...messages]
      .reverse()
      .find((item) => item.role === 'user' && item.status === 'failed');
    if (failed) void sendMessage(failed.text, failed.id, true);
  }, [messages, sendMessage]);

  const performClear = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      setMessages([]);
      announce(CHAT_CLEARED_COPY);
      return;
    }
    const cleared = await bantayChatClient.clear(sessionId);
    if (!cleared) {
      // Spec §7.2: leave history untouched and show the fixed failure copy.
      setClearFailed(true);
      announceOnce('clear-failed', CHAT_CLEAR_FAILURE_COPY);
      return;
    }
    sessionIdRef.current = undefined;
    setMessages([]);
    setClearFailed(false);
    setLimit('none');
    announcedRef.current = null;
    announce(CHAT_CLEARED_COPY);
  }, [announceOnce]);

  const handleAction = useCallback(
    (action: BantayChatActionId) => {
      switch (action) {
        case 'open_bantay':
          navigation.navigate('BantaySecurity');
          break;
        case 'open_profile_security':
          navigation.navigate('Tabs', { screen: 'ProfileTab' });
          break;
        case 'open_transfer':
          navigation.navigate('Transfer');
          break;
        case 'open_activity':
          navigation.navigate('Tabs', { screen: 'ActivityTab' });
          break;
        case 'open_bills':
          navigation.navigate('PayBills');
          break;
        case 'open_schedules':
          navigation.navigate('ScheduledPayments');
          break;
        case 'open_support':
          setSupportVisible(true);
          break;
      }
    },
    [navigation]
  );

  const limitCopy =
    limit === 'daily'
      ? CHAT_DAILY_LIMIT_COPY
      : limit === 'minute'
        ? CHAT_MINUTE_LIMIT_COPY
        : null;
  const trimmedDraft = draft.trim();
  const sendDisabled =
    !trimmedDraft || trimmedDraft.length > 500 || busy || offline || limit !== 'none';

  return (
    <FeatureScreen
      title="Bantay chat"
      onBack={() => navigation.goBack()}
      trailingAction={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear chat"
          feedbackType="highlight"
          onPress={() =>
            showConfirmation({
              title: 'Clear this chat?',
              message: 'Your chat messages will be removed.',
              confirmLabel: 'Clear chat',
              cancelLabel: 'Cancel',
              destructive: true,
              onConfirm: () => {
                void performClear();
              },
            })
          }
          style={styles.headerAction}
          testID="bantay-chat-clear"
        >
          <Trash2 size={20} color={colors.ink} />
        </Pressable>
      }
      footer={
        <View style={styles.composerStack}>
          <Text
            variant="caption"
            color={colors.textSecondary}
            style={styles.disclaimer}
            maxFontSizeMultiplier={1.4}
          >
            {CHAT_DISCLAIMER}
          </Text>
          {offline ? (
            <View style={styles.offlineBanner} accessibilityLiveRegion="polite">
              <Text
                variant="caption"
                color={colors.ink}
                style={styles.offlineCopy}
                maxFontSizeMultiplier={1.4}
              >
                {CHAT_OFFLINE_COPY}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Try again"
                feedbackType="highlight"
                onPress={retryFailedMessage}
                style={styles.retryButton}
              >
                <Text variant="label" color={colors.primary}>
                  Try again
                </Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.composerRow}>
            {limitCopy ? (
              <View
                style={styles.limitComposer}
                accessibilityLiveRegion="polite"
                testID="bantay-chat-limit"
              >
                <Text variant="caption" color={colors.textMuted}>
                  {limitCopy}
                </Text>
              </View>
            ) : (
              <TextField
                label="Message"
                value={draft}
                onChangeText={setDraft}
                maxLength={500}
                editable={!busy}
                multiline
                containerStyle={styles.inputContainer}
                style={styles.input}
              />
            )}
            <Button
              title="Send"
              icon={
                <Send
                  size={18}
                  color={sendDisabled ? colors.textMuted : colors.textInverse}
                />
              }
              accessibilityLabel="Send message"
              accessibilityState={{ disabled: sendDisabled }}
              disabled={sendDisabled}
              onPress={() => void sendMessage(draft)}
              style={styles.sendButton}
            />
          </View>
          {draft.length > 450 ? (
            <Text variant="caption" color={colors.textMuted} align="right">
              {draft.length}/500
            </Text>
          ) : null}
        </View>
      }
    >
      <View style={styles.body} testID="bantay-chat-messages">
        {clearFailed ? (
          <View style={styles.inlineBanner} accessibilityLiveRegion="polite">
            <Text variant="caption" color={colors.redText} style={styles.inlineCopy}>
              {CHAT_CLEAR_FAILURE_COPY}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Try again"
              feedbackType="highlight"
              onPress={() => void performClear()}
              style={styles.retryButton}
            >
              <Text variant="label" color={colors.primary}>
                Try again
              </Text>
            </Pressable>
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickReplies}
          testID="bantay-chat-quick-replies"
        >
          {CHAT_QUICK_REPLIES.map((reply) => (
            <Chip key={reply} label={reply} onPress={() => void sendMessage(reply)} />
          ))}
        </ScrollView>

        {messages.map((message) =>
          message.role === 'user' ? (
            <View style={styles.userRow} key={message.id}>
              <View style={styles.userColumn}>
                <View
                  style={styles.userBubble}
                  accessible
                  accessibilityLabel={`You said: ${message.text}`}
                >
                  <Text variant="body" color={colors.ink} maxFontSizeMultiplier={1.4}>
                    {message.text}
                  </Text>
                </View>
                {message.status === 'sending' ? (
                  <Text variant="caption" color={colors.textMuted}>
                    Sending…
                  </Text>
                ) : null}
                {message.status === 'failed' ? (
                  <View style={styles.failedRow}>
                    <Text
                      variant="caption"
                      color={colors.redText}
                      maxFontSizeMultiplier={1.4}
                    >
                      {CHAT_SEND_FAILURE_COPY}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Retry message"
                      feedbackType="highlight"
                      onPress={() => void sendMessage(message.text, message.id, true)}
                      style={styles.retryButton}
                    >
                      <Text variant="label" color={colors.primary}>
                        Try again
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={styles.assistantRow} key={message.id}>
              <View
                style={styles.assistantContent}
                testID="bantay-chat-answer"
                accessible
                accessibilityLabel={`Bantay says: ${message.text}${
                  message.source === 'article' ? ` ${CHAT_SOURCE_CAPTION}` : ''
                }`}
              >
                <Image
                  source={MASCOT_BANTAY}
                  style={styles.avatar}
                  accessible={false}
                  resizeMode="contain"
                />
                <View style={styles.assistantText}>
                  <Text variant="body" color={colors.ink} maxFontSizeMultiplier={1.4}>
                    {message.text}
                  </Text>
                  {message.source === 'article' ? (
                    <View accessible={false}>
                      <Text
                        variant="caption"
                        color={colors.textSecondary}
                        maxFontSizeMultiplier={1.4}
                      >
                        {CHAT_SOURCE_CAPTION}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              {message.actions && message.actions.length > 0 ? (
                <View style={styles.actionRow} testID="bantay-chat-actions">
                  {message.actions.map((action) => (
                    <Pressable
                      key={action}
                      accessibilityRole="button"
                      accessibilityLabel={CHAT_ACTION_LABELS[action]}
                      feedbackType="highlight"
                      onPress={() => handleAction(action)}
                      style={styles.actionButton}
                    >
                      <MessageCircle size={16} color={colors.primary} />
                      <Text variant="label" color={colors.primary}>
                        {CHAT_ACTION_LABELS[action]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          )
        )}

        {busy ? (
          <View
            style={styles.typingRow}
            accessible
            accessibilityLabel={CHAT_TYPING_LABEL}
            accessibilityLiveRegion="polite"
          >
            <Image
              source={MASCOT_BANTAY}
              style={styles.avatar}
              accessible={false}
              resizeMode="contain"
            />
            <View style={styles.dots}>
              {[0, 1, 2].map((dot) => (
                <Animated.View key={dot} style={[styles.dot, { opacity: dotOpacity }]} />
              ))}
            </View>
          </View>
        ) : null}
      </View>

      {confirmSheet}

      <Sheet
        visible={supportVisible}
        onClose={() => setSupportVisible(false)}
        title="Contact support"
        footer={<Button title="Done" onPress={() => setSupportVisible(false)} />}
      >
        <Text variant="body" color={colors.ink}>
          For help with an account or a security case, use the contact details shown in
          the app. Never send passwords, codes or card numbers to support or to this chat.
        </Text>
      </Sheet>
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.base,
  },
  headerAction: {
    minWidth: size.touch,
    minHeight: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  inlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.tintRed,
    borderRadius: radius.sm,
  },
  inlineCopy: {
    flexShrink: 1,
  },
  quickReplies: {
    gap: spacing.sm,
    paddingRight: spacing.screenSide,
  },
  userRow: {
    alignItems: 'flex-end',
  },
  userColumn: {
    maxWidth: '85%',
    gap: spacing.xs,
  },
  userBubble: {
    backgroundColor: colors.primaryTint,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  failedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  assistantRow: {
    gap: spacing.sm,
  },
  assistantContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  assistantText: {
    flex: 1,
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  avatar: {
    width: 24,
    height: 24,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingLeft: 24 + spacing.sm,
  },
  actionButton: {
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textSecondary,
  },
  composerStack: {
    gap: spacing.sm,
  },
  disclaimer: {
    textAlign: 'center',
  },
  limitComposer: {
    flex: 1,
    minHeight: size.control,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSubtle,
  },
  offlineCopy: {
    flexShrink: 1,
  },
  retryButton: {
    minHeight: size.touch,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  inputContainer: {
    flex: 1,
    marginBottom: 0,
  },
  input: {
    maxHeight: 96,
  },
  sendButton: {
    minHeight: size.touch,
    minWidth: size.touch,
    paddingHorizontal: spacing.base,
  },
});
