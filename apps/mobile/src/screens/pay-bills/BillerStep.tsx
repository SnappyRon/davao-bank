import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Switch } from 'react-native';
import {
  Zap,
  Droplet,
  Wifi,
  Smartphone,
  Layers,
  Edit2,
  Trash2,
  AlertCircle,
} from 'lucide-react-native';
import {
  colors,
  radius,
  size,
  spacing,
  type Biller,
  type BillerCategory,
} from '@davao-bank/shared';
import { Text } from '../../components/Text';
import { TextField } from '../../components/TextField';
import { Chip } from '../../components/Chip';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Skeleton } from '../../components/Skeleton';
import { Pressable } from '../../components/Pressable';
import {
  GroupedList,
  ListHairline,
  groupedListStyles,
  LIST_ICON_SIZE,
  LIST_ROW_MIN_HEIGHT,
} from '../../components/GroupedList';
import type { SavedBiller } from '../../hooks/usePhase8Contracts';

interface BillerStepProps {
  billers: Biller[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  onSelectBiller: (biller: Biller) => void;
  savedBillers?: SavedBiller[];
  savedBillersLoading?: boolean;
  savedBillersError?: string | null;
  onRetrySavedBillers?: () => void;
  onSelectSavedBiller?: (saved: SavedBiller) => void;
  onUpdateSavedBiller?: (
    id: string,
    patch: { nickname: string; due_day: number | null; remind: boolean }
  ) => Promise<boolean>;
  onDeleteSavedBiller?: (saved: SavedBiller) => void;
}

export const getCategoryIcon = (category: BillerCategory) => {
  switch (category) {
    case 'electricity':
      return <Zap size={20} color={colors.yellow} />;
    case 'water':
      return <Droplet size={20} color={colors.blue} />;
    case 'internet':
      return <Wifi size={20} color={colors.primary} />;
    case 'mobile':
      return <Smartphone size={20} color={colors.orange} />;
    default:
      return <Layers size={20} color={colors.textSecondary} />;
  }
};

export function parseDueDayInput(raw: string): { valid: boolean; value: number | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: true, value: null };
  if (!/^\d{1,2}$/.test(trimmed)) return { valid: false, value: null };
  const num = Number(trimmed);
  if (!Number.isInteger(num) || num < 1 || num > 28) {
    return { valid: false, value: null };
  }
  return { valid: true, value: num };
}

export function BillerStep({
  billers,
  searchQuery,
  onSearchChange,
  selectedCategory,
  onSelectCategory,
  onSelectBiller,
  savedBillers,
  savedBillersLoading = false,
  savedBillersError = null,
  onRetrySavedBillers,
  onSelectSavedBiller,
  onUpdateSavedBiller,
  onDeleteSavedBiller,
}: BillerStepProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNickname, setEditNickname] = useState('');
  const [editDueDay, setEditDueDay] = useState('');
  const [editRemind, setEditRemind] = useState(true);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const filteredBillers = billers.filter((b) => {
    const matchesCategory = selectedCategory === 'all' || b.category === selectedCategory;
    const matchesSearch =
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.reference_label.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const billerMap = new Map(billers.map((b) => [b.id, b]));

  const startEdit = (item: SavedBiller) => {
    setEditingId(item.id);
    setEditNickname(item.nickname);
    setEditDueDay(item.due_day != null ? String(item.due_day) : '');
    setEditRemind(Boolean(item.remind));
    setEditError(null);
  };

  const cancelEdit = () => {
    if (savingEdit) return;
    setEditingId(null);
    setEditError(null);
  };

  const handleSaveEdit = async (id: string) => {
    if (!onUpdateSavedBiller) return;
    const nick = editNickname.trim();
    if (!nick || nick.length > 40) {
      setEditError('Nickname must be 1 to 40 characters.');
      return;
    }
    const due = parseDueDayInput(editDueDay);
    if (!due.valid) {
      setEditError('Due day must be between 1 and 28.');
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    const ok = await onUpdateSavedBiller(id, {
      nickname: nick,
      due_day: due.value,
      remind: editRemind,
    });
    setSavingEdit(false);
    if (ok) {
      setEditingId(null);
    }
  };

  const showSavedSection =
    savedBillers !== undefined || savedBillersLoading || Boolean(savedBillersError);

  return (
    <View style={styles.stepContainer}>
      {showSavedSection ? (
        <View style={styles.savedSection}>
          <Text variant="title" color={colors.ink} accessibilityRole="header">
            Saved billers
          </Text>
          {savedBillersLoading ? (
            <Skeleton
              width="100%"
              height={LIST_ROW_MIN_HEIGHT}
              style={styles.savedSkeleton}
            />
          ) : savedBillersError ? (
            <Card variant="subtle" style={styles.savedErrorCard}>
              <View style={styles.savedErrorRow}>
                <AlertCircle size={18} color={colors.redText} />
                <Text
                  variant="caption"
                  color={colors.redText}
                  accessibilityRole="alert"
                  style={styles.savedErrorText}
                >
                  {savedBillersError}
                </Text>
              </View>
              {onRetrySavedBillers ? (
                <Button
                  title="Try again"
                  variant="secondary"
                  onPress={onRetrySavedBillers}
                />
              ) : null}
            </Card>
          ) : !savedBillers || savedBillers.length === 0 ? (
            <Card variant="subtle" style={styles.savedEmptyCard}>
              <Text variant="bodyStrong" color={colors.ink}>
                No saved billers yet
              </Text>
              <Text variant="caption" color={colors.textSecondary}>
                Save a biller after paying to pay in fewer taps next time.
              </Text>
            </Card>
          ) : (
            <GroupedList>
              {savedBillers.map((item, idx) => {
                const matchedBiller = billerMap.get(item.biller_id);
                const billerName = matchedBiller?.name ?? 'Biller';
                const dueMeta =
                  item.due_day != null
                    ? ` · Due day ${item.due_day}${item.remind ? '' : ' · Reminder off'}`
                    : '';
                return (
                  <View key={item.id}>
                    {idx > 0 ? <ListHairline /> : null}
                    {editingId === item.id ? (
                      <View style={styles.editPanel}>
                        <TextField
                          label="Nickname"
                          value={editNickname}
                          onChangeText={(val) => {
                            setEditNickname(val);
                            if (editError) setEditError(null);
                          }}
                          maxLength={40}
                        />
                        <TextField
                          label="Due day (1–28, optional)"
                          value={editDueDay}
                          onChangeText={(val) => {
                            setEditDueDay(val);
                            if (editError) setEditError(null);
                          }}
                          placeholder="e.g. 15"
                          keyboardType="number-pad"
                          maxLength={2}
                        />
                        <Pressable
                          onPress={() => setEditRemind((prev) => !prev)}
                          feedbackType="highlight"
                          accessibilityRole="switch"
                          accessibilityLabel="Remind 7 days before due date"
                          accessibilityState={{ checked: editRemind }}
                          style={styles.remindRow}
                        >
                          <Text
                            variant="body"
                            color={colors.ink}
                            style={styles.remindText}
                          >
                            Remind 7 days before due date
                          </Text>
                          <View
                            pointerEvents="none"
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants"
                          >
                            <Switch
                              value={editRemind}
                              trackColor={{ false: colors.border, true: colors.primary }}
                              thumbColor={colors.surface}
                            />
                          </View>
                        </Pressable>
                        {editError ? (
                          <Text
                            variant="caption"
                            color={colors.redText}
                            accessibilityRole="alert"
                          >
                            {editError}
                          </Text>
                        ) : null}
                        <View style={styles.editButtons}>
                          <Button
                            title="Cancel"
                            variant="secondary"
                            onPress={cancelEdit}
                            disabled={savingEdit}
                            style={styles.halfBtn}
                          />
                          <Button
                            title={savingEdit ? 'Saving…' : 'Save'}
                            onPress={() => void handleSaveEdit(item.id)}
                            loading={savingEdit}
                            style={styles.halfBtn}
                          />
                        </View>
                      </View>
                    ) : (
                      <View style={styles.savedRowWrapper}>
                        <Pressable
                          onPress={() => onSelectSavedBiller?.(item)}
                          feedbackType="highlight"
                          accessibilityRole="button"
                          accessibilityLabel={`Pay ${item.nickname}, ${billerName}, ${item.reference}`}
                          style={[groupedListStyles.row, styles.savedRowMain]}
                        >
                          <View style={[groupedListStyles.disc, styles.savedDisc]}>
                            {getCategoryIcon(matchedBiller?.category ?? 'other')}
                          </View>
                          <View style={styles.billerTextContainer}>
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
                              numberOfLines={1}
                            >
                              {`${billerName} · ${item.reference}${dueMeta}`}
                            </Text>
                          </View>
                        </Pressable>
                        <View style={styles.savedActions}>
                          <Pressable
                            onPress={() => startEdit(item)}
                            style={styles.iconButton}
                            feedbackType="scale"
                            accessibilityRole="button"
                            accessibilityLabel={`Edit ${item.nickname}`}
                          >
                            <Edit2 size={LIST_ICON_SIZE} color={colors.textSecondary} />
                          </Pressable>
                          <Pressable
                            onPress={() => onDeleteSavedBiller?.(item)}
                            style={styles.iconButton}
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
                );
              })}
            </GroupedList>
          )}
        </View>
      ) : null}

      <TextField
        placeholder="Search biller or utility..."
        value={searchQuery}
        onChangeText={onSearchChange}
        accessibilityLabel="Search billers"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.categoryChips}
      >
        {[
          { id: 'all', label: 'All' },
          { id: 'electricity', label: 'Electricity' },
          { id: 'water', label: 'Water' },
          { id: 'internet', label: 'Internet' },
          { id: 'mobile', label: 'Mobile' },
        ].map((cat) => (
          <Chip
            key={cat.id}
            label={cat.label}
            selected={selectedCategory === cat.id}
            onPress={() => onSelectCategory(cat.id)}
          />
        ))}
      </ScrollView>

      <View style={styles.billerList}>
        {filteredBillers.map((biller) => (
          <Pressable
            key={biller.id}
            style={styles.billerRow}
            onPress={() => onSelectBiller(biller)}
            feedbackType="highlight"
            accessibilityRole="button"
            accessibilityLabel={`Select ${biller.name}`}
          >
            <View style={styles.billerIconContainer}>
              {getCategoryIcon(biller.category)}
            </View>
            <View style={styles.billerTextContainer}>
              <Text variant="bodyStrong">{biller.name}</Text>
              <Text variant="caption" color="textSecondary">
                {biller.reference_label}
              </Text>
            </View>
          </Pressable>
        ))}

        {filteredBillers.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text variant="body" color="textMuted">
              No billers found in this category.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stepContainer: {
    gap: spacing.base,
  },
  savedSection: {
    gap: spacing.sm,
  },
  savedSkeleton: {
    borderRadius: radius.md,
  },
  savedErrorCard: {
    padding: spacing.base,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  savedErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  savedErrorText: {
    flex: 1,
  },
  savedEmptyCard: {
    padding: spacing.base,
    borderRadius: radius.md,
    gap: spacing.xs,
  },
  savedRowWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.sm,
  },
  savedRowMain: {
    flex: 1,
  },
  savedDisc: {
    backgroundColor: colors.surfaceSubtle,
  },
  savedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconButton: {
    minWidth: size.touch,
    minHeight: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editPanel: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  remindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: size.touch,
    gap: spacing.sm,
  },
  remindText: {
    flex: 1,
  },
  editButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  halfBtn: {
    flex: 1,
  },
  categoryChips: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  billerList: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  billerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  billerIconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  billerTextContainer: {
    flex: 1,
  },
  emptyContainer: {
    padding: spacing['4xl'],
    alignItems: 'center',
  },
});
