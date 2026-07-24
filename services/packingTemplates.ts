/**
 * services/packingTemplates.ts
 *
 * Rule-based packing list generation — deliberately NOT an AI call (unlike
 * AI trip generation): instant, free, no quota, no loading state. Reads
 * signals already on the Trip doc (tags, destination name, description,
 * startDate) rather than asking the user anything new.
 *
 * KNOWN LIMITATION: category selection is a keyword/month heuristic, not
 * real weather or hemisphere-awareness — a "ski" trip in July still gets
 * Mountain & hiking gear, and the winter/summer season fallback assumes the
 * Northern hemisphere. Good enough for v1; swapping in a weather API later
 * only touches this file, not any caller.
 */

import type { Trip } from '@/types';

export interface PackingTemplateItem {
  label: string;
  category: string;
}

const ESSENTIALS: PackingTemplateItem[] = [
  { label: 'Passport / ID', category: 'Essentials' },
  { label: 'Wallet', category: 'Essentials' },
  { label: 'Phone charger', category: 'Essentials' },
  { label: 'Medications', category: 'Essentials' },
];

const DOCUMENTS: PackingTemplateItem[] = [
  { label: 'Boarding pass', category: 'Documents' },
  { label: 'Hotel confirmation', category: 'Documents' },
  { label: 'Travel insurance info', category: 'Documents' },
];

const TOILETRIES: PackingTemplateItem[] = [
  { label: 'Toothbrush & toothpaste', category: 'Toiletries' },
  { label: 'Deodorant', category: 'Toiletries' },
  { label: 'Shampoo & soap', category: 'Toiletries' },
];

const ELECTRONICS: PackingTemplateItem[] = [
  { label: 'Phone charger', category: 'Electronics' },
  { label: 'Headphones', category: 'Electronics' },
  { label: 'Power adapter', category: 'Electronics' },
];

const BEACH_GEAR: PackingTemplateItem[] = [
  { label: 'Swimsuit', category: 'Beach gear' },
  { label: 'Sunscreen', category: 'Beach gear' },
  { label: 'Flip-flops', category: 'Beach gear' },
  { label: 'Beach towel', category: 'Beach gear' },
  { label: 'Sunglasses', category: 'Beach gear' },
];

const MOUNTAIN_GEAR: PackingTemplateItem[] = [
  { label: 'Hiking boots', category: 'Mountain & hiking gear' },
  { label: 'Layered clothing', category: 'Mountain & hiking gear' },
  { label: 'Backpack', category: 'Mountain & hiking gear' },
  { label: 'Water bottle', category: 'Mountain & hiking gear' },
  { label: 'First-aid kit', category: 'Mountain & hiking gear' },
];

const SPORTS_EQUIPMENT: PackingTemplateItem[] = [
  { label: 'Athletic shoes', category: 'Sports equipment' },
  { label: 'Workout clothes', category: 'Sports equipment' },
];

const WINTER_CLOTHING: PackingTemplateItem[] = [
  { label: 'Winter coat', category: 'Winter clothing' },
  { label: 'Gloves', category: 'Winter clothing' },
  { label: 'Scarf', category: 'Winter clothing' },
  { label: 'Thermal layers', category: 'Winter clothing' },
];

const SUMMER_CLOTHING: PackingTemplateItem[] = [
  { label: 'Shorts', category: 'Summer clothing' },
  { label: 'T-shirts', category: 'Summer clothing' },
  { label: 'Sun hat', category: 'Summer clothing' },
];

const GENERIC_CLOTHING: PackingTemplateItem[] = [
  { label: 'Layered clothing', category: 'Clothing' },
  { label: 'Comfortable shoes', category: 'Clothing' },
  { label: 'Light jacket', category: 'Clothing' },
];

const BEACH_KEYWORDS = ['beach', 'surf', 'coast', 'coastal', 'island', 'shore'];
const MOUNTAIN_KEYWORDS = ['mountain', 'hike', 'hiking', 'trail', 'ski', 'skiing', 'snow', 'alpine'];
const SPORTS_KEYWORDS = ['surf', 'ski', 'hike', 'bike', 'biking', 'dive', 'diving', 'snorkel', 'golf', 'tennis', 'run', 'running'];

function haystackFor(trip: Trip): string {
  return [...trip.tags, trip.destination.name, trip.description].join(' ').toLowerCase();
}

function matchesAny(haystack: string, keywords: string[]): boolean {
  return keywords.some((kw) => haystack.includes(kw));
}

/** Dec–Feb → winter, Jun–Aug → summer, shoulder months → null (generic). */
function seasonFromStartDate(trip: Trip): 'winter' | 'summer' | null {
  if (!trip.startDate) return null;
  const month = trip.startDate.toDate().getMonth(); // 0-indexed
  if (month === 11 || month === 0 || month === 1) return 'winter';
  if (month >= 5 && month <= 7) return 'summer';
  return null;
}

export function generatePackingList(trip: Trip): PackingTemplateItem[] {
  const haystack = haystackFor(trip);
  const items: PackingTemplateItem[] = [...ESSENTIALS, ...DOCUMENTS, ...TOILETRIES, ...ELECTRONICS];

  const isBeach = matchesAny(haystack, BEACH_KEYWORDS);
  const isMountain = matchesAny(haystack, MOUNTAIN_KEYWORDS);
  const isSports = matchesAny(haystack, SPORTS_KEYWORDS);

  if (isBeach) items.push(...BEACH_GEAR);
  if (isMountain) items.push(...MOUNTAIN_GEAR);
  if (isSports) items.push(...SPORTS_EQUIPMENT);

  if (!isBeach && !isMountain) {
    const season = seasonFromStartDate(trip);
    if (season === 'winter') items.push(...WINTER_CLOTHING);
    else if (season === 'summer') items.push(...SUMMER_CLOTHING);
    else items.push(...GENERIC_CLOTHING);
  }

  return items;
}
