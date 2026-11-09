/**
 * A trip as an Instagram Story image (owner, 2026-11-08): the cities and length as the eyebrow, the title, and up to 4
 * highlight stops in day order (never hotels, flights, transport or free time). No dates. Pure.
 */
type StoryTrip = {
  title: string; destination: { name: string }; additionalDestinations?: { name: string }[];
  days: { dayNumber: number; activities: { title: string; type: string; order: number }[] }[];
};

const SKIP = new Set(['hotel', 'flight', 'transport', 'free']);

export function storyContent(t: StoryTrip): { eyebrow: string; title: string; stops: string[] } {
  const cities = [t.destination, ...(t.additionalDestinations ?? [])].map((c) => c.name).filter(Boolean);
  const n = t.days.length;
  const stops = [...t.days].sort((a, b) => a.dayNumber - b.dayNumber)
    .flatMap((d) => [...d.activities].sort((a, b) => a.order - b.order))
    .filter((a) => !SKIP.has(a.type) && a.title.trim())
    .map((a) => a.title.trim())
    .slice(0, 4);
  const eyebrow = [...cities.slice(0, 3), n ? `${n} ${n === 1 ? 'DAY' : 'DAYS'}` : null].filter(Boolean).join(' · ').toUpperCase();
  return { eyebrow, title: t.title, stops };
}
