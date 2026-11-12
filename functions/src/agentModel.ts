/**
 * The only provider-aware file in the agent (spec "Built to grow"): one call to
 * Gemini's REST API with a JSON schema and as little thinking as the model allows —
 * thinking tokens bill as output and add latency, and trip edits don't need them.
 * Switch the model here, by evidence from scripts/agent-eval.mjs. No firebase-admin.
 *
 * GEMINI_MODEL is every Gemini call in the app (generateTrip, email import and
 * confirmation parsing use it through the SDK). 2026-11-12: gemini-2.5-flash shuts
 * down 2026-12-01; 3.5 Flash-Lite costs the same ($0.30 / $2.50 per M tokens). Gemini 3.5
 * can't switch thinking off: it refuses thinkingBudget (HTTP 400), and its lowest
 * thinkingLevel is 'minimal'.
 */
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
export const GEMINI_THINKING = { thinkingLevel: 'minimal' } as const;
export const AGENT_MODEL = GEMINI_MODEL;
/** 2.5 models switch thinking off with a budget of 0 and refuse a level; 3.x refuse a budget and go down to 'minimal'. */
export function thinkingFor(model: string): { thinkingBudget: number } | { thinkingLevel: string } {
  return /^gemini-2\./.test(model) ? { thinkingBudget: 0 } : GEMINI_THINKING;
}

export interface ModelTurn { role: 'user' | 'model'; text: string; images?: { mimeType: string; data: string }[] }
export interface ModelResult { json: { reply: string; operations: unknown[] }; inputTokens: number; outputTokens: number; latencyMs: number }

export function geminiRequestBody(a: { system: string; turns: ModelTurn[]; schema: object; model?: string }): object {
  return {
    systemInstruction: { parts: [{ text: a.system }] },
    // Screenshots (spec 2026-11-11) go as inline parts before the turn's text.
    contents: a.turns.map((t) => ({ role: t.role, parts: [...(t.images ?? []).map((im) => ({ inlineData: { mimeType: im.mimeType, data: im.data } })), { text: t.text }] })),
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: a.schema,
      temperature: 0.3,
      maxOutputTokens: 1500,
      thinkingConfig: thinkingFor(a.model ?? GEMINI_MODEL),
    },
  };
}

export function parseModelText(text: unknown): { reply: string; operations: unknown[] } | null {
  if (typeof text !== 'string') return null;
  try {
    const v = JSON.parse(text) as { reply?: unknown; operations?: unknown };
    if (typeof v.reply !== 'string' || !v.reply.trim()) return null;
    return { reply: v.reply.trim(), operations: Array.isArray(v.operations) ? v.operations : [] };
  } catch {
    return null;
  }
}

type GenerateArgs = {
  system: string; turns: ModelTurn[]; schema: object; apiKey: string;
  model?: string; timeoutMs?: number;
};

/** One call, retried once when the answer can't be read (~1 in 33 in the 2026-10-17 eval); HTTP errors aren't retried. */
export async function generate(a: GenerateArgs): Promise<ModelResult> {
  return generateJson({ ...a, parse: parseModelText });
}

type JsonResult<T> = { json: T; inputTokens: number; outputTokens: number; latencyMs: number };

/** Like `generate`, with the caller's own parser (pastTripStory's answer has no `reply`). Retried once when unreadable. */
export async function generateJson<T>(a: GenerateArgs & { parse: (text: unknown) => T | null }): Promise<JsonResult<T>> {
  try {
    return await generateOnce(a);
  } catch (e) {
    if (!String(e).includes('unreadable')) throw e;
    return generateOnce(a);
  }
}

async function generateOnce<T>(a: GenerateArgs & { parse: (text: unknown) => T | null }): Promise<JsonResult<T>> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), a.timeoutMs ?? 30_000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${a.model ?? AGENT_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': a.apiKey },
        body: JSON.stringify(geminiRequestBody({ system: a.system, turns: a.turns, schema: a.schema, model: a.model ?? AGENT_MODEL })),
        signal: controller.signal,
      },
    );
    if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const json = a.parse(body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join(''));
    if (!json) throw new Error('gemini: unreadable response');
    return {
      json,
      inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}
