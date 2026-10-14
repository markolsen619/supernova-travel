import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ArrowsDownUp, ArrowRight, CalendarBlank, CheckSquare, MapTrifold, Minus, PencilSimple, Plus, Square } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { ACTIVITY_ICONS } from '@/constants/icons';
import { Button } from '@/components/ui/Button';
import { opLine } from '@/utils/agentCard';
import type { TripWithDays } from '@/types';
import type { AgentMessage, AgentOp } from '@/types/agent';

const ICON = { add: Plus, remove: Minus, move: ArrowRight, reorder: ArrowsDownUp, edit: PencilSimple, route: MapTrifold, dates: CalendarBlank } as const;

export function ProposalCard({ message, trip, busy, onApply, onDismiss }: {
  message: AgentMessage; trip: TripWithDays; busy: boolean;
  onApply: (ops: AgentOp[]) => void; onDismiss: () => void;
}) {
  const { colors } = useTheme();
  const lines = useMemo(() => message.operations.map((op) => ({ op, line: opLine(op, trip) })), [message.operations, trip]);
  const [off, setOff] = useState<Set<number>>(new Set());
  const done = message.status && message.status !== 'proposed';
  const chosen = lines.filter((l, i) => l.line && !off.has(i)).map((l) => l.op);

  const toggle = useCallback((i: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOff((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });
  }, []);
  const apply = useCallback(() => onApply(chosen), [onApply, chosen]);

  return (
    <View style={[styles.card, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}>
      <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{done ? (message.status === 'dismissed' ? 'NOT APPLIED' : 'APPLIED') : 'PROPOSED CHANGES'}</Text>
      {lines.map(({ line }, i) => {
        if (!line) return <Text key={i} style={[styles.stale, { color: colors.text.tertiary }]}>This change no longer fits the trip</Text>;
        const TypeIcon = line.type ? ACTIVITY_ICONS[line.type] : null;
        const Glyph = ICON[line.icon];
        const on = !off.has(i);
        return (
          <TouchableOpacity key={i} disabled={!!done} onPress={() => toggle(i)} style={styles.row} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={line.text}>
            {!done && (on ? <CheckSquare size={20} color={colors.text.primary} weight="fill" /> : <Square size={20} color={colors.text.tertiary} />)}
            {TypeIcon ? <TypeIcon.Icon size={18} color={TypeIcon.color} weight="duotone" /> : <Glyph size={18} color={colors.text.secondary} weight="bold" />}
            <Text style={[styles.line, { color: on || done ? colors.text.primary : colors.text.tertiary }]} numberOfLines={2}>{line.text}</Text>
          </TouchableOpacity>
        );
      })}
      {!done && (
        <View style={styles.actions}>
          <Button label={chosen.length === 1 ? 'Apply 1 change' : `Apply ${chosen.length} changes`} onPress={apply} loading={busy} disabled={!chosen.length || busy} size="md" />
          <TouchableOpacity onPress={onDismiss} style={styles.textLink} accessibilityRole="button"><Text style={{ color: colors.text.secondary }}>Not now</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10, marginTop: 8 },
  eyebrow: { fontSize: 11, fontWeight: '500', letterSpacing: 0.9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  line: { flex: 1, fontSize: 15, lineHeight: 21 },
  stale: { fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  textLink: { minHeight: 44, justifyContent: 'center' },
});
