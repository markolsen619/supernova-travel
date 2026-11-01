/**
 * Invite on a trip's card (Home's Today/next trip, your upcoming trips on Profile; spec 2026-10-30): a round button
 * over the cover that opens the invite sheet for that trip. Only for people on the trip.
 */
import { memo, useCallback, useState } from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { UserPlus } from 'phosphor-react-native';
import { useAuthStore } from '@/stores/useAuthStore';
import { InviteFriendsSheet } from '@/components/trip/InviteFriendsSheet';
import { Spacing } from '@/constants/spacing';
import type { Trip } from '@/types';

/** `style` moves it, e.g. below a card's own corner badge. */
export const InviteButton = memo(function InviteButton({ trip, style }: { trip: Trip; style?: ViewStyle }) {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setVisible(true); }, []);
  const close = useCallback(() => setVisible(false), []);
  const onTrip = !!uid && (trip.authorUid === uid || (trip.collaborators ?? []).includes(uid));
  if (!onTrip) return null;
  return (
    <>
      <Pressable onPress={open} style={[styles.btn, style]} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Invite to ${trip.title}`}>
        <UserPlus size={18} color="#fff" weight="bold" />
      </Pressable>
      <InviteFriendsSheet visible={visible} tripId={trip.id} collaborators={trip.collaborators ?? []} onClose={close} />
    </>
  );
});

const styles = StyleSheet.create({
  btn: {
    position: 'absolute', top: Spacing['3'], right: Spacing['3'], width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
});
