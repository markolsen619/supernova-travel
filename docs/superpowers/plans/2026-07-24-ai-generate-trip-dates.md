# AI-Generate Trip Dates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let someone pick real start/end dates on the AI trip generation form, with the itinerary's day count auto-deriving from the date range when both are set.

**Architecture:** Two-file change, no backend changes. `AiPromptForm.tsx` gains a date-picker section (reusing the existing `DatePickerModal` component) between Destination and Duration; `ai-generate.tsx` gains date state and derives `durationDays` from the dates when both are set, replacing its current hardcoded `startDate: '', endDate: ''` navigation params.

**Tech Stack:** Expo/React Native, `components/ui/DatePickerModal` (existing).

**Spec:** `docs/superpowers/specs/2026-07-24-ai-generate-trip-dates-design.md`

## Global Constraints

- Dates are optional. When neither is set, the existing manual duration stepper (1–14 days) works exactly as it does today — unchanged behavior.
- When BOTH `startDate` and `endDate` are set, the duration stepper's +/- buttons become disabled and its displayed value is derived from the date range (`diffDays(startDate, endDate) + 1` — an inclusive day count, so Jul 10 → Jul 16 reads as 7 days, not 6).
- The end-date picker must use `minimumDate={startDate ?? undefined}` (the same constraint `app/trip/new.tsx`'s `Step2Dates` already applies) so an invalid end-before-start date is structurally impossible, not just caught after the fact.
- A "Clear dates" text action appears only once both dates are set, and resets both to `null` — returning the stepper to full manual control.
- No changes to `app/trip/ai-generating.tsx` or `functions/src/generateTrip.ts` — both already handle real dates correctly end-to-end.
- All new UI reads colors via `useTheme()` — no hardcoded hex, matching every existing field in both touched files.
- `StyleSheet.create` stays module-level/static — theme-dependent colors go in inline styles only, matching the existing pattern in both files.
- Haptics: `Light` on date-picker open and on "Clear dates" — matching this form's existing convention (every other field interaction in `AiPromptForm.tsx` fires `Light`, e.g. `handleClearPlace`, `handleTravelStyleSelect`).

---

### Task 1: Add date fields to `AiPromptForm`

**Files:**
- Modify: `components/trip/AiPromptForm.tsx`

**Interfaces:**
- Consumes: `DatePickerModalProps` from `components/ui/DatePickerModal.tsx` (existing: `{ visible, date, title, onConfirm, onCancel, minimumDate? }`).
- Produces: four new props on `AiPromptFormProps` — `startDate: Date | null`, `endDate: Date | null`, `onStartDateChange: (d: Date | null) => void`, `onEndDateChange: (d: Date | null) => void` — consumed by Task 2 (`app/trip/ai-generate.tsx`).

- [ ] **Step 1: Add the new props to `AiPromptFormProps` and the component signature**

In `components/trip/AiPromptForm.tsx`, add to the `AiPromptFormProps` interface (currently lines 21–38), inserting after `countryCode: string;`:

```ts
  startDate: Date | null;
  endDate: Date | null;
  onStartDateChange: (d: Date | null) => void;
  onEndDateChange: (d: Date | null) => void;
```

Add the same four names to the destructured props in the `AiPromptForm` function signature (currently lines 61–78), inserting after `countryCode,`:

```ts
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
```

- [ ] **Step 2: Add imports**

Add to the existing imports at the top of the file:

```ts
import { CalendarBlank } from 'phosphor-react-native';
import { DatePickerModal } from '@/components/ui/DatePickerModal';
```

(`CalendarBlank` joins the existing `phosphor-react-native` import line rather than a new line — merge into the existing `import { MapPin, MagnifyingGlass, X, Mountains, Diamond, Wallet, UsersThree, Bank, Minus, Plus } from 'phosphor-react-native';` at line 10.)

- [ ] **Step 3: Add local state for the two date-picker modals' visibility**

Inside the `AiPromptForm` function body, alongside the existing `const [pickerVisible, setPickerVisible] = useState(false);` (line 80):

```ts
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
```

- [ ] **Step 4: Add the helper functions this section needs**

Add near the top of the file, after the existing `PACE_OPTIONS` constant (after line 57), a `formatDate` helper (mirrors `app/trip/new.tsx`'s own, kept local rather than shared — see Global Constraints in the spec: no shared date-utility module exists in this codebase to extend):

```ts
function formatDate(d: Date | null): string {
  if (!d) return 'Tap to set date';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function diffDays(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
```

- [ ] **Step 5: Add the handlers**

Inside the `AiPromptForm` function body, after the existing `handlePaceSelect` callback (after line 132):

```ts
  const handleOpenStartPicker = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowStartPicker(true);
  }, []);

  const handleOpenEndPicker = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowEndPicker(true);
  }, []);

  const handleClearDates = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onStartDateChange(null);
    onEndDateChange(null);
  }, [onStartDateChange, onEndDateChange]);

  const datesSet = Boolean(startDate && endDate);
  const derivedDays = diffDays(startDate, endDate);
```

- [ ] **Step 6: Add the "Travel dates" field, between Destination and Duration**

Insert this new field block right after the closing `</View>` of the "Country Code" field (after line 184, before the `{/* Duration */}` comment at line 186):

```tsx
      {/* Travel dates (optional) — when both are set, they drive the
          duration below instead of the manual stepper. */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Travel dates (optional)</Text>
        <View style={styles.dateRow}>
          <TouchableOpacity
            style={[styles.dateBtn, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}
            onPress={handleOpenStartPicker}
            activeOpacity={0.7}
          >
            <Text style={[styles.dateText, { color: startDate ? colors.text.primary : colors.text.tertiary }]}>
              {formatDate(startDate)}
            </Text>
            <CalendarBlank size={18} color={colors.text.tertiary} weight="regular" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.dateBtn, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}
            onPress={handleOpenEndPicker}
            activeOpacity={0.7}
          >
            <Text style={[styles.dateText, { color: endDate ? colors.text.primary : colors.text.tertiary }]}>
              {formatDate(endDate)}
            </Text>
            <CalendarBlank size={18} color={colors.text.tertiary} weight="regular" />
          </TouchableOpacity>
        </View>

        {datesSet && (
          <TouchableOpacity onPress={handleClearDates} activeOpacity={0.7} hitSlop={8} style={styles.clearDatesBtn}>
            <Text style={[styles.clearDatesText, { color: colors.text.tertiary }]}>Clear dates</Text>
          </TouchableOpacity>
        )}
      </View>

      <DatePickerModal
        visible={showStartPicker}
        date={startDate}
        title="Select start date"
        onConfirm={(d) => { onStartDateChange(d); setShowStartPicker(false); }}
        onCancel={() => setShowStartPicker(false)}
      />
      <DatePickerModal
        visible={showEndPicker}
        date={endDate}
        title="Select end date"
        onConfirm={(d) => { onEndDateChange(d); setShowEndPicker(false); }}
        onCancel={() => setShowEndPicker(false)}
        minimumDate={startDate ?? undefined}
      />
```

- [ ] **Step 7: Wire the duration stepper to lock when dates are set**

In the existing "Duration" field block (currently lines 187–223), change the duration value display and disable the +/- buttons when `datesSet` is true. Replace:

```tsx
      {/* Duration */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Duration</Text>
        <View style={styles.durationRow}>
          <TouchableOpacity
            style={[
              styles.durationBtn,
              { backgroundColor: `${colors.brand.purple}1F`, borderColor: colors.brand.purple },
              durationDays <= MIN_DAYS && { backgroundColor: colors.background.sunken, borderColor: colors.background.cardBorder },
            ]}
            onPress={handleDecrement}
            activeOpacity={0.7}
            disabled={durationDays <= MIN_DAYS}
            accessibilityLabel="Decrease duration"
          >
            <Minus size={18} color={durationDays <= MIN_DAYS ? colors.text.disabled : colors.brand.purple} weight="bold" />
          </TouchableOpacity>

          <View style={styles.durationDisplay}>
            <Text style={[styles.durationValue, { color: colors.text.primary }]}>{durationDays}</Text>
            <Text style={[styles.durationUnit, { color: colors.text.secondary }]}>{durationDays === 1 ? 'day' : 'days'}</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.durationBtn,
              { backgroundColor: `${colors.brand.purple}1F`, borderColor: colors.brand.purple },
              durationDays >= MAX_DAYS && { backgroundColor: colors.background.sunken, borderColor: colors.background.cardBorder },
            ]}
            onPress={handleIncrement}
            activeOpacity={0.7}
            disabled={durationDays >= MAX_DAYS}
            accessibilityLabel="Increase duration"
          >
            <Plus size={18} color={durationDays >= MAX_DAYS ? colors.text.disabled : colors.brand.purple} weight="bold" />
          </TouchableOpacity>
        </View>
      </View>
```

With:

```tsx
      {/* Duration — locked to the date range once both dates are set */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Duration</Text>
        <View style={styles.durationRow}>
          <TouchableOpacity
            style={[
              styles.durationBtn,
              { backgroundColor: `${colors.brand.purple}1F`, borderColor: colors.brand.purple },
              (datesSet || durationDays <= MIN_DAYS) && { backgroundColor: colors.background.sunken, borderColor: colors.background.cardBorder },
            ]}
            onPress={handleDecrement}
            activeOpacity={0.7}
            disabled={datesSet || durationDays <= MIN_DAYS}
            accessibilityLabel="Decrease duration"
          >
            <Minus size={18} color={(datesSet || durationDays <= MIN_DAYS) ? colors.text.disabled : colors.brand.purple} weight="bold" />
          </TouchableOpacity>

          <View style={styles.durationDisplay}>
            <Text style={[styles.durationValue, { color: colors.text.primary }]}>
              {datesSet && derivedDays !== null ? derivedDays + 1 : durationDays}
            </Text>
            <Text style={[styles.durationUnit, { color: colors.text.secondary }]}>
              {(datesSet && derivedDays !== null ? derivedDays + 1 : durationDays) === 1 ? 'day' : 'days'}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.durationBtn,
              { backgroundColor: `${colors.brand.purple}1F`, borderColor: colors.brand.purple },
              (datesSet || durationDays >= MAX_DAYS) && { backgroundColor: colors.background.sunken, borderColor: colors.background.cardBorder },
            ]}
            onPress={handleIncrement}
            activeOpacity={0.7}
            disabled={datesSet || durationDays >= MAX_DAYS}
            accessibilityLabel="Increase duration"
          >
            <Plus size={18} color={(datesSet || durationDays >= MAX_DAYS) ? colors.text.disabled : colors.brand.purple} weight="bold" />
          </TouchableOpacity>
        </View>
        {datesSet && (
          <Text style={[styles.hint, { color: colors.text.tertiary }]}>Derived from your travel dates</Text>
        )}
      </View>
```

- [ ] **Step 8: Add the new styles**

Add to the existing `StyleSheet.create` call (after the `durationUnit` entry, before `styleGrid`):

```ts
  dateRow: {
    flexDirection: 'row',
    gap: Spacing['3'],
  },
  dateBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing['4'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  dateText: {
    fontSize: FontSize.sm,
  },
  clearDatesBtn: {
    alignSelf: 'flex-start',
    marginTop: Spacing['2'],
  },
  clearDatesText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    textDecorationLine: 'underline',
  },
```

- [ ] **Step 9: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: new errors ONLY in `app/trip/ai-generate.tsx` (the caller — it doesn't yet pass the four new required props; that's fixed in Task 2). No errors inside `components/trip/AiPromptForm.tsx` itself.

- [ ] **Step 10: Commit**

```bash
git add components/trip/AiPromptForm.tsx
git commit -m "feat: add optional travel dates to the AI trip generation form"
```

---

### Task 2: Wire date state through `ai-generate.tsx`

**Files:**
- Modify: `app/trip/ai-generate.tsx`

**Interfaces:**
- Consumes: the four new `AiPromptForm` props from Task 1 (`startDate`, `endDate`, `onStartDateChange`, `onEndDateChange`).
- Produces: real `startDate`/`endDate` ISO strings in the `ai-generating` navigation params, replacing the current hardcoded `startDate: '', endDate: ''`.

- [ ] **Step 1: Add date state**

In `app/trip/ai-generate.tsx`, add alongside the existing state declarations (after `const [durationDays, setDurationDays] = useState(7);`, currently line 52):

```ts
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
```

- [ ] **Step 2: Add the `diffDays` helper**

Add near the top of the file, after the existing `quotaLabel` function (after line 36):

```ts
function diffDays(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
```

(Duplicated from `app/trip/new.tsx` and `AiPromptForm.tsx` deliberately — see the spec's "Out of Scope" section: no shared date-utility module exists in this codebase to extend, and each is a small, single-file-scoped helper.)

- [ ] **Step 3: Derive the effective duration and update `isValid`/`handleGenerate`**

Replace the existing `isValid` line (currently line 64):

```ts
  const isValid = destination.trim().length > 0 && durationDays >= 1;
```

with:

```ts
  const datesSet = Boolean(startDate && endDate);
  const derivedDays = diffDays(startDate, endDate);
  const effectiveDurationDays = datesSet && derivedDays !== null ? derivedDays + 1 : durationDays;
  const isValid = destination.trim().length > 0 && effectiveDurationDays >= 1;
```

Replace the `handleGenerate` function's navigation params (currently lines 79–92):

```ts
    router.push({
      pathname: '/trip/ai-generating',
      params: {
        destination: destination.trim(),
        countryCode: countryCode.trim(),
        durationDays: String(durationDays),
        travelStyle,
        pace,
        mustSee: JSON.stringify(mustSee),
        preferences,
        startDate: '',
        endDate: '',
      },
    });
```

with:

```ts
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

- [ ] **Step 4: Pass the new props to `AiPromptForm`**

In the `<AiPromptForm ... />` JSX (currently lines 144–161), add the four new props alongside the existing ones:

```tsx
          <AiPromptForm
            destination={destination}
            countryCode={countryCode}
            durationDays={durationDays}
            travelStyle={travelStyle}
            pace={pace}
            mustSeeInput={mustSeeInput}
            preferences={preferences}
            startDate={startDate}
            endDate={endDate}
            onDestinationChange={setDestination}
            onCountryCodeChange={setCountryCode}
            onDurationChange={setDurationDays}
            onTravelStyleChange={setTravelStyle}
            onPaceChange={setPace}
            onMustSeeChange={setMustSeeInput}
            onPreferencesChange={setPreferences}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            destinationPlaceId={placeId}
            onPlaceSelect={handlePlaceSelect}
          />
```

- [ ] **Step 5: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `app/trip/ai-generate.tsx` or `components/trip/AiPromptForm.tsx`. (Any remaining errors elsewhere in the repo are pre-existing and unrelated — confirm by checking the error file paths don't include either of these two files.)

- [ ] **Step 6: Commit**

```bash
git add app/trip/ai-generate.tsx
git commit -m "feat: derive AI trip duration from picked dates when both are set"
```

---

### Task 3: Manual verification on simulator

**Files:** none (verification only)

- [ ] **Step 1: Run the app and exercise the flow**

With the Metro dev server running and the app connected (dev-client build), navigate: Create → Generate with AI. Verify:
- Duration stepper works exactly as before when no dates are picked.
- Tapping either date button opens `DatePickerModal` and setting a date updates the button's label.
- Setting an end date before a start date is picked is fine (no ordering constraint until a start date exists); once a start date is set, the end-date picker's `minimumDate` prevents picking an earlier end date.
- Once BOTH dates are set: duration stepper's +/- buttons visibly disable, the displayed count updates to match the inclusive day range (e.g. picking the same day for both shows "1 day"; a 6-day gap shows "7 days"), and a "Clear dates" link appears.
- Tapping "Clear dates" resets both date buttons to placeholder text and re-enables the stepper at whatever value it last held.
- Generating a trip with dates set produces a trip whose stored `startDate`/`endDate` (visible on the trip detail screen) match what was picked, and whose day count matches.

Run the `supernova-design` skill's pre-ship checklist against the new UI in `AiPromptForm.tsx` before considering this done.

- [ ] **Step 2: No commit** — verification only.

## Self-Review Notes

**Spec coverage:** every row of the spec's Design Decision table maps to a step above — dates-drive-duration (Task 1 Step 7, Task 2 Step 3), `DatePickerModal` reuse (Task 1 Steps 2 and 6), no backend changes (nothing in this plan touches `ai-generating.tsx` or `functions/`), `minimumDate` constraint (Task 1 Step 6), "Clear dates" action (Task 1 Steps 5–6).

**Placeholder scan:** no TBD/TODO; every step has complete, literal code.

**Type consistency:** `AiPromptFormProps`'s four new prop names (`startDate`, `endDate`, `onStartDateChange`, `onEndDateChange`) are identical between Task 1 (where they're declared) and Task 2 (where they're passed in) — checked against each other directly above.
