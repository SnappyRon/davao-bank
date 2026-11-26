import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ArrowLeftRight,
  Calculator,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Globe,
  Landmark,
  MapPin,
  PiggyBank,
  WifiOff,
} from 'lucide-react-native';
import { colors, radius, spacing, toUserMessage } from '@davao-bank/shared';
import type { RootStackParamList } from '../../App';
import { getIsOffline, subscribeNetworkStatus } from '../lib/networkStatus';
import {
  Button,
  EmptyState,
  FeatureScreen,
  GroupedList,
  LIST_ICON_SIZE,
  ListHairline,
  Pressable,
  Skeleton,
  Text,
  groupedListStyles,
  useToast,
} from '../components';

export type ServiceId =
  | 'fx_converter'
  | 'savings_goals'
  | 'time_deposit_planner'
  | 'service_requests'
  | 'branch_appointments'
  | 'credit_card'
  | 'installment_calculator'
  | 'remittance_tracker';

/**
 * Progressive rollout gate (Spec §3): only services whose mobile screens are
 * built and merged belong in `SERVICES_ENABLED`. All other services stay
 * visible in the hub with `SERVICE_UNAVAILABLE_COPY` and never push an
 * unfinished screen.
 */
export const SERVICES_ENABLED: ReadonlySet<ServiceId> = new Set<ServiceId>([
  'fx_converter',
  'service_requests',
  'branch_appointments',
  'installment_calculator',
  'remittance_tracker',
]);

export const SERVICE_UNAVAILABLE_COPY = 'Not available yet';
export const MORE_SERVICES_OFFLINE_COPY =
  'You appear to be offline. Online services will refresh when you reconnect.';

export type ServiceRouteTarget =
  | { route: 'FXRates'; params: RootStackParamList['FXRates'] }
  | { route: 'ServiceRequests'; params?: RootStackParamList['ServiceRequests'] }
  | { route: 'NewServiceRequest'; params?: RootStackParamList['NewServiceRequest'] }
  | { route: 'BranchAppointments'; params?: RootStackParamList['BranchAppointments'] }
  | { route: 'BookAppointment'; params?: RootStackParamList['BookAppointment'] }
  | { route: 'SavingsGoals'; params?: RootStackParamList['SavingsGoals'] }
  | { route: 'TimeDepositPlanner'; params?: RootStackParamList['TimeDepositPlanner'] }
  | {
      route: 'InstallmentCalculator';
      params?: RootStackParamList['InstallmentCalculator'];
    }
  | { route: 'Cards'; params?: RootStackParamList['Cards'] };

export interface ServiceCatalogItem {
  id: ServiceId;
  title: string;
  subtitle: string;
  iconBg: string;
  renderIcon: () => React.ReactNode;
  target: ServiceRouteTarget | null;
}

export interface ServiceSection {
  id: string;
  title: string;
  items: readonly ServiceCatalogItem[];
}

export const MORE_SERVICE_SECTIONS: readonly ServiceSection[] = [
  {
    id: 'money-tools',
    title: 'Money tools',
    items: [
      {
        id: 'fx_converter',
        title: 'FX converter',
        subtitle: 'Convert peso amounts using reference rates.',
        iconBg: colors.primaryTint,
        renderIcon: () => <ArrowLeftRight size={LIST_ICON_SIZE} color={colors.primary} />,
        target: { route: 'FXRates', params: { mode: 'convert' } },
      },
      {
        id: 'savings_goals',
        title: 'Savings goals',
        subtitle: 'Plan target amounts and interest projections.',
        iconBg: colors.primaryTint,
        renderIcon: () => <PiggyBank size={LIST_ICON_SIZE} color={colors.primary} />,
        target: { route: 'SavingsGoals' },
      },
      {
        id: 'time_deposit_planner',
        title: 'Time deposit planner',
        subtitle: 'Compare term rates and maturity dates.',
        iconBg: colors.tintBlue,
        renderIcon: () => <Landmark size={LIST_ICON_SIZE} color={colors.blueText} />,
        target: { route: 'TimeDepositPlanner' },
      },
    ],
  },
  {
    id: 'requests-appointments',
    title: 'Requests & appointments',
    items: [
      {
        id: 'service_requests',
        title: 'Service requests',
        subtitle: 'Request statements, certificates or card updates.',
        iconBg: colors.tintOrange,
        renderIcon: () => (
          <ClipboardList size={LIST_ICON_SIZE} color={colors.orangeText} />
        ),
        target: { route: 'ServiceRequests' },
      },
      {
        id: 'branch_appointments',
        title: 'Branch appointments',
        subtitle: 'Book a visit at a Davao Bank branch',
        iconBg: colors.primaryTint,
        renderIcon: () => <MapPin size={LIST_ICON_SIZE} color={colors.primary} />,
        target: { route: 'BranchAppointments' },
      },
    ],
  },
  {
    id: 'cards-credit',
    title: 'Cards & credit',
    items: [
      {
        id: 'credit_card',
        title: 'Credit card',
        subtitle: 'Explore virtual card limits, statements and bill pay.',
        iconBg: colors.tintBlue,
        renderIcon: () => <CreditCard size={LIST_ICON_SIZE} color={colors.blueText} />,
        target: { route: 'Cards' },
      },
      {
        id: 'installment_calculator',
        title: 'Installment calculator',
        subtitle: 'Estimate monthly payments with reference rates.',
        iconBg: colors.tintYellow,
        renderIcon: () => <Calculator size={LIST_ICON_SIZE} color={colors.ink} />,
        target: { route: 'InstallmentCalculator' },
      },
    ],
  },
  {
    id: 'learn',
    title: 'Learn',
    items: [
      {
        id: 'remittance_tracker',
        title: 'Remittance tracker',
        subtitle: 'Check remittance status using your reference number.',
        iconBg: colors.surfaceSubtle,
        renderIcon: () => <Globe size={LIST_ICON_SIZE} color={colors.ink} />,
        target: { route: 'NewServiceRequest', params: { initialType: 'remit_status' } },
      },
    ],
  },
];

function navigateToTarget(
  navigation: NativeStackNavigationProp<RootStackParamList>,
  target: ServiceRouteTarget
) {
  switch (target.route) {
    case 'FXRates':
      navigation.navigate('FXRates', target.params);
      return;
    case 'ServiceRequests':
      navigation.navigate('ServiceRequests', target.params);
      return;
    case 'NewServiceRequest':
      navigation.navigate('NewServiceRequest', target.params);
      return;
    case 'BranchAppointments':
      navigation.navigate('BranchAppointments', target.params);
      return;
    case 'BookAppointment':
      navigation.navigate('BookAppointment', target.params);
      return;
    case 'SavingsGoals':
      navigation.navigate('SavingsGoals', target.params);
      return;
    case 'TimeDepositPlanner':
      navigation.navigate('TimeDepositPlanner', target.params);
      return;
    case 'InstallmentCalculator':
      navigation.navigate('InstallmentCalculator', target.params);
      return;
    case 'Cards':
      navigation.navigate('Cards', target.params);
      return;
  }
}

export interface MoreServicesScreenProps {
  enabledServices?: ReadonlySet<ServiceId>;
  sections?: readonly ServiceSection[];
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
}

export function MoreServicesScreen({
  enabledServices = SERVICES_ENABLED,
  sections = MORE_SERVICE_SECTIONS,
  loading = false,
  error = null,
  onRetry,
}: MoreServicesScreenProps = {}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const toast = useToast();
  const [offline, setOffline] = useState<boolean>(() => getIsOffline());

  useEffect(() => {
    setOffline(getIsOffline());
    return subscribeNetworkStatus(setOffline);
  }, []);

  const handlePressItem = (item: ServiceCatalogItem, isEnabled: boolean) => {
    if (isEnabled && item.target) {
      navigateToTarget(navigation, item.target);
      return;
    }
    toast.show(SERVICE_UNAVAILABLE_COPY);
  };

  return (
    <FeatureScreen title="More services">
      <View style={styles.content}>
        {offline ? (
          <View
            style={styles.offlineNotice}
            accessibilityRole="alert"
            testID="more-services-offline-notice"
          >
            <WifiOff size={16} color={colors.orangeText} />
            <Text
              variant="caption"
              color={colors.ink}
              style={styles.offlineText}
              maxFontSizeMultiplier={1.4}
            >
              {MORE_SERVICES_OFFLINE_COPY}
            </Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.skeletonGroup} testID="more-services-skeleton">
            <Skeleton width="40%" height={22} style={styles.skeletonHeading} />
            <Skeleton width="100%" height={192} style={styles.skeletonCard} />
            <Skeleton width="55%" height={22} style={styles.skeletonHeading} />
            <Skeleton width="100%" height={132} style={styles.skeletonCard} />
          </View>
        ) : error !== null && error !== undefined ? (
          <View style={styles.errorCard} accessibilityRole="alert">
            <Text variant="bodyStrong" color={colors.ink} maxFontSizeMultiplier={1.4}>
              Services unavailable
            </Text>
            <Text
              variant="caption"
              color={colors.textSecondary}
              align="center"
              maxFontSizeMultiplier={1.4}
            >
              {toUserMessage(error, 'load')}
            </Text>
            <Button
              title="Try again"
              variant="secondary"
              onPress={onRetry ?? (() => {})}
            />
          </View>
        ) : sections.length === 0 ? (
          <EmptyState
            title="No services available"
            description="Services will appear here."
            scrollable={false}
          />
        ) : (
          sections.map((section) => (
            <View key={section.id} style={styles.section}>
              <Text
                variant="title"
                color={colors.ink}
                accessibilityRole="header"
                maxFontSizeMultiplier={1.4}
              >
                {section.title}
              </Text>
              <GroupedList testID={`more-services-section-${section.id}`}>
                {section.items.map((item, index) => {
                  const isEnabled = enabledServices.has(item.id) && item.target !== null;
                  const a11yLabel = isEnabled
                    ? `${item.title}, ${item.subtitle}`
                    : `${item.title}, ${item.subtitle}, ${SERVICE_UNAVAILABLE_COPY}`;

                  return (
                    <React.Fragment key={item.id}>
                      {index > 0 ? <ListHairline /> : null}
                      <Pressable
                        onPress={() => handlePressItem(item, isEnabled)}
                        feedbackType="highlight"
                        accessibilityRole="button"
                        accessibilityLabel={a11yLabel}
                        style={[groupedListStyles.row, styles.row]}
                        testID={`more-service-row-${item.id}`}
                      >
                        <View
                          style={[
                            groupedListStyles.disc,
                            { backgroundColor: item.iconBg },
                          ]}
                        >
                          {item.renderIcon()}
                        </View>

                        <View style={styles.rowBody}>
                          <Text
                            variant="bodyStrong"
                            color={isEnabled ? colors.ink : colors.textSecondary}
                            style={styles.rowTitle}
                            maxFontSizeMultiplier={1.4}
                          >
                            {item.title}
                          </Text>

                          <Text
                            variant="caption"
                            color={colors.textSecondary}
                            numberOfLines={2}
                            maxFontSizeMultiplier={1.4}
                          >
                            {item.subtitle}
                          </Text>

                          {!isEnabled ? (
                            <Text
                              variant="caption"
                              color={colors.textMuted}
                              maxFontSizeMultiplier={1.4}
                            >
                              {SERVICE_UNAVAILABLE_COPY}
                            </Text>
                          ) : null}
                        </View>

                        {isEnabled ? (
                          <ChevronRight size={LIST_ICON_SIZE} color={colors.textMuted} />
                        ) : null}
                      </Pressable>
                    </React.Fragment>
                  );
                })}
              </GroupedList>
            </View>
          ))
        )}
      </View>
    </FeatureScreen>
  );
}

/**
 * Registered on Phase 9 stack routes whose screens are not yet in
 * `SERVICES_ENABLED`, guaranteeing no route in `RootStackParamList` is ever
 * broken if navigated to directly.
 */
export function UnavailableServiceScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <FeatureScreen title="More services">
      <View style={styles.content}>
        <EmptyState
          title={SERVICE_UNAVAILABLE_COPY}
          description="This service is not available yet."
          actionTitle="Go back"
          onAction={() => navigation.goBack()}
          scrollable={false}
        />
      </View>
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
  },
  offlineNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.tintOrange,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  offlineText: {
    flex: 1,
  },
  skeletonGroup: {
    gap: spacing.md,
  },
  skeletonHeading: {
    borderRadius: radius.sm,
  },
  skeletonCard: {
    borderRadius: radius.md,
  },
  errorCard: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  row: {
    alignItems: 'center',
  },
  rowBody: {
    flex: 1,
    gap: spacing.xs,
  },
  rowTitle: {
    flexShrink: 1,
  },
});
