import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Keyboard, Platform, AccessibilityInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { colors, typography } from '@davao-bank/shared';
import { Text } from './Text';
import { Pressable } from './Pressable';

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceTransparencyEnabled().then(setReduceTransparency);
    const sub = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setReduceTransparency
    );
    return () => {
      sub?.remove();
    };
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (keyboardVisible) return null;

  return (
    <View
      style={[styles.wrapper, { bottom: Math.max(insets.bottom, 8) + 8 }]}
      accessibilityRole="tablist"
    >
      <View style={styles.pillContainer}>
        {reduceTransparency ? (
          <View style={[StyleSheet.absoluteFill, styles.solidFallback]} />
        ) : (
          <BlurView
            intensity={Platform.OS === 'ios' ? 80 : 100}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
        )}

        <View style={styles.tabRow}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const isFocused = state.index === index;

            const label =
              options.tabBarLabel !== undefined
                ? String(options.tabBarLabel)
                : options.title !== undefined
                  ? options.title
                  : route.name;

            const badge = options.tabBarBadge;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                try {
                  Haptics.selectionAsync();
                } catch {
                  // Haptics optional
                }
                navigation.navigate(route.name);
              }
            };

            const icon = options.tabBarIcon?.({
              focused: isFocused,
              color: isFocused ? colors.primary : colors.textSecondary,
              size: 22,
            });

            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: isFocused }}
                accessibilityLabel={
                  badge ? `${label}, ${badge} unread notifications` : label
                }
                onPress={onPress}
                feedbackType="none"
                style={[styles.tabItem, isFocused && styles.activeTabPill]}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <View style={styles.iconBox}>
                  {icon}
                  {badge ? (
                    <View style={styles.badge}>
                      <Text
                        variant="caption"
                        color={colors.textInverse}
                        style={styles.badgeText}
                      >
                        {String(badge)}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Text
                  variant="caption"
                  color={isFocused ? colors.primary : colors.textSecondary}
                  style={[styles.tabLabel, isFocused && styles.activeTabLabel]}
                  maxFontSizeMultiplier={1.4}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
    elevation: 8,
  },
  pillContainer: {
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  solidFallback: {
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
  },
  tabRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  activeTabPill: {
    backgroundColor: colors.primaryTint,
  },
  iconBox: {
    position: 'relative',
    height: 24,
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: typography.fonts.bold,
  },
  tabLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: typography.fonts.semiBold,
    marginTop: 2,
  },
  activeTabLabel: {
    fontFamily: typography.fonts.bold,
  },
});
