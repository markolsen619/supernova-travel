# Travel Wallet Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the three disconnected wallet screens (boarding passes, reservations, loyalty programs) into one hub, close the CRUD gaps (no add-reservation screen, no edit anywhere), and replace raw text-entry dates with a proper picker — per `docs/superpowers/specs/2026-07-27-travel-wallet-redesign-design.md`.

**Architecture:** Two new shared components (`WalletHeader`, `DateField`) extracted from patterns already proven elsewhere in the codebase (the 8x-duplicated wallet header, and `sign-up.tsx`'s date-of-birth picker). Each of the three item types gets one form screen that serves both add and edit, switched by an optional `?id=` query param. A new unified hub screen (`app/(wallet)/index.tsx`) replaces the three old list screens as the entry point, with a four-segment filter (All/Flights/Reservations/Loyalty) over the same three existing data hooks.

**Tech Stack:** React Native (Expo Router), TanStack Query, Firebase Firestore, `@react-native-community/datetimepicker` (already a project dependency), Jest for the one pure-logic unit test.

## Global Constraints

- All components use `const { colors } = useTheme()` — no screen or component in this plan is an always-dark exception (the existing dark `BoardingPassCard` is untouched by this plan; nothing new introduces a dark screen).
- Dynamic/theme-dependent colors go in inline styles only, never inside `StyleSheet.create`.
- `useCallback` required for all event handlers passed as props to child components.
- `@/` path alias for all imports.
- Haptics: `Light` on nav/select (back, segment switch, opening a picker), `Medium` on create/add/destructive (submit, delete) — matching the haptic level every existing wallet screen already uses at each of those call sites.
- Touch targets ≥44pt.
- Icon + color pairs always come from `constants/icons.ts` maps — never hard-coded inline for typed entities (`RESERVATION_ICONS`, `LOYALTY_ICONS`).
- `FlashList` is not required here — every list in this plan matches the existing wallet screens' use of plain `ScrollView` (these lists are short, bounded, user-owned collections, not paginated feeds).
- No Firestore migration needed anywhere in this plan — new fields (`terminal`) are optional, and security rules already permit `update` on all three wallet collections for the document owner (`firestore.rules:285-300`).

---

## Task 1: Types + icons — `terminal` field and `show` reservation type

**Files:**
- Modify: `types/index.ts`
- Modify: `constants/icons.ts`

**Interfaces:**
- Produces: `BoardingPass.terminal?: string` — consumed by Task 6 (boarding pass form) and Task 9 (detail screen, if it chooses to display it — optional, see Task 9).
- Produces: `ReservationType` gains `'show'` as a member — consumed by Task 7 (reservation form) and already automatically covered by `RESERVATION_ICONS: Record<ReservationType, IconEntry>`'s type (TypeScript will require the new key).

- [ ] **Step 1: Add `terminal` to `BoardingPass` in `types/index.ts`**

Find the `BoardingPass` interface (currently at line 361) and add `terminal` immediately after `gate`:

```ts
export interface BoardingPass {
  id: string;
  ownerUid: string;
  airline: string;
  flightNumber: string;
  origin: string;           // IATA airport code, e.g. "JFK"
  originCity: string;
  destination: string;      // IATA airport code, e.g. "LHR"
  destinationCity: string;
  departureTime: string;    // ISO 8601
  arrivalTime?: string;     // ISO 8601
  seat?: string;
  boardingGroup?: string;
  gate?: string;
  terminal?: string;        // new — not yet populated by any automated flow; manual entry only until the future flight-monitoring project
  barcode?: string;         // raw barcode string
  barcodeFormat?: BarcodeFormat;
  status: BoardingPassStatus;
  createdAt: string;        // ISO 8601
}
```

- [ ] **Step 2: Add `'show'` to `ReservationType` in `types/index.ts`**

Find the `ReservationType` line (currently line 381) and change it to:

```ts
export type ReservationType = 'hotel' | 'airbnb' | 'rental_car' | 'restaurant' | 'activity' | 'show';
```

- [ ] **Step 3: Run typecheck to confirm the new type member forces an update to `RESERVATION_ICONS`**

Run: `cd /Users/markolsen/Projects/supernova-travel && npx tsc --noEmit`
Expected: a NEW error in `constants/icons.ts` — `Property 'show' is missing in type '{ hotel: ...; ... }' but required in type 'Record<ReservationType, IconEntry>'`. This confirms the type change is wired correctly; Step 4 fixes it.

- [ ] **Step 4: Add the `show` entry to `RESERVATION_ICONS` in `constants/icons.ts`**

Add `Confetti` to the import list at the top of the file:

```ts
import {
  AirplaneTilt,
  Buildings,
  ForkKnife,
  Ticket,
  Car,
  Clock,
  House,
  Compass,
  MagnifyingGlass,
  User,
  Sparkle,
  VideoCamera,
  Bell,
  Bag,
  Star,
  CreditCard,
  Globe,
  Users,
  LockSimple,
  DotsThree,
  Confetti,
} from 'phosphor-react-native';
```

Then update `RESERVATION_ICONS`:

```ts
export const RESERVATION_ICONS: Record<ReservationType, IconEntry> = {
  hotel:      { Icon: Buildings, color: '#a78bfa' },
  airbnb:     { Icon: House,     color: '#f472b6' },
  rental_car: { Icon: Car,       color: '#fbbf24' },
  restaurant: { Icon: ForkKnife, color: '#f472b6' },
  activity:   { Icon: Ticket,    color: '#34d399' },
  show:       { Icon: Confetti,  color: '#f472b6' },
};
```

- [ ] **Step 5: Run typecheck to confirm it's now clean**

Run: `npx tsc --noEmit`
Expected: no errors outside the pre-existing, unrelated `functions/` directory errors (a separate TypeScript project for Cloud Functions).

- [ ] **Step 6: Commit**

```bash
git add types/index.ts constants/icons.ts
git commit -m "feat: add terminal field to BoardingPass and show reservation type"
```

---

## Task 2: `combineDateAndTime` pure helper (TDD)

**Files:**
- Create: `utils/date.ts`
- Test: `__tests__/utils/date.test.ts`

**Interfaces:**
- Produces: `export function combineDateAndTime(date: Date, time: Date): string` — used by Task 6 (boarding pass form) to merge the separately-picked departure date and time into one ISO 8601 string on submit.

- [ ] **Step 1: Write the failing test**

Create `__tests__/utils/date.test.ts`:

```ts
import { combineDateAndTime } from '@/utils/date';

describe('combineDateAndTime', () => {
  it('combines the date components of `date` with the time components of `time`', () => {
    const date = new Date(2025, 7, 15, 3, 0, 0); // Aug 15 2025, arbitrary time
    const time = new Date(2020, 0, 1, 14, 30, 0); // arbitrary date, 2:30 PM
    const result = new Date(combineDateAndTime(date, time));
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(7);
    expect(result.getDate()).toBe(15);
    expect(result.getHours()).toBe(14);
    expect(result.getMinutes()).toBe(30);
  });

  it('keeps the date-of-month from `date`, unaffected by a late time-of-day', () => {
    const date = new Date(2025, 0, 1);
    const time = new Date(2020, 5, 15, 23, 45, 0);
    const result = new Date(combineDateAndTime(date, time));
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(45);
  });

  it('returns a valid ISO 8601 string', () => {
    const date = new Date(2025, 7, 15);
    const time = new Date(2025, 7, 15, 9, 0, 0);
    const result = combineDateAndTime(date, time);
    expect(() => new Date(result)).not.toThrow();
    expect(new Date(result).toISOString()).toBe(result);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/markolsen/Projects/supernova-travel && npx jest __tests__/utils/date.test.ts`
Expected: FAIL — `Cannot find module '@/utils/date'` (file doesn't exist yet).

- [ ] **Step 3: Create `utils/date.ts`**

```ts
/** Merges the date-of-month from `date` with the time-of-day from `time` into
 * one ISO 8601 string. Used where a form picks date and time-of-day with two
 * separate DateTimePicker fields (see components/wallet/DateField.tsx) — the
 * native picker's own return value for a `mode="date"` pick can carry
 * unrelated time-of-day components (and vice versa for `mode="time"`), so the
 * two picks are combined explicitly rather than trusting either Date object
 * on its own. */
export function combineDateAndTime(date: Date, time: Date): string {
  const combined = new Date(date);
  combined.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), time.getMilliseconds());
  return combined.toISOString();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/utils/date.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add utils/date.ts __tests__/utils/date.test.ts
git commit -m "feat: add combineDateAndTime helper for wallet date/time pickers"
```

---

## Task 3: `WalletHeader` shared component

**Files:**
- Create: `components/wallet/WalletHeader.tsx`

**Interfaces:**
- Consumes: `useTheme()`, `StarMark` from `components/ui/StarMark.tsx` (existing), `useSafeAreaInsets` from `react-native-safe-area-context` (existing dependency), `PhosphorIcon` type from `constants/icons.ts` (existing).
- Produces: `export function WalletHeader(props: { title: string; onBack: () => void; rightAction?: { icon: PhosphorIcon; onPress: () => void; label: string } }): JSX.Element` — used by Task 6, 7, 8 (add/edit forms), Task 9 (detail screens), Task 10 (hub screen).

This extracts the identical header markup currently hand-rolled in all 8 existing wallet screens (see e.g. `app/(wallet)/boarding-passes.tsx:38-62`) into one component.

- [ ] **Step 1: Create `components/wallet/WalletHeader.tsx`**

```tsx
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { StarMark } from '@/components/ui/StarMark';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import type { PhosphorIcon } from '@/constants/icons';

interface WalletHeaderProps {
  title: string;
  onBack: () => void;
  rightAction?: { icon: PhosphorIcon; onPress: () => void; label: string };
}

// The back/star/title/[action] header every wallet screen used to hand-roll
// identically (see the pre-redesign app/(wallet)/boarding-passes.tsx) — one
// shared component instead of an 8th, 9th, 10th copy.
export function WalletHeader({ title, onBack, rightAction }: WalletHeaderProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const RightIcon = rightAction?.icon;

  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + Spacing['4'], borderBottomColor: colors.background.cardBorder },
      ]}
    >
      <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityLabel="Back">
        <ArrowLeft size={20} color={colors.text.primary} weight="regular" />
      </TouchableOpacity>

      <View style={styles.titleGroup}>
        <StarMark size={18} />
        <Text style={[styles.title, { color: colors.text.primary }]}>{title}</Text>
      </View>

      {rightAction && RightIcon ? (
        <TouchableOpacity
          onPress={rightAction.onPress}
          style={styles.rightButton}
          accessibilityLabel={rightAction.label}
        >
          <RightIcon size={20} color={colors.text.primary} weight="bold" />
        </TouchableOpacity>
      ) : (
        <View style={styles.rightButton} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['4'],
    borderBottomWidth: 1,
  },
  backButton: { width: 44, minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' },
  rightButton: { width: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.semiBold },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/wallet/WalletHeader.tsx
git commit -m "feat: add shared WalletHeader component"
```

---

## Task 4: `DateField` shared date/time picker component

**Files:**
- Create: `components/wallet/DateField.tsx`

**Interfaces:**
- Consumes: `useTheme()`, `DateTimePicker` from `@react-native-community/datetimepicker` (existing dependency, already used in `app/(auth)/sign-up.tsx`).
- Produces: `export function DateField(props: { label: string; value: Date | null; onChange: (date: Date) => void; mode: 'date' | 'time'; placeholder: string; minimumDate?: Date; maximumDate?: Date }): JSX.Element` — used by Task 6 (departure date + departure time), Task 7 (check-in + check-out), Task 8 (expiry date).

This extracts the iOS-modal-spinner / Android-native-dialog pattern already proven in `app/(auth)/sign-up.tsx:451-486` into a reusable field, generalized from a single date-of-birth picker into a `date`-or-`time` mode field usable across the three wallet forms.

- [ ] **Step 1: Create `components/wallet/DateField.tsx`**

```tsx
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CalendarBlank, Clock } from 'phosphor-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

interface DateFieldProps {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
  mode: 'date' | 'time';
  placeholder: string;
  minimumDate?: Date;
  maximumDate?: Date;
}

// The iOS-modal-spinner / Android-native-dialog date picker pattern
// app/(auth)/sign-up.tsx established for date-of-birth entry, generalized
// into a date-or-time field reused across the three wallet forms.
export function DateField({
  label,
  value,
  onChange,
  mode,
  placeholder,
  minimumDate,
  maximumDate,
}: DateFieldProps) {
  const { colors } = useTheme();
  const [showPicker, setShowPicker] = useState(false);

  const openPicker = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPicker(true);
  }, []);

  const closePicker = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPicker(false);
  }, []);

  const handleChange = useCallback(
    (_: unknown, selectedDate?: Date) => {
      if (Platform.OS === 'android') setShowPicker(false);
      if (selectedDate) onChange(selectedDate);
    },
    [onChange]
  );

  const formattedValue = value
    ? mode === 'date'
      ? value.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : value.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : placeholder;

  const Icon = mode === 'date' ? CalendarBlank : Clock;

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text.secondary }]}>{label}</Text>
      <TouchableOpacity
        style={[
          styles.input,
          { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
        ]}
        onPress={openPicker}
        activeOpacity={0.8}
      >
        <Icon size={18} color={value ? colors.text.primary : colors.text.tertiary} weight="regular" />
        <Text style={[styles.valueText, { color: value ? colors.text.primary : colors.text.tertiary }]}>
          {formattedValue}
        </Text>
      </TouchableOpacity>

      {Platform.OS === 'ios' && showPicker && (
        <Modal transparent animationType="slide">
          <View style={styles.pickerOverlay}>
            <TouchableOpacity style={styles.pickerBackdrop} onPress={closePicker} />
            <View style={[styles.pickerSheet, { backgroundColor: colors.background.elevated }]}>
              <View style={[styles.pickerHeader, { borderBottomColor: colors.background.cardBorder }]}>
                <TouchableOpacity onPress={closePicker} hitSlop={8}>
                  <Text style={[styles.pickerDone, { color: colors.brand.purple }]}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={value ?? new Date()}
                mode={mode}
                display="spinner"
                onChange={handleChange}
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                textColor={colors.text.primary}
              />
            </View>
          </View>
        </Modal>
      )}

      {Platform.OS === 'android' && showPicker && (
        <DateTimePicker
          value={value ?? new Date()}
          mode={mode}
          display="default"
          onChange={handleChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: Spacing['4'] },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, marginBottom: Spacing['1'] },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    minHeight: 44,
  },
  valueText: { fontSize: FontSize.base, flex: 1 },
  pickerOverlay: { flex: 1, justifyContent: 'flex-end' },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerSheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingBottom: 32,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: Spacing['4'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerDone: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/wallet/DateField.tsx
git commit -m "feat: add shared DateField component for wallet date/time entry"
```

---

## Task 5: Add `update*` mutations to the three wallet hooks

**Files:**
- Modify: `hooks/useBoardingPasses.ts`
- Modify: `hooks/useReservations.ts`
- Modify: `hooks/useLoyaltyPrograms.ts`

**Interfaces:**
- Produces: `useBoardingPasses()` return value gains `updatePass: UseMutationResult<void, Error, Partial<BoardingPass> & { id: string }>` — used by Task 6.
- Produces: `useReservations()` return value gains `updateReservation: UseMutationResult<void, Error, Partial<Reservation> & { id: string }>` — used by Task 7.
- Produces: `useLoyaltyPrograms()` return value gains `updateProgram: UseMutationResult<void, Error, Partial<LoyaltyProgram> & { id: string }>` — used by Task 8.

Firestore rules already permit `update` for the document owner on all three collections — no rules change needed.

- [ ] **Step 1: Add `updatePass` to `hooks/useBoardingPasses.ts`**

Add `updateDoc` to the existing `firebase/firestore` import, then add the mutation and include it in the return value:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { BoardingPass } from '@/types';

export function useBoardingPasses() {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const queryClient = useQueryClient();

  const { data: boardingPasses = [], isLoading } = useQuery({
    queryKey: ['boardingPasses', uid],
    enabled: !!uid,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      if (!uid) return [];
      const q = query(
        collection(db, 'boarding_passes'),
        where('ownerUid', '==', uid),
        orderBy('departureTime', 'asc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as BoardingPass));
    },
  });

  const addPass = useMutation({
    mutationFn: async (pass: Omit<BoardingPass, 'id'>) => {
      await addDoc(collection(db, 'boarding_passes'), pass);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boardingPasses', uid] }),
  });

  const updatePass = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<BoardingPass> & { id: string }) => {
      await updateDoc(doc(db, 'boarding_passes', id), updates);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boardingPasses', uid] }),
  });

  const deletePass = useMutation({
    mutationFn: async (passId: string) => {
      await deleteDoc(doc(db, 'boarding_passes', passId));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boardingPasses', uid] }),
  });

  return { boardingPasses, isLoading, addPass, updatePass, deletePass };
}
```

- [ ] **Step 2: Add `updateReservation` to `hooks/useReservations.ts`**

Same shape, substituting the collection name and type:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { Reservation } from '@/types';

export function useReservations() {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const queryClient = useQueryClient();

  const { data: reservations = [], isLoading } = useQuery({
    queryKey: ['reservations', uid],
    enabled: !!uid,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      if (!uid) return [];
      const q = query(
        collection(db, 'reservations'),
        where('ownerUid', '==', uid),
        orderBy('checkIn', 'asc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Reservation));
    },
  });

  const addReservation = useMutation({
    mutationFn: async (reservation: Omit<Reservation, 'id'>) => {
      await addDoc(collection(db, 'reservations'), reservation);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reservations', uid] }),
  });

  const updateReservation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Reservation> & { id: string }) => {
      await updateDoc(doc(db, 'reservations', id), updates);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reservations', uid] }),
  });

  const deleteReservation = useMutation({
    mutationFn: async (reservationId: string) => {
      await deleteDoc(doc(db, 'reservations', reservationId));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reservations', uid] }),
  });

  return { reservations, isLoading, addReservation, updateReservation, deleteReservation };
}
```

- [ ] **Step 3: Add `updateProgram` to `hooks/useLoyaltyPrograms.ts`**

Same shape again:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { LoyaltyProgram } from '@/types';

export function useLoyaltyPrograms() {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const queryClient = useQueryClient();

  const { data: loyaltyPrograms = [], isLoading } = useQuery({
    queryKey: ['loyaltyPrograms', uid],
    enabled: !!uid,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      if (!uid) return [];
      const q = query(
        collection(db, 'loyalty_programs'),
        where('ownerUid', '==', uid),
        orderBy('programName', 'asc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LoyaltyProgram));
    },
  });

  const addProgram = useMutation({
    mutationFn: async (program: Omit<LoyaltyProgram, 'id'>) => {
      await addDoc(collection(db, 'loyalty_programs'), program);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['loyaltyPrograms', uid] }),
  });

  const updateProgram = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<LoyaltyProgram> & { id: string }) => {
      await updateDoc(doc(db, 'loyalty_programs', id), updates);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['loyaltyPrograms', uid] }),
  });

  const deleteProgram = useMutation({
    mutationFn: async (programId: string) => {
      await deleteDoc(doc(db, 'loyalty_programs', programId));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['loyaltyPrograms', uid] }),
  });

  return { loyaltyPrograms, isLoading, addProgram, updateProgram, deleteProgram };
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add hooks/useBoardingPasses.ts hooks/useReservations.ts hooks/useLoyaltyPrograms.ts
git commit -m "feat: add update mutations to the three wallet hooks"
```

---

## Task 6: Boarding pass form — add + edit, terminal field, date/time pickers

**Files:**
- Modify: `app/(wallet)/boarding-pass/add.tsx` (full rewrite)

**Interfaces:**
- Consumes: `WalletHeader` (Task 3), `DateField` (Task 4), `combineDateAndTime` from `@/utils/date` (Task 2), `updatePass`/`addPass` from `useBoardingPasses()` (Task 5 for `updatePass`), `useLocalSearchParams` from `expo-router`.
- Produces: this screen now handles both `/(wallet)/boarding-pass/add` (add mode) and `/(wallet)/boarding-pass/add?id={passId}` (edit mode) — the `?id=` convention consumed by Task 9 (detail screen's Edit button).

- [ ] **Step 1: Replace the full contents of `app/(wallet)/boarding-pass/add.tsx`**

```tsx
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { WalletHeader } from '@/components/wallet/WalletHeader';
import { DateField } from '@/components/wallet/DateField';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/useAuthStore';
import { useBoardingPasses } from '@/hooks/useBoardingPasses';
import { combineDateAndTime } from '@/utils/date';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

interface FormState {
  airline: string;
  flightNumber: string;
  origin: string;
  originCity: string;
  destination: string;
  destinationCity: string;
  seat: string;
  gate: string;
  terminal: string;
}

const INITIAL_FORM: FormState = {
  airline: '',
  flightNumber: '',
  origin: '',
  originCity: '',
  destination: '',
  destinationCity: '',
  seat: '',
  gate: '',
  terminal: '',
};

export default function AddBoardingPassScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { boardingPasses, addPass, updatePass } = useBoardingPasses();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const isEditMode = !!id;
  const existing = id ? boardingPasses.find((p) => p.id === id) : undefined;

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [departureDate, setDepartureDate] = useState<Date | null>(null);
  const [departureTime, setDepartureTime] = useState<Date | null>(null);

  useEffect(() => {
    if (!existing) return;
    setForm({
      airline: existing.airline,
      flightNumber: existing.flightNumber,
      origin: existing.origin,
      originCity: existing.originCity,
      destination: existing.destination,
      destinationCity: existing.destinationCity,
      seat: existing.seat ?? '',
      gate: existing.gate ?? '',
      terminal: existing.terminal ?? '',
    });
    const existingDeparture = new Date(existing.departureTime);
    setDepartureDate(existingDeparture);
    setDepartureTime(existingDeparture);
  }, [existing]);

  const updateField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    if (!form.airline.trim() || !form.flightNumber.trim() || !form.origin.trim() || !form.destination.trim()) {
      Alert.alert('Missing details', 'Fill in airline, flight number, origin, and destination.');
      return;
    }
    if (!user?.uid) {
      Alert.alert('Not signed in');
      return;
    }

    const departureTimeIso =
      departureDate && departureTime
        ? combineDateAndTime(departureDate, departureTime)
        : new Date().toISOString();

    const fields = {
      airline: form.airline.trim(),
      flightNumber: form.flightNumber.trim().toUpperCase(),
      origin: form.origin.trim().toUpperCase(),
      originCity: form.originCity.trim(),
      destination: form.destination.trim().toUpperCase(),
      destinationCity: form.destinationCity.trim(),
      departureTime: departureTimeIso,
      seat: form.seat.trim() || undefined,
      gate: form.gate.trim() || undefined,
      terminal: form.terminal.trim() || undefined,
    };

    if (isEditMode && id) {
      updatePass.mutate(
        { id, ...fields },
        {
          onSuccess: () => router.back(),
          onError: () => Alert.alert('Save failed', "The pass didn't save. Try again."),
        },
      );
    } else {
      addPass.mutate(
        {
          ownerUid: user.uid,
          ...fields,
          status: 'upcoming',
          createdAt: new Date().toISOString(),
        },
        {
          onSuccess: () => router.back(),
          onError: () => Alert.alert('Save failed', "The pass didn't save. Try again."),
        },
      );
    }
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.background.card,
      borderColor: colors.background.cardBorder,
      color: colors.text.primary,
    },
  ];

  const labelStyle = [styles.label, { color: colors.text.secondary }];

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const isPending = addPass.isPending || updatePass.isPending;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <WalletHeader
        title={isEditMode ? 'Edit boarding pass' : 'Add boarding pass'}
        onBack={handleBack}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: Spacing['4'], paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Airline */}
        <Text style={labelStyle}>Airline</Text>
        <TextInput
          style={inputStyle}
          value={form.airline}
          onChangeText={(v) => updateField('airline', v)}
          placeholder="e.g. Delta Air Lines"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="words"
        />

        {/* Flight Number */}
        <Text style={labelStyle}>Flight number</Text>
        <TextInput
          style={inputStyle}
          value={form.flightNumber}
          onChangeText={(v) => updateField('flightNumber', v)}
          placeholder="e.g. DL405"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="characters"
        />

        {/* Origin row */}
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Text style={labelStyle}>Origin (IATA)</Text>
            <TextInput
              style={inputStyle}
              value={form.origin}
              onChangeText={(v) => updateField('origin', v)}
              placeholder="JFK"
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="characters"
              maxLength={3}
            />
          </View>
          <View style={styles.rowItem}>
            <Text style={labelStyle}>Origin city</Text>
            <TextInput
              style={inputStyle}
              value={form.originCity}
              onChangeText={(v) => updateField('originCity', v)}
              placeholder="New York"
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="words"
            />
          </View>
        </View>

        {/* Destination row */}
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Text style={labelStyle}>Destination (IATA)</Text>
            <TextInput
              style={inputStyle}
              value={form.destination}
              onChangeText={(v) => updateField('destination', v)}
              placeholder="LHR"
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="characters"
              maxLength={3}
            />
          </View>
          <View style={styles.rowItem}>
            <Text style={labelStyle}>Destination city</Text>
            <TextInput
              style={inputStyle}
              value={form.destinationCity}
              onChangeText={(v) => updateField('destinationCity', v)}
              placeholder="London"
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="words"
            />
          </View>
        </View>

        {/* Departure date & time */}
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <DateField
              label="Departure date"
              value={departureDate}
              onChange={setDepartureDate}
              mode="date"
              placeholder="Select date"
            />
          </View>
          <View style={styles.rowItem}>
            <DateField
              label="Departure time"
              value={departureTime}
              onChange={setDepartureTime}
              mode="time"
              placeholder="Select time"
            />
          </View>
        </View>

        {/* Seat, Gate & Terminal row */}
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Text style={labelStyle}>Seat</Text>
            <TextInput
              style={inputStyle}
              value={form.seat}
              onChangeText={(v) => updateField('seat', v)}
              placeholder="14A"
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="characters"
            />
          </View>
          <View style={styles.rowItem}>
            <Text style={labelStyle}>Gate</Text>
            <TextInput
              style={inputStyle}
              value={form.gate}
              onChangeText={(v) => updateField('gate', v)}
              placeholder="B22"
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="characters"
            />
          </View>
          <View style={styles.rowItem}>
            <Text style={labelStyle}>Terminal</Text>
            <TextInput
              style={inputStyle}
              value={form.terminal}
              onChangeText={(v) => updateField('terminal', v)}
              placeholder="4"
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="characters"
            />
          </View>
        </View>

        {/* Submit */}
        <Button
          label={isEditMode ? 'Save changes' : 'Add boarding pass'}
          onPress={handleSubmit}
          loading={isPending}
          disabled={isPending}
          variant="primary"
          size="lg"
          fullWidth
          style={styles.submitButton}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    marginBottom: Spacing['1'],
    marginTop: Spacing['4'],
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    fontSize: FontSize.base,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing['3'],
  },
  rowItem: {
    flex: 1,
  },
  submitButton: {
    marginTop: Spacing['6'],
  },
});
```

Note: `DateField` already renders its own `marginTop: Spacing['4']` on its wrapping `field` style, matching the vertical rhythm of the plain `label`/`input` pairs above it — the `rowItem` wrapper needs no extra spacing.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors in this file.

- [ ] **Step 4: Commit**

```bash
git add app/\(wallet\)/boarding-pass/add.tsx
git commit -m "feat: rewrite boarding pass form to support add and edit, add terminal field"
```

---

## Task 7: Reservation form — new file, add + edit, `show` type

**Files:**
- Create: `app/(wallet)/reservation/add.tsx`

**Interfaces:**
- Consumes: `WalletHeader` (Task 3), `DateField` (Task 4), `RESERVATION_ICONS` from `constants/icons.ts` (Task 1 for the `show` entry), `addReservation`/`updateReservation` from `useReservations()` (Task 5).
- Produces: this new screen handles both `/(wallet)/reservation/add` (add mode) and `/(wallet)/reservation/add?id={reservationId}` (edit mode) — consumed by Task 9 (detail screen's Edit button) and Task 10 (hub's add-button routing for the Reservations segment).

This is a new file — there is no existing reservation add screen to reference beyond the pattern already established by `app/(wallet)/loyalty/add.tsx`'s type-selector row, which this closely follows.

- [ ] **Step 1: Create `app/(wallet)/reservation/add.tsx`**

```tsx
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { WalletHeader } from '@/components/wallet/WalletHeader';
import { DateField } from '@/components/wallet/DateField';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/useAuthStore';
import { useReservations } from '@/hooks/useReservations';
import { RESERVATION_ICONS } from '@/constants/icons';
import { ReservationType } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

const RESERVATION_TYPES: { type: ReservationType; label: string }[] = [
  { type: 'hotel', label: 'Hotel' },
  { type: 'airbnb', label: 'Airbnb' },
  { type: 'rental_car', label: 'Rental car' },
  { type: 'restaurant', label: 'Restaurant' },
  { type: 'activity', label: 'Activity' },
  { type: 'show', label: 'Show' },
];

export default function AddReservationScreen() {
  const { colors } = useTheme();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const { reservations, addReservation, updateReservation } = useReservations();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const isEditMode = !!id;
  const existing = id ? reservations.find((r) => r.id === id) : undefined;

  const [type, setType] = useState<ReservationType>('hotel');
  const [title, setTitle] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);

  useEffect(() => {
    if (!existing) return;
    setType(existing.type);
    setTitle(existing.title);
    setConfirmationCode(existing.confirmationCode);
    setAddress(existing.address ?? '');
    setNotes(existing.notes ?? '');
    setCheckIn(existing.checkIn ? new Date(existing.checkIn) : null);
    setCheckOut(existing.checkOut ? new Date(existing.checkOut) : null);
  }, [existing]);

  const handleSelectType = useCallback((t: ReservationType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setType(t);
  }, []);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const handleSubmit = useCallback(() => {
    if (!title.trim() || !confirmationCode.trim()) {
      Alert.alert('Missing details', 'Enter a title and confirmation code to save it.');
      return;
    }
    if (!uid) {
      Alert.alert('Not signed in');
      return;
    }

    const fields = {
      type,
      title: title.trim(),
      confirmationCode: confirmationCode.trim(),
      checkIn: checkIn ? checkIn.toISOString() : undefined,
      checkOut: checkOut ? checkOut.toISOString() : undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    if (isEditMode && id) {
      updateReservation.mutate(
        { id, ...fields },
        {
          onSuccess: () => router.back(),
          onError: () => Alert.alert('Save failed', "The reservation didn't save. Try again."),
        },
      );
    } else {
      addReservation.mutate(
        { ownerUid: uid, ...fields, createdAt: new Date().toISOString() },
        {
          onSuccess: () => router.back(),
          onError: () => Alert.alert('Save failed', "The reservation didn't save. Try again."),
        },
      );
    }
  }, [type, title, confirmationCode, checkIn, checkOut, address, notes, uid, isEditMode, id, addReservation, updateReservation]);

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.background.card,
      borderColor: colors.background.cardBorder,
      color: colors.text.primary,
    },
  ];

  const labelStyle = [styles.label, { color: colors.text.secondary }];
  const isPending = addReservation.isPending || updateReservation.isPending;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <WalletHeader
        title={isEditMode ? 'Edit reservation' : 'Add reservation'}
        onBack={handleBack}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: Spacing['4'], paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Type */}
        <Text style={labelStyle}>Type</Text>
        <View style={styles.typeRow}>
          {RESERVATION_TYPES.map(({ type: t, label }) => {
            const isSelected = type === t;
            const { Icon: TypeIcon, color: typeColor } = RESERVATION_ICONS[t];
            return (
              <TouchableOpacity
                key={t}
                onPress={() => handleSelectType(t)}
                style={[
                  styles.typeButton,
                  {
                    backgroundColor: isSelected ? `${colors.brand.purple}1F` : colors.background.card,
                    borderColor: isSelected ? colors.brand.purple : colors.background.cardBorder,
                  },
                ]}
                activeOpacity={0.75}
                accessibilityLabel={`${label} reservation`}
              >
                <TypeIcon size={20} color={isSelected ? colors.brand.purple : typeColor} weight="duotone" />
                <Text
                  style={[
                    styles.typeLabel,
                    { color: isSelected ? colors.brand.purple : colors.text.secondary },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Title */}
        <Text style={labelStyle}>Title</Text>
        <TextInput
          style={inputStyle}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. The Ritz-Carlton, Tokyo"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="words"
        />

        {/* Confirmation code */}
        <Text style={labelStyle}>Confirmation code</Text>
        <TextInput
          style={inputStyle}
          value={confirmationCode}
          onChangeText={setConfirmationCode}
          placeholder="e.g. RT4821"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="characters"
        />

        {/* Check-in / check-out */}
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <DateField
              label="Check-in"
              value={checkIn}
              onChange={setCheckIn}
              mode="date"
              placeholder="Select date"
            />
          </View>
          <View style={styles.rowItem}>
            <DateField
              label="Check-out"
              value={checkOut}
              onChange={setCheckOut}
              mode="date"
              placeholder="Select date"
            />
          </View>
        </View>

        {/* Address */}
        <Text style={labelStyle}>Address (optional)</Text>
        <TextInput
          style={inputStyle}
          value={address}
          onChangeText={setAddress}
          placeholder="e.g. 9 Chome-7-1 Ginza, Tokyo"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="words"
        />

        {/* Notes */}
        <Text style={labelStyle}>Notes (optional)</Text>
        <TextInput
          style={[inputStyle, styles.notesInput]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything worth remembering"
          placeholderTextColor={colors.text.tertiary}
          multiline
        />

        {/* Submit */}
        <Button
          label={isEditMode ? 'Save changes' : 'Add reservation'}
          onPress={handleSubmit}
          loading={isPending}
          disabled={isPending}
          variant="primary"
          size="lg"
          fullWidth
          style={styles.submitButton}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    marginBottom: Spacing['1'],
    marginTop: Spacing['4'],
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    fontSize: FontSize.base,
  },
  notesInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing['3'],
  },
  rowItem: {
    flex: 1,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing['2'],
  },
  typeButton: {
    flex: 1,
    minWidth: '30%',
    minHeight: 44,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing['3'],
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['1'],
  },
  typeLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  submitButton: {
    marginTop: Spacing['6'],
  },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors in this file.

- [ ] **Step 4: Commit**

```bash
git add app/\(wallet\)/reservation/add.tsx
git commit -m "feat: add reservation add/edit form (previously missing entirely)"
```

---

## Task 8: Loyalty form — add + edit, expiry date picker

**Files:**
- Modify: `app/(wallet)/loyalty/add.tsx` (full rewrite)

**Interfaces:**
- Consumes: `WalletHeader` (Task 3), `DateField` (Task 4), `addProgram`/`updateProgram` from `useLoyaltyPrograms()` (Task 5).
- Produces: this screen now handles both `/(wallet)/loyalty/add` (add mode) and `/(wallet)/loyalty/add?id={programId}` (edit mode) — consumed by Task 9 (detail screen's Edit button).

- [ ] **Step 1: Replace the full contents of `app/(wallet)/loyalty/add.tsx`**

```tsx
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { WalletHeader } from '@/components/wallet/WalletHeader';
import { DateField } from '@/components/wallet/DateField';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/useAuthStore';
import { useLoyaltyPrograms } from '@/hooks/useLoyaltyPrograms';
import { LOYALTY_ICONS } from '@/constants/icons';
import { LoyaltyUnit, LoyaltyTier, LoyaltyProgram } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

type ProgramType = LoyaltyProgram['programType'];

const PROGRAM_TYPES: { type: ProgramType; label: string }[] = [
  { type: 'airline', label: 'Airline' },
  { type: 'hotel', label: 'Hotel' },
  { type: 'car_rental', label: 'Car rental' },
  { type: 'credit_card', label: 'Credit card' },
  { type: 'other', label: 'Other' },
];

const UNITS: LoyaltyUnit[] = ['miles', 'points', 'nights', 'segments'];
const TIERS: LoyaltyTier[] = ['standard', 'silver', 'gold', 'platinum', 'diamond'];

const UNIT_LABELS: Record<LoyaltyUnit, string> = {
  miles: 'Miles',
  points: 'Points',
  nights: 'Nights',
  segments: 'Segments',
};

const TIER_LABELS: Record<LoyaltyTier, string> = {
  standard: 'Standard',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  diamond: 'Diamond',
};

export default function AddLoyaltyScreen() {
  const { colors } = useTheme();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const { loyaltyPrograms, addProgram, updateProgram } = useLoyaltyPrograms();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const isEditMode = !!id;
  const existing = id ? loyaltyPrograms.find((p) => p.id === id) : undefined;

  const [programName, setProgramName] = useState('');
  const [programType, setProgramType] = useState<ProgramType>('airline');
  const [memberNumber, setMemberNumber] = useState('');
  const [balanceText, setBalanceText] = useState('');
  const [unit, setUnit] = useState<LoyaltyUnit>('miles');
  const [tier, setTier] = useState<LoyaltyTier>('standard');
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);

  useEffect(() => {
    if (!existing) return;
    setProgramName(existing.programName);
    setProgramType(existing.programType);
    setMemberNumber(existing.memberNumber ?? '');
    setBalanceText(String(existing.balance));
    setUnit(existing.unit);
    setTier(existing.tier ?? 'standard');
    setExpiryDate(existing.expiryDate ? new Date(existing.expiryDate) : null);
  }, [existing]);

  const handleSubmit = useCallback(() => {
    if (!programName.trim()) {
      Alert.alert('Missing details', 'Enter a program name to save it.');
      return;
    }
    if (!balanceText.trim() || isNaN(Number(balanceText))) {
      Alert.alert('Invalid balance', 'Enter the balance as a number.');
      return;
    }
    if (!uid) {
      Alert.alert('Not signed in');
      return;
    }

    const fields = {
      programName: programName.trim(),
      programType,
      memberNumber: memberNumber.trim() || undefined,
      balance: Number(balanceText),
      unit,
      tier,
      expiryDate: expiryDate ? expiryDate.toISOString() : undefined,
    };

    if (isEditMode && id) {
      updateProgram.mutate(
        { id, ...fields },
        {
          onSuccess: () => router.back(),
          onError: () => Alert.alert('Save failed', "The program didn't save. Try again."),
        },
      );
    } else {
      addProgram.mutate(
        { ownerUid: uid, ...fields, isManual: true, createdAt: new Date().toISOString() },
        {
          onSuccess: () => router.back(),
          onError: () => Alert.alert('Save failed', "The program didn't save. Try again."),
        },
      );
    }
  }, [programName, programType, memberNumber, balanceText, unit, tier, expiryDate, uid, isEditMode, id, addProgram, updateProgram]);

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.background.card,
      borderColor: colors.background.cardBorder,
      color: colors.text.primary,
    },
  ];

  const labelStyle = [styles.label, { color: colors.text.secondary }];

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const handleSelectType = useCallback((t: ProgramType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setProgramType(t);
  }, []);

  const handleSelectUnit = useCallback((u: LoyaltyUnit) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUnit(u);
  }, []);

  const handleSelectTier = useCallback((t: LoyaltyTier) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTier(t);
  }, []);

  const isPending = addProgram.isPending || updateProgram.isPending;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <WalletHeader
        title={isEditMode ? 'Edit loyalty program' : 'Add loyalty program'}
        onBack={handleBack}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: Spacing['4'], paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Program Name */}
        <Text style={labelStyle}>Program name</Text>
        <TextInput
          style={inputStyle}
          value={programName}
          onChangeText={setProgramName}
          placeholder="e.g. Delta SkyMiles"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="words"
        />

        {/* Program Type */}
        <Text style={labelStyle}>Program type</Text>
        <View style={styles.typeRow}>
          {PROGRAM_TYPES.map(({ type, label }) => {
            const isSelected = programType === type;
            const { Icon: TypeIcon, color: typeColor } = LOYALTY_ICONS[type];
            return (
              <TouchableOpacity
                key={type}
                onPress={() => handleSelectType(type)}
                style={[
                  styles.typeButton,
                  {
                    backgroundColor: isSelected ? `${colors.brand.purple}1F` : colors.background.card,
                    borderColor: isSelected ? colors.brand.purple : colors.background.cardBorder,
                  },
                ]}
                activeOpacity={0.75}
                accessibilityLabel={`${label} program`}
              >
                <TypeIcon size={20} color={isSelected ? colors.brand.purple : typeColor} weight="duotone" />
                <Text
                  style={[
                    styles.typeLabel,
                    { color: isSelected ? colors.brand.purple : colors.text.secondary },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Member Number */}
        <Text style={labelStyle}>Member number (optional)</Text>
        <TextInput
          style={inputStyle}
          value={memberNumber}
          onChangeText={setMemberNumber}
          placeholder="e.g. 1234567890"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="none"
          keyboardType="default"
        />

        {/* Balance */}
        <Text style={labelStyle}>Balance</Text>
        <TextInput
          style={inputStyle}
          value={balanceText}
          onChangeText={setBalanceText}
          placeholder="e.g. 50000"
          placeholderTextColor={colors.text.tertiary}
          keyboardType="numeric"
        />

        {/* Unit */}
        <Text style={labelStyle}>Unit</Text>
        <View style={styles.optionRow}>
          {UNITS.map((u) => {
            const isSelected = unit === u;
            return (
              <TouchableOpacity
                key={u}
                onPress={() => handleSelectUnit(u)}
                style={[
                  styles.optionButton,
                  {
                    backgroundColor: isSelected ? `${colors.brand.purple}1F` : colors.background.card,
                    borderColor: isSelected ? colors.brand.purple : colors.background.cardBorder,
                  },
                ]}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.optionLabel,
                    { color: isSelected ? colors.brand.purple : colors.text.secondary },
                  ]}
                >
                  {UNIT_LABELS[u]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Tier */}
        <Text style={labelStyle}>Tier</Text>
        <View style={styles.optionRow}>
          {TIERS.map((t) => {
            const isSelected = tier === t;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => handleSelectTier(t)}
                style={[
                  styles.optionButton,
                  {
                    backgroundColor: isSelected ? `${colors.brand.purple}1F` : colors.background.card,
                    borderColor: isSelected ? colors.brand.purple : colors.background.cardBorder,
                  },
                ]}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.optionLabel,
                    { color: isSelected ? colors.brand.purple : colors.text.secondary },
                  ]}
                >
                  {TIER_LABELS[t]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Expiry Date */}
        <DateField
          label="Expiry date (optional)"
          value={expiryDate}
          onChange={setExpiryDate}
          mode="date"
          placeholder="Select date"
        />

        {/* Submit */}
        <Button
          label={isEditMode ? 'Save changes' : 'Add loyalty program'}
          onPress={handleSubmit}
          loading={isPending}
          disabled={isPending}
          variant="primary"
          size="lg"
          fullWidth
          style={styles.submitButton}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    marginBottom: Spacing['1'],
    marginTop: Spacing['4'],
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    fontSize: FontSize.base,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing['2'],
  },
  typeButton: {
    flex: 1,
    minWidth: '18%',
    minHeight: 44,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing['3'],
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['1'],
  },
  typeLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing['2'],
  },
  optionButton: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2'],
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  submitButton: {
    marginTop: Spacing['6'],
  },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors in this file.

- [ ] **Step 4: Commit**

```bash
git add app/\(wallet\)/loyalty/add.tsx
git commit -m "feat: rewrite loyalty form to support add and edit, expiry date picker"
```

---

## Task 9: Detail screens — Edit button + `WalletHeader` adoption

**Files:**
- Modify: `app/(wallet)/boarding-pass/[id].tsx`
- Modify: `app/(wallet)/reservation/[id].tsx`
- Modify: `app/(wallet)/loyalty/[id].tsx`

**Interfaces:**
- Consumes: `WalletHeader` (Task 3) — replaces each screen's hand-rolled header (both the main content header and the not-found-state header).
- Produces: each detail screen now has an Edit button routing to `?id=` on that type's add screen (Task 6, 7, 8 respectively), alongside the existing Delete button.

- [ ] **Step 1: Modify `app/(wallet)/boarding-pass/[id].tsx`**

Replace the imports block (remove `ArrowLeft`, `StarMark`; add `WalletHeader`) and both header usages, and add the Edit button. The full modified file:

```tsx
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Animated,
} from 'react-native';
import { useRef, useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AirplaneTilt } from 'phosphor-react-native';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTheme } from '@/hooks/useTheme';
import { WalletHeader } from '@/components/wallet/WalletHeader';
import { useBoardingPasses } from '@/hooks/useBoardingPasses';
import { BoardingPassCard } from '@/components/wallet/BoardingPassCard';
import { BarcodeDisplay } from '@/components/wallet/BarcodeDisplay';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';
import { SPRING } from '@/constants/motion';
import type { BoardingPass } from '@/types';

const CARD_HEIGHT = 200;

function FlippableCard({ pass }: { pass: BoardingPass }) {
  const { colors } = useTheme();
  const flipValue = useRef(new Animated.Value(0)).current;
  const isFlipped = useRef(false);

  const handleFlip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    isFlipped.current = !isFlipped.current;
    Animated.spring(flipValue, {
      toValue: isFlipped.current ? 1 : 0,
      ...SPRING,
    }).start();
  };

  const frontRotateY = flipValue.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotateY  = flipValue.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  const frontAnimStyle = {
    transform: [{ perspective: 1000 }, { rotateY: frontRotateY }],
    backfaceVisibility: 'hidden' as const,
  };
  const backAnimStyle = {
    transform: [{ perspective: 1000 }, { rotateY: backRotateY }],
    backfaceVisibility: 'hidden' as const,
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={handleFlip}
      style={[styles.flipContainer, { height: CARD_HEIGHT }]}
    >
      {/* Front — boarding pass card */}
      <Animated.View style={[StyleSheet.absoluteFill, frontAnimStyle]}>
        <BoardingPassCard pass={pass} onPress={() => {}} />
      </Animated.View>

      {/* Back — barcode */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.backFace,
          { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
          backAnimStyle,
        ]}
      >
        <BarcodeDisplay barcode={pass.barcode!} />
        <Text style={[styles.flipHint, { color: colors.text.tertiary }]}>Tap to flip back</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function BoardingPassDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { boardingPasses, deletePass } = useBoardingPasses();

  const pass = boardingPasses.find((p) => p.id === id);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const handleEdit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/(wallet)/boarding-pass/add?id=${id}`);
  }, [id]);

  const handleDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Delete boarding pass',
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
  }, [pass, deletePass]);

  if (!pass) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <WalletHeader title="Boarding pass" onBack={handleBack} />
        <View style={styles.centered}>
          <EmptyState
            icon={AirplaneTilt}
            title="This pass isn't here"
            description="It may have been deleted or the link is out of date."
            actionLabel="Back to wallet"
            onAction={handleBack}
            actionHaptic="none"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <WalletHeader title="Boarding pass" onBack={handleBack} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: Spacing['4'], paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Pass card — flippable when barcode exists */}
        {pass.barcode ? (
          <View style={styles.flipWrapper}>
            <FlippableCard pass={pass} />
          </View>
        ) : (
          <BoardingPassCard pass={pass} onPress={() => {}} />
        )}

        {/* Edit button */}
        <TouchableOpacity
          style={[
            styles.editButton,
            { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
          ]}
          onPress={handleEdit}
          activeOpacity={0.8}
        >
          <Text style={[styles.editButtonText, { color: colors.text.primary }]}>
            Edit boarding pass
          </Text>
        </TouchableOpacity>

        {/* Delete button */}
        <TouchableOpacity
          style={[styles.deleteButton, { borderColor: colors.semantic.error }]}
          onPress={handleDelete}
          activeOpacity={0.8}
        >
          <Text style={[styles.deleteButtonText, { color: colors.semantic.error }]}>
            Delete boarding pass
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
  scroll: {
    flex: 1,
  },
  flipWrapper: {
    marginHorizontal: Spacing['4'],
    marginBottom: Spacing['4'],
    height: CARD_HEIGHT,
  },
  flipContainer: {
    width: '100%',
  },
  backFace: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['3'],
    padding: Spacing['4'],
  },
  flipHint: {
    fontSize: FontSize.xs,
    letterSpacing: 0.5,
  },
  editButton: {
    marginHorizontal: Spacing['4'],
    marginTop: Spacing['4'],
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing['4'],
    alignItems: 'center',
  },
  editButtonText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },
  deleteButton: {
    marginHorizontal: Spacing['4'],
    marginTop: Spacing['3'],
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
});
```

- [ ] **Step 2: Modify `app/(wallet)/reservation/[id].tsx`**

Same treatment: replace both headers with `WalletHeader`, add an Edit button above Delete. The full modified file:

```tsx
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CalendarX } from 'phosphor-react-native';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTheme } from '@/hooks/useTheme';
import { WalletHeader } from '@/components/wallet/WalletHeader';
import { useReservations } from '@/hooks/useReservations';
import { RESERVATION_ICONS } from '@/constants/icons';
import { TypeIconBubble } from '@/components/ui/TypeIconBubble';
import { ReservationType } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

const TYPE_LABELS: Record<ReservationType, string> = {
  hotel: 'Hotel',
  airbnb: 'Airbnb',
  rental_car: 'Rental car',
  restaurant: 'Restaurant',
  activity: 'Activity',
  show: 'Show',
};

function formatDate(isoDate?: string): string {
  if (!isoDate) return '—';
  try {
    return new Date(isoDate).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

export default function ReservationDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { reservations, deleteReservation } = useReservations();

  const reservation = reservations.find((r) => r.id === id);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const handleEdit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/(wallet)/reservation/add?id=${id}`);
  }, [id]);

  const handleDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Delete reservation',
      'Are you sure you want to delete this reservation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (id) {
              deleteReservation.mutate(id, {
                onSuccess: () => router.back(),
              });
            }
          },
        },
      ],
    );
  }, [id, deleteReservation]);

  if (!reservation) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <WalletHeader title="Reservation" onBack={handleBack} />
        <View style={styles.centered}>
          <EmptyState
            icon={CalendarX}
            title="This reservation isn't here"
            description="It may have been deleted or the link is out of date."
            actionLabel="Back to wallet"
            onAction={handleBack}
            actionHaptic="none"
          />
        </View>
      </View>
    );
  }

  const { Icon: TypeIcon, color: typeColor } = RESERVATION_ICONS[reservation.type];

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <WalletHeader title="Reservation" onBack={handleBack} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: Spacing['4'], paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card */}
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: colors.background.card,
              borderColor: colors.background.cardBorder,
            },
          ]}
        >
          <TypeIconBubble Icon={TypeIcon} color={typeColor} bubbleSize={64} iconSize={32} />
          <Text style={[styles.heroTitle, { color: colors.text.primary }]}>
            {reservation.title}
          </Text>
          <View style={[styles.typeBadge, { backgroundColor: `${typeColor}1F` }]}>
            <Text style={[styles.typeBadgeText, { color: typeColor }]}>
              {TYPE_LABELS[reservation.type]}
            </Text>
          </View>
        </View>

        {/* Confirmation code */}
        <View
          style={[
            styles.detailCard,
            {
              backgroundColor: colors.background.card,
              borderColor: colors.background.cardBorder,
            },
          ]}
        >
          <DetailRow
            label="Confirmation code"
            value={reservation.confirmationCode}
            valueStyle={{ color: colors.brand.purple, fontWeight: FontWeight.bold }}
            colors={colors}
            borderColor={colors.background.cardBorder}
          />
          {reservation.checkIn ? (
            <DetailRow label="Check-in" value={formatDate(reservation.checkIn)} colors={colors} borderColor={colors.background.cardBorder} />
          ) : null}
          {reservation.checkOut ? (
            <DetailRow label="Check-out" value={formatDate(reservation.checkOut)} colors={colors} borderColor={colors.background.cardBorder} />
          ) : null}
          {reservation.address ? (
            <DetailRow label="Address" value={reservation.address} colors={colors} borderColor={colors.background.cardBorder} />
          ) : null}
          {reservation.notes ? (
            <DetailRow label="Notes" value={reservation.notes} colors={colors} borderColor={colors.background.cardBorder} />
          ) : null}
        </View>

        {/* Edit button */}
        <TouchableOpacity
          style={[
            styles.editButton,
            { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
          ]}
          onPress={handleEdit}
          activeOpacity={0.8}
        >
          <Text style={[styles.editButtonText, { color: colors.text.primary }]}>
            Edit reservation
          </Text>
        </TouchableOpacity>

        {/* Delete button */}
        <TouchableOpacity
          style={[styles.deleteButton, { borderColor: colors.semantic.error }]}
          onPress={handleDelete}
          activeOpacity={0.8}
        >
          <Text style={[styles.deleteButtonText, { color: colors.semantic.error }]}>
            Delete reservation
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
  valueStyle?: object;
  colors: { text: { primary: string; secondary: string; tertiary: string } };
  borderColor: string;
}

function DetailRow({ label, value, valueStyle, colors, borderColor }: DetailRowProps) {
  return (
    <View style={[styles.detailRow, { borderBottomColor: borderColor }]}>
      <Text style={[styles.detailLabel, { color: colors.text.tertiary }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.text.primary }, valueStyle]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  heroCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing['6'],
    alignItems: 'center',
    gap: Spacing['3'],
    marginBottom: Spacing['4'],
  },
  heroTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },
  typeBadge: {
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['1'],
    borderRadius: BorderRadius.full,
  },
  typeBadgeText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  detailCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    marginBottom: Spacing['4'],
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['4'],
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing['3'],
  },
  detailLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    flex: 0,
    minWidth: 120,
  },
  detailValue: {
    fontSize: FontSize.base,
    flex: 1,
    textAlign: 'right',
  },
  editButton: {
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing['4'],
    alignItems: 'center',
    marginTop: Spacing['2'],
  },
  editButtonText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },
  deleteButton: {
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing['4'],
    alignItems: 'center',
    marginTop: Spacing['3'],
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
});
```

- [ ] **Step 3: Modify `app/(wallet)/loyalty/[id].tsx`**

Same treatment as the other two detail screens: replace both headers with `WalletHeader`, add an Edit button above Delete, keep the balance/details sections untouched. The full modified file:

```tsx
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Medal } from 'phosphor-react-native';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTheme } from '@/hooks/useTheme';
import { WalletHeader } from '@/components/wallet/WalletHeader';
import { useLoyaltyPrograms } from '@/hooks/useLoyaltyPrograms';
import { LoyaltyCard } from '@/components/wallet/LoyaltyCard';
import { PointsBalance } from '@/components/wallet/PointsBalance';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

const PROGRAM_TYPE_LABELS: Record<string, string> = {
  airline: 'Airline',
  hotel: 'Hotel',
  car_rental: 'Car rental',
  credit_card: 'Credit card',
  other: 'Other',
};

function formatExpiryDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function LoyaltyDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { loyaltyPrograms, deleteProgram } = useLoyaltyPrograms();

  const program = loyaltyPrograms.find((p) => p.id === id);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const handleEdit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/(wallet)/loyalty/add?id=${id}`);
  }, [id]);

  const handleDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Delete loyalty program',
      'Are you sure you want to delete this loyalty program?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (program) {
              deleteProgram.mutate(program.id, {
                onSuccess: () => router.back(),
              });
            }
          },
        },
      ],
    );
  }, [program, deleteProgram]);

  if (!program) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <WalletHeader title="Loyalty program" onBack={handleBack} />
        <View style={styles.centered}>
          <EmptyState
            icon={Medal}
            title="This program isn't here"
            description="It may have been removed or the link is out of date."
            actionLabel="Back to wallet"
            onAction={handleBack}
            actionHaptic="none"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <WalletHeader title="Loyalty program" onBack={handleBack} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: Spacing['4'], paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Card preview */}
        <LoyaltyCard program={program} onPress={() => {}} />

        {/* Balance highlight */}
        <View
          style={[
            styles.balanceSection,
            { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
          ]}
        >
          <Text style={[styles.sectionLabel, { color: colors.text.secondary }]}>Balance</Text>
          <PointsBalance balance={program.balance} unit={program.unit} tier={program.tier} />
        </View>

        {/* Details section */}
        <View
          style={[
            styles.detailsSection,
            { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
          ]}
        >
          <Text style={[styles.programNameLarge, { color: colors.text.primary }]}>
            {program.programName}
          </Text>

          <View
            style={[styles.typeBadge, { backgroundColor: colors.background.primary, borderColor: colors.background.cardBorder }]}
          >
            <Text style={[styles.typeBadgeText, { color: colors.brand.purple }]}>
              {PROGRAM_TYPE_LABELS[program.programType]}
            </Text>
          </View>

          {program.memberNumber ? (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.text.tertiary }]}>Member number</Text>
              <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                {program.memberNumber}
              </Text>
            </View>
          ) : null}

          {program.expiryDate ? (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.text.tertiary }]}>Expires</Text>
              <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                {formatExpiryDate(program.expiryDate)}
              </Text>
            </View>
          ) : null}

          {program.isManual ? (
            <Text style={[styles.manualIndicator, { color: colors.text.tertiary }]}>
              Manually entered
            </Text>
          ) : null}
        </View>

        {/* Edit button */}
        <TouchableOpacity
          style={[
            styles.editButton,
            { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
          ]}
          onPress={handleEdit}
          activeOpacity={0.8}
        >
          <Text style={[styles.editButtonText, { color: colors.text.primary }]}>
            Edit loyalty program
          </Text>
        </TouchableOpacity>

        {/* Delete button */}
        <TouchableOpacity
          style={[styles.deleteButton, { borderColor: colors.semantic.error }]}
          onPress={handleDelete}
          activeOpacity={0.8}
        >
          <Text style={[styles.deleteButtonText, { color: colors.semantic.error }]}>
            Delete loyalty program
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
  scroll: {
    flex: 1,
  },
  balanceSection: {
    marginHorizontal: Spacing['4'],
    marginBottom: Spacing['3'],
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing['4'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  detailsSection: {
    marginHorizontal: Spacing['4'],
    marginBottom: Spacing['3'],
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing['4'],
    gap: Spacing['3'],
  },
  programNameLarge: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['1'],
  },
  typeBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  detailValue: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  manualIndicator: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.regular,
    marginTop: Spacing['1'],
  },
  editButton: {
    marginHorizontal: Spacing['4'],
    marginTop: Spacing['2'],
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing['4'],
    alignItems: 'center',
  },
  editButtonText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },
  deleteButton: {
    marginHorizontal: Spacing['4'],
    marginTop: Spacing['3'],
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
});
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no new errors in these three files.

- [ ] **Step 6: Commit**

```bash
git add app/\(wallet\)/boarding-pass/\[id\].tsx app/\(wallet\)/reservation/\[id\].tsx app/\(wallet\)/loyalty/\[id\].tsx
git commit -m "feat: add Edit button to wallet detail screens, adopt WalletHeader"
```

---

## Task 10: Unified Wallet hub (`app/(wallet)/index.tsx`, new)

**Files:**
- Create: `app/(wallet)/index.tsx`

**Interfaces:**
- Consumes: `WalletHeader` (Task 3), `useBoardingPasses()`, `useReservations()`, `useLoyaltyPrograms()` (existing hooks, unaffected reads), `BoardingPassCard`, `ReservationCard`, `LoyaltyCard` (existing components, unmodified), `EmptyState`, `SkeletonCard` (existing components).
- Produces: default export `WalletHubScreen` — becomes the wallet's entry point, routed to by Task 11 (`app/user/[uid].tsx`'s Wallet button) and registered in Task 11's updated `_layout.tsx`.

- [ ] **Step 1: Create `app/(wallet)/index.tsx`**

```tsx
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useCallback, useMemo, useState } from 'react';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Plus, Wallet as WalletIcon } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { WalletHeader } from '@/components/wallet/WalletHeader';
import { useBoardingPasses } from '@/hooks/useBoardingPasses';
import { useReservations } from '@/hooks/useReservations';
import { useLoyaltyPrograms } from '@/hooks/useLoyaltyPrograms';
import { BoardingPassCard } from '@/components/wallet/BoardingPassCard';
import { ReservationCard } from '@/components/wallet/ReservationCard';
import { LoyaltyCard } from '@/components/wallet/LoyaltyCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

type Segment = 'all' | 'flights' | 'reservations' | 'loyalty';

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'flights', label: 'Flights' },
  { key: 'reservations', label: 'Reservations' },
  { key: 'loyalty', label: 'Loyalty' },
];

export default function WalletHubScreen() {
  const { colors } = useTheme();
  const [segment, setSegment] = useState<Segment>('all');

  const { boardingPasses, isLoading: passesLoading } = useBoardingPasses();
  const { reservations, isLoading: reservationsLoading } = useReservations();
  const { loyaltyPrograms, isLoading: loyaltyLoading } = useLoyaltyPrograms();

  const isLoading = passesLoading || reservationsLoading || loyaltyLoading;

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const handleSelectSegment = useCallback((s: Segment) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSegment(s);
  }, []);

  const handleAdd = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (segment === 'flights') {
      router.push('/(wallet)/boarding-pass/add');
      return;
    }
    if (segment === 'reservations') {
      router.push('/(wallet)/reservation/add');
      return;
    }
    if (segment === 'loyalty') {
      router.push('/(wallet)/loyalty/add');
      return;
    }
    Alert.alert('Add to wallet', undefined, [
      { text: 'Boarding pass', onPress: () => router.push('/(wallet)/boarding-pass/add') },
      { text: 'Reservation', onPress: () => router.push('/(wallet)/reservation/add') },
      { text: 'Loyalty program', onPress: () => router.push('/(wallet)/loyalty/add') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [segment]);

  const showFlights = segment === 'all' || segment === 'flights';
  const showReservations = segment === 'all' || segment === 'reservations';
  const showLoyalty = segment === 'all' || segment === 'loyalty';

  const categoriesWithContent = useMemo(
    () =>
      [boardingPasses.length > 0, reservations.length > 0, loyaltyPrograms.length > 0].filter(Boolean)
        .length,
    [boardingPasses.length, reservations.length, loyaltyPrograms.length],
  );
  const showSectionLabels = segment === 'all' && categoriesWithContent > 1;

  const walletIsEmpty = boardingPasses.length === 0 && reservations.length === 0 && loyaltyPrograms.length === 0;

  const currentSegmentIsEmpty =
    (segment === 'flights' && boardingPasses.length === 0) ||
    (segment === 'reservations' && reservations.length === 0) ||
    (segment === 'loyalty' && loyaltyPrograms.length === 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <WalletHeader
        title="Wallet"
        onBack={handleBack}
        rightAction={{ icon: Plus, onPress: handleAdd, label: 'Add to wallet' }}
      />

      {/* Segmented control */}
      <View style={styles.segments}>
        {SEGMENTS.map(({ key, label }) => {
          const isSelected = segment === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => handleSelectSegment(key)}
              style={[
                styles.segmentPill,
                {
                  backgroundColor: isSelected ? colors.text.primary : colors.background.sunken,
                },
              ]}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  styles.segmentLabel,
                  { color: isSelected ? colors.background.primary : colors.text.secondary },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={{ paddingHorizontal: Spacing['5'], paddingTop: Spacing['2'], gap: Spacing['4'] }}>
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} height={120} radius={BorderRadius.xl} />
          ))}
        </View>
      ) : walletIsEmpty ? (
        <EmptyState
          icon={WalletIcon}
          title="Your wallet is empty"
          description="Add a boarding pass, reservation, or loyalty program to get started."
          actionLabel="Add to wallet"
          onAction={handleAdd}
          actionHaptic="none"
        />
      ) : currentSegmentIsEmpty ? (
        <EmptyState
          size="sm"
          icon={WalletIcon}
          title={`No ${SEGMENTS.find((s) => s.key === segment)?.label.toLowerCase()} yet`}
          actionLabel="Add"
          onAction={handleAdd}
          actionHaptic="none"
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingTop: Spacing['2'], paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {showFlights && boardingPasses.length > 0 && (
            <>
              {showSectionLabels && (
                <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>Flights</Text>
              )}
              {boardingPasses.map((pass) => (
                <BoardingPassCard
                  key={pass.id}
                  pass={pass}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/(wallet)/boarding-pass/${pass.id}`);
                  }}
                />
              ))}
            </>
          )}

          {showReservations && reservations.length > 0 && (
            <>
              {showSectionLabels && (
                <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>Reservations</Text>
              )}
              {reservations.map((reservation) => (
                <ReservationCard
                  key={reservation.id}
                  reservation={reservation}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/(wallet)/reservation/${reservation.id}`);
                  }}
                />
              ))}
            </>
          )}

          {showLoyalty && loyaltyPrograms.length > 0 && (
            <>
              {showSectionLabels && (
                <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>Loyalty</Text>
              )}
              {loyaltyPrograms.map((program) => (
                <LoyaltyCard
                  key={program.id}
                  program={program}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/(wallet)/loyalty/${program.id}`);
                  }}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  segments: {
    flexDirection: 'row',
    gap: Spacing['2'],
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['4'],
  },
  segmentPill: {
    flex: 1,
    minHeight: 44,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['2'],
  },
  segmentLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing['4'],
    paddingTop: Spacing['3'],
    paddingBottom: Spacing['2'],
  },
});
```

Note: `phosphor-react-native` exports an icon named `Wallet` — imported here `as WalletIcon` to avoid shadowing the `WalletHeader` import name's implicit association and to keep the empty-state icon's name unambiguous in this file.

`Wallet` is a confirmed export of the installed `phosphor-react-native` package (`node_modules/phosphor-react-native/src/icons/Wallet.tsx`).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors in this file.

- [ ] **Step 4: Commit**

```bash
git add app/\(wallet\)/index.tsx
git commit -m "feat: add unified Wallet hub screen"
```

---

## Task 11: Wire it up — route list, delete old screens, update profile button

**Files:**
- Modify: `app/(wallet)/_layout.tsx`
- Delete: `app/(wallet)/boarding-passes.tsx`
- Delete: `app/(wallet)/reservations.tsx`
- Delete: `app/(wallet)/loyalty.tsx`
- Modify: `app/user/[uid].tsx`

**Interfaces:** none new — this task only rewires existing routing to point at Task 10's new hub and removes the three now-superseded list screens.

- [ ] **Step 1: Replace the full contents of `app/(wallet)/_layout.tsx`**

```tsx
import { Stack } from 'expo-router';

export default function WalletLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="boarding-pass/[id]" />
      <Stack.Screen name="boarding-pass/add" />
      <Stack.Screen name="reservation/[id]" />
      <Stack.Screen name="reservation/add" />
      <Stack.Screen name="loyalty/[id]" />
      <Stack.Screen name="loyalty/add" />
    </Stack>
  );
}
```

- [ ] **Step 2: Delete the three superseded list screens**

```bash
cd /Users/markolsen/Projects/supernova-travel
rm app/\(wallet\)/boarding-passes.tsx
rm app/\(wallet\)/reservations.tsx
rm app/\(wallet\)/loyalty.tsx
```

- [ ] **Step 3: Update `app/user/[uid].tsx`'s Wallet button target**

Find `handleWalletPress` (currently at line 93-96) and change its route:

```ts
const handleWalletPress = useCallback(() => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  router.push('/(wallet)');
}, []);
```

(Only the route string changes, from `'/(wallet)/boarding-passes'` to `'/(wallet)'` — nothing else in this file is touched.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. This step also confirms nothing else in the codebase still references the three deleted screens' route paths (a stale reference would surface as an Expo Router typed-route error if `experimental.typedRoutes` is enabled, or simply be caught by the grep in Step 5 otherwise).

- [ ] **Step 5: Grep for any other stale references to the deleted routes**

Run: `grep -rn "wallet)/boarding-passes\|wallet)/reservations'\|wallet)/loyalty'" app components hooks --include="*.tsx" --include="*.ts"`
Expected: no output (the three old route strings — `reservations` and `loyalty` matched with a trailing quote to avoid false-matching the still-valid `reservation/` and `loyalty/` subpaths — should not appear anywhere outside the files just deleted/modified).

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 7: Run the full test suite**

Run: `npx jest --watchAll=false`
Expected: all tests pass, including the new `__tests__/utils/date.test.ts` from Task 2.

- [ ] **Step 8: Commit**

```bash
git add app/\(wallet\)/_layout.tsx app/user/\[uid\].tsx
git rm app/\(wallet\)/boarding-passes.tsx app/\(wallet\)/reservations.tsx app/\(wallet\)/loyalty.tsx
git commit -m "feat: wire unified wallet hub into routing, remove superseded list screens"
```

---

## Task 12: Manual verification in the simulator

**Files:** none — this task runs the app, it doesn't change code.

This is the primary verification for the visual/navigation/CRUD behavior that can't be unit-tested in this codebase (no RN component-render test infra), matching CLAUDE.md's guidance to verify UI changes by running the feature.

- [ ] **Step 1: Start Metro and launch on the iOS simulator**

Run: `cd /Users/markolsen/Projects/supernova-travel && npx expo start --dev-client`, then launch on the already-configured dev-client build.

- [ ] **Step 2: Sign in and open the wallet**

From a signed-in session, open your own profile and tap the "Wallet" button. Confirm it opens the new unified hub (not the old boarding-passes list) with the four-segment control visible.

- [ ] **Step 3: Add one of each item type**

- Tap `+` on "All" → confirm the three-way `Alert` appears (Boarding pass / Reservation / Loyalty program / Cancel).
- Add a boarding pass: confirm the Departure date and Departure time fields open pickers (not raw text entry), and confirm Terminal is a field alongside Gate. Save and confirm it appears under "Flights" back on the hub.
- Add a reservation: confirm this screen exists at all (previously showed "Coming soon"), confirm the type selector includes "Show," confirm Check-in/Check-out open date pickers. Save and confirm it appears under "Reservations."
- Add a loyalty program: confirm Expiry date opens a picker. Save and confirm it appears under "Loyalty."

- [ ] **Step 4: Verify segment filtering**

Tap each of Flights/Reservations/Loyalty and confirm only that category's items show, with no section labels. Tap "All" and confirm all three show together with section labels (since more than one category now has content).

- [ ] **Step 5: Verify edit for each type**

Open each of the three items just created, tap "Edit," confirm every field is pre-filled correctly (including the date/time pickers showing the previously-saved values), change one field, save, and confirm the change is reflected both on the detail screen and back on the hub list.

- [ ] **Step 6: Verify delete still works**

Delete one item of any type from its detail screen; confirm the existing delete-confirmation `Alert` still appears and the item disappears from the hub afterward.

- [ ] **Step 7: Verify empty states**

Delete all three items. Confirm the hub shows the full-wallet `EmptyState` ("Your wallet is empty..."). Add one boarding pass back, then switch to the "Loyalty" segment and confirm the small per-segment empty state shows instead of the full-wallet one.

- [ ] **Step 8: Run the full test suite one more time**

Run: `npx jest --watchAll=false`
Expected: all tests pass.

No commit for this task — it's verification only. If any step surfaces a bug, fix it as a small follow-up commit against the relevant task's file before considering the plan complete.
