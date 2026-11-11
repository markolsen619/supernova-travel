/** The screenshots handed to the save sheet (spec 2026-11-11; too long for URL params). Taken once. */
let draft: string[] = [];
export const setShotDraft = (uris: string[]) => { draft = uris.slice(0, 5); };
export const takeShotDraft = () => { const d = draft; draft = []; return d; };
