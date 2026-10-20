import React, { useCallback, useState } from 'react';
import { Switch } from 'react-native';
import * as Haptics from 'expo-haptics';
import { doc, updateDoc } from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarBlank } from 'phosphor-react-native';
import { db } from '@/services/firebase';
import { requireOnline } from '@/services/offline';
import { SettingsRow } from '@/components/settings/SettingsRow';

/** "Show in calendar" for one booking (calendar spec §3): off hides it from the user's calendar feed. */
export function CalendarSwitchRow({ kind, item }: { kind: 'boarding_pass' | 'reservation'; item: { id: string; showInCalendar?: boolean } }) {
  const qc = useQueryClient();
  const [on, setOn] = useState(item.showInCalendar !== false);
  const handleChange = useCallback(async (next: boolean) => {
    if (!requireOnline()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOn(next);
    try {
      await updateDoc(doc(db, kind === 'boarding_pass' ? 'boarding_passes' : 'reservations', item.id), { showInCalendar: next });
      qc.invalidateQueries({ queryKey: [kind === 'boarding_pass' ? 'boardingPasses' : 'reservations'] });
    } catch {
      setOn(!next);
    }
  }, [kind, item.id, qc]);
  return (
    <SettingsRow
      label="Show in calendar"
      icon={CalendarBlank}
      accessory={<Switch value={on} onValueChange={handleChange} accessibilityLabel="Show in calendar" />}
    />
  );
}
