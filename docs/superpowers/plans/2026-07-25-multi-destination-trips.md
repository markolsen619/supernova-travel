# Multi-Destination Trips (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let both the manual trip wizard and the AI-generate form collect a list of destinations
(primary + up to 9 additional, ordered, drag-reorderable), store the full list on the created trip,
and surface it on the trip detail screen — while every existing single-destination consumer (cover
photo, trip map, packing templates, Algolia search, `TripCard`) keeps reading only the primary
destination, unchanged.

**Architecture:** `Trip.destination` stays the primary (unchanged shape, now named `Destination`); a
new `Trip.additionalDestinations: Destination[]` holds the rest, in visit order. One new shared
component, `DestinationListEditor`, provides the add/reorder/remove UI and is used identically by both
creation flows. The AI-generate Cloud Function accepts and stores the list but does not yet use it in
the Gemini prompt (Phase 2, separate plan, teaches it to actually split the itinerary by city).

**Tech Stack:** Expo/React Native, `react-native-draggable-flatlist` (already a dependency, already
used by `DayTimeline.tsx`/`app/trip/[id].tsx` for activity reordering), Firebase Cloud Functions v2.

**Spec:** `docs/superpowers/specs/2026-07-25-multi-destination-trips-design.md`

## Global Constraints

- Destination cap: 10 total (1 primary + up to 9 in `additionalDestinations`).
- Order is significant (append/drag order = visit order) — no alphabetical or other resorting anywhere.
- Auto-generated trip title for 2+ destinations: comma-joined names with an "&" before the last one
  (e.g. "Paris, Rome & Barcelona"); unchanged `"Trip to {name}"` behavior for exactly one destination.
- `TripCard`, cover-photo resolution (`useTripCoverResolver`), the trip map, packing templates
  (`services/packingTemplates.ts`), and Algolia sync (`functions/src/syncAlgolia.ts`) are NOT touched
  by this plan — all five continue reading only `trip.destination`, per the spec's explicit "out of
  scope" list. Do not add multi-destination awareness to any of them.
- Phase 2 (teaching Gemini to split the itinerary across cities) is explicitly out of scope — the
  Cloud Function stores `additionalDestinations` on the created trip but `buildPrompt()` in
  `functions/src/generateTrip.ts` is NOT modified by this plan.
- All new UI reads colors via `useTheme()` — no hardcoded hex, matching every file touched.
- `StyleSheet.create` stays module-level/static — theme-dependent colors go in inline styles only.
- Haptics: `Light` on add/remove/drag-start actions, matching every existing similar action in the
  files this plan touches (e.g. `handleClearPlace` in `AiPromptForm.tsx`, `handleDeleteDay` in
  `DayTimeline.tsx` — note `handleDeleteDay` uses `Medium` specifically because it's destructive-confirm;
  a plain destination removal here is not a confirm step, so it stays `Light`).
- Editing an existing trip's destination list after creation is out of scope — this plan covers
  creation only (`app/trip/new.tsx`, `app/trip/ai-generate.tsx`), not `EditTripSheet`.

---

### Task 1: Types

**Files:**
- Modify: `types/index.ts`
- Modify: `types/ai.ts`
- Modify: `components/search/AddToTripSheet.tsx` (a third `createTrip()` call site the original file
  search missed — see Step 4)

**Interfaces:**
- Produces: `Destination` interface, `Trip.additionalDestinations: Destination[]`,
  `CreateTripInput.additionalDestinations: Destination[]` (required),
  `UpdateTripInput.additionalDestinations?: Destination[]` (optional, matching every other field on
  that interface), `GenerateTripRequest.additionalDestinations: Destination[]` — consumed by every
  later task in this plan.

- [ ] **Step 1: Extract the `Destination` interface and update `Trip`**

In `types/index.ts`, find the `Trip` interface's `destination` field (currently an inline object type):

```ts
  destination: {
    name: string;
    placeId: string | null;
    lat: number | null;
    lng: number | null;
    countryCode: string | null;
  };
```

Replace it, and add the new field immediately after, with:

```ts
  destination: Destination;
  /** Additional stops beyond the primary destination, in visit order. Empty
   * for single-destination trips (the overwhelming majority). Capped at 9
   * (10 total including the primary) — see DestinationListEditor. Every
   * existing single-destination consumer (cover photo, map, packing
   * templates, Algolia sync, TripCard) intentionally reads only
   * `destination` and ignores this field — see the Phase 1 spec's "out of
   * scope" list. */
  additionalDestinations: Destination[];
```

Add the new named interface above the `Trip` interface (find `export interface Trip {` and insert
directly before it):

```ts
export interface Destination {
  name: string;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  countryCode: string | null;
}

```

- [ ] **Step 2: Update `CreateTripInput` and `UpdateTripInput`**

In `types/index.ts`, find:

```ts
export interface CreateTripInput {
  title: string;
  description: string;
  destination: Trip['destination'];
  startDate: Date | null;
  endDate: Date | null;
  visibility: TripVisibility;
  tags: string[];
  coverImageUrl: string | null;
  isAiGenerated: boolean;
}
```

Replace with:

```ts
export interface CreateTripInput {
  title: string;
  description: string;
  destination: Destination;
  additionalDestinations: Destination[];
  startDate: Date | null;
  endDate: Date | null;
  visibility: TripVisibility;
  tags: string[];
  coverImageUrl: string | null;
  isAiGenerated: boolean;
}
```

Find:

```ts
export interface UpdateTripInput {
  title?: string;
  description?: string;
  coverImageUrl?: string | null;
  destination?: Trip['destination'];
  visibility?: TripVisibility;
```

Replace with:

```ts
export interface UpdateTripInput {
  title?: string;
  description?: string;
  coverImageUrl?: string | null;
  destination?: Destination;
  additionalDestinations?: Destination[];
  visibility?: TripVisibility;
```

- [ ] **Step 3: Add `additionalDestinations` to the client-side AI request type**

In `types/ai.ts`, find:

```ts
export interface GenerateTripRequest {
  destination: string;
  countryCode: string;
  startDate: string | null;   // ISO date string or null
  endDate: string | null;
  durationDays: number;
  travelStyle: TravelStyle;
  pace: TripPace;
  mustSee: string[];
  preferences: string;
}
```

Replace with:

```ts
export interface GenerateTripRequest {
  destination: string;
  countryCode: string;
  /** Additional stops beyond the primary destination, in visit order — see
   * docs/superpowers/specs/2026-07-25-multi-destination-trips-design.md.
   * Stored on the created trip; NOT yet used by the Gemini prompt (Phase 2). */
  additionalDestinations: { name: string; placeId: string | null; lat: number | null; lng: number | null; countryCode: string | null }[];
  startDate: string | null;   // ISO date string or null
  endDate: string | null;
  durationDays: number;
  travelStyle: TravelStyle;
  pace: TripPace;
  mustSee: string[];
  preferences: string;
}
```

(The destination shape is inlined here rather than importing `Destination` from `types/index.ts` —
`types/ai.ts` currently has no cross-imports from `types/index.ts`, and this keeps that file
independent, matching its existing style.)

- [ ] **Step 4: Fix the third `createTrip()` call site this plan's file search missed**

`components/search/AddToTripSheet.tsx`'s `handleCreateAndAdd` (a "quick-create a trip from a search
result place, then add it as an activity" shortcut, separate from both the manual wizard and the
AI-generate flow) also constructs a `CreateTripInput` object directly — this plan's original file
search (`grep` for `destination` usage) missed it. Since `additionalDestinations` is now required on
`CreateTripInput`, this call site needs it too.

In `components/search/AddToTripSheet.tsx`, find:

```ts
        destination: {
          name: place.name,
          placeId: place.placeId,
          lat: place.lat,
          lng: place.lng,
          countryCode: place.countryCode,
        },
        startDate: null,
```

Replace with:

```ts
        destination: {
          name: place.name,
          placeId: place.placeId,
          lat: place.lat,
          lng: place.lng,
          countryCode: place.countryCode,
        },
        // Quick-create shortcut from a search result — single destination by
        // design, not the full multi-destination wizard.
        additionalDestinations: [],
        startDate: null,
```

- [ ] **Step 5: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY in files that construct a `CreateTripInput`/`Trip`/`GenerateTripRequest` without
the new required fields yet (`app/trip/new.tsx`, `hooks/useCreateTrip.ts`, `app/trip/ai-generate.tsx`,
`app/trip/ai-generating.tsx`) — all fixed in later tasks. No errors inside `types/index.ts`,
`types/ai.ts`, or `components/search/AddToTripSheet.tsx`.

- [ ] **Step 6: Commit**

```bash
git add types/index.ts types/ai.ts components/search/AddToTripSheet.tsx
git commit -m "feat: add Destination type and additionalDestinations field"
```

---

### Task 2: `DestinationListEditor` shared component

**Files:**
- Create: `components/trip/DestinationListEditor.tsx`

**Interfaces:**
- Consumes: `Destination` from `types/index.ts` (Task 1), `DestinationPicker` (existing,
  `{ visible, onSelect: (place: PlaceSelection) => void, onClose }`), `PlaceSelection` from
  `hooks/usePlaceAutocomplete.ts` (existing, `{ placeId, name, lat, lng, countryCode, ... }`).
- Produces: `<DestinationListEditor destinations={Destination[]} onChange={(next: Destination[]) => void} maxTotal?={number} />`
  — consumed by Task 4 (`app/trip/new.tsx`) and Task 5 (`components/trip/AiPromptForm.tsx`).

- [ ] **Step 1: Create the component**

Create `components/trip/DestinationListEditor.tsx`:

```tsx
import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NestableDraggableFlatList, RenderItemParams } from 'react-native-draggable-flatlist';
import * as Haptics from 'expo-haptics';
import { MapPin, X, Plus, DotsSixVertical } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { DestinationPicker } from '@/components/ui/DestinationPicker';
import { PlaceSelection } from '@/hooks/usePlaceAutocomplete';
import { Destination } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

export interface DestinationListEditorProps {
  destinations: Destination[];
  onChange: (next: Destination[]) => void;
  /** Total destination cap INCLUDING the primary, which this editor never
   * sees directly (every current caller has its own separate single-
   * destination field for the primary). Defaults to 10 total, i.e. 9 here. */
  maxTotal?: number;
}

const DEFAULT_MAX_TOTAL = 10;

function placeSelectionToDestination(s: PlaceSelection): Destination {
  return { name: s.name, placeId: s.placeId, lat: s.lat, lng: s.lng, countryCode: s.countryCode };
}

/** Add/reorder/remove UI for a trip's additional destinations. Shared
 * between the manual trip wizard and the AI-generate form — see
 * docs/superpowers/specs/2026-07-25-multi-destination-trips-design.md. */
export function DestinationListEditor({ destinations, onChange, maxTotal = DEFAULT_MAX_TOTAL }: DestinationListEditorProps) {
  const { colors } = useTheme();
  const [pickerVisible, setPickerVisible] = useState(false);

  const maxAdditional = maxTotal - 1;
  const atCap = destinations.length >= maxAdditional;

  const handleOpenPicker = useCallback(() => {
    if (atCap) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPickerVisible(true);
  }, [atCap]);

  const handleClosePicker = useCallback(() => setPickerVisible(false), []);

  const handleSelect = useCallback(
    (s: PlaceSelection) => {
      onChange([...destinations, placeSelectionToDestination(s)]);
      setPickerVisible(false);
    },
    [destinations, onChange],
  );

  const handleRemove = useCallback(
    (index: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onChange(destinations.filter((_, i) => i !== index));
    },
    [destinations, onChange],
  );

  const handleDragEnd = useCallback(
    ({ data }: { data: Destination[] }) => {
      onChange(data);
    },
    [onChange],
  );

  const renderItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<Destination>) => (
      <View
        style={[
          styles.row,
          { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
          isActive && { borderColor: colors.brand.purple },
        ]}
      >
        <TouchableOpacity onLongPress={drag} activeOpacity={0.7} hitSlop={8} accessibilityLabel="Drag to reorder">
          <DotsSixVertical size={18} color={colors.text.tertiary} weight="bold" />
        </TouchableOpacity>
        <MapPin size={16} color={colors.brand.purple} weight="duotone" />
        <Text style={[styles.rowText, { color: colors.text.primary }]} numberOfLines={1}>
          {item.name}
        </Text>
        <TouchableOpacity
          onPress={() => handleRemove(getIndex() ?? 0)}
          activeOpacity={0.7}
          hitSlop={10}
          accessibilityLabel={`Remove ${item.name}`}
        >
          <X size={16} color={colors.text.tertiary} weight="bold" />
        </TouchableOpacity>
      </View>
    ),
    [colors, handleRemove],
  );

  return (
    <View style={styles.container}>
      {destinations.length > 0 && (
        <NestableDraggableFlatList
          data={destinations}
          keyExtractor={(item, index) => `${item.placeId}-${index}`}
          renderItem={renderItem}
          onDragEnd={handleDragEnd}
        />
      )}

      {!atCap && (
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}
          onPress={handleOpenPicker}
          activeOpacity={0.7}
        >
          <Plus size={16} color={colors.brand.purple} weight="bold" />
          <Text style={[styles.addBtnText, { color: colors.brand.purple }]}>Add another destination</Text>
        </TouchableOpacity>
      )}

      <DestinationPicker visible={pickerVisible} onSelect={handleSelect} onClose={handleClosePicker} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing['2'] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing['3'],
    marginBottom: Spacing['2'],
  },
  rowText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing['3'],
    minHeight: 44,
  },
  addBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
});
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors involving `components/trip/DestinationListEditor.tsx` itself. (Errors in
other files from Task 1's new required fields are still expected and unrelated to this file.)

- [ ] **Step 3: Commit**

```bash
git add components/trip/DestinationListEditor.tsx
git commit -m "feat: add DestinationListEditor for managing multi-destination trips"
```

---

### Task 3: `useCreateTrip.ts` writes `additionalDestinations`

**Files:**
- Modify: `hooks/useCreateTrip.ts`

**Interfaces:**
- Consumes: `CreateTripInput.additionalDestinations` (Task 1).

- [ ] **Step 1: Add the field to the Firestore write**

In `hooks/useCreateTrip.ts`'s `createTrip` function, find:

```ts
    const docRef = await addDoc(collection(db, 'trips'), {
      authorUid: uid,
      title: data.title,
      description: data.description,
      destination: data.destination,
      startDate: data.startDate ? Timestamp.fromDate(data.startDate) : null,
```

Replace with:

```ts
    const docRef = await addDoc(collection(db, 'trips'), {
      authorUid: uid,
      title: data.title,
      description: data.description,
      destination: data.destination,
      additionalDestinations: data.additionalDestinations,
      startDate: data.startDate ? Timestamp.fromDate(data.startDate) : null,
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors involving `hooks/useCreateTrip.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add hooks/useCreateTrip.ts
git commit -m "feat: persist additionalDestinations when creating a trip"
```

---

### Task 4: Manual wizard integration (`app/trip/new.tsx`)

**Files:**
- Modify: `app/trip/new.tsx`

**Interfaces:**
- Consumes: `DestinationListEditor` (Task 2), `Destination` (Task 1).

- [ ] **Step 1: Swap `ScrollView` for `NestableScrollContainer`**

`DestinationListEditor` nests a `NestableDraggableFlatList` — nesting that inside a plain `ScrollView`
breaks gesture handling (the same problem `app/trip/[id].tsx` already solved this way for its own
activity-reordering list). In `app/trip/new.tsx`:

Find the import block's `ScrollView` (currently part of the `react-native` import) and add, as a new
import line right after the `react-native` import block:

```ts
import { NestableScrollContainer } from 'react-native-draggable-flatlist';
```

Find:

```tsx
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {renderStep()}
          </ScrollView>
```

Replace with:

```tsx
          <NestableScrollContainer
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {renderStep()}
          </NestableScrollContainer>
```

- [ ] **Step 2: Add `additionalDestinations` state and thread it through `Step1Destination`**

Find the `Step1Props` interface and `Step1Destination` function signature:

```ts
interface Step1Props {
  destination: string;
  countryCode: string;
  placeId: string | null;
  onPlaceSelect: (s: PlaceSelection) => void;
  onClearPlace: () => void;
}

function Step1Destination({ destination, countryCode, placeId, onPlaceSelect, onClearPlace }: Step1Props) {
```

Replace with:

```ts
interface Step1Props {
  destination: string;
  countryCode: string;
  placeId: string | null;
  onPlaceSelect: (s: PlaceSelection) => void;
  onClearPlace: () => void;
  additionalDestinations: Destination[];
  onAdditionalDestinationsChange: (next: Destination[]) => void;
}

function Step1Destination({
  destination,
  countryCode,
  placeId,
  onPlaceSelect,
  onClearPlace,
  additionalDestinations,
  onAdditionalDestinationsChange,
}: Step1Props) {
```

Add the import (alongside the existing `DestinationPicker` import):

```ts
import { DestinationListEditor } from '@/components/trip/DestinationListEditor';
```

Find the existing types import:

```ts
import { TripVisibility } from '@/types';
```

Replace with (merge `Destination` into the existing `@/types` import rather than adding a second one):

```ts
import { TripVisibility, Destination } from '@/types';
```

Inside `Step1Destination`'s JSX, find the closing of the destination field's conditional country
block:

```tsx
      {isSelected && countryCode ? (
        <View style={step.field}>
          <Text style={[step.label, { color: colors.text.secondary }]}>Country</Text>
          <Text style={[step.countryBadge, { color: colors.brand.purple, backgroundColor: `${colors.brand.purple}1F` }]}>{countryCode}</Text>
        </View>
      ) : null}

      <DestinationPicker
```

Replace with:

```tsx
      {isSelected && countryCode ? (
        <View style={step.field}>
          <Text style={[step.label, { color: colors.text.secondary }]}>Country</Text>
          <Text style={[step.countryBadge, { color: colors.brand.purple, backgroundColor: `${colors.brand.purple}1F` }]}>{countryCode}</Text>
        </View>
      ) : null}

      {isSelected && (
        <View style={step.field}>
          <Text style={[step.label, { color: colors.text.secondary }]}>Additional destinations (optional)</Text>
          <DestinationListEditor
            destinations={additionalDestinations}
            onChange={onAdditionalDestinationsChange}
          />
        </View>
      )}

      <DestinationPicker
```

- [ ] **Step 3: Add state and pass props in the main wizard component**

Find the Step 1 state block:

```ts
  const [destination, setDestination] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
```

Replace with:

```ts
  const [destination, setDestination] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [additionalDestinations, setAdditionalDestinations] = useState<Destination[]>([]);
```

Find the `<Step1Destination ... />` call in `renderStep()`:

```tsx
      case 0:
        return (
          <Step1Destination
            destination={destination}
            countryCode={countryCode}
            placeId={placeId}
            onPlaceSelect={handlePlaceSelect}
            onClearPlace={handleClearPlace}
          />
        );
```

Replace with:

```tsx
      case 0:
        return (
          <Step1Destination
            destination={destination}
            countryCode={countryCode}
            placeId={placeId}
            onPlaceSelect={handlePlaceSelect}
            onClearPlace={handleClearPlace}
            additionalDestinations={additionalDestinations}
            onAdditionalDestinationsChange={setAdditionalDestinations}
          />
        );
```

- [ ] **Step 4: Auto-fill title from all destinations**

Find `handleNext`:

```ts
  const handleNext = useCallback(() => {
    if (!canAdvance()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 1 && titleAutoFilled) {
      setTitle(`Trip to ${destination.trim()}`);
    }
    goToStep(step + 1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, titleAutoFilled, destination, goToStep]);
```

Replace with:

```ts
  const handleNext = useCallback(() => {
    if (!canAdvance()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 1 && titleAutoFilled) {
      const allNames = [destination.trim(), ...additionalDestinations.map((d) => d.name)];
      setTitle(
        allNames.length === 1
          ? `Trip to ${allNames[0]}`
          : allNames.join(', ').replace(/, ([^,]*)$/, ' & $1'),
      );
    }
    goToStep(step + 1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, titleAutoFilled, destination, additionalDestinations, goToStep]);
```

- [ ] **Step 5: Pass `additionalDestinations` to `createTrip`**

Find `handleCreateTrip`:

```ts
      const newId = await createTrip({
        title: title.trim(),
        description: description.trim(),
        destination: {
          name: destination.trim(),
          placeId,
          lat,
          lng,
          countryCode: countryCode.trim() || null,
        },
        startDate,
        endDate,
        visibility,
        tags,
        coverImageUrl: null,
        isAiGenerated: false,
      });
```

Replace with:

```ts
      const newId = await createTrip({
        title: title.trim(),
        description: description.trim(),
        destination: {
          name: destination.trim(),
          placeId,
          lat,
          lng,
          countryCode: countryCode.trim() || null,
        },
        additionalDestinations,
        startDate,
        endDate,
        visibility,
        tags,
        coverImageUrl: null,
        isAiGenerated: false,
      });
```

- [ ] **Step 6: Show all destinations in the Step 4 review**

Find the `Step4Review` function's destination row:

```tsx
          <View style={review.row}>
            <MapPin size={20} color={colors.accent.teal} weight="duotone" />
            <View style={review.rowContent}>
              <Text style={[review.rowLabel, { color: colors.text.tertiary }]}>Destination</Text>
              <Text style={[review.rowValue, { color: colors.text.primary }]}>
                {destination}{countryCode ? ` · ${countryCode}` : ''}
              </Text>
            </View>
          </View>
```

This row is inside `Step4Review`, which currently doesn't receive `additionalDestinations` — add it to
`Step4Props` and the function signature first. Find:

```ts
interface Step4Props {
  destination: string;
  countryCode: string;
  startDate: Date | null;
  endDate: Date | null;
  title: string;
  visibility: TripVisibility;
  creating: boolean;
  error: string;
  onCreateTrip: () => void;
}

function Step4Review({ destination, countryCode, startDate, endDate, title, visibility, creating, error, onCreateTrip }: Step4Props) {
```

Replace with:

```ts
interface Step4Props {
  destination: string;
  countryCode: string;
  additionalDestinations: Destination[];
  startDate: Date | null;
  endDate: Date | null;
  title: string;
  visibility: TripVisibility;
  creating: boolean;
  error: string;
  onCreateTrip: () => void;
}

function Step4Review({ destination, countryCode, additionalDestinations, startDate, endDate, title, visibility, creating, error, onCreateTrip }: Step4Props) {
```

Now replace the destination row's value line:

```tsx
              <Text style={[review.rowValue, { color: colors.text.primary }]}>
                {destination}{countryCode ? ` · ${countryCode}` : ''}
              </Text>
```

with:

```tsx
              <Text style={[review.rowValue, { color: colors.text.primary }]}>
                {[destination, ...additionalDestinations.map((d) => d.name)].join(', ')}
                {countryCode ? ` · ${countryCode}` : ''}
              </Text>
```

Find the `<Step4Review ... />` call in `renderStep()` and add the new prop:

```tsx
      case 3:
        return (
          <Step4Review
            destination={destination}
            countryCode={countryCode}
            startDate={startDate}
            endDate={endDate}
            title={title}
            visibility={visibility}
            creating={creating}
            error={createError}
            onCreateTrip={handleCreateTrip}
          />
        );
```

Replace with:

```tsx
      case 3:
        return (
          <Step4Review
            destination={destination}
            countryCode={countryCode}
            additionalDestinations={additionalDestinations}
            startDate={startDate}
            endDate={endDate}
            title={title}
            visibility={visibility}
            creating={creating}
            error={createError}
            onCreateTrip={handleCreateTrip}
          />
        );
```

- [ ] **Step 7: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors involving `app/trip/new.tsx`.

- [ ] **Step 8: Commit**

```bash
git add app/trip/new.tsx
git commit -m "feat: support multiple destinations in the manual trip wizard"
```

---

### Task 5: AI-generate form + Cloud Function integration

**Files:**
- Modify: `components/trip/AiPromptForm.tsx`
- Modify: `app/trip/ai-generate.tsx`
- Modify: `app/trip/ai-generating.tsx`
- Modify: `functions/src/types.ts`
- Modify: `functions/src/generateTrip.ts`
- Modify: `functions/src/index.ts` (no change needed — `generateTrip` export is already correct;
  listed only so the file set for this task is complete and obviously unmodified)

**Interfaces:**
- Consumes: `DestinationListEditor` (Task 2), `Destination` (Task 1), `GenerateTripRequest.additionalDestinations` (Task 1).

- [ ] **Step 1: Add destination-list props to `AiPromptForm`**

In `components/trip/AiPromptForm.tsx`, find `AiPromptFormProps`:

```ts
export interface AiPromptFormProps {
  destination: string;
  countryCode: string;
  startDate: Date | null;
  endDate: Date | null;
  onStartDateChange: (d: Date | null) => void;
  onEndDateChange: (d: Date | null) => void;
  durationDays: number;
```

Replace with:

```ts
export interface AiPromptFormProps {
  destination: string;
  countryCode: string;
  additionalDestinations: Destination[];
  onAdditionalDestinationsChange: (next: Destination[]) => void;
  startDate: Date | null;
  endDate: Date | null;
  onStartDateChange: (d: Date | null) => void;
  onEndDateChange: (d: Date | null) => void;
  durationDays: number;
```

Find the function signature:

```ts
export function AiPromptForm({
  destination,
  countryCode,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  durationDays,
```

Replace with:

```ts
export function AiPromptForm({
  destination,
  countryCode,
  additionalDestinations,
  onAdditionalDestinationsChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  durationDays,
```

Add imports (alongside the existing `DestinationPicker` import):

```ts
import { DestinationListEditor } from '@/components/trip/DestinationListEditor';
import { Destination } from '@/types';
```

- [ ] **Step 2: Render `DestinationListEditor` below the destination field**

Find the closing of the Country Code field, right before the Travel dates field added in the previous
plan:

```tsx
        <Text style={[styles.hint, { color: colors.text.tertiary }]}>
          {isPlaceSelected ? 'Auto-filled from Places — tap to override' : '2-letter ISO country code'}
        </Text>
      </View>

      {/* Travel dates (optional) — when both are set, they drive the
```

Insert a new field between them (result shown with surrounding context):

```tsx
        <Text style={[styles.hint, { color: colors.text.tertiary }]}>
          {isPlaceSelected ? 'Auto-filled from Places — tap to override' : '2-letter ISO country code'}
        </Text>
      </View>

      {isPlaceSelected && (
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Additional destinations (optional)</Text>
          <DestinationListEditor
            destinations={additionalDestinations}
            onChange={onAdditionalDestinationsChange}
          />
        </View>
      )}

      {/* Travel dates (optional) — when both are set, they drive the
```

- [ ] **Step 3: Add state in `ai-generate.tsx` and swap to `NestableScrollContainer`**

In `app/trip/ai-generate.tsx`, add the import:

```ts
import { NestableScrollContainer } from 'react-native-draggable-flatlist';
import { Destination } from '@/types';
```

Find the state block:

```ts
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [durationDays, setDurationDays] = useState(7);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
```

Replace with:

```ts
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [additionalDestinations, setAdditionalDestinations] = useState<Destination[]>([]);
  const [durationDays, setDurationDays] = useState(7);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
```

Find the `<ScrollView` opening tag (there is exactly one in this file):

```tsx
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
```

Replace `ScrollView` with `NestableScrollContainer` on both the opening and closing tag:

```tsx
        <NestableScrollContainer
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
```

and find:

```tsx
        </ScrollView>
      </KeyboardAvoidingView>
```

replace with:

```tsx
        </NestableScrollContainer>
      </KeyboardAvoidingView>
```

- [ ] **Step 4: Pass the new props to `AiPromptForm` and include destinations in the navigation params**

Find the `<AiPromptForm ... />` call and add the two new props:

```tsx
          <AiPromptForm
            destination={destination}
            countryCode={countryCode}
            durationDays={durationDays}
```

Replace with:

```tsx
          <AiPromptForm
            destination={destination}
            countryCode={countryCode}
            additionalDestinations={additionalDestinations}
            onAdditionalDestinationsChange={setAdditionalDestinations}
            durationDays={durationDays}
```

Find `handleGenerate`'s navigation params:

```tsx
    router.push({
      pathname: '/trip/ai-generating',
      params: {
        destination: destination.trim(),
        countryCode: countryCode.trim(),
        durationDays: String(effectiveDurationDays),
        travelStyle,
        pace,
        mustSee: JSON.stringify(mustSee),
        preferences,
        startDate: startDate ? startDate.toISOString() : '',
        endDate: endDate ? endDate.toISOString() : '',
      },
    });
```

Replace with:

```tsx
    router.push({
      pathname: '/trip/ai-generating',
      params: {
        destination: destination.trim(),
        countryCode: countryCode.trim(),
        additionalDestinations: JSON.stringify(additionalDestinations),
        durationDays: String(effectiveDurationDays),
        travelStyle,
        pace,
        mustSee: JSON.stringify(mustSee),
        preferences,
        startDate: startDate ? startDate.toISOString() : '',
        endDate: endDate ? endDate.toISOString() : '',
      },
    });
```

- [ ] **Step 5: Reconstruct `additionalDestinations` in `ai-generating.tsx`**

In `app/trip/ai-generating.tsx`, find the `useLocalSearchParams` type:

```ts
  const params = useLocalSearchParams<{
    destination: string;
    countryCode: string;
    durationDays: string;
```

Replace with:

```ts
  const params = useLocalSearchParams<{
    destination: string;
    countryCode: string;
    additionalDestinations: string;
    durationDays: string;
```

Find the `GenerateTripRequest` reconstruction:

```ts
    const request: GenerateTripRequest = {
      destination: params.destination ?? '',
      countryCode: params.countryCode ?? '',
      durationDays: parseInt(params.durationDays ?? '7', 10),
```

Replace with:

```ts
    const request: GenerateTripRequest = {
      destination: params.destination ?? '',
      countryCode: params.countryCode ?? '',
      additionalDestinations: (() => {
        try {
          return JSON.parse(params.additionalDestinations ?? '[]') as GenerateTripRequest['additionalDestinations'];
        } catch {
          return [];
        }
      })(),
      durationDays: parseInt(params.durationDays ?? '7', 10),
```

(Matches the existing `mustSee` reconstruction's try/catch-parse pattern a few lines below, for the
same reason: a malformed or missing route param shouldn't crash the screen.)

- [ ] **Step 6: Add `additionalDestinations` to the Cloud Function's request type**

In `functions/src/types.ts`, find:

```ts
export interface GenerateTripRequest {
  destination: string;
  countryCode: string;
  startDate: string | null;   // ISO string or null
  endDate: string | null;
  durationDays: number;
  travelStyle: 'adventure' | 'luxury' | 'budget' | 'family' | 'cultural';
  pace: 'relaxed' | 'moderate' | 'packed';
  mustSee: string[];
  preferences: string;
}
```

Replace with:

```ts
export interface GenerateTripRequest {
  destination: string;
  countryCode: string;
  /** Additional stops beyond the primary destination, in visit order. Stored
   * on the created trip; NOT yet used by buildPrompt() (Phase 2 — see
   * docs/superpowers/specs/2026-07-25-multi-destination-trips-design.md). */
  additionalDestinations: { name: string; placeId: string | null; lat: number | null; lng: number | null; countryCode: string | null }[];
  startDate: string | null;   // ISO string or null
  endDate: string | null;
  durationDays: number;
  travelStyle: 'adventure' | 'luxury' | 'budget' | 'family' | 'cultural';
  pace: 'relaxed' | 'moderate' | 'packed';
  mustSee: string[];
  preferences: string;
}
```

- [ ] **Step 7: Store the list on the created trip**

In `functions/src/generateTrip.ts`, find the `tripData` object:

```ts
    const tripData = {
      authorUid: uid,
      title: generated.title,
      description: generated.description,
      coverImageUrl: null,
      destination: {
        name: data.destination,
        placeId: null,
        lat: null,
        lng: null,
        countryCode: data.countryCode || null,
      },
      startDate: data.startDate ? admin.firestore.Timestamp.fromDate(new Date(data.startDate)) : null,
```

Replace with:

```ts
    const tripData = {
      authorUid: uid,
      title: generated.title,
      description: generated.description,
      coverImageUrl: null,
      destination: {
        name: data.destination,
        placeId: null,
        lat: null,
        lng: null,
        countryCode: data.countryCode || null,
      },
      additionalDestinations: data.additionalDestinations ?? [],
      startDate: data.startDate ? admin.firestore.Timestamp.fromDate(new Date(data.startDate)) : null,
```

- [ ] **Step 8: Verify both packages build**

Run: `npx tsc --noEmit`
Expected: no errors involving `components/trip/AiPromptForm.tsx`, `app/trip/ai-generate.tsx`, or
`app/trip/ai-generating.tsx`.

Run: `cd functions && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add components/trip/AiPromptForm.tsx app/trip/ai-generate.tsx app/trip/ai-generating.tsx functions/src/types.ts functions/src/generateTrip.ts
git commit -m "feat: support multiple destinations in AI trip generation intake"
```

---

### Task 6: Trip detail screen — additional destination chips

**Files:**
- Modify: `app/trip/[id].tsx`

**Interfaces:**
- Consumes: `Trip.additionalDestinations` (Task 1).

- [ ] **Step 1: Add a chip per additional destination to the existing chip strip**

`app/trip/[id].tsx` already has a horizontal chip strip (destination + status + visibility chips) —
this reuses that existing pattern rather than adding a separate text line, matching how the rest of
this screen represents small trip facts.

Find the destination chip:

```tsx
          <View style={[styles.chip, { backgroundColor: colors.background.sunken }]}>
            <MapPin size={13} color={colors.text.secondary} weight="bold" />
            <Text style={[styles.chipText, { color: colors.text.primary }]} numberOfLines={1}>
              {trip.destination.name}
            </Text>
          </View>
```

Replace with:

```tsx
          <View style={[styles.chip, { backgroundColor: colors.background.sunken }]}>
            <MapPin size={13} color={colors.text.secondary} weight="bold" />
            <Text style={[styles.chipText, { color: colors.text.primary }]} numberOfLines={1}>
              {trip.destination.name}
            </Text>
          </View>

          {trip.additionalDestinations?.map((dest, i) => (
            <View
              key={`${dest.placeId}-${i}`}
              style={[styles.chip, { backgroundColor: colors.background.sunken }]}
            >
              <MapPin size={13} color={colors.text.secondary} weight="bold" />
              <Text style={[styles.chipText, { color: colors.text.primary }]} numberOfLines={1}>
                {dest.name}
              </Text>
            </View>
          ))}
```

(`trip.additionalDestinations?.` — optional chaining — because trip documents created before this
plan shipped have no `additionalDestinations` field at all, not even an empty array; the field is
required on the TypeScript type going forward but existing Firestore documents predate it.)

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors involving `app/trip/[id].tsx`, and — combined with every other task in this plan —
no errors anywhere in the project.

- [ ] **Step 3: Commit**

```bash
git add app/trip/\[id\].tsx
git commit -m "feat: show additional destinations as chips on the trip detail screen"
```

---

### Task 7: Full app smoke test + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors project-wide.

- [ ] **Step 2: Run the functions build**

Run: `cd functions && npm run build`
Expected: exits 0.

- [ ] **Step 3: Manually exercise both creation flows**

With the app running (dev-client + Metro):

1. **Manual wizard**: Create → Manual trip. Pick a primary destination, tap "Add another destination"
   twice (e.g. Rome, then Barcelona). Confirm both appear as rows, drag to reorder them, remove one
   and confirm it disappears. Advance to Step 3 — confirm the auto-filled title reads like
   "Paris, Barcelona" (or whatever order remains) with an "&" before the last name once 2+ remain.
   Advance to Step 4 — confirm the review screen's destination row lists every destination.
   Create the trip and confirm the detail screen's chip strip shows a chip per destination.
2. **AI-generate**: Create → Generate with AI. Pick a primary destination, add 1-2 more via the same
   editor. Generate the trip. Confirm the created trip's detail screen shows all destination chips
   (the itinerary itself will still only cover the primary destination — that's the expected Phase 1
   boundary, not a bug).
3. Confirm a trip created before this change (if one exists) still renders correctly — its chip strip
   should show just the primary destination with no additional chips and no crash from the missing
   `additionalDestinations` field.

Run the `supernova-design` skill's pre-ship checklist against every new/changed screen in this plan
(`app/trip/new.tsx`, `components/trip/AiPromptForm.tsx`, `app/trip/ai-generate.tsx`, `app/trip/[id].tsx`,
`components/trip/DestinationListEditor.tsx`) before considering this plan done.

- [ ] **Step 4: No commit** — verification only.

## Self-Review Notes

**Spec coverage:** every Design Decision row maps to a task — primary-stays-unchanged data model
(Task 1), shared `DestinationListEditor` (Task 2), both creation flows (Tasks 4, 5), ordering via
drag (Task 2's `NestableDraggableFlatList`), 10-item cap (Task 2's `maxTotal`/`atCap`), comma-joined
auto-title (Task 4 Step 4), trip detail display (Task 6), and the explicit "out of scope" list (Global
Constraints — `TripCard`, cover resolver, packing templates, map, Algolia sync, `EditTripSheet` are
never mentioned as modified anywhere in this plan).

**Placeholder scan:** no TBD/TODO; every step has complete, literal code matching the actual current
file contents (verified against direct reads of every file this plan modifies).

**Type consistency:** `Destination` (Task 1) is used identically — `{ name, placeId, lat, lng,
countryCode }` — everywhere it appears: `DestinationListEditor`'s props (Task 2), `Step1Props`/
`Step4Props` in `new.tsx` (Task 4), `AiPromptFormProps` (Task 5). The Cloud Function's mirrored inline
shape (Task 5 Steps 6-7, `functions/src/types.ts`) intentionally duplicates rather than imports this
shape — `functions/` is a separate npm package from the client, same cross-package boundary already
established for `sortedPairId` in the direct-messaging feature's `functions/src/dmThreads.ts`.
