import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {
  Users,
  Plus,
  Trash2,
  Edit2,
  Search,
  Check,
  X,
  CreditCard,
} from 'lucide-react-native';
import { colors, spacing, radius, type SavedRecipient } from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import {
  BottomSheet,
  Text,
  Button,
  TextField,
  Card,
  EmptyState,
  Badge,
} from '../components';

interface SavedRecipientsModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectRecipient?: (accountNumber: string, nickname: string) => void;
}

export function SavedRecipientsModal({
  visible,
  onClose,
  onSelectRecipient,
}: SavedRecipientsModalProps) {
  const [recipients, setRecipients] = useState<SavedRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Add / Edit State
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [newNickname, setNewNickname] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadRecipients = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('saved_recipients')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Error fetching saved recipients:', error);
      } else {
        setRecipients(data || []);
      }
    } catch (err) {
      console.warn('Failed to load saved recipients:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadRecipients();
      setIsAdding(false);
      setEditingId(null);
      setFormError(null);
    }
  }, [visible, loadRecipients]);

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
        setFormError(error.message);
        return;
      }

      if (data?.success) {
        setNewAccountNumber('');
        setNewNickname('');
        setIsAdding(false);
        loadRecipients();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add recipient';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateNickname = async (id: string, currentNick: string) => {
    Alert.prompt(
      'Edit Nickname',
      'Enter a new nickname for this recipient:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async (updatedNick?: string) => {
            const clean = updatedNick?.trim();
            if (!clean || clean.length > 40) {
              Alert.alert('Invalid Nickname', 'Nickname must be 1 to 40 characters.');
              return;
            }
            const { error } = await supabase
              .from('saved_recipients')
              .update({ nickname: clean })
              .eq('id', id);

            if (error) {
              Alert.alert('Error', error.message);
            } else {
              loadRecipients();
            }
          },
        },
      ],
      'plain-text',
      currentNick
    );
  };

  const handleDeleteRecipient = async (recipient: SavedRecipient) => {
    Alert.alert(
      'Remove Recipient',
      `Are you sure you want to remove "${recipient.nickname}" (${recipient.account_number}) from your saved recipients?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('saved_recipients')
              .delete()
              .eq('id', recipient.id);

            if (error) {
              Alert.alert('Error', error.message);
            } else {
              loadRecipients();
            }
          },
        },
      ]
    );
  };

  const filteredRecipients = recipients.filter((r) => {
    const q = searchQuery.toLowerCase();
    return (
      r.nickname.toLowerCase().includes(q) || r.account_number.toLowerCase().includes(q)
    );
  });

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Saved Recipients">
      <View style={styles.container}>
        {isAdding ? (
          <Card variant="elevated" style={styles.formCard}>
            <View style={styles.formHeader}>
              <Text variant="title" color={colors.ink}>
                New Saved Recipient
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setIsAdding(false);
                  setFormError(null);
                }}
              >
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
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
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : filteredRecipients.length === 0 ? (
              <EmptyState
                icon={<Users size={32} color={colors.primary} />}
                title={searchQuery ? 'No matching recipients' : 'No saved recipients yet'}
                description={
                  searchQuery
                    ? 'Try searching with a different name or number.'
                    : 'Save your frequent transfer recipients for 1-tap transfers.'
                }
                actionTitle={searchQuery ? undefined : 'Add Recipient'}
                onAction={searchQuery ? undefined : () => setIsAdding(true)}
              />
            ) : (
              <FlatList
                data={filteredRecipients}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <Card
                    variant="elevated"
                    style={styles.recipientRow}
                    onPress={() => {
                      if (onSelectRecipient) {
                        onSelectRecipient(item.account_number, item.nickname);
                        onClose();
                      }
                    }}
                  >
                    <View style={styles.rowMain}>
                      <View style={styles.iconCircle}>
                        <CreditCard size={18} color={colors.primary} />
                      </View>
                      <View style={styles.infoCol}>
                        <Text variant="bodyStrong" color={colors.ink}>
                          {item.nickname}
                        </Text>
                        <Text variant="caption" color={colors.textSecondary} tabularNums>
                          {item.account_number}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        onPress={() => handleUpdateNickname(item.id, item.nickname)}
                        style={styles.iconBtn}
                        accessibilityLabel="Edit nickname"
                      >
                        <Edit2 size={16} color={colors.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDeleteRecipient(item)}
                        style={styles.iconBtn}
                        accessibilityLabel="Delete recipient"
                      >
                        <Trash2 size={16} color={colors.redText} />
                      </TouchableOpacity>
                    </View>
                  </Card>
                )}
              />
            )}
          </>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.lg,
    maxHeight: 520,
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
  listContent: {
    gap: spacing.sm,
  },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
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
    padding: spacing.xs,
  },
  loaderContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
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
