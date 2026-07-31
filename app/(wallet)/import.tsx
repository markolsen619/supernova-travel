import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Camera, X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { WalletHeader } from '@/components/wallet/WalletHeader';
import { Button } from '@/components/ui/Button';
import { useImportQuota } from '@/hooks/useImportQuota';
import { useParseTravelConfirmation } from '@/hooks/useParseTravelConfirmation';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

function quotaLabel(
  quota: { limit: number | null; remaining: number | null; resetsAt: string | null } | undefined,
): string | null {
  if (!quota) return null; // still loading — show nothing rather than a placeholder flash
  if (quota.limit === null) return null; // unlimited (pro/business) — no hint needed
  if ((quota.remaining ?? 0) > 0) return 'Your free import for this year';
  const resetDate = quota.resetsAt
    ? new Date(quota.resetsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'next year';
  return `You've used your free import for this year — resets ${resetDate}`;
}

export default function ImportScreen() {
  const { colors } = useTheme();
  const { data: quota } = useImportQuota();
  const { parseConfirmation, isPending } = useParseTravelConfirmation();

  const [text, setText] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const pickImage = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.85,
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setImageUri(asset.uri);
    setImageBase64(asset.base64 ?? null);
  }, []);

  const removeImage = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImageUri(null);
    setImageBase64(null);
  }, []);

  const handleEnterManually = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Add to wallet', undefined, [
      { text: 'Boarding pass', onPress: () => router.push('/(wallet)/boarding-pass/add') },
      { text: 'Reservation', onPress: () => router.push('/(wallet)/reservation/add') },
      { text: 'Loyalty program', onPress: () => router.push('/(wallet)/loyalty/add') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

  const handleImport = useCallback(async () => {
    if (isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setError(null);
    try {
      await parseConfirmation({
        text: text.trim() || undefined,
        imageBase64: imageBase64 ?? undefined,
        imageMimeType: imageBase64 ? 'image/jpeg' : undefined,
      });
    } catch (e: unknown) {
      setError(
        imageBase64
          ? "Couldn't read that — try pasting the confirmation text instead."
          : "Couldn't read that — try a screenshot instead."
      );
    }
  }, [isPending, text, imageBase64, parseConfirmation]);

  const canImport = (text.trim().length > 0 || !!imageBase64) && !isPending;
  const label = quotaLabel(quota);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <WalletHeader title="Import" onBack={handleBack} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: Spacing['4'], paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.intro, { color: colors.text.secondary }]}>
          Paste your confirmation email, or add a photo of a printed confirmation or a screenshot.
        </Text>

        {label && (
          <View style={[styles.quotaBadge, { backgroundColor: `${colors.brand.purple}1F` }]}>
            <Text style={[styles.quotaBadgeText, { color: colors.brand.purple }]}>{label}</Text>
          </View>
        )}

        <TextInput
          style={[
            styles.textInput,
            { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder, color: colors.text.primary },
          ]}
          value={text}
          onChangeText={setText}
          placeholder="Paste your confirmation email…"
          placeholderTextColor={colors.text.tertiary}
          multiline
        />

        {imageUri ? (
          <View style={styles.imagePreviewWrap}>
            <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
            <TouchableOpacity
              style={styles.removeImageBtn}
              onPress={removeImage}
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
              accessibilityLabel="Remove photo"
            >
              <X size={12} color="#fff" weight="bold" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.photoBtn, { backgroundColor: colors.background.sunken, borderColor: colors.background.cardBorder }]}
            onPress={pickImage}
            activeOpacity={0.75}
          >
            <Camera size={20} color={colors.text.secondary} weight="duotone" />
            <Text style={[styles.photoBtnText, { color: colors.text.secondary }]}>Add a photo instead</Text>
          </TouchableOpacity>
        )}

        {error ? <Text style={[styles.error, { color: colors.semantic.error }]}>{error}</Text> : null}

        <View style={styles.importButtonWrapper}>
          <Button
            label={isPending ? 'Reading…' : 'Import'}
            onPress={handleImport}
            loading={isPending}
            disabled={!canImport}
            variant="hero"
            size="lg"
            fullWidth
          />
        </View>

        <TouchableOpacity onPress={handleEnterManually} style={styles.manualLink} activeOpacity={0.7}>
          <Text style={[styles.manualLinkText, { color: colors.text.secondary }]}>Enter manually instead</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  intro: {
    fontSize: FontSize.base,
    lineHeight: 22,
    marginBottom: Spacing['4'],
  },
  quotaBadge: {
    alignSelf: 'flex-start',
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing['1'],
    paddingHorizontal: Spacing['3'],
    marginBottom: Spacing['4'],
  },
  quotaBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    fontSize: FontSize.base,
    minHeight: 140,
    textAlignVertical: 'top',
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    minHeight: 52,
    marginTop: Spacing['3'],
  },
  photoBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  imagePreviewWrap: {
    marginTop: Spacing['3'],
    alignSelf: 'flex-start',
  },
  imagePreview: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.md,
  },
  removeImageBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    fontSize: FontSize.sm,
    marginTop: Spacing['3'],
  },
  importButtonWrapper: {
    marginTop: Spacing['6'],
  },
  manualLink: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: Spacing['2'],
  },
  manualLinkText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
});
