/**
 * components/profile/EditProfileSheet.tsx
 *
 * Page-sheet modal for editing the user's profile: photo, username (unique,
 * claimed via the `usernames` collection), full name, bio, and location.
 * Validation is inline under each field — no alerts.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { X, Camera } from 'phosphor-react-native';

import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';
import { useEditProfile, validateUsernameFormat } from '@/hooks/useEditProfile';
import { Avatar } from '@/components/ui/Avatar';
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
  const { pickAndUploadAvatar, saveProfile, checkUsernameAvailable, uploadingAvatar, saving } =
    useEditProfile();

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');

  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const usernameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-seed fields whenever the modal opens
  useEffect(() => {
    if (visible) {
      setFullName(profile?.fullName ?? user?.displayName ?? '');
      setUsername(profile?.username ?? '');
      setBio(profile?.bio ?? '');
      setLocation(profile?.location ?? '');
      setAvatarError(null);
      setUsernameError(null);
      setNameError(null);
      setSaveError(null);
    }
  }, [visible, user?.displayName, profile]);

  // Live username validation: format immediately, availability debounced.
  const handleUsernameChange = useCallback(
    (raw: string) => {
      const value = raw.toLowerCase().replace(/\s/g, '');
      setUsername(value);
      setSaveError(null);
      if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current);

      const formatError = validateUsernameFormat(value);
      if (formatError || !value || value === profile?.username) {
        setUsernameError(formatError);
        setUsernameChecking(false);
        return;
      }
      setUsernameChecking(true);
      setUsernameError(null);
      usernameCheckTimer.current = setTimeout(async () => {
        const available = await checkUsernameAvailable(value);
        setUsernameChecking(false);
        setUsernameError(available ? null : 'That username is taken.');
      }, 500);
    },
    [profile?.username, checkUsernameAvailable],
  );

  const handleChangePhoto = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAvatarError(null);
    const error = await pickAndUploadAvatar();
    if (error) setAvatarError(error);
  }, [pickAndUploadAvatar]);

  const handleSave = useCallback(async () => {
    if (saving || uploadingAvatar) return;
    if (!fullName.trim()) {
      setNameError('Add your full name.');
      return;
    }
    if (usernameError || usernameChecking) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaveError(null);
    const error = await saveProfile({ fullName, username, bio, location });
    if (error) {
      if (error === 'That username is taken.') setUsernameError(error);
      else setSaveError(error);
      return;
    }
    onClose();
  }, [saving, uploadingAvatar, fullName, username, bio, location, usernameError, usernameChecking, saveProfile, onClose]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  const fieldStyle = {
    color: colors.text.primary,
    backgroundColor: colors.background.card,
    borderColor: colors.background.cardBorder,
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: colors.background.primary }]}>
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
                Edit profile
              </Text>
              <TouchableOpacity
                onPress={handleClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={22} color={colors.text.secondary} weight="bold" />
              </TouchableOpacity>
            </View>

            {/* Photo */}
            <View style={styles.avatarSection}>
              <TouchableOpacity
                onPress={handleChangePhoto}
                activeOpacity={0.8}
                disabled={uploadingAvatar}
                accessibilityLabel="Change profile photo"
              >
                <Avatar
                  uri={profile?.avatarUrl ?? user?.photoURL}
                  name={fullName || 'You'}
                  size="xl"
                />
                <View style={[styles.cameraBubble, { backgroundColor: colors.text.primary, borderColor: colors.background.primary }]}>
                  {uploadingAvatar ? (
                    <ActivityIndicator size="small" color={colors.background.primary} />
                  ) : (
                    <Camera size={14} color={colors.background.primary} weight="bold" />
                  )}
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleChangePhoto} disabled={uploadingAvatar} hitSlop={8}>
                <Text style={[styles.changePhotoText, { color: colors.brand.purple }]}>
                  {uploadingAvatar ? 'Uploading…' : 'Change photo'}
                </Text>
              </TouchableOpacity>
              {avatarError ? (
                <Text style={[styles.fieldError, { color: colors.semantic.error }]}>{avatarError}</Text>
              ) : null}
            </View>

            {/* Form */}
            <View style={styles.form}>
              {/* Full name */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text.secondary }]}>Full name</Text>
                <TextInput
                  value={fullName}
                  onChangeText={(t) => { setFullName(t); setNameError(null); }}
                  placeholder="Your full name"
                  placeholderTextColor={colors.text.tertiary}
                  style={[styles.input, fieldStyle, nameError ? { borderColor: colors.semantic.error } : null]}
                  returnKeyType="next"
                  autoCorrect={false}
                />
                {nameError ? (
                  <Text style={[styles.fieldError, { color: colors.semantic.error }]}>{nameError}</Text>
                ) : null}
              </View>

              {/* Username */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text.secondary }]}>Username</Text>
                <View style={[styles.input, styles.usernameRow, fieldStyle, usernameError ? { borderColor: colors.semantic.error } : null]}>
                  <Text style={[styles.atSign, { color: colors.text.tertiary }]}>@</Text>
                  <TextInput
                    value={username}
                    onChangeText={handleUsernameChange}
                    placeholder="username"
                    placeholderTextColor={colors.text.tertiary}
                    style={[styles.usernameInput, { color: colors.text.primary }]}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={20}
                  />
                  {usernameChecking && <ActivityIndicator size="small" color={colors.text.tertiary} />}
                </View>
                {usernameError ? (
                  <Text style={[styles.fieldError, { color: colors.semantic.error }]}>{usernameError}</Text>
                ) : (
                  <Text style={[styles.fieldHint, { color: colors.text.tertiary }]}>
                    Lowercase letters, numbers, dots, and underscores.
                  </Text>
                )}
              </View>

              {/* Bio */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text.secondary }]}>Bio</Text>
                <TextInput
                  value={bio}
                  onChangeText={(text) => setBio(text.slice(0, 160))}
                  placeholder="Tell the world about yourself…"
                  placeholderTextColor={colors.text.tertiary}
                  multiline
                  maxLength={160}
                  style={[styles.input, styles.inputMultiline, fieldStyle]}
                />
                <Text style={[styles.charCount, { color: colors.text.tertiary }]}>
                  {bio.length}/160
                </Text>
              </View>

              {/* Location */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.text.secondary }]}>Location</Text>
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="Where are you based?"
                  placeholderTextColor={colors.text.tertiary}
                  style={[styles.input, fieldStyle]}
                  returnKeyType="done"
                />
              </View>

              {saveError ? (
                <Text style={[styles.fieldError, { color: colors.semantic.error }]}>{saveError}</Text>
              ) : null}

              {/* Save */}
              <View style={styles.saveRow}>
                <Button
                  label="Save"
                  variant="primary"
                  size="md"
                  fullWidth
                  loading={saving}
                  disabled={uploadingAvatar || usernameChecking || !!usernameError}
                  onPress={handleSave}
                  haptic="none"
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
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.02 * FontSize.xl,
  },

  avatarSection: {
    alignItems: 'center',
    gap: Spacing['3'],
    marginTop: Spacing['2'],
    marginBottom: Spacing['5'],
  },
  cameraBubble: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changePhotoText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },

  form: {
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
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['1'],
    paddingVertical: 0,
  },
  atSign: {
    fontSize: FontSize.base,
  },
  usernameInput: {
    flex: 1,
    fontSize: FontSize.base,
    paddingVertical: Spacing['3'],
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
  fieldError: {
    fontSize: FontSize.xs,
  },
  fieldHint: {
    fontSize: FontSize.xs,
  },
  saveRow: {
    marginTop: Spacing['2'],
  },
});
