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
  UsersThree,
  Bell,
  Bag,
  Star,
  CreditCard,
  Globe,
  Users,
  LockSimple,
} from 'phosphor-react-native';
import type { Icon } from 'phosphor-react-native';
import type { ActivityType, ReservationType, LoyaltyProgram, TripVisibility } from '@/types';

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
  { Icon: Star,        color: '#a78bfa', label: 'Priority Support',    description: 'Fast-track responses from the Supernova team'       },
];

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
