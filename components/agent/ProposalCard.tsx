import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ArrowsDownUp, ArrowRight, CalendarBlank, CheckSquare, MapTrifold, Minus, PencilSimple, Plus, Square } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { ACTIVITY_ICONS } from '@/constants/icons';
import { Button } from '@/components/ui/Button';
import { cardLines } from '@/utils/agentCard';
import { useAgentGrounding } from '@/hooks/useAgentGrounding';
import type { NovaGround } from '@/utils/agentGround';
import type { TripWithDays } from '@/types';
import type { AgentMessage, AgentOp } from '@/types/agent';

const ICON = { add: Plus, remove: Minus, move: ArrowRight, reorder: ArrowsDownUp, edit: PencilSimple, route: MapTrifold, dates: CalendarBlank } as const;

export function ProposalCard({ message, trip, busy, onApply, onDismiss }: {
  message: AgentMessage; trip: TripWithDays; busy: boolean;
  onApply: (ops: AgentOp[], grounded: Record<number, NovaGround>) => void; onDismiss: () => void;
}) {
  const { colors } = useTheme();
  const done = !!message.status && message.status !== 'proposed';
  // New places are found on the map before Apply is enabled (spec §3): a line that isn't nearby can't be ticked.
  const { grounded, pending } = useAgentGrounding(message, trip);
  const lines = useMemo(() => cardLines(message.operations, trip, done, grounded, pending), [message.operations, trip, done, grounded, pending]);
  const [off, setOff] = useState<Set<number>>(new Set());
  const chosenLines = lines.filter((l) => l.line && !l.line.unavailable && !off.has(l.index));
  const chosen = chosenLines.map((l) => l.op);

  const toggle = useCallback((i: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOff((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });
  }, []);
  const apply = useCallback(() => {
    // Grounding is keyed by the message's operation index; re-key it for the chosen subset.
    const map: Record<number, NovaGround> = {};
    chosenLines.forEach((l, k) => { if (grounded[l.index]) map[k] = grounded[l.index]; });
    onApply(chosen, map);
  }, [onApply, chosen, chosenLines, grounded]);

  return (
    <View style={[styles.card, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}>
      <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{done ? (message.status === 'dismissed' ? 'NOT APPLIED' : message.status === 'partial' ? 'PARTLY APPLIED' : 'APPLIED') : 'PROPOSED CHANGES'}</Text>
      {lines.map(({ line, index: i }) => {
        if (!line) return <Text key={i} style={[styles.stale, { color: colors.text.tertiary }]}>This change no longer fits the trip</Text>;
        const TypeIcon = line.type ? ACTIVITY_ICONS[line.type] : null;
        const Glyph = ICON[line.icon];
        const on = !off.has(i) && !line.unavailable;
        return (
          <TouchableOpacity key={i} disabled={!!done || !!line.unavailable} onPress={() => toggle(i)} style={styles.row} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: !!line.unavailable }} accessibilityLabel={line.detail ? `${line.text}, ${line.detail}` : line.text}>
            {!done && (on ? <CheckSquare size={20} color={colors.text.primary} weight="fill" /> : <Square size={20} color={colors.text.tertiary} />)}
            {TypeIcon ? <TypeIcon.Icon size={18} color={line.unavailable ? colors.text.tertiary : TypeIcon.color} weight="duotone" /> : <Glyph size={18} color={colors.text.secondary} weight="bold" />}
            <View style={styles.lineText}>
              <Text style={[styles.line, { color: on || done ? colors.text.primary : colors.text.tertiary }]} numberOfLines={2}>{line.text}</Text>
              {line.detail && <Text style={[styles.detail, { color: colors.text.tertiary }]} numberOfLines={1}>{line.detail}</Text>}
            </View>
          </TouchableOpacity>
        );
      })}
      {!done && (
        <View style={styles.actions}>
          <Button label={chosen.length === 1 ? 'Apply 1 change' : `Apply ${chosen.length} changes`} onPress={apply} loading={busy} disabled={!chosen.length || busy || pending} size="md" />
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
  lineText: { flex: 1 },
  line: { fontSize: 15, lineHeight: 21 },
  detail: { fontSize: 13, lineHeight: 18 },
  stale: { fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  textLink: { minHeight: 44, justifyContent: 'center' },
});
