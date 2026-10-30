/** Home's greeting (owner, 2026-10-29): varied per day, sometimes in the trip's local language. Sentence case, no "!". */
export type Band = 'morning' | 'afternoon' | 'evening' | 'night';

export function band(hour: number): Band {
  if (hour >= 5 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 16) return 'afternoon';
  if (hour >= 17 && hour <= 21) return 'evening';
  return 'night';
}

// "{n}" is the first name; a phrasing ending in "?" keeps it (no "!").
const EN: Record<Band, string[]> = {
  morning: ['Morning, {n}', 'Good morning, {n}', 'Rise and shine, {n}', 'Fresh start, {n}'],
  afternoon: ['Afternoon, {n}', 'Good afternoon, {n}', "Hope the day's going well, {n}"],
  evening: ['Evening, {n}', 'Good evening, {n}', 'Winding down, {n}?'],
  night: ['Night owl, {n}?', 'Still up, {n}?', 'Evening, {n}'],
};
const EN_NO_NAME: Record<Band, string> = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Good evening' };

// Local greetings by the trip city's country: [morning, afternoon, evening/night].
const LOCAL: Record<string, [string, string, string]> = {
  PT: ['Bom dia', 'Boa tarde', 'Boa noite'], BR: ['Bom dia', 'Boa tarde', 'Boa noite'],
  ES: ['Buenos días', 'Buenas tardes', 'Buenas noches'], MX: ['Buenos días', 'Buenas tardes', 'Buenas noches'],
  FR: ['Bonjour', 'Bonjour', 'Bonsoir'], BE: ['Bonjour', 'Bonjour', 'Bonsoir'],
  IT: ['Buongiorno', 'Buon pomeriggio', 'Buonasera'], DE: ['Guten Morgen', 'Guten Tag', 'Guten Abend'],
  AT: ['Guten Morgen', 'Guten Tag', 'Guten Abend'], NL: ['Goedemorgen', 'Goedemiddag', 'Goedenavond'],
  IE: ['Dia duit', 'Dia duit', 'Dia duit'], CZ: ['Dobré ráno', 'Dobrý den', 'Dobrý večer'],
  HU: ['Jó reggelt', 'Jó napot', 'Jó estét'], JP: ['Ohayō', "Kon'nichiwa", 'Konbanwa'],
  GR: ['Kaliméra', 'Kaliméra', 'Kalispéra'], TR: ['Günaydın', 'İyi günler', 'İyi akşamlar'],
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function firstName(displayName: string | null | undefined): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? first : null;
}

export function greeting(o: { name: string | null; now: Date; countryCode?: string | null }): string {
  const b = band(o.now.getHours());
  const day = `${o.now.getFullYear()}-${o.now.getMonth() + 1}-${o.now.getDate()}`;
  const local = o.countryCode ? LOCAL[o.countryCode.toUpperCase()] : undefined;
  if (local && hash(`local:${day}`) % 3 === 0) {
    const word = local[b === 'morning' ? 0 : b === 'afternoon' ? 1 : 2];
    return o.name ? `${word}, ${o.name}` : word;
  }
  if (!o.name) return EN_NO_NAME[b];
  const options = EN[b];
  return options[hash(`${day}:${b}`) % options.length].replace('{n}', o.name);
}

const EDGES = [0, 5, 12, 17, 22, 24];

/** Milliseconds until the greeting band or the date next changes (05, 12, 17, 22, midnight), so Home can refresh. */
export function msUntilNextChange(now: Date): number {
  const next = EDGES.find((h) => h > now.getHours()) ?? 24;
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), next, 0, 0, 0);
  return at.getTime() - now.getTime();
}
