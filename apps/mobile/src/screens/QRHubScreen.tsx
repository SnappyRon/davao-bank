import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { useFeatureAccounts } from '../hooks/useFeatureAccounts';
import { AccountLoadStatus } from '../components/AccountLoadStatus';
import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { QrCode, ScanLine, Send } from 'lucide-react-native';
import {
  colors,
  spacing,
  radius,
  elevation,
  phpToCentavos,
  parseDavaoBankQRPayload,
  toUserMessage,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { FeatureScreen, Text, Pressable, ResultView } from '../components';
import { useSettings } from '../context/SettingsContext';
import {
  isConfirmedRejection,
  resultRows,
  type ResultResponse,
} from '../utils/resultReceipt';
import { MyQRTab } from './qr/MyQRTab';
import { ScanQRTab } from './qr/ScanQRTab';
import { RequestMoneyTab } from './qr/RequestMoneyTab';

type QRTab = 'my_qr' | 'scan' | 'request';

export function QRHubScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const onClose = () => navigation.goBack();
  const { accounts, accountsLoading, accountError, loadAccounts } = useFeatureAccounts();
  const route = useRoute<RouteProp<RootStackParamList, 'QRHub'>>();

  const [tab, setTab] = useState<QRTab>(() =>
    route.params?.initialTab === 'my' ? 'my_qr' : (route.params?.initialTab ?? 'my_qr')
  );

  // My QR state
  const [selectedAccountIndex, setSelectedAccountIndex] = useState(0);

  // Scan state
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const scanErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (scanErrorTimerRef.current !== null) clearTimeout(scanErrorTimerRef.current);
    },
    []
  );

  // Request Money state
  const [reqPayerAccount, setReqPayerAccount] = useState('');
  const [reqAmountStr, setReqAmountStr] = useState('');
  const [reqNote, setReqNote] = useState('');
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError] = useState<string | null>(null);
  const [reqSuccess, setReqSuccess] = useState(false);
  const [requestErrorResponse, setRequestErrorResponse] = useState<unknown>(null);
  const [requestResult, setRequestResult] = useState<ResultResponse | null>(null);
  const { hideBalance } = useSettings();

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
    setRequestResult(null);
    setRequestErrorResponse(null);
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
      if (scanErrorTimerRef.current !== null) clearTimeout(scanErrorTimerRef.current);
      scanErrorTimerRef.current = setTimeout(() => {
        scanErrorTimerRef.current = null;
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
    navigation.replace('Transfer', {
      recipientAccount: parsed.accountNumber,
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
        setRequestErrorResponse(error);
        setReqError(toUserMessage(error));
      } else {
        setRequestResult(data ?? {});
        setReqSuccess(true);
      }
    } catch (err: any) {
      setReqLoading(false);
      setReqError(toUserMessage(err));
    }
  };

  return (
    <FeatureScreen
      isDirty={
        tab === 'request' &&
        !reqSuccess &&
        Boolean(reqPayerAccount || reqAmountStr || reqNote)
      }
      isProcessing={reqLoading}
      title="Davao Bank QR & request"
    >
      <AccountLoadStatus
        loading={accountsLoading}
        empty={accounts.length === 0}
        error={accountError}
        onRetry={loadAccounts}
      />
      {!accountsLoading && !accountError && accounts.length > 0 && (
        <>
          <View style={styles.container}>
            {/* Navigation Tabs */}
            <View style={styles.tabBar}>
              <Pressable
                style={[styles.tabItem, tab === 'my_qr' && styles.tabItemActive]}
                onPress={() => {
                  setTab('my_qr');
                  setScanError(null);
                }}
                feedbackType="scale"
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === 'my_qr' }}
                accessibilityLabel="My QR"
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
              </Pressable>

              <Pressable
                style={[styles.tabItem, tab === 'scan' && styles.tabItemActive]}
                onPress={() => {
                  setTab('scan');
                  setScanned(false);
                  setScanError(null);
                }}
                feedbackType="scale"
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === 'scan' }}
                accessibilityLabel="Scan"
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
              </Pressable>

              <Pressable
                style={[styles.tabItem, tab === 'request' && styles.tabItemActive]}
                onPress={() => {
                  setTab('request');
                  setScanError(null);
                }}
                feedbackType="scale"
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === 'request' }}
                accessibilityLabel="Request"
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
              </Pressable>
            </View>

            <View style={styles.scrollInner}>
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
                    navigation.replace('Transfer');
                  }}
                />
              )}

              {tab === 'request' && isConfirmedRejection(requestErrorResponse) && (
                <ResultView
                  outcome="failed"
                  title="Not sent"
                  onDone={() => setRequestErrorResponse(null)}
                />
              )}
              {tab === 'request' &&
                !isConfirmedRejection(requestErrorResponse) &&
                reqSuccess && (
                  <ResultView
                    outcome="request_sent"
                    title="Request sent"
                    subtitle={
                      reqPayerAccount
                        ? `We'll notify you in Inbox when •• ${reqPayerAccount.slice(-4)} pays or declines.`
                        : undefined
                    }
                    amountCentavos={requestResult?.amount}
                    hideBalance={hideBalance}
                    details={requestResult ? resultRows(requestResult) : []}
                    shareReceipt={!!requestResult}
                    contextualActionTitle="Request again"
                    onContextualAction={() =>
                      navigation.replace('QRHub', { initialTab: 'request' })
                    }
                    onDone={resetState}
                  />
                )}
              {tab === 'request' &&
                !reqSuccess &&
                !isConfirmedRejection(requestErrorResponse) && (
                  <RequestMoneyTab
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
                  />
                )}
            </View>
          </View>
        </>
      )}
    </FeatureScreen>
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
    ...elevation.card,
  },
  scrollInner: {
    paddingBottom: spacing.base,
  },
});
