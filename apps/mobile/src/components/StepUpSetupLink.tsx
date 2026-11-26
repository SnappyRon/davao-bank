import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { Button } from './Button';

export function StepUpSetupLink({
  error,
  onClose,
}: {
  error?: string | null;
  onClose: () => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  if (!error?.includes('Set up two-step verification')) return null;
  return (
    <Button
      title="Set up now"
      onPress={() => {
        onClose();
        navigation.navigate('TwoStepSetup');
      }}
    />
  );
}
