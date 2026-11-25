import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { toUserMessage } from '@davao-bank/shared';
import { resultReceipt } from '../utils/resultReceipt';
import { Check, Calendar, Send, AlertCircle } from 'lucide-react-native';
import { colors, spacing, motion, formatCentavosToPHP } from '@davao-bank/shared';
import { easing } from '../theme/easing';
import { Text } from './Text';
import { Button } from './Button';
import { Card } from './Card';

export type ResultOutcome = 'completed' | 'scheduled' | 'request_sent' | 'failed';

export interface ResultDetailRow {
  label: string;
  value: string;
}

export interface ResultViewProps {
  outcome: ResultOutcome;
  title: string;
  subtitle?: string;
  amountCentavos?: number;
  amountFormatted?: string;
  details?: ResultDetailRow[];
  onDone: () => void;
  onShareReceipt?: () => void;
  hideBalance?: boolean;
  shareReceipt?: boolean;
  contextualActionTitle?: string;
  onContextualAction?: () => void;
}

export function ResultView({
  outcome,
  title,
  subtitle,
  amountCentavos,
  amountFormatted,
  details = [],
  onDone,
  onShareReceipt,
  hideBalance = false,
  shareReceipt = false,
  contextualActionTitle,
  onContextualAction,
}: ResultViewProps) {
  const reduceMotion = useReducedMotion();
  const discScale = useSharedValue(reduceMotion ? 1 : 0.6);
  const discOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const iconOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const titleOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const titleTranslateY = useSharedValue(reduceMotion ? 0 : 8);
  const amountOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const amountTranslateY = useSharedValue(reduceMotion ? 0 : 8);

  useEffect(() => {
    if (reduceMotion) {
      discScale.value = 1;
      discOpacity.value = 1;
      iconOpacity.value = 1;
      titleOpacity.value = 1;
      titleTranslateY.value = 0;
      amountOpacity.value = 1;
      amountTranslateY.value = 0;
      return;
    }

    discOpacity.value = withTiming(1, { duration: motion.duration.short });
    discScale.value = withSpring(1, motion.spring.pop);

    iconOpacity.value = withDelay(
      80,
      withTiming(1, { duration: 360, easing: easing.enter })
    );

    titleOpacity.value = withDelay(
      140,
      withTiming(1, { duration: motion.duration.medium, easing: easing.enter })
    );
    titleTranslateY.value = withDelay(
      140,
      withTiming(0, { duration: motion.duration.medium, easing: easing.enter })
    );

    amountOpacity.value = withDelay(
      200,
      withTiming(1, { duration: motion.duration.medium, easing: easing.enter })
    );
    amountTranslateY.value = withDelay(
      200,
      withTiming(0, { duration: motion.duration.medium, easing: easing.enter })
    );
  }, [
    reduceMotion,
    discScale,
    discOpacity,
    iconOpacity,
    titleOpacity,
    titleTranslateY,
    amountOpacity,
    amountTranslateY,
  ]);

  const discAnimatedStyle = useAnimatedStyle(() => ({
    opacity: discOpacity.value,
    transform: [{ scale: discScale.value }],
  }));

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
  }));

  const titleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  const amountAnimatedStyle = useAnimatedStyle(() => ({
    opacity: amountOpacity.value,
    transform: [{ translateY: amountTranslateY.value }],
  }));

  const [shareError, setShareError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const share = async () => {
    setShareError(null);
    setSharing(true);
    let uri: string | null = null;
    try {
      if (!(await Sharing.isAvailableAsync()) || !FileSystem.cacheDirectory) {
        setShareError('Sharing is not available on this device.');
        return;
      }
      uri = `${FileSystem.cacheDirectory}davao-bank-result.txt`;
      await FileSystem.writeAsStringAsync(
        uri,
        resultReceipt(title, amountCentavos, hideBalance, details)
      );
      await Sharing.shareAsync(uri, {
        mimeType: 'text/plain',
        UTI: 'public.plain-text',
        dialogTitle: 'Share receipt',
      });
    } catch (error) {
      setShareError(toUserMessage(error));
    } finally {
      if (uri)
        await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      setSharing(false);
    }
  };
  useEffect(() => {
    try {
      if (outcome === 'completed') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (outcome === 'failed') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {
      // Haptics optional
    }
  }, [outcome]);

  const getIcon = () => {
    switch (outcome) {
      case 'completed':
        return <Check size={32} color={colors.primary} strokeWidth={3} />;
      case 'scheduled':
        return <Calendar size={32} color={colors.blueText} strokeWidth={2.5} />;
      case 'request_sent':
        return <Send size={30} color={colors.primary} strokeWidth={2.5} />;
      case 'failed':
        return <AlertCircle size={32} color={colors.redText} strokeWidth={2.5} />;
    }
  };

  const getDiscBg = () => {
    switch (outcome) {
      case 'completed':
        return colors.primaryTint;
      case 'scheduled':
        return colors.tintBlue;
      case 'request_sent':
        return colors.primaryTint;
      case 'failed':
        return colors.tintRed;
    }
  };

  const displayAmount =
    hideBalance && (amountCentavos !== undefined || amountFormatted)
      ? '₱••••••'
      : amountFormatted ||
        (amountCentavos !== undefined ? formatCentavosToPHP(amountCentavos) : null);

  return (
    <View style={styles.container}>
      <Animated.View
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.iconDisc, { backgroundColor: getDiscBg() }, discAnimatedStyle]}
      >
        <Animated.View style={iconAnimatedStyle}>{getIcon()}</Animated.View>
      </Animated.View>

      <Animated.View style={titleAnimatedStyle}>
        <Text
          accessibilityRole="header"
          variant="h2"
          color={colors.ink}
          align="center"
          style={styles.title}
        >
          {title}
        </Text>
      </Animated.View>

      {subtitle ? (
        <Text
          variant="body"
          color={colors.textSecondary}
          align="center"
          style={styles.subtitle}
        >
          {subtitle}
        </Text>
      ) : null}

      {displayAmount ? (
        <Animated.View style={amountAnimatedStyle}>
          <Text
            variant="amount"
            color={colors.ink}
            align="center"
            style={styles.amount}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            maxFontSizeMultiplier={1.4}
            accessibilityLabel={hideBalance ? 'Amount hidden' : undefined}
          >
            {displayAmount}
          </Text>
        </Animated.View>
      ) : null}

      {details.length > 0 ? (
        <Card style={styles.detailsCard}>
          {details.map((row, idx) => (
            <View
              key={row.label}
              style={[
                styles.detailRow,
                idx < details.length - 1 && styles.detailRowBorder,
              ]}
            >
              <Text variant="caption" color={colors.textSecondary}>
                {row.label}
              </Text>
              <Text variant="bodyStrong" color={colors.ink} style={styles.detailValue}>
                {row.value}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      {shareError && (
        <Text accessibilityRole="alert" color={colors.redText}>
          {shareError}
        </Text>
      )}
      <View style={styles.actionButtons}>
        <Button title="Done" onPress={onDone} variant="primary" style={styles.btn} />
        {onShareReceipt || shareReceipt ? (
          <Button
            title="Share receipt"
            onPress={onShareReceipt ?? (() => void share())}
            loading={sharing}
            variant="secondary"
            style={styles.btn}
          />
        ) : null}
        {contextualActionTitle && onContextualAction ? (
          <Button
            title={contextualActionTitle}
            onPress={onContextualAction}
            variant="secondary"
            style={styles.btn}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    width: '100%',
  },
  iconDisc: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  title: {
    marginBottom: spacing.xs,
  },
  subtitle: {
    marginBottom: spacing.md,
    paddingHorizontal: spacing.base,
  },
  amount: {
    marginBottom: spacing.lg,
  },
  detailsCard: {
    width: '100%',
    padding: spacing.base,
    marginBottom: spacing.xl,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  detailRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  actionButtons: {
    width: '100%',
    gap: spacing.sm,
  },
  btn: {
    width: '100%',
  },
});
