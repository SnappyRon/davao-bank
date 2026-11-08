import React, { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../lib/supabase';
import { Text } from './Text';
import { Button } from './Button';
import { AuthenticatorCode } from './AuthenticatorCode';

type Factor = { id: string; friendly_name?: string; created_at: string };
type Enrollment = { id: string; secret: string; uri: string };
export function TwoStepSetup({ onClose }: { onClose: () => void }) {
  const [factor, setFactor] = useState<Factor | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const pendingId = useRef<string | null>(null);
  const mounted = useRef(true);
  const [disabling, setDisabling] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    const { data, error: loadError } = await supabase.auth.mfa.listFactors();
    if (!mounted.current) return;
    if (loadError) setError('Could not load two-step verification. Please try again.');
    else setFactor(data.totp.find((f) => f.status === 'verified') || null);
    setBusy(false);
  };
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      const id = pendingId.current;
      pendingId.current = null;
      if (id) void supabase.auth.mfa.unenroll({ factorId: id });
    };
  }, []);
  const enroll = async () => {
    setBusy(true);
    setError('');
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Davao Bank',
      });
      if (enrollError || !data) throw new Error('enrollment');
      if (!mounted.current) {
        await supabase.auth.mfa.unenroll({ factorId: data.id });
        return;
      }
      pendingId.current = data.id;
      setEnrollment({ id: data.id, secret: data.totp.secret, uri: data.totp.uri });
    } catch {
      setError('Could not start setup. Please try again.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const verify = async (code: string) => {
    const id = enrollment?.id || factor?.id;
    if (!id) return false;
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: id,
      code,
    });
    if (verifyError) return false;
    if (disabling) {
      const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (removeError) return false;
    } else pendingId.current = null;
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      setError('Please sign in again to refresh your session.');
      return false;
    }
    setEnrollment(null);
    setDisabling(false);
    await load();
    return true;
  };
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 16, paddingBottom: 24 }}
    >
      <Text variant="title">Two-step verification</Text>
      <Text>
        {factor
          ? `On · ${factor.friendly_name || 'Authenticator'} · added ${new Date(factor.created_at).toLocaleDateString()}`
          : 'Off'}
      </Text>
      {!!error && <Text accessibilityRole="alert">{error}</Text>}
      {enrollment ? (
        <View style={{ gap: 16 }}>
          <Text>
            Scan this QR code with your authenticator app, or use the setup key on this
            phone.
          </Text>
          <QRCode value={enrollment.uri} size={180} />
          <Text selectable>{enrollment.secret}</Text>
          <Button
            title="Copy setup key"
            onPress={() => {
              void Clipboard.setStringAsync(enrollment.secret);
            }}
          />
          <Button
            title="Open in authenticator app"
            onPress={() => {
              void Linking.openURL(enrollment.uri).catch(() =>
                setError(
                  'No authenticator app could open this link. Use the setup key instead.'
                )
              );
            }}
          />
          <AuthenticatorCode verify={verify} onCancel={onClose} />
        </View>
      ) : disabling ? (
        <View>
          <Text>
            Turning this off blocks sending money until you set it up again. Enter a fresh
            code to turn it off.
          </Text>
          <AuthenticatorCode verify={verify} onCancel={() => setDisabling(false)} />
        </View>
      ) : (
        <Button
          disabled={busy}
          title={factor ? 'Turn off two-step verification' : 'Set up'}
          onPress={() => (factor ? setDisabling(true) : void enroll())}
        />
      )}
      <Button title="Close" variant="ghost" onPress={onClose} />
    </ScrollView>
  );
}
