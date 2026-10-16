/**
 * The only provider-aware file in the agent (spec "Built to grow"): one call to
 * Gemini's REST API with a JSON schema and thinking off — thinking tokens bill
 * as output and add latency, and trip edits don't need them. Switch the model
 * here, by evidence from scripts/agent-eval.mjs. No firebase-admin.
 */
export const AGENT_MODEL = 'gemini-2.5-flash';
export const AGENT_THINKING_BUDGET = 0;

export interface ModelTurn { role: 'user' | 'model'; text: string }
export interface ModelResult { json: { reply: string; operations: unknown[] }; inputTokens: number; outputTokens: number; latencyMs: number }

export function geminiRequestBody(a: { system: string; turns: ModelTurn[]; schema: object; thinkingBudget: number }): object {
  return {
    systemInstruction: { parts: [{ text: a.system }] },
    contents: a.turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: a.schema,
      temperature: 0.3,
      maxOutputTokens: 1500,
      thinkingConfig: { thinkingBudget: a.thinkingBudget },
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

export async function generate(a: {
  system: string; turns: ModelTurn[]; schema: object; apiKey: string;
  model?: string; thinkingBudget?: number; timeoutMs?: number;
}): Promise<ModelResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), a.timeoutMs ?? 30_000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${a.model ?? AGENT_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': a.apiKey },
        body: JSON.stringify(geminiRequestBody({ system: a.system, turns: a.turns, schema: a.schema, thinkingBudget: a.thinkingBudget ?? AGENT_THINKING_BUDGET })),
        signal: controller.signal,
      },
    );
    if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const json = parseModelText(body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join(''));
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
