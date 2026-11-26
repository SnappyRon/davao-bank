import React, { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  ScrollView,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { Send, Zap, ShieldCheck } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated';
import { colors, spacing, motion } from '@davao-bank/shared';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Pressable } from '../components/Pressable';

export const ONBOARDING_SEEN_KEY = 'davao_onboarding_seen';

interface OnboardingScreenProps {
  onFinish: () => void;
}

interface OnboardingPage {
  title: string;
  sentence: string;
  footnote?: string;
  discBg: string;
  icon: React.ReactNode;
}

export function OnboardingScreen({ onFinish }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [currentPage, setCurrentPage] = useState(0);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const windowWidth = Dimensions.get('window').width;

  const pages: OnboardingPage[] = [
    {
      title: 'Bank the Davao way',
      sentence: 'Send and receive play money safely between Davao Bank accounts.',
      discBg: colors.primaryTint,
      icon: <Send size={44} color={colors.primary} />,
    },
    {
      title: 'Pay bills in a few taps',
      sentence:
        'Manage your electricity, water and internet utilities in one simple place.',
      discBg: colors.tintOrange,
      icon: <Zap size={44} color={colors.orangeText} />,
    },
    {
      title: 'Protected by Face ID and two-step codes',
      sentence: 'Every payment is secured with your device biometrics and authenticator.',
      footnote: 'Simulated money — for learning only',
      discBg: colors.tintBlue,
      icon: <ShieldCheck size={44} color={colors.blueText} />,
    },
  ];

  const handleFinish = async () => {
    try {
      await SecureStore.setItemAsync(ONBOARDING_SEEN_KEY, 'true');
    } catch {
      // Ignore
    }
    onFinish();
  };

  const goToPage = (pageIndex: number) => {
    const clamped = Math.max(0, Math.min(pageIndex, pages.length - 1));
    setCurrentPage(clamped);
    scrollRef.current?.scrollTo({
      x: clamped * windowWidth,
      animated: !reduceMotion,
    });
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const index = Math.round(x / windowWidth);
    if (index !== currentPage && index >= 0 && index < pages.length) {
      setCurrentPage(index);
    }
  };

  return (
    <View
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
    >
      {/* Header with Skip button */}
      <View style={styles.header}>
        {currentPage < pages.length - 1 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
            onPress={handleFinish}
            style={styles.skipButton}
            feedbackType="scale"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text variant="label" color={colors.textSecondary}>
              Skip
            </Text>
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {/* Pages Carousel */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        style={styles.scrollView}
      >
        {pages.map((p, idx) => (
          <View key={p.title} style={[styles.pageContainer, { width: windowWidth }]}>
            <OnboardingArt discBg={p.discBg} icon={p.icon} active={idx === currentPage} />

            <Text
              variant="h2"
              color={colors.ink}
              align="center"
              style={styles.headline}
              accessibilityRole="header"
            >
              {p.title}
            </Text>

            <Text
              variant="body"
              color={colors.textSecondary}
              align="center"
              style={styles.sentence}
            >
              {p.sentence}
            </Text>

            {p.footnote ? (
              <Text
                variant="caption"
                color={colors.textMuted}
                align="center"
                style={styles.footnote}
              >
                {p.footnote}
              </Text>
            ) : null}
          </View>
        ))}
      </ScrollView>

      {/* Dots Indicator */}
      <View
        style={styles.dotsRow}
        accessibilityRole="tablist"
        accessibilityLabel={`Page ${currentPage + 1} of ${pages.length}`}
      >
        {pages.map((_, idx) => (
          <View
            key={idx}
            style={[
              styles.dot,
              idx === currentPage ? styles.activeDot : styles.inactiveDot,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: idx === currentPage }}
            accessibilityLabel={`Go to slide ${idx + 1}`}
          />
        ))}
      </View>

      {/* Footer Controls */}
      <View style={styles.footer}>
        {currentPage > 0 ? (
          <Button
            title="Back"
            variant="secondary"
            onPress={() => goToPage(currentPage - 1)}
            style={styles.navButton}
          />
        ) : (
          <View style={styles.buttonPlaceholder} />
        )}

        {currentPage < pages.length - 1 ? (
          <Button
            title="Next"
            variant="primary"
            onPress={() => goToPage(currentPage + 1)}
            style={styles.navButton}
          />
        ) : (
          <Button
            title="Get started"
            variant="primary"
            onPress={handleFinish}
            style={styles.navButton}
          />
        )}
      </View>
    </View>
  );
}

function OnboardingArt({
  discBg,
  icon,
  active,
}: {
  discBg: string;
  icon: React.ReactNode;
  active: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : 8);

  React.useEffect(() => {
    if (active) {
      if (reduceMotion) {
        opacity.value = 1;
        translateY.value = 0;
      } else {
        opacity.value = withTiming(1, { duration: motion.duration.medium });
        translateY.value = withSpring(0, motion.spring.pop);
      }
    }
  }, [active, reduceMotion, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      accessible={false}
      style={[styles.artDisc, { backgroundColor: discBg }, animatedStyle]}
    >
      {icon}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
    justifyContent: 'space-between',
  },
  header: {
    height: 48,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  skipButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  headerSpacer: {
    height: 44,
  },
  scrollView: {
    flexGrow: 0,
  },
  pageContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.base,
  },
  artDisc: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing['2xl'],
  },
  headline: {
    marginBottom: spacing.md,
    paddingHorizontal: spacing.base,
  },
  sentence: {
    lineHeight: 24,
    paddingHorizontal: spacing.lg,
  },
  footnote: {
    marginTop: spacing.xl,
    lineHeight: 18,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.base,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  activeDot: {
    width: 24,
    backgroundColor: colors.primary,
  },
  inactiveDot: {
    width: 8,
    backgroundColor: colors.border,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.base,
  },
  navButton: {
    flex: 1,
  },
  buttonPlaceholder: {
    flex: 1,
  },
});
