/**
 * Nova's words for a past trip built from photos (spec 2026-10-25-past-trips-from-photos): title, a caption a day,
 * a two-sentence description. It sees city and stop names and times only — never photos or coordinates.
 */
import { isValidRequestId } from './generationRequest';
import { agentGate, AGENT_INFLIGHT_MS } from './quotaUtils';

export interface StoryRequest { requestId: string; cities: string[]; days: { day: string; city: number; stops: { name: string; time: string }[] }[] }
export interface Story { title: string; description: string; dayCaptions: string[] }

const str = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

export function validateStoryRequest(v: unknown): StoryRequest | null {
  const r = v as StoryRequest;
  if (!r || typeof r !== 'object' || !isValidRequestId(r.requestId)) return null;
  if (!Array.isArray(r.cities) || r.cities.length < 1 || r.cities.length > 20 || !r.cities.every((c) => str(c, 80))) return null;
  if (!Array.isArray(r.days) || r.days.length < 1 || r.days.length > 60) return null;
  let stops = 0;
  for (const d of r.days) {
    if (!d || Object.keys(d).some((k) => !['day', 'city', 'stops'].includes(k))) return null;
    if (typeof d.day !== 'string' || !DAY.test(d.day) || !Number.isInteger(d.city) || d.city < 0 || d.city >= r.cities.length) return null;
    if (!Array.isArray(d.stops)) return null;
    for (const s of d.stops) {
      if (!s || Object.keys(s).some((k) => k !== 'name' && k !== 'time')) return null;
      if (!str(s.name, 80) || typeof s.time !== 'string' || !TIME.test(s.time)) return null;
    }
    stops += d.stops.length;
  }
  return stops <= 200 ? { requestId: r.requestId, cities: r.cities, days: r.days } : null;
}

export const STORY_SYSTEM = 'You write short, warm titles and captions for a trip someone has already taken, like a friend '
  + 'labelling a photo album. Sentence case, no emoji, no exclamation marks, no hashtags. Use only the places given; never invent '
  + 'events. Title ≤ 60 characters (e.g. "Five days of Lisbon"). One caption per day, ≤ 80 characters, empty for a day with no stops. '
  + 'Description: two sentences.';

export function storyPrompt(r: StoryRequest): string {
  const lines = r.days.map((d, i) => `Day ${i + 1} (${d.day}, ${r.cities[d.city]}): ${d.stops.map((s) => `${s.time} ${s.name}`).join('; ') || 'no stops'}`);
  return `Cities: ${r.cities.join(', ')}\n${lines.join('\n')}`;
}

export const STORY_SCHEMA = {
  type: 'object',
  properties: { title: { type: 'string' }, description: { type: 'string' }, dayCaptions: { type: 'array', items: { type: 'string' } } },
  required: ['title', 'description', 'dayCaptions'],
};

const clip = (s: string, max: number) => s.trim().slice(0, max);

export function parseStory(text: unknown, dayCount: number): Story | null {
  if (typeof text !== 'string') return null;
  try {
    const v = JSON.parse(text) as Partial<Story>;
    if (typeof v.title !== 'string' || !v.title.trim() || typeof v.description !== 'string' || !Array.isArray(v.dayCaptions)) return null;
    const caps = Array.from({ length: dayCount }, (_, i) => (typeof v.dayCaptions![i] === 'string' ? clip(v.dayCaptions![i] as string, 80) : ''));
    return { title: clip(v.title, 60), description: clip(v.description, 300), dayCaptions: caps };
  } catch {
    return null;
  }
}

export function fallbackStory(r: StoryRequest): Story {
  return { title: `Trip to ${r.cities[0]}`, description: '', dayCaptions: r.days.map(() => '') };
}

/**
 * The Nova allowance, claimed before Gemini is called (final review I2): the hour count and the shared in-flight
 * lock, as `agent` does, so concurrent calls can't all pass a plain read. The month is charged only on success.
 */
export function storyClaim(
  q: Record<string, unknown>,
  policy: { quotaKey: string; limit: number },
  hourKey: string,
  now: number,
): { ok: true; patch: Record<string, number> } | { ok: false; gate: 'monthly' | 'hourly' | 'busy' } {
  const num = (v: unknown) => (typeof v === 'number' ? v : 0);
  const gate = agentGate({
    used: num(q[policy.quotaKey]), limit: policy.limit, hourCount: num(q[hourKey]),
    inflightUntil: typeof q.agentInflightUntil === 'number' ? q.agentInflightUntil : null, now,
  });
  if (gate !== 'ok') return { ok: false, gate };
  return { ok: true, patch: { [hourKey]: num(q[hourKey]) + 1, agentInflightUntil: now + AGENT_INFLIGHT_MS } };
}
