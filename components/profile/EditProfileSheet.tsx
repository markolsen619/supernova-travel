/**
 * components/profile/EditProfileSheet.tsx
 *
 * Bottom-sheet-style modal for editing the user's profile.
 * Implemented as a full-screen page-sheet modal (no third-party library required).
 * Actual Firestore save is Phase 6 work — Save currently just closes the modal.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';
import { Button } from '@/components/ui/Button';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

interface EditProfileSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function EditProfileSheet({ visible, onClose }: EditProfileSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const profile = useUserStore((s) => s.profile);

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [location, setLocation] = useState(profile?.location ?? '');

  // Re-seed fields whenever the modal opens
  useEffect(() => {
    if (visible) {
      setDisplayName(user?.displayName ?? '');
      setBio(profile?.bio ?? '');
      setLocation(profile?.location ?? '');
    }
  }, [visible, user?.displayName, profile?.bio, profile?.location]);

  const handleSave = useCallback(() => {
    // Phase 6: Firestore update goes here
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: colors.background.primary }]}>
        <LinearGradient
          colors={colors.gradient.dark as [string, string]}
          style={StyleSheet.absoluteFill}
        />

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingTop: insets.top + Spacing['2'], paddingBottom: insets.bottom + Spacing['6'] },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
                Edit Profile
              </Text>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={{ color: colors.text.secondary, fontSize: FontSize.xl }}>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>

            {/* Form */}
            <View style={styles.form}>
              {/* Display Name */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text.secondary }]}>
                  Display Name
                </Text>
                <TextInput
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Your name"
                  placeholderTextColor={colors.text.tertiary}
                  style={[
                    styles.input,
                    {
                      color: colors.text.primary,
                      backgroundColor: colors.background.card,
                      borderColor: colors.background.cardBorder,
                    },
                  ]}
                  returnKeyType="next"
                  autoCorrect={false}
                />
              </View>

              {/* Bio */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text.secondary }]}>
                  Bio
                </Text>
                <TextInput
                  value={bio}
                  onChangeText={(text) => setBio(text.slice(0, 160))}
                  placeholder="Tell the world about yourself…"
                  placeholderTextColor={colors.text.tertiary}
                  multiline
                  maxLength={160}
                  style={[
                    styles.input,
                    styles.inputMultiline,
                    {
                      color: colors.text.primary,
                      backgroundColor: colors.background.card,
                      borderColor: colors.background.cardBorder,
                    },
                  ]}
                />
                <Text
                  style={[styles.charCount, { color: colors.text.tertiary }]}
                >
                  {bio.length}/160
                </Text>
              </View>

              {/* Location */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text.secondary }]}>
                  Location
                </Text>
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="Where are you based?"
                  placeholderTextColor={colors.text.tertiary}
                  style={[
                    styles.input,
                    {
                      color: colors.text.primary,
                      backgroundColor: colors.background.card,
                      borderColor: colors.background.cardBorder,
                    },
                  ]}
                  returnKeyType="done"
                />
              </View>

              {/* Save button */}
              <View style={styles.saveRow}>
                <Button
                  label="Save"
                  variant="primary"
                  size="md"
                  onPress={handleSave}
                />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing['6'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing['4'],
  },
  headerTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  form: {
    marginTop: Spacing['4'],
    gap: Spacing['4'],
  },
  fieldGroup: {
    gap: Spacing['2'],
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    fontSize: FontSize.base,
  },
  inputMultiline: {
    height: 100,
    textAlignVertical: 'top',
    paddingTop: Spacing['3'],
  },
  charCount: {
    fontSize: FontSize.xs,
    textAlign: 'right',
  },
  saveRow: {
    marginTop: Spacing['4'],
    alignItems: 'center',
  },
});
