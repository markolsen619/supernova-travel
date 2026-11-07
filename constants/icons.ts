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
  UsersThree,
  MapTrifold,
  Bell,
  Bag,
  Star,
  CreditCard,
  Globe,
  Users,
  LockSimple,
  DotsThree,
  Confetti,
  Train,
  Martini,
  Coffee,
  Binoculars,
  ShoppingBag,
  MapPin,
} from 'phosphor-react-native';
import type { Icon } from 'phosphor-react-native';
import type { ActivityType, ReservationType, LoyaltyProgram, TripVisibility, ExpenseCategory } from '@/types';

export type PhosphorIcon = Icon;

type IconEntry = { Icon: PhosphorIcon; color: string };

export const ACTIVITY_ICONS: Record<ActivityType, IconEntry> = {
  flight:     { Icon: AirplaneTilt, color: '#60a5fa' },
  hotel:      { Icon: Buildings,    color: '#a78bfa' },
  restaurant: { Icon: ForkKnife,    color: '#f472b6' },
  activity:   { Icon: Ticket,       color: '#34d399' },
  transport:  { Icon: Car,          color: '#fbbf24' },
  free:       { Icon: Clock,        color: '#6b7280' },
};

/**
 * A stop's icon, never undefined: a type no app knows (the AI once wrote "relax") crashed every screen that looked
 * it up directly (2026-10-31). Use this instead of indexing ACTIVITY_ICONS.
 */
export function activityIcon(type: string | null | undefined): IconEntry {
  return (type && (ACTIVITY_ICONS as Record<string, IconEntry>)[type]) || ACTIVITY_ICONS.activity;
}

export const RESERVATION_ICONS: Record<ReservationType, IconEntry> = {
  hotel:      { Icon: Buildings, color: '#a78bfa' },
  airbnb:     { Icon: House,     color: '#f472b6' },
  rental_car: { Icon: Car,       color: '#fbbf24' },
  restaurant: { Icon: ForkKnife, color: '#f472b6' },
  activity:   { Icon: Ticket,    color: '#34d399' },
  show:       { Icon: Confetti,  color: '#f472b6' },
  // Train / bus / ferry — amber, like transport stops in the itinerary.
  transit:    { Icon: Train,     color: '#fbbf24' },
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
  // Only what Pro actually unlocks — the same rules as utils/proFeatures and
  // the server gates. A paywall selling features that don't exist is an App
  // Store rejection (guideline 2.3.1).
  { Icon: Sparkle,     color: '#a78bfa', label: 'Unlimited AI trips', description: 'Plan as many itineraries as you like, not one a month' },
  { Icon: MapTrifold,  color: '#60a5fa', label: 'Multi-city trips',   description: 'Let AI route a trip through several cities and countries' },
  { Icon: UsersThree,  color: '#f472b6', label: 'Split a trip budget', description: 'Track a shared budget and split costs with your group' },
  { Icon: Bag,         color: '#34d399', label: 'Unlimited wallet',   description: 'Every pass, booking and loyalty card, plus AI import from confirmations' },
  { Icon: Bell,        color: '#fbbf24', label: 'Flight alerts',      description: 'Gate, delay, landing and cancellation alerts' },
];

export const EXPENSE_ICONS: Record<ExpenseCategory, IconEntry> = {
  food:       { Icon: ForkKnife,  color: '#f472b6' },
  lodging:    { Icon: Buildings,  color: '#a78bfa' },
  transport:  { Icon: Car,        color: '#fbbf24' },
  activities: { Icon: Ticket,     color: '#34d399' },
  shopping:   { Icon: Bag,        color: '#60a5fa' },
  other:      { Icon: DotsThree,  color: '#9ca3af' },
};

export const VISIBILITY_ICONS: Record<TripVisibility, IconEntry> = {
  public:    { Icon: Globe,      color: '#34d399' },
  followers: { Icon: Users,      color: '#60a5fa' },
  private:   { Icon: LockSimple, color: '#f472b6' },
};

// create tab has no icon (gradient circle + text "+")
export const TAB_ICONS: Record<string, PhosphorIcon> = {
  index:   House,
  explore: Compass,
  search:  MagnifyingGlass,
  profile: User,
};

/** Social wish list place types (utils/wishlist.ts `WishKind`) — the activity colours where a type maps to one. */
export const WISH_KIND_ICONS: Record<'restaurant' | 'bar' | 'cafe' | 'sight' | 'hotel' | 'activity' | 'shop' | 'other', IconEntry> = {
  restaurant: { Icon: ForkKnife,   color: '#f472b6' },
  bar:        { Icon: Martini,     color: '#f472b6' },
  cafe:       { Icon: Coffee,      color: '#f472b6' },
  sight:      { Icon: Binoculars,  color: '#34d399' },
  hotel:      { Icon: Buildings,   color: '#a78bfa' },
  activity:   { Icon: Ticket,      color: '#34d399' },
  shop:       { Icon: ShoppingBag, color: '#fbbf24' },
  other:      { Icon: MapPin,      color: '#9A8F82' },
};

/** A wish-list kind's icon, falling back for a kind this app doesn't know (Architecture Rule 11). */
export const wishKindIcon = (kind: string): IconEntry => WISH_KIND_ICONS[kind as keyof typeof WISH_KIND_ICONS] ?? WISH_KIND_ICONS.other;
