import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { BottomTabParamList } from '../../App';
import { Button } from './Button';

export function StepUpSetupLink({
  error,
  onClose,
}: {
  error?: string | null;
  onClose: () => void;
}) {
  const navigation = useNavigation<BottomTabNavigationProp<BottomTabParamList>>();
  if (!error?.includes('Set up two-step verification')) return null;
  return (
    <Button
      title="Set up now"
      onPress={() => {
        onClose();
        navigation.navigate('ProfileTab', { setupTwoStep: true });
      }}
    />
  );
}
