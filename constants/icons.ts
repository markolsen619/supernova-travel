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
  { Icon: UsersThree,  color: '#f472b6', label: 'Travel together',    description: 'Invite friends to plan, split a budget and share a packing list' },
  { Icon: Bag,         color: '#34d399', label: 'Unlimited wallet',   description: 'Every pass, booking and loyalty card, plus AI import from confirmations' },
  { Icon: Bell,        color: '#fbbf24', label: 'Flight alerts',      description: 'Boarding, landing and cancellation alerts' },
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
