import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ScreenCapture from 'expo-screen-capture';
import * as SecureStore from 'expo-secure-store';
import { useReducedMotion } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  useFonts,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Home, Receipt, Bell, User } from 'lucide-react-native';
import type { Session } from '@supabase/supabase-js';
import { colors, spacing, fetchUserProfile, type Profile } from '@davao-bank/shared';
import { supabase } from './src/lib/supabase';
import { AppLockProvider } from './src/context/AppLockContext';
import { SettingsProvider } from './src/context/SettingsContext';
import { useUnreadNotificationCount } from './src/hooks/useUnreadNotificationCount';
import {
  Logo,
  Text,
  PrivacyOverlay,
  ToastProvider,
  FloatingTabBar,
} from './src/components';
import { HomeScreen } from './src/screens/HomeScreen';
import { ActivityScreen } from './src/screens/ActivityScreen';
import { InboxScreen } from './src/screens/InboxScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { SignUpScreen } from './src/screens/SignUpScreen';
import { VerifyEmailScreen } from './src/screens/VerifyEmailScreen';
import { ForgotPasswordScreen } from './src/screens/ForgotPasswordScreen';
import { SuspendedScreen } from './src/screens/SuspendedScreen';
import { CashOutScreen } from './src/screens/CashOutScreen';
import { AddMoneyScreen } from './src/screens/AddMoneyScreen';
import { ReceiptScreen } from './src/screens/ReceiptScreen';
import { PaymentRequestsScreen } from './src/screens/PaymentRequestsScreen';
import { TwoStepSetupScreen } from './src/screens/TwoStepSetupScreen';
import { AboutScreen } from './src/screens/AboutScreen';
import { PersonalDetailsScreen } from './src/screens/PersonalDetailsScreen';
import { ExportStatementScreen } from './src/screens/ExportStatementScreen';
import { FXRatesScreen } from './src/screens/FXRatesScreen';
import { ScheduledPaymentsScreen } from './src/screens/ScheduledPaymentsScreen';
import { SavedRecipientsScreen } from './src/screens/SavedRecipientsScreen';
import { ChangePasswordScreen } from './src/screens/ChangePasswordScreen';

import { TransferScreen } from './src/screens/TransferScreen';
import { PayBillsScreen } from './src/screens/PayBillsScreen';
import { QRHubScreen } from './src/screens/QRHubScreen';
import { OnboardingScreen, ONBOARDING_SEEN_KEY } from './src/screens/OnboardingScreen';

export type RootStackParamList = {
  Tabs: undefined;
  CashOut: undefined;
  Transfer:
    | {
        recipientAccount?: string;
        amountCentavos?: number;
        note?: string;
        recipientNickname?: string;
      }
    | undefined;
  PayBills: undefined;
  QRHub: { initialTab?: 'my' | 'scan' | 'request' } | undefined;
  AddMoney: undefined;
  TwoStepSetup: undefined;
  Receipt: { transactionId: string; accountId: string };
  PaymentRequests: { initialTab?: 'incoming' | 'outgoing' } | undefined;
  About: undefined;
  PersonalDetails: undefined;
  ExportStatement: undefined;
  FXRates: undefined;
  ScheduledPayments: undefined;
  SavedRecipients: undefined;
  ChangePassword: undefined;
};

export type BottomTabParamList = {
  HomeTab: undefined;
  ActivityTab: undefined;
  InboxTab: undefined;
  ProfileTab: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<BottomTabParamList>();

type AuthScreenState = 'login' | 'signup' | 'verify' | 'forgot';

export default function App() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  const [restoredSession, setRestoredSession] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authScreen, setAuthScreen] = useState<AuthScreenState>('login');
  const [targetEmail, setTargetEmail] = useState<string>('');
  // Verify email: true right after sign-up (an email was just sent), so the
  // Resend cooldown starts on arrival.
  const [verifyJustSent, setVerifyJustSent] = useState(false);
  const reduceMotion = useReducedMotion();
  const [onboardingSeen, setOnboardingSeen] = useState<boolean>(true);

  useEffect(() => {
    SecureStore.getItemAsync(ONBOARDING_SEEN_KEY)
      .then((val) => {
        if (val !== 'true') {
          setOnboardingSeen(false);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (Platform.OS === 'android') {
      ScreenCapture.preventScreenCaptureAsync().catch((err) => {
        console.warn('Failed to prevent screen capture on Android:', err);
      });
    }
  }, []);

  const loadProfile = useCallback(async (userId: string) => {
    try {
      let { data } = await fetchUserProfile(supabase, userId);
      if (!data) {
        // Self-heal: ensure profile exists (§0.7)
        const healRes = await supabase.rpc('ensure_my_profile');
        if (healRes.data && (healRes.data as any).profile) {
          data = (healRes.data as any).profile as Profile;
        } else {
          const refetch = await fetchUserProfile(supabase, userId);
          data = refetch.data;
        }
      }
      if (data) {
        setProfile(data);
      }
    } catch (err) {
      console.warn('Failed to fetch profile in App:', err);
    }
  }, []);

  useEffect(() => {
    // 1. Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setRestoredSession(Boolean(session));
      setSession(session);
      if (session?.user) {
        loadProfile(session.user.id);
      }
      setLoading(false);
    });

    // 2. Real-time auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Signed out: no email was just sent, so Resend must not start locked.
      if (event === 'SIGNED_OUT') setVerifyJustSent(false);
      setSession(session);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setRestoredSession(false);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Inbox badge: loads at start / sign-in and on returning to the foreground,
  // not only after Inbox is opened. Signing out resets it to 0.
  const { count: unreadCount, setCount: setUnreadCount } = useUnreadNotificationCount(
    session?.user?.id ?? null
  );

  const isAuthenticated = Boolean(session?.user);
  const isEmailVerified = Boolean(session?.user?.email_confirmed_at);
  const isSuspended = profile?.status === 'suspended';

  let content: React.ReactNode = null;

  // Loading / Splash Screen
  if (loading || !fontsLoaded) {
    content = (
      <View style={styles.loadingContainer}>
        <StatusBar style="dark" />
        <Logo variant="mark" size={56} />
        <Text variant="h1" color={colors.primary} style={styles.splashTitle}>
          Davao Bank
        </Text>
        <ActivityIndicator
          size="small"
          color={colors.primary}
          style={styles.splashLoader}
        />
      </View>
    );
  } else if (!isAuthenticated) {
    if (!onboardingSeen) {
      content = (
        <NavigationContainer>
          <StatusBar style="dark" />
          <OnboardingScreen onFinish={() => setOnboardingSeen(true)} />
        </NavigationContainer>
      );
    } else {
      content = (
        <NavigationContainer>
          <StatusBar style="dark" />
          {authScreen === 'login' && (
            <LoginScreen
              onNavigateToSignUp={() => setAuthScreen('signup')}
              onNavigateToForgotPassword={() => setAuthScreen('forgot')}
              onNavigateToVerifyEmail={(email) => {
                setTargetEmail(email);
                setVerifyJustSent(false);
                setAuthScreen('verify');
              }}
            />
          )}
          {authScreen === 'signup' && (
            <SignUpScreen
              onNavigateToLogin={() => setAuthScreen('login')}
              onSignUpSuccess={(email) => {
                setTargetEmail(email);
                setVerifyJustSent(true);
                setAuthScreen('verify');
              }}
            />
          )}
          {authScreen === 'verify' && (
            <VerifyEmailScreen
              email={targetEmail || session?.user?.email || ''}
              justSent={verifyJustSent}
              onNavigateToLogin={() => {
                setVerifyJustSent(false);
                setAuthScreen('login');
              }}
            />
          )}
          {authScreen === 'forgot' && (
            <ForgotPasswordScreen onNavigateToLogin={() => setAuthScreen('login')} />
          )}
        </NavigationContainer>
      );
    }
  } else if (!isEmailVerified) {
    content = (
      <NavigationContainer>
        <StatusBar style="dark" />
        <VerifyEmailScreen
          email={session?.user?.email || targetEmail}
          justSent={verifyJustSent}
          onNavigateToLogin={async () => {
            await supabase.auth.signOut();
            setVerifyJustSent(false);
            setAuthScreen('login');
          }}
        />
      </NavigationContainer>
    );
  } else if (isSuspended) {
    content = (
      <NavigationContainer>
        <StatusBar style="dark" />
        <SuspendedScreen
          profile={profile}
          userEmail={session?.user?.email || null}
          onRefresh={() => session?.user && loadProfile(session.user.id)}
          onSignOut={() => {
            setSession(null);
            setProfile(null);
            setAuthScreen('login');
          }}
        />
      </NavigationContainer>
    );
  } else {
    content = (
      <AppLockProvider key={session?.user.id} restoredSession={restoredSession}>
        <SettingsProvider>
          <NavigationContainer>
            <StatusBar style="dark" />
            <RootStack.Navigator
              screenOptions={{
                headerShown: false,
                presentation: 'card',
                animation: reduceMotion ? 'fade' : 'slide_from_right',
              }}
            >
              <RootStack.Screen name="Tabs">
                {() => (
                  <Tab.Navigator
                    tabBar={(props) => <FloatingTabBar {...props} />}
                    screenOptions={{
                      headerShown: false,
                      animation: reduceMotion ? 'none' : 'fade',
                    }}
                  >
                    <Tab.Screen
                      name="HomeTab"
                      options={{
                        tabBarLabel: 'Home',
                        tabBarIcon: ({ color, size }) => (
                          <Home size={size} color={color} />
                        ),
                      }}
                    >
                      {({ navigation }) => (
                        <HomeScreen
                          onNavigateToActivity={() => navigation.navigate('ActivityTab')}
                          onNavigateToProfile={() => navigation.navigate('ProfileTab')}
                        />
                      )}
                    </Tab.Screen>

                    <Tab.Screen
                      name="ActivityTab"
                      component={ActivityScreen}
                      options={{
                        tabBarLabel: 'Activity',
                        tabBarIcon: ({ color, size }) => (
                          <Receipt size={size} color={color} />
                        ),
                      }}
                    />

                    <Tab.Screen
                      name="InboxTab"
                      options={{
                        tabBarLabel: 'Inbox',
                        tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
                        tabBarIcon: ({ color, size }) => (
                          <Bell size={size} color={color} />
                        ),
                      }}
                    >
                      {() => <InboxScreen onUnreadCountChange={setUnreadCount} />}
                    </Tab.Screen>

                    <Tab.Screen
                      name="ProfileTab"
                      options={{
                        tabBarLabel: 'Profile',
                        tabBarIcon: ({ color, size }) => (
                          <User size={size} color={color} />
                        ),
                      }}
                    >
                      {() => (
                        <ProfileScreen
                          profile={profile}
                          userEmail={session?.user?.email || null}
                          onProfileUpdated={(updated) => setProfile(updated)}
                          onSignOut={() => {
                            setSession(null);
                            setProfile(null);
                            setAuthScreen('login');
                          }}
                        />
                      )}
                    </Tab.Screen>
                  </Tab.Navigator>
                )}
              </RootStack.Screen>

              <RootStack.Screen
                name="CashOut"
                component={CashOutScreen}
                options={{
                  presentation: 'card',
                  animation: 'slide_from_right',
                }}
              />
              <RootStack.Screen
                name="AddMoney"
                component={AddMoneyScreen}
                options={{
                  presentation: 'card',
                  animation: 'slide_from_right',
                }}
              />
              <RootStack.Screen
                name="TwoStepSetup"
                component={TwoStepSetupScreen}
                options={{
                  presentation: 'card',
                  animation: 'slide_from_right',
                }}
              />
              <RootStack.Screen
                name="Receipt"
                component={ReceiptScreen}
                options={{ presentation: 'card', animation: 'slide_from_right' }}
              />
              <RootStack.Screen
                name="PaymentRequests"
                component={PaymentRequestsScreen}
                options={{ presentation: 'card', animation: 'slide_from_right' }}
              />
              <RootStack.Screen
                name="About"
                component={AboutScreen}
                options={{ presentation: 'card', animation: 'slide_from_right' }}
              />
              <RootStack.Screen
                name="PersonalDetails"
                component={PersonalDetailsScreen}
                options={{ presentation: 'card', animation: 'slide_from_right' }}
              />
              <RootStack.Screen
                name="ExportStatement"
                component={ExportStatementScreen}
                options={{ presentation: 'card', animation: 'slide_from_right' }}
              />
              <RootStack.Screen
                name="FXRates"
                component={FXRatesScreen}
                options={{ presentation: 'card', animation: 'slide_from_right' }}
              />
              <RootStack.Screen
                name="Transfer"
                component={TransferScreen}
                options={{ presentation: 'card', animation: 'slide_from_right' }}
              />
              <RootStack.Screen
                name="PayBills"
                component={PayBillsScreen}
                options={{ presentation: 'card', animation: 'slide_from_right' }}
              />
              <RootStack.Screen
                name="QRHub"
                component={QRHubScreen}
                options={{ presentation: 'card', animation: 'slide_from_right' }}
              />
              <RootStack.Screen
                name="ScheduledPayments"
                component={ScheduledPaymentsScreen}
                options={{ presentation: 'card', animation: 'slide_from_right' }}
              />
              <RootStack.Screen
                name="SavedRecipients"
                component={SavedRecipientsScreen}
                options={{ presentation: 'card', animation: 'slide_from_right' }}
              />
              <RootStack.Screen
                name="ChangePassword"
                component={ChangePasswordScreen}
                options={{ presentation: 'card', animation: 'slide_from_right' }}
              />
            </RootStack.Navigator>
          </NavigationContainer>

          <PrivacyOverlay />
        </SettingsProvider>
      </AppLockProvider>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ToastProvider>{content}</ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashTitle: {
    marginTop: spacing.md,
  },
  splashLoader: {
    marginTop: spacing.xl,
  },
  privacyOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999999,
  },
  privacyTitle: {
    marginTop: spacing.md,
    color: colors.primary,
  },
  privacySubtitle: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
  },
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: 64,
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
  },
  tabBarLabel: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  badgeStyle: {
    backgroundColor: colors.red,
    fontSize: 10,
    fontWeight: '700',
  },
});
