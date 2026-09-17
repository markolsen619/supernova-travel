/**
 * The "method for filtering objectionable material" App Store guideline 1.2
 * asks user-generated-content apps to have. It is the first of three layers,
 * alongside reporting and blocking (utils/moderation.ts), and it runs before
 * anything is posted: captions, comments, messages, trip titles, and profile
 * fields.
 *
 * Scope is deliberately narrow: slurs, sexual terms, and self-harm incitement,
 * not everyday profanity. Travel posts swear, and a filter that blocks "this
 * view is f***ing unreal" teaches people to route around it. What it misses,
 * reporting catches.
 *
 * Matching is by whole word after normalizing case, accents, common
 * substitutions (4 → a, $ → s), stretched letters, and spaced-out spellings,
 * so "Scunthorpe" and "classic" don't trip it but "n i g g e r" does.
 */

/**
 * Terms matched as whole words, plus a trailing s / es / z. Kept out: words
 * that ordinary travel posts use ("porn" as in #foodporn, "squaw" in older
 * place names, "spick" in "spick and span"). Reporting covers what's left.
 */
const BLOCKED_WORDS: readonly string[] = [
  // Racial and ethnic slurs
  'nigger', 'nigga', 'niglet', 'chink', 'gook', 'spic', 'wetback', 'beaner',
  'kike', 'raghead', 'towelhead', 'sandnigger', 'coon', 'jigaboo', 'paki', 'wog',
  'gypo', 'pikey', 'zipperhead', 'redskin',
  // Slurs about sexuality, gender, and disability
  'faggot', 'fag', 'dyke', 'tranny', 'shemale', 'retard', 'retarded',
  // Sexual terms
  'cunt', 'whore', 'slut', 'blowjob', 'handjob', 'pornhub', 'xvideos', 'onlyfans',
  'milf', 'dildo', 'bukkake', 'gangbang', 'creampie', 'hentai',
  // Self-harm incitement
  'kys',
];

/** Multi-word phrases, matched on the normalized, space-joined text. */
const BLOCKED_PHRASES: readonly string[] = [
  'kill yourself',
  'hang yourself',
  'send nudes',
];

const SUBSTITUTIONS: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b',
  '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't',
};

/**
 * Each term as a pattern whose letters may repeat but never drop below their
 * real count: "nigger" accepts "niiiggger" but not "Niger", and "coon"
 * doesn't match "con". Squeezing both sides to single letters would.
 */
function stretchable(term: string): string {
  return term.replace(/([a-z])/g, '$1+').replace(/ /g, ' +');
}

const WORD_PATTERNS: readonly RegExp[] = BLOCKED_WORDS.map(
  (word) => new RegExp(`^${stretchable(word)}(?:e?s|z)?$`),
);

const PHRASE_PATTERNS: readonly RegExp[] = BLOCKED_PHRASES.map(
  (phrase) => new RegExp(`(?:^| )${stretchable(phrase)}(?: |$)`),
);

function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[0-9@$!|+]/g, (c) => SUBSTITUTIONS[c] ?? c)
    .replace(/[^a-z\s]/g, ' ');
}

function isBlockedWord(word: string): boolean {
  return WORD_PATTERNS.some((pattern) => pattern.test(word));
}

/**
 * Spelled-out words: every stretch of 3+ consecutive single-letter tokens, so
 * "what a c u n t" yields "cunt" even though "a" is a real word beside it.
 * Ordinary sentences rarely have more than two single letters in a row.
 */
function spelledOutWords(words: string[]): string[] {
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    for (let start = 0; start < run.length; start++) {
      for (let end = start + 3; end <= run.length; end++) {
        out.push(run.slice(start, end).join(''));
      }
    }
    run = [];
  };
  for (const w of words) {
    if (w.length === 1) run.push(w);
    else flush();
  }
  flush();
  return out;
}

/**
 * Whether text contains objectionable language. Returns true/false only:
 * callers show a generic message rather than echoing the matched term back.
 */
export function containsObjectionableText(text: string | null | undefined): boolean {
  if (!text) return false;
  const words = normalize(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;

  if (words.some(isBlockedWord) || spelledOutWords(words).some(isBlockedWord)) return true;

  const joined = words.join(' ');
  return PHRASE_PATTERNS.some((pattern) => pattern.test(joined));
}

/** Shown wherever a submission is refused. Says what to do, not what matched. */
export const OBJECTIONABLE_TEXT_MESSAGE =
  "This includes language that isn't allowed on Supernova. Edit it and try again.";

/**
 * Checks several fields at once, e.g. a profile's name, bio, and location.
 * Returns the first offending field's key, or null.
 */
export function firstObjectionableField<K extends string>(
  fields: Record<K, string | null | undefined>,
): K | null {
  for (const key of Object.keys(fields) as K[]) {
    if (containsObjectionableText(fields[key])) return key;
  }
  return null;
}
