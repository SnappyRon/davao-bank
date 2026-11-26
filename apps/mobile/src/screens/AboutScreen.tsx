import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { Info, ShieldCheck } from 'lucide-react-native';
import { colors, spacing, radius } from '@davao-bank/shared';
import { FeatureScreen, Text, Card, Logo, Button } from '../components';

export function AboutScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <FeatureScreen title="About Davao Bank" contentContainerStyle={styles.container}>
      <View style={styles.logoContainer}>
        <Logo variant="horizontal" size={44} />
        <Text variant="caption" color={colors.textMuted} style={styles.versionText}>
          Version 1.0.0
        </Text>
      </View>

      <Card variant="subtle" style={styles.card}>
        <View style={styles.cardHeader}>
          <ShieldCheck size={20} color={colors.primary} />
          <Text variant="title" color={colors.ink}>
            Simulated prototype
          </Text>
        </View>
        <Text variant="body" color={colors.textSecondary}>
          Davao Bank is a simulated prototype for academic use. It is not a licensed bank
          and holds no real money.
        </Text>
      </Card>

      <Card variant="subtle" style={styles.card}>
        <View style={styles.cardHeader}>
          <Info size={20} color={colors.blueText} />
          <Text variant="title" color={colors.ink}>
            Brand & license
          </Text>
        </View>
        <Text variant="body" color={colors.textSecondary}>
          Davao Bank emblem inspired by Mount Apo. Simulated prototype for academic
          demonstration.
        </Text>
        <Text variant="caption" color={colors.textMuted} style={styles.subtext}>
          Colors inspired by Mount Apo deep green, Kadayawan flora, and Davao cultural
          heritage.
        </Text>
      </Card>

      <Button
        title="Done"
        variant="secondary"
        onPress={() => navigation.goBack()}
        style={styles.doneButton}
      />
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.xl,
    gap: spacing.base,
  },
  logoContainer: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  versionText: {
    marginTop: spacing.xs,
  },
  card: {
    padding: spacing.base,
    borderRadius: radius.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  subtext: {
    marginTop: spacing.xs,
  },
  doneButton: {
    marginTop: spacing.sm,
    width: '100%',
  },
});
