import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { Session } from '@supabase/supabase-js';
import { colors } from '@davao-bank/shared';
import { supabase } from './src/lib/supabase';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { SignUpScreen } from './src/screens/SignUpScreen';
import { VerifyEmailScreen } from './src/screens/VerifyEmailScreen';
import { ForgotPasswordScreen } from './src/screens/ForgotPasswordScreen';

export type RootStackParamList = {
  Home: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

type AuthScreenState = 'login' | 'signup' | 'verify' | 'forgot';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authScreen, setAuthScreen] = useState<AuthScreenState>('login');
  const [targetEmail, setTargetEmail] = useState<string>('');

  useEffect(() => {
    // 1. Initial session check from persistent storage
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // 2. Real-time auth state listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Show splash while restoring session from AsyncStorage
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" />
        <View style={styles.splashBadge}>
          <Text style={styles.splashBadgeText}>DB</Text>
        </View>
        <Text style={styles.splashTitle}>Davao Bank</Text>
        <ActivityIndicator
          size="small"
          color={colors.primary}
          style={styles.splashLoader}
        />
      </View>
    );
  }

  // Navigation Gating: Check authenticated session & verified email
  const isAuthenticated = Boolean(session?.user);
  const isEmailVerified = Boolean(session?.user?.email_confirmed_at);

  if (isAuthenticated && isEmailVerified) {
    return (
      <NavigationContainer>
        <StatusBar style="light" />
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle: {
              backgroundColor: colors.primary,
            },
            headerTintColor: colors.textInverse,
            headerTitleStyle: {
              fontWeight: '700',
            },
            contentStyle: {
              backgroundColor: colors.background,
            },
          }}
        >
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{
              title: 'Davao Bank',
              headerShown: false,
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  // Unauthenticated / Unverified Auth Flow
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

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashBadge: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  splashBadgeText: {
    color: colors.textInverse,
    fontSize: 26,
    fontWeight: '800',
  },
  splashTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -0.5,
  },
  splashLoader: {
    marginTop: 20,
  },
});
