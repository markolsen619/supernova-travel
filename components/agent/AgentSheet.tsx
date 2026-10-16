import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ArrowUp, DotsThree, X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAgent } from '@/hooks/useAgent';
import { useLimitPaywall } from '@/hooks/useLimitPaywall';
import { ProposalCard } from '@/components/agent/ProposalCard';
import { StarMark } from '@/components/ui/StarMark';
import { agentSuggestions, quotaLine } from '@/utils/agentCard';
import type { TripWithDays } from '@/types';
import type { AgentOp } from '@/types/agent';

export function AgentSheet({ visible, trip, onClose }: { visible: boolean; trip: TripWithDays; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const agent = useAgent({ surface: 'trip', trip, enabled: visible });
  const openPaywall = useLimitPaywall();
  const [text, setText] = useState('');
  const [applying, setApplying] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ label: string; run: (() => Promise<void>) | null } | null>(null);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50); }, [agent.messages.length]);
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 10_000); return () => clearTimeout(t); }, [undo]);

  const send = useCallback(async (value?: string) => {
    const msg = (value ?? text).trim();
    if (!msg) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setText('');
    const r = await agent.send(msg);
    if (r === 'limit') openPaywall();
    // Put it back so a retry is one tap — and reuses the same request (no second charge).
    if (r === 'error') setText(msg);
  }, [text, agent, openPaywall]);

  const confirmDrops = useCallback((warning: string) => new Promise<boolean>((resolve) => {
    Alert.alert('Remove days with stops?', warning, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Apply', style: 'destructive', onPress: () => resolve(true) },
    ]);
  }), []);

  const apply = useCallback(async (messageId: string, ops: AgentOp[]) => {
    setApplying(messageId); // the Apply button fires its own Medium haptic
    setApplyError(null);
    try {
      const r = await agent.apply(messageId, ops, confirmDrops);
      if (r.applied) {
        const label = r.skipped ? `Changed ${r.applied} · ${r.skipped} no longer fit` : `Changed ${r.applied} thing${r.applied === 1 ? '' : 's'}`;
        setUndo({ label, run: r.undo });
      }
    } catch {
      setApplyError("Some changes couldn't be saved. Check the trip and try again.");
    } finally {
      setApplying(null);
    }
  }, [agent, confirmDrops]);

  const menu = useCallback(() => {
    Alert.alert('Conversation', undefined, [
      { text: 'Clear conversation', style: 'destructive', onPress: () => agent.clear() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [agent]);

  const q = agent.quota ? quotaLine(agent.quota) : null;
  const empty = !agent.loading && agent.messages.length === 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background.primary }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{trip.title.toUpperCase()}</Text>
            <Text style={[styles.title, { color: colors.text.primary }]}>Ask Nova</Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity onPress={menu} style={styles.iconButton} accessibilityLabel="Conversation options"><DotsThree size={24} color={colors.text.secondary} weight="bold" /></TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.iconButton} accessibilityLabel="Close"><X size={22} color={colors.text.secondary} weight="bold" /></TouchableOpacity>
          </View>
        </View>

        <ScrollView ref={scroll} style={styles.flex} contentContainerStyle={styles.content} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
          {agent.loading && <ActivityIndicator color={colors.text.tertiary} />}
          {empty && (
            <View style={styles.empty}>
              <StarMark size={40} />
              <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>Plan with Nova</Text>
              <Text style={[styles.emptyBody, { color: colors.text.secondary }]}>Ask for changes — nothing happens until you accept.</Text>
              {agentSuggestions(trip).map((s) => (
                <TouchableOpacity key={s} onPress={() => send(s)} style={[styles.chip, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]} accessibilityRole="button">
                  <Text style={{ color: colors.text.primary }}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {agent.messages.map((m) => (
            <View key={m.id} style={m.role === 'user' ? styles.mine : styles.theirs}>
              <View style={[styles.bubble, m.role === 'user' ? { backgroundColor: colors.text.primary } : { backgroundColor: colors.background.card }]}>
                <Text style={{ color: m.role === 'user' ? colors.background.primary : colors.text.primary, fontSize: 15, lineHeight: 22 }}>{m.text}</Text>
              </View>
              {m.role === 'assistant' && m.operations.length > 0 && (
                <ProposalCard message={m} trip={trip} busy={applying === m.id} onApply={(ops) => apply(m.id, ops)} onDismiss={() => agent.dismiss(m.id)} />
              )}
            </View>
          ))}
          {agent.sending && <Text style={[styles.typing, { color: colors.text.tertiary }]}>Nova is thinking…</Text>}
          {(applyError ?? agent.error) && <Text style={[styles.typing, { color: colors.semantic.error }]}>{applyError ?? agent.error}</Text>}
        </ScrollView>

        {undo && (
          <View style={[styles.undo, { backgroundColor: colors.text.primary }]}>
            <Text style={{ color: colors.background.primary, flex: 1 }}>{undo.label}</Text>
            {undo.run && (
              <TouchableOpacity onPress={async () => { const run = undo.run; setUndo(null); await run?.(); }} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Undo">
                <Text style={{ color: colors.background.primary, fontWeight: '600' }}>Undo</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12), borderTopColor: colors.background.cardBorder }]}>
          {q && <Text style={[styles.quota, { color: colors.text.tertiary }]}>{q}</Text>}
          <View style={styles.inputRow}>
            <TextInput
              value={text} onChangeText={setText} placeholder="Ask for a change" placeholderTextColor={colors.text.tertiary}
              style={[styles.input, { color: colors.text.primary, backgroundColor: colors.background.card }]} maxLength={500} multiline
              onSubmitEditing={() => send()} returnKeyType="send" blurOnSubmit
            />
            <TouchableOpacity onPress={() => send()} disabled={!text.trim() || agent.sending} style={[styles.send, { backgroundColor: text.trim() ? colors.text.primary : colors.background.card }]} accessibilityLabel="Send">
              <ArrowUp size={20} color={text.trim() ? colors.background.primary : colors.text.tertiary} weight="bold" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  headerButtons: { flexDirection: 'row' },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 11, fontWeight: '500', letterSpacing: 0.9 },
  title: { fontSize: 26, fontWeight: '600', letterSpacing: -0.5 },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  empty: { alignItems: 'center', gap: 10, paddingTop: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '500' },
  emptyBody: { fontSize: 15, textAlign: 'center', marginBottom: 8 },
  chip: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center', alignSelf: 'stretch', alignItems: 'center' },
  mine: { alignItems: 'flex-end' },
  theirs: { alignItems: 'stretch' },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '88%' },
  typing: { fontSize: 13 },
  undo: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 8, borderRadius: 12, paddingLeft: 16 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 10, gap: 6 },
  quota: { fontSize: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15, maxHeight: 120 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
