import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { CameraView, type PermissionResponse } from 'expo-camera';
import { AlertCircle, Flashlight, FlashlightOff } from 'lucide-react-native';
import { colors, radius, spacing } from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { Button } from '../../components/Button';

interface ScanQRTabProps {
  permission: PermissionResponse | null;
  onRequestPermission: () => Promise<PermissionResponse>;
  torch: boolean;
  onToggleTorch: () => void;
  scanned: boolean;
  scanError: string | null;
  onBarcodeScanned: (event: { data: string }) => void;
  onManualFallback: () => void;
}

export function ScanQRTab({
  permission,
  onRequestPermission,
  torch,
  onToggleTorch,
  scanned,
  scanError,
  onBarcodeScanned,
  onManualFallback,
}: ScanQRTabProps) {
  if (!permission) {
    return (
      <View style={styles.permissionBox}>
        <Text variant="body">Checking camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionBox}>
        <AlertCircle size={40} color={colors.primary} />
        <Text variant="title" color={colors.ink} style={styles.permTitle}>
          Camera Access Needed
        </Text>
        <Text variant="body" color={colors.textSecondary} style={styles.permDesc}>
          Camera permission is required to scan Davao Bank QR codes for instant transfers
          and bill payments.
        </Text>

        <Button
          title="Grant Camera Access"
          variant="primary"
          onPress={onRequestPermission}
          style={styles.permButton}
        />

        <Button
          title="Type account number instead"
          variant="ghost"
          onPress={onManualFallback}
        />
      </View>
    );
  }

  return (
    <View style={styles.cameraBox}>
      <CameraView
        style={styles.camera}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={scanned ? undefined : onBarcodeScanned}
      >
        <View style={styles.cameraOverlay}>
          <View style={styles.scannerTarget} />

          {scanError && (
            <View style={styles.scanErrorBanner}>
              <AlertCircle size={16} color={colors.textInverse} />
              <Text variant="bodyStrong" color={colors.textInverse} style={{ flex: 1 }}>
                {scanError}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.torchToggle, torch && styles.torchToggleActive]}
            onPress={onToggleTorch}
            activeOpacity={0.8}
          >
            {torch ? (
              <FlashlightOff size={22} color={colors.textInverse} />
            ) : (
              <Flashlight size={22} color={colors.textInverse} />
            )}
          </TouchableOpacity>
        </View>
      </CameraView>

      <View style={styles.cameraFooter}>
        <Text variant="caption" color={colors.textSecondary}>
          Align the Davao Bank QR code within the frame to scan.
        </Text>
        <Button
          title="Type account number instead"
          variant="ghost"
          onPress={onManualFallback}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  permissionBox: {
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  permTitle: {
    textAlign: 'center',
  },
  permDesc: {
    textAlign: 'center',
    lineHeight: 20,
  },
  permButton: {
    width: '100%',
    marginTop: spacing.sm,
  },
  cameraBox: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camera: {
    height: 320,
    width: '100%',
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerTarget: {
    width: 200,
    height: 200,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.primaryTint,
    backgroundColor: 'transparent',
  },
  scanErrorBanner: {
    position: 'absolute',
    top: spacing.base,
    left: spacing.base,
    right: spacing.base,
    backgroundColor: colors.error,
    padding: spacing.sm,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  torchToggle: {
    position: 'absolute',
    bottom: spacing.base,
    right: spacing.base,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: spacing.sm,
    borderRadius: radius.pill,
  },
  torchToggleActive: {
    backgroundColor: colors.primary,
  },
  cameraFooter: {
    padding: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
});
