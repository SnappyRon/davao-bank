import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import {
  QrCode,
  ScanLine,
  Send,
  Flashlight,
  FlashlightOff,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
} from 'lucide-react-native';
import {
  colors,
  spacing,
  radius,
  formatCentavosToPHP,
  phpToCentavos,
  generateDavaoBankQRPayload,
  parseDavaoBankQRPayload,
  type AccountBalance,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import {
  BottomSheet,
  Text,
  Button,
  TextField,
  AmountInput,
  Card,
  Badge,
} from '../components';

interface QRHubModalProps {
  visible: boolean;
  onClose: () => void;
  accounts: AccountBalance[];
  onScanResult: (result: {
    accountNumber: string;
    amountCentavos?: number;
    note?: string;
  }) => void;
  onManualTransferFallback: () => void;
  onRequestSent?: () => void;
}

type QRTab = 'my_qr' | 'scan' | 'request';

export function QRHubModal({
  visible,
  onClose,
  accounts,
  onScanResult,
  onManualTransferFallback,
  onRequestSent,
}: QRHubModalProps) {
  const [tab, setTab] = useState<QRTab>('my_qr');

  // My QR state
  const [selectedAccountIndex, setSelectedAccountIndex] = useState(0);
  const [customAmountStr, setCustomAmountStr] = useState('');
  const [customNote, setCustomNote] = useState('');
  const [showOptions, setShowOptions] = useState(false);

  // Scan state
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Request Money state
  const [reqPayerAccount, setReqPayerAccount] = useState('');
  const [reqAmountStr, setReqAmountStr] = useState('');
  const [reqNote, setReqNote] = useState('');
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError] = useState<string | null>(null);
  const [reqSuccess, setReqSuccess] = useState(false);

  const selectedAccount = accounts[selectedAccountIndex] || accounts[0];

  const resetState = () => {
    setScanned(false);
    setScanError(null);
    setTorch(false);
    setReqPayerAccount('');
    setReqAmountStr('');
    setReqNote('');
    setReqError(null);
    setReqSuccess(false);
    onClose();
  };

  // Generate QR string for selected account
  const qrPayload = selectedAccount
    ? generateDavaoBankQRPayload({
        accountNumber: selectedAccount.account_number,
        amountCentavos:
          customAmountStr && phpToCentavos(customAmountStr) > 0
            ? phpToCentavos(customAmountStr)
            : undefined,
        note: customNote.trim() || undefined,
      })
    : '';

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;

    const parsed = parseDavaoBankQRPayload(data);
    if (!parsed.valid || !parsed.accountNumber) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {
        // Haptics optional
      }
      setScanError(parsed.error || "This isn't a Davao Bank QR code");
      setScanned(true);
      setTimeout(() => {
        setScanned(false);
        setScanError(null);
      }, 2500);
      return;
    }

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Haptics optional
    }

    setScanned(true);
    resetState();
    onScanResult({
      accountNumber: parsed.accountNumber,
      amountCentavos: parsed.amountCentavos,
      note: parsed.note,
    });
  };

  const handleSendRequest = async () => {
    const cleanPayer = reqPayerAccount.trim();
    if (!/^[0-9]{10}$/.test(cleanPayer)) {
      setReqError('Enter a valid 10-digit Davao Bank account number');
      return;
    }

    const centavos = phpToCentavos(reqAmountStr);
    if (centavos <= 0) {
      setReqError('Enter a valid amount greater than zero');
      return;
    }

    if (!selectedAccount) {
      setReqError('Select an active receiving account');
      return;
    }

    setReqLoading(true);
    setReqError(null);

    try {
      const { data, error } = await supabase.rpc('create_payment_request', {
        p_requester_account: selectedAccount.account_id,
        p_payer_account_number: cleanPayer,
        p_amount: centavos,
        p_note: reqNote.trim() || null,
      });

      setReqLoading(false);

      if (error) {
        setReqError(error.message);
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch {
          // Ignore
        }
      } else {
        setReqSuccess(true);
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
          // Ignore
        }
        if (onRequestSent) onRequestSent();
      }
    } catch (err: any) {
      setReqLoading(false);
      setReqError(err?.message || 'Failed to send payment request');
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={resetState}
      title="Davao Bank QR & Request"
    >
      <View style={styles.container}>
        {/* Navigation Tabs */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabItem, tab === 'my_qr' && styles.tabItemActive]}
            onPress={() => {
              setTab('my_qr');
              setScanError(null);
            }}
            activeOpacity={0.7}
          >
            <QrCode
              size={18}
              color={tab === 'my_qr' ? colors.primary : colors.textSecondary}
            />
            <Text
              variant="bodyStrong"
              color={tab === 'my_qr' ? colors.primary : colors.textSecondary}
            >
              My QR
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, tab === 'scan' && styles.tabItemActive]}
            onPress={() => {
              setTab('scan');
              setScanned(false);
              setScanError(null);
            }}
            activeOpacity={0.7}
          >
            <ScanLine
              size={18}
              color={tab === 'scan' ? colors.primary : colors.textSecondary}
            />
            <Text
              variant="bodyStrong"
              color={tab === 'scan' ? colors.primary : colors.textSecondary}
            >
              Scan
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, tab === 'request' && styles.tabItemActive]}
            onPress={() => {
              setTab('request');
              setScanError(null);
            }}
            activeOpacity={0.7}
          >
            <Send
              size={18}
              color={tab === 'request' ? colors.primary : colors.textSecondary}
            />
            <Text
              variant="bodyStrong"
              color={tab === 'request' ? colors.primary : colors.textSecondary}
            >
              Request
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.tabContent}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollInner}
        >
          {/* TAB 1: MY QR */}
          {tab === 'my_qr' && (
            <View style={styles.myQrContainer}>
              {/* Account Selector Chips if user has multiple accounts */}
              {accounts.length > 1 && (
                <View style={styles.accountSelector}>
                  <Text variant="caption" color={colors.textSecondary}>
                    Select receiving account:
                  </Text>
                  <View style={styles.accountPills}>
                    {accounts.map((acc, index) => (
                      <TouchableOpacity
                        key={acc.account_id}
                        onPress={() => setSelectedAccountIndex(index)}
                        style={[
                          styles.accountPill,
                          selectedAccountIndex === index && styles.accountPillActive,
                        ]}
                      >
                        <Text
                          variant="caption"
                          color={
                            selectedAccountIndex === index
                              ? colors.textInverse
                              : colors.ink
                          }
                          style={{ fontWeight: '700' }}
                        >
                          {acc.type.toUpperCase()} ({acc.account_number.slice(-4)})
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* QR Code Canvas Card */}
              <View style={styles.qrCard}>
                {selectedAccount && qrPayload ? (
                  <View style={styles.qrWrapper}>
                    <QRCode
                      value={qrPayload}
                      size={200}
                      color={colors.primary}
                      backgroundColor={colors.surface}
                    />
                  </View>
                ) : (
                  <Text variant="body" color={colors.textSecondary}>
                    No active account available
                  </Text>
                )}

                <View style={styles.qrDetails}>
                  <Text variant="caption" color={colors.textSecondary}>
                    ACCOUNT NUMBER
                  </Text>
                  <Text variant="h2" color={colors.ink} tabularNums>
                    {selectedAccount?.account_number || '—'}
                  </Text>
                  {customAmountStr ? (
                    <Text variant="bodyStrong" color={colors.primary}>
                      {formatCentavosToPHP(phpToCentavos(customAmountStr))}
                    </Text>
                  ) : null}
                  {customNote ? (
                    <Text variant="caption" color={colors.textSecondary}>
                      "{customNote}"
                    </Text>
                  ) : null}
                </View>

                <View style={styles.davaoNotice}>
                  <Badge label="Davao Bank users only" variant="neutral" />
                </View>
              </View>

              {/* Set Amount & Note Toggle */}
              <TouchableOpacity
                onPress={() => setShowOptions((prev) => !prev)}
                style={styles.optionsToggle}
                activeOpacity={0.7}
              >
                <Text variant="bodyStrong" color={colors.primary}>
                  {showOptions ? 'Hide custom amount & note' : '+ Add custom amount or note'}
                </Text>
              </TouchableOpacity>

              {showOptions && (
                <View style={styles.optionsForm}>
                  <AmountInput
                    label="Requested Amount (Optional)"
                    value={customAmountStr}
                    onChangeText={setCustomAmountStr}
                  />
                  <TextField
                    label="Payment Note (Optional)"
                    value={customNote}
                    onChangeText={setCustomNote}
                    placeholder="e.g. Lunch split, Fruit box"
                    maxLength={60}
                  />
                </View>
              )}
            </View>
          )}

          {/* TAB 2: SCAN QR */}
          {tab === 'scan' && (
            <View style={styles.scanContainer}>
              {!permission ? (
                <View style={styles.permissionBox}>
                  <Text variant="body">Checking camera permission...</Text>
                </View>
              ) : !permission.granted ? (
                <View style={styles.permissionBox}>
                  <AlertCircle size={40} color={colors.primary} />
                  <Text variant="title" color={colors.ink} style={styles.permTitle}>
                    Camera Access Needed
                  </Text>
                  <Text
                    variant="body"
                    color={colors.textSecondary}
                    style={styles.permDesc}
                  >
                    Camera permission is required to scan Davao Bank QR codes for instant transfers and bill payments.
                  </Text>

                  <Button
                    title="Grant Camera Access"
                    variant="primary"
                    onPress={requestPermission}
                    style={styles.permButton}
                  />

                  <Button
                    title="Type account number instead"
                    variant="ghost"
                    onPress={() => {
                      resetState();
                      onManualTransferFallback();
                    }}
                  />
                </View>
              ) : (
                <View style={styles.cameraBox}>
                  <CameraView
                    style={styles.camera}
                    facing="back"
                    enableTorch={torch}
                    barcodeScannerSettings={{
                      barcodeTypes: ['qr'],
                    }}
                    onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                  >
                    <View style={styles.cameraOverlay}>
                      <View style={styles.scannerTarget} />

                      {scanError && (
                        <View style={styles.scanErrorBanner}>
                          <AlertCircle size={16} color={colors.textInverse} />
                          <Text
                            variant="bodyStrong"
                            color={colors.textInverse}
                            style={{ flex: 1 }}
                          >
                            {scanError}
                          </Text>
                        </View>
                      )}

                      <TouchableOpacity
                        style={[
                          styles.torchToggle,
                          torch && styles.torchToggleActive,
                        ]}
                        onPress={() => setTorch((prev) => !prev)}
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
                      onPress={() => {
                        resetState();
                        onManualTransferFallback();
                      }}
                    />
                  </View>
                </View>
              )}
            </View>
          )}

          {/* TAB 3: REQUEST MONEY */}
          {tab === 'request' && (
            <View style={styles.requestContainer}>
              {reqSuccess ? (
                <View style={styles.reqSuccessBox}>
                  <CheckCircle2 size={54} color={colors.primary} />
                  <Text variant="h2" color={colors.primary} style={styles.successTitle}>
                    Request Sent!
                  </Text>
                  <Text
                    variant="body"
                    color={colors.textSecondary}
                    style={styles.successDesc}
                  >
                    Your payment request of{' '}
                    <Text variant="bodyStrong" color={colors.ink}>
                      {formatCentavosToPHP(phpToCentavos(reqAmountStr))}
                    </Text>{' '}
                    was sent to account {reqPayerAccount}. You will receive a notification as soon as they authorize the transfer.
                  </Text>

                  <Button
                    title="Done"
                    variant="primary"
                    onPress={resetState}
                    style={{ marginTop: spacing.md }}
                  />
                </View>
              ) : (
                <View style={styles.requestForm}>
                  <Text variant="body" color={colors.textSecondary}>
                    Send a formal payment request to another Davao Bank customer. They can review and authorize it with biometrics.
                  </Text>

                  {reqError && (
                    <View style={styles.errorBox}>
                      <AlertCircle size={16} color={colors.error} />
                      <Text variant="caption" color={colors.error} style={{ flex: 1 }}>
                        {reqError}
                      </Text>
                    </View>
                  )}

                  <TextField
                    label="Payer Account Number"
                    value={reqPayerAccount}
                    onChangeText={(val) => {
                      setReqPayerAccount(val);
                      setReqError(null);
                    }}
                    placeholder="e.g. 1020441785"
                    keyboardType="number-pad"
                    maxLength={10}
                  />

                  <AmountInput
                    label="Amount to Request"
                    value={reqAmountStr}
                    onChangeText={(val) => {
                      setReqAmountStr(val);
                      setReqError(null);
                    }}
                  />

                  <TextField
                    label="Reason / Note (Optional, max 60 chars)"
                    value={reqNote}
                    onChangeText={setReqNote}
                    placeholder="e.g. Dinner bill share, Durian delivery"
                    maxLength={60}
                  />

                  <View style={styles.reqNotice}>
                    <Text variant="caption" color={colors.textMuted}>
                      Privacy guarantee: Neither your full name nor the payer's name is revealed in notifications. Account numbers only.
                    </Text>
                  </View>

                  <Button
                    title="Send Payment Request"
                    variant="primary"
                    loading={reqLoading}
                    onPress={handleSendRequest}
                    disabled={
                      reqLoading ||
                      !/^[0-9]{10}$/.test(reqPayerAccount.trim()) ||
                      phpToCentavos(reqAmountStr) <= 0
                    }
                  />
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing['2xl'],
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.xs,
    marginBottom: spacing.base,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  tabItemActive: {
    backgroundColor: colors.surface,
    elevation: 1,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tabContent: {
    maxHeight: 520,
  },
  scrollInner: {
    paddingBottom: spacing.base,
  },
  myQrContainer: {
    alignItems: 'center',
    gap: spacing.base,
  },
  accountSelector: {
    width: '100%',
    gap: spacing.xs,
  },
  accountPills: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  accountPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accountPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  qrCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  qrWrapper: {
    padding: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  qrDetails: {
    marginTop: spacing.base,
    alignItems: 'center',
    gap: spacing.xs,
  },
  davaoNotice: {
    marginTop: spacing.md,
  },
  optionsToggle: {
    paddingVertical: spacing.xs,
  },
  optionsForm: {
    width: '100%',
    gap: spacing.base,
    padding: spacing.base,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
  },
  scanContainer: {
    minHeight: 380,
    justifyContent: 'center',
  },
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
  requestContainer: {
    gap: spacing.base,
  },
  requestForm: {
    gap: spacing.base,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.errorLight,
    borderWidth: 1,
    borderColor: colors.error,
  },
  reqNotice: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSubtle,
  },
  reqSuccessBox: {
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  successTitle: {
    fontWeight: '800',
  },
  successDesc: {
    textAlign: 'center',
    lineHeight: 22,
  },
});
