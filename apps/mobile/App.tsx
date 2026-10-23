import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  useFonts,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Home, Receipt, Bell, User } from 'lucide-react-native';
import type { Session } from '@supabase/supabase-js';
import {
  colors,
  radius,
  spacing,
  fetchUserProfile,
  type Profile,
} from '@davao-bank/shared';
import { supabase } from './src/lib/supabase';
import { Logo, Text } from './src/components';
import { HomeScreen } from './src/screens/HomeScreen';
import { ActivityScreen } from './src/screens/ActivityScreen';
import { InboxScreen } from './src/screens/InboxScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { SignUpScreen } from './src/screens/SignUpScreen';
import { VerifyEmailScreen } from './src/screens/VerifyEmailScreen';
import { ForgotPasswordScreen } from './src/screens/ForgotPasswordScreen';
import { SuspendedScreen } from './src/screens/SuspendedScreen';

export type BottomTabParamList = {
  HomeTab: undefined;
  ActivityTab: undefined;
  InboxTab: undefined;
  ProfileTab: undefined;
};

const Tab = createBottomTabNavigator<BottomTabParamList>();

type AuthScreenState = 'login' | 'signup' | 'verify' | 'forgot';

export default function App() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authScreen, setAuthScreen] = useState<AuthScreenState>('login');
  const [targetEmail, setTargetEmail] = useState<string>('');
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await fetchUserProfile(supabase, userId);
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
      setSession(session);
      if (session?.user) {
        loadProfile(session.user.id);
      }
      setLoading(false);
    });

    // 2. Real-time auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Loading / Splash Screen
  if (loading || !fontsLoaded) {
    return (
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
  }

  // Auth Gating Rule (Proposal §A.4):
  // 1. Not signed in -> Auth screens
  // 2. Email not verified -> Verify screen
  // 3. Suspended -> Suspended screen
  // 4. Otherwise -> 4-Tab Main Navigation

  const isAuthenticated = Boolean(session?.user);
  const isEmailVerified = Boolean(session?.user?.email_confirmed_at);
  const isSuspended = profile?.status === 'suspended';

  if (!isAuthenticated) {
    return (
      <NavigationContainer>
        <StatusBar style="dark" />
        {authScreen === 'login' && (
          <LoginScreen
            onNavigateToSignUp={() => setAuthScreen('signup')}
            onNavigateToForgotPassword={() => setAuthScreen('forgot')}
            onNavigateToVerifyEmail={(email) => {
              setTargetEmail(email);
              setAuthScreen('verify');
            }}
          />
        )}
        {authScreen === 'signup' && (
          <SignUpScreen
            onNavigateToLogin={() => setAuthScreen('login')}
            onSignUpSuccess={(email) => {
              setTargetEmail(email);
              setAuthScreen('verify');
            }}
          />
        )}
        {authScreen === 'verify' && (
          <VerifyEmailScreen
            email={targetEmail || session?.user?.email || ''}
            onNavigateToLogin={() => setAuthScreen('login')}
          />
        )}
        {authScreen === 'forgot' && (
          <ForgotPasswordScreen onNavigateToLogin={() => setAuthScreen('login')} />
        )}
      </NavigationContainer>
    );
  }

  if (!isEmailVerified) {
    return (
      <NavigationContainer>
        <StatusBar style="dark" />
        <VerifyEmailScreen
          email={session?.user?.email || targetEmail}
          onNavigateToLogin={async () => {
            await supabase.auth.signOut();
            setAuthScreen('login');
          }}
        />
      </NavigationContainer>
    );
  }

  if (isSuspended) {
    return (
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
  }

  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: styles.tabBarLabel,
        }}
      >
        <Tab.Screen
          name="HomeTab"
          options={{
            tabBarLabel: 'Home',
            tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
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
            tabBarIcon: ({ color, size }) => <Receipt size={size} color={color} />,
          }}
        />

        <Tab.Screen
          name="InboxTab"
          options={{
            tabBarLabel: 'Inbox',
            tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
            tabBarBadgeStyle: styles.badgeStyle,
            tabBarIcon: ({ color, size }) => <Bell size={size} color={color} />,
          }}
        >
          {() => <InboxScreen onUnreadCountChange={setUnreadCount} />}
        </Tab.Screen>

        <Tab.Screen
          name="ProfileTab"
          options={{
            tabBarLabel: 'Profile',
            tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
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
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
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
    fontWeight: '600',
  },
  badgeStyle: {
    backgroundColor: colors.red,
    fontSize: 10,
    fontWeight: '700',
  },
});
