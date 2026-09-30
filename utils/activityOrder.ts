interface Ordered {
  id: string;
  order: number;
}

/**
 * The trip as it should look straight after a drag-and-drop: the dropped
 * day's stops in their new order, renumbered 0, 1000, 2000… — the same values
 * reorderActivities() writes, so the cache and Firestore agree once the write
 * lands. Activities missing from `orderedIds` keep their place after the rest
 * rather than disappearing.
 */
export function applyActivityOrder<
  A extends Ordered,
  D extends { id: string; activities: A[] },
  T extends { days: D[] },
>(trip: T, dayId: string, orderedIds: string[]): T {
  return {
    ...trip,
    days: trip.days.map((day) => {
      if (day.id !== dayId) return day;
      const byId = new Map(day.activities.map((a) => [a.id, a]));
      const listed = orderedIds.map((id) => byId.get(id)).filter((a): a is A => !!a);
      const rest = day.activities
        .filter((a) => !orderedIds.includes(a.id))
        .sort((a, b) => a.order - b.order);
      return {
        ...day,
        activities: [...listed, ...rest].map((a, i) => ({ ...a, order: i * 1000 })),
      };
    }),
  };
}
