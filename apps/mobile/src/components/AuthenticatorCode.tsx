import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { TextField } from './TextField';
import { Button } from './Button';

/** A code exists only in component memory and is cleared after each attempt. */
export function AuthenticatorCode({
  verify,
  onCancel,
}: {
  verify: (code: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const submit = async (value: string) => {
    if (inFlight.current || !/^\d{6}$/.test(value)) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!(await verify(value)))
        setError('Code not accepted. Try the latest code from your authenticator app.');
    } catch {
      setError('Could not verify the code. Please try again.');
    } finally {
      setCode('');
      setBusy(false);
      inFlight.current = false;
    }
  };
  return (
    <View>
      <TextField
        label="Authenticator code"
        accessibilityLabel="Authenticator code"
        value={code}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        editable={!busy}
        error={error}
        onChangeText={(text) => {
          const value = text.replace(/\D/g, '').slice(0, 6);
          setCode(value);
          if (value.length === 6) void submit(value);
        }}
      />
      <Button title="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
    </View>
  );
}
