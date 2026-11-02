import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { QrCode, ScanLine, Send } from 'lucide-react-native';
import {
  colors,
  spacing,
  radius,
  phpToCentavos,
  parseDavaoBankQRPayload,
  type AccountBalance,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { BottomSheet, Text } from '../components';
import { MyQRTab } from './qr/MyQRTab';
import { ScanQRTab } from './qr/ScanQRTab';
import { RequestMoneyTab } from './qr/RequestMoneyTab';

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
      const { error } = await supabase.rpc('create_payment_request', {
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
    <BottomSheet visible={visible} onClose={resetState} title="Davao Bank QR & Request">
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
          {tab === 'my_qr' && (
            <MyQRTab
              accounts={accounts}
              selectedAccountIndex={selectedAccountIndex}
              onSelectAccountIndex={setSelectedAccountIndex}
            />
          )}

          {tab === 'scan' && (
            <ScanQRTab
              permission={permission}
              onRequestPermission={requestPermission}
              torch={torch}
              onToggleTorch={() => setTorch((prev) => !prev)}
              scanned={scanned}
              scanError={scanError}
              onBarcodeScanned={handleBarcodeScanned}
              onManualFallback={() => {
                resetState();
                onManualTransferFallback();
              }}
            />
          )}

          {tab === 'request' && (
            <RequestMoneyTab
              reqSuccess={reqSuccess}
              reqPayerAccount={reqPayerAccount}
              onPayerAccountChange={(val) => {
                setReqPayerAccount(val);
                setReqError(null);
              }}
              reqAmountStr={reqAmountStr}
              onAmountChange={(val) => {
                setReqAmountStr(val);
                setReqError(null);
              }}
              reqNote={reqNote}
              onNoteChange={setReqNote}
              reqLoading={reqLoading}
              reqError={reqError}
              onSendRequest={handleSendRequest}
              onReset={resetState}
            />
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
});
