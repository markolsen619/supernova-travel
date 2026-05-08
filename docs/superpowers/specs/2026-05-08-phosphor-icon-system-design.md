# Icon System Redesign — Phosphor Duotone

**Date:** 2026-05-08
**Status:** Approved

## Context

The app currently uses emoji rendered as `<Text>` elements for every icon — tab bar, feed actions, activity types, reservations, loyalty programs, paywall features, and create options. Emoji render inconsistently across OS versions, cannot be tinted with brand colors, and give the app a draft-quality appearance. This redesign replaces all emoji with `phosphor-react-native` Duotone icons and introduces a shared `TypeIconBubble` component to eliminate the repeated icon-in-bubble pattern across three wallet/itinerary components.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Icon library | `phosphor-react-native` | Duotone weight pairs with purple brand palette; expressive depth |
| Emoji replacement scope | All emoji everywhere | No emoji anywhere in the app |
| Semantic type coloring | Per-type accent colors | Color-coding aids scannability of itinerary and wallet lists |
| Abstraction | One `TypeIconBubble` + flat Phosphor elsewhere | Bubble pattern genuinely repeats in 3 components; no premature abstraction |

## Installation

```bash
npx expo install phosphor-react-native
```

`react-native-svg` is already at `15.12.1` — no additional peer dep needed.

## New Files

### `constants/icons.ts`

Central map of semantic type → `{ Icon: PhosphorComponent, color: string }` for all type-coded icon sets. Import from here in `ActivityItem`, `ReservationCard`, `LoyaltyCard`, `PaywallFeatureList`, `create.tsx`.

```ts
import {
  AirplaneTilt, Buildings, ForkKnife, Ticket, Car, Clock,
  House, Sparkle, Camera, VideoCamera, UsersThree,
  Bell, Bag, CalendarPlus, Star, CreditCard,
} from 'phosphor-react-native';
import type { Icon as PhosphorIcon } from 'phosphor-react-native';

type IconEntry = { Icon: typeof PhosphorIcon; color: string };

export const ACTIVITY_ICONS: Record<ActivityType, IconEntry> = {
  flight:     { Icon: AirplaneTilt, color: '#60a5fa' },
  hotel:      { Icon: Buildings,    color: '#a78bfa' },
  restaurant: { Icon: ForkKnife,    color: '#f472b6' },
  activity:   { Icon: Ticket,       color: '#34d399' },
  transport:  { Icon: Car,          color: '#fbbf24' },
  free:       { Icon: Clock,        color: '#6b7280' },
};

export const RESERVATION_ICONS = {
  hotel:      { Icon: Buildings, color: '#a78bfa' },
  airbnb:     { Icon: House,     color: '#f472b6' },
  rental_car: { Icon: Car,       color: '#fbbf24' },
  restaurant: { Icon: ForkKnife, color: '#f472b6' },
  activity:   { Icon: Ticket,    color: '#34d399' },
};

export const LOYALTY_ICONS = {
  airline:     { Icon: AirplaneTilt, color: '#60a5fa' },
  hotel:       { Icon: Buildings,    color: '#a78bfa' },
  car_rental:  { Icon: Car,          color: '#fbbf24' },
  credit_card: { Icon: CreditCard,   color: '#34d399' },
  other:       { Icon: Star,         color: '#a78bfa' },
};

// label/description stay co-located with the icon entry so PaywallFeatureList
// can iterate a single array instead of merging two structures
export const PAYWALL_FEATURE_ICONS = [
  { Icon: Sparkle,     color: '#a78bfa', label: 'Unlimited AI Trips',  description: 'Generate trips with Gemini AI as often as you like' },
  { Icon: VideoCamera, color: '#f472b6', label: '30-Second Clips',     description: 'Upload up to 30-second travel video clips'          },
  { Icon: UsersThree,  color: '#60a5fa', label: 'Collaborative Trips', description: 'Invite friends to co-edit your itineraries'         },
  { Icon: Bell,        color: '#fbbf24', label: 'Flight Alerts',       description: 'Real-time gate change and delay notifications'      },
  { Icon: Bag,         color: '#34d399', label: 'Travel Wallet',       description: 'Boarding passes, reservations, loyalty programs'    },
  { Icon: Star,        color: '#a78bfa', label: 'Priority Support',    description: 'Fast-track responses from the Supernova team'       },
];

export const CREATE_OPTION_ICONS = {
  manual:  { Icon: CalendarPlus, color: '#60a5fa' },
  ai:      { Icon: Sparkle,      color: '#a78bfa' },
  photo:   { Icon: Camera,       color: '#f472b6' },
  clip:    { Icon: VideoCamera,  color: '#34d399' },
};
```

### `components/ui/TypeIconBubble.tsx`

Shared bubble component used by `ActivityItem`, `ReservationCard`, `LoyaltyCard`.

```tsx
interface TypeIconBubbleProps {
  Icon: React.ComponentType<{ size?: number; color?: string; weight?: string }>
  color: string
  bubbleSize?: number   // default 36
  iconSize?: number     // default 20
}

export function TypeIconBubble({ Icon, color, bubbleSize = 36, iconSize = 20 }: TypeIconBubbleProps) {
  return (
    <View style={[styles.bubble, {
      width: bubbleSize,
      height: bubbleSize,
      backgroundColor: `${color}26`,
    }]}>
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

## Files Modified

### `app/(tabs)/_layout.tsx`

Replace `TABS` emoji string icons with Phosphor components. The `TABS` const currently stores `icon: string`; change to `icon: React.ComponentType<PhosphorIconProps>`. Render inline in the tab slot with `size={22}`, `weight="duotone"`, `color={focused ? PURPLE : 'rgba(255,255,255,0.35)'}`.

| Tab | Was | Icon |
|---|---|---|
| Feed | ⚡ | `House` |
| Explore | 🔭 | `Compass` |
| Create | `+` | unchanged (gradient circle, text `+`) |
| Search | 🔍 | `MagnifyingGlass` |
| Profile | 👤 | `User` |

Remove `styles.tabIcon` and `styles.tabIconInactive` (emoji size/opacity). Replace with direct icon color prop.

### `components/feed/FeedActions.tsx`

Replace all emoji `<Text>` icons with Phosphor at `size={28}`:

| Was | Icon | Notes |
|---|---|---|
| `🤍` | `Heart` weight="regular" color="rgba(255,255,255,0.9)" | inactive like |
| `❤️` | `Heart` weight="fill" color="#f472b6" | active like |
| `💬` | `ChatCircle` weight="duotone" | |
| `↗️` | `Export` weight="regular" | |
| `🔇` | `SpeakerSimpleX` weight="regular" | muted state |
| `🔊` | `SpeakerSimpleHigh` weight="duotone" | unmuted state |
| `📍` | `MapPin` weight="duotone" color="#34d399" size={14} | location pin in caption |

### `components/trip/ActivityItem.tsx`

- Remove `TYPE_EMOJI` const
- Replace `<View style={styles.iconPill}><Text>{emoji}</Text></View>` with `<TypeIconBubble Icon={icon} color={accentColor} bubbleSize={36} iconSize={20} />`
- Remove `styles.iconEmoji`
- Replace ✏️ edit button with `<PencilSimple size={14} color={colors.text.tertiary} weight="regular" />`

`TYPE_ACCENT` stays as-is (still drives the left border and dot). Import `ACTIVITY_ICONS` from `constants/icons.ts` and derive `{ Icon }` alongside `accentColor`.

### `components/wallet/ReservationCard.tsx`

- Remove `TYPE_ICONS` const
- Import `RESERVATION_ICONS` from `constants/icons.ts`
- Replace `<View style={styles.iconContainer}><Text>{TYPE_ICONS[...]}</Text></View>` with `<TypeIconBubble Icon={icon} color={color} bubbleSize={44} iconSize={24} />`
- Remove `styles.icon` (emoji fontSize)
- `iconContainer` style can be removed entirely (TypeIconBubble is self-contained)

### `components/wallet/LoyaltyCard.tsx`

- Remove `PROGRAM_TYPE_ICONS` const
- Import `LOYALTY_ICONS` from `constants/icons.ts`
- Replace `<Text style={styles.typeIcon}>{...}</Text>` with `<Icon size={28} color={color} weight="duotone" />` (no bubble — the gradient card is already the container)
- Remove `styles.typeIcon`

### `components/paywall/PaywallFeatureList.tsx`

- Import `PAYWALL_FEATURE_ICONS` from `constants/icons.ts`
- Replace `FEATURES` array (which has emoji string icons) with `PAYWALL_FEATURE_ICONS`
- Replace `<Text style={styles.icon}>{feature.icon}</Text>` with `<feature.Icon size={24} color={feature.color} weight="duotone" />`
- Remove `styles.icon`

### `app/(tabs)/create.tsx`

- Change `CreateOption` interface: replace `icon: string` with `Icon: typeof PhosphorIcon` and `iconColor: string`
- Import `CREATE_OPTION_ICONS` from `constants/icons.ts`; spread `{ Icon, color: iconColor }` into each option object in the `options` array
- Replace `<Text style={styles.optionIcon}>{opt.icon}</Text>` with `<opt.Icon size={32} color={opt.iconColor} weight="duotone" />`
- Remove `styles.optionIcon` (emoji fontSize)

## TypeIconBubble Usage Summary

| Component | bubbleSize | iconSize |
|---|---|---|
| `ActivityItem` | 36 | 20 |
| `ReservationCard` | 44 | 24 |
| `LoyaltyCard` | inline, no bubble | 28 |

## Verification

1. `npx expo start --ios` — confirm tab bar shows Phosphor icons at all 4 icon tabs
2. Navigate to feed — confirm like/comment/share/mute/location icons render correctly; like toggles between regular and fill on tap
3. Open a trip — confirm activity items show colored Phosphor icon bubbles with correct per-type colors
4. Open wallet — confirm reservation list and loyalty card icons render
5. Open paywall — confirm feature list icons render
6. Open create screen — confirm 4 option cards show correct icons
7. Toggle dark/light theme — confirm icons inherit theme colors correctly via `useTheme()`
8. Run `npm run lint` — confirm no TypeScript errors
