import React, { useState, useCallback } from 'react';
import { View, StyleSheet, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import { Eye, EyeOff, Wallet } from 'lucide-react-native';
import {
  colors,
  elevation,
  radius,
  size,
  spacing,
  toUserMessage,
  fetchAccountBalances,
  type AccountBalance,
} from '@davao-bank/shared';
import type { RootStackParamList } from '../../App';
import { supabase } from '../lib/supabase';
import { reportNetworkResult } from '../lib/networkStatus';
import { useSettings } from '../context/SettingsContext';
import {
  FeatureScreen,
  Text,
  AmountText,
  Badge,
  Pressable,
  Button,
  Skeleton,
  EmptyState,
  ListHairline,
  formatAccountLabel,
  groupedListStyles,
  LIST_DISC_SIZE,
  LIST_ICON_SIZE,
} from '../components';

export const SHOW_ON_HOME_ACCOUNT_KEY = 'davao_bank_show_on_home_account_id';

const EYE_BUTTON_SIZE = size.touch;
const EYE_ICON_SIZE = 20;
const AMOUNT_MAX_SCALE = 1.4;

export function MyAccountsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { hideBalance, toggleHideBalance } = useSettings();

  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [homeAccountId, setHomeAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [accRes, savedHomeId] = await Promise.all([
        fetchAccountBalances(supabase),
        SecureStore.getItemAsync(SHOW_ON_HOME_ACCOUNT_KEY).catch(() => null),
      ]);

      reportNetworkResult(accRes.error);
      if (accRes.error || !accRes.data) {
        setError(toUserMessage(accRes.error, 'load'));
      } else {
        setError(null);
        setAccounts(accRes.data);
      }
      setHomeAccountId(savedHomeId);
    } catch (err) {
      reportNetworkResult(err);
      setError(toUserMessage(err, 'load'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleToggleShowOnHome = async (account: AccountBalance) => {
    try {
      if (homeAccountId === account.account_id) {
        await SecureStore.deleteItemAsync(SHOW_ON_HOME_ACCOUNT_KEY);
        setHomeAccountId(null);
      } else {
        await SecureStore.setItemAsync(SHOW_ON_HOME_ACCOUNT_KEY, account.account_id);
        setHomeAccountId(account.account_id);
      }
    } catch {
      // SecureStore error fallback
    }
  };

  const combinedBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

  const renderBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'active') {
      return <Badge label="Active" variant="info" />;
    }
    if (s === 'frozen') {
      return <Badge label="Frozen" variant="danger" />;
    }
    return <Badge label="Closed" variant="neutral" />;
  };

  return (
    <FeatureScreen
      title="My accounts"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <Skeleton width="100%" height={120} style={styles.skeletonCard} />
          <Skeleton width="100%" height={160} style={styles.skeletonCard} />
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text variant="bodyStrong" color={colors.ink}>
            Accounts unavailable
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            {error}
          </Text>
          <Button title="Try again" variant="secondary" onPress={loadData} />
        </View>
      ) : (
        <View style={styles.content}>
          {/* Combined balance card */}
          <View style={styles.combinedCard}>
            <View style={styles.combinedHeaderRow}>
              <Text variant="caption" color={colors.textSecondary}>
                COMBINED BALANCE
              </Text>
              <Pressable
                onPress={toggleHideBalance}
                style={styles.eyeButton}
                accessibilityRole="button"
                accessibilityLabel={hideBalance ? 'Show balance' : 'Hide balance'}
                hitSlop={0}
              >
                {hideBalance ? (
                  <EyeOff size={EYE_ICON_SIZE} color={colors.ink} />
                ) : (
                  <Eye size={EYE_ICON_SIZE} color={colors.ink} />
                )}
              </Pressable>
            </View>

            <AmountText
              amountCentavos={combinedBalance}
              hidden={hideBalance}
              variant="amount"
              color={colors.ink}
              showSign={false}
              maxFontSizeMultiplier={AMOUNT_MAX_SCALE}
            />

            <Text variant="caption" color={colors.textMuted}>
              {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
            </Text>
          </View>

          {/* Account rows */}
          {accounts.length === 0 ? (
            <EmptyState
              title="No accounts found"
              description="You have no active accounts."
            />
          ) : (
            <View style={groupedListStyles.group}>
              {accounts.map((acc, index) => {
                const label = formatAccountLabel(acc);
                const isHomeAccount = homeAccountId === acc.account_id;

                return (
                  <View key={acc.account_id}>
                    {index > 0 && <ListHairline />}

                    <View style={styles.accountCardItem}>
                      {/* Main pressable row */}
                      <Pressable
                        style={styles.mainAccountRow}
                        onPress={() =>
                          navigation.navigate('AccountDetail', {
                            accountId: acc.account_id,
                            account: acc,
                          })
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`${label}, see account detail`}
                      >
                        <View style={styles.disc}>
                          <Wallet size={LIST_ICON_SIZE} color={colors.primary} />
                        </View>

                        <View style={styles.accountInfo}>
                          <View style={styles.titleRow}>
                            <Text
                              variant="bodyStrong"
                              color={colors.ink}
                              numberOfLines={1}
                              style={styles.accountTitle}
                            >
                              {label}
                            </Text>
                            {renderBadge(acc.status)}
                          </View>

                          <View style={styles.balanceRow}>
                            <AmountText
                              amountCentavos={acc.balance}
                              hidden={hideBalance}
                              variant="bodyStrong"
                              color={colors.ink}
                              showSign={false}
                              maxFontSizeMultiplier={AMOUNT_MAX_SCALE}
                            />
                          </View>
                        </View>
                      </Pressable>

                      {/* Show on Home toggle button */}
                      <Pressable
                        style={styles.showOnHomeButton}
                        onPress={() => handleToggleShowOnHome(acc)}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: isHomeAccount }}
                        accessibilityLabel={
                          isHomeAccount
                            ? `Show ${label} on Home, currently enabled`
                            : `Show ${label} on Home, currently disabled`
                        }
                      >
                        <View
                          style={[
                            styles.statusDot,
                            isHomeAccount
                              ? styles.statusDotActive
                              : styles.statusDotInactive,
                          ]}
                        />
                        <Text
                          variant="caption"
                          color={isHomeAccount ? colors.primary : colors.textSecondary}
                        >
                          Show on Home
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
  },
  loadingContainer: {
    gap: spacing.base,
  },
  skeletonCard: {
    borderRadius: radius.md,
  },
  errorContainer: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  combinedCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
    ...elevation.card,
  },
  combinedHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyeButton: {
    width: EYE_BUTTON_SIZE,
    height: EYE_BUTTON_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountCardItem: {
    paddingVertical: spacing.sm,
  },
  mainAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.base,
    minHeight: 52,
  },
  disc: {
    width: LIST_DISC_SIZE,
    height: LIST_DISC_SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  accountTitle: {
    flexShrink: 1,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  showOnHomeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    minHeight: size.touch,
    gap: spacing.xs,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotActive: {
    backgroundColor: colors.primary,
  },
  statusDotInactive: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
});
