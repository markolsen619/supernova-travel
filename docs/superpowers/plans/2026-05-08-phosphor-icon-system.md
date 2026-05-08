# Phosphor Icon System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every emoji icon in the app with `phosphor-react-native` Duotone icons, using per-type accent colors for semantic type indicators and a shared `TypeIconBubble` component for the icon-in-bubble pattern.

**Architecture:** Install `phosphor-react-native` (peer dep `react-native-svg` already at 15.12.1). Create `constants/icons.ts` as the central type→icon+color registry. Create `components/ui/TypeIconBubble.tsx` as a shared bubble wrapper used by `ActivityItem`, `ReservationCard`, and `LoyaltyCard`. All other files import Phosphor components directly.

**Tech Stack:** `phosphor-react-native`, React Native SVG, TypeScript, Expo

**Spec:** `docs/superpowers/specs/2026-05-08-phosphor-icon-system-design.md`

---

## File Map

| Action | Path |
|---|---|
| Create | `constants/icons.ts` |
| Create | `components/ui/TypeIconBubble.tsx` |
| Create | `__tests__/constants/icons.test.ts` |
| Modify | `app/(tabs)/_layout.tsx` |
| Modify | `components/feed/FeedActions.tsx` |
| Modify | `components/trip/ActivityItem.tsx` |
| Modify | `components/wallet/ReservationCard.tsx` |
| Modify | `components/wallet/LoyaltyCard.tsx` |
| Modify | `components/paywall/PaywallFeatureList.tsx` |
| Modify | `app/(tabs)/create.tsx` |
| Modify | `app/trip/new.tsx` |

---

### Task 1: Install phosphor-react-native and add .superpowers/ to .gitignore

**Files:**
- Modify: `package.json` (via expo install)
- Modify: `.gitignore`

- [ ] **Step 1: Install the package**

```bash
npx expo install phosphor-react-native
```

Expected: `phosphor-react-native` appears in `package.json` dependencies. No errors about `react-native-svg` (already installed at 15.12.1).

- [ ] **Step 2: Add .superpowers/ to .gitignore**

Open `.gitignore` and add at the bottom:

```
# Brainstorm session files
.superpowers/
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: install phosphor-react-native, ignore .superpowers/"
```

---

### Task 2: Create constants/icons.ts

**Files:**
- Create: `constants/icons.ts`
- Create: `__tests__/constants/icons.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/constants/icons.test.ts`:

```ts
import {
  ACTIVITY_ICONS,
  RESERVATION_ICONS,
  LOYALTY_ICONS,
  PAYWALL_FEATURE_ICONS,
  TAB_ICONS,
} from '@/constants/icons';

describe('ACTIVITY_ICONS', () => {
  it('has an entry for every ActivityType', () => {
    const types = ['flight', 'hotel', 'restaurant', 'activity', 'transport', 'free'] as const;
    types.forEach((t) => {
      expect(ACTIVITY_ICONS[t]).toBeDefined();
      expect(typeof ACTIVITY_ICONS[t].color).toBe('string');
      expect(ACTIVITY_ICONS[t].Icon).toBeDefined();
    });
  });
});

describe('RESERVATION_ICONS', () => {
  it('has an entry for every ReservationType', () => {
    const types = ['hotel', 'airbnb', 'rental_car', 'restaurant', 'activity'] as const;
    types.forEach((t) => {
      expect(RESERVATION_ICONS[t]).toBeDefined();
      expect(RESERVATION_ICONS[t].Icon).toBeDefined();
    });
  });
});

describe('LOYALTY_ICONS', () => {
  it('has an entry for every loyalty programType', () => {
    const types = ['airline', 'hotel', 'car_rental', 'credit_card', 'other'] as const;
    types.forEach((t) => {
      expect(LOYALTY_ICONS[t]).toBeDefined();
      expect(LOYALTY_ICONS[t].Icon).toBeDefined();
    });
  });
});

describe('PAYWALL_FEATURE_ICONS', () => {
  it('has 6 entries each with Icon, color, label, description', () => {
    expect(PAYWALL_FEATURE_ICONS).toHaveLength(6);
    PAYWALL_FEATURE_ICONS.forEach((f) => {
      expect(f.Icon).toBeDefined();
      expect(typeof f.color).toBe('string');
      expect(typeof f.label).toBe('string');
      expect(typeof f.description).toBe('string');
    });
  });
});

describe('TAB_ICONS', () => {
  it('has icons for index, explore, search, profile', () => {
    ['index', 'explore', 'search', 'profile'].forEach((name) => {
      expect(TAB_ICONS[name]).toBeDefined();
    });
  });
  it('does not have an icon for create (gradient button)', () => {
    expect(TAB_ICONS['create']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- --testPathPattern="icons.test" --watchAll=false
```

Expected: FAIL — `Cannot find module '@/constants/icons'`

- [ ] **Step 3: Create constants/icons.ts**

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
  Camera,
  VideoCamera,
  UsersThree,
  Bell,
  Bag,
  CalendarPlus,
  Star,
  CreditCard,
} from 'phosphor-react-native';
import type { IconProps } from 'phosphor-react-native';
import type { ActivityType, ReservationType } from '@/types';
import type { LoyaltyProgram } from '@/types';

export type PhosphorIcon = React.FC<IconProps>;

type IconEntry = { Icon: PhosphorIcon; color: string };

export const ACTIVITY_ICONS: Record<ActivityType, IconEntry> = {
  flight:     { Icon: AirplaneTilt, color: '#60a5fa' },
  hotel:      { Icon: Buildings,    color: '#a78bfa' },
  restaurant: { Icon: ForkKnife,    color: '#f472b6' },
  activity:   { Icon: Ticket,       color: '#34d399' },
  transport:  { Icon: Car,          color: '#fbbf24' },
  free:       { Icon: Clock,        color: '#6b7280' },
};

export const RESERVATION_ICONS: Record<ReservationType, IconEntry> = {
  hotel:      { Icon: Buildings, color: '#a78bfa' },
  airbnb:     { Icon: House,     color: '#f472b6' },
  rental_car: { Icon: Car,       color: '#fbbf24' },
  restaurant: { Icon: ForkKnife, color: '#f472b6' },
  activity:   { Icon: Ticket,    color: '#34d399' },
};

export const LOYALTY_ICONS: Record<LoyaltyProgram['programType'], IconEntry> = {
  airline:     { Icon: AirplaneTilt, color: '#60a5fa' },
  hotel:       { Icon: Buildings,    color: '#a78bfa' },
  car_rental:  { Icon: Car,          color: '#fbbf24' },
  credit_card: { Icon: CreditCard,   color: '#34d399' },
  other:       { Icon: Star,         color: '#a78bfa' },
};

export const PAYWALL_FEATURE_ICONS: Array<{
  Icon: PhosphorIcon;
  color: string;
  label: string;
  description: string;
}> = [
  { Icon: Sparkle,     color: '#a78bfa', label: 'Unlimited AI Trips',  description: 'Generate trips with Gemini AI as often as you like' },
  { Icon: VideoCamera, color: '#f472b6', label: '30-Second Clips',     description: 'Upload up to 30-second travel video clips'          },
  { Icon: UsersThree,  color: '#60a5fa', label: 'Collaborative Trips', description: 'Invite friends to co-edit your itineraries'         },
  { Icon: Bell,        color: '#fbbf24', label: 'Flight Alerts',       description: 'Real-time gate change and delay notifications'      },
  { Icon: Bag,         color: '#34d399', label: 'Travel Wallet',       description: 'Boarding passes, reservations, loyalty programs'    },
  { Icon: Star,        color: '#a78bfa', label: 'Priority Support',    description: 'Fast-track responses from the Supernova team'      },
];

// create tab has no icon (gradient circle + text "+")
export const TAB_ICONS: Record<string, PhosphorIcon> = {
  index:   House,
  explore: Compass,
  search:  MagnifyingGlass,
  profile: User,
};
```

Note: Components that need other Phosphor icons (Heart, MapPin, CalendarBlank, etc.) import them directly from `phosphor-react-native` — `constants/icons.ts` stays scoped to semantic type maps and TAB_ICONS only.

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="icons.test" --watchAll=false
```

Expected: PASS — all 5 describe blocks green

- [ ] **Step 5: Commit**

```bash
git add constants/icons.ts __tests__/constants/icons.test.ts
git commit -m "feat: add central icon registry (constants/icons.ts)"
```

---

### Task 3: Create TypeIconBubble component

**Files:**
- Create: `components/ui/TypeIconBubble.tsx`

- [ ] **Step 1: Create the component**

```tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { BorderRadius } from '@/constants/spacing';
import type { PhosphorIcon } from '@/constants/icons';

interface TypeIconBubbleProps {
  Icon: PhosphorIcon;
  color: string;
  bubbleSize?: number;
  iconSize?: number;
}

export function TypeIconBubble({ Icon, color, bubbleSize = 36, iconSize = 20 }: TypeIconBubbleProps) {
  return (
    <View
      style={[
        styles.bubble,
        {
          width: bubbleSize,
          height: bubbleSize,
          backgroundColor: `${color}26`,
        },
      ]}
    >
      <Icon size={iconSize} color={color} weight="duotone" />
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles with no errors**

```bash
npx tsc --noEmit
```

Expected: No errors. If TypeScript complains about `PhosphorIcon` or `IconProps`, change `Icon`'s type to `React.ComponentType<{ size?: number; color?: string; weight?: string }>` instead.

- [ ] **Step 3: Commit**

```bash
git add components/ui/TypeIconBubble.tsx
git commit -m "feat: add TypeIconBubble shared component"
```

---

### Task 4: Update tab bar icons

**Files:**
- Modify: `app/(tabs)/_layout.tsx`

The `TABS` const currently stores `icon: string` emoji. Replace with Phosphor components from `TAB_ICONS`. The Create tab (index 2) is unaffected — it uses a gradient circle with `+` text, not the `icon` field.

- [ ] **Step 1: Update imports and TABS const**

At the top of `app/(tabs)/_layout.tsx`, add:

```ts
import { TAB_ICONS } from '@/constants/icons';
```

Change `TABS` from:

```ts
const TABS = [
  { name: 'index', icon: '⚡', label: 'Feed' },
  { name: 'explore', icon: '🔭', label: 'Explore' },
  { name: 'create', icon: '+', label: '' },
  { name: 'search', icon: '🔍', label: 'Search' },
  { name: 'profile', icon: '👤', label: 'Profile' },
] as const;
```

To:

```ts
const TABS = [
  { name: 'index',   label: 'Feed'    },
  { name: 'explore', label: 'Explore' },
  { name: 'create',  label: ''        },
  { name: 'search',  label: 'Search'  },
  { name: 'profile', label: 'Profile' },
] as const;
```

- [ ] **Step 2: Update the tab slot render**

Find the non-Create tab render block (around line 131–156). Replace:

```tsx
const tab = TABS[index];
return (
  <TouchableOpacity
    key={route.key}
    style={styles.tabSlot}
    onPress={() => handlePress(route, index)}
    activeOpacity={0.85}
    accessibilityRole="button"
    accessibilityLabel={tab.label}
  >
    <Animated.View style={[styles.tabContent, { transform: [{ scale: scales[index] }] }]}>
      <Text style={[styles.tabIcon, !focused && styles.tabIconInactive]}>{tab.icon}</Text>
      <Animated.Text
        style={[
          styles.tabLabel,
          {
            opacity: labelOpacities[index],
            transform: [{ translateY: labelYs[index] }],
          },
        ]}
      >
        {tab.label}
      </Animated.Text>
    </Animated.View>
  </TouchableOpacity>
);
```

With:

```tsx
const tab = TABS[index];
const TabIcon = TAB_ICONS[route.name];
return (
  <TouchableOpacity
    key={route.key}
    style={styles.tabSlot}
    onPress={() => handlePress(route, index)}
    activeOpacity={0.85}
    accessibilityRole="button"
    accessibilityLabel={tab.label}
  >
    <Animated.View style={[styles.tabContent, { transform: [{ scale: scales[index] }] }]}>
      {TabIcon && (
        <TabIcon
          size={22}
          color={focused ? PURPLE : 'rgba(255,255,255,0.35)'}
          weight="duotone"
        />
      )}
      <Animated.Text
        style={[
          styles.tabLabel,
          {
            opacity: labelOpacities[index],
            transform: [{ translateY: labelYs[index] }],
          },
        ]}
      >
        {tab.label}
      </Animated.Text>
    </Animated.View>
  </TouchableOpacity>
);
```

- [ ] **Step 3: Remove dead styles**

In the `StyleSheet.create` block, delete:

```ts
tabIcon: {
  fontSize: 22,
},
tabIconInactive: {
  opacity: 0.5,
},
```

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

Expected: No errors. Fix any TypeScript complaints before continuing.

- [ ] **Step 5: Verify visually**

```bash
npx expo start --ios
```

Navigate through all 4 non-Create tabs. Confirm: Phosphor icons appear, active tab icon is purple, inactive tabs are at 35% white opacity, spring animation still works.

- [ ] **Step 6: Commit**

```bash
git add app/(tabs)/_layout.tsx
git commit -m "feat: replace emoji tab icons with Phosphor Duotone"
```

---

### Task 5: Update feed action icons

**Files:**
- Modify: `components/feed/FeedActions.tsx`

Current emoji: `❤️` / `🤍` (like), `💬` (comment), `↗️` (share), `🔇` / `🔊` (mute), `📍` (location pin)

- [ ] **Step 1: Add imports**

Add to the import section of `components/feed/FeedActions.tsx`:

```ts
import {
  Heart,
  ChatCircle,
  Export,
  SpeakerSimpleX,
  SpeakerSimpleHigh,
  MapPin,
} from 'phosphor-react-native';
```

- [ ] **Step 2: Replace like button**

Change:

```tsx
<TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
  <Text style={[styles.actionIcon, liked && styles.likedIcon]}>
    {liked ? '❤️' : '🤍'}
  </Text>
  <Text style={styles.actionCount}>{formatCount(localLikes)}</Text>
</TouchableOpacity>
```

To:

```tsx
<TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
  <Heart
    size={28}
    color={liked ? '#f472b6' : 'rgba(255,255,255,0.9)'}
    weight={liked ? 'fill' : 'regular'}
  />
  <Text style={styles.actionCount}>{formatCount(localLikes)}</Text>
</TouchableOpacity>
```

- [ ] **Step 3: Replace comment button**

Change:

```tsx
<TouchableOpacity style={styles.actionBtn} onPress={onCommentPress}>
  <Text style={styles.actionIcon}>💬</Text>
  <Text style={styles.actionCount}>{formatCount(post.commentsCount)}</Text>
</TouchableOpacity>
```

To:

```tsx
<TouchableOpacity style={styles.actionBtn} onPress={onCommentPress}>
  <ChatCircle size={28} color="rgba(255,255,255,0.9)" weight="duotone" />
  <Text style={styles.actionCount}>{formatCount(post.commentsCount)}</Text>
</TouchableOpacity>
```

- [ ] **Step 4: Replace share button**

Change:

```tsx
<TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
  <Text style={styles.actionIcon}>↗️</Text>
  <Text style={styles.actionCount}>Share</Text>
</TouchableOpacity>
```

To:

```tsx
<TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
  <Export size={28} color="rgba(255,255,255,0.9)" weight="regular" />
  <Text style={styles.actionCount}>Share</Text>
</TouchableOpacity>
```

- [ ] **Step 5: Replace mute button**

Change:

```tsx
<TouchableOpacity style={styles.actionBtn} onPress={onToggleMute}>
  <Text style={styles.actionIcon}>{isMuted ? '🔇' : '🔊'}</Text>
</TouchableOpacity>
```

To:

```tsx
<TouchableOpacity style={styles.actionBtn} onPress={onToggleMute}>
  {isMuted
    ? <SpeakerSimpleX size={28} color="rgba(255,255,255,0.9)" weight="regular" />
    : <SpeakerSimpleHigh size={28} color="rgba(255,255,255,0.9)" weight="duotone" />
  }
</TouchableOpacity>
```

- [ ] **Step 6: Replace location pin in caption area**

Change:

```tsx
<View style={styles.placeRow}>
  <Text style={styles.placePin}>📍</Text>
  <Text style={styles.placeName}>{post.placeName}</Text>
</View>
```

To:

```tsx
<View style={styles.placeRow}>
  <MapPin size={14} color="rgba(255,255,255,0.8)" weight="duotone" />
  <Text style={styles.placeName}>{post.placeName}</Text>
</View>
```

- [ ] **Step 7: Remove dead styles**

Delete from `StyleSheet.create`:

```ts
actionIcon: {
  fontSize: 28,
},
likedIcon: {
  fontSize: 28,
},
placePin: {
  fontSize: FontSize.xs,
},
```

- [ ] **Step 8: Run lint and visual check**

```bash
npm run lint
```

Then in the simulator, open the feed, like a post (confirm heart fills pink), tap comment, share, mute. Confirm location pin renders under a post with a place name.

- [ ] **Step 9: Commit**

```bash
git add components/feed/FeedActions.tsx
git commit -m "feat: replace feed action emoji with Phosphor icons"
```

---

### Task 6: Update ActivityItem

**Files:**
- Modify: `components/trip/ActivityItem.tsx`

Remove `TYPE_EMOJI` and `TYPE_ACCENT`. Derive icon and accent color from `ACTIVITY_ICONS`. Replace icon pill with `TypeIconBubble`. Replace ✏️ edit icon with `PencilSimple`.

- [ ] **Step 1: Update imports**

Add to `components/trip/ActivityItem.tsx`:

```ts
import { PencilSimple } from 'phosphor-react-native';
import { ACTIVITY_ICONS } from '@/constants/icons';
import { TypeIconBubble } from '@/components/ui/TypeIconBubble';
```

- [ ] **Step 2: Remove TYPE_EMOJI and TYPE_ACCENT, derive from ACTIVITY_ICONS**

Delete both consts:

```ts
const TYPE_EMOJI: Record<ActivityType, string> = { ... };
const TYPE_ACCENT: Record<ActivityType, string> = { ... };
```

In the component body, change:

```ts
const accentColor = TYPE_ACCENT[activity.type];
const emoji = TYPE_EMOJI[activity.type];
```

To:

```ts
const { Icon, color: accentColor } = ACTIVITY_ICONS[activity.type];
```

- [ ] **Step 3: Replace icon pill JSX**

Change:

```tsx
<View
  style={[
    styles.iconPill,
    { backgroundColor: `${accentColor}26` },
  ]}
>
  <Text style={styles.iconEmoji}>{emoji}</Text>
</View>
```

To:

```tsx
<View style={styles.iconPillWrapper}>
  <TypeIconBubble Icon={Icon} color={accentColor} bubbleSize={36} iconSize={20} />
</View>
```

- [ ] **Step 4: Replace pencil edit icon**

Change:

```tsx
<Text style={[styles.editIcon, { color: colors.text.tertiary }]}>✏️</Text>
```

To:

```tsx
<PencilSimple size={14} color={colors.text.tertiary} weight="regular" />
```

- [ ] **Step 5: Remove dead styles and add wrapper**

Delete from `StyleSheet.create`:

```ts
iconPill: {
  width: 36,
  height: 36,
  borderRadius: BorderRadius.md,
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: Spacing['2'],
},
iconEmoji: {
  fontSize: 18,
},
editIcon: {
  fontSize: 14,
},
```

Add the margin that was on `iconPill`:

```ts
iconPillWrapper: {
  marginRight: Spacing['2'],
},
```

- [ ] **Step 6: Run lint and visual check**

```bash
npm run lint
```

Open a trip in the simulator. Confirm activity items show the correct colored Phosphor icon bubble for each type. Confirm edit pencil appears on edit-enabled items.

- [ ] **Step 7: Commit**

```bash
git add components/trip/ActivityItem.tsx
git commit -m "feat: replace ActivityItem emoji with TypeIconBubble + Phosphor"
```

---

### Task 7: Update ReservationCard

**Files:**
- Modify: `components/wallet/ReservationCard.tsx`

- [ ] **Step 1: Update imports**

Add to `components/wallet/ReservationCard.tsx`:

```ts
import { RESERVATION_ICONS } from '@/constants/icons';
import { TypeIconBubble } from '@/components/ui/TypeIconBubble';
```

- [ ] **Step 2: Remove TYPE_ICONS, derive from RESERVATION_ICONS**

Delete:

```ts
const TYPE_ICONS: Record<ReservationType, string> = {
  hotel: '🏨',
  airbnb: '🏡',
  rental_car: '🚗',
  restaurant: '🍽️',
  activity: '🎯',
};
```

In the component body, add:

```ts
const { Icon, color } = RESERVATION_ICONS[reservation.type];
```

- [ ] **Step 3: Replace icon container JSX**

Change:

```tsx
<View style={[styles.iconContainer, { backgroundColor: colors.background.cardBorder }]}>
  <Text style={styles.icon}>{TYPE_ICONS[reservation.type]}</Text>
</View>
```

To:

```tsx
<TypeIconBubble Icon={Icon} color={color} bubbleSize={44} iconSize={24} />
```

- [ ] **Step 4: Remove dead styles**

Delete from `StyleSheet.create`:

```ts
iconContainer: {
  width: 44,
  height: 44,
  borderRadius: BorderRadius.md,
  alignItems: 'center',
  justifyContent: 'center',
},
icon: {
  fontSize: FontSize.xl,
},
```

- [ ] **Step 5: Run lint and visual check**

```bash
npm run lint
```

Open the wallet reservations list. Confirm each reservation type shows the correct Phosphor icon with accent color bubble.

- [ ] **Step 6: Commit**

```bash
git add components/wallet/ReservationCard.tsx
git commit -m "feat: replace ReservationCard emoji with TypeIconBubble"
```

---

### Task 8: Update LoyaltyCard

**Files:**
- Modify: `components/wallet/LoyaltyCard.tsx`

LoyaltyCard renders the type icon inline (no bubble) — the gradient card is the visual container.

- [ ] **Step 1: Update imports**

Add to `components/wallet/LoyaltyCard.tsx`:

```ts
import { LOYALTY_ICONS } from '@/constants/icons';
```

- [ ] **Step 2: Remove PROGRAM_TYPE_ICONS, derive from LOYALTY_ICONS**

Delete:

```ts
const PROGRAM_TYPE_ICONS: Record<LoyaltyProgram['programType'], string> = {
  airline: '✈️',
  hotel: '🏨',
  car_rental: '🚗',
  credit_card: '💳',
  other: '⭐',
};
```

In the component body, add:

```ts
const { Icon, color } = LOYALTY_ICONS[program.programType];
```

- [ ] **Step 3: Replace icon JSX**

Change:

```tsx
<Text style={styles.typeIcon}>{PROGRAM_TYPE_ICONS[program.programType]}</Text>
```

To:

```tsx
<View style={styles.loyaltyIconWrapper}>
  <Icon size={28} color={color} weight="duotone" />
</View>
```

- [ ] **Step 4: Remove dead styles and add wrapper**

Delete from `StyleSheet.create`:

```ts
typeIcon: {
  fontSize: 28,
  marginRight: Spacing['3'],
},
```

Add:

```ts
loyaltyIconWrapper: {
  marginRight: Spacing['3'],
},
```

- [ ] **Step 5: Run lint and visual check**

```bash
npm run lint
```

Open the wallet loyalty programs list. Confirm each card shows the correct Phosphor icon in its accent color.

- [ ] **Step 6: Commit**

```bash
git add components/wallet/LoyaltyCard.tsx
git commit -m "feat: replace LoyaltyCard emoji with Phosphor icons"
```

---

### Task 9: Update PaywallFeatureList

**Files:**
- Modify: `components/paywall/PaywallFeatureList.tsx`

Replace the local `FEATURES` array (emoji strings) with `PAYWALL_FEATURE_ICONS` from `constants/icons.ts`.

- [ ] **Step 1: Update imports and remove FEATURES**

Replace the top of `components/paywall/PaywallFeatureList.tsx` with:

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { PAYWALL_FEATURE_ICONS } from '@/constants/icons';
```

Delete the entire `FEATURES` const.

- [ ] **Step 2: Update the render**

Change:

```tsx
{FEATURES.map((feature) => (
  <View key={feature.label} style={styles.row}>
    <Text style={styles.icon}>{feature.icon}</Text>
    <View style={styles.textContainer}>
      <Text style={[styles.label, { color: colors.text.primary }]}>
        {feature.label}
      </Text>
      <Text style={[styles.description, { color: colors.text.secondary }]}>
        {feature.description}
      </Text>
    </View>
  </View>
))}
```

To:

```tsx
{PAYWALL_FEATURE_ICONS.map((feature) => (
  <View key={feature.label} style={styles.row}>
    <feature.Icon size={24} color={feature.color} weight="duotone" />
    <View style={styles.textContainer}>
      <Text style={[styles.label, { color: colors.text.primary }]}>
        {feature.label}
      </Text>
      <Text style={[styles.description, { color: colors.text.secondary }]}>
        {feature.description}
      </Text>
    </View>
  </View>
))}
```

- [ ] **Step 3: Remove dead styles**

Delete from `StyleSheet.create`:

```ts
icon: {
  fontSize: FontSize.xl,
},
```

- [ ] **Step 4: Run lint and visual check**

```bash
npm run lint
```

Open the paywall screen. Confirm all 6 feature rows show the correct colored Phosphor icon.

- [ ] **Step 5: Commit**

```bash
git add components/paywall/PaywallFeatureList.tsx
git commit -m "feat: replace paywall feature emoji with Phosphor icons"
```

---

### Task 10: Update create screen

**Files:**
- Modify: `app/(tabs)/create.tsx`

Replace emoji strings in the `CreateOption` type and `options` array with Phosphor icon components.

- [ ] **Step 1: Update imports**

Add to the import section of `app/(tabs)/create.tsx`:

```ts
import { CalendarPlus, Sparkle, Camera, VideoCamera } from 'phosphor-react-native';
import type { PhosphorIcon } from '@/constants/icons';
```

- [ ] **Step 2: Update CreateOption interface**

Change:

```ts
interface CreateOption {
  icon: string;
  title: string;
  description: string;
  tier?: 'pro';
  onPress: () => void;
}
```

To:

```ts
interface CreateOption {
  Icon: PhosphorIcon;
  iconColor: string;
  title: string;
  description: string;
  tier?: 'pro';
  onPress: () => void;
}
```

- [ ] **Step 3: Update options array**

Change:

```ts
const options: CreateOption[] = [
  {
    icon: '🗺️',
    title: 'Manual Trip',
    description: 'Build your own itinerary day by day',
    onPress: () => router.push('/trip/new'),
  },
  {
    icon: '✨',
    title: 'AI Generate Trip',
    description: tier === 'free' ? '1 free trip per week with Gemini AI' : 'Unlimited AI trips with Gemini AI',
    tier: tier === 'free' ? undefined : 'pro',
    onPress: () => router.push('/trip/ai-generate'),
  },
  {
    icon: '📸',
    title: 'Post a Photo',
    description: 'Share a travel moment with your followers',
    onPress: () => {},
  },
  {
    icon: '🎬',
    title: 'Post a Clip',
    description: tier === 'free' ? 'Up to 15 seconds' : 'Up to 30 seconds',
    onPress: () => {},
  },
];
```

To:

```ts
const options: CreateOption[] = [
  {
    Icon: CalendarPlus,
    iconColor: '#60a5fa',
    title: 'Manual Trip',
    description: 'Build your own itinerary day by day',
    onPress: () => router.push('/trip/new'),
  },
  {
    Icon: Sparkle,
    iconColor: '#a78bfa',
    title: 'AI Generate Trip',
    description: tier === 'free' ? '1 free trip per week with Gemini AI' : 'Unlimited AI trips with Gemini AI',
    tier: tier === 'free' ? undefined : 'pro',
    onPress: () => router.push('/trip/ai-generate'),
  },
  {
    Icon: Camera,
    iconColor: '#f472b6',
    title: 'Post a Photo',
    description: 'Share a travel moment with your followers',
    onPress: () => {},
  },
  {
    Icon: VideoCamera,
    iconColor: '#34d399',
    title: 'Post a Clip',
    description: tier === 'free' ? 'Up to 15 seconds' : 'Up to 30 seconds',
    onPress: () => {},
  },
];
```

- [ ] **Step 4: Update the render**

Change:

```tsx
<Text style={styles.optionIcon}>{opt.icon}</Text>
```

To:

```tsx
<opt.Icon size={32} color={opt.iconColor} weight="duotone" />
```

- [ ] **Step 5: Remove dead styles**

Delete from `StyleSheet.create`:

```ts
optionIcon: { fontSize: 32 },
```

- [ ] **Step 6: Run lint and visual check**

```bash
npm run lint
```

Open the Create tab in the simulator. Confirm all 4 option cards show the correct Phosphor icon in their accent color.

- [ ] **Step 7: Commit**

```bash
git add app/(tabs)/create.tsx
git commit -m "feat: replace create screen emoji with Phosphor icons"
```

---

### Task 11: Update trip builder (app/trip/new.tsx)

**Files:**
- Modify: `app/trip/new.tsx`

Emoji locations found in this file:
- `📅` — date picker buttons (Step2Dates) and review card dates row
- `📍` — review card destination row
- `✈️` — review card title row
- `🌐` / `👥` / `🔒` — `visibilityIcon()` function and review card visibility row

- [ ] **Step 1: Add imports**

Add near the top of `app/trip/new.tsx`:

```ts
import {
  CalendarBlank,
  MapPin,
  AirplaneTilt,
  Globe,
  Users,
  LockSimple,
} from 'phosphor-react-native';
import type { PhosphorIcon } from '@/constants/icons';
```

- [ ] **Step 2: Replace visibilityIcon() with a Phosphor icon map**

Delete the `visibilityIcon` function:

```ts
function visibilityIcon(v: TripVisibility): string {
  if (v === 'public') return '🌐';
  if (v === 'followers') return '👥';
  return '🔒';
}
```

Add a map after the `visibilityLabel` function:

```ts
const VISIBILITY_ICONS: Record<TripVisibility, { Icon: PhosphorIcon; color: string }> = {
  public:    { Icon: Globe,      color: '#34d399' },
  followers: { Icon: Users,      color: '#60a5fa' },
  private:   { Icon: LockSimple, color: '#f472b6' },
};
```

- [ ] **Step 3: Update Step3Details visibility selector**

Find in `Step3Details`:

```tsx
<Text style={step.visibilityIcon}>{visibilityIcon(v)}</Text>
```

Replace with:

```tsx
{(() => {
  const { Icon: VIcon, color: vColor } = VISIBILITY_ICONS[v];
  return <VIcon size={18} color={visibility === v ? vColor : DarkColors.text.tertiary} weight={visibility === v ? 'duotone' : 'regular'} />;
})()}
```

Delete `step.visibilityIcon` from the StyleSheet.

- [ ] **Step 4: Update Step2Dates date buttons**

Find (two occurrences — start and end date buttons):

```tsx
<Text style={step.dateIcon}>📅</Text>
```

Replace both with:

```tsx
<CalendarBlank size={20} color={DarkColors.text.tertiary} weight="regular" />
```

Delete `step.dateIcon` from the StyleSheet.

- [ ] **Step 5: Update Step4Review card rows**

Find and replace all four row icons in `Step4Review`:

```tsx
{/* destination row — was: <Text style={review.rowIcon}>📍</Text> */}
<MapPin size={20} color="#34d399" weight="duotone" />

{/* dates row — was: <Text style={review.rowIcon}>📅</Text> */}
<CalendarBlank size={20} color="#60a5fa" weight="duotone" />

{/* title row — was: <Text style={review.rowIcon}>✈️</Text> */}
<AirplaneTilt size={20} color="#a78bfa" weight="duotone" />

{/* visibility row — was: <Text style={review.rowIcon}>{visibilityIcon(visibility)}</Text> */}
{(() => {
  const { Icon: VIcon, color: vColor } = VISIBILITY_ICONS[visibility];
  return <VIcon size={20} color={vColor} weight="duotone" />;
})()}
```

Delete `review.rowIcon` from the StyleSheet.

- [ ] **Step 6: Run lint and visual check**

```bash
npm run lint
```

Open `trip/new` in the simulator (tap "Manual Trip" from the Create tab). Step through all 4 steps:
- Step 2: Confirm calendar icons appear in date buttons
- Step 3: Confirm globe/users/lock icons in visibility selector; active state shows duotone tinted icon
- Step 4: Confirm MapPin, CalendarBlank, AirplaneTilt, and visibility icon in review card rows

- [ ] **Step 7: Commit**

```bash
git add app/trip/new.tsx
git commit -m "feat: replace trip/new.tsx emoji with Phosphor icons"
```

---

### Task 12: Final verification

- [ ] **Step 1: Run full lint and type check**

```bash
npm run lint && npx tsc --noEmit
```

Expected: No errors or warnings.

- [ ] **Step 2: Run tests**

```bash
npm test -- --watchAll=false
```

Expected: All tests pass including the icon registry tests from Task 2.

- [ ] **Step 3: Full app walkthrough in simulator**

```bash
npx expo start --ios
```

Verify each screen:
1. Tab bar — all 4 icon tabs show Phosphor Duotone, active is purple
2. Feed — like/comment/share/mute/location icons render, like toggles fill
3. Trip detail → activity items — blue AirplaneTilt, purple Buildings, pink ForkKnife, teal Ticket, amber Car, gray Clock
4. Wallet → reservations — TypeIconBubble with per-type accent colors
5. Wallet → loyalty programs — inline Phosphor icon with per-type accent colors
6. Paywall — 6 feature rows with colored Phosphor icons
7. Create tab — 4 option cards with Phosphor icons
8. Create → Manual Trip → all 4 steps of the trip builder

Confirm: no emoji visible anywhere in the app.

- [ ] **Step 4: Toggle theme**

In Settings, toggle dark ↔ light. Confirm icons respond correctly to theme colors where applicable (tab bar, feed actions).

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: final verification — Phosphor icon system complete"
```
  hotel:      { Icon: Buildings, color: '#a78bfa' },
  airbnb:     { Icon: House,     color: '#f472b6' },
  rental_car: { Icon: Car,       color: '#fbbf24' },
  restaurant: { Icon: ForkKnife, color: '#f472b6' },
  activity:   { Icon: Ticket,    color: '#34d399' },
};

export const LOYALTY_ICONS: Record<LoyaltyProgram['programType'], IconEntry> = {
  airline:     { Icon: AirplaneTilt, color: '#60a5fa' },
  hotel:       { Icon: Buildings,    color: '#a78bfa' },
  car_rental:  { Icon: Car,          color: '#fbbf24' },
  credit_card: { Icon: CreditCard,   color: '#34d399' },
  other:       { Icon: Star,         color: '#a78bfa' },
};

export const PAYWALL_FEATURE_ICONS: Array<{
  Icon: PhosphorIcon;
  color: string;
  label: string;
  description: string;
}> = [
  { Icon: Sparkle,     color: '#a78bfa', label: 'Unlimited AI Trips',  description: 'Generate trips with Gemini AI as often as you like' },
  { Icon: VideoCamera, color: '#f472b6', label: '30-Second Clips',     description: 'Upload up to 30-second travel video clips'          },
  { Icon: UsersThree,  color: '#60a5fa', label: 'Collaborative Trips', description: 'Invite friends to co-edit your itineraries'         },
  { Icon: Bell,        color: '#fbbf24', label: 'Flight Alerts',       description: 'Real-time gate change and delay notifications'      },
  { Icon: Bag,         color: '#34d399', label: 'Travel Wallet',       description: 'Boarding passes, reservations, loyalty programs'    },
  { Icon: Star,        color: '#a78bfa', label: 'Priority Support',    description: 'Fast-track responses from the Supernova team'      },
];

// create tab has no icon (gradient circle + text "+")
export const TAB_ICONS: Record<string, PhosphorIcon> = {
  index:   House,
  explore: Compass,
  search:  MagnifyingGlass,
  profile: User,
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="icons.test" --watchAll=false
```

Expected: PASS — all 5 describe blocks green

- [ ] **Step 5: Commit**

```bash
git add constants/icons.ts __tests__/constants/icons.test.ts
git commit -m "feat: add central icon registry (constants/icons.ts)"
```

---

### Task 3: Create TypeIconBubble component

**Files:**
- Create: `components/ui/TypeIconBubble.tsx`

- [ ] **Step 1: Create the component**

```tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { BorderRadius } from '@/constants/spacing';
import type { PhosphorIcon } from '@/constants/icons';

interface TypeIconBubbleProps {
  Icon: PhosphorIcon;
  color: string;
  bubbleSize?: number;
  iconSize?: number;
}

export function TypeIconBubble({ Icon, color, bubbleSize = 36, iconSize = 20 }: TypeIconBubbleProps) {
  return (
    <View
      style={[
        styles.bubble,
        {
          width: bubbleSize,
          height: bubbleSize,
          backgroundColor: `${color}26`,
        },
      ]}
    >
      <Icon size={iconSize} color={color} weight="duotone" />
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles with no errors**

```bash
npx tsc --noEmit
```

Expected: No errors. If TypeScript complains about `PhosphorIcon` or `IconProps`, the fix is to type `Icon` as `React.ComponentType<{ size?: number; color?: string; weight?: string }>` instead.

- [ ] **Step 3: Commit**

```bash
git add components/ui/TypeIconBubble.tsx
git commit -m "feat: add TypeIconBubble shared component"
```

---

### Task 4: Update tab bar icons

**Files:**
- Modify: `app/(tabs)/_layout.tsx`

The `TABS` const currently stores `icon: string` emoji. Replace with Phosphor components from `TAB_ICONS`. The Create tab (index 2) is unaffected — it uses a gradient circle with `+` text, not the `icon` field.

- [ ] **Step 1: Update imports and TABS const**

At the top of `app/(tabs)/_layout.tsx`, add:

```ts
import { TAB_ICONS } from '@/constants/icons';
```

Change `TABS` from:

```ts
const TABS = [
  { name: 'index', icon: '⚡', label: 'Feed' },
  { name: 'explore', icon: '🔭', label: 'Explore' },
  { name: 'create', icon: '+', label: '' },
  { name: 'search', icon: '🔍', label: 'Search' },
  { name: 'profile', icon: '👤', label: 'Profile' },
] as const;
```

To:

```ts
const TABS = [
  { name: 'index',   label: 'Feed'    },
  { name: 'explore', label: 'Explore' },
  { name: 'create',  label: ''        },
  { name: 'search',  label: 'Search'  },
  { name: 'profile', label: 'Profile' },
] as const;
```

- [ ] **Step 2: Update the tab slot render**

Find the non-Create tab render block (around line 131–156). Replace:

```tsx
const tab = TABS[index];
return (
  <TouchableOpacity
    key={route.key}
    style={styles.tabSlot}
    onPress={() => handlePress(route, index)}
    activeOpacity={0.85}
    accessibilityRole="button"
    accessibilityLabel={tab.label}
  >
    <Animated.View style={[styles.tabContent, { transform: [{ scale: scales[index] }] }]}>
      <Text style={[styles.tabIcon, !focused && styles.tabIconInactive]}>{tab.icon}</Text>
      <Animated.Text
        style={[
          styles.tabLabel,
          {
            opacity: labelOpacities[index],
            transform: [{ translateY: labelYs[index] }],
          },
        ]}
      >
        {tab.label}
      </Animated.Text>
    </Animated.View>
  </TouchableOpacity>
);
```

With:

```tsx
const tab = TABS[index];
const TabIcon = TAB_ICONS[route.name];
return (
  <TouchableOpacity
    key={route.key}
    style={styles.tabSlot}
    onPress={() => handlePress(route, index)}
    activeOpacity={0.85}
    accessibilityRole="button"
    accessibilityLabel={tab.label}
  >
    <Animated.View style={[styles.tabContent, { transform: [{ scale: scales[index] }] }]}>
      {TabIcon && (
        <TabIcon
          size={22}
          color={focused ? PURPLE : 'rgba(255,255,255,0.35)'}
          weight="duotone"
        />
      )}
      <Animated.Text
        style={[
          styles.tabLabel,
          {
            opacity: labelOpacities[index],
            transform: [{ translateY: labelYs[index] }],
          },
        ]}
      >
        {tab.label}
      </Animated.Text>
    </Animated.View>
  </TouchableOpacity>
);
```

- [ ] **Step 3: Remove dead styles**

In the `StyleSheet.create` block, delete:

```ts
tabIcon: {
  fontSize: 22,
},
tabIconInactive: {
  opacity: 0.5,
},
```

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

Expected: No errors. Fix any TypeScript complaints before continuing.

- [ ] **Step 5: Verify visually**

```bash
npx expo start --ios
```

Navigate through all 4 non-Create tabs. Confirm: Phosphor icons appear, active tab icon is purple, inactive tabs are at 35% white opacity, spring animation still works.

- [ ] **Step 6: Commit**

```bash
git add app/(tabs)/_layout.tsx
git commit -m "feat: replace emoji tab icons with Phosphor Duotone"
```

---

### Task 5: Update feed action icons

**Files:**
- Modify: `components/feed/FeedActions.tsx`

Current emoji: `❤️` / `🤍` (like), `💬` (comment), `↗️` (share), `🔇` / `🔊` (mute), `📍` (location pin)

- [ ] **Step 1: Add imports**

Add to the import section of `components/feed/FeedActions.tsx`:

```ts
import {
  Heart,
  ChatCircle,
  Export,
  SpeakerSimpleX,
  SpeakerSimpleHigh,
  MapPin,
} from 'phosphor-react-native';
```

- [ ] **Step 2: Replace like button**

Change:

```tsx
<TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
  <Text style={[styles.actionIcon, liked && styles.likedIcon]}>
    {liked ? '❤️' : '🤍'}
  </Text>
  <Text style={styles.actionCount}>{formatCount(localLikes)}</Text>
</TouchableOpacity>
```

To:

```tsx
<TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
  <Heart
    size={28}
    color={liked ? '#f472b6' : 'rgba(255,255,255,0.9)'}
    weight={liked ? 'fill' : 'regular'}
  />
  <Text style={styles.actionCount}>{formatCount(localLikes)}</Text>
</TouchableOpacity>
```

- [ ] **Step 3: Replace comment button**

Change:

```tsx
<TouchableOpacity style={styles.actionBtn} onPress={onCommentPress}>
  <Text style={styles.actionIcon}>💬</Text>
  <Text style={styles.actionCount}>{formatCount(post.commentsCount)}</Text>
</TouchableOpacity>
```

To:

```tsx
<TouchableOpacity style={styles.actionBtn} onPress={onCommentPress}>
  <ChatCircle size={28} color="rgba(255,255,255,0.9)" weight="duotone" />
  <Text style={styles.actionCount}>{formatCount(post.commentsCount)}</Text>
</TouchableOpacity>
```

- [ ] **Step 4: Replace share button**

Change:

```tsx
<TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
  <Text style={styles.actionIcon}>↗️</Text>
  <Text style={styles.actionCount}>Share</Text>
</TouchableOpacity>
```

To:

```tsx
<TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
  <Export size={28} color="rgba(255,255,255,0.9)" weight="regular" />
  <Text style={styles.actionCount}>Share</Text>
</TouchableOpacity>
```

- [ ] **Step 5: Replace mute button**

Change:

```tsx
<TouchableOpacity style={styles.actionBtn} onPress={onToggleMute}>
  <Text style={styles.actionIcon}>{isMuted ? '🔇' : '🔊'}</Text>
</TouchableOpacity>
```

To:

```tsx
<TouchableOpacity style={styles.actionBtn} onPress={onToggleMute}>
  {isMuted
    ? <SpeakerSimpleX size={28} color="rgba(255,255,255,0.9)" weight="regular" />
    : <SpeakerSimpleHigh size={28} color="rgba(255,255,255,0.9)" weight="duotone" />
  }
</TouchableOpacity>
```

- [ ] **Step 6: Replace location pin in caption area**

Change:

```tsx
<View style={styles.placeRow}>
  <Text style={styles.placePin}>📍</Text>
  <Text style={styles.placeName}>{post.placeName}</Text>
</View>
```

To:

```tsx
<View style={styles.placeRow}>
  <MapPin size={14} color="rgba(255,255,255,0.8)" weight="duotone" />
  <Text style={styles.placeName}>{post.placeName}</Text>
</View>
```

- [ ] **Step 7: Remove dead styles**

Delete from `StyleSheet.create`:

```ts
actionIcon: {
  fontSize: 28,
},
likedIcon: {
  fontSize: 28,
},
placePin: {
  fontSize: FontSize.xs,
},
```

- [ ] **Step 8: Run lint and visual check**

```bash
npm run lint
```

Then in the simulator, open the feed, like a post (confirm heart fills pink), tap comment, share, mute. Confirm location pin renders under a post with a place name.

- [ ] **Step 9: Commit**

```bash
git add components/feed/FeedActions.tsx
git commit -m "feat: replace feed action emoji with Phosphor icons"
```

---

### Task 6: Update ActivityItem

**Files:**
- Modify: `components/trip/ActivityItem.tsx`

Remove `TYPE_EMOJI`. Replace icon pill with `TypeIconBubble`. Derive accent color from `ACTIVITY_ICONS` (same hex values as `TYPE_ACCENT` — the `TYPE_ACCENT` const can then be removed). Replace ✏️ edit icon with `PencilSimple`.

- [ ] **Step 1: Update imports**

Replace at top of `components/trip/ActivityItem.tsx`:

```ts
import { ACTIVITY_ICONS, TypeIconBubble } from ...
```

Add:

```ts
import { PencilSimple } from 'phosphor-react-native';
import { ACTIVITY_ICONS } from '@/constants/icons';
import { TypeIconBubble } from '@/components/ui/TypeIconBubble';
```

- [ ] **Step 2: Remove TYPE_EMOJI and TYPE_ACCENT, derive from ACTIVITY_ICONS**

Delete:

```ts
const TYPE_EMOJI: Record<ActivityType, string> = {
  flight: '✈️',
  hotel: '🏨',
  restaurant: '🍽️',
  activity: '🎯',
  transport: '🚌',
  free: '⬜',
};

const TYPE_ACCENT: Record<ActivityType, string> = {
  flight: '#60a5fa',
  hotel: '#a78bfa',
  restaurant: '#f472b6',
  activity: '#34d399',
  transport: '#fbbf24',
  free: '#6b7280',
};
```

In the component body, change:

```ts
const accentColor = TYPE_ACCENT[activity.type];
const emoji = TYPE_EMOJI[activity.type];
```

To:

```ts
const { Icon, color: accentColor } = ACTIVITY_ICONS[activity.type];
```

- [ ] **Step 3: Replace icon pill JSX**

Change:

```tsx
<View
  style={[
    styles.iconPill,
    { backgroundColor: `${accentColor}26` },
  ]}
>
  <Text style={styles.iconEmoji}>{emoji}</Text>
</View>
```

To:

```tsx
<TypeIconBubble Icon={Icon} color={accentColor} bubbleSize={36} iconSize={20} />
```

- [ ] **Step 4: Replace pencil edit icon**

Change:

```tsx
<Text style={[styles.editIcon, { color: colors.text.tertiary }]}>✏️</Text>
```

To:

```tsx
<PencilSimple size={14} color={colors.text.tertiary} weight="regular" />
```

- [ ] **Step 5: Remove dead styles**

Delete from `StyleSheet.create`:

```ts
iconEmoji: {
  fontSize: 18,
},
editIcon: {
  fontSize: 14,
},
```

Also remove `iconPill` if it's now fully handled by `TypeIconBubble`. Check: `iconPill` was `{ width: 36, height: 36, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', marginRight: Spacing['2'] }`. The `marginRight` needs to be preserved. Either add it as a wrapper style or keep a thin `iconPillWrapper` style:

```ts
iconPillWrapper: {
  marginRight: Spacing['2'],
},
```

And wrap:

```tsx
<View style={styles.iconPillWrapper}>
  <TypeIconBubble Icon={Icon} color={accentColor} bubbleSize={36} iconSize={20} />
</View>
```

- [ ] **Step 6: Run lint and visual check**

```bash
npm run lint
```

Open a trip in the simulator. Confirm activity items show the correct colored Phosphor icon bubble for each type (blue plane for flight, purple building for hotel, pink fork for restaurant, teal ticket for activity, amber car for transport). Confirm edit pencil appears on edit-enabled items.

- [ ] **Step 7: Commit**

```bash
git add components/trip/ActivityItem.tsx
git commit -m "feat: replace ActivityItem emoji with TypeIconBubble + Phosphor"
```

---

### Task 7: Update ReservationCard

**Files:**
- Modify: `components/wallet/ReservationCard.tsx`

- [ ] **Step 1: Update imports**

Add to `components/wallet/ReservationCard.tsx`:

```ts
import { RESERVATION_ICONS } from '@/constants/icons';
import { TypeIconBubble } from '@/components/ui/TypeIconBubble';
```

- [ ] **Step 2: Remove TYPE_ICONS, derive from RESERVATION_ICONS**

Delete:

```ts
const TYPE_ICONS: Record<ReservationType, string> = {
  hotel: '🏨',
  airbnb: '🏡',
  rental_car: '🚗',
  restaurant: '🍽️',
  activity: '🎯',
};
```

In the component body, add:

```ts
const { Icon, color } = RESERVATION_ICONS[reservation.type];
```

- [ ] **Step 3: Replace icon container JSX**

Change:

```tsx
<View style={[styles.iconContainer, { backgroundColor: colors.background.cardBorder }]}>
  <Text style={styles.icon}>{TYPE_ICONS[reservation.type]}</Text>
</View>
```

To:

```tsx
<TypeIconBubble Icon={Icon} color={color} bubbleSize={44} iconSize={24} />
```

- [ ] **Step 4: Remove dead styles**

Delete from `StyleSheet.create`:

```ts
iconContainer: {
  width: 44,
  height: 44,
  borderRadius: BorderRadius.md,
  alignItems: 'center',
  justifyContent: 'center',
},
icon: {
  fontSize: FontSize.xl,
},
```

- [ ] **Step 5: Run lint and visual check**

```bash
npm run lint
```

Open the wallet reservations list. Confirm each reservation type shows the correct Phosphor icon with accent color bubble.

- [ ] **Step 6: Commit**

```bash
git add components/wallet/ReservationCard.tsx
git commit -m "feat: replace ReservationCard emoji with TypeIconBubble"
```

---

### Task 8: Update LoyaltyCard

**Files:**
- Modify: `components/wallet/LoyaltyCard.tsx`

LoyaltyCard renders the type icon inline (no bubble) — the gradient card is the visual container.

- [ ] **Step 1: Update imports**

Add to `components/wallet/LoyaltyCard.tsx`:

```ts
import { LOYALTY_ICONS } from '@/constants/icons';
```

- [ ] **Step 2: Remove PROGRAM_TYPE_ICONS, derive from LOYALTY_ICONS**

Delete:

```ts
const PROGRAM_TYPE_ICONS: Record<LoyaltyProgram['programType'], string> = {
  airline: '✈️',
  hotel: '🏨',
  car_rental: '🚗',
  credit_card: '💳',
  other: '⭐',
};
```

In the component body, add:

```ts
const { Icon, color } = LOYALTY_ICONS[program.programType];
```

- [ ] **Step 3: Replace icon JSX**

Change:

```tsx
<Text style={styles.typeIcon}>{PROGRAM_TYPE_ICONS[program.programType]}</Text>
```

To:

```tsx
<Icon size={28} color={color} weight="duotone" />
```

- [ ] **Step 4: Remove dead styles**

Delete from `StyleSheet.create`:

```ts
typeIcon: {
  fontSize: 28,
  marginRight: Spacing['3'],
},
```

Add the margin directly on the icon's wrapper. Since `LoyaltyCard` uses `styles.left` (`flexDirection: 'row', alignItems: 'center'`), the icon needs `marginRight`. Wrap the icon:

```tsx
<View style={styles.loyaltyIconWrapper}>
  <Icon size={28} color={color} weight="duotone" />
</View>
```

And in styles:

```ts
loyaltyIconWrapper: {
  marginRight: Spacing['3'],
},
```

- [ ] **Step 5: Run lint and visual check**

```bash
npm run lint
```

Open the wallet loyalty programs list. Confirm each card shows the correct Phosphor icon in its accent color.

- [ ] **Step 6: Commit**

```bash
git add components/wallet/LoyaltyCard.tsx
git commit -m "feat: replace LoyaltyCard emoji with Phosphor icons"
```

---

### Task 9: Update PaywallFeatureList

**Files:**
- Modify: `components/paywall/PaywallFeatureList.tsx`

Replace the local `FEATURES` array (emoji strings) with `PAYWALL_FEATURE_ICONS` from `constants/icons.ts`.

- [ ] **Step 1: Update imports and remove FEATURES**

Replace the top of `components/paywall/PaywallFeatureList.tsx` with:

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { PAYWALL_FEATURE_ICONS } from '@/constants/icons';
```

Delete the entire `FEATURES` const.

- [ ] **Step 2: Update the render**

Change:

```tsx
{FEATURES.map((feature) => (
  <View key={feature.label} style={styles.row}>
    <Text style={styles.icon}>{feature.icon}</Text>
    <View style={styles.textContainer}>
      <Text style={[styles.label, { color: colors.text.primary }]}>
        {feature.label}
      </Text>
      <Text style={[styles.description, { color: colors.text.secondary }]}>
        {feature.description}
      </Text>
    </View>
  </View>
))}
```

To:

```tsx
{PAYWALL_FEATURE_ICONS.map((feature) => (
  <View key={feature.label} style={styles.row}>
    <feature.Icon size={24} color={feature.color} weight="duotone" />
    <View style={styles.textContainer}>
      <Text style={[styles.label, { color: colors.text.primary }]}>
        {feature.label}
      </Text>
      <Text style={[styles.description, { color: colors.text.secondary }]}>
        {feature.description}
      </Text>
    </View>
  </View>
))}
```

- [ ] **Step 3: Remove dead styles**

Delete from `StyleSheet.create`:

```ts
icon: {
  fontSize: FontSize.xl,
},
```

- [ ] **Step 4: Run lint and visual check**

```bash
npm run lint
```

Open the paywall screen. Confirm all 6 feature rows show the correct colored Phosphor icon.

- [ ] **Step 5: Commit**

```bash
git add components/paywall/PaywallFeatureList.tsx
git commit -m "feat: replace paywall feature emoji with Phosphor icons"
```

---

### Task 10: Update create screen

**Files:**
- Modify: `app/(tabs)/create.tsx`

Replace emoji strings in the `CreateOption` type and `options` array with Phosphor icon components.

- [ ] **Step 1: Update imports**

Add to the import section of `app/(tabs)/create.tsx`:

```ts
import { CalendarPlus, Sparkle, Camera, VideoCamera } from 'phosphor-react-native';
import type { PhosphorIcon } from '@/constants/icons';
```

- [ ] **Step 2: Update CreateOption interface**

Change:

```ts
interface CreateOption {
  icon: string;
  title: string;
  description: string;
  tier?: 'pro';
  onPress: () => void;
}
```

To:

```ts
interface CreateOption {
  Icon: PhosphorIcon;
  iconColor: string;
  title: string;
  description: string;
  tier?: 'pro';
  onPress: () => void;
}
```

- [ ] **Step 3: Update options array**

Change:

```ts
const options: CreateOption[] = [
  {
    icon: '🗺️',
    title: 'Manual Trip',
    description: 'Build your own itinerary day by day',
    onPress: () => router.push('/trip/new'),
  },
  {
    icon: '✨',
    title: 'AI Generate Trip',
    description: tier === 'free' ? '1 free trip per week with Gemini AI' : 'Unlimited AI trips with Gemini AI',
    tier: tier === 'free' ? undefined : 'pro',
    onPress: () => router.push('/trip/ai-generate'),
  },
  {
    icon: '📸',
    title: 'Post a Photo',
    description: 'Share a travel moment with your followers',
    onPress: () => {},
  },
  {
    icon: '🎬',
    title: 'Post a Clip',
    description: tier === 'free' ? 'Up to 15 seconds' : 'Up to 30 seconds',
    onPress: () => {},
  },
];
```

To:

```ts
const options: CreateOption[] = [
  {
    Icon: CalendarPlus,
    iconColor: '#60a5fa',
    title: 'Manual Trip',
    description: 'Build your own itinerary day by day',
    onPress: () => router.push('/trip/new'),
  },
  {
    Icon: Sparkle,
    iconColor: '#a78bfa',
    title: 'AI Generate Trip',
    description: tier === 'free' ? '1 free trip per week with Gemini AI' : 'Unlimited AI trips with Gemini AI',
    tier: tier === 'free' ? undefined : 'pro',
    onPress: () => router.push('/trip/ai-generate'),
  },
  {
    Icon: Camera,
    iconColor: '#f472b6',
    title: 'Post a Photo',
    description: 'Share a travel moment with your followers',
    onPress: () => {},
  },
  {
    Icon: VideoCamera,
    iconColor: '#34d399',
    title: 'Post a Clip',
    description: tier === 'free' ? 'Up to 15 seconds' : 'Up to 30 seconds',
    onPress: () => {},
  },
];
```

- [ ] **Step 4: Update the render**

Change:

```tsx
<Text style={styles.optionIcon}>{opt.icon}</Text>
```

To:

```tsx
<opt.Icon size={32} color={opt.iconColor} weight="duotone" />
```

- [ ] **Step 5: Remove dead styles**

Delete from `StyleSheet.create`:

```ts
optionIcon: { fontSize: 32 },
```

- [ ] **Step 6: Run lint and visual check**

```bash
npm run lint
```

Open the Create tab in the simulator. Confirm all 4 option cards show the correct Phosphor icon in their accent color.

- [ ] **Step 7: Commit**

```bash
git add app/(tabs)/create.tsx
git commit -m "feat: replace create screen emoji with Phosphor icons"
```

---

### Task 11: Update trip builder (app/trip/new.tsx)

**Files:**
- Modify: `app/trip/new.tsx`

Emoji locations found in this file:
- `📅` — date picker buttons (Step2Dates, lines ~283 and ~292) and review card dates row
- `📍` — review card destination row
- `✈️` — review card title row
- `🌐` / `👥` / `🔒` — `visibilityIcon()` function and review card visibility row

- [ ] **Step 1: Add imports**

Add near the top of `app/trip/new.tsx`:

```ts
import {
  CalendarBlank,
  MapPin,
  AirplaneTilt,
  Globe,
  Users,
  LockSimple,
} from 'phosphor-react-native';
import type { PhosphorIcon } from '@/constants/icons';
import type { TripVisibility } from '@/types';
```

- [ ] **Step 2: Replace visibilityIcon() with a Phosphor icon map**

Delete the `visibilityIcon` function:

```ts
function visibilityIcon(v: TripVisibility): string {
  if (v === 'public') return '🌐';
  if (v === 'followers') return '👥';
  return '🔒';
}
```

Add a map after the `visibilityLabel` function:

```ts
const VISIBILITY_ICONS: Record<TripVisibility, { Icon: PhosphorIcon; color: string }> = {
  public:    { Icon: Globe,       color: '#34d399' },
  followers: { Icon: Users,       color: '#60a5fa' },
  private:   { Icon: LockSimple,  color: '#f472b6' },
};
```

- [ ] **Step 3: Update Step3Details visibility selector**

Find in `Step3Details` (around line 390):

```tsx
<Text style={step.visibilityIcon}>{visibilityIcon(v)}</Text>
```

Replace with:

```tsx
{(() => {
  const { Icon: VIcon, color: vColor } = VISIBILITY_ICONS[v];
  return <VIcon size={18} color={visibility === v ? vColor : DarkColors.text.tertiary} weight={visibility === v ? 'duotone' : 'regular'} />;
})()}
```

Also delete `step.visibilityIcon` from the StyleSheet (it was `fontSize: ...`). Check the styles for `visibilityIcon` and remove it.

- [ ] **Step 4: Update Step2Dates date buttons**

Find (two occurrences, one for start date, one for end date):

```tsx
<Text style={step.dateIcon}>📅</Text>
```

Replace both with:

```tsx
<CalendarBlank size={20} color={DarkColors.text.tertiary} weight="regular" />
```

Delete `step.dateIcon` from the StyleSheet.

- [ ] **Step 5: Update Step4Review card rows**

Find:

```tsx
<Text style={review.rowIcon}>📍</Text>
```

Replace with:

```tsx
<MapPin size={20} color="#34d399" weight="duotone" />
```

Find:

```tsx
<Text style={review.rowIcon}>📅</Text>
```

Replace with:

```tsx
<CalendarBlank size={20} color="#60a5fa" weight="duotone" />
```

Find:

```tsx
<Text style={review.rowIcon}>✈️</Text>
```

Replace with:

```tsx
<AirplaneTilt size={20} color="#a78bfa" weight="duotone" />
```

Find (the visibility row):

```tsx
<Text style={review.rowIcon}>{visibilityIcon(visibility)}</Text>
```

Replace with:

```tsx
{(() => {
  const { Icon: VIcon, color: vColor } = VISIBILITY_ICONS[visibility];
  return <VIcon size={20} color={vColor} weight="duotone" />;
})()}
```

Delete `review.rowIcon` from the StyleSheet (it was `fontSize: ...`). Verify the row layout still aligns — `review.row` is `flexDirection: 'row', alignItems: 'center'`, so the icon will align correctly without needing a fontSize.

- [ ] **Step 6: Run lint and visual check**

```bash
npm run lint
```

Open `trip/new` in the simulator (tap "Manual Trip" from the Create tab). Step through all 4 steps:
- Step 2: Confirm calendar icons in date buttons
- Step 3: Confirm globe/users/lock icons in visibility selector, active state shows duotone tinted icon
- Step 4: Confirm MapPin, CalendarBlank, AirplaneTilt, and visibility icon in review card rows

- [ ] **Step 7: Commit**

```bash
git add app/trip/new.tsx
git commit -m "feat: replace trip/new.tsx emoji with Phosphor icons"
```

---

### Task 12: Final verification

- [ ] **Step 1: Run full lint and type check**

```bash
npm run lint && npx tsc --noEmit
```

Expected: No errors or warnings.

- [ ] **Step 2: Run tests**

```bash
npm test -- --watchAll=false
```

Expected: All tests pass including the icon registry tests from Task 2.

- [ ] **Step 3: Full app walkthrough in simulator**

```bash
npx expo start --ios
```

Verify each screen:
1. Tab bar — all 4 icon tabs show Phosphor Duotone, active is purple
2. Feed — like/comment/share/mute/location icons render, like toggles fill
3. Trip detail → activity items — blue AirplaneTilt, purple Buildings, pink ForkKnife, teal Ticket, amber Car, gray Clock
4. Wallet → reservations — TypeIconBubble with per-type accent colors
5. Wallet → loyalty programs — inline Phosphor icon with per-type accent colors
6. Paywall — 6 feature rows with colored Phosphor icons
7. Create tab — 4 option cards with Phosphor icons
8. Create → Manual Trip → all 4 steps of the trip builder

Confirm: no emoji visible anywhere in the app.

- [ ] **Step 4: Toggle theme**

In Settings, toggle dark ↔ light. Confirm icons respond correctly to theme colors where applicable (tab bar, feed actions).

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: final verification — Phosphor icon system complete"
```
