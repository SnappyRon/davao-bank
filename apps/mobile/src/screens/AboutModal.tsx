import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Info, ShieldCheck } from 'lucide-react-native';
import { colors, spacing, radius } from '@davao-bank/shared';
import { BottomSheet, Text, Card, Logo, Button } from '../components';

interface AboutModalProps {
  visible: boolean;
  onClose: () => void;
}

export function AboutModal({ visible, onClose }: AboutModalProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="About Davao Bank">
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.logoContainer}>
          <Logo variant="horizontal" size={44} />
          <Text variant="caption" color={colors.textMuted} style={styles.versionText}>
            Version 1.0.0 · Phase 5 Build
          </Text>
        </View>

        <Card variant="subtle" style={styles.card}>
          <View style={styles.cardHeader}>
            <ShieldCheck size={20} color={colors.primary} />
            <Text variant="title" color={colors.ink}>
              Simulated Prototype
            </Text>
          </View>
          <Text variant="body" color={colors.textSecondary} style={styles.cardBody}>
            Davao Bank is a simulated prototype for academic use. It is not a licensed
            bank and holds no real money.
          </Text>
        </Card>

        <Card variant="subtle" style={styles.card}>
          <View style={styles.cardHeader}>
            <Info size={20} color={colors.blueText} />
            <Text variant="title" color={colors.ink}>
              Brand & License
            </Text>
          </View>
          <Text variant="body" color={colors.textSecondary} style={styles.cardBody}>
            Kadayawan logo used with permission of the Davao City Tourism Operations
            Office.
          </Text>
          <Text variant="caption" color={colors.textMuted} style={styles.subtext}>
            Colors inspired by Mount Apo deep green, Kadayawan flora, and Davao cultural
            heritage.
          </Text>
        </Card>

        <Button
          title="Done"
          variant="secondary"
          onPress={onClose}
          style={styles.doneButton}
        />
      </ScrollView>
    </BottomSheet>
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
  cardBody: {
    lineHeight: 22,
  },
  subtext: {
    marginTop: spacing.xs,
  },
  doneButton: {
    marginTop: spacing.sm,
    width: '100%',
  },
});
