import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useBoardingPasses } from '@/hooks/useBoardingPasses';
import { BoardingPassCard } from '@/components/wallet/BoardingPassCard';
import { BarcodeDisplay } from '@/components/wallet/BarcodeDisplay';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

export default function BoardingPassDetailScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { boardingPasses, deletePass } = useBoardingPasses();

  const pass = boardingPasses.find((p) => p.id === id);

  const handleDelete = () => {
    Alert.alert(
      'Delete Boarding Pass',
      'Are you sure you want to delete this boarding pass?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (pass) {
              deletePass.mutate(pass.id, {
                onSuccess: () => router.back(),
              });
            }
          },
        },
      ],
    );
  };

  if (!pass) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + Spacing['4'], borderBottomColor: colors.background.cardBorder },
          ]}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={[styles.backText, { color: colors.brand.purple }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text.primary }]}>Boarding Pass</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.centered}>
          <Text style={[styles.notFoundText, { color: colors.text.tertiary }]}>
            Boarding pass not found.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Spacing['4'],
            borderBottomColor: colors.background.cardBorder,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={[styles.backText, { color: colors.brand.purple }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text.primary }]}>Boarding Pass</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: Spacing['4'], paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Pass card */}
        <BoardingPassCard pass={pass} onPress={() => {}} />

        {/* Barcode */}
        {pass.barcode ? (
          <View style={[styles.barcodeSection, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}>
            <Text style={[styles.barcodeSectionTitle, { color: colors.text.secondary }]}>
              Scan at Gate
            </Text>
            <BarcodeDisplay barcode={pass.barcode} />
          </View>
        ) : null}

        {/* Delete button */}
        <TouchableOpacity
          style={[styles.deleteButton, { borderColor: colors.semantic.error }]}
          onPress={handleDelete}
          activeOpacity={0.8}
        >
          <Text style={[styles.deleteButtonText, { color: colors.semantic.error }]}>
            Delete Boarding Pass
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['4'],
    borderBottomWidth: 1,
  },
  backButton: {
    width: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backText: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  scroll: {
    flex: 1,
  },
  barcodeSection: {
    marginHorizontal: Spacing['4'],
    marginBottom: Spacing['4'],
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing['5'],
    alignItems: 'center',
    gap: Spacing['4'],
  },
  barcodeSectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  deleteButton: {
    marginHorizontal: Spacing['4'],
    marginTop: Spacing['4'],
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing['4'],
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundText: {
    fontSize: FontSize.base,
  },
});
