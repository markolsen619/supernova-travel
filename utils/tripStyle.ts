/** The label trip cards show for how a trip was planned (owner, 2026-10-17). Pure. */
const LABELS: Record<string, string> = {
  adventure: 'Adventure', luxury: 'Luxury', budget: 'Budget', family: 'Family', cultural: 'Cultural',
  party: 'Nightlife', relax: 'Relaxed', foodie: 'Foodie', romantic: 'Romantic',
};

export function tripStyleLabel(trip: { travelStyles?: unknown }): string | null {
  if (!Array.isArray(trip.travelStyles)) return null;
  for (const s of trip.travelStyles) if (typeof s === 'string' && LABELS[s]) return LABELS[s];
  return null;
}
