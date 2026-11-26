import { useConfirmSheet } from '../hooks/useConfirmSheet';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { maskAccountNumber } from '../utils/transactionDisplay';
import { View, StyleSheet } from 'react-native';
import { Users, Plus, Trash2, Edit2, Search, X, CreditCard } from 'lucide-react-native';
import {
  colors,
  spacing,
  radius,
  size,
  toUserMessage,
  type SavedRecipient,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { reportNetworkResult } from '../lib/networkStatus';
import { MASCOT_ERROR } from '../assets/illustrations';
import {
  FeatureScreen,
  Text,
  Button,
  TextField,
  Card,
  EmptyState,
  Skeleton,
  GroupedList,
  Pressable,
  ListHairline,
  groupedListStyles,
  LIST_ICON_SIZE,
  LIST_ROW_MIN_HEIGHT,
  useToast,
} from '../components';

const SKELETON_ROWS = 3;
/* eslint-disable @typescript-eslint/no-require-imports */
const kadaNotFoundIllustration = require('../../assets/illustrations/kada-not-found.png');
const duriErrorIllustration = require('../../assets/illustrations/duri-error-state.png');
/* eslint-enable @typescript-eslint/no-require-imports */

export function SavedRecipientsScreen() {
  const { showConfirmation, confirmSheet } = useConfirmSheet();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const toast = useToast();
  const [recipients, setRecipients] = useState<SavedRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Add / Edit State
  const [isAdding, setIsAdding] = useState(false);
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [newNickname, setNewNickname] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Inline rename (spec 7B.4: replaces the iOS-only Alert.prompt)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNickname, setEditNickname] = useState('');
  const [editOriginal, setEditOriginal] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadRecipients = useCallback(async () => {
    if (mountedRef.current) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const { data, error } = await supabase
        .from('saved_recipients')
        .select('*')
        .order('created_at', { ascending: false });

      reportNetworkResult(error);
      if (!mountedRef.current) return;
      if (error) {
        setLoadError(toUserMessage(error));
        setRecipients([]);
      } else {
        setRecipients(data || []);
      }
    } catch (err: unknown) {
      reportNetworkResult(err);
      if (mountedRef.current) {
        setLoadError(toUserMessage(err));
        setRecipients([]);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadRecipients();
  }, [loadRecipients]);

  const isDirty =
    (isAdding && (newAccountNumber.trim().length > 0 || newNickname.trim().length > 0)) ||
    (editingId !== null && editNickname !== editOriginal);

  const handleAddRecipient = async () => {
    const acc = newAccountNumber.trim();
    const nick = newNickname.trim();

    if (!acc) {
      setFormError('Account number is required');
      return;
    }
    if (!nick) {
      setFormError('Nickname is required (1 to 40 characters)');
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);

      const { data, error } = await supabase.rpc('add_saved_recipient', {
        p_account_number: acc,
        p_nickname: nick,
      });

      if (error) {
        setFormError(toUserMessage(error, 'account'));
        return;
      }

      if (data?.success) {
        setNewAccountNumber('');
        setNewNickname('');
        setIsAdding(false);
        toast.show('Recipient saved');
        loadRecipients();
      }
    } catch (err: unknown) {
      setFormError(toUserMessage(err, 'account'));
    } finally {
      setSubmitting(false);
    }
  };

  const startEditing = (item: SavedRecipient) => {
    // Unsaved changes on another row: ignore, so a typed nickname is never lost.
    if (editingId && editingId !== item.id && editNickname !== editOriginal) return;
    setEditingId(item.id);
    setEditNickname(item.nickname);
    setEditOriginal(item.nickname);
    setEditError(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditError(null);
  };

  const handleUpdateNickname = async (id: string) => {
    const clean = editNickname.trim();
    if (!clean || clean.length > 40) {
      setEditError('Nickname must be 1 to 40 characters.');
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      const { error } = await supabase
        .from('saved_recipients')
        .update({ nickname: clean })
        .eq('id', id);
      if (!mountedRef.current) return;
      if (error) {
        setEditError(toUserMessage(error, 'account'));
      } else {
        setEditingId(null);
        toast.show('Nickname updated');
        loadRecipients();
      }
    } catch (err: unknown) {
      if (mountedRef.current) setEditError(toUserMessage(err, 'account'));
    } finally {
      if (mountedRef.current) setSavingEdit(false);
    }
  };

  const openTransfer = (item: SavedRecipient) => {
    navigation.navigate('Transfer', {
      recipientAccount: item.account_number,
      recipientNickname: item.nickname,
    });
  };

  const handleDeleteRecipient = async (recipient: SavedRecipient) => {
    showConfirmation({
      title: 'Remove recipient',
      message: `Remove "${recipient.nickname}" (${maskAccountNumber(recipient.account_number)}) from your saved recipients?`,
      confirmLabel: 'Remove',
      cancelLabel: 'Cancel',
      destructive: true,
      onConfirm: async () => {
        const { error } = await supabase
          .from('saved_recipients')
          .delete()
          .eq('id', recipient.id);

        if (error) {
          toast.show(toUserMessage(error, 'account'), 'error');
        } else {
          toast.show('Recipient removed');
          loadRecipients();
        }
      },
    });
  };
  const filteredRecipients = recipients.filter((r) => {
    const q = searchQuery.toLowerCase();
    return (
      r.nickname.toLowerCase().includes(q) || r.account_number.toLowerCase().includes(q)
    );
  });

  return (
    <FeatureScreen
      title="Saved recipients"
      isDirty={isDirty}
      isProcessing={submitting || savingEdit}
    >
      <View style={styles.container}>
        {loadError ? (
          <EmptyState
            title="Recipients unavailable"
            description={loadError}
            descriptionAccessibilityRole="alert"
            illustration={MASCOT_ERROR}
            illustrationTestID="recipients-error-mascot"
            actionTitle="Try again"
            onAction={() => void loadRecipients()}
            scrollable={false}
          />
        ) : isAdding ? (
          <Card variant="elevated" style={styles.formCard}>
            <View style={styles.formHeader}>
              <Text variant="title" color={colors.ink}>
                New Saved Recipient
              </Text>
              <Pressable
                onPress={() => {
                  setIsAdding(false);
                  setFormError(null);
                }}
                feedbackType="scale"
                accessibilityRole="button"
                accessibilityLabel="Cancel adding recipient"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <TextField
              label="Account Number"
              placeholder="e.g. 1020 4417 85"
              value={newAccountNumber}
              onChangeText={setNewAccountNumber}
              keyboardType="number-pad"
            />

            <TextField
              label="Nickname"
              placeholder="e.g. Mama, Landlord, Davao Store"
              value={newNickname}
              onChangeText={setNewNickname}
              maxLength={40}
            />

            {formError ? (
              <Text variant="caption" color={colors.redText} style={styles.errorText}>
                {formError}
              </Text>
            ) : null}

            <View style={styles.buttonRow}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => {
                  setIsAdding(false);
                  setFormError(null);
                }}
                style={styles.halfBtn}
              />
              <Button
                title="Save"
                variant="primary"
                onPress={handleAddRecipient}
                loading={submitting}
                style={styles.halfBtn}
              />
            </View>
          </Card>
        ) : (
          <>
            <View style={styles.headerRow}>
              <View style={styles.searchBox}>
                <Search size={18} color={colors.textMuted} style={styles.searchIcon} />
                <TextField
                  placeholder="Search recipients by nickname..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  containerStyle={styles.searchInput}
                />
              </View>

              <Button
                title="Add"
                variant="primary"
                icon={<Plus size={16} color={colors.textInverse} />}
                onPress={() => {
                  setIsAdding(true);
                  setFormError(null);
                }}
              />
            </View>

            {loading ? (
              <View
                accessibilityRole="progressbar"
                accessibilityLabel="Loading saved recipients"
                testID="recipients-skeleton"
              >
                <GroupedList>
                  {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                    <View key={index}>
                      <Skeleton
                        width="100%"
                        height={LIST_ROW_MIN_HEIGHT}
                        style={styles.rowSkeleton}
                      />
                      {index < SKELETON_ROWS - 1 ? <ListHairline /> : null}
                    </View>
                  ))}
                </GroupedList>
              </View>
            ) : filteredRecipients.length === 0 ? (
              <EmptyState
                illustration={
                  searchQuery ? duriErrorIllustration : kadaNotFoundIllustration
                }
                illustrationTestID={
                  searchQuery ? 'recipients-no-matches-mascot' : 'recipients-empty-mascot'
                }
                icon={<Users size={32} color={colors.primary} />}
                title={searchQuery ? 'No matching recipients' : 'No saved recipients yet'}
                description={
                  searchQuery
                    ? 'Try searching with a different name or number.'
                    : 'Save your frequent transfer recipients for 1-tap transfers.'
                }
                actionTitle={searchQuery ? 'Clear search' : 'Add a recipient'}
                onAction={
                  searchQuery ? () => setSearchQuery('') : () => setIsAdding(true)
                }
                scrollable={false}
              />
            ) : (
              <View style={groupedListStyles.group}>
                {filteredRecipients.map((item, index) => (
                  <View key={item.id}>
                    {index > 0 ? <ListHairline /> : null}
                    {editingId === item.id ? (
                      <View style={styles.editRow}>
                        <TextField
                          label="Nickname"
                          value={editNickname}
                          onChangeText={(val) => {
                            setEditNickname(val);
                            if (editError) setEditError(null);
                          }}
                          maxLength={40}
                          autoFocus
                          error={editError}
                          helperText={`${maskAccountNumber(item.account_number)} · 1 to 40 characters`}
                          returnKeyType="done"
                          onSubmitEditing={() => void handleUpdateNickname(item.id)}
                        />
                        <View style={styles.buttonRow}>
                          <Button
                            title="Cancel"
                            variant="secondary"
                            onPress={cancelEditing}
                            disabled={savingEdit}
                            style={styles.halfBtn}
                          />
                          <Button
                            title="Save"
                            onPress={() => void handleUpdateNickname(item.id)}
                            loading={savingEdit}
                            style={styles.halfBtn}
                          />
                        </View>
                      </View>
                    ) : (
                      <View style={styles.recipientRow}>
                        <Pressable
                          onPress={() => openTransfer(item)}
                          feedbackType="highlight"
                          accessibilityRole="button"
                          accessibilityLabel={`Send money to ${item.nickname}, ${maskAccountNumber(item.account_number)}`}
                          style={[groupedListStyles.row, styles.rowMain]}
                        >
                          <View style={[groupedListStyles.disc, styles.disc]}>
                            <CreditCard size={LIST_ICON_SIZE} color={colors.primary} />
                          </View>
                          <View style={styles.infoCol}>
                            <Text
                              variant="bodyStrong"
                              color={colors.ink}
                              numberOfLines={1}
                            >
                              {item.nickname}
                            </Text>
                            <Text
                              variant="caption"
                              color={colors.textSecondary}
                              tabularNums
                            >
                              {maskAccountNumber(item.account_number)}
                            </Text>
                          </View>
                        </Pressable>

                        <View style={styles.actionRow}>
                          <Pressable
                            onPress={() => startEditing(item)}
                            style={styles.iconBtn}
                            feedbackType="scale"
                            accessibilityRole="button"
                            accessibilityLabel={`Rename ${item.nickname}`}
                          >
                            <Edit2 size={LIST_ICON_SIZE} color={colors.textSecondary} />
                          </Pressable>
                          <Pressable
                            onPress={() => handleDeleteRecipient(item)}
                            style={styles.iconBtn}
                            feedbackType="scale"
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${item.nickname}`}
                          >
                            <Trash2 size={LIST_ICON_SIZE} color={colors.redText} />
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </View>
      {confirmSheet}
    </FeatureScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.lg,
  },
  loadErrorContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.base,
  },
  loadErrorText: {
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  searchBox: {
    flex: 1,
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: spacing.sm,
    top: 14,
    zIndex: 1,
  },
  searchInput: {
    marginBottom: 0,
  },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.sm,
  },
  rowMain: {
    flex: 1,
  },
  disc: {
    backgroundColor: colors.primaryTint,
  },
  infoCol: {
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconBtn: {
    minWidth: size.touch,
    minHeight: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editRow: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  rowSkeleton: {
    borderRadius: 0,
  },
  formCard: {
    padding: spacing.md,
    borderRadius: radius.md,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  errorText: {
    marginBottom: spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  halfBtn: {
    flex: 1,
  },
});
